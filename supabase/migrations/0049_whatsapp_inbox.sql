-- Kuik — WhatsApp conversation history
--
-- Read-only inside Kuik on purpose. Under Coexistence the owner still replies
-- from the WhatsApp app on their phone, so that IS the inbox; duplicating it in
-- the dashboard would be a second product. What Kuik keeps is the record, the
-- bot's state, and the 24-hour window that decides whether a reply is free.

create table if not exists whatsapp_contacts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants on delete cascade,
  -- EXACTLY as Meta sends it. Mexican ids arrive as 521XXXXXXXXXX, which is not
  -- valid E.164 — never reconstruct it, always reply to this string verbatim.
  wa_id         text not null,
  -- The canonical form, for matching a caller to a reservation. See lib/phone.ts.
  phone_e164    text not null,
  profile_name  text,
  locale        text,
  is_blocked    boolean not null default false,
  opted_out     boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (tenant_id, wa_id)
);
create index if not exists whatsapp_contacts_e164_idx on whatsapp_contacts (tenant_id, phone_e164);

create table if not exists whatsapp_conversations (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants on delete cascade,
  branch_id         uuid references branches on delete set null,
  phone_number_id   text not null,
  contact_id        uuid not null references whatsapp_contacts on delete cascade,
  status            text not null default 'open' check (status in ('open', 'closed')),
  -- Last CUSTOMER inbound + 24h. A column rather than a scan, because every
  -- outbound message has to consult it and it decides free-form vs. paid
  -- template. An echo from the owner's phone does NOT extend it.
  window_expires_at timestamptz,
  bot_enabled       boolean not null default true,
  -- Set when a human takes over — usually because the owner replied from their
  -- phone. The bot must then stay out of this conversation.
  handoff_at        timestamptz,
  handoff_by        text,
  active_goal_id    uuid,
  state             jsonb not null default '{}'::jsonb,
  last_inbound_at   timestamptz,
  last_outbound_at  timestamptz,
  unread_count      int not null default 0,
  reservation_id    uuid references reservations on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (phone_number_id, contact_id)
);
create index if not exists wa_conv_tenant_idx on whatsapp_conversations (tenant_id, updated_at desc);

create table if not exists whatsapp_messages (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants on delete cascade,
  conversation_id  uuid not null references whatsapp_conversations on delete cascade,
  -- Globally unique across all of WhatsApp, which makes it THE idempotency key:
  -- `on conflict do nothing` returning zero rows means "Meta retried, skip".
  wa_message_id    text unique,
  direction        text not null check (direction in ('inbound', 'outbound')),
  origin           text not null
                     check (origin in ('customer', 'bot', 'staff_dashboard', 'staff_device', 'system')),
  type             text not null,
  body             text,
  payload          jsonb,
  media_id         text,
  media_url        text,
  media_mime       text,
  template_name    text,
  template_lang    text,
  template_vars    jsonb,
  status           text check (status in ('queued', 'sent', 'delivered', 'read', 'failed')),
  error_code       text,
  error_message    text,
  replied_to_wa_id text,
  ai_run_id        uuid,
  created_at       timestamptz not null default now(),
  sent_at          timestamptz,
  delivered_at     timestamptz,
  read_at          timestamptz,
  failed_at        timestamptz
);
create index if not exists wa_msg_conv_idx   on whatsapp_messages (conversation_id, created_at desc);
create index if not exists wa_msg_tenant_idx on whatsapp_messages (tenant_id, created_at desc);

-- Raw webhook payloads, persisted BEFORE the 200 goes back to Meta.
--
-- Meta retries hard and an AI turn takes seconds, so the handler must ack fast
-- and work afterwards. Durability lives here: if the process dies mid-process
-- the row is still 'pending' and the maintenance cron re-runs it. A queue,
-- without adding a queue.
create table if not exists whatsapp_events (
  id              uuid primary key default gen_random_uuid(),
  received_at     timestamptz not null default now(),
  phone_number_id text,
  tenant_id       uuid,
  field           text,
  payload         jsonb not null,
  status          text not null default 'pending'
                    check (status in ('pending', 'done', 'error', 'ignored')),
  attempts        int not null default 0,
  error           text,
  processed_at    timestamptz
);
create index if not exists wa_events_pending_idx on whatsapp_events (status, received_at)
  where status in ('pending', 'error');

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Staff read the history; only the service role writes it.
create or replace function public.can_use_whatsapp(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tenant_members
    where tenant_id = t and user_id = auth.uid()
      and role::text in ('owner', 'manager', 'cashier', 'host')
  );
$$;

do $$
declare tbl text;
begin
  foreach tbl in array array['whatsapp_contacts', 'whatsapp_conversations', 'whatsapp_messages'] loop
    execute format('alter table %I enable row level security', tbl);
    execute format('drop policy if exists %1$s_read on %1$s', tbl);
    execute format($f$
      create policy %1$s_read on %1$s for select
        using (public.can_use_whatsapp(tenant_id) or public.is_super_admin());
    $f$, tbl);
  end loop;
end $$;

-- Raw payloads can carry anything a customer typed. Service role only.
alter table whatsapp_events enable row level security;

-- Realtime, mirroring 0031_orders_realtime.sql, so a conversation view can
-- follow along live once one exists.
alter table whatsapp_messages replica identity full;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'whatsapp_messages'
  ) then
    alter publication supabase_realtime add table whatsapp_messages;
  end if;
end $$;
