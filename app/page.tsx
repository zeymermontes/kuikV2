import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  Check,
  CreditCard,
  ExternalLink,
  Globe,
  Heart,
  MonitorSmartphone,
  Printer,
  WifiOff,
} from 'lucide-react';
import { getPlatformSettings } from '@/lib/platform';
import { getShowcase } from '@/lib/showcase';
import { formatPrice } from '@/lib/utils';
import { Nav } from '@/components/landing/Nav';
import { DeviceFrame } from '@/components/landing/DeviceFrame';
import { ProductTour } from '@/components/landing/ProductTour';
import { Faq } from '@/components/landing/Faq';
import { Footer } from '@/components/landing/Footer';
import { JsonLd } from '@/components/seo/JsonLd';
import { FEATURE_PAGES } from '@/lib/landing/features';
import { faqJsonLd, organizationJsonLd, softwareJsonLd, websiteJsonLd } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Kuik — Menú digital, pedidos, punto de venta y reservaciones para restaurantes',
  description:
    'Menú digital con pedidos por WhatsApp y pago con tarjeta, punto de venta con pantalla de cocina e impresión automática, y reservaciones con anfitrión. Pruébalo en vivo.',
  // The same page also answers on app.kuik.mx; search engines must count it once.
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Kuik — Tu restaurante completo, en una sola plataforma',
    description: 'Menú digital, pedidos por WhatsApp, pago con tarjeta, punto de venta, cocina y reservaciones. Un mes gratis.',
    type: 'website',
    locale: 'es_MX',
    url: '/',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Kuik: el POS en una tablet y un menú real en un teléfono' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kuik — Tu restaurante completo, en una sola plataforma',
    description: 'Menú digital, pedidos por WhatsApp, pago con tarjeta, punto de venta, cocina y reservaciones. Un mes gratis.',
    images: ['/og.png'],
  },
};

export default async function MarketingPage() {
  const t = await getTranslations('marketing');
  const [plan, showcase] = await Promise.all([getPlatformSettings(), getShowcase()]);
  const money = (n: number) => formatPrice(n, plan.plan_currency);
  const fee = plan.payment_fee_percent ?? 0;
  const proFee = plan.pro_payment_fee_percent ?? fee;
  const hero = showcase[0] ?? null;
  const examples = showcase.slice(0, 3);

  const features = [
    {
      icon: CreditCard,
      title: 'Pago con tarjeta',
      body: 'El cliente paga desde el menú con Stripe y el pedido llega ya cobrado a Pedidos y a Cocina. El dinero entra a tu cuenta.',
    },
    {
      icon: Printer,
      title: 'Impresión automática',
      body: 'Comandas y tickets salen solos en tus impresoras térmicas, por red o USB, desde cualquier dispositivo. Abre el cajón en efectivo.',
    },
    {
      icon: MonitorSmartphone,
      title: 'Pantalla del cliente',
      body: 'Una segunda pantalla frente al cliente muestra la cuenta en vivo y pide la propina. Puede ser otra tablet en la barra.',
    },
    {
      icon: WifiOff,
      title: 'Sigue sin internet',
      body: 'El punto de venta guarda todo en el dispositivo y sincroniza al reconectarse. Las impresoras de la red siguen imprimiendo.',
    },
    {
      icon: Bot,
      title: 'Bot de WhatsApp',
      body: 'Diseña flujos que responden solos: menú, horarios, reservaciones y pedidos, con un modo de IA para lo que no está en el guion.',
    },
    {
      icon: Heart,
      title: 'Programa de lealtad',
      body: 'Sellos digitales desde el mismo menú. El cliente acumula y canjea sin descargar una app.',
    },
    {
      icon: Building2,
      title: 'Sucursales',
      body: 'Un menú base y variaciones por sucursal: precios, disponibilidad y horarios distintos bajo la misma marca.',
    },
    {
      icon: BarChart3,
      title: 'Reportes',
      body: 'Ventas por día, producto y método de pago, cortes de caja y lo más visto del menú, siempre al día.',
    },
    {
      icon: Globe,
      title: 'Tu propio dominio',
      body: 'Empieza en tunombre.kuik.mx y conecta tu dominio cuando quieras, con certificado incluido.',
    },
  ] as const;

  const basicFeatures = [
    'Menú digital con fotos, categorías y opciones',
    'Pedidos por WhatsApp y QR de mesa',
    fee > 0 ? `Pago con tarjeta (${fee}% por transacción)` : 'Pago con tarjeta',
    'Reservaciones desde el menú',
    'Diseño a tu medida: colores, fuentes, fondo',
    'Reportes de ventas y de menú',
    'tunombre.kuik.mx incluido',
  ];
  const proFeatures = [
    'Puesto de anfitrión con plano de mesas',
    'Bot de WhatsApp con flujos e IA',
    'Programa de lealtad',
    'Sucursales y dominio propio',
    'Reportes avanzados',
    proFee < fee ? `Pago con tarjeta con comisión reducida (${proFee}%)` : 'Soporte prioritario',
  ];
  const posFeatures = ['Punto de venta en cualquier dispositivo', 'Pantalla de cocina (KDS)', 'Impresión automática y cajón de dinero', 'Pantalla del cliente'];

  const faq = [
    {
      q: '¿Necesito comprar equipo?',
      a: 'No. Kuik corre en el navegador de cualquier celular, tablet o computadora que ya tengas. Para imprimir instalas un pequeño programa gratuito en una computadora del restaurante, o usas impresoras conectadas a la red.',
    },
    {
      q: '¿Qué impresoras funcionan?',
      a: 'Impresoras térmicas de tickets de 58 u 80 mm (las de siempre: Epson, Star, Bixolon, Xprinter y similares), conectadas por red, USB o Bluetooth en Windows, macOS o Linux. Si tienen cajón de dinero, Kuik lo abre en las ventas en efectivo.',
    },
    {
      q: '¿Cómo cobro con tarjeta desde el menú?',
      a: `Conectas tu cuenta de Stripe desde el panel en unos minutos y activas el pago en línea. El cliente paga antes de que el pedido llegue a tu WhatsApp y el dinero se deposita en tu cuenta bancaria. ${fee > 0 ? `Kuik cobra ${fee}% por transacción, más la comisión de Stripe.` : 'Solo pagas la comisión de Stripe.'}`,
    },
    {
      q: '¿Funciona si se va el internet?',
      a: 'El punto de venta sigue cobrando y guardando todo en el dispositivo; cuando vuelve la conexión sincroniza solo. Las impresoras que están en la misma red que la computadora con el agente siguen imprimiendo.',
    },
    {
      q: '¿Puedo probar antes de pagar?',
      a: `Sí. El primer mes es gratis con todas las funciones, punto de venta incluido. Después eliges el plan que necesitas, agregas el punto de venta si lo quieres, y cancelas cuando sea desde tu panel, sin contratos.`,
    },
    {
      q: '¿Ya tengo un dominio o una página?',
      a: `En el plan ${plan.pro_name} conectas tu dominio y el menú vive ahí. Si tienes una página propia, la enlazas o la sustituyes por una landing hecha a la medida de tu marca.`,
    },
  ];

  const steps = [
    ['Crea tu cuenta', 'Elige el nombre de tu menú y tu número de WhatsApp. Un minuto, sin tarjeta.'],
    ['Arma tu menú', 'Agrega categorías, productos y fotos, o impórtalo de una vez. Personaliza colores y tipografías.'],
    ['Comparte y opera', 'Pon el QR en las mesas, comparte tu enlace y, si lo necesitas, enciende el punto de venta y la cocina.'],
  ];

  const offers = [
    { name: plan.plan_name, amount: plan.plan_amount, currency: plan.plan_currency },
    { name: plan.pro_name, amount: plan.pro_amount, currency: plan.plan_currency },
    { name: plan.pos_addon_name, amount: plan.pos_addon_amount, currency: plan.plan_currency },
  ];

  return (
    <main className="min-h-full bg-white text-neutral-900 antialiased">
      <JsonLd data={[organizationJsonLd(), websiteJsonLd(), softwareJsonLd(offers), faqJsonLd(faq)]} />
      <Nav loginLabel={t('login')} ctaLabel={t('cta')} />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.07)_1px,transparent_0)] bg-[size:22px_22px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
          aria-hidden
        />
        <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[36rem] w-[64rem] -translate-x-1/2 rounded-full bg-amber-200/40 blur-3xl" aria-hidden />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-14 pb-20 lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)] lg:pt-24 lg:pb-28">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
              Nuevo: punto de venta, cocina e impresión
            </span>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Tu restaurante completo, en una sola plataforma.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-neutral-600">
              Menú digital con pedidos por WhatsApp y pago con tarjeta. Punto de venta con pantalla de cocina e impresión automática.
              Reservaciones con anfitrión. Sin instalar nada, listo hoy.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-500 px-7 py-3.5 text-base font-semibold text-neutral-900 shadow-[0_8px_30px_-8px_rgba(245,158,11,0.7)] transition hover:bg-amber-400"
              >
                {t('cta')} <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#producto"
                className="inline-flex items-center justify-center rounded-full border border-neutral-300 bg-white px-7 py-3.5 text-base font-semibold transition hover:border-neutral-900"
              >
                Probar el POS en vivo
              </a>
            </div>
            <p className="mt-5 text-sm text-neutral-500">{t('freeTrial')} · Cancela cuando quieras · Soporte en español</p>
          </div>

          <div className="relative mx-auto mb-10 w-full max-w-[720px] sm:mb-12 lg:mx-0">
            <DeviceFrame src="/demo/pos" kind="tablet" title="Punto de venta Kuik, demo en vivo" eager />
            {hero && (
              <div className="absolute -bottom-8 -left-2 w-[34%] min-w-[120px] sm:-bottom-10 sm:-left-8 sm:min-w-[190px] lg:-left-14">
                <DeviceFrame src={hero.url} kind="phone" title={`Menú de ${hero.name}`} eager />
              </div>
            )}
            <p className="mt-4 pl-[38%] text-left text-xs text-neutral-500 sm:mt-14 sm:pl-0 sm:text-center">Demos en vivo: el POS y el menú real de {hero?.name ?? 'un restaurante'} · tócalos</p>
          </div>
        </div>
      </section>

      {/* Trust */}
      {showcase.length > 0 && (
        <section className="border-y border-neutral-100 bg-neutral-50/70">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-5 py-8 sm:flex-row sm:justify-between">
            <p className="text-sm font-medium text-neutral-500">Ya operan con Kuik</p>
            <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
              {showcase.map((s) => (
                <li key={s.subdomain}>
                  <a href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 text-sm font-semibold text-neutral-700 grayscale transition hover:grayscale-0" title={`Ver el menú de ${s.name}`}>
                    {s.logoUrl ? (
                      <Image src={s.logoUrl} alt="" width={40} height={40} className="h-8 w-8 rounded-lg object-contain" />
                    ) : (
                      <span className="h-8 w-8 rounded-lg" style={{ background: s.primary }} aria-hidden />
                    )}
                    {s.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Product tour */}
      <section id="producto" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 lg:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold text-amber-600">Pruébalo aquí mismo</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">Una plataforma, cuatro pantallas</h2>
          <p className="mt-4 text-neutral-600">
            Son las mismas pantallas que usa el restaurante, con datos de ejemplo. Toca, cobra, marca platillos listos. Nada se guarda.
          </p>
        </div>
        <div className="mt-12">
          <ProductTour menuUrl={hero?.url ?? null} menuName={hero?.name ?? null} />
        </div>
      </section>

      {/* Features */}
      <section id="funciones" className="scroll-mt-20 bg-neutral-950 text-white">
        <div className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-amber-400">Funciones</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">Todo lo que necesitas para operar, sin sumar herramientas</h2>
            <p className="mt-4 text-neutral-400">
              Cada módulo se enciende desde el panel cuando lo necesitas. Empieza con el menú y crece hasta el punto de venta sin cambiar de sistema.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {FEATURE_PAGES.map((f) => (
                <Link key={f.slug} href={`/${f.slug}`} className="rounded-full border border-white/15 px-3.5 py-1.5 text-sm text-neutral-300 transition hover:border-amber-400 hover:text-white">
                  {f.name} →
                </Link>
              ))}
            </div>
          </div>
          <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-neutral-950 p-7 transition hover:bg-neutral-900">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/10 ring-1 ring-amber-400/30">
                  <Icon className="h-5 w-5 text-amber-400" />
                </div>
                <h3 className="mt-5 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-400">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
          <div>
            <p className="text-sm font-semibold text-amber-600">Cómo empezar</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">Listo en tres pasos, hoy mismo</h2>
            <p className="mt-4 text-neutral-600">
              No hay instalación ni capacitación de semanas. Un menú promedio queda armado en una tarde, y el equipo aprende el punto de venta en su primer turno.
            </p>
            <Link href="/signup" className="mt-8 inline-flex items-center gap-2 font-semibold text-neutral-900 underline-offset-4 hover:underline">
              Crear mi cuenta <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <ol className="space-y-4">
            {steps.map(([title, body], i) => (
              <li key={title} className="flex gap-5 rounded-3xl border border-neutral-200 p-6">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-900 font-bold text-white">{i + 1}</span>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-neutral-600">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Examples */}
      {examples.length > 0 && (
        <section id="ejemplos" className="scroll-mt-20 border-y border-neutral-100 bg-neutral-50/70">
          <div className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold text-amber-600">Ejemplos</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">Menús reales, en vivo</h2>
              <p className="mt-4 text-neutral-600">
                Cada uno con su propia identidad: colores, tipografía, fotos y forma de ordenar. Son los menús que sus clientes están usando ahora.
              </p>
            </div>
            <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
              {examples.map((s, i) => (
                <div key={s.subdomain} className={i === 2 ? 'sm:col-span-2 lg:col-span-1' : ''}>
                  <div className="mx-auto w-full max-w-[300px]">
                    <DeviceFrame src={s.url} kind="phone" title={`Menú de ${s.name}`} />
                  </div>
                  <div className="mt-5 flex items-center justify-center gap-3">
                    {s.logoUrl && <Image src={s.logoUrl} alt="" width={36} height={36} className="h-9 w-9 rounded-xl object-contain" />}
                    <div>
                      <p className="font-semibold">{s.name}</p>
                      <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
                        Abrir menú <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Pricing */}
      <section id="precios" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 lg:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold text-amber-600">Precios</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">Un precio claro, sin sorpresas</h2>
          <p className="mt-4 text-neutral-600">
            {t('freeTrial')} con todas las funciones. Después eliges el plan y cancelas cuando quieras.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-4xl gap-6 lg:grid-cols-2">
          <div className="flex flex-col rounded-3xl border border-neutral-200 bg-white p-8">
            <p className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">{plan.plan_name}</p>
            <p className="mt-2 text-sm text-neutral-600">Para vender desde el menú: cafeterías, fondas, dark kitchens y food trucks.</p>
            <div className="mt-6 flex items-end gap-1">
              <span className="text-5xl font-extrabold tracking-tight">{money(plan.plan_amount)}</span>
              <span className="mb-2 text-neutral-500">/mes</span>
            </div>
            <ul className="mt-8 flex-1 space-y-3 text-sm">
              {basicFeatures.map((f) => (
                <li key={f} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={3} />
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/signup" className="mt-8 block rounded-full border border-neutral-300 px-7 py-3 text-center font-semibold transition hover:border-neutral-900">
              {t('cta')}
            </Link>
          </div>

          <div className="relative flex flex-col rounded-3xl bg-neutral-950 p-8 text-white shadow-2xl ring-1 ring-neutral-900">
            <span className="absolute -top-3 left-8 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-neutral-900">Más completo</span>
            <p className="text-sm font-semibold tracking-wide text-amber-400 uppercase">{plan.pro_name}</p>
            <p className="mt-2 text-sm text-neutral-400">Para el restaurante con mesas: reservaciones, anfitrión, WhatsApp y lealtad.</p>
            <div className="mt-6 flex items-end gap-1">
              <span className="text-5xl font-extrabold tracking-tight">{money(plan.pro_amount)}</span>
              <span className="mb-2 text-neutral-400">/mes</span>
            </div>
            <p className="mt-6 text-sm text-neutral-400">Todo lo de {plan.plan_name}, y además:</p>
            <ul className="mt-3 flex-1 space-y-3 text-sm">
              {proFeatures.map((f) => (
                <li key={f} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" strokeWidth={3} />
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/signup" className="mt-8 block rounded-full bg-amber-400 px-7 py-3 text-center font-semibold text-neutral-900 transition hover:bg-amber-300">
              {t('cta')}
            </Link>
          </div>
        </div>

        {/* The point of sale joins either plan. */}
        <div className="mx-auto mt-6 max-w-4xl rounded-3xl border border-dashed border-neutral-300 bg-neutral-50/80 p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center">
            <div>
              <p className="text-sm font-semibold tracking-wide text-amber-600 uppercase">Complemento · {plan.pos_addon_name}</p>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-4xl font-extrabold tracking-tight">+{money(plan.pos_addon_amount)}</span>
                <span className="mb-1.5 text-neutral-500">/mes</span>
              </div>
              <p className="mt-3 text-sm text-neutral-600">
                Se agrega a cualquier plan cuando quieras dejar tu caja. Funciona en la tablet o computadora que ya tienes y con tus impresoras térmicas.
              </p>
              <a href="/demo/pos" target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-900 underline-offset-4 hover:underline">
                Probar el punto de venta <ExternalLink className="h-4 w-4" />
              </a>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {posFeatures.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={3} />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-4xl space-y-1 text-center text-sm text-neutral-500">
          <p>Restaurante adicional en la misma cuenta: {money(plan.extra_amount)}/mes. El primer mes de prueba incluye todo, también el punto de venta.</p>
          <p>
            ¿Quieres una <span className="font-medium text-neutral-700">landing page a la medida de tu marca</span>? Se cotiza por separado.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 border-t border-neutral-100 bg-neutral-50/70">
        <div className="mx-auto max-w-3xl px-5 py-20 lg:py-28">
          <div className="text-center">
            <p className="text-sm font-semibold text-amber-600">Preguntas frecuentes</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">Lo que nos preguntan antes de empezar</h2>
          </div>
          <div className="mt-12">
            <Faq items={faq} />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-neutral-950 px-8 py-16 text-center text-white sm:px-16">
          <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-amber-400/25 blur-3xl" aria-hidden />
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">Abre tu menú hoy. Enciende la caja cuando quieras.</h2>
          <p className="mx-auto mt-4 max-w-xl text-neutral-300">{t('freeTrial')}, con todas las funciones. Sin tarjeta para empezar.</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-7 py-3.5 font-semibold text-neutral-900 transition hover:bg-amber-300">
              {t('cta')} <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="/demo/pos" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/20 px-7 py-3.5 font-semibold text-white transition hover:bg-white/10">
              Abrir el POS de prueba <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      <Footer loginLabel={t('login')} ctaLabel={t('cta')} />
    </main>
  );
}
