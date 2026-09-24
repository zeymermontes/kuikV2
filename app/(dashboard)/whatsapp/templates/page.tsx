import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireManager } from '@/lib/auth';
import { cloudSessionOf, localDrafts, syncTemplates } from '@/lib/whatsapp/templates';
import { TemplateManager } from '@/components/dashboard/whatsapp/templates/TemplateManager';
import type { MetaTemplateRow } from '@/lib/whatsapp/template-rules';

export const dynamic = 'force-dynamic';

/**
 * Meta's message templates for this restaurant's official number. Only
 * meaningful with a Cloud API number: a linked device has no window and
 * therefore no templates.
 */
export default async function TemplatesPage() {
  const { tenant } = await requireManager();
  const t = await getTranslations('whatsapp.templates');

  const session = await cloudSessionOf(tenant.id);
  let meta: MetaTemplateRow[] = [];
  let error: string | null = null;
  const drafts = session ? await localDrafts(tenant.id) : [];
  if (session) {
    const r = await syncTemplates(session);
    if (r.ok) meta = r.data;
    else error = r.error;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-neutral-500">{t('subtitle')}</p>
      </div>
      {session ? (
        <>
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{t('paymentNote')}</p>
          <TemplateManager initialMeta={meta} initialDrafts={drafts} initialError={error} />
        </>
      ) : (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-600">
          {t('noCloud')}{' '}
          <Link href="/whatsapp" className="font-medium text-neutral-900 underline">
            {t('goConnect')}
          </Link>
        </div>
      )}
    </div>
  );
}
