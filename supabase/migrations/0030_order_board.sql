-- Kuik — order board
-- Track incoming (WhatsApp) orders through a simple kitchen workflow:
-- new → preparing → ready → done. Plus service type and table for context.

alter table orders
  add column status       text not null default 'new',
  add column service_type text,
  add column table_label  text;

create index if not exists orders_status_idx on orders (tenant_id, status, created_at desc);

-- Staff (any member) can advance an order's status.
create policy orders_update on orders for update
  using (public.is_member(tenant_id) or public.is_super_admin())
  with check (public.is_member(tenant_id) or public.is_super_admin());
