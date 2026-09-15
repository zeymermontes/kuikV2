'use client';

import { useState } from 'react';
import Image from 'next/image';

/**
 * The restaurant's logo in the menu header. A square mark sits in the usual
 * circle; a wide one (a wordmark, or a square slot holding a landscape file)
 * would lose its ends to that crop, so it gets a rounded rectangle instead.
 * The shape is decided from the file's real proportions once it loads.
 */
export function BrandLogo({
  src,
  alt,
  size,
  className = '',
}: {
  src: string;
  alt: string;
  /** Circle diameter, and the height a wide logo is fitted to. */
  size: number;
  className?: string;
}) {
  const [wide, setWide] = useState<boolean | null>(null);
  const maxWidth = Math.round(size * 3.2);
  return (
    <Image
      src={src}
      alt={alt}
      width={wide ? maxWidth : size}
      height={size}
      onLoad={(e) => {
        const img = e.currentTarget;
        if (img.naturalWidth && img.naturalHeight) setWide(img.naturalWidth / img.naturalHeight >= 1.35);
      }}
      className={`${wide === false ? 'rounded-full object-cover' : 'rounded-2xl object-contain'} shadow-sm ${className}`}
      style={
        wide === false
          ? { width: size, height: size }
          : { height: size, width: 'auto', maxWidth }
      }
    />
  );
}
