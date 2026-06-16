'use client';

import { useRef, useState, useTransition } from 'react';
import { ExternalLink, Upload, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  uploadCustomLanding,
  clearCustomLanding,
  setLandingMode,
} from '@/app/(dashboard)/admin/actions';

type Mode = 'builder' | 'custom' | 'none';

/**
 * Super-admin per-tenant landing controls:
 *   - a 3-way selector for what the QR/home shows (template / custom / none),
 *   - upload (or replace) the custom static site (.zip with index.html),
 *   - remove the custom site.
 * Uploading only stores the files; the selector decides what's actually shown.
 */
export function LandingControls({
  tenantId,
  mode,
  hasCustom,
  previewUrl,
}: {
  tenantId: string;
  mode: Mode;
  hasCustom: boolean;
  // Direct URL to the uploaded site (with menu/home params). Lets the
  // super-admin view it even when the live mode isn't 'custom'. Null if none.
  previewUrl: string | null;
}) {
  const t = useTranslations('superAdmin');
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.append('site', file);
    startTransition(async () => {
      const res = await uploadCustomLanding(tenantId, formData);
      if ('error' in res) setError(t(`landingErr_${res.error}`));
    });
  }

  function onChangeMode(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Mode;
    setError(null);
    startTransition(() => setLandingMode(tenantId, next));
  }

  function onClear() {
    if (!confirm(t('landingClearConfirm'))) return;
    setError(null);
    startTransition(() => clearCustomLanding(tenantId));
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={mode}
        onChange={onChangeMode}
        disabled={pending}
        className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-50"
      >
        <option value="builder">{t('landingModeBuilder')}</option>
        <option value="custom" disabled={!hasCustom}>
          {t('landingModeCustom')}
        </option>
        <option value="none">{t('landingModeNone')}</option>
      </select>

      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        onChange={onPick}
        className="hidden"
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        title={t('landingUploadHint')}
        className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
      >
        <Upload className="h-3.5 w-3.5" />
        {hasCustom ? t('landingReplace') : t('landingUpload')}
      </button>

      {previewUrl && (
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          title={t('landingPreviewHint')}
          className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {t('landingPreview')}
        </a>
      )}

      {hasCustom && (
        <button
          onClick={onClear}
          disabled={pending}
          title={t('landingClear')}
          className="rounded-lg border border-neutral-200 p-1.5 text-neutral-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
