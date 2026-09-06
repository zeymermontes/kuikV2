export interface SendTcpOptions {
  host: string;
  port: number;
  /** ESC/POS bytes, base64. */
  data: string;
  /** Connect + write deadline; default 8000. */
  timeoutMs?: number;
}

/**
 * The one thing a WebView cannot do that a receipt printer needs: open a
 * socket. The web app renders ESC/POS (lib/pos/escpos.ts) and hands the
 * bytes here; the native side connects to host:port, writes, waits a moment
 * for the printer to drain, and closes. Rejects with the socket error text,
 * which the POS shows as the job's failure reason.
 */
export interface KuikPrinterPlugin {
  sendTcp(options: SendTcpOptions): Promise<void>;
}
