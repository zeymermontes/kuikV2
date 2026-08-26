-- Kuik — pairing a number through a linked-device bridge
--
-- An alternative to Meta's Cloud API: the number is paired the same way
-- WhatsApp Web is, by scanning a QR from the phone. No Meta verification, no
-- Tech Provider status, no template approval, no per-message billing.
--
-- The trade-off is real and worth stating in the schema itself: this uses an
-- unofficial client, which WhatsApp's terms do not permit, and the account that
-- carries the risk is the restaurant's own number. `mode` records which path a
-- number came in on so the two can coexist and a tenant can be moved later.

alter table whatsapp_numbers drop constraint if exists whatsapp_numbers_mode_check;
alter table whatsapp_numbers add constraint whatsapp_numbers_mode_check
  check (mode in ('coexistence', 'cloud_api', 'bridge'));

alter table whatsapp_numbers drop constraint if exists whatsapp_numbers_status_check;
alter table whatsapp_numbers add constraint whatsapp_numbers_status_check
  check (status in ('pending', 'pairing', 'connected', 'disconnected', 'error', 'banned'));

-- Bridge sessions are keyed by tenant, not by a Meta phone_number_id (there
-- isn't one). A synthetic id keeps the rest of the schema — conversations,
-- messages, credentials — completely unchanged.
alter table whatsapp_numbers
  add column if not exists bridge_session_id text,
  -- Set while a QR is on screen; the code is short-lived and refreshes.
  add column if not exists pairing_expires_at timestamptz;

create index if not exists whatsapp_numbers_bridge_idx
  on whatsapp_numbers (bridge_session_id) where bridge_session_id is not null;

-- A linked device has no 24-hour customer-service window and no templates: the
-- restaurant's own account is simply sending a message. Recording it on the
-- conversation means the send layer can skip the window check for these without
-- a special case scattered through the code.
alter table whatsapp_conversations
  add column if not exists transport text not null default 'cloud'
    check (transport in ('cloud', 'bridge'));
