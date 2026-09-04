import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireManager } from '@/lib/auth';
import { isPro } from '@/lib/plan';
import { createClient } from '@/lib/supabase/server';
import { ProUpsell } from '@/components/dashboard/ProUpsell';
import { FlowEditorShell } from '@/components/dashboard/whatsapp/flows/FlowEditorShell';
import type { WhatsappFlow } from '@/lib/whatsapp/types';

export const dynamic = 'force-dynamic';

export default async function FlowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenant, subscription } = await requireManager();
  const supabase = await createClient();

  if (!isPro(subscription)) {
    const t = await getTranslations('whatsapp.flows');
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">{t('title')}</h1>
        <ProUpsell feature={t('title')} />
      </div>
    );
  }

  const { data } = await supabase
    .from('whatsapp_flows')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenant.id)
    .maybeSingle();
  if (!data) notFound();

  return <FlowEditorShell flow={data as WhatsappFlow} />;
}
