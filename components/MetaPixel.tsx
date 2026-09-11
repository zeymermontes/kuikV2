'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Script from 'next/script';
import { validPixelId } from '@/lib/pixel';

/**
 * Meta Pixel: the base snippet plus a PageView on load, and one more on every
 * client-side navigation (the app router does not reload the page, so the
 * snippet's own PageView would fire once per visit). Renders nothing without
 * a valid id, so it can sit in a layout unconditionally.
 */
export function MetaPixel({ id }: { id: string | null | undefined }) {
  const pathname = usePathname();
  const first = useRef(true);
  const ok = validPixelId(id);

  useEffect(() => {
    if (!ok) return;
    if (first.current) {
      first.current = false; // the snippet fires the first PageView itself
      return;
    }
    const fbq = (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq;
    fbq?.('track', 'PageView');
  }, [pathname, ok]);

  if (!ok) return null;
  return (
    <>
      <Script id={`meta-pixel-${id}`} strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${id}');fbq('track','PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img height="1" width="1" style={{ display: 'none' }} alt="" src={`https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1`} />
      </noscript>
    </>
  );
}
