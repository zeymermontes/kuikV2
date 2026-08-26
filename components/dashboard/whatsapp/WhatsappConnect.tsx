'use client';

import { useEffect, useState } from 'react';
import { Link2, Unlink, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card, Button } from '@/components/ui';

/**
 * Meta's Embedded Signup, in the Coexistence flavour.
 *
 * `featureType: 'whatsapp_business_app_onboarding'` is the whole trick: it
 * picks the path that leaves the number working in the restaurant's WhatsApp
 * Business app instead of migrating it away from the phone.
 *
 * Two pieces of information arrive by different routes — the `code` through the
 * FB.login callback, the WABA and phone ids through a window `message` event —
 * so both have to be collected before the server call.
 */

interface SessionInfo {
  waba_id?: string;
  phone_number_id?: string;
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

export function WhatsappConnect({ numbers }: { numbers: ConnectedNumber[] }) {
  const t = useTranslations('whatsapp');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionInfo>({});

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
        if (data?.type === 'WA_EMBEDDED_SIGNUP' && data.event === 'FINISH') {
          setSession({ waba_id: data.data?.waba_id, phone_number_id: data.data?.phone_number_id });
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
        window.FB?.init({ appId, version: 'v23.0', xfbml: false, cookie: true });
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

  function connect() {
    if (!window.FB || !configId) return;
    setError(null);
    window.FB.login(
      async (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setError('cancelled');
          return;
        }
        setBusy(true);
        try {
          const res = await fetch('/api/whatsapp/onboard', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code, wabaId: session.waba_id, phoneNumberId: session.phone_number_id }),
          });
          const json = await res.json();
          if (json.ok) window.location.reload();
          else setError(json.error ?? 'connect_failed');
        } catch {
          setError('connect_failed');
        } finally {
          setBusy(false);
        }
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: '3',
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
          {/* Meta's own requirements, stated before the popup rather than
              after it fails: these are the reasons onboarding gets rejected. */}
          <ul className="space-y-1 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-600">
            <li>· {t('req_app')}</li>
            <li>· {t('req_active')}</li>
            <li>· {t('req_keeps_working')}</li>
            <li>· {t('req_no_groups')}</li>
            <li>· {t('req_no_history')}</li>
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
        </p>
      )}
    </Card>
  );
}
