-- Kuik — the AI layer
--
-- Strictly additive on top of the deterministic flows: if the budget runs out,
-- the provider times out, or the guard blocks a reply, the bot falls back to
-- the flow rather than erroring at the diner.
--
-- Kuik supplies a default key; a tenant may bring their own. Cost caps apply
-- only to the former — someone paying with their own key gets abuse limits,
-- not spending limits.

create table if not exists ai_providers_config (
  tenant_id              uuid primary key references tenants on delete cascade,
  provider               text not null default 'deepseek'
                           check (provider in ('deepseek', 'openai', 'gemini', 'anthropic', 'kimi')),
  model                  text,
  use_own_key            boolean not null default false,
  -- Sealed with lib/crypto.ts, bound to tenant_id. Never selected into a
  -- server component: the dashboard reads key_last4 and nothing more.
  key_ct                 bytea,
  key_iv                 bytea,
  key_tag                bytea,
  key_version            smallint,
  key_last4              text,
  base_url               text,
  temperature            numeric(3,2) not null default 0.2,
  max_output_tokens      int not null default 400,
  -- The restaurant's tone of voice, injected into the system block.
  system_prompt_extra    text,
  monthly_message_budget int,
  monthly_cost_cap_usd   numeric(10,2),
  updated_at             timestamptz not null default now()
);

-- Audit trail: what was asked, what it cost, and whether the guard stopped it.
create table if not exists ai_runs (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants on delete cascade,
  conversation_id  uuid references whatsapp_conversations on delete set null,
  provider         text not null,
  model            text not null,
  used_tenant_key  boolean not null default false,
  prompt_tokens    int,
  completion_tokens int,
  total_tokens     int,
  cost_usd         numeric(10,6),
  latency_ms       int,
  tool_calls       jsonb,
  outcome          text check (outcome in ('replied', 'tool', 'refused', 'error',
                                           'budget_exceeded', 'guard_blocked')),
  error            text,
  created_at       timestamptz not null default now()
);
create index if not exists ai_runs_tenant_idx on ai_runs (tenant_id, created_at desc);

-- The cheap pre-flight check: one indexed read before spending anything.
create table if not exists ai_usage_counters (
  tenant_id     uuid not null references tenants on delete cascade,
  period        date not null,             -- first day of the month
  messages      int not null default 0,
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  cost_usd      numeric(10,6) not null default 0,
  primary key (tenant_id, period)
);

create or replace function public.ai_usage_add(
  p_tenant uuid, p_messages int, p_input int, p_output int, p_cost numeric
) returns void
language sql security definer set search_path = public as $$
  insert into ai_usage_counters (tenant_id, period, messages, input_tokens, output_tokens, cost_usd)
  values (p_tenant, date_trunc('month', now())::date, p_messages, p_input, p_output, p_cost)
  on conflict (tenant_id, period) do update
    set messages      = ai_usage_counters.messages + excluded.messages,
        input_tokens  = ai_usage_counters.input_tokens + excluded.input_tokens,
        output_tokens = ai_usage_counters.output_tokens + excluded.output_tokens,
        cost_usd      = ai_usage_counters.cost_usd + excluded.cost_usd;
$$;

revoke execute on function public.ai_usage_add(uuid, int, int, int, numeric) from anon, authenticated;

alter table ai_providers_config enable row level security;
alter table ai_runs enable row level security;
alter table ai_usage_counters enable row level security;

-- Only the owner configures AI, and even they never read the key back.
drop policy if exists ai_config_owner on ai_providers_config;
create policy ai_config_owner on ai_providers_config for all
  using (public.owns_tenant(tenant_id) or public.is_super_admin())
  with check (public.owns_tenant(tenant_id) or public.is_super_admin());

drop policy if exists ai_runs_read on ai_runs;
create policy ai_runs_read on ai_runs for select
  using (public.can_manage_menu(tenant_id) or public.is_super_admin());

drop policy if exists ai_usage_read on ai_usage_counters;
create policy ai_usage_read on ai_usage_counters for select
  using (public.can_manage_menu(tenant_id) or public.is_super_admin());

-- Platform-wide defaults and a kill switch the super admin can flip without a
-- deploy.
alter table platform_settings
  add column if not exists ai_enabled            boolean not null default true,
  add column if not exists ai_default_provider   text not null default 'deepseek',
  add column if not exists ai_monthly_message_cap int not null default 3000,
  add column if not exists whatsapp_enabled      boolean not null default true;
