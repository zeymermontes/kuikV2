import { getTranslations } from 'next-intl/server';
import { ExternalLink } from 'lucide-react';
import { requireOwner } from '@/lib/auth';
import { tenantUrl } from '@/lib/config';
import { Card } from '@/components/ui';
import { DomainManager } from '@/components/dashboard/DomainManager';

export default async function DomainPage() {
  const { tenant } = await requireOwner();
  const t = await getTranslations('domain');
  const url = tenantUrl(tenant.subdomain);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{t('title')}</h1>

      <Card className="mb-5 max-w-xl">
        <p className="text-sm text-neutral-500">{t('current')}</p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 flex items-center gap-1 font-semibold hover:underline"
        >
          {url.replace(/^https?:\/\//, '')}
          <ExternalLink className="h-4 w-4" />
        </a>
      </Card>

      <DomainManager tenant={tenant} />
    </div>
  );
}
