'use client';

import { useRef, useState } from 'react';
import { Printer, Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { Card, Label, Button } from '@/components/ui';

export function TableQRs({ baseUrl, name }: { baseUrl: string; name: string }) {
  const t = useTranslations('tables');
  const [count, setCount] = useState(8);
  const gridRef = useRef<HTMLDivElement>(null);

  const tables = Array.from({ length: count }, (_, i) => i + 1);
  const urlFor = (n: number) => `${baseUrl}/menu?mesa=${n}`;

  function printQRs() {
    const w = window.open('', '_blank', 'width=820,height=900');
    if (!w || !gridRef.current) return;
    w.document.write(
      `<html><head><title>${name} — QR</title><style>
        body{font-family:system-ui,sans-serif;margin:24px}
        .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
        .qr-card{border:1px solid #e5e5e5;border-radius:12px;padding:16px;text-align:center;break-inside:avoid}
        .qr-card h3{margin:0 0 4px;font-size:18px}
        .qr-card p{margin:6px 0 0;font-size:12px;color:#888}
      </style></head><body><div class="grid">${gridRef.current.innerHTML}</div></body></html>`,
    );
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">{t('title')}</h2>
        <p className="text-sm text-neutral-500">{t('subtitle')}</p>
      </div>

      <div className="flex items-end gap-4">
        <div>
          <Label>{t('count')}</Label>
          <div className="flex items-center gap-2 rounded-lg border border-neutral-300 px-2 py-1.5">
            <button onClick={() => setCount((c) => Math.max(1, c - 1))} className="p-1 text-neutral-500">
              <Minus className="h-4 w-4" />
            </button>
            <span className="min-w-8 text-center text-sm font-semibold">{count}</span>
            <button onClick={() => setCount((c) => Math.min(50, c + 1))} className="p-1 text-neutral-500">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
        <Button onClick={printQRs}>
          <Printer className="h-4 w-4" /> {t('print')}
        </Button>
      </div>

      <div ref={gridRef} className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {tables.map((n) => (
          <div
            key={n}
            className="qr-card"
            style={{ border: '1px solid #e5e5e5', borderRadius: 12, padding: 16, textAlign: 'center' }}
          >
            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>
              {t('table')} {n}
            </h3>
            <QRCodeSVG value={urlFor(n)} size={130} />
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#888' }}>{name}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
