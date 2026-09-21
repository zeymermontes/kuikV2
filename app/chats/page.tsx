import { requireChats } from '@/lib/auth';
import { posThemeVars } from '@/lib/pos/theme';
import { ChatsApp } from '@/components/chats/ChatsApp';
import { chatRow, listChats } from './actions';

export const dynamic = 'force-dynamic';

/** `?c=<conversation>` opens that chat at once — the link a notification carries. */
export default async function ChatsPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const { tenant, theme } = await requireChats();
  const initial = await listChats();
  const openChat = c ? initial.rows.find((r) => r.conversationId === c) ?? (await chatRow(c)) : null;
  return (
    <ChatsApp
      tenantId={tenant.id}
      tenantName={tenant.name}
      logoUrl={theme.logo_url}
      initial={initial}
      openChat={openChat}
      themeStyle={posThemeVars(theme)}
    />
  );
}
