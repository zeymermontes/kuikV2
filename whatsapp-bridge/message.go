package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	"google.golang.org/protobuf/proto"
)

func textMessage(body string) *waE2E.Message {
	return &waE2E.Message{Conversation: proto.String(body)}
}

// InboundPayload is what Kuik's webhook receives. Shaped to mirror the fields
// the Cloud API path already produces, so lib/whatsapp/inbound.ts can treat
// both transports the same once past the front door.
type InboundPayload struct {
	TenantID  string `json:"tenantId"`
	MessageID string `json:"messageId"`
	// The FULL JID to reply to, server included — "5215512345678@s.whatsapp.net"
	// or "42507928911917@lid". Never just the user part: WhatsApp now addresses
	// many chats by LID (an opaque privacy id), and assuming @s.whatsapp.net
	// gets "no LID found for ...@s.whatsapp.net from server".
	From string `json:"from"`
	// The real phone number when WhatsApp discloses it, for matching a caller
	// to a reservation. Empty under LID addressing, which is the point of LID.
	Phone     string `json:"phone"`
	PushName  string `json:"pushName"`
	Text      string `json:"text"`
	Timestamp int64  `json:"timestamp"`
	IsGroup   bool   `json:"isGroup"`
	FromMe    bool   `json:"fromMe"`
}

// extractText pulls readable text out of the several shapes WhatsApp uses.
//
// Buttons and list replies matter more than they look: Kuik's flow engine
// prefers an exact reply id over parsing Spanish, and these are where those ids
// arrive when a diner is on a client that renders them.
func extractText(msg *waE2E.Message) string {
	if msg == nil {
		return ""
	}
	if t := msg.GetConversation(); t != "" {
		return t
	}
	if ext := msg.GetExtendedTextMessage(); ext != nil {
		return ext.GetText()
	}
	if btn := msg.GetButtonsResponseMessage(); btn != nil {
		return btn.GetSelectedDisplayText()
	}
	if list := msg.GetListResponseMessage(); list != nil {
		return list.GetTitle()
	}
	if img := msg.GetImageMessage(); img != nil {
		return img.GetCaption()
	}
	return ""
}

// Forwarder posts inbound messages to Kuik.
//
// Delivery happens on its own workers, NEVER on the caller's goroutine.
// whatsmeow dispatches event handlers synchronously on the goroutine reading
// the WhatsApp socket, so an HTTP call here stalls the entire message pipeline
// for that account — observed in production as "Node handling took 4m24s",
// with the bot silent the whole time because nothing else could be processed.
type Forwarder struct {
	url    string
	secret string
	client *http.Client
	queue  chan InboundPayload
}

const (
	// Deep enough to absorb a history-sync burst, shallow enough that a wedged
	// Kuik shows up as dropped messages in the log instead of unbounded memory.
	forwardQueueSize = 512
	forwardWorkers   = 4
)

func NewForwarder(url, secret string) *Forwarder {
	f := &Forwarder{
		url:    url,
		secret: secret,
		client: &http.Client{Timeout: 15 * time.Second},
		queue:  make(chan InboundPayload, forwardQueueSize),
	}
	for i := 0; i < forwardWorkers; i++ {
		go f.worker()
	}
	return f
}

func (f *Forwarder) worker() {
	for payload := range f.queue {
		f.post(payload)
	}
}

func (f *Forwarder) Handle(tenantID string, evt *events.Message) {
	// Groups are noise for a reservation bot, and replying in one would be
	// worse than staying quiet.
	if evt.Info.IsGroup {
		return
	}
	text := extractText(evt.Message)
	if strings.TrimSpace(text) == "" {
		return
	}

	// Under LID addressing `Sender` is the opaque id and `SenderAlt` carries the
	// phone number — and the other way round under phone addressing. Reply to
	// whichever one the message arrived on; report the phone only if we have it.
	phone := ""
	if evt.Info.AddressingMode == types.AddressingModeLID {
		if evt.Info.SenderAlt.Server == types.DefaultUserServer {
			phone = evt.Info.SenderAlt.User
		}
	} else {
		phone = evt.Info.Sender.User
	}

	payload := InboundPayload{
		TenantID:  tenantID,
		MessageID: evt.Info.ID,
		From:      evt.Info.Sender.String(),
		Phone:     phone,
		PushName:  evt.Info.PushName,
		Text:      text,
		Timestamp: evt.Info.Timestamp.Unix(),
		IsGroup:   evt.Info.IsGroup,
		FromMe:    evt.Info.IsFromMe,
	}

	// Hand off and return immediately: this runs inside whatsmeow's socket
	// goroutine and must not block it.
	select {
	case f.queue <- payload:
	default:
		log.Printf("forward queue full, dropping message %s from %s", payload.MessageID, payload.From)
	}
}

func (f *Forwarder) post(payload InboundPayload) {
	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("forward marshal: %v", err)
		return
	}

	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, f.url, bytes.NewReader(body))
	if err != nil {
		log.Printf("forward request: %v", err)
		return
	}

	// Same scheme Kuik uses for Meta's webhook: HMAC-SHA256 over the raw bytes.
	mac := hmac.New(sha256.New, []byte(f.secret))
	mac.Write(body)
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-bridge-signature-256", "sha256="+hex.EncodeToString(mac.Sum(nil)))

	res, err := f.client.Do(req)
	if err != nil {
		log.Printf("forward to kuik: %v", err)
		return
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		// 403 here almost always means BRIDGE_SECRET and Kuik's
		// WHATSAPP_BRIDGE_SECRET disagree — the single most likely
		// misconfiguration, and otherwise invisible.
		hint := ""
		if res.StatusCode == 403 {
			hint = " (signature rejected — does BRIDGE_SECRET match Kuik's WHATSAPP_BRIDGE_SECRET?)"
		}
		log.Printf("kuik rejected inbound %s: HTTP %d%s", payload.MessageID, res.StatusCode, hint)
		return
	}
	log.Printf("forwarded %s from %s", payload.MessageID, payload.From)
}
