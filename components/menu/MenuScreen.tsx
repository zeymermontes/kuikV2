import { notFound } from 'next/navigation';
import { getTenantByHostKey, getMenu, getBranch } from '@/lib/tenant';
import { LiveMenu } from './LiveMenu';
import { PdfMenu } from './PdfMenu';

/**
 * Renders a tenant's menu (interactive or PDF), optionally for a specific branch.
 * A branch overrides the WhatsApp number/address and, if its menu_mode is
 * 'independent', shows its own menu instead of the main one.
 */
export async function MenuScreen({
  hostKey,
  branchSlug,
  openReservation = false,
  channel = 'online',
}: {
  hostKey: string;
  branchSlug?: string;
  /** Forwarded from `?reservar=1` on the menu route. */
  openReservation?: boolean;
  /** 'qr' = a code inside the restaurant; 'online' = a link shared anywhere. */
  channel?: 'online' | 'qr';
}) {
  const data = await getTenantByHostKey(hostKey);
  if (!data) notFound();

  const branch = branchSlug ? await getBranch(data.tenant.id, branchSlug) : null;
  if (branchSlug && !branch) notFound();

  // PDF mode applies to the main menu only.
  if (!branch && data.theme.menu_mode === 'pdf' && data.theme.menu_pdf_url) {
    return (
      <PdfMenu tenant={data.tenant} theme={data.theme} contact={data.contact} pdfUrl={data.theme.menu_pdf_url} />
    );
  }

  const menuBranchId = branch && branch.menu_mode === 'independent' ? branch.id : null;
  const menu = await getMenu(data.tenant.id, menuBranchId);

  // A branch routes orders to its own WhatsApp/address.
  const contact = branch
    ? {
        ...data.contact,
        whatsapp_phone: branch.whatsapp_phone ?? data.contact.whatsapp_phone,
        address: branch.address ?? data.contact.address,
        maps_url: branch.maps_url ?? data.contact.maps_url,
        hours: branch.hours ?? data.contact.hours,
      }
    : data.contact;

  return (
    <LiveMenu
      tenant={data.tenant}
      theme={data.theme}
      contact={contact}
      ordering={data.ordering}
      loyalty={data.loyalty}
      plan={data.plan}
      branches={data.branches}
      currentBranch={branch?.slug ?? null}
      // The slug above drives /b/<slug> links; a reservation needs the real id,
      // and without it every booking was stored with branch_id = null.
      currentBranchId={branch?.id ?? null}
      openReservation={openReservation}
      landingEnabled={data.landing.enabled}
      channel={channel}
      menu={menu}
    />
  );
}
