// The status bar's space inside the Android shells.
//
// Capacitor's SystemBars decides who keeps the page clear of the clock and
// battery: it pads the WebView itself, unless the page says viewport-fit=cover,
// in which case the page is trusted to do it. It asks the page once, at
// DOMContentLoaded, and remembers the answer.
//
// That memory can be wrong. An older build of the apps showed its "no
// connection" page with viewport-fit=cover; when the site came back from the
// history afterwards, no DOMContentLoaded fired, the answer stayed "the page
// does it", and every screen was drawn under the status bar until the app was
// killed. No page of the site asks for cover, so asking again is always
// right: the shell looks at this document and pads as it should.
//
// A no-op in a browser, on iOS and in shells without SystemBars.

interface SystemBarsInterface {
  onDOMReady?: () => void;
}

declare global {
  interface Window {
    CapacitorSystemBarsAndroidInterface?: SystemBarsInterface;
  }
}

/** Have the Android shell decide again, from this page, whether it pads for the status bar. */
export function recheckInsets(): void {
  if (typeof window === 'undefined') return;
  try {
    window.CapacitorSystemBarsAndroidInterface?.onDOMReady?.();
  } catch {
    // an interface that will not answer leaves things as they were
  }
}
