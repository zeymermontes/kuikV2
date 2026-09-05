import { getTranslations } from 'next-intl/server';
import { requireOwner } from '@/lib/auth';
import { DesignForm } from '@/components/dashboard/DesignForm';
import { tenantUrl } from '@/lib/config';

export default async function DesignPage() {
  const { theme, tenant } = await requireOwner();
  const t = await getTranslations('design');

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{t('title')}</h1>
      <DesignForm theme={theme} previewUrl={tenantUrl(tenant.subdomain)} published={tenant.is_published} />
    </div>
  );
}
