-- Kuik — conversation flows, Intercom-style
--
-- Replaces whatsapp_goals as the thing the bot works through. A flow is a
-- GRAPH (nodes + edges, drawn on a canvas) instead of a flat slot list, it is
-- versioned so editing never breaks a conversation already in progress, and
-- every diner's passage through one is recorded as a run the dashboard can
-- replay. Config that doesn't change the conversation's structure — triggers,
-- timers, mode — lives in columns so tweaking it never requires republishing.

create table if not exists whatsapp_flows (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants on delete cascade,
  key                 text not null,
  name                text not null,
  -- Doubles as the goal description handed to the AI.
  description         text,
  enabled             boolean not null default true,
  priority            int not null default 0,
  -- [{ kind: 'keyword'|'regex'|'interactive_id', value }] — same shape as
  -- whatsapp_goals.triggers, so lib/whatsapp/intent.ts matches both.
  triggers            jsonb not null default '[]'::jsonb,
  -- 'ai': the model runs the conversation and fills the graph's slots;
  -- 'linear': the graph is walked verbatim. AI mode falls back to linear.
  mode                text not null default 'linear' check (mode in ('linear', 'ai')),
  -- The graph being edited; see lib/whatsapp/flows/schema.ts for the shape.
  draft_graph         jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  -- 0 = never published. The runnable graph lives in whatsapp_flow_versions.
  published_version   int not null default 0,
  -- Re-ask timer: after this long with no reply, repeat the pending question.
  nudge_after_minutes int check (nudge_after_minutes > 0),
  max_nudges          int not null default 2 check (max_nudges >= 0),
  -- Optional prefix for the re-ask ("¿Sigues ahí?").
  nudge_message       text,
  -- Give-up timer: after this long, send close_message and mark abandoned.
  close_after_minutes int check (close_after_minutes > 0),
  close_message       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, key)
);
create index if not exists whatsapp_flows_tenant_idx on whatsapp_flows (tenant_id, priority desc);

-- Immutable snapshot per publish. Runs pin (flow_id, version), so a
-- republished flow never yanks the floor from under an active conversation.
create table if not exists whatsapp_flow_versions (
  id           uuid primary key default gen_random_uuid(),
  flow_id      uuid not null references whatsapp_flows on delete cascade,
  tenant_id    uuid not null references tenants on delete cascade,
  version      int not null,
  graph        jsonb not null,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users (id) on delete set null,
  unique (flow_id, version)
);

-- One diner's passage through one flow. THE record behind the inbox: which
-- flow, how far they got, what they answered and when, why it ended.
create table if not exists whatsapp_flow_runs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants on delete cascade,
  flow_id         uuid not null references whatsapp_flows on delete cascade,
  flow_version    int not null,
  conversation_id uuid not null references whatsapp_conversations on delete cascade,
  contact_id      uuid not null references whatsapp_contacts on delete cascade,
  status          text not null default 'active'
                  check (status in ('active','completed','abandoned','expired','handoff','canceled')),
  -- Who is driving right now. AI degrades to 'linear' when a turn fails.
  engine          text not null default 'linear' check (engine in ('linear','ai')),
  current_node_id text,
  -- { slot_key: { value, at, source: 'button'|'text'|'ai' } }
  answers         jsonb not null default '{}'::jsonb,
  -- Volunteered facts the AI wrote down that no slot asked for.
  extra_data      jsonb not null default '{}'::jsonb,
  nudge_count     int not null default 0,
  nudge_due_at    timestamptz,
  close_due_at    timestamptz,
  -- 'timeout' | 'no_engagement' | 'handoff_keyword' | 'plan_downgrade' | …
  ended_reason    text,
  action_result   jsonb,
  started_at      timestamptz not null default now(),
  last_inbound_at timestamptz,
  completed_at    timestamptz,
  ended_at        timestamptz
);

-- The 5-minute cron scans due timers; partial indexes keep that scan tiny.
create index if not exists wa_flow_runs_nudge_idx on whatsapp_flow_runs (nudge_due_at)
  where status = 'active';
create index if not exists wa_flow_runs_close_idx on whatsapp_flow_runs (close_due_at)
  where status = 'active';
-- One live run per conversation, enforced where it matters.
create unique index if not exists wa_flow_runs_active_conv_idx on whatsapp_flow_runs (conversation_id)
  where status = 'active';
create index if not exists wa_flow_runs_inbox_idx on whatsapp_flow_runs (tenant_id, flow_id, started_at desc);
create index if not exists wa_flow_runs_conv_idx on whatsapp_flow_runs (conversation_id, started_at desc);
-- The 90-day purge deletes by ended_at over terminated runs.
create index if not exists wa_flow_runs_purge_idx on whatsapp_flow_runs (ended_at)
  where status <> 'active';

-- Terminated runs are purged after 90 days, so stats that must outlive them
-- accrue here (mirrors ai_usage_counters).
create table if not exists whatsapp_flow_counters (
  tenant_id uuid not null references tenants on delete cascade,
  flow_id   uuid not null references whatsapp_flows on delete cascade,
  version   int not null,
  day       date not null,
  started   int not null default 0,
  completed int not null default 0,
  abandoned int not null default 0,
  primary key (tenant_id, flow_id, version, day)
);

create or replace function public.flow_counter_add(
  p_tenant uuid, p_flow uuid, p_version int,
  p_started int, p_completed int, p_abandoned int
) returns void
language sql security definer set search_path = public as $$
  insert into whatsapp_flow_counters (tenant_id, flow_id, version, day, started, completed, abandoned)
  values (p_tenant, p_flow, p_version, (now() at time zone 'utc')::date, p_started, p_completed, p_abandoned)
  on conflict (tenant_id, flow_id, version, day) do update
    set started   = whatsapp_flow_counters.started + excluded.started,
        completed = whatsapp_flow_counters.completed + excluded.completed,
        abandoned = whatsapp_flow_counters.abandoned + excluded.abandoned;
$$;
-- PUBLIC included: Postgres grants EXECUTE on functions to PUBLIC by default,
-- so revoking only anon/authenticated would leave them with inherited access.
revoke execute on function public.flow_counter_add(uuid, uuid, int, int, int, int)
  from public, anon, authenticated;

-- RLS ------------------------------------------------------------------

alter table whatsapp_flows enable row level security;
alter table whatsapp_flow_versions enable row level security;
alter table whatsapp_flow_runs enable row level security;
alter table whatsapp_flow_counters enable row level security;

drop policy if exists whatsapp_flows_read on whatsapp_flows;
drop policy if exists whatsapp_flows_write on whatsapp_flows;
create policy whatsapp_flows_read on whatsapp_flows for select
  using (public.is_member(tenant_id) or public.is_super_admin());
create policy whatsapp_flows_write on whatsapp_flows for all
  using (public.can_manage_menu(tenant_id) or public.is_super_admin())
  with check (public.can_manage_menu(tenant_id) or public.is_super_admin());

drop policy if exists wa_flow_versions_read on whatsapp_flow_versions;
drop policy if exists wa_flow_versions_write on whatsapp_flow_versions;
create policy wa_flow_versions_read on whatsapp_flow_versions for select
  using (public.is_member(tenant_id) or public.is_super_admin());
-- Publishing inserts a snapshot; nothing ever updates or deletes one directly
-- (cascade from the flow handles cleanup).
create policy wa_flow_versions_write on whatsapp_flow_versions for insert
  with check (public.can_manage_menu(tenant_id) or public.is_super_admin());

-- Runs are written only by the bot runtime (service role); staff read them.
drop policy if exists wa_flow_runs_read on whatsapp_flow_runs;
create policy wa_flow_runs_read on whatsapp_flow_runs for select
  using (public.can_use_whatsapp(tenant_id) or public.is_super_admin());

drop policy if exists wa_flow_counters_read on whatsapp_flow_counters;
create policy wa_flow_counters_read on whatsapp_flow_counters for select
  using (public.is_member(tenant_id) or public.is_super_admin());

-- Stats views ----------------------------------------------------------
-- security_invoker so the underlying tables' RLS applies to the reader.

create or replace view whatsapp_flow_stats
  with (security_invoker = on) as
  select tenant_id, flow_id, version,
         sum(started)   as started,
         sum(completed) as completed,
         sum(abandoned) as abandoned
  from whatsapp_flow_counters
  group by tenant_id, flow_id, version;

create or replace view whatsapp_flow_dropoff
  with (security_invoker = on) as
  select tenant_id, flow_id, flow_version as version, current_node_id,
         count(*) as stuck
  from whatsapp_flow_runs
  where status in ('abandoned', 'expired')
  group by tenant_id, flow_id, flow_version, current_node_id;

-- Wire conversations to their live run --------------------------------

alter table whatsapp_conversations
  add column if not exists active_flow_run_id uuid
    references whatsapp_flow_runs on delete set null;
-- Without this, every purged run's FK check scans whatsapp_conversations.
create index if not exists wa_conv_active_run_idx on whatsapp_conversations (active_flow_run_id)
  where active_flow_run_id is not null;

comment on table whatsapp_goals is
  'DEPRECATED since 0057: replaced by whatsapp_flows. Kept only until the backfill has run everywhere; drop in a later migration.';
comment on column whatsapp_conversations.active_goal_id is
  'DEPRECATED since 0057: superseded by active_flow_run_id.';
comment on column whatsapp_conversations.state is
  'DEPRECATED since 0057: run state lives on whatsapp_flow_runs.';
