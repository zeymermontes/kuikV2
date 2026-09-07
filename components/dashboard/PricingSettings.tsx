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
  const [extraAmount, setExtraAmount] = useState(String(settings.extra_amount));
  const [currency, setCurrency] = useState(settings.plan_currency);
  const [feePercent, setFeePercent] = useState(String(settings.payment_fee_percent ?? 0));
  const [proFeePercent, setProFeePercent] = useState(settings.pro_payment_fee_percent == null ? '' : String(settings.pro_payment_fee_percent));
  const [posName, setPosName] = useState(settings.pos_addon_name);
  const [posAmount, setPosAmount] = useState(String(settings.pos_addon_amount));
  const [branchBasic, setBranchBasic] = useState(String(settings.branch_amount_basic));
  const [branchPro, setBranchPro] = useState(String(settings.branch_amount_pro));
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
        extraAmount: Number(extraAmount),
        paymentFeePercent: Number(feePercent),
        proPaymentFeePercent: proFeePercent.trim() === '' ? null : Number(proFeePercent),
        posAddonAmount: Number(posAmount),
        posAddonName: posName,
        branchBasicAmount: Number(branchBasic),
        branchProAmount: Number(branchPro),
      });
      setSaved(true);
    });
  }

  return (
    <Card>
      <h2 className="mb-4 font-semibold">Precios de suscripción</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label>Plan base — nombre</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Plan base — monto/mes</Label>
          <Input type="number" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <Label>Plan alto — nombre</Label>
          <Input value={proName} onChange={(e) => setProName(e.target.value)} />
        </div>
        <div>
          <Label>Plan alto — monto/mes</Label>
          <Input type="number" step="0.01" inputMode="decimal" value={proAmount} onChange={(e) => setProAmount(e.target.value)} />
        </div>
        <div>
          <Label>Restaurante adicional — monto/mes</Label>
          <Input type="number" step="0.01" inputMode="decimal" value={extraAmount} onChange={(e) => setExtraAmount(e.target.value)} />
        </div>
        <div>
          <Label>Complemento punto de venta — nombre</Label>
          <Input value={posName} onChange={(e) => setPosName(e.target.value)} />
        </div>
        <div>
          <Label>Punto de venta — monto/mes (se suma a cualquier plan)</Label>
          <Input type="number" min={0} step="1" value={posAmount} onChange={(e) => setPosAmount(e.target.value)} />
        </div>
        <div>
          <Label>Sucursal adicional, plan {name || 'Menú'} — monto/mes por sucursal</Label>
          <Input type="number" min={0} step="1" value={branchBasic} onChange={(e) => setBranchBasic(e.target.value)} />
        </div>
        <div>
          <Label>Sucursal adicional, plan {proName || 'Restaurante'} — monto/mes por sucursal</Label>
          <Input type="number" min={0} step="1" value={branchPro} onChange={(e) => setBranchPro(e.target.value)} />
        </div>
        <div>
          <Label>Comisión por pago en línea, plan {proName || 'Restaurante'} (%) — vacío = igual</Label>
          <Input type="number" min={0} max={30} step="0.1" value={proFeePercent} onChange={(e) => setProFeePercent(e.target.value)} placeholder="igual que el plan base" />
        </div>
        <div>
          <Label>Comisión Kuik por pago en línea (%)</Label>
          <Input type="number" step="0.1" min={0} max={30} inputMode="decimal" value={feePercent} onChange={(e) => setFeePercent(e.target.value)} />
          <p className="mt-1 text-xs text-neutral-400">Se descuenta de cada pago del menú que pasa por Stripe, además de la comisión de Stripe. 0 = Kuik no cobra.</p>
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
