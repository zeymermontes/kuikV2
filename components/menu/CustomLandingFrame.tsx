'use client';

import { useEffect, useRef, useState } from 'react';
import { customLandingSrc } from '@/lib/landing';
import { digitsOnly } from '@/lib/utils';
import type { Tenant, TenantContact } from '@/lib/database.types';
import { ReservationSheet } from './ReservationSheet';

/**
 * Full-bleed sandboxed iframe rendering a tenant's uploaded custom landing.
 *
 * The sandbox omits allow-same-origin, so the site runs in an opaque origin and
 * cannot reach our session, cookies, or APIs. That isolation is the whole point
 * — the HTML inside is uploaded by a restaurant and is not trusted — so the one
 * channel it gets is postMessage, handled here.
 *
 * See lib/landing-bridge.ts for the `Kuik.reservar()` helper injected into the
 * page, and lib/landing-vars.ts for the `{{variables}}` substituted on the way
 * out.
 */
export function CustomLandingFrame({
  tenant,
  entryPath,
  contact,
}: {
  tenant: Pick<Tenant, 'id' | 'name' | 'subdomain' | 'custom_domain'>;
  entryPath: string;
  /** Needed to honour a reservation or WhatsApp request from the page. */
  contact?: Pick<TenantContact, 'whatsapp_phone' | 'reservations_enabled' | 'reservation_required'> | null;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [showReserve, setShowReserve] = useState(false);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // The iframe has an opaque origin, so `event.origin` is the string
      // "null" and is worthless for authentication. Checking the source
      // WINDOW is what actually proves this came from our own frame and not
      // from some other tab or an embedded third party.
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;

      const data = event.data as { source?: string; action?: string; payload?: { text?: string } };
      if (data?.source !== 'kuik-landing') return;

      switch (data.action) {
        case 'reserve':
          // Only if the restaurant actually takes reservations; a landing
          // shouldn't be able to conjure a form that was switched off.
          if (contact?.reservations_enabled) setShowReserve(true);
          break;

        case 'whatsapp': {
          if (!contact?.whatsapp_phone) return;
          const text = typeof data.payload?.text === 'string' ? data.payload.text.slice(0, 500) : '';
          const url = `https://wa.me/${digitsOnly(contact.whatsapp_phone)}${
            text ? `?text=${encodeURIComponent(text)}` : ''
          }`;
          window.open(url, '_blank', 'noopener,noreferrer');
          break;
        }

        case 'menu':
          window.location.href = '/menu';
          break;
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [contact]);

  return (
    <>
      <iframe
        ref={frameRef}
        title={tenant.name}
        src={customLandingSrc(tenant, entryPath)}
        sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
        className="fixed inset-0 h-full w-full border-0"
      />
      {showReserve && (
        <ReservationSheet
          tenantId={tenant.id}
          required={contact?.reservation_required ?? null}
          onClose={() => setShowReserve(false)}
        />
      )}
    </>
  );
}
