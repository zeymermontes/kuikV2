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
//
// And there is a second, plainer way to end up under the clock, which is the
// one that reached a restaurant's phone. The phone app carries Capacitor's
// StatusBar plugin, whose default is to let the page run BEHIND the status
// bar ("overlaysWebView"). On Android 15 and later nobody notices: the system
// draws edge to edge anyway and SystemBars pads the WebView. On Android 14
// and earlier SystemBars does not pad, the plugin's default stands, and the
// top of every screen sits under the time and the signal. The page tells the
// plugin to stop (keepBelowStatusBar), so phones that already have the app
// are fixed without a new build.

import { capacitorPlatform, capacitorPlugin } from '@/lib/native/shell';

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

/** The bar's own colour once the page no longer runs behind it: the apps' dark. */
const BAR_COLOR = '#111114';

/**
 * Have the phone app lay the page out below Android's status bar instead of
 * behind it, and give the bar a background of its own. Setting the colour
 * also makes the plugin pick readable icons for it, which a rotation undoes,
 * so this is safe (and meant) to be called again.
 *
 * Android only. On Android 15+ both calls do nothing the system honours; in
 * the Terminal app and in a browser the plugin is not there and the call
 * fails quietly.
 */
export async function keepBelowStatusBar(): Promise<void> {
  if (capacitorPlatform() !== 'android') return;
  const bar = capacitorPlugin('StatusBar');
  if (!bar) return;
  try {
    await bar.setOverlaysWebView?.({ overlay: false });
    await bar.setBackgroundColor?.({ color: BAR_COLOR });
  } catch {
    // a shell without the plugin: nothing was overlaying to begin with
  }
}
