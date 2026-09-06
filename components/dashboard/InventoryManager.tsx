'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Check, ClipboardList, Package, Pencil, Plus, RefreshCw, Trash2, Truck } from 'lucide-react';
import type { Ingredient, PurchaseLine, PurchaseOrder, StockMovement } from '@/lib/database.types';
import { Card, Input, Label, Button } from '@/components/ui';
import { UNITS, formatQty, lowStock, purchaseTotal } from '@/lib/inventory';
import { formatPrice } from '@/lib/utils';
import {
  saveIngredient,
  deleteIngredient,
  recordMovement,
  savePurchase,
  receivePurchase,
  cancelPurchase,
  recalcProductCosts,
  type IngredientInput,
} from '@/app/(dashboard)/inventory/actions';

type Tab = 'stock' | 'purchases' | 'log';

const blank = (): IngredientInput => ({ name: '', unit: 'pza', min_stock: null, cost_per_unit: 0, supplier: null, auto_86: false, active: true, stock: 0 });

export function InventoryManager({
  ingredients,
  movements,
  purchases,
  usedBy,
  currency,
}: {
  ingredients: Ingredient[];
  movements: StockMovement[];
  purchases: PurchaseOrder[];
  usedBy: Record<string, number>;
  currency: string;
}) {
  const t = useTranslations('inventory');
  const [tab, setTab] = useState<Tab>('stock');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const money = (n: number) => formatPrice(n, currency);
  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const low = lowStock(ingredients);

  // ── Stock tab state ──
  const [draft, setDraft] = useState<IngredientInput | null>(null);
  const [move, setMove] = useState<{ ingredientId: string; kind: 'waste' | 'adjust' | 'count'; qty: string; note: string } | null>(null);
  const select = 'w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm';

  function submitIngredient() {
    if (!draft) return;
    start(async () => {
      const r = await saveIngredient(draft);
      if (r.error) return setMsg(r.error === 'name' ? t('errName') : r.error);
      setDraft(null);
      setMsg(null);
    });
  }

  function submitMove() {
    if (!move) return;
    start(async () => {
      const r = await recordMovement({ ingredientId: move.ingredientId, kind: move.kind, qty: Number(move.qty), note: move.note || null });
      if (r.error) return setMsg(r.error);
      setMove(null);
    });
  }

  // ── Purchases tab state ──
  const [po, setPo] = useState<{ id?: string; supplier: string; note: string; items: PurchaseLine[] } | null>(null);
  const [pick, setPick] = useState('');

  function addPoLine() {
    const ing = byId.get(pick);
    if (!po || !ing || po.items.some((l) => l.ingredient_id === ing.id)) return;
    setPo({ ...po, items: [...po.items, { ingredient_id: ing.id, name: ing.name, qty: 1, cost: Number(ing.cost_per_unit) || 0 }] });
    setPick('');
  }

  function submitPo(status: 'draft' | 'sent') {
    if (!po) return;
    start(async () => {
      const r = await savePurchase({ id: po.id, supplier: po.supplier || null, note: po.note || null, items: po.items, status });
      if (r.error) return setMsg(r.error === 'items' ? t('errItems') : r.error);
      setPo(null);
    });
  }

  const tabs: { key: Tab; label: string; icon: typeof Package }[] = [
    { key: 'stock', label: t('tabStock'), icon: Package },
    { key: 'purchases', label: t('tabPurchases'), icon: Truck },
    { key: 'log', label: t('tabLog'), icon: ClipboardList },
  ];

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((x) => (
          <button
            key={x.key}
            onClick={() => setTab(x.key)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium ${tab === x.key ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-600'}`}
          >
            <x.icon className="h-4 w-4" /> {x.label}
          </button>
        ))}
        <button
          onClick={() => start(async () => setMsg(t('costsUpdated', { n: (await recalcProductCosts()).updated })))}
          disabled={pending}
          className="ml-auto flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900"
        >
          <RefreshCw className="h-4 w-4" /> {t('recalcCosts')}
        </button>
      </div>

      {low.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {t('lowStock')}: {low.map((i) => `${i.name} (${formatQty(i.stock, i.unit)})`).join(', ')}
          </span>
        </div>
      )}
      {msg && <p className="text-sm text-neutral-700">{msg}</p>}

      {tab === 'stock' && (
        <>
          {!draft ? (
            <Button onClick={() => setDraft(blank())}>
              <Plus className="h-4 w-4" /> {t('addIngredient')}
            </Button>
          ) : (
            <Card className="space-y-3">
              <h2 className="font-semibold">{draft.id ? t('editIngredient') : t('addIngredient')}</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <Label>{t('name')}</Label>
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus placeholder={t('namePh')} />
                </div>
                <div>
                  <Label>{t('unit')}</Label>
                  <select value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} className={select}>
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {t(`unit_${u}`)}
                      </option>
                    ))}
                  </select>
                </div>
                {!draft.id && (
                  <div>
                    <Label>{t('openingStock')}</Label>
                    <Input type="number" min={0} step="0.001" value={draft.stock ?? 0} onChange={(e) => setDraft({ ...draft, stock: Number(e.target.value) })} />
                  </div>
                )}
                <div>
                  <Label>{t('minStock')}</Label>
                  <Input type="number" min={0} step="0.001" value={draft.min_stock ?? ''} onChange={(e) => setDraft({ ...draft, min_stock: e.target.value === '' ? null : Number(e.target.value) })} placeholder="—" />
                </div>
                <div>
                  <Label>{t('costPerUnit', { c: currency })}</Label>
                  <Input type="number" min={0} step="0.0001" value={draft.cost_per_unit} onChange={(e) => setDraft({ ...draft, cost_per_unit: Number(e.target.value) })} />
                </div>
                <div className="sm:col-span-2">
                  <Label>{t('supplier')}</Label>
                  <Input value={draft.supplier ?? ''} onChange={(e) => setDraft({ ...draft, supplier: e.target.value || null })} />
                </div>
              </div>
              <div className="flex flex-wrap gap-5 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={draft.auto_86} onChange={(e) => setDraft({ ...draft, auto_86: e.target.checked })} /> {t('auto86')}
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> {t('active')}
                </label>
              </div>
              <div className="flex gap-2">
                <Button onClick={submitIngredient} disabled={pending}>
                  {t('save')}
                </Button>
                <Button variant="secondary" onClick={() => setDraft(null)}>
                  {t('cancel')}
                </Button>
                {draft.id && !(usedBy[draft.id] > 0) && (
                  <button onClick={() => start(async () => {
                    await deleteIngredient(draft.id!);
                    setDraft(null);
                  })} className="ml-auto flex items-center gap-1 text-sm text-red-600 hover:underline">
                    <Trash2 className="h-4 w-4" /> {t('delete')}
                  </button>
                )}
              </div>
            </Card>
          )}

          {move && (
            <Card className="space-y-3">
              <h2 className="font-semibold">
                {t(`move_${move.kind}`)} · {byId.get(move.ingredientId)?.name}
              </h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>{t('moveKind')}</Label>
                  <select value={move.kind} onChange={(e) => setMove({ ...move, kind: e.target.value as typeof move.kind })} className={select}>
                    <option value="count">{t('move_count')}</option>
                    <option value="waste">{t('move_waste')}</option>
                    <option value="adjust">{t('move_adjust')}</option>
                  </select>
                </div>
                <div>
                  <Label>{move.kind === 'count' ? t('counted') : t('qty')} ({byId.get(move.ingredientId)?.unit})</Label>
                  <Input type="number" step="0.001" value={move.qty} onChange={(e) => setMove({ ...move, qty: e.target.value })} autoFocus />
                </div>
                <div>
                  <Label>{t('note')}</Label>
                  <Input value={move.note} onChange={(e) => setMove({ ...move, note: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={submitMove} disabled={pending || move.qty === ''}>
                  {t('apply')}
                </Button>
                <Button variant="secondary" onClick={() => setMove(null)}>
                  {t('cancel')}
                </Button>
              </div>
            </Card>
          )}

          <Card>
            {ingredients.length === 0 ? (
              <p className="py-8 text-center text-sm text-neutral-400">{t('empty')}</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-neutral-500">
                  <tr>
                    <th className="pb-1.5 font-medium">{t('name')}</th>
                    <th className="pb-1.5 text-right font-medium">{t('stock')}</th>
                    <th className="hidden pb-1.5 text-right font-medium sm:table-cell">{t('minStock')}</th>
                    <th className="hidden pb-1.5 text-right font-medium sm:table-cell">{t('cost')}</th>
                    <th className="pb-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {ingredients.map((i) => {
                    const isLow = i.min_stock != null && Number(i.stock) <= Number(i.min_stock);
                    return (
                      <tr key={i.id} className={`border-t border-neutral-100 ${i.active ? '' : 'opacity-50'}`}>
                        <td className="py-2">
                          <span className="font-medium">{i.name}</span>
                          <span className="block text-xs text-neutral-400">
                            {usedBy[i.id] ? t('usedBy', { n: usedBy[i.id] }) : t('unused')}
                            {i.supplier ? ` · ${i.supplier}` : ''}
                          </span>
                        </td>
                        <td className={`py-2 text-right font-medium tabular-nums ${isLow ? 'text-amber-700' : Number(i.stock) <= 0 ? 'text-red-600' : ''}`}>{formatQty(i.stock, i.unit)}</td>
                        <td className="hidden py-2 text-right text-neutral-500 sm:table-cell">{i.min_stock != null ? formatQty(i.min_stock, i.unit) : '—'}</td>
                        <td className="hidden py-2 text-right text-neutral-500 sm:table-cell">{money(Number(i.cost_per_unit))}</td>
                        <td className="py-2 text-right">
                          <button onClick={() => setMove({ ingredientId: i.id, kind: 'count', qty: '', note: '' })} className="rounded-lg px-2 py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-100">
                            {t('countBtn')}
                          </button>
                          <button
                            onClick={() => setDraft({ id: i.id, name: i.name, unit: i.unit, min_stock: i.min_stock != null ? Number(i.min_stock) : null, cost_per_unit: Number(i.cost_per_unit), supplier: i.supplier, auto_86: i.auto_86, active: i.active })}
                            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800"
                            aria-label={t('editIngredient')}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}

      {tab === 'purchases' && (
        <>
          {!po ? (
            <Button onClick={() => setPo({ supplier: '', note: '', items: [] })}>
              <Plus className="h-4 w-4" /> {t('newPurchase')}
            </Button>
          ) : (
            <Card className="space-y-3">
              <h2 className="font-semibold">{po.id ? t('editPurchase') : t('newPurchase')}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>{t('supplier')}</Label>
                  <Input value={po.supplier} onChange={(e) => setPo({ ...po, supplier: e.target.value })} />
                </div>
                <div>
                  <Label>{t('note')}</Label>
                  <Input value={po.note} onChange={(e) => setPo({ ...po, note: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2">
                <select value={pick} onChange={(e) => setPick(e.target.value)} className={select}>
                  <option value="">{t('pickIngredient')}</option>
                  {ingredients.filter((i) => i.active).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.unit})
                    </option>
                  ))}
                </select>
                <Button variant="secondary" onClick={addPoLine} disabled={!pick}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {po.items.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-neutral-500">
                    <tr>
                      <th className="pb-1 font-medium">{t('name')}</th>
                      <th className="pb-1 font-medium">{t('qty')}</th>
                      <th className="pb-1 font-medium">{t('unitCost')}</th>
                      <th className="pb-1 text-right font-medium">{t('total')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {po.items.map((l, idx) => (
                      <tr key={l.ingredient_id} className="border-t border-neutral-100">
                        <td className="py-1.5">
                          {l.name} <span className="text-xs text-neutral-400">{byId.get(l.ingredient_id)?.unit}</span>
                        </td>
                        <td className="py-1.5">
                          <Input type="number" min={0} step="0.001" value={l.qty} onChange={(e) => setPo({ ...po, items: po.items.map((x, i) => (i === idx ? { ...x, qty: Number(e.target.value) } : x)) })} className="max-w-[7rem]" />
                        </td>
                        <td className="py-1.5">
                          <Input type="number" min={0} step="0.0001" value={l.cost} onChange={(e) => setPo({ ...po, items: po.items.map((x, i) => (i === idx ? { ...x, cost: Number(e.target.value) } : x)) })} className="max-w-[7rem]" />
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{money(l.qty * l.cost)}</td>
                        <td className="py-1.5 text-right">
                          <button onClick={() => setPo({ ...po, items: po.items.filter((_, i) => i !== idx) })} className="p-1 text-neutral-400 hover:text-red-500">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-neutral-200 font-semibold">
                      <td colSpan={3} className="py-1.5">
                        {t('total')}
                      </td>
                      <td className="py-1.5 text-right">{money(purchaseTotal(po.items))}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => submitPo('sent')} disabled={pending || po.items.length === 0}>
                  {t('savePurchase')}
                </Button>
                <Button variant="secondary" onClick={() => setPo(null)}>
                  {t('cancel')}
                </Button>
              </div>
            </Card>
          )}

          <Card>
            {purchases.length === 0 ? (
              <p className="py-8 text-center text-sm text-neutral-400">{t('noPurchases')}</p>
            ) : (
              <div className="divide-y divide-neutral-100">
                {purchases.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {p.supplier || t('noSupplier')} · {money(Number(p.total))}
                      </p>
                      <p className="truncate text-xs text-neutral-400">
                        {new Date(p.created_at).toLocaleDateString()} · {p.items.map((l) => `${formatQty(l.qty, byId.get(l.ingredient_id)?.unit ?? '')} ${l.name}`).join(', ')}
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.status === 'received' ? 'bg-green-100 text-green-700' : p.status === 'cancelled' ? 'bg-neutral-100 text-neutral-500' : 'bg-amber-100 text-amber-700'}`}>
                      {t(`po_${p.status}`)}
                    </span>
                    {(p.status === 'draft' || p.status === 'sent') && (
                      <>
                        <button onClick={() => setPo({ id: p.id, supplier: p.supplier ?? '', note: p.note ?? '', items: p.items })} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100" aria-label={t('editPurchase')}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => start(async () => setMsg((await receivePurchase(p.id)).error ?? t('received')))} className="flex items-center gap-1 rounded-lg bg-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-white" disabled={pending}>
                          <Check className="h-3.5 w-3.5" /> {t('receive')}
                        </button>
                        <button onClick={() => start(async () => cancelPurchase(p.id))} className="p-1.5 text-neutral-400 hover:text-red-500" aria-label={t('cancel')}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {tab === 'log' && (
        <Card>
          {movements.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-400">{t('noMovements')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th className="pb-1.5 font-medium">{t('when')}</th>
                  <th className="pb-1.5 font-medium">{t('name')}</th>
                  <th className="pb-1.5 font-medium">{t('moveKind')}</th>
                  <th className="pb-1.5 text-right font-medium">{t('qty')}</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => {
                  const ing = byId.get(m.ingredient_id);
                  return (
                    <tr key={m.id} className="border-t border-neutral-100">
                      <td className="py-1.5 text-neutral-500">{new Date(m.created_at).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="py-1.5">{ing?.name ?? '—'}</td>
                      <td className="py-1.5 text-neutral-500">
                        {t(`move_${m.kind}`)}
                        {m.note ? ` · ${m.note}` : ''}
                      </td>
                      <td className={`py-1.5 text-right tabular-nums ${Number(m.qty) < 0 ? 'text-red-600' : 'text-green-700'}`}>
                        {Number(m.qty) > 0 ? '+' : ''}
                        {formatQty(Number(m.qty), ing?.unit ?? '')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}
