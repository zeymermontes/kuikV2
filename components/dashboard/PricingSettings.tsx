'use client';

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import type { PlatformSettings } from '@/lib/platform';
import { Card, Input, Label, Button } from '@/components/ui';
import { updatePricing } from '@/app/(dashboard)/admin/actions';

/** Super-admin editor for the Basic + Pro subscription prices. */
export function PricingSettings({ settings }: { settings: PlatformSettings }) {
  const [name, setName] = useState(settings.plan_name);
  const [amount, setAmount] = useState(String(settings.plan_amount));
  const [proName, setProName] = useState(settings.pro_name);
  const [proAmount, setProAmount] = useState(String(settings.pro_amount));
  const [currency, setCurrency] = useState(settings.plan_currency);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setSaved(false);
    startTransition(async () => {
      await updatePricing({
        amount: Number(amount),
        currency,
        planName: name,
        proAmount: Number(proAmount),
        proName,
      });
      setSaved(true);
    });
  }

  return (
    <Card>
      <h2 className="mb-4 font-semibold">Precios de suscripción</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label>Plan Básico — nombre</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Básico — monto/mes</Label>
          <Input type="number" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <Label>Plan Pro — nombre</Label>
          <Input value={proName} onChange={(e) => setProName(e.target.value)} />
        </div>
        <div>
          <Label>Pro — monto/mes</Label>
          <Input type="number" step="0.01" inputMode="decimal" value={proAmount} onChange={(e) => setProAmount(e.target.value)} />
        </div>
        <div>
          <Label>Moneda</Label>
          <Input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? '…' : 'Guardar'}
        </Button>
        {saved && !pending && (
          <span className="flex items-center gap-1 text-sm text-green-600">
            <Check className="h-4 w-4" /> Guardado
          </span>
        )}
      </div>
    </Card>
  );
}
