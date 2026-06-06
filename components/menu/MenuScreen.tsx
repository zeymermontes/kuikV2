import { notFound } from 'next/navigation';
import { getTenantByHostKey, getMenu } from '@/lib/tenant';
import { MenuView } from './MenuView';
import { PdfMenu } from './PdfMenu';

/**
 * Renders a tenant's menu (interactive or PDF). Shared by the tenant root
 * (when the landing is off) and the dedicated /menu route. getTenantByHostKey
 * is request-cached, so calling it here after the page already did is free.
 */
export async function MenuScreen({ hostKey }: { hostKey: string }) {
  const data = await getTenantByHostKey(hostKey);
  if (!data) notFound();

  if (data.theme.menu_mode === 'pdf' && data.theme.menu_pdf_url) {
    return (
      <PdfMenu
        tenant={data.tenant}
        theme={data.theme}
        contact={data.contact}
        pdfUrl={data.theme.menu_pdf_url}
      />
    );
  }

  const menu = await getMenu(data.tenant.id);
  return (
    <MenuView
      tenant={data.tenant}
      theme={data.theme}
      contact={data.contact}
      ordering={data.ordering}
      loyalty={data.loyalty}
      menu={menu}
    />
  );
}
