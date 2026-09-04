'use client';

import { useEffect } from 'react';

/**
 * Corrects `<html lang>` for the subtree it renders in.
 *
 * `lang` can only be set in the root layout, and that layout is deliberately
 * static (see app/layout.tsx), so it ships the default locale. Subtrees that
 * resolve a different one — a staff member who picked English, a restaurant
 * whose menu is in another language — fix the attribute here instead of forcing
 * the whole app to render dynamically just to get one attribute right.
 */
export function HtmlLang({ locale }: { locale: string }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
