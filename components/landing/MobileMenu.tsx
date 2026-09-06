'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X, Smartphone } from 'lucide-react';

/**
 * The marketing nav on a phone: a hamburger that opens the same links the
 * desktop bar shows, plus the app downloads and sign-in, which the narrow
 * header has no room for.
 */
export function MobileMenu({
  links,
  appsLabel,
  loginLabel,
  ctaLabel,
}: {
  links: readonly (readonly [string, string])[];
  appsLabel: string;
  loginLabel: string;
  ctaLabel: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="landing-mobile-menu"
        aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {open && (
        <div id="landing-mobile-menu" className="absolute inset-x-0 top-16 z-40 border-b border-neutral-200 bg-white px-5 pb-5 pt-2 shadow-lg">
          <nav className="flex flex-col" aria-label="Secciones">
            {links.map(([href, label]) => (
              <a key={href} href={href} onClick={() => setOpen(false)} className="border-b border-neutral-100 py-3 text-base font-medium text-neutral-800">
                {label}
              </a>
            ))}
            <Link
              href="/apps"
              onClick={() => setOpen(false)}
              className="mt-3 flex items-center gap-2 rounded-xl bg-neutral-100 px-4 py-3 text-base font-semibold text-neutral-900"
            >
              <Smartphone className="h-5 w-5" /> {appsLabel}
            </Link>
          </nav>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <Link href="/login" onClick={() => setOpen(false)} className="rounded-full border border-neutral-300 px-4 py-2.5 text-center font-medium text-neutral-800">
              {loginLabel}
            </Link>
            <Link href="/signup" onClick={() => setOpen(false)} className="rounded-full bg-neutral-900 px-4 py-2.5 text-center font-semibold text-white">
              {ctaLabel}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
