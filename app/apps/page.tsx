import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Apple, Download, Monitor, Smartphone, Tablet } from 'lucide-react';
import { getAppReleases, type AppRelease } from '@/lib/apps/releases';
import { breadcrumbJsonLd } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';
import { AppQr } from '@/components/landing/AppQr';
import { DesktopButtons } from '@/components/landing/DesktopButtons';

export const metadata: Metadata = {
  title: 'Apps de Kuik — Android hoy, iOS próximamente',
  description:
    'Descarga Kuik para tu teléfono y Kuik Terminal para la tablet de caja, cocina y anfitrión. Android disponible; iOS próximamente.',
  alternates: { canonical: '/apps' },
  openGraph: {
    title: 'Apps de Kuik',
    description: 'Kuik en tu teléfono y Kuik Terminal en la tablet del restaurante. Android hoy, iOS próximamente.',
    type: 'website',
  },
};

// The download page reads latest.json from the apps bucket (lib/apps/releases.ts);
// a fresh build is live here as soon as native/scripts/publish-apk.mjs runs.
export const dynamic = 'force-dynamic';

const APPS = [
  {
    id: 'kuik' as const,
    name: 'Kuik',
    icon: Smartphone,
    device: 'Teléfono',
    lead: 'El panel del restaurante en tu bolsillo, con avisos al instante.',
    bullets: ['Aviso de cada pedido y reservación nueva', 'Bandeja de WhatsApp y confirmaciones', 'Ventas, reportes y menú desde donde estés'],
  },
  {
    id: 'terminal' as const,
    name: 'Kuik Terminal',
    icon: Tablet,
    device: 'Tablet',
    lead: 'Caja, cocina, anfitrión y pantalla del cliente en una tablet.',
    bullets: ['Elige qué es cada tablet y lo recuerda', 'Imprime directo a la impresora de red, sin PC', 'Sigue vendiendo sin internet y sincroniza después'],
  },
];

function mb(size: number): string {
  return `${(size / 1e6).toFixed(0)} MB`;
}

function AndroidButton({ release }: { release: AppRelease | undefined }) {
  if (!release?.android) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-400">
        <Download className="h-4 w-4" /> Android · muy pronto
      </span>
    );
  }
  return (
    <a
      href={release.android.url}
      className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-700"
    >
      <Download className="h-4 w-4" /> Descargar para Android
      <span className="font-normal text-neutral-300">
        · v{release.version} · {mb(release.android.size)}
      </span>
    </a>
  );
}

function IosButton({ release }: { release: AppRelease | undefined }) {
  if (release?.ios) {
    return (
      <a
        href={release.ios.url}
        className="inline-flex items-center gap-2 rounded-full border border-neutral-900 px-4 py-2.5 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
      >
        <Apple className="h-4 w-4" /> iPhone y iPad
      </a>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm font-semibold text-neutral-400"
      aria-disabled="true"
    >
      <Apple className="h-4 w-4" /> iOS · próximamente
    </span>
  );
}

export default async function AppsPage() {
  const t = await getTranslations('marketing');
  const releases = await getAppReleases();

  return (
    <main className="min-h-full bg-white text-neutral-900 antialiased">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Kuik', path: '/' },
          { name: 'Apps', path: '/apps' },
        ])}
      />
      <Nav loginLabel={t('login')} ctaLabel={t('cta')} />

      <section className="mx-auto max-w-6xl px-5 pb-10 pt-16 sm:pt-20">
        <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Apps</p>
        <h1 className="mt-2 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">Kuik en tu teléfono y en la tablet del restaurante.</h1>
        <p className="mt-4 max-w-2xl text-lg text-neutral-600">
          Las mismas cuentas y los mismos datos que en la web, con lo que solo una app puede hacer: avisos, impresión directa y una tablet
          que arranca en modo caja o cocina. <strong className="text-neutral-900">Android está disponible hoy. iOS llega próximamente.</strong>
        </p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-5 pb-16 md:grid-cols-2">
        {APPS.map((app) => {
          const release = releases[app.id];
          const Icon = app.icon;
          return (
            <article key={app.id} className="flex flex-col rounded-3xl border border-neutral-200 p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-neutral-500">
                    <Icon className="h-4 w-4" /> {app.device}
                  </div>
                  <h2 className="mt-1 text-2xl font-bold">{app.name}</h2>
                  <p className="mt-2 text-neutral-600">{app.lead}</p>
                </div>
                {release?.android && (
                  <div className="hidden shrink-0 rounded-2xl border border-neutral-200 p-2 sm:block" title="Escanea con el teléfono o la tablet">
                    <AppQr value={release.android.url} />
                  </div>
                )}
              </div>
              <ul className="mt-5 space-y-2 text-sm text-neutral-700">
                {app.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-900" /> {b}
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <AndroidButton release={release} />
                <IosButton release={release} />
              </div>
              {release?.android && (
                <p className="mt-3 text-xs text-neutral-500">
                  Versión {release.version}, publicada el {new Date(release.android.publishedAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}.
                </p>
              )}
            </article>
          );
        })}
      </section>

      <section className="border-t border-neutral-100 bg-neutral-50">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="text-2xl font-bold">Cómo instalar en Android</h2>
          <p className="mt-2 max-w-2xl text-neutral-600">
            Mientras Kuik llega a Google Play, el archivo se instala directo. Android pregunta una vez si confías en la descarga; después es como cualquier app.
          </p>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              ['Descarga', 'Toca el botón de Android en el teléfono o la tablet, o escanea el código desde la computadora.'],
              ['Permite la instalación', 'Al abrir el archivo, Android pide permiso para instalar apps de esta fuente. Acepta y vuelve.'],
              ['Inicia sesión', 'Entra con la misma cuenta de Kuik. En la tablet, elige si es caja, cocina, anfitrión o pantalla del cliente.'],
            ].map(([title, body], i) => (
              <li key={title} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
                <span className="text-xs font-semibold text-neutral-400">Paso {i + 1}</span>
                <p className="mt-1 font-semibold">{title}</p>
                <p className="mt-1 text-sm text-neutral-600">{body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <Monitor className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Kuik Caja, para la computadora de la caja</p>
                <p className="mt-1 text-sm text-neutral-600">
                  Trae el agente de impresión adentro, manda la pantalla del cliente al segundo monitor, y se actualiza sola. Windows, Mac y Linux.
                </p>
                <DesktopButtons release={releases.desktop ?? null} />
                <p className="mt-3 text-xs text-neutral-500">
                  Los instaladores aún no están firmados: Windows muestra &quot;Windows protegió tu PC&quot; (Más información → Ejecutar de todas formas) y
                  Mac pide abrirlo con clic derecho → Abrir la primera vez.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer loginLabel={t('login')} ctaLabel={t('cta')} />
    </main>
  );
}
