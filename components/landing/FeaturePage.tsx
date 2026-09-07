import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  Building2,
  CalendarCheck,
  Check,
  ChefHat,
  Clock,
  CreditCard,
  Globe,
  Heart,
  LayoutGrid,
  ListChecks,
  MessageCircle,
  Monitor,
  Palette,
  Printer,
  QrCode,
  Smartphone,
  Users,
  Wallet,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { getShowcase } from '@/lib/showcase';
import { FEATURE_PAGES, type FeatureIcon, type FeaturePage as FeaturePageData } from '@/lib/landing/features';
import { breadcrumbJsonLd, faqJsonLd } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Nav } from './Nav';
import { Footer } from './Footer';
import { DeviceFrame } from './DeviceFrame';
import { Faq } from './Faq';

const ICONS: Record<FeatureIcon, LucideIcon> = {
  qr: QrCode,
  smartphone: Smartphone,
  palette: Palette,
  whatsapp: MessageCircle,
  creditCard: CreditCard,
  globe: Globe,
  barChart: BarChart3,
  monitor: Monitor,
  chefHat: ChefHat,
  printer: Printer,
  wifiOff: WifiOff,
  users: Users,
  wallet: Wallet,
  calendar: CalendarCheck,
  layout: LayoutGrid,
  bell: Bell,
  clock: Clock,
  listChecks: ListChecks,
  bot: Bot,
  heart: Heart,
  building: Building2,
};

/** One feature page of the marketing site, rendered from lib/landing/features.ts. */
export async function FeaturePage({ page }: { page: FeaturePageData }) {
  const t = await getTranslations('marketing');
  const showcase = await getShowcase();
  const hero = showcase[0] ?? null;

  const phoneSrc =
    page.demo.phone === 'menu' ? hero?.url ?? null : page.demo.phone === 'reservation' ? (hero ? `${hero.url}/menu?reservar=1` : null) : page.demo.phone ?? null;
  const tabletSrc = page.demo.tablet ?? null;
  const related = page.related.map((slug) => FEATURE_PAGES.find((f) => f.slug === slug)).filter((f): f is FeaturePageData => Boolean(f));

  return (
    <main className="min-h-full bg-white text-neutral-900 antialiased">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Kuik', path: '/' },
            { name: page.name, path: `/${page.slug}` },
          ]),
          faqJsonLd(page.faq),
        ]}
      />
      <Nav loginLabel={t('login')} ctaLabel={t('cta')} />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[36rem] w-[64rem] -translate-x-1/2 rounded-full bg-amber-200/40 blur-3xl" aria-hidden />
        <div className="mx-auto max-w-6xl px-5 pt-12 pb-16 lg:pt-20 lg:pb-24">
          <nav aria-label="Ruta" className="text-sm text-neutral-500">
            <Link href="/" className="hover:text-neutral-900">Kuik</Link>
            <span className="mx-2" aria-hidden>/</span>
            <span className="text-neutral-700">{page.name}</span>
          </nav>
          <div className={`mt-6 grid items-center gap-12 ${tabletSrc ? 'lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]' : 'lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]'}`}>
            <div className="max-w-xl">
              <p className="text-sm font-semibold text-amber-600">{page.eyebrow}</p>
              <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">{page.h1}</h1>
              {page.intro.map((p) => (
                <p key={p.slice(0, 40)} className="mt-5 text-lg leading-relaxed text-neutral-600">
                  {p}
                </p>
              ))}
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-500 px-7 py-3.5 text-base font-semibold text-neutral-900 shadow-[0_8px_30px_-8px_rgba(245,158,11,0.7)] transition hover:bg-amber-400"
                >
                  {t('cta')} <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/#precios" className="inline-flex items-center justify-center rounded-full border border-neutral-300 bg-white px-7 py-3.5 text-base font-semibold transition hover:border-neutral-900">
                  Ver precios
                </Link>
              </div>
              <p className="mt-5 text-sm text-neutral-500">{t('freeTrial')} · Sin tarjeta para empezar</p>
            </div>

            <div className="mx-auto w-full">
              {tabletSrc && phoneSrc ? (
                <div className="relative mx-auto mb-10 w-full max-w-[720px]">
                  <DeviceFrame src={tabletSrc} kind="tablet" title={`${page.name}, demo en vivo`} eager />
                  <DeviceFrame src={phoneSrc} kind="phone" title={`Menú de ${hero?.name ?? 'ejemplo'}`} eager className="absolute -bottom-8 -left-2 w-[30%]" />
                </div>
              ) : tabletSrc ? (
                <div className="mx-auto w-full max-w-[720px]">
                  <DeviceFrame src={tabletSrc} kind="tablet" title={`${page.name}, demo en vivo`} eager />
                </div>
              ) : phoneSrc ? (
                <div className="mx-auto w-full max-w-[320px]">
                  <DeviceFrame src={phoneSrc} kind="phone" title={`Menú de ${hero?.name ?? 'ejemplo'}`} eager />
                </div>
              ) : null}
              <p className="mt-6 text-center text-xs text-neutral-500">{page.demo.caption}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-neutral-950 text-white">
        <div className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">Qué incluye</h2>
          <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {page.benefits.map((b) => {
              const Icon = ICONS[b.icon];
              return (
                <div key={b.title} className="bg-neutral-950 p-7 transition hover:bg-neutral-900">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/10 ring-1 ring-amber-400/30">
                    <Icon className="h-5 w-5 text-amber-300" />
                  </div>
                  <h3 className="mt-5 font-semibold">{b.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-400">{b.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Audience + steps */}
      <section className="mx-auto grid max-w-6xl gap-16 px-5 py-20 lg:grid-cols-2 lg:py-28">
        <div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{page.audience.title}</h2>
          <ul className="mt-8 space-y-4">
            {page.audience.items.map((item) => (
              <li key={item} className="flex items-start gap-3 text-neutral-700">
                <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={3} />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Cómo empezar</h2>
          <ol className="mt-8 space-y-6">
            {page.steps.map(([title, body], i) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-800">{i + 1}</span>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-neutral-600">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-neutral-100 bg-neutral-50/70">
        <div className="mx-auto max-w-3xl px-5 py-20 lg:py-28">
          <h2 className="text-center text-3xl font-bold tracking-tight text-balance sm:text-4xl">Preguntas frecuentes</h2>
          <div className="mt-12">
            <Faq items={page.faq} />
          </div>
        </div>
      </section>

      {/* Related + CTA */}
      <section className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
        <h2 className="text-sm font-semibold text-neutral-500">También en Kuik</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {related.map((r) => (
            <Link key={r.slug} href={`/${r.slug}`} className="group rounded-2xl border border-neutral-200 p-5 transition hover:border-neutral-900">
              <p className="font-semibold">{r.name}</p>
              <p className="mt-1 text-sm text-neutral-600">{r.eyebrow}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-amber-700">
                Conocer más <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
        <div className="relative mt-16 overflow-hidden rounded-[2.5rem] bg-neutral-950 px-8 py-16 text-center text-white sm:px-16">
          <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-amber-400/25 blur-3xl" aria-hidden />
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">Pruébalo un mes gratis, con todo incluido.</h2>
          <p className="mx-auto mt-4 max-w-xl text-neutral-300">Sin tarjeta para empezar. Cancela cuando quieras desde tu panel.</p>
          <Link href="/signup" className="mt-8 inline-flex items-center gap-2 rounded-full bg-amber-400 px-7 py-3.5 font-semibold text-neutral-900 transition hover:bg-amber-300">
            {t('cta')} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <Footer loginLabel={t('login')} ctaLabel={t('cta')} />
    </main>
  );
}

/** The metadata every feature page shares, from its data. */
export function featureMetadata(page: FeaturePageData) {
  return {
    title: page.metaTitle,
    description: page.description,
    alternates: { canonical: `/${page.slug}` },
    openGraph: {
      title: page.metaTitle,
      description: page.description,
      type: 'website' as const,
      locale: 'es_MX',
      url: `/${page.slug}`,
      images: [{ url: '/og.jpg', width: 1200, height: 630, alt: 'Kuik: el POS en una tablet y un menú real en un teléfono' }],
    },
    twitter: { card: 'summary_large_image' as const, title: page.metaTitle, description: page.description, images: ['/og.jpg'] },
  };
}
