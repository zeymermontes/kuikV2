---
name: run-local
description: Boot the Kuik Next.js dev server and open tenant subdomains locally. Use when the user wants to run the app, preview a tenant menu, or test multi-tenant routing on *.localhost.
---

# Run Kuik locally

Kuik is a multi-tenant Next.js app. Tenants are served on subdomains; in dev these
are `<subdomain>.localhost:3000`, which browsers resolve to 127.0.0.1 automatically
(no `/etc/hosts` edits needed for `*.localhost`).

## Steps

1. **Check env.** Ensure `.env.local` exists with real Supabase + MercadoPago keys.
   If it only has placeholders, the DB-backed pages will error — tell the user to
   fill it from `.env.example`.

2. **Start the dev server** (background so you can keep working):
   ```bash
   npm run dev
   ```
   Wait for `Ready` / the `localhost:3000` line in the output.

3. **Open the right host:**
   - Marketing + dashboard: `http://localhost:3000` (login, `/dashboard`, `/menu`, …)
   - A tenant's public menu: `http://<subdomain>.localhost:3000`
     (e.g. `http://tacos.localhost:3000` after creating a tenant with subdomain `tacos`).

4. **Verify multi-tenancy:** create two tenants via onboarding, confirm each
   subdomain renders its own themed menu and that one tenant cannot see another's
   data (RLS).

## Notes
- `NEXT_PUBLIC_ROOT_DOMAIN` must be `localhost:3000` in dev for subdomain
  resolution in `middleware.ts` to work.
- The first request to a Google-font-themed menu fetches the font over the network.
- Product views/orders are logged via `/api/track/[tenantId]` and `/api/order/[tenantId]`.
