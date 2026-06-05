---
name: supabase-migration
description: Create a new Supabase SQL migration for Kuik with matching RLS policies and regenerate TypeScript types. Use when adding or changing a database table/column/policy.
---

# Add a Supabase migration (Kuik)

Migrations live in `supabase/migrations/NNNN_name.sql` and are applied in order.
Kuik is multi-tenant: **every tenant-scoped table must follow the same pattern**.

## Checklist for a new tenant-scoped table

1. **Create the migration file** with the next sequence number:
   `supabase/migrations/0003_<name>.sql` (current highest is in that folder).

2. **Table requirements:**
   - `id uuid primary key default gen_random_uuid()` (or identity for log tables)
   - `tenant_id uuid not null references tenants on delete cascade`
   - An index on `(tenant_id, …)` for the common query.

3. **Enable RLS + the standard owner-or-super-admin policy:**
   ```sql
   alter table <name> enable row level security;
   create policy <name>_owner_all on <name> for all
     using (public.owns_tenant(tenant_id) or public.is_super_admin())
     with check (public.owns_tenant(tenant_id) or public.is_super_admin());
   ```
   Reuse the helpers `public.owns_tenant(uuid)` and `public.is_super_admin()` from
   `0001_init.sql` — do not re-implement ownership checks inline.

4. **Public reads** (the menu) go through the service-role client in
   `lib/tenant.ts`, which bypasses RLS — so you usually do NOT add anon policies.

5. **Apply it** to the linked project:
   ```bash
   supabase db push          # or: psql "$DATABASE_URL" -f supabase/migrations/0003_<name>.sql
   ```

6. **Regenerate types** and reconcile with the hand-written file:
   ```bash
   supabase gen types typescript --linked > lib/database.types.generated.ts
   ```
   Then mirror the new interface into `lib/database.types.ts` (the app imports from
   the hand-maintained file; keep them in sync).

## When changing analytics
RPCs used by the dashboard live in `0002_analytics.sql` (`top_products`,
`tenant_stats`, `admin_tenant_overview`). Add new RPCs as `security invoker` unless
they must read across tenants, in which case use `security definer` + an explicit
`is_super_admin()` guard (see `admin_tenant_overview`).
