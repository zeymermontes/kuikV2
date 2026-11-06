// Who a staff notification is for and where tapping it lands. Pure, so the
// push sender, the /open route, the in-page toasts and the tests agree.
//
// The kinds, and the staff app each belongs to:
//
//   at the door (host)
//     reservation_new        a booking came in (to confirm or reject)
//     reservation_confirmed  the guest answered the reminder: coming
//     reservation_cancelled  the guest cancelled: the table is free
//     reservation_changed    the guest asks to cancel or change: needs a yes
//     reminders              (push only) reminders waiting to be sent
//   in the chats (chats)
//     handoff                the bot stepped aside: someone asked for a person
//     customer_reply         the diner wrote back to the person helping them
//     flow_notify            the bot's flow flagged a conversation
//     chat_pending           the bot promised an answer only a person can give
//   on the orders board (orders)
//     new / paid / still unaccepted (lib/orders/notify.ts, push only)
//   the admin panel (admin)
//     WhatsApp about to disconnect, and anything else about the account
//
// A person hears a kind by role, as before. A shared device (0100) hears it
// by SECTION: its role is only the smallest bundle covering its sections, so
// a role list would both miss it (a door tablet that also has the orders is
// a "cashier", which the chat alerts never named) and over-reach.

import type { MemberRole } from '@/lib/database.types';
import type { DeviceSection } from '@/lib/devices/sections';

export type AlertSection = DeviceSection | 'admin';

export const HUB = '/terminal';

/** The staff app an alert kind belongs to. */
export function sectionOfKind(kind: string): AlertSection {
  if (kind.startsWith('reservation_')) return 'host';
  if (kind === 'handoff' || kind === 'customer_reply' || kind === 'flow_notify' || kind === 'chat_pending') return 'chats';
  if (kind.startsWith('order')) return 'orders';
  return 'admin';
}

/** The staff app a path belongs to. */
export function sectionOfPath(path: string): AlertSection {
  const p = pathnameOf(path);
  const under = (base: string) => p === base || p.startsWith(`${base}/`);
  if (under('/whatsapp/inbox') || under('/chats')) return 'chats';
  if (under('/reservations') || under('/host')) return 'host';
  if (under('/orders')) return 'orders';
  if (under('/pos')) return 'pos';
  if (under('/kds')) return 'kds';
  return 'admin';
}

export interface AlertReader {
  role: MemberRole | null;
  /** A shared device's sections; null for a person, whose role decides. */
  sections: DeviceSection[] | null;
}

/** Whether a reader should see an alert addressed to roles (not to one person). */
export function hears(kind: string, roles: readonly string[] | null | undefined, reader: AlertReader): boolean {
  if (reader.sections) {
    const section = sectionOfKind(kind);
    return section !== 'admin' && reader.sections.includes(section);
  }
  return !!reader.role && !!roles?.includes(reader.role);
}

const MANAGERS: MemberRole[] = ['owner', 'manager'];

/**
 * Where a notification's link takes this reader. Alerts carry the admin
 * panel's address (the inbox, the reservations list), which is right for an
 * owner at a desk and wrong for nearly everybody else:
 *
 *  - a chat opens in the chats app for anyone who has no inbox (a host, a
 *    cashier, every device), on that very conversation;
 *  - a device has no admin panel at all, so a booking opens its host stand,
 *    on the day in question, with the requests open when the booking is
 *    waiting for an answer;
 *  - what a device was not given sends it to its hub rather than to a page
 *    that would turn it away.
 */
export function landingFor(path: string, reader: AlertReader): string {
  const url = parse(path);
  const section = sectionOfPath(path);
  const chat = () => {
    const c = url.searchParams.get('c');
    return c ? `/chats?c=${encodeURIComponent(c)}` : '/chats';
  };

  if (!reader.sections) {
    const inbox = url.pathname === '/whatsapp/inbox' || url.pathname.startsWith('/whatsapp/inbox/');
    if (inbox && reader.role && !MANAGERS.includes(reader.role)) return chat();
    return path;
  }

  if (section === 'admin' || !reader.sections.includes(section)) return HUB;
  if (section === 'chats') return chat();
  if (section === 'host') {
    if (url.pathname.startsWith('/host')) return path;
    const q = new URLSearchParams();
    const d = url.searchParams.get('d');
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) q.set('d', d);
    if (url.searchParams.get('view') === 'pending') q.set('open', 'requests');
    const qs = q.toString();
    return qs ? `/host?${qs}` : '/host';
  }
  return path;
}

function parse(path: string): URL {
  try {
    return new URL(path, 'http://kuik.local');
  } catch {
    return new URL('http://kuik.local/');
  }
}

function pathnameOf(path: string): string {
  return parse(path).pathname.replace(/\/+$/, '') || '/';
}
