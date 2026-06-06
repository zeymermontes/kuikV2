import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind class names, resolving conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as currency. Falls back to a plain number on bad input. */
export function formatPrice(
  value: number | null | undefined,
  currency = 'MXN',
  locale = 'es-MX',
): string {
  if (value == null) return '';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return String(value);
  }
}

/** Strip everything but digits — used to normalize WhatsApp / phone input. */
export function digitsOnly(input: string): string {
  return input.replace(/\D/g, '');
}

/**
 * Map a 0–100 volume slider to an audio amplitude using a perceptual
 * (quadratic) curve — loudness is perceived ~logarithmically, so a linear
 * slider feels uneven. Returns 0–1.
 */
export function perceptualVolume(v: number): number {
  const x = Math.min(100, Math.max(0, v)) / 100;
  return x * x;
}
