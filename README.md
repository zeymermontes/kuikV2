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
| POS terminal, KDS, customer screen | [components/pos/](components/pos/), [lib/pos/](lib/pos/) |
| Printing: document model, routing, agent API | [lib/pos/print-doc.ts](lib/pos/print-doc.ts), [lib/pos/printing.ts](lib/pos/printing.ts), [app/api/print/](app/api/print/) |
| Print agent (Go, runs in the restaurant) | [print-agent/](print-agent/) |

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

## POS printing

How a kitchen ticket, a receipt or a cash-drawer pulse gets from the POS to a
thermal printer, and everything that has to be in place for it. The short
version: a browser cannot talk to a receipt printer, so a small **agent**
installed on one computer in the restaurant does it on the POS's behalf.

### How it works

```
                 ┌──────────────────────────────┐
  POS on the     │ 1. same machine?             │  http://127.0.0.1:9123
  register PC ───┤    hand the document to the  ├───────────────────────► agent ─► printer
                 │    agent over loopback       │   (works with the internet down)
                 └──────────────────────────────┘
  POS on an      ┌──────────────────────────────┐
  iPad / phone ──┤ 2. otherwise: append a row   ├─► print_jobs (Supabase) ─► agent polls ─► printer
                 │    to the cloud queue        │
                 └──────────────────────────────┘
                 ┌──────────────────────────────┐
  No printer     │ 3. browser print dialog,     │
  configured  ───┤    only when someone tapped  ├─► window.print()
                 │    "Imprimir"                │
                 └──────────────────────────────┘
```

- The POS never renders ESC/POS. It builds a **PrintDoc** — lines, two-column
  rows, rules, feeds, a cut, a drawer flag — in
  [lib/pos/print-doc.ts](lib/pos/print-doc.ts). The agent turns that into
  ESC/POS for the paper width of the target printer; the browser turns the same
  document into HTML for path 3. One layout, two outputs, one set of tests.
- Path 1 vs 2 is decided per printer: each printer belongs to an agent, and the
  POS probes `127.0.0.1:9123/status` once (cached 30 s). If the agent answering
  there is the printer's agent, the document goes straight to it. Otherwise it
  becomes a `print_jobs` row that travels through the POS's offline outbox like
  a tab or a payment, and the agent that owns the printer claims it on its next
  poll (a 20-second long poll, so a ticket lands about a second after the fire).
- Routing by role: a printer prints **receipts**, **kitchen tickets**,
  **reports**, or any mix. A kitchen printer with no stations takes every
  station; one listing `Barra` takes only Barra tickets, and then the catch-all
  printers no longer see Barra. Stations come from the menu's categories
  (`category.station`, else the category name).
- Failures come back: the agent reports `done` or `failed` with a reason
  ("cannot reach 192.168.1.50:9100"). Queued jobs are retried three times, then
  stay `failed`, and the terminal's bell shows them with a retry button.

### What prints, and when

| Moment | What | Condition |
| --- | --- | --- |
| **Enviar a cocina** | one kitchen ticket per station, `copies` times | *Imprimir la comanda al enviar a cocina* is on (default) |
| Payment closes the sale | receipt, drawer pulse on the same job | *Ticket al cobrar* = Siempre; drawer if cash and *Abrir el cajón* is on |
| Payment closes the sale, cash | drawer pulse alone | *Ticket al cobrar* = Preguntar or Nunca, *Abrir el cajón* on |
| "Imprimir ticket" / "Recibo" button | receipt | *Ticket al cobrar* ≠ Nunca (Nunca hides the buttons) |
| Historial → reprint | receipt | always offered |
| Caja → Imprimir corte | Z report | goes to a `report` printer, else the receipt printer |
| KDS → printer icon on a ticket | kitchen ticket | falls back to the browser dialog if no kitchen printer |
| Pedidos → Impresión → Probar | test page | shows the result inline within ~20 s |

Receipt contents: restaurant name, table / customer, date, lines with options,
subtotal + discount + tip when present, total, each payment, change, the
configurable footer (RFC, address…) and a thank-you.

### Setup, step by step

**A. Once per deployment**

1. Apply [supabase/migrations/0065_print_queue.sql](supabase/migrations/0065_print_queue.sql).
   It creates `print_agents`, `printers`, `print_jobs`, the four printing
   columns on `tenant_ordering`, and the Realtime policies for the remote
   customer screen. Until it is applied the POS works but sees no printers.
2. Build the agent binaries and host them somewhere public:
   ```
   cd print-agent && ./build.sh      # → dist/kuik-print-agent-<os>-<arch>
   ```
   Put the download page URL in `NEXT_PUBLIC_PRINT_AGENT_URL` (Render env). The
   dashboard shows it as a link when a manager creates an agent; leave it empty
   and the link is simply not shown.
3. Nothing else server-side: the agent talks to the existing web service at
   `/api/print/agent/*` with its own bearer token.

**B. Once per restaurant** (a manager, in the dashboard)

1. **Pedidos → Impresión → Agregar agente.** Name it after the machine
   ("Caja principal"). Copy the token — it is shown once; only its hash is stored.
2. On that machine, download the binary and run it once with the token:
   ```
   kuik-print-agent --token kpa_...
   ```
   It saves the token and starts polling. The agent row turns green in the
   dashboard within a few seconds. Then make it start with the computer
   (Task Scheduler / launchd / systemd — recipes in
   [print-agent/README.md](print-agent/README.md)).
3. **Agregar impresora**, one per physical printer:
   - *Conexión* **Red (IP)** for Ethernet/Wi-Fi printers — enter the IP
     (`192.168.1.50`; port 9100 is implied). Pin the IP in the router.
   - *Conexión* **USB / del sistema** for USB or Bluetooth — install the
     printer in the OS first, then enter its exact name as Windows/CUPS shows it.
   - *Agente*: the agent on the machine that can reach this printer.
   - *Papel*: 58 mm (32 columns) or 80 mm (48 columns).
   - *Qué imprime*: receipts / kitchen tickets / reports; pick stations for a
     kitchen printer if it should not take every one.
   - *Tiene cajón*: the drawer is plugged into this printer's DK port.
   - *Copias*: 1–3 (kitchens often want 2).
4. Press **Probar**. A page with the printer name and accented text should
   come out. "el agente no respondió" means the agent is not running or
   offline; a reason like *cannot reach 192.168…* means the printer is off or on
   a different network than the agent.
5. Set the behaviour block: ticket at payment (Preguntar / Siempre / Nunca),
   kitchen ticket on fire, drawer on cash, and the receipt footer.

**C. Once per register device**

- **Windows all-in-one with printer and drawer:** run the agent on that same
  PC. The first time the POS prints, Chrome asks once to allow access to the
  local network — allow it. From then on receipts and the drawer work even
  with the internet down; kitchen tickets queue and print when it returns.
- **iPad / phone / any other device:** nothing to install; it prints through
  the queue to whichever agent owns the printer, as long as the device is online.
- **Customer screen on another device:** in the POS, *Pantalla del cliente →
  En otro equipo* shows a QR / link (`/pos/customer?screen=<caja>`). Open it on
  the second device signed in as staff. Several registers: give each one a
  name in that same dialog; the screen follows the register whose name is in
  its URL.

### Trying it without a printer

- **Fake printer:** anything that accepts a TCP connection on 9100 works as a
  network printer for testing — `nc -l 9100 | xxd` on a Mac, or the Python sink in
  the agent's smoke test. The dashboard "Probar" then reports *Impreso ✓*.
- **Agent against a dev server:**
  ```
  cd print-agent
  GOTOOLCHAIN=go1.23.12 go run . --token kpa_... --server http://localhost:3000
  ```
  (Go ≥ 1.22 is needed on recent macOS; older toolchains produce binaries the OS
  refuses to run.) Create the token from the local dashboard first.
- **Only the browser dialog:** with no printers configured, every "Imprimir"
  button opens the print window as before — the demo (`/pos?demo=1`) always
  behaves this way.
- **Tests:** `npm test` covers the document layout (rows, wrapping, receipt
  contents); `go test ./...` in `print-agent/` covers the ESC/POS renderer,
  code page and origin allow-list.

### Security notes

- Agent tokens are `kpa_` + 32 random bytes; the database keeps only the
  sha256. Deleting the agent row revokes it; the agent then logs
  *token rejected* and stops.
- The agent's local endpoint binds to `127.0.0.1` only and answers only pages
  served from `kuik.mx` (plus `localhost` for development). Anything else gets 403.
- `print_jobs` rows are readable and writable by the tenant's POS roles under
  RLS; the agent routes use the service role after the token check.
- The remote customer screen uses a **private** Realtime channel: policies on
  `realtime.messages` allow send/receive only to members who can operate the
  tenant's POS, so a guessed topic yields nothing.

## Helper skills

- `.claude/skills/run-local` — boot the app and open tenant subdomains.
- `.claude/skills/supabase-migration` — add a migration + RLS + regenerate types.
