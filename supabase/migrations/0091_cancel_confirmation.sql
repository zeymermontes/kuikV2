-- A guest cancelling over WhatsApp: either it lands at once, or it becomes a
-- request a host confirms from the door. The restaurant chooses.
alter table tenant_contact
  add column if not exists reservation_cancel_confirm boolean not null default false;
comment on column tenant_contact.reservation_cancel_confirm is
  'When true, a cancellation asked over WhatsApp waits for a host to cancel it; the booking keeps its table until then.';

alter table reservations
  add column if not exists cancel_requested_at timestamptz;
comment on column reservations.cancel_requested_at is
  'The guest asked to cancel and the restaurant has not decided yet; cleared when the booking moves or is kept.';

create index if not exists reservations_cancel_requested_idx
  on reservations (tenant_id, starts_at)
  where cancel_requested_at is not null;
