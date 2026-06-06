'use client';

import { Check } from 'lucide-react';
import { MENU_FONTS, CUSTOM_FONT } from '@/lib/config';

// Load every offered font so each option can preview in its own typeface.
function allFontsHref(): string {
  const families = MENU_FONTS.map((f) => `family=${f.trim().replace(/ /g, '+')}:wght@400;600`).join('&');
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

export function FontPicker({
  value,
  onChange,
  customFontUrl,
  customFontName,
}: {
  value: string;
  onChange: (font: string) => void;
  customFontUrl?: string | null;
  customFontName?: string | null;
}) {
  const options: { value: string; label: string }[] = [
    ...MENU_FONTS.map((f) => ({ value: f, label: f })),
    ...(customFontUrl ? [{ value: CUSTOM_FONT, label: customFontName || 'Fuente propia' }] : []),
  ];

  return (
    <>
      <link rel="stylesheet" href={allFontsHref()} />
      {customFontUrl && (
        <style>{`@font-face{font-family:'${CUSTOM_FONT}';src:url('${customFontUrl}');font-display:swap;}`}</style>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const selected = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`flex items-center justify-between rounded-xl border p-3 text-left transition ${
                selected ? 'border-neutral-900 ring-1 ring-neutral-900' : 'border-neutral-200 hover:bg-neutral-50'
              }`}
              style={{ fontFamily: `'${o.value}', sans-serif` }}
            >
              <span className="min-w-0">
                <span className="block truncate text-base font-semibold">{o.label}</span>
                <span className="block truncate text-xs opacity-60">Tu Restaurante · Abc 123</span>
              </span>
              {selected && <Check className="ml-2 h-4 w-4 shrink-0 text-neutral-900" />}
            </button>
          );
        })}
      </div>
    </>
  );
}
