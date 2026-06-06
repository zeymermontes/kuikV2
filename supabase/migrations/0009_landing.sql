-- Kuik — per-restaurant landing (home screen)
-- When enabled, visiting the restaurant's root shows a landing (hero, featured
-- products, quick actions, rating) with a button into the menu — instead of the
-- menu directly. Inspired by SeisDos-style restaurant home pages.

create table tenant_landing (
  tenant_id            uuid primary key references tenants on delete cascade,
  enabled              boolean not null default false,
  welcome_title        text,                    -- "Bienvenidos a ..."
  tagline              text,                    -- "Cocina urbana — ¡Ordene ahora!"
  featured_product_ids jsonb not null default '[]',  -- string[] product ids ("lo más pedido")
  show_rating          boolean not null default false,
  rating               numeric(2,1),            -- e.g. 4.9
  reviews_url          text,                    -- Google reviews link
  wifi_password        text,                    -- shown with a copy button
  updated_at           timestamptz not null default now()
);

alter table tenant_landing enable row level security;

create policy tenant_landing_owner_all on tenant_landing for all
  using (public.owns_tenant(tenant_id) or public.is_super_admin())
  with check (public.owns_tenant(tenant_id) or public.is_super_admin());

-- Provision a landing row for every existing and future tenant.
insert into tenant_landing (tenant_id)
  select id from tenants on conflict (tenant_id) do nothing;

create or replace function public.handle_new_tenant()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.tenant_theme    (tenant_id) values (new.id);
  insert into public.tenant_contact  (tenant_id) values (new.id);
  insert into public.tenant_ordering (tenant_id) values (new.id);
  insert into public.tenant_landing  (tenant_id) values (new.id);
  insert into public.subscriptions   (tenant_id, status, trial_ends_at)
    values (new.id, 'trialing', now() + interval '30 days');
  return new;
end;
$$;
