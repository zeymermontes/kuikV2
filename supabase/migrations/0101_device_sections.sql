-- Kuik — which sections a shared device may open (0100 gave it a role only).
--
-- A role is a bundle: a host device got the door and the chats, a cashier
-- device got everything. A restaurant wants the tablet at the door to see the
-- orders too, or the kitchen screen to open nothing but the kitchen. The
-- owner now ticks the sections one by one.
--
-- Null = every section the device's role covers, which is what devices linked
-- before this column have. The role is still what the policies check; the
-- server sets it to the smallest one that covers the sections ticked
-- (lib/devices/sections.ts), and the hub and the pages keep the device to
-- its sections within that.

alter table tenant_devices
  add column if not exists sections text[]
    check (sections is null or sections <@ array['host', 'chats', 'orders', 'pos', 'kds']::text[]);
