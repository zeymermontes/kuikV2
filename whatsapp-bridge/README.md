# Kuik WhatsApp bridge

A small Go service that holds one WhatsApp **linked-device** session per
restaurant, using [whatsmeow](https://github.com/tulir/whatsmeow) — the same
mechanism WhatsApp Web uses. Pairing is a QR scan; there is no Meta business
verification, no Tech Provider status, no template approval and no per-message
billing.

## Read this before deploying it

whatsmeow is an unofficial, reverse-engineered client. Automating a WhatsApp
account through one is **not permitted by WhatsApp's terms**, and the account
that carries the risk is the restaurant's own number — the one printed on their
menus and listed on their Google profile. A ban would take that number with it,
and would take every connected restaurant at once.

Kuik's other path (`mode: 'coexistence'`, Meta's Cloud API) is the sanctioned
one, and the code keeps both: `whatsapp_numbers.mode` records how a number was
connected, and the send layer branches on `whatsapp_conversations.transport`.
Switching a tenant across is a re-pair, not a rewrite.

## What it does differently from the Cloud API

| | Cloud API | this bridge |
|---|---|---|
| Onboarding | weeks of Meta paperwork | scan a QR |
| Cost | templates are billed | none |
| 24-hour window | enforced; templates required outside it | none — reminders send freely |
| Interactive buttons | native | rendered as a numbered list |
| Group chats | not delivered | received |
| Risk | none | the restaurant's number can be banned |

## Running it

```
export BRIDGE_SECRET=...          # shared with Kuik (WHATSAPP_BRIDGE_SECRET)
export KUIK_WEBHOOK_URL=https://app.kuik.mx/api/webhooks/whatsapp/bridge
export DATABASE_URL='postgres://...?sslmode=require&search_path=whatsmeow'
go run .
```

### The schema is not optional

whatsmeow stores the session's cryptographic material — `noise_key`,
`identity_key`, `adv_key` — in its own tables. If those land in Supabase's
`public` schema, PostgREST publishes them, and the anon key that reads it ships
inside every browser bundle: the keys to a restaurant's WhatsApp account would
sit behind a public URL.

PostgREST exposes only `public`, so pinning `search_path` to a dedicated schema
is the fix. Create it once:

```sql
create schema if not exists whatsmeow;
```

The service refuses to start without it rather than quietly doing the dangerous
thing.

Sessions survive restarts because whatsmeow persists device credentials in
`DATABASE_URL`. Losing that store means every restaurant has to re-pair.

## API

All endpoints require `Authorization: Bearer $BRIDGE_SECRET`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/sessions/{tenantId}` | Begin pairing; returns a QR payload |
| `GET` | `/sessions/{tenantId}` | Status, and the current QR while pairing |
| `DELETE` | `/sessions/{tenantId}` | Log out and forget the device |
| `POST` | `/sessions/{tenantId}/send` | Send a text message |
| `GET` | `/health` | Liveness |

Inbound messages are POSTed to `KUIK_WEBHOOK_URL`, signed with
`X-Bridge-Signature-256` — an HMAC-SHA256 over the raw body, the same scheme
Kuik uses for Meta's webhook.
