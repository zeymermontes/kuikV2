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

## POS on several devices

Every tablet, computer or phone runs the same terminal on its own local store
(Dexie) and syncs through Supabase Realtime; a table opened on a waiter's
tablet shows up at the register at once, and a device that loses the network
keeps working and merges when it is back (last write wins per row). Staff
sign in with their own accounts; tabs record who served them.

Each device is a **register** (named under Caja → "Esta caja"; the customer
screen follows the same name). A cash shift belongs to a register
(`register_shifts.register`, 0071): caja and barra each open their own float,
take their own payments and print their own Z report, and the Caja view lists
the other registers that are open. Shifts from before this column belong to
the default register.

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

## The order board is opt-in

A restaurant that only takes orders on WhatsApp needs no board: its orders
are not stored at all (`app/api/order` returns before the insert) and it
only sees *Pedidos* as an off-state page. An owner or manager turns the
board on right there, or under *Cómo se ordena → Tablero de pedidos*
(`tenant_ordering.orders_board`, migration 0085, `lib/orders/board.ts`); it is
off for new restaurants. With it on: WhatsApp orders are
stored, *Pedidos* appears in the sidebar and as a tile on the apps' hub, and
a chime plus a toast announce each new order on the register, the kitchen
screen, the host stand and the hub (`components/orders/NewOrderAlert.tsx`).
On the board an order can be **rejected** (status `rejected`, with a reason
the bot sends the guest, or a one-tap WhatsApp message without a bot) or
**edited** (quantities, dropped lines, a note, the total; unpaid orders only,
`lib/orders/edit.ts` keeps delivery, tip or discount from the original total).
Paid online orders always create their row, board or not.

## Online payment for menu orders

The cart can take the money before the order reaches the restaurant. The
guest picks **Pagar en línea**, pays on the gateway's hosted page (card, OXXO,
SPEI), lands back on the menu, and sends the WhatsApp message already marked
*pagado*. The restaurant sees the order turn green on the order board and a
kitchen ticket appears on the KDS.

```
cart ──POST /api/order (pay) ──► order row (pending) + gateway checkout ──► guest pays
                                                                              │
menu ◄── ?pedido=<id>&pago=ok ── success_url                    webhook ◄─────┘
  │                                                                │
  └── PaidSheet polls GET /api/order?id ──► "Pagado" + WhatsApp   └─► orders.payment_status = paid
        order #, lines, QR → /recibo/<id>                              kitchen_tickets (per station)
```

**The guest comes back where they were.** The cart sends the path it is on
(`/` or `/menu`, depending on whether the restaurant has a landing page) and
the gateway redirects there; [lib/payments/return-path.ts](lib/payments/return-path.ts)
only accepts a plain path on our host. Should an old link land on the landing
page, it forwards the parameters to `/menu`.

**A paid order carries a phone.** The WhatsApp message may never follow a
paid order, so the cart requires the guest's number when paying online
(`orders.customer_phone`, migration 0067) and the order board shows it as a
`wa.me` link. The confirmation shows the **order number** (first six hex
digits of the id, the same on the board), the lines, and a **QR** that opens
the public receipt at `<menu>/recibo/<id>` — what the guest shows at the
counter and what the counter can scan.

**Gateway-agnostic.** [lib/payments/types.ts](lib/payments/types.ts) defines
the four things a gateway must do: connect a restaurant's account, report its
status, create a checkout for an order, and translate a webhook into a
`PaymentEvent` (paid / failed / refunded / account). Everything else — the
order route, the webhook handler, the board, the cart — works off that. Two
implementations are registered in [lib/payments/index.ts](lib/payments/index.ts):
[stripe.ts](lib/payments/stripe.ts) and [mercadopago.ts](lib/payments/mercadopago.ts).
A restaurant connects one of them from *Pedidos → Formas de pago → Pagar con
tarjeta*.

**Mercado Pago (marketplace shape).** The restaurant signs in with its own
Mercado Pago account (OAuth, callback `/api/payments/mercadopago/callback`,
state = tenant id signed with the app secret); Kuik stores the seller's tokens
in `payment_accounts.credentials` (server only, refreshed a week before they
expire) and creates Checkout Pro preferences with them, with Kuik's cut as
`marketplace_fee`. Payment notifications arrive at
`/api/webhooks/mercadopago/payments?tenant=<id>`, are verified with the app's
webhook secret (`x-signature`), and the payment is read with that tenant's
token. Env: `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`,
`MERCADOPAGO_WEBHOOK_SIGNING_SECRET`; the redirect URL and the webhook URL
must be registered on the application (see `.env.example`).

**Clip (credentials shape).** No OAuth and no marketplace: the restaurant
creates a production application on dashboard.clip.mx and pastes its API key
and secret under *Pedidos → Formas de pago → Conectar con Clip*
(`connectClip` verifies the pair against Clip before storing it in
`payment_accounts.credentials`, migration 0084). Each order becomes a Clip
Checkout link (`POST /v2/checkout`, one hour, card / MSI / OXXO) whose
`metadata.external_reference` is the order id. Clip's notification
(`/api/webhooks/clip?tenant=<id>`) carries only the link id and no
signature, so the link is read back from Clip with the restaurant's own
credentials before anything is applied; the order route also asks Clip
directly while the guest waits on the confirmation, in case the
notification lags. Refunds name the receipt. Kuik's fee cannot be withheld
from a Clip payment; `applicationFee` is ignored there. Nothing to
configure on Kuik's side; `CLIP_DISABLED=1` hides the option.

**Customer view.** A super admin sees more than any customer: the dev-only
surfaces, the admin link, every plan's items. *Ver como cliente* in the
sidebar (cookie `kuik_customer_view`, `ctx.customerView`) strips their own
dashboard down to what an owner on that plan gets; a banner up top exits.
Support mode does the same on another restaurant.

**Money flow (Stripe Connect, direct charges).** The
restaurant is the merchant: it onboards on Stripe's hosted form from
*Pedidos → Formas de pago → Pago en línea*, pays Stripe's fee and receives the
payout. Kuik takes an application fee per payment, set by the super admin in
*Admin → Precios* (`platform_settings.payment_fee_percent`, default 0).

**Amounts are re-priced on the server** from the products table
([lib/payments/pricing.ts](lib/payments/pricing.ts)); the cart's numbers are
never charged. Option surcharges come from the cart but are floored at zero.

**How the restaurant is told** ([lib/orders/notify.ts](lib/orders/notify.ts),
settings in *Pedidos → Avisos de pedidos*, stored in `tenant_ordering.order_alerts`,
migration 0068). A WhatsApp order announces itself: the guest's message lands
on the restaurant's phone. A paid online order does not, so when the webhook
marks it paid Kuik fans it out over what the restaurant enabled:

| Channel | Needs | Default |
| --- | --- | --- |
| Web push to owner, manager, cashier (tap **Aceptar** right on it) | The app installed (`InstallPrompt`), VAPID keys | on |
| Chime, highlight and `(n)` in the tab title on the open order board | Nothing | on |
| Kitchen ticket(s) queued to the station printers | Printers + agent (Pro) | on |
| "Pedido en línea" slip on the receipt printer | Printers + agent (Pro) | off |
| WhatsApp to up to five team numbers | Linked-device bot (Pro) | numbers empty |
| Confirmation to the guest: paid, preparing, ready | Linked-device bot; otherwise the board offers a one-tap `wa.me` link | on |
| Escalation: push the whole team after N minutes unaccepted, WhatsApp the team at 2.5×N | `/api/cron/order-alerts` every 2 min (render.yaml) | 3 min |

The push's **Aceptar** action posts to `/api/orders/<id>/status` from the
service worker; the first status change stamps `orders.accepted_at`, which
stops the escalation. WhatsApp orders can also push (`whatsappOrders`), off
by default because the message already is the alert.

**Setup**

1. Apply [supabase/migrations/0066_online_payments.sql](supabase/migrations/0066_online_payments.sql)
   [0067_order_contact.sql](supabase/migrations/0067_order_contact.sql) and
   [0068_order_alerts.sql](supabase/migrations/0068_order_alerts.sql).
2. Stripe dashboard → Connect: enable Express accounts for Mexico. Copy the
   platform secret key to `STRIPE_SECRET_KEY`.
3. Stripe dashboard → Webhooks → add `https://app.kuik.mx/api/webhooks/stripe`
   with **Listen to events on Connected accounts** ticked, events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`,
   `charge.refunded`, `account.updated`. Copy the signing secret to
   `STRIPE_WEBHOOK_SECRET`.
4. Redeploy. Until both keys exist the *Pago en línea* option explains it is
   not configured instead of offering to connect.
5. Each restaurant: *Pedidos → Formas de pago*, turn on *Pago en línea*,
   *Conectar con Stripe*, finish the form, come back. The cart only offers the
   method once Stripe reports `charges_enabled`.

**Locally:** `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
gives a `whsec_` for `.env.local`; test cards work against a test-mode
platform key. `npm test` covers the pricing rules and the webhook translation
and signature check without touching Stripe.

## Plans

Two tiers and one add-on ([lib/plan.ts](lib/plan.ts), prices and names in
`platform_settings`, edited in *Admin → Precios*):

| | Sells | Gate |
| --- | --- | --- |
| **Menú** (`basic`) | menu, WhatsApp orders, online payment, reservations, design, reports | default |
| **Restaurante** (`pro`) | + host stand, WhatsApp bot, loyalty, custom domain, advanced reports | `isPro` / `canUse(plan, feature)` / `canUseHost(sub)` |
| **Sucursal** (per branch) | on either tier; 250/month on Menú, 499/month on Restaurante (`branch_amount_*`, 0082) | `lib/pricing.ts` |
| **Punto de venta** (add-on `pos`) | register, KDS, printing, customer screen; joins either tier | `canUsePos(sub)` / `canUse(plan, 'pos', addons)` |

The trial month has everything. Paid add-ons live in `subscriptions.addons`
(0069); the monthly MercadoPago charge is tier + add-ons + branches
(`monthlyAmount` in [lib/pricing.ts](lib/pricing.ts)), and changing tier or
add-ons starts a new preapproval after cancelling the one in force. Adding or
removing a branch only updates the amount of the preapproval in force. Kuik's cut of
online payments can be lower on Restaurante (`pro_payment_fee_percent`).
Extra restaurants on one account stay a separate line (`extra_amount`).

## Register operations (employees, customers, refunds, promotions)

Everything a register does beyond ringing up, each behind its own migration
and pulled into the POS's offline store where the device needs it:

- **Employees with PIN** (0072, [lib/employees.ts](lib/employees.ts)):
  *Equipo → Empleados de la caja*. With employees set up the terminal asks
  "¿Quién atiende?" by PIN; sales, payments and tickets carry `employee_id`.
  Roles carry default permissions (discount, void, shift, drawer, history,
  refund) with per-person overrides; an action the signed-in person may not
  take asks a manager's PIN (`useEmployee().authorize(perm)`). Clock in/out
  from the PIN screen (`time_entries`); optional lock after every sale;
  reports show hours, sales and tips per employee.
- **Customers at the register** (0073): the customer sheet finds a loyalty
  member by phone or name, shows visits and reward progress, redeems, or
  enrols. `tabs.loyalty_customer_id` + a trigger credit the stamp or points
  when the sale closes, once, even when it synced late.
- **Refunds** (0074): a refund is a `payments` row with a negative amount and
  `kind = 'refund'` in the current shift; history offers it by lines or
  amount with a reason, prints a slip, opens the drawer for cash. The Z
  report nets refunds; a refunded sale cannot be reopened. Online payments
  are returned through the gateway (`PaymentGateway.refund`) from the orders
  board by managers.
- **Promotions** (0075, [lib/promotions.ts](lib/promotions.ts)): percent,
  amount, 2x1; by order, category or product; days, hours, dates, minimum
  spend, coupon codes, channels (register / menu), stacking. One pure rule
  file runs in the POS (`recomputeTab`), in the cart and on the server that
  prices a paid order; `tabs.promo_discount` sits beside the manual discount.

## CFDI invoicing

[lib/cfdi](lib/cfdi) stamps CFDI 4.0 through Facturama's multi-issuer API:
one Kuik account (`FACTURAMA_USER/PASSWORD`, sandbox unless
`FACTURAMA_SANDBOX=false`), one CSD per restaurant uploaded from
*Facturación* and forwarded to the PAC (never stored). Concepts split IVA out
of the inclusive menu prices and spread discounts ([build.ts](lib/cfdi/build.ts));
folios come from `next_invoice_folio()`. Guests request their own CFDI from
the receipt (`/factura?o=<order>` or `?t=<sale>`, printed on tickets); the
manager issues by sale id, cancels, downloads PDF/XML and issues the day's
global CFDI to PÚBLICO EN GENERAL. Sales remember `invoice_id` so nothing is
invoiced twice. Not yet exercised against a real Facturama account: the
request/response shapes follow their public guides and need a sandbox run.

## Inventory

[lib/inventory.ts](lib/inventory.ts) + migration 0077. Ingredients (unit,
stock, minimum, last cost, supplier, `auto_86`), a recipe per product
(`product_ingredients`, edited in the product drawer, or one-tap simple
tracking that creates an ingredient of the product itself), purchase orders
received into stock, counts, waste and adjustments, all logged in
`stock_movements`. Triggers deduct when a register sale closes
(`tabs.stock_deducted_at`) or an online order is accepted
(`orders.stock_deducted_at`), via `move_stock()`, which also flips
`is_available` for `auto_86` ingredients. Product cost is refreshed from the
recipe (and on demand for every product from *Inventario*).

## Native apps

Three shells around this same web app, in [native/](native/): **Kuik
Terminal** (tablet: POS, kitchen, host stand, customer screen; prints straight
to network printers), **Kuik** (phone: the dashboard with native push) and
**Kuik Caja** (register PC: Electron with the print agent inside, customer
screen on the second display, kiosk mode). Each loads app.kuik.mx and adds a
token to the user agent; `lib/native/shell.ts` is where the web reads which
shell it is in. `/terminal` is the tablet app's start page: it asks once what
the device is and remembers it. Android builds are published to the public
`apps` bucket and offered at kuik.mx/apps (iOS shows "próximamente" until a
link exists); a shell older than the published version sees a banner. See
[native/README.md](native/README.md) for building, signing, publishing and
what each generated project carries.

## Landing page and live demos

The marketing page ([app/page.tsx](app/page.tsx)) sells the whole platform
and lets a visitor try it without an account:

- **Live device frames** ([components/landing/DeviceFrame.tsx](components/landing/DeviceFrame.tsx))
  embed real pages in a phone or tablet bezel, rendered at device size and
  scaled to fit. They mount when scrolled near and stay mounted, so a demo
  keeps its state when the visitor switches tabs.
- **Public demos** under `/demo/pos`, `/demo/kds`, `/demo/host` and
  `/demo/customer` run the real POS, kitchen and host screens in memory (the
  same `demo` mode the dashboard tutorials use). The register sells the first
  showcase restaurant's real menu ([lib/demo-menu.ts](lib/demo-menu.ts)) so it
  matches the phone beside it; the kitchen and host use the fixed demo
  restaurant in [lib/demo-tenant.ts](lib/demo-tenant.ts). No login, nothing
  is written; the pages are `noindex`.
- **Showcase restaurants** ([lib/showcase.ts](lib/showcase.ts)) are real
  tenants whose public menus are embedded live. Edit `SHOWCASE_SUBDOMAINS` to
  choose who appears; only list businesses that agreed to.
- Prices come from `platform_settings` as before; the feature lists are in
  the page.
- **Feature pages** `/menu-digital`, `/punto-de-venta`, `/reservaciones` and
  `/pedidos-whatsapp` ([lib/landing/features.ts](lib/landing/features.ts),
  rendered by [components/landing/FeaturePage.tsx](components/landing/FeaturePage.tsx))
  target what owners actually search for. Add a page by adding an entry and a
  thin `app/<slug>/page.tsx`; the footer and sitemap pick it up.

## Search engines (SEO)

Everything is in [lib/seo.ts](lib/seo.ts) (pure, tested in
[tests/seo.test.ts](tests/seo.test.ts)) plus two host-aware metadata routes:

- **robots.txt and sitemap.xml** ([app/robots.ts](app/robots.ts),
  [app/sitemap.ts](app/sitemap.ts)) read the `Host` header (the proxy leaves
  dotted paths alone). `kuik.mx` lists the landing and feature pages and
  blocks the dashboard, demos and auth screens; `app.kuik.mx` is closed to
  crawlers (its `/` duplicates the landing, canonicals point at `kuik.mx`);
  a restaurant host lists its home, `/menu` (only when a landing sits on `/`)
  and branches, blocks `/qr` and receipts, and is closed while unpublished.
- **www.kuik.mx** 308-redirects to the apex in `proxy.ts`.
- **JSON-LD**: the landing declares `Organization`, `WebSite`,
  `SoftwareApplication` (plans as monthly offers) and `FAQPage`; feature pages
  add `BreadcrumbList` and their own FAQ; every restaurant page carries a
  `Restaurant` with address, phone, hours, social links and the menu as
  `Menu → MenuSection → MenuItem` with prices (capped at 150 items).
- **Restaurant metadata** ([app/s/[tenant]/layout.tsx](app/s/[tenant]/layout.tsx)):
  `metadataBase` is the tenant's canonical origin (verified custom domain,
  else the subdomain), so a tenant on two hosts is one site to Google; title
  `Name · Menú`, a description built from tagline, address and what the
  visitor can do, cover photo as the share card. Pages set their canonical;
  `/qr` is `noindex` pointing at the menu, receipts are `noindex`.
- **"Menú creado con Kuik"** ([components/menu/MadeWithKuik.tsx](components/menu/MadeWithKuik.tsx))
  at the foot of every public menu and landing links to `/menu-digital` with
  UTM tags: one backlink per restaurant host.
- Set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` to verify Search Console by meta
  tag (DNS verification needs nothing).

## Helper skills

- `.claude/skills/run-local` — boot the app and open tenant subdomains.
- `.claude/skills/supabase-migration` — add a migration + RLS + regenerate types.

## Product photos without background

Uploading a product photo offers a cut-out preview (`components/dashboard/CutoutSheet.tsx`):
the photo with its background removed, a sensitivity slider for the edge, and
"keep the original". The cut runs on the device with `onnxruntime-web` (MIT)
and ISNet (DIS "general use", Apache-2.0) quantised to int8 (`lib/media/segment.ts`);
nothing is uploaded for it and nothing is billed. The model (~46 MB) and the
runtime's wasm files live in the public `apps` bucket under `models/`
(`scripts/publish-models.mjs`, which also documents how the model was made)
and are kept in the browser's Cache API after the first download. The chosen
result is uploaded as a WebP with alpha, like every other photo (WebP, 1280 px,
≤ 0.6 MB, `lib/upload.ts`). `NEXT_PUBLIC_MODELS_BASE` overrides where the files
are served from.
