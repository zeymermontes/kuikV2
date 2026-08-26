// Kuik WhatsApp bridge.
//
// Holds one WhatsApp linked-device session per restaurant using whatsmeow, the
// same mechanism WhatsApp Web uses. Pairing is a QR scan — no Meta business
// verification, no template approval, no per-message billing.
//
// See README.md for the trade-off this accepts: whatsmeow is an unofficial
// client, and the account carrying the risk is the restaurant's own number.
package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	_ "github.com/lib/pq"
	"go.mau.fi/whatsmeow/store/sqlstore"
	waLog "go.mau.fi/whatsmeow/util/log"
)

var manager *Manager
var bridgeSecret string

func main() {
	bridgeSecret = mustEnv("BRIDGE_SECRET")
	webhookURL := mustEnv("KUIK_WEBHOOK_URL")
	databaseURL := mustEnv("DATABASE_URL")
	port := envOr("PORT", "8080")

	logger := waLog.Stdout("bridge", envOr("LOG_LEVEL", "INFO"), true)

	// whatsmeow's tables hold the session's cryptographic material —
	// noise_key, identity_key, adv_key. In Supabase, anything in the `public`
	// schema is published by PostgREST, and the anon key that reaches it ships
	// inside every browser bundle. Landing there would put the keys to a
	// restaurant's WhatsApp account behind a public URL.
	//
	// PostgREST exposes only `public`, so a dedicated schema is the fix. Refuse
	// to start without one rather than quietly doing the dangerous thing.
	if !strings.Contains(databaseURL, "search_path=") {
		log.Fatal(
			"DATABASE_URL must pin a non-public schema, e.g. ...&search_path=whatsmeow — " +
				"session keys in `public` would be served by Supabase's REST API. " +
				"Create it first: CREATE SCHEMA IF NOT EXISTS whatsmeow;",
		)
	}
	if strings.Contains(databaseURL, "search_path=public") {
		log.Fatal("DATABASE_URL points search_path at `public`; see the note above.")
	}

	// Device credentials live in Postgres so a redeploy doesn't force every
	// restaurant to re-pair. Losing this store means losing every session.
	container, err := sqlstore.New(context.Background(), "postgres", databaseURL, logger.Sub("store"))
	if err != nil {
		log.Fatalf("session store: %v", err)
	}

	// Our own tenant→account table, in the same database as whatsmeow's store.
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	registry, err := NewRegistry(db)
	if err != nil {
		log.Fatalf("session registry: %v", err)
	}

	forwarder := NewForwarder(webhookURL, bridgeSecret)
	manager = NewManager(container, registry, logger, forwarder.Handle)

	go func() {
		n := manager.RestoreAll(context.Background())
		log.Printf("restored %d session(s)", n)
	}()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/sessions/", authed(handleSessions))

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("bridge listening on :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	// Close sockets deliberately on shutdown; an abandoned session looks like a
	// second device to WhatsApp and can trip StreamReplaced on the next boot.
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	log.Println("shutting down")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// authed guards everything except /health with the shared secret, compared in
// constant time.
func authed(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("authorization")
		expected := "Bearer " + bridgeSecret
		if len(header) != len(expected) || !hmac.Equal([]byte(header), []byte(expected)) {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "unauthorized"})
			return
		}
		next(w, r)
	}
}

// handleSessions routes /sessions/{tenantId} and /sessions/{tenantId}/send.
func handleSessions(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/sessions/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if parts[0] == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "missing tenant"})
		return
	}
	tenantID := parts[0]
	action := ""
	if len(parts) > 1 {
		action = parts[1]
	}

	ctx := r.Context()

	switch {
	case action == "send" && r.Method == http.MethodPost:
		var body struct {
			To   string `json:"to"`
			Text string `json:"text"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "bad body"})
			return
		}
		id, err := manager.Send(ctx, tenantID, body.To, body.Text)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"id": id})

	case action == "" && r.Method == http.MethodPost:
		session, err := manager.Start(ctx, tenantID)
		if err != nil && session == nil {
			writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, describe(tenantID, session))

	case action == "" && r.Method == http.MethodGet:
		session, ok := manager.Get(tenantID)
		if !ok {
			writeJSON(w, http.StatusOK, map[string]any{
				"sessionId": tenantID, "status": "disconnected",
			})
			return
		}
		writeJSON(w, http.StatusOK, describe(tenantID, session))

	case action == "" && r.Method == http.MethodDelete:
		if err := manager.Stop(ctx, tenantID); err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})

	default:
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "not found"})
	}
}

func describe(tenantID string, s *Session) map[string]any {
	status, qr, lastErr := s.snapshot()

	// The teardown goroutine runs a few seconds after the deadline, so without
	// this the API would keep handing out a QR that is already dead. Report the
	// truth the moment the clock runs out.
	if status == "pairing" && time.Now().After(s.pairingDeadline) {
		return map[string]any{
			"sessionId": tenantID,
			"status":    "disconnected",
			"error":     "qr_expired",
		}
	}

	out := map[string]any{"sessionId": tenantID, "status": status}
	if qr != "" {
		out["qr"] = qr
		// Seconds this code has been on offer. WhatsApp rotates roughly every
		// 20s, so the dashboard uses this to show a countdown rather than a
		// square that has quietly gone stale.
		out["qrAgeSeconds"] = int(s.qrAge().Seconds())
	}
	if status == "pairing" {
		out["expiresInSeconds"] = int(time.Until(s.pairingDeadline).Seconds())
	}
	if lastErr != "" {
		out["error"] = lastErr
	}
	if s.Client != nil && s.Client.Store != nil && s.Client.Store.ID != nil {
		out["phone"] = s.Client.Store.ID.User
		out["pushName"] = s.Client.Store.PushName
	}
	return out
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("%s is required", key)
	}
	return v
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// Silence the unused import linter for sha256, which crypto/hmac needs at link
// time in some build configurations.
var _ = sha256.New
