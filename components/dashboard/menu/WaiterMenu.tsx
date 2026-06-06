'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ImageIcon } from 'lucide-react';
import type { Category, Product } from '@/lib/database.types';
import { setProductAvailability } from '@/app/(dashboard)/menu/actions';

/**
 * Simplified menu for waiters: toggle product availability only. No editing of
 * names, prices, or anything else (enforced by RLS + the security-definer RPC).
 */
export function WaiterMenu({
  categories,
  products,
}: {
  categories: Category[];
  products: Product[];
}) {
  return (
    <div className="space-y-6">
      {categories.map((c) => {
        const items = products
          .filter((p) => p.category_id === c.id)
          .sort((a, b) => a.position - b.position);
        if (items.length === 0) return null;
        return (
          <div key={c.id}>
            <h2 className="mb-2 text-lg font-bold">{c.name}</h2>
            <div className="space-y-2">
              {items.map((p) => (
                <ProductToggle key={p.id} product={p} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProductToggle({ product }: { product: Product }) {
  const [available, setAvailable] = useState(product.is_available);

  function toggle() {
    const next = !available;
    setAvailable(next); // optimistic
    setProductAvailability(product.id, next);
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-2.5">
      {product.image_url ? (
        <Image src={product.image_url} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-300">
          <ImageIcon className="h-4 w-4" />
        </span>
      )}
      <span className={`flex-1 text-sm font-medium ${available ? '' : 'text-neutral-400 line-through'}`}>
        {product.name}
      </span>
      <button
        onClick={toggle}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${available ? 'bg-green-500' : 'bg-neutral-300'}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${available ? 'left-6' : 'left-1'}`}
        />
      </button>
    </div>
  );
}
