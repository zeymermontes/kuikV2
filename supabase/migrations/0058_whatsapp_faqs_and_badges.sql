-- Kuik — the bot's local knowledge, and live handoff visibility
--
-- whatsapp_faqs: what the AI is allowed to know beyond menu/hours/location.
-- Parking, pets, terrace, payment methods, promos — the questions diners
-- actually ask and the system prompt currently forbids answering. Each row is
-- a fact the RESTAURANT wrote, served to the model through a tool, so the
-- grounding guard keeps working: the bot still only asserts what a tool
-- returned.

create table if not exists whatsapp_faqs (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants on delete cascade,
  -- Short label ("Estacionamiento") — shown in the admin and matched on.
  topic      text not null,
  -- The answer, in the restaurant's own words. {{vars}} allowed.
  answer     text not null,
  -- Extra match words beyond the topic ("parking, valet, coche").
  keywords   text[] not null default '{}',
  enabled    boolean not null default true,
  position   int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists whatsapp_faqs_tenant_idx on whatsapp_faqs (tenant_id, position);

alter table whatsapp_faqs enable row level security;
drop policy if exists whatsapp_faqs_read on whatsapp_faqs;
drop policy if exists whatsapp_faqs_write on whatsapp_faqs;
create policy whatsapp_faqs_read on whatsapp_faqs for select
  using (public.is_member(tenant_id) or public.is_super_admin());
create policy whatsapp_faqs_write on whatsapp_faqs for all
  using (public.can_manage_menu(tenant_id) or public.is_super_admin())
  with check (public.can_manage_menu(tenant_id) or public.is_super_admin());

-- The sidebar's "waiting on a human" badge follows conversation updates live
-- (handoff set, handoff released). Messages already stream; conversations
-- didn't.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'whatsapp_conversations'
  ) then
    alter publication supabase_realtime add table whatsapp_conversations;
  end if;
end $$;
