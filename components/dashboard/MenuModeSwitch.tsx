'use client';

import { useRef, useState } from 'react';
import { FileText, Loader2, X, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { MenuMode } from '@/lib/database.types';
import { uploadFile } from '@/lib/upload';
import { Card } from '@/components/ui';
import { updateTheme } from '@/app/(dashboard)/settings-actions';

export function MenuModeSwitch({
  tenantId,
  mode,
  pdfUrl,
}: {
  tenantId: string;
  mode: MenuMode;
  pdfUrl: string | null;
}) {
  const t = useTranslations('menuEditor');
  const [m, setM] = useState<MenuMode>(mode);
  const [url, setUrl] = useState<string | null>(pdfUrl);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function setMode(next: MenuMode) {
    setM(next);
    updateTheme({ menu_mode: next });
  }

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const u = await uploadFile(file, tenantId, 'menu-pdf');
      setUrl(u);
      updateTheme({ menu_pdf_url: u, menu_mode: 'pdf' });
      setM('pdf');
    } catch {
      // upload errors are rare and retryable
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-5">
      <h2 className="mb-1 font-semibold">{t('menuMode')}</h2>
      <p className="mb-3 text-sm text-neutral-500">{t('menuModeHint')}</p>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setMode('builder')}
          className={`rounded-xl border p-3 text-left transition ${
            m === 'builder' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'
          }`}
        >
          <span className="block text-sm font-semibold">{t('modeBuilder')}</span>
          <span className="block text-xs opacity-70">{t('modeBuilderHint')}</span>
        </button>
        <button
          onClick={() => setMode('pdf')}
          className={`rounded-xl border p-3 text-left transition ${
            m === 'pdf' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'
          }`}
        >
          <span className="block text-sm font-semibold">{t('modePdf')}</span>
          <span className="block text-xs opacity-70">{t('modePdfHint')}</span>
        </button>
      </div>

      {m === 'pdf' && (
        <div className="mt-4 rounded-xl bg-neutral-50 p-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium hover:bg-neutral-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {url ? t('replacePdf') : t('uploadPdf')}
            </button>
            {url && (
              <>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-sm text-neutral-600 hover:underline"
                >
                  <ExternalLink className="h-4 w-4" /> {t('viewPdf')}
                </a>
                <button
                  onClick={() => {
                    setUrl(null);
                    updateTheme({ menu_pdf_url: null });
                  }}
                  className="ml-auto flex items-center gap-1 text-sm text-neutral-400 hover:text-red-500"
                >
                  <X className="h-3.5 w-3.5" /> {t('removePdf')}
                </button>
              </>
            )}
          </div>
          {!url && <p className="mt-2 text-xs text-amber-600">{t('pdfNeeded')}</p>}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />
        </div>
      )}
    </Card>
  );
}
