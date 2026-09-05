'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, CornerDownLeft } from 'lucide-react';
import { SETTINGS_INDEX } from '@/lib/admin-search';
import { norm } from '@/lib/settings-search';

interface Hit {
  href: string;
  title: string;
  section: string;
  kind: 'page' | 'setting';
}

/**
 * The admin-wide search: pages the user can open plus the settings of the
 * forms that accept ?q= deep links. Opens from the sidebar button or ⌘K / Ctrl+K.
 */
export function GlobalSearch({
  pages,
  compact = false,
}: {
  /** The nav items this user can see (already filtered by role and plan). */
  pages: { href: string; label: string }[];
  /** Icon-only trigger (mobile header). */
  compact?: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  // Settings only for pages this user can reach.
  const index = useMemo<Hit[]>(() => {
    const out: Hit[] = pages.map((p) => ({ href: p.href, title: p.label, section: t('search.pages'), kind: 'page' }));
    for (const group of SETTINGS_INDEX) {
      const page = pages.find((p) => p.href === group.href);
      if (!page) continue;
      for (const key of group.keys) {
        if (!t.has(`${group.ns}.${key}`)) continue;
        const label = t(`${group.ns}.${key}`);
        out.push({ href: `${group.href}?q=${encodeURIComponent(label)}`, title: label, section: page.label, kind: 'setting' });
      }
    }
    return out;
  }, [pages, t]);

  const hits = useMemo(() => {
    const nq = norm(q.trim());
    if (nq.length < 2) return index.filter((h) => h.kind === 'page');
    const scored = index
      .map((h) => {
        const title = norm(h.title);
        const score = title.startsWith(nq) ? 3 : title.includes(nq) ? 2 : norm(h.section).includes(nq) ? 1 : 0;
        return { h, score: score + (h.kind === 'page' ? 0.5 : 0) };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, 14).map((x) => x.h);
  }, [index, q]);

  function go(h: Hit) {
    setOpen(false);
    setQ('');
    const url = new URL(h.href, window.location.origin);
    // Already on that page: the form is mounted, so tell it directly instead
    // of relying on a navigation it would not notice.
    if (url.pathname === window.location.pathname && url.searchParams.has('q')) {
      window.history.replaceState(null, '', url);
      window.dispatchEvent(new CustomEvent('kuik:jump', { detail: url.searchParams.get('q') }));
      return;
    }
    router.push(h.href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('search.open')}
        className={
          compact
            ? 'p-1.5 text-neutral-700'
            : 'mb-3 flex w-full items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-left text-sm text-neutral-500 hover:border-neutral-300'
        }
      >
        <Search className={compact ? 'h-6 w-6' : 'h-4 w-4'} />
        {!compact && (
          <>
            <span className="flex-1 truncate">{t('search.open')}</span>
            <kbd className="rounded border border-neutral-200 bg-white px-1.5 text-[10px] text-neutral-400">⌘K</kbd>
          </>
        )}
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div role="dialog" className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center gap-2 border-b border-neutral-100 px-4">
              <Search className="h-4 w-4 text-neutral-400" />
              <input
                ref={input}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActive((i) => Math.min(i + 1, hits.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActive((i) => Math.max(i - 1, 0));
                  } else if (e.key === 'Enter' && hits[active]) {
                    e.preventDefault();
                    go(hits[active]);
                  }
                }}
                placeholder={t('search.placeholder')}
                role="combobox"
                aria-expanded
                aria-controls="admin-search-hits"
                className="w-full bg-transparent py-3 text-sm outline-none"
              />
            </div>
            <ul id="admin-search-hits" role="listbox" className="max-h-[50vh] overflow-auto p-2">
              {hits.length === 0 && <li className="px-3 py-6 text-center text-sm text-neutral-500">{t('search.noResults')}</li>}
              {hits.map((h, i) => (
                <li key={h.href + h.title} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onClick={() => go(h)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${i === active ? 'bg-neutral-100' : ''}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{h.title}</span>
                      <span className="block text-xs text-neutral-500">{h.section}</span>
                    </span>
                    {i === active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-neutral-400" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
