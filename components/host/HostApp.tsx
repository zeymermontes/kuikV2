'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ChevronLeft, ChevronRight, Users, Search, Plus, Settings, LayoutGrid, List, Pencil, Check, X,
  CalendarClock, ExternalLink, Bell, Clock, Link2, Trash2,
} from 'lucide-react';
import type {
  FloorTable, FloorCombination, Reservation, ReservationArea, ReservationStatus, TableStatus, TableShape,
} from '@/lib/database.types';
import { createClient, channelName } from '@/lib/supabase/client';
import { addDays, nowHHMMInTz } from '@/lib/time';
import {
  minutesSince, sectionOf, shiftAt, suggestSeating, tableViews, turnMinutesFor, type Section,
} from '@/lib/host/model';
import {
  listHostDay, setPartyStatus, setTableStatus, moveParty, updateParty, addWalkIn, tableReadyLink,
  saveTable, moveTable, deleteTable, setTableServer, blockTable, saveHostSettings, saveCombination, deleteCombination,
  type HostDay, type PartyFields,
} from '@/app/host/actions';
import { markNotificationSent } from '@/app/(dashboard)/reservations/actions';
import { ReservationForm } from '@/components/dashboard/ReservationForm';
import { FloorPlan } from './FloorPlan';
import { Timeline } from './Timeline';
import { PartyList, type HostSettings } from './PartyList';
import { PartySheet } from './PartySheet';
import { WalkInSheet } from './WalkInSheet';
import { TableSheet } from './TableSheet';
import { HostSettingsSheet } from './HostSettingsSheet';
import { PRIMARY } from './ui';

type View = 'floor' | 'timeline' | 'list';
type Sheet =
  | { kind: 'party'; id: string }
  | { kind: 'walkin'; preset: { party?: number; quote?: number; tableIds?: string[] } }
  | { kind: 'table'; id: string | null; at?: { x: number; y: number } }
  | { kind: 'settings' }
  | { kind: 'booking' }
  | null;

/**
 * The host stand. Left: the day's book in OpenTable's three lists (Waitlist,
 * Reservations, Seated). Right: the floor plan, the timeline, or the full
 * list. Everything a host does is a tap here; the dashboard's /reservations
 * stays the owner's calendar view.
 */
export function HostApp({
  tenantId,
  tenantName,
  logoUrl,
  day,
  today,
  timezone,
  initial,
  areas,
  settings,
  pendingTotal,
  canEdit,
  themeStyle,
  demo = false,
}: {
  tenantId: string;
  tenantName: string;
  logoUrl: string | null;
  day: string;
  today: string;
  timezone: string;
  locale: string;
  initial: HostDay;
  areas: ReservationArea[];
  settings: HostSettings;
  pendingTotal: number;
  canEdit: boolean;
  themeStyle?: React.CSSProperties;
  /** In-memory sample data: every write stays local, nothing syncs. */
  demo?: boolean;
}) {
  const t = useTranslations('host');
  const router = useRouter();
  const [, startTransition] = useTransition();
  // In demo mode the optimistic update IS the update.
  const start = demo ? () => {} : startTransition;
  const [reservations, setReservations] = useState(initial.reservations);
  const [tables, setTables] = useState(initial.tables);
  const [combos, setCombos] = useState(initial.combos);
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState<View>('floor');
  const [mobileTab, setMobileTab] = useState<'list' | View>('list');
  const [areaId, setAreaId] = useState<string | null>(areas[0]?.id ?? null);
  const [editMode, setEditMode] = useState(false);
  const [comboPick, setComboPick] = useState<string[] | null>(null);
  const [seating, setSeating] = useState<{ partyId: string; tableIds: string[]; move: boolean } | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [collapsed, setCollapsed] = useState<Set<Section>>(new Set());
  const [query, setQuery] = useState('');
  const [toSend, setToSend] = useState<Record<string, { href: string; notificationId: string }>>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const refresh = useCallback(async () => {
    try {
      const d = await listHostDay(day);
      setReservations(d.reservations);
      setTables(d.tables);
      setCombos(d.combos);
    } catch {
      // keep what we have mid-service
    }
  }, [day]);

  // Live: the book, the plan and the combinations, same shape as the dashboard board.
  useEffect(() => {
    if (demo) return;
    const supabase = createClient();
    const channel = supabase
      .channel(channelName(`host-${tenantId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations', filter: `tenant_id=eq.${tenantId}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string }).id;
          if (id) setReservations((cur) => cur.filter((r) => r.id !== id));
          return;
        }
        const row = payload.new as Reservation;
        setReservations((cur) => {
          const without = cur.filter((r) => r.id !== row.id);
          return row.date === day ? [...without, row] : without;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'floor_tables', filter: `tenant_id=eq.${tenantId}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string }).id;
          if (id) setTables((cur) => cur.filter((x) => x.id !== id));
          return;
        }
        const row = payload.new as FloorTable;
        setTables((cur) => [...cur.filter((x) => x.id !== row.id), row].sort((a, b) => a.position - b.position));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'floor_combinations', filter: `tenant_id=eq.${tenantId}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string }).id;
          if (id) setCombos((cur) => cur.filter((x) => x.id !== id));
          return;
        }
        const row = payload.new as FloorCombination;
        setCombos((cur) => [...cur.filter((x) => x.id !== row.id), row]);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void refresh();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, day, refresh, demo]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () => (q ? reservations.filter((r) => r.customer_name.toLowerCase().includes(q) || (r.phone ?? '').includes(q)) : reservations),
    [reservations, q],
  );
  const views = useMemo(() => tableViews(tables, reservations, now), [tables, reservations, now]);
  const inRoom = useCallback(
    (tableAreaId: string | null) => (areaId ? tableAreaId === areaId : !tableAreaId || areas.length === 0),
    [areaId, areas.length],
  );
  const roomViews = useMemo(() => views.filter((v) => inRoom(v.table.area_id)), [views, inRoom]);
  const roomTables = useMemo(() => tables.filter((x) => inRoom(x.area_id)), [tables, inRoom]);
  const overTurnIds = useMemo(
    () =>
      new Set(
        reservations
          .filter((r) => r.status === 'seated' && minutesSince(r.seated_at, now) > turnMinutesFor(r.party_size, settings.turns, r.turn_minutes))
          .map((r) => r.id),
      ),
    [reservations, now, settings.turns],
  );
  const covers = reservations.filter((r) => sectionOf(r) !== 'removed').reduce((n, r) => n + r.party_size, 0);
  const seatedNow = reservations.filter((r) => r.status === 'seated').reduce((n, r) => n + r.party_size, 0);
  const shift = shiftAt(day === today ? nowHHMMInTz(timezone) : '12:00', settings.shifts);
  const labelOf = useCallback((id: string) => tables.find((x) => x.id === id)?.label ?? '?', [tables]);

  // Waitlist quotes per party size: a free fit (table or combination) = now;
  // otherwise the soonest seated table that fits, by turn time, in 5-minute steps.
  const quotes = useMemo(() => {
    return [1, 2, 3, 4, 5, 6].map((party) => {
      if (suggestSeating(views, combos, party).length > 0) return { party, minutes: 0 };
      const soon = views
        .filter((v) => v.seated && v.table.seats >= party)
        .map((v) => turnMinutesFor(v.seated!.party_size, settings.turns, v.seated!.turn_minutes) - minutesSince(v.seated!.seated_at, now))
        .sort((a, b) => a - b)[0];
      const mins = soon == null ? 30 : Math.max(5, Math.ceil(soon / 5) * 5);
      return { party, minutes: mins };
    });
  }, [views, combos, settings.turns, now]);

  const seatingParty = seating ? reservations.find((r) => r.id === seating.partyId) ?? null : null;
  const suggestions = useMemo(() => (seatingParty ? suggestSeating(views, combos, seatingParty.party_size).slice(0, 5) : []), [views, combos, seatingParty]);
  const suggestedIds = useMemo(() => new Set(suggestions.flatMap((s) => s.tableIds)), [suggestions]);

  // ── Actions (optimistic where it matters) ────────────────────────────────
  function patch(id: string, p: Partial<Reservation>) {
    setReservations((cur) => cur.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }

  function act(id: string, status: ReservationStatus, opts: { tableIds?: string[] } = {}) {
    const nowIso = new Date().toISOString();
    const p: Partial<Reservation> = { status };
    if (status === 'arrived' || status === 'partial') p.arrived_at = nowIso;
    if (status === 'seated') Object.assign(p, { seated_at: nowIso, table_status: 'seated', finished_at: null, ...(opts.tableIds ? { table_ids: opts.tableIds } : {}) });
    if (status === 'finished') p.finished_at = nowIso;
    patch(id, p);
    start(async () => {
      const r = await setPartyStatus(id, status, opts);
      if (r.href && r.notificationId) setToSend((cur) => ({ ...cur, [id]: { href: r.href!, notificationId: r.notificationId! } }));
    });
  }

  function showFloor() {
    setMobileTab('floor');
    setView('floor');
  }

  function beginSeating(id: string, move = false) {
    const r = reservations.find((x) => x.id === id);
    setSheet(null);
    setSeating({ partyId: id, tableIds: move ? [] : (r?.table_ids ?? []), move });
    showFloor();
  }

  function confirmSeating() {
    if (!seating || seating.tableIds.length === 0) return;
    if (seating.move) {
      patch(seating.partyId, { table_ids: seating.tableIds });
      start(() => moveParty(seating.partyId, seating.tableIds));
    } else {
      act(seating.partyId, 'seated', { tableIds: seating.tableIds });
    }
    setSeating(null);
  }

  function saveCombo() {
    if (!comboPick || comboPick.length < 2) return;
    const ids = comboPick;
    const seats = ids.reduce((n, id) => n + (tables.find((x) => x.id === id)?.seats ?? 0), 0);
    setComboPick(null);
    if (demo) {
      setCombos((cur) => [...cur, { id: `demo-c-${Date.now()}`, tenant_id: tenantId, area_id: areaId, table_ids: ids, seats, created_at: new Date().toISOString() }]);
      return;
    }
    start(async () => {
      const c = await saveCombination({ tableIds: ids, seats, areaId });
      if (c) setCombos((cur) => [...cur.filter((x) => x.id !== c.id), c]);
    });
  }

  function onTableTap(id: string) {
    if (seating) {
      setSeating({ ...seating, tableIds: seating.tableIds.includes(id) ? seating.tableIds.filter((x) => x !== id) : [...seating.tableIds, id] });
      return;
    }
    if (comboPick) {
      setComboPick(comboPick.includes(id) ? comboPick.filter((x) => x !== id) : [...comboPick, id]);
      return;
    }
    if (editMode) {
      setSheet({ kind: 'table', id });
      return;
    }
    const v = views.find((x) => x.table.id === id);
    if (v?.seated) setSheet({ kind: 'party', id: v.seated.id });
    else setSheet({ kind: 'table', id });
  }

  function sendNotice(id: string) {
    const item = toSend[id];
    if (!item) return;
    window.open(item.href, '_blank');
    setToSend((cur) => {
      const next = { ...cur };
      delete next[id];
      return next;
    });
    start(() => markNotificationSent(item.notificationId));
  }

  function notifyTableReady(id: string) {
    patch(id, { status: 'notified', notified_at: new Date().toISOString() });
    if (demo) return;
    start(async () => {
      const { href } = await tableReadyLink(id);
      if (href) window.open(href, '_blank');
      else setToast(t('noPhone'));
    });
  }

  const href = (d: string) => `/host?d=${d}`;
  const party = sheet?.kind === 'party' ? reservations.find((r) => r.id === sheet.id) ?? null : null;
  const tableView = sheet?.kind === 'table' && sheet.id ? views.find((v) => v.table.id === sheet.id) ?? null : null;
  const roomCombos = combos.filter((c) => inRoom(c.area_id));

  const list = (showAll: boolean) => (
    <PartyList
      reservations={visible}
      tables={tables}
      now={now}
      settings={settings}
      quotes={quotes}
      showAll={showAll}
      collapsed={collapsed}
      onToggle={(s) =>
        setCollapsed((cur) => {
          const next = new Set(cur);
          if (next.has(s)) next.delete(s);
          else next.add(s);
          return next;
        })
      }
      onSelect={(id) => setSheet({ kind: 'party', id })}
      onSeat={(id) => beginSeating(id)}
      onWalkIn={(preset) => setSheet({ kind: 'walkin', preset: preset ?? {} })}
    />
  );

  const viewSwitch = (
    <div className="flex overflow-hidden rounded-lg bg-white/5">
      {(
        [
          ['floor', LayoutGrid, t('floor')],
          ['timeline', Clock, t('timeline')],
          ['list', List, t('list')],
        ] as const
      ).map(([key, Icon, label]) => (
        <button key={key} onClick={() => setView(key)} className={`p-2 ${view === key ? 'bg-white text-neutral-900' : 'text-white/70'}`} title={label} aria-label={label}>
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );

  const search = (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('search')}
        className="h-9 w-full rounded-lg bg-white/5 pl-8 pr-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-pos-accent/50"
      />
    </div>
  );

  const floor = (
    <div className="relative flex h-full flex-col">
      {/* Seating / moving bar with suggestions */}
      {seating && seatingParty && (
        <div className="absolute inset-x-2 top-2 z-20 rounded-2xl bg-white p-2.5 text-neutral-900 shadow-xl md:inset-x-3 md:top-3">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-bold">{seating.move ? t('movingBar', { name: seatingParty.customer_name }) : t('seatingBar', { name: seatingParty.customer_name, n: seatingParty.party_size })}</span>
              <span className="ml-2 text-neutral-500">{seating.tableIds.length ? seating.tableIds.map(labelOf).join(' + ') : t('selectTables')}</span>
            </span>
            <button onClick={() => setSeating(null)} className="rounded-xl border border-neutral-200 p-2" aria-label={t('cancel')}><X className="h-4 w-4" /></button>
            <button onClick={confirmSeating} disabled={seating.tableIds.length === 0} className="rounded-xl bg-pos-accent px-3 py-2 text-sm font-semibold text-pos-accent-text disabled:opacity-40">
              <Check className="mr-1 inline h-4 w-4" /> {seating.move ? t('act_move') : t('seat')}
            </button>
          </div>
          {suggestions.length > 0 && (
            <div className="no-scrollbar mt-2 flex items-center gap-1.5 overflow-x-auto text-xs">
              <span className="shrink-0 text-neutral-400">{t('suggested')}</span>
              {suggestions.map((s) => (
                <button
                  key={s.tableIds.join('+')}
                  onClick={() => setSeating({ ...seating, tableIds: s.tableIds })}
                  className={`shrink-0 rounded-full px-2.5 py-1 font-semibold ${
                    seating.tableIds.join('+') === s.tableIds.join('+') ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'
                  }`}
                >
                  {s.tableIds.length > 1 && <Link2 className="mr-1 inline h-3 w-3" />}
                  {s.label} <span className="opacity-60">· {s.seats}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit mode: combinations */}
      {editMode && !seating && (
        <div className="absolute inset-x-2 top-2 z-20 rounded-2xl bg-white p-2.5 text-neutral-900 shadow-xl md:inset-x-3 md:top-3">
          {comboPick ? (
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-bold">{t('pickCombo')}</span>
                <span className="ml-2 text-neutral-500">
                  {comboPick.length ? `${comboPick.map(labelOf).join(' + ')} · ${comboPick.reduce((n, id) => n + (tables.find((x) => x.id === id)?.seats ?? 0), 0)} ${t('seats')}` : t('selectTables')}
                </span>
              </span>
              <button onClick={() => setComboPick(null)} className="rounded-xl border border-neutral-200 p-2" aria-label={t('cancel')}><X className="h-4 w-4" /></button>
              <button onClick={saveCombo} disabled={comboPick.length < 2} className="rounded-xl bg-pos-accent px-3 py-2 text-sm font-semibold text-pos-accent-text disabled:opacity-40">{t('save')}</button>
            </div>
          ) : (
            <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto text-xs">
              <span className="shrink-0 font-bold">{t('combos')}</span>
              {roomCombos.map((c) => (
                <span key={c.id} className="flex shrink-0 items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 font-semibold">
                  <Link2 className="h-3 w-3" /> {c.table_ids.map(labelOf).join('+')} <span className="opacity-60">· {c.seats}</span>
                  <button
                    onClick={() => {
                      setCombos((cur) => cur.filter((x) => x.id !== c.id));
                      start(() => deleteCombination(c.id));
                    }}
                    className="ml-0.5 text-neutral-400 hover:text-red-500"
                    aria-label={t('deleteCombo')}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <button onClick={() => setComboPick([])} className="shrink-0 rounded-full border border-neutral-300 px-2.5 py-1 font-semibold">
                <Plus className="mr-0.5 inline h-3 w-3" /> {t('newCombo')}
              </button>
              <span className="ml-auto hidden shrink-0 text-neutral-400 sm:inline">{t('editHint')}</span>
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1">
        {tables.length === 0 && !editMode ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <LayoutGrid className="h-10 w-10 text-white/20" />
            <p className="font-semibold">{t('noTablesYet')}</p>
            <p className="max-w-sm text-sm text-white/50">{t('noTablesHint')}</p>
            {canEdit && (
              <button onClick={() => { setEditMode(true); setSheet({ kind: 'table', id: null, at: { x: 1, y: 1 } }); }} className={PRIMARY}>
                <Plus className="h-4 w-4" /> {t('addTable')}
              </button>
            )}
          </div>
        ) : (
          <FloorPlan
            views={roomViews}
            now={now}
            selectedIds={new Set(seating?.tableIds ?? comboPick ?? [])}
            suggestedIds={suggestedIds}
            editMode={editMode}
            overTurnIds={overTurnIds}
            onTap={onTableTap}
            onMove={(id, x, y) => {
              setTables((cur) => cur.map((x2) => (x2.id === id ? { ...x2, x, y } : x2)));
              start(() => moveTable(id, x, y));
            }}
            onAddAt={canEdit ? (x, y) => setSheet({ kind: 'table', id: null, at: { x, y } }) : undefined}
            addLabel={t('addTable')}
          />
        )}
      </div>
      {/* Rooms + edit, bottom right like the plan's floor tabs */}
      <div className="absolute bottom-2 right-2 z-10 flex max-w-full flex-wrap items-center justify-end gap-1.5 md:bottom-3 md:right-3">
        {areas.length > 0 && (
          <div className="flex overflow-hidden rounded-xl bg-black/50 backdrop-blur">
            {areas.map((a) => (
              <button key={a.id} onClick={() => setAreaId(a.id)} className={`px-3 py-1.5 text-xs font-semibold ${areaId === a.id ? 'bg-white text-neutral-900' : 'text-white/70'}`}>
                {a.name}
              </button>
            ))}
            <button onClick={() => setAreaId(null)} className={`px-3 py-1.5 text-xs font-semibold ${areaId === null ? 'bg-white text-neutral-900' : 'text-white/70'}`}>
              {t('noRoom')}
            </button>
          </div>
        )}
        {canEdit && (
          <button
            onClick={() => {
              setEditMode((v) => !v);
              setComboPick(null);
            }}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold ${editMode ? 'bg-white text-neutral-900' : 'bg-black/50 text-white/80 backdrop-blur'}`}
          >
            <Pencil className="h-3.5 w-3.5" /> {editMode ? t('donePlan') : t('editPlan')}
          </button>
        )}
      </div>
    </div>
  );

  const timeline = (
    <Timeline tables={roomTables} parties={reservations} now={now} isToday={day === today} settings={settings} onSelect={(id) => setSheet({ kind: 'party', id })} />
  );

  const mainFor = (v: View) => (v === 'floor' ? floor : v === 'timeline' ? timeline : <div className="h-full overflow-y-auto md:max-w-3xl">{list(true)}</div>);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-pos-dark text-white" style={themeStyle}>
      {/* Top bar: one row on tablets, two on phones so nothing is squeezed out */}
      <header className="border-b border-white/10 px-2 py-2 md:px-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-8 w-8 rounded-lg bg-white object-cover" />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pos-accent text-sm font-black text-pos-accent-text">K</span>
            )}
            <span className="hidden max-w-[140px] truncate text-sm font-bold lg:block">{tenantName}</span>
          </div>
          <span className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1.5 text-sm" title={t('covers')}>
            <Users className="h-4 w-4 text-white/60" /> <b>{seatedNow}</b><span className="text-white/40">/{covers}</span>
          </span>
          <div className="flex items-center rounded-lg bg-white/5">
            <Link href={href(addDays(day, -1))} className="p-2 text-white/70 hover:text-white" aria-label={t('prevDay')}><ChevronLeft className="h-4 w-4" /></Link>
            <input
              type="date"
              value={day}
              onChange={(e) => e.target.value && router.push(href(e.target.value))}
              className="w-[7.5rem] bg-transparent text-sm font-semibold text-white [color-scheme:dark] sm:w-auto sm:px-1"
            />
            <Link href={href(addDays(day, 1))} className="p-2 text-white/70 hover:text-white" aria-label={t('nextDay')}><ChevronRight className="h-4 w-4" /></Link>
          </div>
          {day !== today && (
            <Link href={href(today)} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-white/70 underline">{t('today')}</Link>
          )}
          <span className="hidden items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-semibold md:flex">
            <span className="h-2 w-2 rounded-full bg-green-400" /> {shift?.name ?? t('shiftAll')}
          </span>
          <div className="ml-auto hidden min-w-0 flex-1 md:block md:max-w-xs">{search}</div>
          <div className="hidden md:block">{viewSwitch}</div>
          <div className="ml-auto flex items-center gap-1.5 md:ml-0">
            {pendingTotal > 0 && (
              <Link href="/reservations" className="relative rounded-lg bg-white/5 p-2 text-white/70" title={t('pendingOther', { n: pendingTotal })}>
                <Bell className="h-4 w-4" />
                <span className="absolute -right-1 -top-1 min-w-[16px] rounded-full bg-amber-500 px-1 text-center text-[10px] font-bold text-white">{pendingTotal}</span>
              </Link>
            )}
            <button onClick={() => setSheet({ kind: 'booking' })} className={`${PRIMARY} !px-3 !py-2`} title={t('newBooking')}>
              <CalendarClock className="h-4 w-4" /> <span className="hidden lg:inline">{t('newBooking')}</span>
            </button>
            {canEdit && (
              <button onClick={() => setSheet({ kind: 'settings' })} className="rounded-lg bg-white/5 p-2 text-white/70 hover:text-white" title={t('settings')}>
                <Settings className="h-4 w-4" />
              </button>
            )}
            <Link href="/reservations" className="rounded-lg bg-white/5 p-2 text-white/70 hover:text-white" title={t('openDashboard')}>
              <ExternalLink className="h-4 w-4" />
            </Link>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 md:hidden">
          {search}
          <span className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-semibold">
            <span className="h-2 w-2 rounded-full bg-green-400" /> {shift?.name ?? t('shiftAll')}
          </span>
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        <aside className={`w-full shrink-0 overflow-y-auto border-r border-white/10 md:w-[340px] xl:w-[380px] ${mobileTab === 'list' ? 'block' : 'hidden'} md:block`}>
          {list(false)}
        </aside>
        <main className={`min-w-0 flex-1 ${mobileTab === 'list' ? 'hidden' : 'block'} md:block`}>
          <div className="hidden h-full md:block">{mainFor(view)}</div>
          <div className="h-full md:hidden">{mobileTab !== 'list' && mainFor(mobileTab)}</div>
        </main>
      </div>

      {/* Phone tabs */}
      <nav className="flex border-t border-white/10 md:hidden">
        {(
          [
            ['list', List, t('list')],
            ['floor', LayoutGrid, t('floor')],
            ['timeline', Clock, t('timeline')],
          ] as const
        ).map(([key, Icon, label]) => (
          <button key={key} onClick={() => setMobileTab(key)} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${mobileTab === key ? 'text-white' : 'text-white/40'}`}>
            <Icon className="h-5 w-5" /> {label}
          </button>
        ))}
      </nav>

      {toast && (
        <div className="animate-slide-up fixed bottom-16 left-1/2 z-[70] -translate-x-1/2 rounded-2xl bg-white px-4 py-3 text-sm text-neutral-900 shadow-xl md:bottom-6">{toast}</div>
      )}

      {/* Sheets */}
      {party && (
        <PartySheet
          party={party}
          tables={tables}
          areas={areas}
          now={now}
          settings={settings}
          noticeHref={toSend[party.id]?.href ?? null}
          onClose={() => setSheet(null)}
          onStatus={(s) => {
            act(party.id, s);
            if (s === 'finished' || s === 'no_show' || s === 'cancelled') setSheet(null);
          }}
          onTableStatus={(s: TableStatus) => {
            patch(party.id, { table_status: s });
            start(() => setTableStatus(party.id, s));
          }}
          onSeat={() => beginSeating(party.id)}
          onMove={() => beginSeating(party.id, true)}
          onNotify={() => notifyTableReady(party.id)}
          onUpdate={(fields: PartyFields) => {
            patch(party.id, fields as Partial<Reservation>);
            start(() => updateParty(party.id, fields));
          }}
          onSendNotice={() => sendNotice(party.id)}
        />
      )}

      {sheet?.kind === 'walkin' && (
        <WalkInSheet
          preset={sheet.preset}
          tables={tables}
          areas={areas}
          onClose={() => setSheet(null)}
          onSubmit={(input) => {
            const tableIds = sheet.preset.tableIds ?? [];
            setSheet(null);
            const pickLater = input.seatNow && tableIds.length === 0;
            if (demo) {
              const nowIso = new Date().toISOString();
              const d = new Date();
              const r: Reservation = {
                id: `demo-r-${Date.now()}`, tenant_id: tenantId, branch_id: null, area_id: input.areaId, customer_name: input.name, phone: input.phone,
                party_size: input.party, date: day, time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, starts_at: nowIso,
                note: input.note, status: input.seatNow && tableIds.length ? 'seated' : input.seatNow ? 'arrived' : 'waiting', source: 'walkin', table_ids: tableIds,
                table_status: 'seated', arrived_at: nowIso, seated_at: input.seatNow && tableIds.length ? nowIso : null, finished_at: null,
                quoted_minutes: input.seatNow ? null : input.quotedMinutes, notified_at: null, server_name: null, tags: input.tags, turn_minutes: null, created_at: nowIso,
              };
              setReservations((cur) => [...cur, r]);
              if (pickLater) {
                setSeating({ partyId: r.id, tableIds: [], move: false });
                showFloor();
              }
              return;
            }
            start(async () => {
              const r = await addWalkIn({
                name: input.name,
                phone: input.phone,
                party: input.party,
                note: input.note,
                quotedMinutes: input.quotedMinutes,
                tags: input.tags,
                areaId: input.areaId,
                tableIds: input.seatNow ? tableIds : [],
              });
              if (!r) return;
              setReservations((cur) => [...cur.filter((x) => x.id !== r.id), r]);
              if (pickLater) {
                setSeating({ partyId: r.id, tableIds: [], move: false });
                showFloor();
              }
            });
          }}
        />
      )}

      {sheet?.kind === 'table' && (
        <TableSheet
          key={sheet.id ?? 'new'}
          view={tableView}
          areas={areas}
          defaultAreaId={areaId}
          canEdit={canEdit}
          onClose={() => setSheet(null)}
          onSave={(input: { label: string; seats: number; shape: TableShape; area_id: string | null }) => {
            const at = sheet.at ?? { x: 1, y: 1 };
            setSheet(null);
            if (demo) {
              const t0 = new Date().toISOString();
              const id = sheet.id ?? `demo-t-${Date.now()}`;
              const prev = tables.find((x) => x.id === id);
              const row: FloorTable = { id, tenant_id: tenantId, branch_id: null, ...input, x: prev?.x ?? at.x, y: prev?.y ?? at.y, server_name: prev?.server_name ?? null, blocked_until: null, position: 0, created_at: t0, updated_at: t0 };
              setTables((cur) => [...cur.filter((x) => x.id !== id), row]);
              return;
            }
            start(async () => {
              const saved = await saveTable({ id: sheet.id, ...input, x: at.x, y: at.y });
              if (saved) setTables((cur) => [...cur.filter((x) => x.id !== saved.id), saved]);
            });
          }}
          onDelete={() => {
            if (!sheet.id) return;
            const id = sheet.id;
            setTables((cur) => cur.filter((x) => x.id !== id));
            setSheet(null);
            start(() => deleteTable(id));
          }}
          onServer={(name) => {
            if (!sheet.id) return;
            setTables((cur) => cur.map((x) => (x.id === sheet.id ? { ...x, server_name: name || null } : x)));
            start(() => setTableServer(sheet.id!, name));
            setSheet(null);
          }}
          onBlock={(until) => {
            if (!sheet.id) return;
            setTables((cur) => cur.map((x) => (x.id === sheet.id ? { ...x, blocked_until: until } : x)));
            start(() => blockTable(sheet.id!, until));
            setSheet(null);
          }}
          onSeatWalkIn={() => setSheet({ kind: 'walkin', preset: { tableIds: sheet.id ? [sheet.id] : [] } })}
          onOpenParty={(id) => setSheet({ kind: 'party', id })}
        />
      )}

      {sheet?.kind === 'settings' && (
        <HostSettingsSheet
          settings={settings}
          onClose={() => setSheet(null)}
          onSave={(s) => {
            setSheet(null);
            if (demo) return;
            start(async () => {
              await saveHostSettings(s);
              router.refresh();
            });
          }}
        />
      )}

      {sheet?.kind === 'booking' && (
        <ReservationForm
          areas={areas}
          defaultDate={day}
          defaultTime={nextSlot(settings.slotMinutes)}
          onClose={() => setSheet(null)}
          onCreated={refresh}
        />
      )}
    </div>
  );
}

/** The next slot boundary from now, so the booking form opens on a sensible time. */
function nextSlot(minutes: number): string {
  const d = new Date();
  const total = Math.ceil((d.getHours() * 60 + d.getMinutes()) / minutes) * minutes;
  const capped = Math.min(total, 23 * 60 + 30);
  return `${String(Math.floor(capped / 60)).padStart(2, '0')}:${String(capped % 60).padStart(2, '0')}`;
}
