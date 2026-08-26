package main

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
)

// Session is one restaurant's linked device.
//
// whatsmeow holds a long-lived websocket per account, so these are genuinely
// stateful and long-running — which is the reason this service exists at all
// instead of the work living inside a Next.js route handler.
type Session struct {
	TenantID string
	Client   *whatsmeow.Client

	mu       sync.RWMutex
	qr       string
	status   string // pairing | connected | disconnected | error
	lastErr  string
	qrIssued time.Time
	// Hard deadline for the whole pairing attempt. Without it an abandoned
	// browser tab leaves a live WhatsApp socket open forever.
	pairingDeadline time.Time
}

func (s *Session) snapshot() (status, qr, lastErr string) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.status, s.qr, s.lastErr
}

// qrAge reports how long the current code has been on offer, so the dashboard
// can show a countdown instead of a square that silently goes stale.
func (s *Session) qrAge() time.Duration {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.qrIssued.IsZero() {
		return 0
	}
	return time.Since(s.qrIssued)
}

func (s *Session) set(status, qr, lastErr string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.status = status
	s.qr = qr
	s.lastErr = lastErr
	if qr != "" {
		s.qrIssued = time.Now()
	}
}

// Manager owns every live session and the shared device store.
type Manager struct {
	container *sqlstore.Container
	registry  *Registry
	logger    waLog.Logger
	onMessage func(tenantID string, evt *events.Message)

	mu       sync.RWMutex
	sessions map[string]*Session
}

func NewManager(container *sqlstore.Container, registry *Registry, logger waLog.Logger, onMessage func(string, *events.Message)) *Manager {
	return &Manager{
		container: container,
		registry:  registry,
		logger:    logger,
		onMessage: onMessage,
		sessions:  map[string]*Session{},
	}
}

func (m *Manager) Get(tenantID string) (*Session, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s, ok := m.sessions[tenantID]
	return s, ok
}

// How long a single pairing attempt may stay open. WhatsApp rotates the code
// roughly every 20 seconds; this bounds the whole attempt so a forgotten tab
// cannot hold a connection open indefinitely.
const pairingWindow = 2 * time.Minute

// deviceForTenant finds this tenant's paired device, or makes a fresh one.
//
// The tenant→account mapping lives in our own kuik_sessions table (registry.go)
// rather than on whatsmeow's device record, because every field there belongs
// to WhatsApp and gets overwritten by the server.
func (m *Manager) deviceForTenant(ctx context.Context, tenantID string) (*store.Device, error) {
	if jid, ok := m.registry.JIDFor(ctx, tenantID); ok {
		device, err := m.container.GetDevice(ctx, jid)
		if err == nil && device != nil {
			return device, nil
		}
		// The mapping outlived the device — a manual store wipe, say. Drop the
		// stale row and pair again rather than failing forever.
		_ = m.registry.Unlink(ctx, tenantID)
	}
	return m.container.NewDevice(), nil
}

// Start brings a session up: reconnecting an already-paired device, or emitting
// QR codes until someone scans one.
func (m *Manager) Start(ctx context.Context, tenantID string) (*Session, error) {
	if s, ok := m.Get(tenantID); ok {
		status, _, _ := s.snapshot()
		if status == "connected" || status == "pairing" {
			return s, nil
		}
	}

	device, err := m.deviceForTenant(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("device store: %w", err)
	}

	client := whatsmeow.NewClient(device, m.logger.Sub(tenantID))
	session := &Session{
		TenantID:        tenantID,
		Client:          client,
		status:          "pairing",
		pairingDeadline: time.Now().Add(pairingWindow),
	}

	client.AddEventHandler(func(evt any) {
		switch v := evt.(type) {
		case *events.Message:
			// Never react to our own outgoing messages, or the bot ends up
			// answering itself in a loop.
			if v.Info.IsFromMe {
				return
			}
			if m.onMessage != nil {
				m.onMessage(tenantID, v)
			}
		case *events.Connected:
			session.set("connected", "", "")
			// Only now does a JID exist. Recording it here is what lets the
			// session come back after a restart.
			if client.Store.ID != nil {
				if err := m.registry.Link(context.Background(), tenantID, *client.Store.ID); err != nil {
					m.logger.Warnf("could not record session for %s: %v", tenantID, err)
				}
			}
		case *events.LoggedOut:
			// The phone unlinked us, or WhatsApp did. Either way the stored
			// credentials are worthless now, so forget the mapping too.
			session.set("disconnected", "", "logged_out")
			_ = m.registry.Unlink(context.Background(), tenantID)
		case *events.StreamReplaced:
			session.set("disconnected", "", "stream_replaced")
		case *events.Disconnected:
			if status, _, _ := session.snapshot(); status == "connected" {
				session.set("disconnected", "", "")
			}
		}
	})

	m.mu.Lock()
	m.sessions[tenantID] = session
	m.mu.Unlock()

	if client.Store.ID != nil {
		// Already paired — just reconnect.
		if err := client.Connect(); err != nil {
			session.set("error", "", err.Error())
			return session, err
		}
		return session, nil
	}

	// Not paired: whatsmeow streams QR codes, each valid for about 20 seconds.
	qrChan, err := client.GetQRChannel(context.Background())
	if err != nil {
		session.set("error", "", err.Error())
		return session, err
	}
	if err := client.Connect(); err != nil {
		session.set("error", "", err.Error())
		return session, err
	}

	go func() {
		for evt := range qrChan {
			switch evt.Event {
			case "code":
				// Stop offering codes once the attempt has run too long. The
				// channel keeps producing them, but nobody is watching, and
				// each one keeps the connection alive.
				if time.Now().After(session.pairingDeadline) {
					m.abandon(tenantID, "qr_expired")
					return
				}
				session.set("pairing", evt.Code, "")
			case "success":
				session.set("connected", "", "")
			case "timeout":
				m.abandon(tenantID, "qr_expired")
				return
			case "err-client-outdated":
				// whatsmeow has fallen behind WhatsApp's protocol. Nothing to
				// do at runtime; the library needs updating.
				session.set("error", "", "client_outdated")
				return
			}
		}
	}()

	// Backstop: the QR channel can stall without emitting anything, and an
	// unpaired client still holds a socket. Close it either way.
	go func() {
		time.Sleep(time.Until(session.pairingDeadline) + 5*time.Second)
		if s, ok := m.Get(tenantID); ok {
			if status, _, _ := s.snapshot(); status == "pairing" {
				m.abandon(tenantID, "qr_expired")
			}
		}
	}()

	return session, nil
}

// abandon tears down a pairing attempt nobody completed, releasing the socket.
//
// Deliberately NOT a full Stop: the device was never paired, so there are no
// stored credentials to delete, and calling Logout on an unpaired client
// errors.
func (m *Manager) abandon(tenantID, reason string) {
	s, ok := m.Get(tenantID)
	if !ok {
		return
	}
	if status, _, _ := s.snapshot(); status == "connected" {
		return // it got scanned in the meantime
	}
	s.Client.Disconnect()
	s.set("disconnected", "", reason)

	m.mu.Lock()
	delete(m.sessions, tenantID)
	m.mu.Unlock()
}

// Stop logs the device out and forgets it, so the next Start shows a fresh QR.
func (m *Manager) Stop(ctx context.Context, tenantID string) error {
	s, ok := m.Get(tenantID)
	if !ok {
		return nil
	}
	if s.Client.IsLoggedIn() {
		_ = s.Client.Logout(ctx)
	}
	s.Client.Disconnect()
	if s.Client.Store.ID != nil {
		_ = s.Client.Store.Delete(ctx)
	}
	_ = m.registry.Unlink(ctx, tenantID)
	s.set("disconnected", "", "")

	m.mu.Lock()
	delete(m.sessions, tenantID)
	m.mu.Unlock()
	return nil
}

// Send delivers a text message.
//
// Buttons are not attempted: a linked device cannot render WhatsApp's native
// interactive UI, so Kuik flattens options into a numbered list before calling
// this. Losing the buttons is the real cost of this transport.
func (m *Manager) Send(ctx context.Context, tenantID, to, text string) (string, error) {
	s, ok := m.Get(tenantID)
	if !ok {
		return "", fmt.Errorf("no session for tenant")
	}
	if !s.Client.IsConnected() || !s.Client.IsLoggedIn() {
		return "", fmt.Errorf("session not connected")
	}

	// `to` is a full JID whenever it came from an inbound message, and WhatsApp
	// is strict about which address space a chat lives in: replying to a LID
	// contact at @s.whatsapp.net fails with "no LID found". Only bare digits —
	// e.g. a phone typed into the dashboard — get the default server appended.
	target := strings.TrimPrefix(to, "+")
	if !strings.Contains(target, "@") {
		target += "@" + types.DefaultUserServer
	}
	jid, err := types.ParseJID(target)
	if err != nil {
		return "", fmt.Errorf("bad recipient: %w", err)
	}

	resp, err := s.Client.SendMessage(ctx, jid, textMessage(text))
	if err != nil {
		return "", err
	}
	return resp.ID, nil
}

// RestoreAll reconnects every previously paired device on boot, so a redeploy
// does not silently take every restaurant offline until someone happens to open
// the dashboard.
func (m *Manager) RestoreAll(ctx context.Context) int {
	restored := 0
	for tenantID := range m.registry.All(ctx) {
		if _, err := m.Start(ctx, tenantID); err == nil {
			restored++
		}
		// Stagger, so a hundred reconnects don't hit WhatsApp as one burst.
		time.Sleep(200 * time.Millisecond)
	}
	return restored
}
