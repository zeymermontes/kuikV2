# Kuik — Multi-tenant Digital Menu SaaS

Hosted, fully-customizable digital menus for restaurants. Each restaurant gets
`their-name.kuik.mx` (or a custom domain), customizes everything from an admin
panel, and takes orders through a pre-filled **WhatsApp** message.

- **Stack:** Next.js 16 (App Router) · Supabase (Postgres + Auth + Storage + RLS)
  · MercadoPago subscriptions · next-intl (es/en) · Tailwind v4 · Render hosting.
- **Audiences:** diners (public menu) · restaurant owners (admin) · you (super-admin).

## Features

- Menu with categories, products (optional image **and** optional price, per-product
  price toggle), **separators** (line / space / title) and per-section **banners**.
- Full theme customization: colors, fonts, logo, background image, global price toggle.
- Order via WhatsApp: floating cart → `wa.me` deep link with the full order.
- Most-visited-products dashboard + WhatsApp-order counts.
- MercadoPago subscriptions with a **30-day free trial**; daily cron reconciles trials.
- Super-admin console: every tenant, owner, payment status; **award free months**.
- Custom domains via the Render API, with DNS instructions + verification.
- Subdomain multi-tenancy with Postgres RLS isolation.

## Local setup

1. **Install:** `npm install`
2. **Create a Supabase project**, then run the migrations (SQL editor or CLI):
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_analytics.sql`
3. **Env:** copy `.env.example` → `.env.local` and fill in Supabase + MercadoPago keys.
   Keep `NEXT_PUBLIC_ROOT_DOMAIN=localhost:3000` for dev.
4. **Run:** `npm run dev`
   - Dashboard / marketing: http://localhost:3000
   - A tenant menu: http://`<subdomain>`.localhost:3000 (browsers resolve `*.localhost`).
5. **Become super-admin:** sign up once, then run `supabase/set_super_admin.sql`
   (with your email) in the Supabase SQL editor.

## Architecture

| Concern | Where |
| --- | --- |
| Tenant routing (subdomain / custom domain) | [proxy.ts](proxy.ts) |
| Tenant + menu loaders (service-role) | [lib/tenant.ts](lib/tenant.ts) |
| Auth / tenant context guards | [lib/auth.ts](lib/auth.ts) |
| Supabase clients (browser/server/admin) | [lib/supabase/](lib/supabase/) |
| Public menu UI | [components/menu/](components/menu/) |
| Admin panel | [app/(dashboard)/](app/\(dashboard\)/), [components/dashboard/](components/dashboard/) |
| WhatsApp message builder | [lib/whatsapp.ts](lib/whatsapp.ts) |
| Billing (MercadoPago) | [lib/mercadopago.ts](lib/mercadopago.ts), [app/api/webhooks/mercadopago/](app/api/webhooks/mercadopago/) |
| Custom domains (Render API) | [lib/render.ts](lib/render.ts) |
| Schema + RLS | [supabase/migrations/](supabase/migrations/) |

**Data isolation:** every tenant-scoped table carries `tenant_id` and is protected
by RLS (`owns_tenant()` / `is_super_admin()` helpers). The public menu is read
server-side with the service-role key, so anonymous visitors never touch RLS.

## Deploy (Render)

1. Push to GitHub and create a **Blueprint** from [render.yaml](render.yaml).
2. Set the secret env vars (Supabase, MercadoPago, `CRON_SECRET`, Render API) in the
   Render dashboard.
3. Point a wildcard DNS record `*.kuik.mx` (and `app.kuik.mx`) at the Render service.
4. Configure the MercadoPago webhook to
   `https://app.kuik.mx/api/webhooks/mercadopago?secret=$MERCADOPAGO_WEBHOOK_SECRET`.
5. The `kuik-expire-trials` cron hits `/api/cron/expire-trials` daily.

## Helper skills

- `.claude/skills/run-local` — boot the app and open tenant subdomains.
- `.claude/skills/supabase-migration` — add a migration + RLS + regenerate types.
