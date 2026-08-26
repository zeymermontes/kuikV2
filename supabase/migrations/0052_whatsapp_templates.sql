-- Kuik — message templates
--
-- Outside the 24-hour customer-service window WhatsApp only allows an approved
-- template. That is not merely a compliance gate, it is the cost model: replies
-- inside the window are free, templates are billed.
--
-- The consequence that shapes the product: a 24h-before reminder almost always
-- falls OUTSIDE the window, so it must be a template. And under Coexistence
-- every tenant has their own WABA, which means approval happens once PER
-- TENANT, not once for Kuik. Blueprints (tenant_id null) get cloned and
-- submitted automatically at connect time.

create table if not exists whatsapp_templates (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid references tenants on delete cascade,  -- null = blueprint
  waba_id          text,
  name             text not null,                              -- snake_case, Meta's rules
  language         text not null default 'es_MX',
  category         text not null check (category in ('UTILITY', 'MARKETING', 'AUTHENTICATION')),
  status           text not null default 'draft'
                     check (status in ('draft', 'pending', 'approved', 'rejected', 'paused', 'disabled')),
  meta_template_id text,
  components       jsonb not null,
  -- Maps Meta's positional {{1}}, {{2}} onto names, so callers can pass
  -- { nombre, fecha, hora } without knowing the numbering.
  variables        jsonb not null default '[]'::jsonb,
  rejected_reason  text,
  submitted_at     timestamptz,
  approved_at      timestamptz,
  updated_at       timestamptz not null default now(),
  unique (tenant_id, name, language)
);

-- The unique constraint above does NOT constrain blueprints: tenant_id is null
-- for those, and in SQL a null never equals another null, so `on conflict` below
-- would happily insert a second copy on every re-paste. A partial unique index
-- over exactly those rows is what makes the seed idempotent.
create unique index if not exists whatsapp_templates_blueprint_idx
  on whatsapp_templates (name, language) where tenant_id is null;

alter table whatsapp_templates enable row level security;
drop policy if exists whatsapp_templates_read on whatsapp_templates;
drop policy if exists whatsapp_templates_write on whatsapp_templates;
create policy whatsapp_templates_read on whatsapp_templates for select
  using (tenant_id is null or public.is_member(tenant_id) or public.is_super_admin());
create policy whatsapp_templates_write on whatsapp_templates for all
  using (public.can_manage_menu(tenant_id) or public.is_super_admin())
  with check (public.can_manage_menu(tenant_id) or public.is_super_admin());

-- The starter set the reservation work needs. Bodies use Meta's positional
-- placeholders; lib/whatsapp/templates.ts maps them to named variables.
insert into whatsapp_templates (tenant_id, name, language, category, status, components, variables)
values
  (null, 'reserva_confirmada', 'es_MX', 'UTILITY', 'draft',
   '{"components":[{"type":"BODY","text":"¡Hola {{1}}! Tu reservación en {{2}} para {{3}} personas el {{4}} a las {{5}} quedó confirmada. ¡Te esperamos!"}]}'::jsonb,
   '[{"index":1,"key":"nombre"},{"index":2,"key":"restaurante"},{"index":3,"key":"personas"},{"index":4,"key":"fecha"},{"index":5,"key":"hora"}]'::jsonb),
  (null, 'reserva_rechazada', 'es_MX', 'UTILITY', 'draft',
   '{"components":[{"type":"BODY","text":"Hola {{1}}. Lamentamos avisarte que no pudimos tomar tu reservación en {{2}} para el {{3}} a las {{4}}. ¿Buscamos otro horario?"}]}'::jsonb,
   '[{"index":1,"key":"nombre"},{"index":2,"key":"restaurante"},{"index":3,"key":"fecha"},{"index":4,"key":"hora"}]'::jsonb),
  (null, 'recordatorio_reserva_24h', 'es_MX', 'UTILITY', 'draft',
   '{"components":[{"type":"BODY","text":"¡Hola {{1}}! Te recordamos tu reservación en {{2}} mañana {{3}} a las {{4}} para {{5}} personas. Si no puedes venir, avísanos."}]}'::jsonb,
   '[{"index":1,"key":"nombre"},{"index":2,"key":"restaurante"},{"index":3,"key":"fecha"},{"index":4,"key":"hora"},{"index":5,"key":"personas"}]'::jsonb)
on conflict (name, language) where tenant_id is null do nothing;
