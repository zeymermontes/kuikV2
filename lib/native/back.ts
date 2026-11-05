/**
 * What Android's back button does inside the Terminal and phone apps.
 *
 * The hub is the floor: back there puts the app in the background, the way
 * a home screen behaves, and never walks the history, which would reopen
 * whichever section was left last (usually the admin panel). On a section's
 * first screen back returns to the hub; deeper in, it goes back one page,
 * and to the hub when there is nothing behind.
 */
export type BackAction = 'minimize' | 'hub' | 'back';

export const HUB_PATH = '/terminal';

/** The first screen of each section the hub opens. */
export const SECTION_HOMES = new Set(['/host', '/pos', '/kds', '/chats', '/orders', '/dashboard']);

export function backAction(pathname: string, canGoBack: boolean): BackAction {
  const here = pathname.replace(/\/+$/, '') || '/';
  if (here === HUB_PATH) return 'minimize';
  if (SECTION_HOMES.has(here) || !canGoBack) return 'hub';
  return 'back';
}
