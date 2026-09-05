-- Kuik — the print queue
--
-- Until now the POS printed through the browser's print dialog: fine for a
-- laptop, useless for a kitchen. A restaurant prints from several devices
-- (an iPad at the bar, a Windows all-in-one at the register) to several
-- printers (kitchen, bar, receipt with a cash drawer), and the printers speak
-- raw ESC/POS over the LAN or USB — nothing a browser can reach.
--
-- The design follows Square/Toast/Loyverse: a small **agent** runs on one
-- machine in the restaurant (the register PC, a Raspberry Pi), holds a token,
-- and drains a queue of jobs Kuik hands it. The POS never talks to a printer;
-- it appends a job and the agent prints it. When the agent runs on the same
-- machine as the browser the POS also hands jobs straight to it over
-- loopback, so printing keeps working with the internet down.
--
--   print_agents   one row per installed agent (token, last seen)
--   printers       the physical printers, each bound to the agent that reaches it
--   print_jobs     the queue: a rendered document, a target printer, a status
--
-- Jobs are client-generated UUIDs with the POS's `updated_at` last-write-wins
-- clock, so they travel through the same offline outbox as tabs and payments.

-- ── Agents ──────────────────────────────────────────────────────────────────
create table if not exists print_agents (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants on delete cascade,
  branch_id     uuid references branches on delete set null,
  name          text not null,
  -- sha256 of the bearer token; the token itself is shown once and never stored.
  token_hash    text not null unique,
  platform      text,
  version       text,
  last_seen_at  timestamptz,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists print_agents_tenant_idx on print_agents (tenant_id);

alter table print_agents enable row level security;

do $$ begin
  -- Everyone who runs the POS may see which agents exist (to know what is online);
  -- adding or removing one is a manager's job.
  if not exists (select 1 from pg_policies where tablename = 'print_agents' and policyname = 'print_agents_read') then
    create policy print_agents_read on print_agents for select
      using (public.can_operate_pos(tenant_id) or public.is_super_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'print_agents' and policyname = 'print_agents_write') then
    create policy print_agents_write on print_agents for all
      using (public.can_manage_menu(tenant_id) or public.is_super_admin())
      with check (public.can_manage_menu(tenant_id) or public.is_super_admin());
  end if;
end $$;

-- ── Printers ────────────────────────────────────────────────────────────────
-- `kind`: how the agent reaches it.
--   network  raw TCP, `address` = host[:port] (9100 by default) — most LAN printers
--   system   an OS printer, `address` = its name in Windows / CUPS (USB, Bluetooth)
-- `roles`: what it prints — receipt, kitchen, report. A kitchen printer with an
-- empty `stations` takes every station; otherwise only the ones listed.
-- `width`: characters per line — 32 for 58 mm paper, 48 for 80 mm.
create table if not exists printers (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants on delete cascade,
  branch_id     uuid references branches on delete set null,
  agent_id      uuid references print_agents on delete set null,
  name          text not null,
  kind          text not null default 'network' check (kind in ('network', 'system')),
  address       text not null,
  width         int  not null default 48 check (width in (32, 42, 48)),
  roles         text[] not null default '{}',
  stations      text[] not null default '{}',
  has_drawer    boolean not null default false,
  cut           boolean not null default true,
  copies        int  not null default 1 check (copies between 1 and 3),
  enabled       boolean not null default true,
  position      int  not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists printers_tenant_idx on printers (tenant_id, position);

alter table printers enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'printers' and policyname = 'printers_read') then
    create policy printers_read on printers for select
      using (public.can_operate_pos(tenant_id) or public.is_super_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'printers' and policyname = 'printers_write') then
    create policy printers_write on printers for all
      using (public.can_manage_menu(tenant_id) or public.is_super_admin())
      with check (public.can_manage_menu(tenant_id) or public.is_super_admin());
  end if;
end $$;

-- ── Jobs ────────────────────────────────────────────────────────────────────
-- `doc` is a PrintDoc (lib/pos/print-doc.ts): lines of text, rows, rules and
-- feeds, printer-independent. The agent renders it to ESC/POS for the paper
-- width of the target; the browser renders the same document to HTML when
-- there is no printer. One layout, two outputs.
create table if not exists print_jobs (
  id            uuid primary key,
  tenant_id     uuid not null references tenants on delete cascade,
  printer_id    uuid not null references printers on delete cascade,
  kind          text not null check (kind in ('kitchen', 'receipt', 'report', 'drawer', 'test')),
  doc           jsonb not null default '{}'::jsonb,
  status        text not null default 'queued' check (status in ('queued', 'printing', 'done', 'failed')),
  attempts      int  not null default 0,
  error         text,
  -- The ticket, tab or shift this came from, for "reprint" and for the log.
  ref_id        uuid,
  created_by    uuid,
  claimed_at    timestamptz,
  printed_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists print_jobs_queue_idx on print_jobs (printer_id, status, created_at)
  where status in ('queued', 'printing');
create index if not exists print_jobs_tenant_idx on print_jobs (tenant_id, created_at desc);

alter table print_jobs enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'print_jobs' and policyname = 'print_jobs_pos_all') then
    create policy print_jobs_pos_all on print_jobs for all
      using (public.can_operate_pos(tenant_id) or public.is_super_admin())
      with check (public.can_operate_pos(tenant_id) or public.is_super_admin());
  end if;
end $$;

-- Same stale-write guard as the other POS tables (0033).
drop trigger if exists print_jobs_guard on print_jobs;
create trigger print_jobs_guard before update on print_jobs
  for each row execute function public.guard_updated_at();

alter table print_jobs replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'print_jobs') then
    alter publication supabase_realtime add table print_jobs;
  end if;
end $$;

-- Done jobs are a log, not a queue: keep a month, drop the rest. Called from
-- the agent poll route now and then; cheap because of the tenant index.
create or replace function public.prune_print_jobs()
returns void language sql security definer set search_path = public as $$
  delete from print_jobs
   where status in ('done', 'failed') and created_at < now() - interval '30 days';
$$;
revoke execute on function public.prune_print_jobs() from anon, authenticated;

-- ── What prints by itself ──────────────────────────────────────────────────
-- print_receipt_mode: 'ask' keeps the button, 'auto' prints at payment,
-- 'off' never offers paper. print_kitchen_auto: every fire goes to the
-- station printers without a tap. print_drawer_cash: kick the drawer on cash.
alter table tenant_ordering
  add column if not exists print_receipt_mode text not null default 'ask'
    check (print_receipt_mode in ('ask', 'auto', 'off')),
  add column if not exists print_kitchen_auto boolean not null default true,
  add column if not exists print_drawer_cash  boolean not null default true,
  -- Extra lines under the receipt total: RFC, address, a thank-you.
  add column if not exists receipt_footer     text;

-- ── The customer screen on another device ───────────────────────────────────
-- The terminal mirrors the running sale to /pos/customer over a BroadcastChannel
-- (same browser). For a screen on a separate device — an iPad facing the guest,
-- an Android box behind an HDMI display — it broadcasts the same state through
-- a private Realtime channel `pos-display:<tenantId>:<register>`. Private
-- channels are authorised here: only the tenant's POS staff can send on it or
-- listen to it, so a sale is never readable from a guessed topic.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
                 and policyname = 'pos_display_read') then
    create policy pos_display_read on realtime.messages for select to authenticated
      using (
        realtime.topic() like 'pos-display:%'
        and public.can_operate_pos(nullif(split_part(realtime.topic(), ':', 2), '')::uuid)
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
                 and policyname = 'pos_display_write') then
    create policy pos_display_write on realtime.messages for insert to authenticated
      with check (
        realtime.topic() like 'pos-display:%'
        and public.can_operate_pos(nullif(split_part(realtime.topic(), ':', 2), '')::uuid)
      );
  end if;
end $$;
