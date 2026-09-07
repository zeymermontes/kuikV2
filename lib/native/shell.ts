// The native shells (native/) show this same web app inside a WebView. Each
// shell appends a token to the user agent, so the web knows where it runs and
// can lean on what the shell adds: a TCP socket to a printer, push tokens, a
// second window. Nothing here imports a native SDK; the shells inject their
// bridges into the page (Capacitor's `window.Capacitor`, Electron's
// `window.kuikDesktop`), and this file is the one place that reads them.
//
//   KuikTerminal/<v>  tablet app: POS, KDS, host stand, customer screen (native/terminal)
//   KuikApp/<v>       phone app: dashboard with native push (native/mobile)
//   KuikDesktop/<v>   register PC: Electron with the print agent inside (native/desktop)

export type Shell = 'browser' | 'terminal' | 'mobile' | 'desktop';

interface CapacitorPluginProxy {
  [method: string]: ((...args: unknown[]) => Promise<unknown>) | undefined;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, CapacitorPluginProxy | undefined>;
  registerPlugin?: (name: string) => CapacitorPluginProxy;
}

/** What native/desktop's preload exposes (contextBridge) to the page. */
export interface DesktopBridge {
  version: string;
  /** Whether the bundled print agent is running, and its last error. */
  agentStatus: () => Promise<{ running: boolean; error: string | null; port: number }>;
  /** Open (or focus) the customer screen on the second display, if there is one. */
  openCustomerScreen: (url: string) => Promise<boolean>;
  setKiosk: (on: boolean) => Promise<void>;
  /**
   * Quit and install the update electron-updater has already downloaded;
   * false when none is ready yet (it then checks again). Missing on shells
   * built before this call existed.
   */
  installUpdate?: () => Promise<boolean>;
}

declare global {
  interface Window {
    Capacitor?: CapacitorGlobal;
    kuikDesktop?: DesktopBridge;
  }
}

const UA_TOKENS: [RegExp, Shell][] = [
  [/KuikTerminal\//, 'terminal'],
  [/KuikApp\//, 'mobile'],
  [/KuikDesktop\//, 'desktop'],
];

/** Which shell the page runs in; 'browser' on the server and in any plain browser. */
export function shell(ua?: string | null): Shell {
  const s = ua ?? (typeof navigator === 'undefined' ? '' : navigator.userAgent);
  for (const [re, name] of UA_TOKENS) if (re.test(s)) return name;
  return 'browser';
}

/** The shell's version from its user-agent token ("KuikTerminal/0.1.0"), or null in a browser. */
export function shellVersion(ua?: string | null): string | null {
  const s = ua ?? (typeof navigator === 'undefined' ? '' : navigator.userAgent);
  const m = /Kuik(?:Terminal|App|Desktop)\/([0-9][0-9.]*)/.exec(s);
  return m ? m[1] : null;
}

export function isNativeShell(): boolean {
  return shell() !== 'browser';
}

/** The OS under a Capacitor shell ('android' | 'ios'), or null elsewhere; the desktop shell reports nothing here. */
export function capacitorPlatform(): 'android' | 'ios' | null {
  if (typeof window === 'undefined') return null;
  const p = window.Capacitor?.getPlatform?.();
  return p === 'android' || p === 'ios' ? p : null;
}

/** A Capacitor plugin proxy by name, or null outside the Capacitor shells. */
export function capacitorPlugin(name: string): CapacitorPluginProxy | null {
  if (typeof window === 'undefined') return null;
  const cap = window.Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  const fromRegistry = cap.Plugins?.[name];
  if (fromRegistry) return fromRegistry;
  try {
    return cap.registerPlugin?.(name) ?? null;
  } catch {
    return null;
  }
}

export interface NativePrinter {
  /** Write ESC/POS bytes (base64) to host:port and close. Rejects with the socket error. */
  sendTcp: (o: { host: string; port: number; data: string; timeoutMs?: number }) => Promise<void>;
}

/** The Terminal app's raw printer socket (native/plugins/kuik-printer), or null. */
export function nativePrinter(): NativePrinter | null {
  const p = capacitorPlugin('KuikPrinter');
  if (!p?.sendTcp) return null;
  return { sendTcp: (o) => p.sendTcp!(o) as Promise<void> };
}

export type PushPermission = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';

export interface NativePush {
  checkPermissions: () => Promise<{ receive: PushPermission }>;
  requestPermissions: () => Promise<{ receive: PushPermission }>;
  register: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addListener: (event: string, cb: (data: any) => void) => Promise<{ remove: () => Promise<void> }>;
}

/** Capacitor's push plugin (native/mobile), or null. */
export function nativePush(): NativePush | null {
  const p = capacitorPlugin('PushNotifications');
  if (!p?.register || !p.addListener) return null;
  return p as unknown as NativePush;
}

export function desktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  return window.kuikDesktop ?? null;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
