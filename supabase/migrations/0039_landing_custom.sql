-- Kuik — custom (bring-your-own-HTML) landing pages
-- A super-admin can upload a self-contained static site (index.html + JS +
-- assets) for a tenant as an EXTRA, more complex alternative to the built-in
-- template landing. It does not replace the owner's setup; the two coexist.
--
-- landing_mode is the super-admin's home-screen selector (what shows when a
-- visitor scans the QR / hits the tenant root):
--   'builder' (default) → defer to the owner: their template landing if they
--                          enabled it (tenant_landing.enabled), else the menu.
--   'custom'            → the uploaded static site (only valid once uploaded).
--   'none'              → force straight to the menu, no landing.
--
-- A 'custom' site renders inside a SANDBOXED iframe served from Supabase
-- Storage (a separate origin). Because the sandbox omits allow-same-origin, the
-- tenant's JS runs in an opaque origin and can never reach the menu app's
-- session, cookies, or ordering APIs.
--
-- Files live in the public `media` bucket under <tenant>/landing-site/...
-- custom_entry is the storage path of the entry document (index.html).

alter table tenant_landing
  add column landing_mode text not null default 'builder'
    check (landing_mode in ('builder', 'custom', 'none')),
  add column custom_entry text;

-- RLS: the existing `tenant_landing_owner_all` policy is `for all` gated on
-- public.owns_tenant(tenant_id) OR public.is_super_admin(), so it already
-- covers the new columns. No new policy needed.
