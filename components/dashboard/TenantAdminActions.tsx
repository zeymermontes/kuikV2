'use client';

import { useTransition } from 'react';
import { LogIn, ArrowRightLeft, Mail, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { enterSupport, transferTenant, cancelOwnerInvite } from '@/app/(dashboard)/admin/actions';

export function TenantAdminActions({
  tenantId,
  name,
  pendingOwner,
}: {
  tenantId: string;
  name: string;
  /** Address the restaurant is waiting for, when a transfer went to someone with no account yet. */
  pendingOwner: string | null;
}) {
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
        alert(res?.invited ? t('transferInvited', { email: email.trim().toLowerCase() }) : t('transferOk'));
      }
    });
  }

  function cancelInvite() {
    if (!pendingOwner || !confirm(t('ownerInviteCancelConfirm', { email: pendingOwner }))) return;
    startTransition(() => cancelOwnerInvite(tenantId));
  }

  const btn =
    'flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50';

  return (
    <>
      {pendingOwner && (
        <span
          title={t('ownerInvitePending', { email: pendingOwner })}
          className="flex max-w-[14rem] items-center gap-1 rounded-lg bg-amber-50 py-1 pl-2 pr-1 text-xs font-medium text-amber-800"
        >
          <Mail className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{pendingOwner}</span>
          <button onClick={cancelInvite} disabled={pending} aria-label={t('ownerInviteCancel')} className="rounded p-0.5 hover:bg-amber-100">
            <X className="h-3 w-3" />
          </button>
        </span>
      )}
      <button onClick={support} disabled={pending} className={btn}>
        <LogIn className="h-3.5 w-3.5" /> {t('supportEnter')}
      </button>
      <button onClick={transfer} disabled={pending} className={btn}>
        <ArrowRightLeft className="h-3.5 w-3.5" /> {t('transfer')}
      </button>
    </>
  );
}
