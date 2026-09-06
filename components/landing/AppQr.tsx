'use client';

import { QRCodeSVG } from 'qrcode.react';

/** A download link as a QR, for someone reading kuik.mx/apps on a computer. */
export function AppQr({ value, size = 96 }: { value: string; size?: number }) {
  return <QRCodeSVG value={value} size={size} level="M" aria-label="Código QR de descarga" />;
}
