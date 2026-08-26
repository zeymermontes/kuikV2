-- Kuik — bot settings and canned replies
--
-- Business hours are NOT duplicated here: tenant_contact.hours already exists,
-- lib/hours.ts already parses it and HoursEditor already edits it. The only
-- thing that was missing was reading it in the tenant's timezone, fixed in 0043.

create table if not exists whatsapp_settings (
  tenant_id                uuid primary key references tenants on delete cascade,
  enabled                  boolean not null default false,  -- subsystem on
  bot_enabled              boolean not null default false,  -- auto-replies on
  ai_enabled               boolean not null default false,  -- AI on top of flows
  away_enabled             boolean not null default true,
  handoff_keywords         text[] not null default '{humano,asesor,persona,operador,agente}',
  optout_keywords          text[] not null default '{baja,stop,cancelar suscripcion}',
  -- Don't greet the same person again within this many seconds.
  greet_cooldown_seconds   int not null default 21600,
  -- Caps that protect both the AI bill and the number's quality rating, which
  -- is the asset that cannot be bought back.
  max_bot_replies_per_hour int not null default 20,
  max_bot_replies_per_day  int not null default 60,
  business_hours_source    text not null default 'contact'
                             check (business_hours_source in ('contact', 'branch', 'custom')),
  custom_hours             jsonb,
  updated_at               timestamptz not null default now()
);

create table if not exists whatsapp_canned_replies (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  -- greeting | away | fallback | handoff | optout_ack | closed_today | custom_*
  key       text not null,
  locale    text not null default 'es',
  body      text not null,
  enabled   boolean not null default true,
  position  int not null default 0,
  unique (tenant_id, key, locale)
);

do $$
declare tbl text;
begin
  foreach tbl in array array['whatsapp_settings', 'whatsapp_canned_replies'] loop
    execute format('alter table %I enable row level security', tbl);
    execute format('drop policy if exists %1$s_read on %1$s', tbl);
    execute format('drop policy if exists %1$s_write on %1$s', tbl);
    execute format($f$
      create policy %1$s_read on %1$s for select
        using (public.is_member(tenant_id) or public.is_super_admin());
    $f$, tbl);
    execute format($f$
      create policy %1$s_write on %1$s for all
        using (public.can_manage_menu(tenant_id) or public.is_super_admin())
        with check (public.can_manage_menu(tenant_id) or public.is_super_admin());
    $f$, tbl);
  end loop;
end $$;
