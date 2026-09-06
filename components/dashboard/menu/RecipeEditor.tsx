'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Package, Plus, Trash2 } from 'lucide-react';
import type { Ingredient } from '@/lib/database.types';
import { Label, Input, Button } from '@/components/ui';
import { formatQty, portionsLeft, recipeCost } from '@/lib/inventory';
import { formatPrice } from '@/lib/utils';
import { getRecipe, listIngredients, setRecipe, trackProductStock } from '@/app/(dashboard)/inventory/actions';

type Line = { ingredient_id: string; qty: number };

/** A product's recipe: which ingredients, how much of each per unit sold. Saved on blur, cost refreshed. */
export function RecipeEditor({ productId, productName, currency }: { productId: string; productName: string; currency: string }) {
  const t = useTranslations('inventory');
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [pick, setPick] = useState('');
  const [stock, setStock] = useState('10');
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    Promise.all([listIngredients(), getRecipe(productId)]).then(([ings, recipe]) => {
      if (!live) return;
      setIngredients(ings);
      setLines(recipe.map((r) => ({ ingredient_id: r.ingredient_id, qty: Number(r.qty) })));
    });
    return () => {
      live = false;
    };
  }, [productId]);

  function persist(next: Line[]) {
    setLines(next);
    start(async () => {
      await setRecipe(productId, next);
    });
  }

  if (!ingredients) return <p className="text-xs text-neutral-400">…</p>;
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const cost = recipeCost(lines.map((l) => ({ ...l, product_id: productId, tenant_id: '' })), ingredients);
  const left = portionsLeft(lines.map((l) => ({ ...l, product_id: productId, tenant_id: '' })), ingredients);

  return (
    <div className="space-y-2">
      <Label>{t('recipe')}</Label>
      {lines.length === 0 && ingredients.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 p-3 text-xs text-neutral-500">
          <p>{t('recipeEmptyHint')}</p>
          <div className="mt-2 flex items-center gap-2">
            <Input type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value)} className="max-w-[6rem]" />
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await trackProductStock(productId, productName, Number(stock) || 0);
                  const [ings, recipe] = await Promise.all([listIngredients(), getRecipe(productId)]);
                  setIngredients(ings);
                  setLines(recipe.map((r) => ({ ingredient_id: r.ingredient_id, qty: Number(r.qty) })));
                })
              }
            >
              <Package className="h-4 w-4" /> {t('trackSimple')}
            </Button>
          </div>
        </div>
      )}
      {lines.map((l, idx) => {
        const ing = byId.get(l.ingredient_id);
        return (
          <div key={l.ingredient_id} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">
              {ing?.name ?? '—'} <span className="text-xs text-neutral-400">{ing ? formatQty(ing.stock, ing.unit) : ''}</span>
            </span>
            <Input
              type="number"
              min={0}
              step="0.001"
              defaultValue={l.qty}
              onBlur={(e) => persist(lines.map((x, i) => (i === idx ? { ...x, qty: Number(e.target.value) } : x)))}
              className="max-w-[6rem]"
            />
            <span className="w-10 text-xs text-neutral-500">{ing?.unit}</span>
            <button onClick={() => persist(lines.filter((_, i) => i !== idx))} className="p-1 text-neutral-400 hover:text-red-500" aria-label={t('delete')}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      })}
      {ingredients.length > 0 && (
        <div className="flex gap-2">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm">
            <option value="">{t('pickIngredient')}</option>
            {ingredients.filter((i) => !lines.some((l) => l.ingredient_id === i.id)).map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.unit})
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            disabled={!pick}
            onClick={() => {
              persist([...lines, { ingredient_id: pick, qty: 1 }]);
              setPick('');
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
      {lines.length > 0 && (
        <p className="text-xs text-neutral-500">
          {t('recipeCost')}: <span className="font-medium text-neutral-800">{formatPrice(cost, currency)}</span>
          {left != null && (
            <>
              {' · '}
              {t('portionsLeft', { n: left })}
            </>
          )}
        </p>
      )}
    </div>
  );
}
