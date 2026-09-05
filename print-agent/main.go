// Kuik print agent.
//
// Runs on one computer in the restaurant and puts the POS's documents on
// paper. Two paths in, one out:
//
//   - It polls Kuik for jobs queued to its printers (a long poll, so a kitchen
//     ticket lands about a second after the cashier fires it). This is how an
//     iPad or a phone prints to the kitchen.
//   - It also listens on 127.0.0.1:9123 so a browser on THIS machine can hand
//     it a document directly — no internet needed, which is the all-in-one
//     register with a receipt printer and drawer.
//
// Out: ESC/POS over TCP 9100 to network printers, or RAW through the OS
// spooler for USB ones. See README.md for installing it as a service.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
)

const version = "0.1.0"

type Config struct {
	Server   string    `json:"server"`
	Token    string    `json:"token"`
	Port     int       `json:"port"`
	AgentID  string    `json:"agentId,omitempty"`
	Name     string    `json:"name,omitempty"`
	Printers []Printer `json:"printers,omitempty"`
}

type Agent struct {
	cfg     Config
	cfgPath string
	client  *http.Client
	mu      sync.RWMutex
	online  bool
	lastErr string
}

func defaultConfigPath() string {
	if runtime.GOOS == "windows" {
		if d := os.Getenv("APPDATA"); d != "" {
			return filepath.Join(d, "Kuik", "print-agent.json")
		}
	}
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	return filepath.Join(home, ".kuik", "print-agent.json")
}

func main() {
	var (
		token  = flag.String("token", os.Getenv("KUIK_PRINT_TOKEN"), "agent token from the Kuik dashboard (saved after the first run)")
		server = flag.String("server", "", "Kuik URL (default https://app.kuik.mx)")
		port   = flag.Int("port", 0, "local port for the POS on this machine (default 9123)")
		cfgArg = flag.String("config", "", "config file (default per OS)")
		test   = flag.String("test", "", "print a test page on the printer with this name and exit")
	)
	flag.Parse()

	cfgPath := *cfgArg
	if cfgPath == "" {
		cfgPath = defaultConfigPath()
	}
	cfg := loadConfig(cfgPath)
	if *token != "" {
		cfg.Token = strings.TrimSpace(*token)
	}
	if *server != "" {
		cfg.Server = strings.TrimRight(*server, "/")
	} else if env := os.Getenv("KUIK_SERVER"); env != "" && cfg.Server == "" {
		cfg.Server = strings.TrimRight(env, "/")
	}
	if cfg.Server == "" {
		cfg.Server = "https://app.kuik.mx"
	}
	if *port != 0 {
		cfg.Port = *port
	}
	if cfg.Port == 0 {
		cfg.Port = 9123
	}
	if cfg.Token == "" {
		log.Fatalf("no token. Create the agent in Kuik → Pedidos → Impresión, then run:\n  %s --token kpa_...\nThe token is saved to %s and not needed again.", filepath.Base(os.Args[0]), cfgPath)
	}
	if err := saveConfig(cfgPath, cfg); err != nil {
		log.Printf("warning: could not save config to %s: %v", cfgPath, err)
	}

	a := &Agent{cfg: cfg, cfgPath: cfgPath, client: &http.Client{Timeout: 40 * time.Second}}

	if *test != "" {
		if err := a.printTest(*test); err != nil {
			log.Fatalf("test print: %v", err)
		}
		log.Println("test page sent")
		return
	}

	log.Printf("kuik print agent v%s · %s/%s · server %s · config %s", version, runtime.GOOS, runtime.GOARCH, cfg.Server, cfgPath)

	ctx, cancel := context.WithCancel(context.Background())
	go a.pollLoop(ctx)

	srv := &http.Server{Addr: fmt.Sprintf("127.0.0.1:%d", cfg.Port), Handler: a.localHandler(), ReadHeaderTimeout: 5 * time.Second}
	go func() {
		log.Printf("local endpoint for the POS on this machine: http://127.0.0.1:%d", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("local listen: %v (is another agent already running?)", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	cancel()
	shutdownCtx, c2 := context.WithTimeout(context.Background(), 3*time.Second)
	defer c2()
	_ = srv.Shutdown(shutdownCtx)
}

// ── Config ──────────────────────────────────────────────────────────────────

func loadConfig(path string) Config {
	var cfg Config
	b, err := os.ReadFile(path)
	if err == nil {
		_ = json.Unmarshal(b, &cfg)
	}
	return cfg
}

func saveConfig(path string, cfg Config) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	b, _ := json.MarshalIndent(cfg, "", "  ")
	return os.WriteFile(path, b, 0o600)
}

// remember keeps the agent id and printer list on disk, so the local endpoint
// works after a reboot with the internet down.
func (a *Agent) remember(resp PollResponse) {
	a.mu.Lock()
	changed := a.cfg.AgentID != resp.Agent.ID || a.cfg.Name != resp.Agent.Name || !samePrinters(a.cfg.Printers, resp.Printers)
	a.cfg.AgentID = resp.Agent.ID
	a.cfg.Name = resp.Agent.Name
	a.cfg.Printers = resp.Printers
	cfg, path := a.cfg, a.cfgPath
	a.mu.Unlock()
	if changed {
		if err := saveConfig(path, cfg); err != nil {
			log.Printf("warning: could not save config: %v", err)
		}
	}
}

func samePrinters(x, y []Printer) bool {
	bx, _ := json.Marshal(x)
	by, _ := json.Marshal(y)
	return bytes.Equal(bx, by)
}

func (a *Agent) printer(id string) (Printer, bool) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	for _, p := range a.cfg.Printers {
		if p.ID == id {
			return p, true
		}
	}
	return Printer{}, false
}

// ── Queue ───────────────────────────────────────────────────────────────────

func (a *Agent) pollLoop(ctx context.Context) {
	backoff := 2 * time.Second
	for {
		if ctx.Err() != nil {
			return
		}
		resp, err := a.poll(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			a.setOnline(false, err.Error())
			log.Printf("poll: %v (retry in %s)", err, backoff)
			select {
			case <-time.After(backoff):
			case <-ctx.Done():
				return
			}
			if backoff < 30*time.Second {
				backoff *= 2
			}
			continue
		}
		backoff = 2 * time.Second
		a.setOnline(true, "")
		a.remember(*resp)
		for _, job := range resp.Jobs {
			a.run(ctx, job)
		}
	}
}

func (a *Agent) poll(ctx context.Context) (*PollResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.cfg.Server+"/api/print/agent/poll?wait=1", nil)
	if err != nil {
		return nil, err
	}
	a.auth(req)
	res, err := a.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if res.StatusCode == http.StatusUnauthorized {
		return nil, fmt.Errorf("token rejected: delete this agent in Kuik and create a new one")
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("server %d: %s", res.StatusCode, strings.TrimSpace(string(body)))
	}
	var out PollResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("bad response: %w", err)
	}
	return &out, nil
}

func (a *Agent) auth(req *http.Request) {
	req.Header.Set("Authorization", "Bearer "+a.cfg.Token)
	req.Header.Set("X-Kuik-Agent-Platform", runtime.GOOS+"/"+runtime.GOARCH)
	req.Header.Set("X-Kuik-Agent-Version", version)
}

func (a *Agent) run(ctx context.Context, job Job) {
	p, ok := a.printer(job.PrinterID)
	var err error
	if !ok {
		err = fmt.Errorf("printer %s is not assigned to this agent", job.PrinterID)
	} else {
		err = a.print(p, job.Doc)
	}
	if err != nil {
		log.Printf("job %s (%s) on %q failed: %v", job.ID, job.Kind, p.Name, err)
	} else {
		log.Printf("job %s (%s) printed on %q", job.ID, job.Kind, p.Name)
	}
	a.report(ctx, job.ID, err)
}

func (a *Agent) report(ctx context.Context, id string, printErr error) {
	body := map[string]any{"status": "done"}
	if printErr != nil {
		body = map[string]any{"status": "failed", "error": printErr.Error()}
	}
	b, _ := json.Marshal(body)
	// Reporting is best effort; an unreported job goes stale and is retried.
	for attempt := 0; attempt < 3; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.cfg.Server+"/api/print/agent/jobs/"+id, bytes.NewReader(b))
		if err != nil {
			return
		}
		a.auth(req)
		req.Header.Set("Content-Type", "application/json")
		res, err := a.client.Do(req)
		if err == nil {
			res.Body.Close()
			if res.StatusCode < 500 {
				return
			}
		}
		select {
		case <-time.After(2 * time.Second):
		case <-ctx.Done():
			return
		}
	}
}

func (a *Agent) print(p Printer, doc Doc) error {
	if !p.Enabled {
		return fmt.Errorf("printer %q is disabled", p.Name)
	}
	return Send(p, Render(doc, p.Width, p.Cut))
}

func (a *Agent) printTest(name string) error {
	for _, p := range a.cfg.Printers {
		if strings.EqualFold(p.Name, name) {
			f := false
			return a.print(p, Doc{Lines: []Line{
				{T: "text", V: "Kuik", Align: "center", Bold: true, Size: 2},
				{T: "text", V: "prueba · áéíóú ñ", Align: "center"},
				{T: "hr"},
				{T: "row", L: p.Name, R: p.Address},
				{T: "feed", N: 2},
			}, Cut: &f})
		}
	}
	return fmt.Errorf("no printer named %q in the config (has the agent synced once?)", name)
}

func (a *Agent) setOnline(ok bool, msg string) {
	a.mu.Lock()
	a.online = ok
	a.lastErr = msg
	a.mu.Unlock()
}

// ── Local endpoint (the browser on this machine) ────────────────────────────

// Only pages served by Kuik (or a dev server) may call it. Chrome's Local
// Network Access preflights the request; the private-network header is the
// opt-in that lets an https page reach 127.0.0.1.
func allowedOrigin(origin string) bool {
	if origin == "" {
		return false
	}
	switch {
	case origin == "https://kuik.mx", strings.HasSuffix(origin, ".kuik.mx"):
		return true
	case strings.HasPrefix(origin, "http://localhost:"), strings.HasPrefix(origin, "http://127.0.0.1:"),
		strings.HasSuffix(origin, ".localhost:3000"), origin == "http://localhost", origin == "http://127.0.0.1":
		return true
	}
	if extra := os.Getenv("KUIK_ALLOWED_ORIGIN"); extra != "" && origin == extra {
		return true
	}
	return false
}

func (a *Agent) localHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/status", a.handleStatus)
	mux.HandleFunc("/print", a.handlePrint)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			if !allowedOrigin(origin) {
				http.Error(w, "origin not allowed", http.StatusForbidden)
				return
			}
			h := w.Header()
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			h.Set("Access-Control-Allow-Headers", "Content-Type")
			h.Set("Access-Control-Allow-Private-Network", "true")
			h.Set("Access-Control-Max-Age", "600")
			h.Set("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		mux.ServeHTTP(w, r)
	})
}

func (a *Agent) handleStatus(w http.ResponseWriter, _ *http.Request) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	names := make([]map[string]any, 0, len(a.cfg.Printers))
	for _, p := range a.cfg.Printers {
		names = append(names, map[string]any{"id": p.ID, "name": p.Name})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":       a.cfg.AgentID != "",
		"agent":    a.cfg.AgentID,
		"name":     a.cfg.Name,
		"version":  version,
		"online":   a.online,
		"error":    a.lastErr,
		"printers": names,
	})
}

func (a *Agent) handlePrint(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		PrinterID string `json:"printerId"`
		Kind      string `json:"kind"`
		Doc       Doc    `json:"doc"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	p, ok := a.printer(body.PrinterID)
	if !ok {
		http.Error(w, "unknown printer for this agent", http.StatusNotFound)
		return
	}
	if err := a.print(p, body.Doc); err != nil {
		log.Printf("local %s on %q failed: %v", body.Kind, p.Name, err)
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	log.Printf("local %s printed on %q", body.Kind, p.Name)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
