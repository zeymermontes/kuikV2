-- Kuik — WhatsApp numbers and their credentials
--
-- Connected through Meta's Coexistence path, so the restaurant's existing
-- number keeps working in the WhatsApp Business app on their phone while also
-- reaching the Cloud API. Messages they send by hand arrive as
-- `smb_message_echoes`, which is what lets the bot know to stay quiet.
--
-- Routing note: the webhook is ONE url for every tenant — Meta will not call
-- /api/.../[tenantId] — so `phone_number_id` is the routing key. It is the
-- phone's id, not the account's: one WABA can hold several numbers, which is
-- why `waba_id` is recorded but never routed on.

create table if not exists whatsapp_numbers (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants on delete cascade,
  -- A tenant may connect one number per branch; null means "the whole tenant".
  branch_id            uuid references branches on delete set null,
  waba_id              text not null,
  phone_number_id      text not null unique,
  display_phone_number text not null,
  phone_e164           text not null,
  verified_name        text,
  quality_rating       text,                                  -- GREEN | YELLOW | RED
  messaging_limit_tier text,
  mode                 text not null default 'coexistence'
                         check (mode in ('coexistence', 'cloud_api')),
  status               text not null default 'pending'
                         check (status in ('pending', 'connected', 'disconnected', 'error', 'banned')),
  is_default           boolean not null default false,
  -- Coexistence drops a number after 14 days without the Business app being
  -- opened. These two feed the day-11 warning.
  last_inbound_at      timestamptz,
  last_outbound_at     timestamptz,
  connected_at         timestamptz,
  disconnected_at      timestamptz,
  error_code           text,
  error_message        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create unique index if not exists whatsapp_numbers_default_idx
  on whatsapp_numbers (tenant_id) where is_default;
create index if not exists whatsapp_numbers_tenant_idx on whatsapp_numbers (tenant_id);
create index if not exists whatsapp_numbers_e164_idx   on whatsapp_numbers (phone_e164);

alter table whatsapp_numbers enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies
    where tablename = 'whatsapp_numbers' and policyname = 'whatsapp_numbers_read') then
    create policy whatsapp_numbers_read on whatsapp_numbers for select
      using (public.is_member(tenant_id) or public.is_super_admin());
  end if;
  if not exists (select 1 from pg_policies
    where tablename = 'whatsapp_numbers' and policyname = 'whatsapp_numbers_manage') then
    create policy whatsapp_numbers_manage on whatsapp_numbers for all
      using (public.owns_tenant(tenant_id) or public.is_super_admin())
      with check (public.owns_tenant(tenant_id) or public.is_super_admin());
  end if;
end $$;

-- ── Credentials ────────────────────────────────────────────────────────────
-- A separate table, not columns on whatsapp_numbers, so that no server
-- component doing `select *` can pull an access token into a React tree.
-- Ciphertext only: sealed with AES-256-GCM in the app (lib/crypto.ts), bound to
-- the row's phone_number_id, key held in an env var and never in Postgres.
create table if not exists whatsapp_credentials (
  phone_number_id text primary key
                    references whatsapp_numbers(phone_number_id) on delete cascade,
  tenant_id       uuid not null references tenants on delete cascade,
  waba_id         text not null,
  token_ct        bytea not null,
  token_iv        bytea not null,
  token_tag       bytea not null,
  key_version     smallint not null default 1,
  token_type      text not null default 'system_user',
  expires_at      timestamptz,                       -- null = long-lived
  scopes          text[],
  created_at      timestamptz not null default now(),
  rotated_at      timestamptz
);

-- RLS on with ZERO policies: denies every anon and authenticated request
-- outright. Only the service-role client can read this table, and only
-- lib/whatsapp/credentials.ts is allowed to do so.
alter table whatsapp_credentials enable row level security;
