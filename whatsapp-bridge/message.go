package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"go.mau.fi/whatsmeow"
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
	// Media — a voice note, a photo, a sticker — travels base64'd: Kuik
	// transcribes audio and keeps all of it for the staff chat. Empty
	// MediaB64 with a MediaType still gets forwarded — Kuik then knows to
	// answer "no pude escuchar tu audio" instead of staying silent.
	MediaType string `json:"mediaType,omitempty"`
	MediaMime string `json:"mediaMime,omitempty"`
	MediaB64  string `json:"mediaB64,omitempty"`
	// The id of the message this one quotes ("reply"), when it does.
	RepliedTo string `json:"repliedTo,omitempty"`
}

// Voice notes are opus at ~1.5 MB/minute; anything past this is a podcast,
// not a booking request. Photos are re-encoded by WhatsApp at ~100 KB–2 MB;
// stickers are WebP of a few hundred KB.
const (
	maxAudioBytes = 8 << 20
	maxImageBytes = 6 << 20
)

// mediaOf picks the downloadable part of a message the staff chat can show,
// with its kind and mime. Video is left out on purpose: tens of megabytes
// per message for something a host at the door will not watch.
func mediaOf(msg *waE2E.Message) (kind, mime string, media whatsmeow.DownloadableMessage, size uint64) {
	switch {
	case msg.GetAudioMessage() != nil:
		a := msg.GetAudioMessage()
		return "audio", a.GetMimetype(), a, a.GetFileLength()
	case msg.GetImageMessage() != nil:
		i := msg.GetImageMessage()
		return "image", i.GetMimetype(), i, i.GetFileLength()
	case msg.GetStickerMessage() != nil:
		st := msg.GetStickerMessage()
		return "sticker", st.GetMimetype(), st, st.GetFileLength()
	}
	return "", "", nil, 0
}

// repliedTo is the quoted message's id, whichever shape carries the context.
func repliedTo(msg *waE2E.Message) string {
	var ctx *waE2E.ContextInfo
	switch {
	case msg.GetExtendedTextMessage() != nil:
		ctx = msg.GetExtendedTextMessage().GetContextInfo()
	case msg.GetImageMessage() != nil:
		ctx = msg.GetImageMessage().GetContextInfo()
	case msg.GetAudioMessage() != nil:
		ctx = msg.GetAudioMessage().GetContextInfo()
	case msg.GetStickerMessage() != nil:
		ctx = msg.GetStickerMessage().GetContextInfo()
	}
	return ctx.GetStanzaID()
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
	queue  chan queueItem
}

// queueItem defers the expensive parts — media download and the HTTP post —
// to the worker pool, so the socket goroutine only ever enqueues.
type queueItem struct {
	payload InboundPayload
	// Set for media: the worker downloads it through this client.
	media whatsmeow.DownloadableMessage
	limit int
	cli   *whatsmeow.Client
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
		queue:  make(chan queueItem, forwardQueueSize),
	}
	for i := 0; i < forwardWorkers; i++ {
		go f.worker()
	}
	return f
}

func (f *Forwarder) worker() {
	for item := range f.queue {
		if item.media != nil && item.cli != nil {
			// Download on the WORKER, never the socket goroutine. A failure
			// still forwards the payload — Kuik answers "couldn't listen"
			// instead of leaving the diner on read.
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			data, err := item.cli.Download(ctx, item.media)
			cancel()
			if err != nil {
				log.Printf("%s download failed for %s: %v", item.payload.MediaType, item.payload.MessageID, err)
			} else if len(data) > item.limit {
				log.Printf("%s %s too large (%d bytes), forwarding without media", item.payload.MediaType, item.payload.MessageID, len(data))
			} else {
				item.payload.MediaB64 = base64.StdEncoding.EncodeToString(data)
			}
		}
		f.post(item.payload)
	}
}

func (f *Forwarder) Handle(tenantID string, evt *events.Message, cli *whatsmeow.Client) {
	// Groups are noise for a reservation bot, and replying in one would be
	// worse than staying quiet.
	if evt.Info.IsGroup {
		log.Printf("skipping group message from %s", evt.Info.Sender.String())
		return
	}
	text := extractText(evt.Message)
	kind, mime, media, size := mediaOf(evt.Message)
	if strings.TrimSpace(text) == "" && media == nil {
		// A reaction, a poll, a video — nothing the bot can read or the
		// staff chat shows. Logged because "nothing happened" needs a reason.
		log.Printf("skipping message with no text from %s (type %s)", evt.Info.Sender.String(), evt.Info.Type)
		return
	}

	// Under LID addressing `Sender` is the opaque id and `SenderAlt` carries the
	// phone number — and the other way round under phone addressing. Reply to
	// whichever one the message arrived on; report the phone only if we have it.
	phone := ""
	if evt.Info.AddressingMode == types.AddressingModeLID {
		if evt.Info.SenderAlt.Server == types.DefaultUserServer {
			phone = evt.Info.SenderAlt.User
		} else if cli != nil && cli.Store != nil && cli.Store.LIDs != nil {
			// The message itself carried no phone, but whatsmeow keeps the
			// LID ↔ phone pairs it has learned (contact sync, history sync,
			// earlier messages). A regular of the restaurant is usually there.
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			if pn, err := cli.Store.LIDs.GetPNForLID(ctx, evt.Info.Sender); err == nil && !pn.IsEmpty() && pn.Server == types.DefaultUserServer {
				phone = pn.User
			}
			cancel()
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
		RepliedTo: repliedTo(evt.Message),
	}

	item := queueItem{payload: payload}
	if media != nil {
		limit := maxImageBytes
		if kind == "audio" {
			limit = maxAudioBytes
		}
		item.payload.MediaType = kind
		item.payload.MediaMime = mime
		if size <= uint64(limit) {
			item.media = media
			item.limit = limit
			item.cli = cli
		}
	}

	// Hand off and return immediately: this runs inside whatsmeow's socket
	// goroutine and must not block it.
	select {
	case f.queue <- item:
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
