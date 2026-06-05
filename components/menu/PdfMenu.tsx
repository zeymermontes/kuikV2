import Image from 'next/image';
import { Download, MessageCircle } from 'lucide-react';
import type { Tenant, TenantTheme, TenantContact } from '@/lib/database.types';
import { resolveMenuSettings } from '@/lib/menu-settings';

/** Public menu rendered from an uploaded PDF instead of the interactive builder. */
export function PdfMenu({
  tenant,
  theme,
  contact,
  pdfUrl,
}: {
  tenant: Tenant;
  theme: TenantTheme;
  contact: TenantContact;
  pdfUrl: string;
}) {
  const settings = resolveMenuSettings(theme.settings);
  const waDigits = contact.whatsapp_phone?.replace(/\D/g, '');

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 pb-10">
      {/* Header */}
      <header className="flex flex-col items-center gap-2 pt-8 pb-4 text-center">
        {theme.logo_url && (
          <Image
            src={theme.logo_url}
            alt={tenant.name}
            width={80}
            height={80}
            className="h-20 w-20 rounded-full object-cover shadow-sm"
          />
        )}
        {settings.showName && (
          <h1 className="text-2xl font-bold" style={{ color: 'var(--brand-text)' }}>
            {tenant.name}
          </h1>
        )}
        {theme.slogan && <p className="text-sm opacity-70">{theme.slogan}</p>}
      </header>

      {/* PDF viewer */}
      <div className="flex-1 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
        <object data={pdfUrl} type="application/pdf" className="h-[80vh] w-full">
          {/* Fallback for browsers/phones that won't embed PDFs */}
          <div className="flex h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm opacity-70">PDF</p>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-full px-5 py-2.5 font-semibold text-white"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <Download className="h-4 w-4" /> Ver menú (PDF)
            </a>
          </div>
        </object>
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <a
          href={pdfUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-full border border-black/10 px-5 py-2.5 text-sm font-semibold"
          style={{ backgroundColor: 'var(--brand-surface)' }}
        >
          <Download className="h-4 w-4" /> PDF
        </a>
        {waDigits && (
          <a
            href={`https://wa.me/${waDigits}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white"
          >
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}
