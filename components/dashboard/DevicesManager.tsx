'use client';

import { useState, useTransition } from 'react';
import { Check, Copy, KeyRound, Loader2, Plus, TabletSmartphone, Trash2, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useLocale, useTranslations } from 'next-intl';
import type { DeviceRole } from '@/lib/database.types';
import { DEVICE_ROLES, NAME_MAX, formatCode, type DeviceStatus } from '@/lib/devices/code';
import { Card, Input, Button } from '@/components/ui';
import { createDevice, renewDeviceCode, revokeDevice, type DeviceResult, type IssuedCode } from '@/app/(dashboard)/staff/device-actions';

/** A device as the team page lists it: what the owner needs, none of the secrets. */
export interface DeviceView {
  id: string;
  name: string;
  role: DeviceRole;
  branchId: string | null;
  status: DeviceStatus;
  /** Whether a login exists: a linked device waiting on a new code still has one. */
  linked: boolean;
  codeExpiresAt: string | null;
  linkedAt: string | null;
  lastSeenAt: string | null;
}

/**
 * Shared devices: tablets, registers and screens that join with a one-time
 * code instead of an account. The owner names one, picks its role and branch,
 * and reads the code to whoever holds the device; here they also see which
 * are in use and take any of them out.
 */
export function DevicesManager({
  devices,
  branches,
  linkUrl,
}: {
  devices: DeviceView[];
  branches: { id: string; name: string }[];
  /** The page a device opens to type its code; the QR carries the code to it. */
  linkUrl: string;
}) {
  const t = useTranslations('devices');
  const tr = useTranslations('staff');
  const locale = useLocale();
  const [name, setName] = useState('');
  const [role, setRole] = useState<DeviceRole>('cashier');
  const [branchId, setBranchId] = useState('');
  const [issued, setIssued] = useState<(IssuedCode & { name: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const when = (iso: string) => new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const branchName = (id: string | null) => (id ? (branches.find((b) => b.id === id)?.name ?? null) : null);

  function show(res: DeviceResult, deviceName: string) {
    if (res.issued) {
      setError(null);
      setCopied(false);
      setIssued({ ...res.issued, name: deviceName });
    } else {
      setError(t(`error_${res.error ?? 'failed'}`));
    }
  }

  function add() {
    const n = name.trim();
    if (!n) return;
    start(async () => {
      const res = await createDevice({ name: n, role, branchId: branchId || null });
      show(res, n);
      if (res.issued) setName('');
    });
  }

  function renew(d: DeviceView) {
    if (d.linked && !window.confirm(t('renewConfirm', { name: d.name }))) return;
    start(async () => show(await renewDeviceCode(d.id), d.name));
  }

  function revoke(d: DeviceView) {
    if (!window.confirm(t(d.linked ? 'revokeConfirm' : 'cancelConfirm', { name: d.name }))) return;
    start(async () => {
      const res = await revokeDevice(d.id);
      if (res.error) setError(t('error_failed'));
      else if (issued?.deviceId === d.id) setIssued(null);
    });
  }

  function copyCode() {
    if (!issued) return;
    navigator.clipboard?.writeText(formatCode(issued.code)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="max-w-2xl space-y-5">
      <Card>
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <TabletSmartphone className="h-4 w-4 text-neutral-400" /> {t('title')}
        </h2>
        <p className="mb-3 text-sm text-neutral-500">{t('hint')}</p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder={t('namePlaceholder')}
            maxLength={NAME_MAX}
            aria-label={t('name')}
            className="min-w-0 flex-1"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as DeviceRole)}
            aria-label={t('role')}
            className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm"
          >
            {DEVICE_ROLES.map((r) => (
              <option key={r} value={r}>
                {tr(`role_${r}`)}
              </option>
            ))}
          </select>
          {branches.length > 0 && (
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              aria-label={t('branch')}
              className="min-w-0 rounded-lg border border-neutral-300 px-3 py-2.5 text-sm sm:max-w-[11rem]"
            >
              <option value="">{t('branchMain')}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          <Button onClick={add} disabled={pending || !name.trim()} className="shrink-0">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {t('generate')}
          </Button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">{t(`roleHint_${role}`)}</p>
        {error && (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        {issued && (
          <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium">{t('codeFor', { name: issued.name })}</p>
              <button type="button" onClick={() => setIssued(null)} aria-label={t('done')} className="-m-1 p-1 text-neutral-400 hover:text-neutral-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <div className="shrink-0 rounded-lg bg-white p-2">
                <QRCodeSVG value={`${linkUrl}?code=${issued.code}`} size={132} level="M" />
              </div>
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <button
                  type="button"
                  onClick={copyCode}
                  title={t('copy')}
                  className="inline-flex items-center gap-2 rounded-lg px-1 font-mono text-3xl font-bold tracking-[0.12em] hover:bg-neutral-200/60"
                >
                  {formatCode(issued.code)}
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-neutral-400" />}
                </button>
                <p className="mt-2 text-sm text-neutral-600">{t('howTo')}</p>
                <p className="mt-1 text-xs text-neutral-500">{t('howToQr')}</p>
                <p className="mt-2 text-xs text-neutral-500" suppressHydrationWarning>
                  {t('codeOnce', { when: when(issued.expiresAt) })}
                </p>
              </div>
            </div>
          </div>
        )}
      </Card>

      {devices.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">{t('list')}</h2>
          <div className="divide-y divide-neutral-100">
            {devices.map((d) => {
              const place = branchName(d.branchId);
              return (
                <div key={d.id} className="flex items-center gap-3 py-2.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${d.status === 'linked' ? 'bg-emerald-500' : d.status === 'pending' ? 'bg-amber-400' : 'bg-neutral-300'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {d.name}
                      <span className="font-normal text-neutral-500">
                        {' · '}
                        {tr(`role_${d.role}`)}
                        {place ? ` · ${place}` : ''}
                      </span>
                    </p>
                    <p className="truncate text-xs text-neutral-500" suppressHydrationWarning>
                      {d.status === 'linked' && d.linkedAt && t('statusLinked', { when: when(d.linkedAt) })}
                      {d.status === 'linked' && d.lastSeenAt && ` · ${t('lastSeen', { when: when(d.lastSeenAt) })}`}
                      {d.status === 'pending' && d.codeExpiresAt && t(d.linked ? 'statusRelinking' : 'statusPending', { when: when(d.codeExpiresAt) })}
                      {d.status === 'expired' && t('statusExpired')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => renew(d)}
                    disabled={pending}
                    title={t('newCode')}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
                  >
                    <KeyRound className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('newCode')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => revoke(d)}
                    disabled={pending}
                    title={t(d.linked ? 'revoke' : 'cancel')}
                    aria-label={t(d.linked ? 'revoke' : 'cancel')}
                    className="shrink-0 p-1.5 text-neutral-400 hover:text-red-500 disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
