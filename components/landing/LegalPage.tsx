import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbJsonLd } from '@/lib/seo';

/**
 * Shell for the legal pages (privacy, terms, data deletion).
 *
 * They exist for two readers: a restaurant owner who wants to know what Kuik
 * keeps, and Meta's app reviewers, who will not approve an app without a
 * public privacy policy and data-deletion instructions at a stable URL. Plain
 * headings and paragraphs, no illustration; the prose is the page.
 */

export interface LegalSection {
  title: string;
  body: ReactNode;
}

export function legalMetadata(slug: string, title: string, description: string): Metadata {
  return {
    title: `${title} · Kuik`,
    description,
    alternates: { canonical: `/${slug}` },
    robots: { index: true, follow: true },
  };
}

export async function LegalPage({
  slug,
  title,
  intro,
  updated,
  sections,
}: {
  slug: string;
  title: string;
  intro: string;
  /** ISO date of the last revision, shown to the reader. */
  updated: string;
  sections: LegalSection[];
}) {
  const t = await getTranslations('marketing');
  const updatedLabel = new Date(`${updated}T12:00:00Z`).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <main className="min-h-full bg-white text-neutral-900 antialiased">
      <JsonLd data={[breadcrumbJsonLd([{ name: 'Kuik', path: '/' }, { name: title, path: `/${slug}` }])]} />
      <Nav loginLabel={t('login')} ctaLabel={t('cta')} />

      <article className="mx-auto max-w-3xl px-4 pb-24 pt-14 sm:px-6">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Última actualización: {updatedLabel}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-4 text-base leading-relaxed text-neutral-600">{intro}</p>

        <nav aria-label="Contenido" className="mt-8 rounded-2xl bg-neutral-50 p-5 text-sm">
          <p className="font-semibold">Contenido</p>
          <ol className="mt-2 grid gap-1 sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.title}>
                <a href={`#s${i + 1}`} className="text-neutral-600 hover:text-neutral-900">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          {sections.map((s, i) => (
            <section key={s.title} id={`s${i + 1}`} className="scroll-mt-24">
              <h2 className="text-xl font-semibold">
                {i + 1}. {s.title}
              </h2>
              <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-neutral-700 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5 [&_strong]:text-neutral-900">
                {s.body}
              </div>
            </section>
          ))}
        </div>
      </article>

      <Footer loginLabel={t('login')} ctaLabel={t('cta')} />
    </main>
  );
}
