-- Kuik — outbound notifications for reservations
--
-- One outbox for "your table is confirmed", "we couldn't take it", and the
-- reminder the day before.
--
-- The whole idempotency story is `unique (reservation_id, kind)`. The reminder
-- cron claims work with `insert ... on conflict do nothing returning id` and
-- only acts on rows it actually won, which makes two overlapping runs, a
-- retried curl, a manual re-trigger and a redeploy mid-run all harmless.
--
-- It is also the queue the WhatsApp Cloud API worker will drain later: `channel`
-- and `provider_id` are already here, so turning manual sends into automatic
-- ones changes lib/notify/index.ts and nothing else.

create table if not exists reservation_notifications (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants on delete cascade,
  reservation_id uuid not null references reservations on delete cascade,
  kind           text not null check (kind in ('confirmed', 'cancelled', 'reminder_24h')),
  channel        text not null default 'manual_wa'
                   check (channel in ('manual_wa', 'whatsapp_api', 'none')),
  status         text not null default 'queued'
                   check (status in ('queued', 'sent', 'failed', 'skipped')),
  -- The rendered message, stored so the staff button and a later automatic
  -- send say exactly the same thing.
  body           text,
  provider_id    text,
  error          text,
  created_at     timestamptz not null default now(),
  sent_at        timestamptz,
  unique (reservation_id, kind)
);

create index if not exists resnotif_pending_idx
  on reservation_notifications (tenant_id, status, created_at)
  where status = 'queued';

alter table reservation_notifications enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies
    where tablename = 'reservation_notifications' and policyname = 'resnotif_manage') then
    create policy resnotif_manage on reservation_notifications for all
      using (public.can_manage_reservations(tenant_id) or public.is_super_admin())
      with check (public.can_manage_reservations(tenant_id) or public.is_super_admin());
  end if;
end $$;

-- Claim the reminders due in a one-hour window, atomically.
--
-- Hourly with a one-hour window means every booking falls in exactly one
-- window whatever its HH:MM — a daily job cannot do "24 hours before" for
-- arbitrary times. The arithmetic is pure UTC because reservations.starts_at is
-- a real timestamptz maintained from the tenant's timezone (0044); that is the
-- payoff for the trigger there.
create or replace function public.claim_due_reminders(p_channel text default 'manual_wa')
returns table (
  notification_id uuid,
  reservation_id  uuid,
  tenant_id       uuid,
  customer_name   text,
  phone           text,
  party_size      int,
  "date"          date,
  "time"          text,
  tenant_name     text,
  tenant_locale   text
)
language sql
security definer
set search_path = public
as $$
  with due as (
    select r.id, r.tenant_id
      from reservations r
     where r.status in ('pending', 'confirmed')
       and r.phone is not null
       and r.starts_at >= now() + interval '24 hours'
       and r.starts_at <  now() + interval '25 hours'
  ),
  claimed as (
    insert into reservation_notifications (tenant_id, reservation_id, kind, channel, status)
    select d.tenant_id, d.id, 'reminder_24h', p_channel, 'queued' from due d
    on conflict (reservation_id, kind) do nothing
    returning id, reservation_id, tenant_id
  )
  select c.id, c.reservation_id, c.tenant_id, r.customer_name, r.phone, r.party_size,
         r.date, r."time", t.name, t.locale
    from claimed c
    join reservations r on r.id = c.reservation_id
    join tenants t on t.id = c.tenant_id;
$$;

revoke execute on function public.claim_due_reminders(text) from anon, authenticated;
