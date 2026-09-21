import type { CapacitorConfig } from '@capacitor/cli';

// Kuik: the web app at app.kuik.mx inside a native WebView. Nothing is bundled;
// the shell loads the site (cookies, session and the service worker behave as
// in a browser) and adds what a browser cannot do. The user-agent token is how
// the web knows it is inside this shell (lib/native/shell.ts).
//
// Local dev: KUIK_SERVER_URL=http://<your-mac-ip>:3000 npx cap sync
// (an iOS simulator can use http://localhost:3000; a real device cannot).

const server = (process.env.KUIK_SERVER_URL ?? 'https://app.kuik.mx').replace(/\/$/, '');
const version = '0.1.4';

const config: CapacitorConfig = {
  appId: 'mx.kuik.app',
  appName: 'Kuik',
  webDir: 'www',
  server: {
    url: `${server}/terminal`,
    cleartext: server.startsWith('http://'),
    // Shown when the site cannot be reached at launch (no network yet).
    // Its viewport must NOT say viewport-fit=cover (nor may any page the shell
    // shows): on WebView 140+ Capacitor's SystemBars then stops padding for the
    // status bar and leaves the insets to the page, and a site page restored
    // from history afterwards stays drawn under the clock and battery.
    errorPath: 'error.html',
  },
  ios: {
    appendUserAgent: `KuikApp/${version}`,
    contentInset: 'never',
    backgroundColor: '#111114',
    // Lets WKWebView run the site's service workers (offline shell for /pos):
    // the host must also be listed under WKAppBoundDomains in Info.plist.
    limitsNavigationsToAppBoundDomains: true,
  },
  android: {
    appendUserAgent: `KuikApp/${version}`,
    backgroundColor: '#111114',
    allowMixedContent: false,
  },
};

export default config;
