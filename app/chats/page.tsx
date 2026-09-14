import { requireChats } from '@/lib/auth';
import { posThemeVars } from '@/lib/pos/theme';
import { ChatsApp } from '@/components/chats/ChatsApp';
import { listChats } from './actions';

export const dynamic = 'force-dynamic';

export default async function ChatsPage() {
  const { tenant, theme } = await requireChats();
  const initial = await listChats();
  return (
    <ChatsApp
      tenantId={tenant.id}
      tenantName={tenant.name}
      logoUrl={theme.logo_url}
      initial={initial}
      themeStyle={posThemeVars(theme)}
    />
  );
}
