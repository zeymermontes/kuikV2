-- Who cancelled, and whether the floor has seen it. A guest cancelling over
-- WhatsApp shows in the host's bell until someone taps "got it", whichever
-- way the restaurant handles cancellations.
alter table reservations
  add column if not exists cancelled_by text check (cancelled_by in ('guest', 'staff')),
  add column if not exists cancel_seen_at timestamptz;
comment on column reservations.cancelled_by is 'guest = over WhatsApp by the diner; staff = from the board or the stand.';
comment on column reservations.cancel_seen_at is 'A staff member acknowledged a guest cancellation; null keeps it in the bell.';

create index if not exists reservations_guest_cancel_unseen_idx
  on reservations (tenant_id, starts_at)
  where status = 'cancelled' and cancelled_by = 'guest' and cancel_seen_at is null;
