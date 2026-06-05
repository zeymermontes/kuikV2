'use client';

import { useActionState, useTransition } from 'react';
import { CheckCircle2, Clock, AlertCircle, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Tenant } from '@/lib/database.types';
import { ROOT_HOST } from '@/lib/config';
import { Card, Input, Button } from '@/components/ui';
import {
  connectDomain,
  checkDomain,
  disconnectDomain,
  type DomainResult,
} from '@/app/(dashboard)/domain/actions';

export function DomainManager({ tenant }: { tenant: Tenant }) {
  const t = useTranslations('domain');
  const [state, action, pending] = useActionState<DomainResult, FormData>(
    connectDomain,
    {},
  );
  const [busy, startTransition] = useTransition();

  const status = tenant.custom_domain_status;

  return (
    <Card className="max-w-xl">
      {tenant.custom_domain ? (
        <div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">{tenant.custom_domain}</p>
              <StatusBadge status={status} t={t} />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => startTransition(() => void checkDomain())}
                disabled={busy}
                className="rounded-lg border border-neutral-200 p-2 text-neutral-600 hover:bg-neutral-50"
                title="check"
              >
                <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => startTransition(() => void disconnectDomain())}
                disabled={busy}
                className="rounded-lg border border-neutral-200 p-2 text-neutral-400 hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {status !== 'verified' && (
            <div className="mt-4 rounded-xl bg-neutral-50 p-4 text-sm">
              <p className="mb-2 font-medium text-neutral-700">{t('instructions')}</p>
              <div className="space-y-1 font-mono text-xs text-neutral-600">
                <div>Type: CNAME</div>
                <div>Name: {tenant.custom_domain.split('.')[0]}</div>
                <div>Value: {tenant.subdomain}.{ROOT_HOST}</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <form action={action}>
          <p className="mb-3 text-sm text-neutral-600">{t('customDomain')}</p>
          <div className="flex gap-2">
            <Input name="domain" placeholder="menu.turestaurante.com" required />
            <Button type="submit" disabled={pending}>
              {t('addDomain')}
            </Button>
          </div>
          {state.error && (
            <p className="mt-2 text-sm text-red-600">
              {state.error === 'taken'
                ? t('error')
                : state.error === 'invalid'
                  ? t('error')
                  : state.error}
            </p>
          )}
        </form>
      )}
    </Card>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: Tenant['custom_domain_status'];
  t: ReturnType<typeof useTranslations>;
}) {
  if (status === 'verified')
    return (
      <span className="mt-1 flex items-center gap-1 text-xs font-medium text-green-600">
        <CheckCircle2 className="h-3.5 w-3.5" /> {t('verified')}
      </span>
    );
  if (status === 'error')
    return (
      <span className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600">
        <AlertCircle className="h-3.5 w-3.5" /> {t('error')}
      </span>
    );
  return (
    <span className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-600">
      <Clock className="h-3.5 w-3.5" /> {t('pending')}
    </span>
  );
}
