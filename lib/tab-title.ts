// The number in front of the tab's title: "(3) Kuik". One writer for the
// whole page, because several things want to say how many: what is waiting
// for a person (components/PendingBadge.tsx) and, on the orders board, the
// orders nobody has accepted yet. Each names itself and gives its number;
// the title carries the sum.
//
// The router rewrites the title on every navigation, which would drop the
// number; a watcher on <title> puts it back.

const PREFIX = /^\(\d+\+?\) /;

/** A title without any count in front. */
export function bareTitle(title: string): string {
  return title.replace(PREFIX, '');
}

/** A title with `n` in front, or bare when there is nothing to count. Never doubles a count already there. */
export function titleWithCount(title: string, n: number): string {
  const base = bareTitle(title);
  if (!Number.isFinite(n) || n <= 0) return base;
  return `(${n > 99 ? '99+' : Math.floor(n)}) ${base}`;
}

const counts = new Map<string, number>();
let watching = false;

function apply(): void {
  if (typeof document === 'undefined') return;
  let total = 0;
  for (const n of counts.values()) total += n;
  const next = titleWithCount(document.title, total);
  // Only when it differs: the watcher below hears our own write too.
  if (document.title !== next) document.title = next;
}

function watch(): void {
  if (watching || typeof MutationObserver === 'undefined') return;
  watching = true;
  // The whole head: a navigation may replace the <title> element, not only its text.
  new MutationObserver(apply).observe(document.head, { childList: true, subtree: true, characterData: true });
}

/** Say how many `source` counts; zero (or less) withdraws it. */
export function setTabCount(source: string, n: number): void {
  if (n > 0) counts.set(source, n);
  else counts.delete(source);
  watch();
  apply();
}
