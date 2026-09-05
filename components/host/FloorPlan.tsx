'use client';

import { useEffect, useRef, useState } from 'react';
import { Ban, Plus } from 'lucide-react';
import type { FloorTable } from '@/lib/database.types';
import { RESERVED_SOON_COLOR, type TableView } from '@/lib/host/model';
import { TABLE_STATUS_ICON } from './ui';

// The plan itself. Tables live on a cell grid (FloorTable.x / y); the whole
// board scales to the width it gets, so the same plan reads on a phone, a
// tablet and a wall screen. Shapes, the party-size bubble and the course icon
// follow OpenTable's plan so the picture is familiar.

const CELL = 64;
const SIZE: Record<FloorTable['shape'], { w: number; h: number }> = {
  square: { w: 1.5, h: 1.5 },
  round: { w: 1.5, h: 1.5 },
  rect: { w: 2.5, h: 1.5 },
  diamond: { w: 1.5, h: 1.5 },
};

export function FloorPlan({
  views,
  now,
  selectedIds,
  suggestedIds,
  editMode,
  overTurnIds,
  onTap,
  onMove,
  onAddAt,
  addLabel,
}: {
  views: TableView[];
  now: number;
  /** Tables picked while seating / moving a party. */
  selectedIds: Set<string>;
  /** Free tables that fit the party being seated. */
  suggestedIds: Set<string>;
  editMode: boolean;
  /** Seated parties past their turn time. */
  overTurnIds: Set<string>;
  onTap: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onAddAt?: (x: number, y: number) => void;
  addLabel?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const drag = useRef<{ id: string; ox: number; oy: number; moved: boolean; el: HTMLElement } | null>(null);
  // The click that follows a drag must not open the table; pointerup clears `drag` before it fires.
  const justDragged = useRef(false);

  const cols = Math.max(10, ...views.map((v) => v.table.x + SIZE[v.table.shape].w + 1));
  const rows = Math.max(7, ...views.map((v) => v.table.y + SIZE[v.table.shape].h + 1));

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const s = Math.min(1.25, e.contentRect.width / (cols * CELL), e.contentRect.height / (rows * CELL));
      setScale(Math.max(0.35, s));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [cols, rows]);

  function onPointerDown(e: React.PointerEvent, id: string) {
    if (!editMode) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    drag.current = { id, ox: e.clientX, oy: e.clientY, moved: false, el };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.ox;
    const dy = e.clientY - d.oy;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    d.el.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  function onPointerUp(e: React.PointerEvent, table: FloorTable) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    d.el.style.transform = '';
    if (!d.moved) return;
    justDragged.current = true;
    const nx = table.x + Math.round((e.clientX - d.ox) / (CELL * scale));
    const ny = table.y + Math.round((e.clientY - d.oy) / (CELL * scale));
    onMove(table.id, Math.max(0, nx), Math.max(0, ny));
  }

  return (
    <div
      ref={box}
      className="relative h-full w-full overflow-hidden"
      onDoubleClick={(e) => {
        if (!editMode || !onAddAt || e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        onAddAt(Math.floor((e.clientX - r.left) / (CELL * scale)), Math.floor((e.clientY - r.top) / (CELL * scale)));
      }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: cols * CELL,
          height: rows * CELL,
          transform: `scale(${scale})`,
          backgroundImage: editMode ? 'radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)' : undefined,
          backgroundSize: `${CELL}px ${CELL}px`,
        }}
      >
        {views.map((v) => {
          const { table, seated, upcoming, blocked, color } = v;
          const size = SIZE[table.shape];
          const selected = selectedIds.has(table.id);
          const suggested = suggestedIds.has(table.id);
          const Icon = seated ? TABLE_STATUS_ICON[seated.table_status] : null;
          const light = !seated && !blocked && color === RESERVED_SOON_COLOR;
          const over = seated ? overTurnIds.has(seated.id) : false;
          const next = seated ? null : (upcoming[0] ?? null);
          return (
            <button
              key={table.id}
              data-help="host_table"
              onPointerDown={(e) => onPointerDown(e, table.id)}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => onPointerUp(e, table)}
              onClick={() => {
                if (justDragged.current) {
                  justDragged.current = false;
                  return;
                }
                onTap(table.id);
              }}
              className={`absolute flex items-center justify-center text-white transition-shadow ${
                table.shape === 'round' ? 'rounded-full' : table.shape === 'diamond' ? 'rotate-45 rounded-xl' : 'rounded-xl'
              } ${editMode ? 'cursor-move' : ''} ${selected ? 'ring-4 ring-white' : suggested ? 'ring-4 ring-white/50 animate-pulse' : ''} ${
                over ? 'shadow-[0_0_0_3px_#ef4444]' : ''
              }`}
              style={{
                left: table.x * CELL,
                top: table.y * CELL,
                width: size.w * CELL,
                height: size.h * CELL,
                backgroundColor: color,
                color: light ? '#1f1f2a' : '#fff',
              }}
              title={table.label}
            >
              <span className={`flex flex-col items-center leading-none ${table.shape === 'diamond' ? '-rotate-45' : ''}`}>
                {Icon && <Icon className="mb-1 h-5 w-5 opacity-90" />}
                {blocked && <Ban className="mb-1 h-5 w-5 opacity-60" />}
                <span className="text-lg font-bold">{table.label}</span>
                {!seated && !next && <span className="mt-0.5 text-[10px] opacity-60">{table.seats}</span>}
                {next && <span className="mt-0.5 text-[10px] font-semibold opacity-80">{next.time}</span>}
              </span>
              {(seated || next) && (
                <span
                  className={`absolute -left-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[11px] font-bold shadow ${
                    table.shape === 'diamond' ? '-rotate-45' : ''
                  }`}
                  style={{ backgroundColor: '#fff', color: '#1f1f2a' }}
                >
                  {(seated ?? next)!.party_size}
                </span>
              )}
              {table.server_name && (
                <span className="absolute -bottom-1.5 left-1/2 max-w-[90%] -translate-x-1/2 truncate rounded-full bg-black/60 px-1.5 text-[9px] font-medium text-white">
                  {table.server_name}
                </span>
              )}
              {seated && now > 0 && over && (
                <span className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-pos-dark" />
              )}
            </button>
          );
        })}
        {views.length === 0 && !editMode && (
          <div className="absolute inset-0 flex items-center justify-center" />
        )}
      </div>
      {editMode && onAddAt && (
        <button
          data-help="host_addTable"
          onClick={() => onAddAt(1, 1)}
          className="absolute bottom-4 left-4 flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow-lg"
        >
          <Plus className="h-4 w-4" /> {addLabel}
        </button>
      )}
    </div>
  );
}
