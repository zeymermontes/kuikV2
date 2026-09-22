'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardCopy,
  Cloud,
  ExternalLink,
  KeyRound,
  Unlink,
} from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';

/**
 * The official route, done by hand.
 *
 * A restaurant that would rather not link a phone through the unofficial
 * bridge can create its own Meta app, register the number there and paste the
 * ids, a permanent token and the app secret here. The guide walks the whole
 * way — developer account to webhook — because the Meta side is where people
 * get lost, not the form.
 *
 * Collapsed by default while the QR path is the norm; open when a number came
 * in this way, since the webhook details below are what the owner needs next.
 */

interface CloudNumber {
  phone_number_id: string;
  display_phone_number: string;
  verified_name: string | null;
  status: string;
  quality_rating: string | null;
}

const STEP_LINKS: Record<string, string> = {
  developer: 'https://developers.facebook.com/',
  business: 'https://business.facebook.com/',
  app: 'https://developers.facebook.com/apps/',
  systemUser: 'https://business.facebook.com/settings/system-users',
  manager: 'https://business.facebook.com/wa/manage/home/',
};

const STEPS = [
  'developer',
  'business',
  'app',
  'product',
  'number',
  'ids',
  'token',
  'secret',
  'connect',
  'webhook',
  'live',
  'billing',
] as const;

export function WhatsappCloudSetup({
  number,
  bridgeLive,
  webhookUrl,
  verifyToken,
  canConnect,
}: {
  /** The number connected through the restaurant's own app, if any. */
  number: CloudNumber | null;
  /** A phone is paired (or pairing) through the bridge; it has to be unlinked first. */
  bridgeLive: boolean;
  webhookUrl: string;
  /** Only the owner sees it; the route that mints it is owner-only too. */
  verifyToken: string | null;
  canConnect: boolean;
}) {
  const t = useTranslations('whatsapp');
  const connected = number?.status === 'connected';

  const [open, setOpen] = useState(connected);
  const [form, setForm] = useState({ phoneNumberId: '', wabaId: '', token: '', appSecret: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // No clipboard: the value is on screen and can be selected.
    }
  }

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/whatsapp/cloud', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.ok) window.location.reload();
      else setError(json.error ?? 'connect_failed');
    } catch {
      setError('connect_failed');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!number || !confirm(t('cloud_disconnectConfirm'))) return;
    setBusy(true);
    try {
      await fetch('/api/whatsapp/disconnect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phoneNumberId: number.phone_number_id }),
      });
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  const ready =
    /^\d{6,}$/.test(form.phoneNumberId.trim()) &&
    /^\d{6,}$/.test(form.wabaId.trim()) &&
    form.token.trim().length >= 20 &&
    form.appSecret.trim().length >= 16;

  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2 font-semibold">
            <Cloud className="h-4 w-4 text-sky-600" /> {t('cloud_title')}
            {connected && <CheckCircle2 className="h-4 w-4 text-green-600" />}
          </span>
          <span className="mt-0.5 block text-sm text-neutral-500">
            {connected ? number?.display_phone_number : t('cloud_hint')}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-neutral-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-neutral-200 px-5 py-4">
          {connected && number ? (
            <>
              <div className="flex items-center gap-3 rounded-lg border border-neutral-200 p-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{number.display_phone_number}</p>
                  <p className="text-xs text-neutral-500">
                    {number.verified_name ?? '—'} · {t('status_connected')}
                    {number.quality_rating ? ` · ${number.quality_rating}` : ''}
                  </p>
                </div>
                {canConnect && (
                  <Button variant="secondary" onClick={disconnect} disabled={busy} aria-label={t('cloud_disconnect')}>
                    <Unlink className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* What Meta still needs from them. The connection is only half
                  done until the webhook on their app points here. */}
              <div className="space-y-3 rounded-lg bg-neutral-50 p-3">
                <p className="text-sm font-medium">{t('cloud_webhookTitle')}</p>
                <p className="text-xs text-neutral-600">{t('cloud_webhookHint')}</p>
                <CopyRow label={t('cloud_webhookUrl')} value={webhookUrl} copied={copied === 'url'} onCopy={() => copy('url', webhookUrl)} copyLabel={t('cloud_copy')} />
                {verifyToken ? (
                  <CopyRow label={t('cloud_verifyToken')} value={verifyToken} copied={copied === 'vt'} onCopy={() => copy('vt', verifyToken)} copyLabel={t('cloud_copy')} />
                ) : (
                  <p className="text-xs text-neutral-500">{t('cloud_verifyTokenOwnerOnly')}</p>
                )}
                <p className="text-xs text-neutral-600">{t('cloud_webhookFields')}</p>
              </div>

              <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t('cloud_templatesNote')}
              </p>
            </>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg bg-green-50 p-3 text-xs text-green-900">
                  <p className="font-medium">{t('cloud_prosTitle')}</p>
                  <ul className="mt-1 space-y-0.5">
                    <li>· {t('cloud_pro_official')}</li>
                    <li>· {t('cloud_pro_buttons')}</li>
                    <li>· {t('cloud_pro_no_phone')}</li>
                  </ul>
                </div>
                <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-medium">{t('cloud_consTitle')}</p>
                  <ul className="mt-1 space-y-0.5">
                    <li>· {t('cloud_con_leaves_phone')}</li>
                    <li>· {t('cloud_con_window')}</li>
                    <li>· {t('cloud_con_paperwork')}</li>
                  </ul>
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">{t('cloud_guideTitle')}</p>
                <ol className="space-y-3">
                  {STEPS.map((step, i) => (
                    <li key={step} className="flex gap-3 text-sm">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {t(`cloud_step_${step}_title`)}
                          {STEP_LINKS[step] && (
                            <a
                              href={STEP_LINKS[step]}
                              target="_blank"
                              rel="noreferrer"
                              className="ml-2 inline-flex items-center gap-0.5 text-xs font-normal text-sky-700 underline"
                            >
                              {t('cloud_open')} <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </p>
                        <p className="mt-0.5 whitespace-pre-line text-xs text-neutral-600">{t(`cloud_step_${step}_body`)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              {/* The form is step 9 of the guide; everything above it is done
                  on Meta's side. */}
              <div className="space-y-3 rounded-xl border border-neutral-200 p-4">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <KeyRound className="h-4 w-4" /> {t('cloud_formTitle')}
                </p>

                {bridgeLive && (
                  <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t('cloud_bridgeLive')}
                  </p>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-neutral-700">{t('cloud_field_phoneNumberId')}</span>
                    <Input inputMode="numeric" placeholder="1234567890123456" value={form.phoneNumberId} onChange={set('phoneNumberId')} />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-neutral-700">{t('cloud_field_wabaId')}</span>
                    <Input inputMode="numeric" placeholder="1234567890123456" value={form.wabaId} onChange={set('wabaId')} />
                  </label>
                </div>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-neutral-700">{t('cloud_field_token')}</span>
                  <Input type="password" autoComplete="off" placeholder="EAAG…" value={form.token} onChange={set('token')} />
                  <span className="mt-1 block text-xs text-neutral-500">{t('cloud_field_tokenHint')}</span>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-neutral-700">{t('cloud_field_appSecret')}</span>
                  <Input type="password" autoComplete="off" placeholder="a1b2c3…" value={form.appSecret} onChange={set('appSecret')} />
                  <span className="mt-1 block text-xs text-neutral-500">{t('cloud_field_appSecretHint')}</span>
                </label>

                {canConnect ? (
                  <Button onClick={connect} disabled={!ready || busy || bridgeLive}>
                    <Cloud className="h-4 w-4" /> {busy ? t('connecting') : t('cloud_connect')}
                  </Button>
                ) : (
                  <p className="text-xs text-neutral-500">{t('cloud_ownerOnly')}</p>
                )}

                {error && (
                  <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {t.has(`err_${error}`) ? t(`err_${error}`) : error}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function CopyRow({
  label,
  value,
  copied,
  onCopy,
  copyLabel,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  copyLabel: string;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-neutral-700">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs">{value}</code>
        <Button variant="secondary" className="px-2.5 py-1.5 text-xs" onClick={onCopy} aria-label={copyLabel}>
          {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}
