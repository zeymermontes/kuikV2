-- Kuik — native push tokens (the phone app, native/mobile)
--
-- The dashboard's web push (0046) cannot reach a page inside a native
-- WebView, so the Kuik app registers an FCM token instead: one row per
-- device and tenant. Who RECEIVES a push is still decided at send time by
-- joining tenant_members on role (lib/push/send.ts), exactly as for web push,
-- so this table only says where a person's devices are.

create table if not exists device_push_tokens (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  -- The FCM registration token (Android and, through Firebase's APNs relay, iOS).
  token        text not null,
  platform     text not null check (platform in ('ios', 'android')),
  -- Which app registered it: 'kuik' (phone) or 'terminal' (tablet).
  app          text not null default 'kuik',
  locale       text not null default 'es',
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (tenant_id, token)
);
create index if not exists device_push_tokens_tenant_idx on device_push_tokens (tenant_id);
create index if not exists device_push_tokens_token_idx  on device_push_tokens (token);

alter table device_push_tokens enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies
    where tablename = 'device_push_tokens' and policyname = 'device_push_tokens_self') then
    create policy device_push_tokens_self on device_push_tokens for all
      using (user_id = auth.uid() and public.is_member(tenant_id))
      with check (user_id = auth.uid() and public.is_member(tenant_id));
  end if;
end $$;
