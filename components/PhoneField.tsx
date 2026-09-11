'use client';

import { useState } from 'react';
import { PHONE_COUNTRIES, joinPhone, phoneLooksValid, splitPhone } from '@/lib/phone-countries';

/**
 * A phone number as two controls: the country (Mexico by default) and the
 * national digits. What goes up through `onChange` is one E.164 string
 * ("+526621234567") or '' — so WhatsApp lookups, wa.me links and the bot's
 * contact matching all see the same canonical number, whichever screen it
 * was typed on.
 *
 * `dark` picks the host stand's palette; the default is the office's.
 */
export function PhoneField({
  value,
  onChange,
  dark = false,
  placeholder,
  autoFocus,
  id,
}: {
  value: string | null | undefined;
  onChange: (e164: string) => void;
  dark?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  id?: string;
}) {
  // The picker keeps its own halves so a half-typed number is not re-split
  // from the E.164 on every keystroke (which would eat a leading zero, say).
  const [parts, setParts] = useState(() => splitPhone(value));
  const [seen, setSeen] = useState(value ?? '');
  if ((value ?? '') !== seen) {
    // The parent changed the number from outside (a reset, another record).
    setSeen(value ?? '');
    setParts(splitPhone(value));
  }

  const update = (iso: string, national: string) => {
    setParts({ iso, national });
    const next = joinPhone(iso, national);
    setSeen(next);
    onChange(next);
  };

  const box = dark
    ? 'rounded-xl border border-white/10 bg-white/5 text-base text-white placeholder:text-white/30 focus:border-pos-accent focus:outline-none'
    : 'rounded-lg border border-neutral-300 text-sm outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10';
  const country = PHONE_COUNTRIES.find((c) => c.iso === parts.iso) ?? PHONE_COUNTRIES[0];
  // A number that cannot exist in that country gets a red edge, not a block:
  // the host may be typing a foreign number under the wrong flag.
  const invalid = phoneLooksValid(parts.iso, parts.national) === false;

  return (
    <div className="flex gap-2">
      <div className="relative shrink-0">
        <select
          aria-label="country"
          value={parts.iso}
          onChange={(e) => update(e.target.value, parts.national)}
          className={`${box} h-full appearance-none py-2.5 pl-3 pr-3 ${dark ? '[color-scheme:dark]' : 'bg-white'}`}
        >
          {PHONE_COUNTRIES.map((c) => (
            <option key={c.iso} value={c.iso}>
              {c.flag} +{c.dial} · {c.name}
            </option>
          ))}
        </select>
        {/* The closed select shows only flag + code; the open list has the names. */}
        <span className={`pointer-events-none absolute inset-0 flex items-center px-3 ${dark ? 'bg-[#1f1f27] text-white' : 'bg-white text-neutral-900'} rounded-[inherit] ${dark ? 'rounded-xl' : 'rounded-lg'} text-sm font-medium`}>
          {country.flag} +{country.dial}
        </span>
      </div>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoFocus={autoFocus}
        value={parts.national}
        onChange={(e) => update(parts.iso, e.target.value.replace(/[^\d\s-]/g, ''))}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        className={`${box} w-full min-w-0 px-3 py-2.5 ${invalid ? '!border-red-400' : ''}`}
      />
    </div>
  );
}
