import { Loader2 } from 'lucide-react';

/**
 * What a section shows while its page is still rendering on the server.
 *
 * Every staff route reads the session, so it is dynamic: without a loading
 * state Next neither prefetches it nor paints anything until the server
 * answers, and a tap looks ignored. With one, the route's layout and this
 * fallback are prefetched, the tap navigates at once, and the page streams
 * in behind it.
 */
export function RouteLoading({ tone = 'dark', fill = 'screen' }: { tone?: 'dark' | 'light'; fill?: 'screen' | 'area' }) {
  const dark = tone === 'dark';
  return (
    <div
      role="status"
      aria-busy="true"
      className={`flex items-center justify-center ${fill === 'screen' ? 'min-h-dvh' : 'min-h-[50vh]'} ${dark ? 'bg-[#111114] text-white/60' : 'text-neutral-400'}`}
    >
      <Loader2 className="h-7 w-7 animate-spin" />
    </div>
  );
}
