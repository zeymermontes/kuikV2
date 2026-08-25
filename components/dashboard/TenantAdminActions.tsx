'use client';

import { useTransition } from 'react';
import { LogIn, ArrowRightLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { enterSupport, transferTenant } from '@/app/(dashboard)/admin/actions';

export function TenantAdminActions({ tenantId, name }: { tenantId: string; name: string }) {
  const t = useTranslations('superAdmin');
  const [pending, startTransition] = useTransition();

  function support() {
    startTransition(() => enterSupport(tenantId));
  }

  function transfer() {
    const email = prompt(t('transferEmail'));
    if (!email || !email.trim()) return;
    if (!confirm(t('transferConfirm', { name }))) return;
    startTransition(async () => {
      const res = await transferTenant(tenantId, email);
      if (res && 'error' in res) {
        const messages: Record<string, string> = {
          noAccount: t('transferErr_noAccount'),
          sameOwner: t('transferErr_sameOwner'),
          notFound: t('transferErr_notFound'),
        };
        alert(messages[res.error] ?? t('transferErr_noAccount'));
      } else {
        alert(t('transferOk'));
      }
    });
  }

  const btn =
    'flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50';

  return (
    <>
      <button onClick={support} disabled={pending} className={btn}>
        <LogIn className="h-3.5 w-3.5" /> {t('supportEnter')}
      </button>
      <button onClick={transfer} disabled={pending} className={btn}>
        <ArrowRightLeft className="h-3.5 w-3.5" /> {t('transfer')}
      </button>
    </>
  );
}
