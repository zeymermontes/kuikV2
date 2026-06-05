-- Platform-wide settings (the SaaS subscription price restaurants pay Kuik).
-- Single row (id = 1). Editable only by super-admin; read server-side via the
-- service-role client (marketing landing + billing), so no public/anon policy.

create table platform_settings (
  id            int primary key default 1 check (id = 1),
  plan_amount   numeric(10,2) not null default 199,
  plan_currency text not null default 'MXN',
  plan_name     text not null default 'Kuik Pro',
  updated_at    timestamptz not null default now()
);

insert into platform_settings (id) values (1) on conflict (id) do nothing;

alter table platform_settings enable row level security;

create policy platform_settings_super_all on platform_settings for all
  using (public.is_super_admin())
  with check (public.is_super_admin());
