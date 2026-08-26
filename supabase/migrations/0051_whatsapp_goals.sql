-- Kuik — what the bot is for
--
-- One row per thing a diner might want: book a table, ask the hours, ask about
-- prices. Each carries BOTH deterministic triggers and an AI-facing
-- description, so the same row drives the bot whether or not AI is switched on.
-- That is what makes "works without AI" true rather than aspirational.

create table if not exists whatsapp_goals (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants on delete cascade,
  key           text not null,     -- reservation | hours | menu | location | prices | human
  name          text not null,
  -- Doubles as the tool description handed to the model.
  description   text,
  enabled       boolean not null default true,
  priority      int not null default 0,
  -- [{ kind: 'keyword'|'regex'|'interactive_id', value, locale? }]
  triggers      jsonb not null default '[]'::jsonb,
  resolver      text not null default 'flow' check (resolver in ('flow', 'reply', 'ai')),
  reply_body    text,
  -- Slot-filling machine; see lib/whatsapp/flow.ts for the shape.
  flow          jsonb,
  action        text check (action in ('none', 'create_reservation', 'notify_staff',
                                       'send_menu_link', 'handoff')),
  action_config jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, key)
);
create index if not exists whatsapp_goals_tenant_idx on whatsapp_goals (tenant_id, priority desc);

alter table whatsapp_goals enable row level security;
drop policy if exists whatsapp_goals_read on whatsapp_goals;
drop policy if exists whatsapp_goals_write on whatsapp_goals;
create policy whatsapp_goals_read on whatsapp_goals for select
  using (public.is_member(tenant_id) or public.is_super_admin());
create policy whatsapp_goals_write on whatsapp_goals for all
  using (public.can_manage_menu(tenant_id) or public.is_super_admin())
  with check (public.can_manage_menu(tenant_id) or public.is_super_admin());

-- Now that goals exist, close the loop from a conversation to the goal it is
-- working through, and from a reservation back to the chat that produced it.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'wa_conv_active_goal_fkey') then
    alter table whatsapp_conversations
      add constraint wa_conv_active_goal_fkey
      foreign key (active_goal_id) references whatsapp_goals on delete set null;
  end if;
end $$;

alter table reservations
  add column if not exists whatsapp_conversation_id uuid
    references whatsapp_conversations on delete set null,
  add column if not exists phone_e164 text;

create index if not exists reservations_phone_idx on reservations (tenant_id, phone_e164);

-- 'bot' is already allowed by the source check added in 0044.
