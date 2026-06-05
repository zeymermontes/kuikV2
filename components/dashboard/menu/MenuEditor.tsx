'use client';

import { useMemo, useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Category, Product, Separator } from '@/lib/database.types';
import { Button, Input } from '@/components/ui';
import { addCategory } from '@/app/(dashboard)/menu/actions';
import { CategoryEditor } from './CategoryEditor';

export function MenuEditor({
  tenantId,
  categories,
  products,
  separators,
}: {
  tenantId: string;
  categories: Category[];
  products: Product[];
  separators: Separator[];
}) {
  const t = useTranslations('menuEditor');
  const [newName, setNewName] = useState('');
  const [pending, startTransition] = useTransition();

  // Group products + separators under their category for each editor.
  const byCategory = useMemo(() => {
    const map = new Map<string, { products: Product[]; separators: Separator[] }>();
    for (const c of categories) map.set(c.id, { products: [], separators: [] });
    for (const p of products) map.get(p.category_id)?.products.push(p);
    for (const s of separators) map.get(s.category_id)?.separators.push(s);
    return map;
  }, [categories, products, separators]);

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setNewName('');
    startTransition(() => addCategory(name));
  }

  return (
    <div className="space-y-5">
      {categories.map((cat) => {
        const group = byCategory.get(cat.id)!;
        return (
          <CategoryEditor
            key={cat.id}
            tenantId={tenantId}
            category={cat}
            products={group.products}
            separators={group.separators}
          />
        );
      })}

      <div className="flex gap-2 rounded-2xl border border-dashed border-neutral-300 bg-white p-3">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={t('categoryName')}
        />
        <Button onClick={handleAdd} disabled={pending || !newName.trim()}>
          <Plus className="h-4 w-4" /> {t('addCategory')}
        </Button>
      </div>
    </div>
  );
}
