-- One feed for "something needs a person": a new booking request, a guest
-- confirming or cancelling, a WhatsApp handoff, a flow's notify step. Each
-- event is a row here (Realtime → a chime and a toast in every open Kuik
-- screen) AND a push (lib/alerts.ts sends both). Bilingual columns because
-- each reader picks their own language at render time.
create table if not exists staff_alerts (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants on delete cascade,
  kind       text not null,
  -- Who should hear it; a screen filters by its own role.
  roles      text[] not null default '{owner,manager}',
  title_es   text not null,
  body_es    text not null,
  title_en   text not null,
  body_en    text not null,
  url        text,
  tag        text,
  created_at timestamptz not null default now()
);
create index if not exists staff_alerts_tenant_idx on staff_alerts (tenant_id, created_at desc);

alter table staff_alerts enable row level security;
drop policy if exists staff_alerts_member_select on staff_alerts;
create policy staff_alerts_member_select on staff_alerts for select using (public.is_member(tenant_id));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'staff_alerts'
  ) then
    alter publication supabase_realtime add table staff_alerts;
  end if;
end $$;
