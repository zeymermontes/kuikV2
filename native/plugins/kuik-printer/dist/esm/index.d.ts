export interface SendTcpOptions { host: string; port: number; data: string; timeoutMs?: number; }
export interface KuikPrinterPlugin { sendTcp(options: SendTcpOptions): Promise<void>; }
export declare const KuikPrinter: KuikPrinterPlugin;
