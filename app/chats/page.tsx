import { requireChats } from '@/lib/auth';
import { posThemeVars } from '@/lib/pos/theme';
import { ChatsApp } from '@/components/chats/ChatsApp';
import { chatRow, listChats } from './actions';
import { createClient } from '@/lib/supabase/server';
import type { ReservationArea } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

/** `?c=<conversation>` opens that chat at once — the link a notification carries. */
export default async function ChatsPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const { tenant, theme, user } = await requireChats();
  const supabase = await createClient();
  const [initial, { data: areas }, { data: branches }] = await Promise.all([
    listChats(),
    // For the bookings tab and for taking a booking from an open chat.
    supabase.from('reservation_areas').select('*').eq('tenant_id', tenant.id).order('position', { ascending: true }),
    supabase.from('branches').select('id, name').eq('tenant_id', tenant.id).order('position'),
  ]);
  const openChat = c ? initial.rows.find((r) => r.conversationId === c) ?? (await chatRow(c)) : null;
  return (
    <ChatsApp
      tenantId={tenant.id}
      tenantName={tenant.name}
      logoUrl={theme.logo_url}
      initial={initial}
      openChat={openChat}
      themeStyle={posThemeVars(theme)}
      adminLink={!user.isDevice}
      timezone={tenant.timezone}
      areas={(areas ?? []) as ReservationArea[]}
      branches={(branches ?? []) as { id: string; name: string }[]}
    />
  );
}
