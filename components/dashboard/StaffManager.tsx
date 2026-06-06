'use client';

import { useState, useTransition } from 'react';
import { UserPlus, X, Mail, Copy, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { TenantMember, TenantInvite, MemberRole } from '@/lib/database.types';
import { Card, Input, Button } from '@/components/ui';
import { inviteStaff, changeRole, removeMember, cancelInvite } from '@/app/(dashboard)/staff/actions';

const STAFF_ROLES: MemberRole[] = ['manager', 'waiter'];

export function StaffManager({
  currentUserId,
  members,
  invites,
  signupUrl,
}: {
  currentUserId: string;
  members: TenantMember[];
  invites: TenantInvite[];
  signupUrl: string;
}) {
  const t = useTranslations('staff');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('waiter');
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  function invite() {
    if (!email.trim()) return;
    start(async () => {
      await inviteStaff(email, role);
      setEmail('');
    });
  }

  function copyLink() {
    navigator.clipboard?.writeText(signupUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="max-w-2xl space-y-5">
      {/* Invite */}
      <Card>
        <h2 className="mb-1 font-semibold">{t('invite')}</h2>
        <p className="mb-3 text-sm text-neutral-500">{t('inviteHint')}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('email')}
            className="flex-1"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as MemberRole)}
            className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm"
          >
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`role_${r}`)}
              </option>
            ))}
          </select>
          <Button onClick={invite} disabled={pending || !email.trim()}>
            <UserPlus className="h-4 w-4" /> {t('send')}
          </Button>
        </div>
        <button
          onClick={copyLink}
          className="mt-3 flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
          {t('copySignup')}
        </button>
      </Card>

      {/* Members */}
      <Card>
        <h2 className="mb-3 font-semibold">{t('team')}</h2>
        <div className="divide-y divide-neutral-100">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.email || m.user_id}</p>
                {m.user_id === currentUserId && (
                  <p className="text-xs text-neutral-400">{t('you')}</p>
                )}
              </div>
              {m.role === 'owner' || m.user_id === currentUserId ? (
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
                  {t(`role_${m.role}`)}
                </span>
              ) : (
                <>
                  <select
                    value={m.role}
                    onChange={(e) =>
                      start(async () => changeRole(m.user_id, e.target.value as MemberRole))
                    }
                    className="rounded-lg border border-neutral-300 px-2 py-1.5 text-xs"
                  >
                    {STAFF_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(`role_${r}`)}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => start(async () => removeMember(m.user_id))}
                    className="p-1 text-neutral-400 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Pending invites */}
      {invites.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">{t('pending')}</h2>
          <div className="divide-y divide-neutral-100">
            {invites.map((i) => (
              <div key={i.id} className="flex items-center gap-2 py-2.5">
                <Mail className="h-4 w-4 text-neutral-300" />
                <span className="min-w-0 flex-1 truncate text-sm">{i.email}</span>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                  {t(`role_${i.role}`)}
                </span>
                <button
                  onClick={() => start(async () => cancelInvite(i.id))}
                  className="p-1 text-neutral-400 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
