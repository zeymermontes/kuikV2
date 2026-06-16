import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  UtensilsCrossed,
  MessageCircle,
  Palette,
  BarChart3,
  Globe,
  ImageIcon,
  Check,
} from 'lucide-react';
import { getPlatformSettings } from '@/lib/platform';
import { formatPrice } from '@/lib/utils';

export default async function MarketingPage() {
  const t = await getTranslations('marketing');
  const plan = await getPlatformSettings();

  const benefits = [
    {
      icon: UtensilsCrossed,
      title: 'Menú con categorías',
      body: 'Organiza tus platillos en secciones, con separadores y banners por categoría.',
    },
    {
      icon: ImageIcon,
      title: 'Fotos opcionales',
      body: 'Agrega imágenes a los productos que quieras. Los demás se ven igual de bien.',
    },
    {
      icon: MessageCircle,
      title: 'Pedidos por WhatsApp',
      body: 'El cliente arma su pedido y te llega completo a tu WhatsApp. Sin comisiones.',
    },
    {
      icon: Palette,
      title: 'Personalización total',
      body: 'Colores, tipografías, logo y fondo. Tu menú con la identidad de tu marca.',
    },
    {
      icon: BarChart3,
      title: 'Dashboard',
      body: 'Mira tus productos más vistos y cuántos pedidos generas.',
    },
    {
      icon: Globe,
      title: 'Tu propio dominio',
      body: 'Empieza en tunombre.kuik.mx y conecta tu dominio cuando quieras.',
    },
  ] as const;

  const basicFeatures = [
    'Menú con fotos',
    'Pedidos por WhatsApp',
    'Personalización completa',
    'Dashboard',
    'Subdominio incluido',
  ];
  const proFeatures = [
    'Dominio propio',
    'Programa de lealtad',
    'Sucursales',
    'Reportes avanzados',
  ];

  return (
    <main className="min-h-full bg-white text-neutral-900">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <span className="text-xl font-bold tracking-tight">Kuik</span>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/login" className="text-neutral-600 hover:text-neutral-900">
            {t('login')}
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700"
          >
            {t('cta')}
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-5 pt-16 pb-12 text-center sm:pt-24">
        <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
          {t('freeTrial')}
        </span>
        <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-6xl">
          {t('tagline')}
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-neutral-600">{t('subtitle')}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="w-full rounded-full bg-amber-500 px-7 py-3 text-base font-semibold text-white shadow-sm hover:bg-amber-600 sm:w-auto"
          >
            {t('cta')}
          </Link>
          <a
            href="#precio"
            className="w-full rounded-full border border-neutral-300 px-7 py-3 text-base font-semibold hover:bg-neutral-50 sm:w-auto"
          >
            Ver precio
          </a>
        </div>
      </section>

      {/* Benefits */}
      <section className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-neutral-200 p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50">
                <Icon className="h-6 w-6 text-amber-500" />
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-neutral-600">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-4xl px-5 py-12">
        <h2 className="text-center text-3xl font-bold">Listo en 3 pasos</h2>
        <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {[
            ['1', 'Crea tu cuenta', 'Elige el nombre de tu menú y tu número de WhatsApp.'],
            ['2', 'Arma tu menú', 'Agrega categorías, productos, fotos y personaliza el diseño.'],
            ['3', 'Comparte y vende', 'Comparte tu link y recibe pedidos por WhatsApp.'],
          ].map(([n, title, body]) => (
            <div key={n} className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-900 text-lg font-bold text-white">
                {n}
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-neutral-600">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="precio" className="mx-auto max-w-3xl px-5 py-16">
        <h2 className="text-center text-3xl font-bold">Precios claros</h2>
        <p className="mt-2 text-center text-neutral-600">
          {t('freeTrial')} · Cancela cuando quieras
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {/* Básico */}
          <div className="flex flex-col rounded-3xl border border-neutral-200 p-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              {plan.plan_name}
            </p>
            <div className="mt-3 flex items-end gap-1">
              <span className="text-4xl font-extrabold">
                {formatPrice(plan.plan_amount, plan.plan_currency)}
              </span>
              <span className="mb-1 text-neutral-500">/mes</span>
            </div>
            <ul className="mt-6 flex-1 space-y-2 text-sm">
              {basicFeatures.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-green-600" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className="mt-7 block rounded-full border border-neutral-300 px-7 py-3 text-center font-semibold hover:bg-neutral-50"
            >
              {t('cta')}
            </Link>
          </div>

          {/* Pro */}
          <div className="relative flex flex-col rounded-3xl border-2 border-amber-500 p-8 shadow-sm">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white">
              Más popular
            </span>
            <p className="text-sm font-semibold uppercase tracking-wide text-amber-600">
              {plan.pro_name}
            </p>
            <div className="mt-3 flex items-end gap-1">
              <span className="text-4xl font-extrabold">
                {formatPrice(plan.pro_amount, plan.plan_currency)}
              </span>
              <span className="mb-1 text-neutral-500">/mes</span>
            </div>
            <p className="mt-2 text-sm text-neutral-500">Todo lo de {plan.plan_name}, y además:</p>
            <ul className="mt-4 flex-1 space-y-2 text-sm">
              {proFeatures.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-green-600" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className="mt-7 block rounded-full bg-amber-500 px-7 py-3 text-center font-semibold text-white hover:bg-amber-600"
            >
              {t('cta')}
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-neutral-500">
          Restaurante adicional: {formatPrice(plan.extra_amount, plan.plan_currency)}/mes
        </p>
        <p className="mt-2 text-center text-sm text-neutral-500">
          ¿Quieres una <span className="font-medium text-neutral-700">landing page personalizada</span> a la
          medida de tu marca? Se cotiza por separado.
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t border-neutral-100 py-10 text-center text-sm text-neutral-400">
        © Kuik · Menús digitales para restaurantes
      </footer>
    </main>
  );
}
