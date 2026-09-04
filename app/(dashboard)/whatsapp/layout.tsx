import { requireManager } from '@/lib/auth';
import { isPro } from '@/lib/plan';
import { WhatsappTabs } from '@/components/dashboard/whatsapp/WhatsappTabs';

/**
 * The WhatsApp section is three siblings — connection (basic), flows and
 * inbox (Pro) — so the tabs live here once. The canvas editor hides them
 * itself (it needs the full viewport); see WhatsappTabs.
 */
export default async function WhatsappLayout({ children }: { children: React.ReactNode }) {
  const { subscription } = await requireManager();
  return <WhatsappTabs pro={isPro(subscription)}>{children}</WhatsappTabs>;
}
