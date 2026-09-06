import { registerPlugin } from '@capacitor/core';
import type { KuikPrinterPlugin } from './definitions';

export const KuikPrinter = registerPlugin<KuikPrinterPlugin>('KuikPrinter');
export * from './definitions';
