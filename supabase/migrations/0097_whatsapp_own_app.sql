-- Kuik — a restaurant's own Meta app (manual Cloud API connection)
--
-- Until now the Cloud API path only existed through Embedded Signup, which
-- runs under Kuik's Meta app (and needs Kuik verified as a Tech Provider). A
-- restaurant can instead create its own Meta app, register its number there
-- and paste the ids, a permanent system-user token and the app secret into the
-- dashboard.
--
-- Two things change for a number that came in this way:
--   · Inbound webhooks are signed with THAT app's secret, not Kuik's, so the
--     secret is stored (sealed, like the token) and looked up by the
--     phone_number_id in the payload when the global secret does not match.
--   · Meta's GET handshake repeats a verify token the restaurant typed into
--     its own app; a per-number token is generated here and shown to them.

alter table whatsapp_credentials
  add column if not exists app_secret_ct bytea,
  add column if not exists app_secret_iv bytea,
  add column if not exists app_secret_tag bytea,
  add column if not exists webhook_verify_token text;

create unique index if not exists whatsapp_credentials_verify_token_idx
  on whatsapp_credentials (webhook_verify_token)
  where webhook_verify_token is not null;
