-- Kuik — web push subscriptions
--
-- So a hostess learns about a booking without watching a tab. The realtime
-- board is still the primary channel; push is the nudge that gets her to look.
--
-- Scoping note: a browser holds exactly ONE push subscription per service
-- worker registration, but a person can work at several restaurants. So the row
-- is keyed by (tenant_id, endpoint) and the same keys are reused across
-- tenants. A dead endpoint is dead everywhere, which is why cleanup deletes by
-- endpoint alone.

create table if not exists push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  endpoint     text not null,
  p256dh       text not null,
  auth         text not null,
  -- Stored so the payload can be localised at send time without joining
  -- profiles (whose RLS is self-only, so a send job could not read it anyway).
  locale       text not null default 'es',
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  failed_at    timestamptz,
  unique (tenant_id, endpoint)
);

create index if not exists push_subs_tenant_idx   on push_subscriptions (tenant_id);
create index if not exists push_subs_endpoint_idx on push_subscriptions (endpoint);

alter table push_subscriptions enable row level security;

-- A person manages only their own subscriptions, and only for a tenant they
-- actually belong to. Who RECEIVES a push is decided at send time by joining
-- tenant_members on role, so demoting someone stops their pushes without
-- touching this table.
do $$ begin
  if not exists (select 1 from pg_policies
    where tablename = 'push_subscriptions' and policyname = 'push_subs_self') then
    create policy push_subs_self on push_subscriptions for all
      using (user_id = auth.uid() and public.is_member(tenant_id))
      with check (user_id = auth.uid() and public.is_member(tenant_id));
  end if;
end $$;
