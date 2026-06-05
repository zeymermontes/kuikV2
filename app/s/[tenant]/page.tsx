import { notFound } from 'next/navigation';
import { getTenantByHostKey, getMenu } from '@/lib/tenant';
import { MenuView } from '@/components/menu/MenuView';
import { PdfMenu } from '@/components/menu/PdfMenu';

type Params = { tenant: string };

// Revalidate the menu periodically; admin edits also trigger on-demand revalidation.
export const revalidate = 60;

export default async function TenantMenuPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { tenant: hostKey } = await params;
  const data = await getTenantByHostKey(decodeURIComponent(hostKey));
  if (!data) notFound();

  // PDF mode: show the uploaded PDF instead of the interactive menu.
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
      menu={menu}
    />
  );
}
