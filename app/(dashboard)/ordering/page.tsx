import { getTranslations } from 'next-intl/server';
import { requireOwner } from '@/lib/auth';
import { showDevFeatures } from '@/lib/features';
import { createClient } from '@/lib/supabase/server';
import { tenantUrl } from '@/lib/config';
import type { PrintAgent, Printer, TenantOrdering } from '@/lib/database.types';
import { OrderingForm } from '@/components/dashboard/OrderingForm';
import { JumpToSetting } from '@/components/dashboard/JumpToSetting';
import { TableQRs } from '@/components/dashboard/TableQRs';
import { PosPreview } from '@/components/dashboard/PosPreview';
import { PrintingSettings } from '@/components/dashboard/PrintingSettings';

export default async function OrderingPage() {
  const ctx = await requireOwner();
  const { tenant } = ctx;
  const t = await getTranslations('ordering');
  const supabase = await createClient();

  const dev = showDevFeatures(ctx);
  const [{ data }, { data: agents }, { data: printers }, { data: categories }] = await Promise.all([
    supabase.from('tenant_ordering').select('*').eq('tenant_id', tenant.id).maybeSingle<TenantOrdering>(),
    dev ? supabase.from('print_agents').select('*').eq('tenant_id', tenant.id).order('created_at') : Promise.resolve({ data: [] }),
    dev ? supabase.from('printers').select('*').eq('tenant_id', tenant.id).order('position') : Promise.resolve({ data: [] }),
    dev ? supabase.from('categories').select('name, station').eq('tenant_id', tenant.id).is('branch_id', null).order('position') : Promise.resolve({ data: [] }),
  ]);
  // The stations a kitchen printer can be routed to: the same rule the POS uses (category.station, else its name).
  const stations = [...new Set(((categories ?? []) as { name: string; station: string | null }[]).map((c) => c.station || c.name))];

  const ordering: TenantOrdering = data ?? {
    tenant_id: tenant.id,
    ordering_enabled: true,
    ordering_qr_enabled: true,
    ordering_online_enabled: true,
    service_types: ['pickup'],
    order_header: null,
    min_order: null,
    delivery_fee: null,
    free_delivery_over: null,
    tips: [],
    collect_address: false,
    collect_pickup_time: false,
    collect_table: false,
    collect_name: true,
    cash_count_mode: 'total',
    cash_denominations: null,
    pos_tables: 0,
    payment_methods: [],
    transfer_bank: null,
    transfer_holder: null,
    transfer_account: null,
    transfer_note: null,
    note_placeholder: null,
    print_receipt_mode: 'ask',
    print_kitchen_auto: true,
    print_drawer_cash: true,
    receipt_footer: null,
    updated_at: new Date(0).toISOString(),
  };

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
      <p className="mb-6 text-sm text-neutral-500">{t('subtitle')}</p>
      <OrderingForm ordering={ordering} showPosSettings={dev} />
      {dev && (
        <div className="mt-5">
          <PrintingSettings agents={(agents ?? []) as PrintAgent[]} printers={(printers ?? []) as Printer[]} stations={stations} ordering={ordering} />
        </div>
      )}
      <JumpToSetting />
      {dev && <PosPreview />}

      {ordering.service_types.includes('dinein') && (
        <div className="mt-6">
          <TableQRs baseUrl={tenantUrl(tenant.subdomain)} name={tenant.name} />
        </div>
      )}
    </div>
  );
}
