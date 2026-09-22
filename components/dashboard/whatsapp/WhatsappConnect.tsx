'use client';

import { useEffect, useRef, useState } from 'react';
import { Link2, Unlink, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card, Button } from '@/components/ui';

/**
 * Meta's Embedded Signup, in two flavours the owner picks first:
 *
 *  - Coexistence (`featureType: 'whatsapp_business_app_onboarding'`): the
 *    number they already use in the WhatsApp Business app keeps working on
 *    the phone, and Kuik joins as another channel.
 *  - Cloud API: a new or dedicated number added inside the popup, registered
 *    for the API by the server afterwards.
 *
 * Two pieces of information arrive by different routes — the `code` through
 * the FB.login callback, the WABA and phone ids through a window `message`
 * event — so both have to be collected before the server call. The event's
 * name differs per flavour, and there is a third one, FINISH_ONLY_WABA, for a
 * signup that ended without a number: worth naming, because a username-only
 * account looks finished from the outside.
 */

type Mode = 'coexistence' | 'cloud_api';

interface SessionInfo {
  waba_id?: string;
  phone_number_id?: string;
  /** Set when the popup ended with a WABA but no number in it. */
  no_phone?: boolean;
}

interface ConnectedNumber {
  phone_number_id: string;
  display_phone_number: string;
  verified_name: string | null;
  status: string;
  quality_rating: string | null;
}

declare global {
  interface Window {
    FB?: {
      init: (o: Record<string, unknown>) => void;
      login: (cb: (r: { authResponse?: { code?: string } }) => void, o: Record<string, unknown>) => void;
    };
  }
}

const FINISHED = new Set(['FINISH', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING']);

export function WhatsappConnect({ numbers }: { numbers: ConnectedNumber[] }) {
  const t = useTranslations('whatsapp');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  // A ref, not state: the FB.login callback reads it after the message event
  // wrote it, and neither is a render.
  const session = useRef<SessionInfo>({});
  const [mode, setMode] = useState<Mode>('coexistence');

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID;
  const configured = Boolean(appId && configId);

  useEffect(() => {
    if (!configured) return;

    // The ids we need never appear in the FB.login callback — only here.
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith('facebook.com')) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
        if (FINISHED.has(data.event)) {
          session.current = { waba_id: data.data?.waba_id, phone_number_id: data.data?.phone_number_id };
        } else if (data.event === 'FINISH_ONLY_WABA') {
          session.current = { waba_id: data.data?.waba_id, no_phone: true };
        } else if (data.event === 'CANCEL') {
          session.current = {};
          setError(data.data?.error_message ? 'connect_failed' : 'abandoned');
          setDetail(data.data?.error_message ?? null);
        }
      } catch {
        // Facebook posts plenty of unrelated messages; ignore the noise.
      }
    };
    window.addEventListener('message', onMessage);

    // Loading the SDK is external work; the state update happens in its
    // callback rather than synchronously in the effect body.
    const script = document.createElement('script');
    let cancelled = false;

    if (window.FB) {
      queueMicrotask(() => {
        if (!cancelled) setReady(true);
      });
    } else {
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.onload = () => {
        // fedCM off: on Chrome the SDK otherwise routes FB.login through the
        // browser's federated sign-in, which runs a plain OAuth request and
        // ignores config_id — Chrome then shows "kuik.mx can't continue using
        // facebook.com" and the Embedded Signup popup never opens.
        window.FB?.init({ appId, version: 'v23.0', xfbml: false, cookie: true, fedCM: false });
        if (!cancelled) setReady(true);
      };
      document.body.appendChild(script);
    }

    return () => {
      cancelled = true;
      window.removeEventListener('message', onMessage);
      script.remove();
    };
  }, [appId, configured]);

  async function finish(code: string, info: SessionInfo) {
    if (info.no_phone || !info.phone_number_id) {
      setError('no_phone');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/whatsapp/onboard', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, wabaId: info.waba_id, phoneNumberId: info.phone_number_id, mode }),
      });
      const json = await res.json();
      if (json.ok) window.location.reload();
      else {
        setError(json.error ?? 'connect_failed');
        setDetail(json.detail ?? null);
      }
    } catch {
      setError('connect_failed');
    } finally {
      setBusy(false);
    }
  }

  function connect() {
    if (!window.FB || !configId) return;
    setError(null);
    setDetail(null);
    session.current = {};
    // The callback must be a plain function: the SDK type-checks it and throws
    // "Expression is of type asyncfunction, not function" on an async one —
    // before opening anything, so the click looks like it did nothing.
    window.FB.login(
      (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setError('cancelled');
          return;
        }
        // The session-info event lands before this callback.
        void finish(code, session.current);
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          sessionInfoVersion: '3',
          ...(mode === 'coexistence' ? { featureType: 'whatsapp_business_app_onboarding' } : {}),
        },
      },
    );
  }

  async function disconnect(phoneNumberId: string) {
    setBusy(true);
    try {
      await fetch('/api/whatsapp/disconnect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phoneNumberId }),
      });
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  const requirements =
    mode === 'coexistence'
      ? ['req_app', 'req_active', 'req_keeps_working', 'req_no_groups', 'req_no_history']
      : ['req_cloud_not_on_phone', 'req_cloud_verify', 'req_cloud_username', 'req_cloud_window'];

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">{t('connectTitle')}</h2>
        <p className="text-sm text-neutral-500">{t('connectHint')}</p>
      </div>

      {numbers.length > 0 ? (
        <div className="space-y-2">
          {numbers.map((n) => (
            <div key={n.phone_number_id} className="flex items-center gap-3 rounded-lg border border-neutral-200 p-3">
              {n.status === 'connected' ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{n.display_phone_number}</p>
                <p className="text-xs text-neutral-500">
                  {n.verified_name ?? '—'} · {t.has(`status_${n.status}`) ? t(`status_${n.status}`) : n.status}
                  {n.quality_rating ? ` · ${n.quality_rating}` : ''}
                </p>
              </div>
              <Button variant="secondary" onClick={() => disconnect(n.phone_number_id)} disabled={busy}>
                <Unlink className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">{t('connect_modeTitle')}</legend>
            {(['coexistence', 'cloud_api'] as Mode[]).map((m) => (
              <label
                key={m}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
                  mode === m ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200'
                }`}
              >
                <input
                  type="radio"
                  name="wa-mode"
                  className="mt-1"
                  checked={mode === m}
                  onChange={() => { setMode(m); setError(null); }}
                />
                <span>
                  <span className="block font-medium">{t(m === 'coexistence' ? 'connect_mode_coexistence' : 'connect_mode_cloud')}</span>
                  <span className="block text-xs text-neutral-500">
                    {t(m === 'coexistence' ? 'connect_mode_coexistence_hint' : 'connect_mode_cloud_hint')}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          {/* Meta's own requirements, stated before the popup rather than
              after it fails: these are the reasons onboarding gets rejected. */}
          <ul className="space-y-1 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-600">
            {requirements.map((k) => (
              <li key={k}>· {t(k)}</li>
            ))}
          </ul>

          {configured ? (
            <Button onClick={connect} disabled={!ready || busy}>
              <Link2 className="h-4 w-4" /> {busy ? t('connecting') : t('connect')}
            </Button>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t('notConfigured')}</p>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {t.has(`err_${error}`) ? t(`err_${error}`) : error}
          {detail && <span className="mt-1 block text-xs text-red-600">{detail}</span>}
        </p>
      )}
    </Card>
  );
}
