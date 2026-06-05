'use client';

import Image from 'next/image';

export function CategoryBanner({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl: string | null;
}) {
  if (!imageUrl) {
    return (
      <div
        className="mb-3 rounded-2xl px-5 py-6"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)',
        }}
      >
        <h2 className="text-xl font-bold">{name}</h2>
      </div>
    );
  }

  return (
    <div className="relative mb-4 h-32 w-full overflow-hidden rounded-2xl sm:h-40">
      <Image src={imageUrl} alt={name} fill className="object-cover" sizes="(max-width: 640px) 100vw, 640px" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
      <h2 className="absolute bottom-3 left-4 text-2xl font-bold text-white drop-shadow">
        {name}
      </h2>
    </div>
  );
}
