-- Kuik — the 'host' (anfitrión) role
--
-- A hostess works the door: she needs the reservation book and the menu, and
-- nothing else. Adding her to the existing roles is not enough on its own,
-- because most staff-facing policies are written against `is_member()` — which
-- would hand a new role the night's revenue, the billing amount, the analytics
-- and every diner's phone number.
--
-- So this migration does two things: add the role, and narrow the four places
-- where "any member" was too generous. Narrowing changes behaviour for roles
-- that exist TODAY as well; that is deliberate, and the same fix that stops a
-- cashier reaching /reports (see the requireManager allow-list in lib/auth.ts).

alter type member_role add value if not exists 'host';

-- ── Reservations: now explicit rather than "anyone on staff" ────────────────
drop policy if exists reservations_manage on reservations;
create policy reservations_manage on reservations for all
  using (public.can_manage_reservations(tenant_id) or public.is_super_admin())
  with check (public.can_manage_reservations(tenant_id) or public.is_super_admin());

-- ── Sales and analytics: not the door staff's business ─────────────────────
drop policy if exists orders_read on orders;
create policy orders_read on orders for select
  using (public.can_view_sales(tenant_id) or public.is_super_admin());

drop policy if exists orders_update on orders;
create policy orders_update on orders for update
  using (public.can_view_sales(tenant_id) or public.is_super_admin())
  with check (public.can_view_sales(tenant_id) or public.is_super_admin());

drop policy if exists product_views_read on product_views;
create policy product_views_read on product_views for select
  using (public.can_view_sales(tenant_id) or public.is_super_admin());

-- What the restaurant pays Kuik is between the owner and their manager.
drop policy if exists subscriptions_read on subscriptions;
create policy subscriptions_read on subscriptions for select
  using (public.can_view_sales(tenant_id) or public.is_super_admin());

-- ── Loyalty holds diner names, phones and balances ─────────────────────────
-- Drop BOTH the old name and the new one: these files get pasted by hand and
-- must survive a second run, where only the new name is present.
drop policy if exists loyalty_customers_member_all on loyalty_customers;
drop policy if exists loyalty_customers_all on loyalty_customers;
create policy loyalty_customers_all on loyalty_customers for all
  using (public.can_use_loyalty(tenant_id) or public.is_super_admin())
  with check (public.can_use_loyalty(tenant_id) or public.is_super_admin());

drop policy if exists loyalty_events_member_all on loyalty_events;
drop policy if exists loyalty_events_all on loyalty_events;
create policy loyalty_events_all on loyalty_events for all
  using (public.can_use_loyalty(tenant_id) or public.is_super_admin())
  with check (public.can_use_loyalty(tenant_id) or public.is_super_admin());

-- ── Menu availability ──────────────────────────────────────────────────────
-- 0011 let ANY member flip a product's availability through this RPC, as a
-- deliberate escape hatch for waiters. A host has no reason to mark the
-- kitchen out of salmon, so narrow it to the roles that work service.
create or replace function public.set_product_availability(p_id uuid, p_available boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare t uuid;
begin
  select tenant_id into t from products where id = p_id;
  if t is null then
    raise exception 'Product not found';
  end if;
  if not (
    exists (
      select 1 from tenant_members
      where tenant_id = t and user_id = auth.uid()
        and role::text in ('owner', 'manager', 'cashier', 'waiter')
    ) or is_super_admin()
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update products set is_available = p_available where id = p_id;
end $$;
