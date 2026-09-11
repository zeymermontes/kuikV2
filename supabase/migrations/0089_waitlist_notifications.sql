-- Kuik — two more notes to the diner from the door
--
-- "You're on the waitlist, about N minutes" when the host registers a
-- walk-in, and "your table is ready" when it is. Same outbox, same
-- idempotency (one row per reservation and kind; "notify again" rewrites it).

alter table reservation_notifications drop constraint if exists reservation_notifications_kind_check;
alter table reservation_notifications
  add constraint reservation_notifications_kind_check
  check (kind in ('confirmed', 'cancelled', 'reminder_24h', 'waitlist', 'table_ready'));
