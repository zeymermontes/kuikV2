'use client';

import { useEffect } from 'react';
import {
  X, Star, Sparkles, Cake, Heart, AlertTriangle, Baby, Accessibility,
  Armchair, Salad, UtensilsCrossed, CakeSlice, ReceiptText, CircleDollarSign, Brush,
  Clock, CalendarCheck, DoorOpen, UsersRound, Check, UserX, Hourglass, MessageCircle, AlertCircle,
} from 'lucide-react';
import type { ReservationStatus, TableStatus } from '@/lib/database.types';
import type { PartyTag } from '@/lib/host/model';

// Dark-surface primitives for the host stand. The register (components/pos)
// is light; the door runs dark, as every host app does, because the tablet
// sits in a dim entrance and the plan's colours have to carry the meaning.

export const INPUT =
  'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-base text-white placeholder:text-white/30 focus:border-pos-accent focus:outline-none';
export const BTN = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40';
export const PRIMARY = `${BTN} bg-pos-accent text-pos-accent-text hover:bg-pos-accent-hover`;
export const GHOST = `${BTN} border border-white/15 text-white hover:bg-white/10`;
export const DANGER = `${BTN} bg-red-600/90 text-white hover:bg-red-600`;

/** Right-hand drawer on tablets and up, bottom sheet on phones. */
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end">
      <div className="animate-fade absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="animate-slide-up relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-pos-sidebar text-white shadow-2xl md:h-full md:max-h-none md:w-[440px] md:rounded-none">
        <header className="flex items-start gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold">{title}</h2>
            {subtitle && <p className="truncate text-sm text-white/50">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="close" className="rounded-full p-1.5 text-white/60 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="border-t border-white/10 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/40">{label}</span>
      {children}
    </label>
  );
}

export function Chip({
  active,
  onClick,
  children,
  color,
  small,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  color?: string;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold transition ${
        small ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm'
      } ${active ? 'text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
      style={active ? { backgroundColor: color ?? 'var(--pos-accent)', color: color ? '#fff' : 'var(--pos-accent-text)' } : undefined}
    >
      {children}
    </button>
  );
}

export function Stepper({ value, onChange, min = 1, max = 50 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-white/10 bg-white/5">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="px-4 py-2 text-lg font-bold text-white/70 hover:text-white">−</button>
      <span className="min-w-8 text-center text-lg font-bold tabular-nums">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className="px-4 py-2 text-lg font-bold text-white/70 hover:text-white">+</button>
    </div>
  );
}

export const TAG_ICON: Record<PartyTag, typeof Star> = {
  vip: Star,
  first_time: Sparkles,
  birthday: Cake,
  anniversary: Heart,
  allergy: AlertTriangle,
  stroller: Baby,
  wheelchair: Accessibility,
};

export const TABLE_STATUS_ICON: Record<TableStatus, typeof Star> = {
  seated: Armchair,
  appetizer: Salad,
  entree: UtensilsCrossed,
  dessert: CakeSlice,
  check: ReceiptText,
  paid: CircleDollarSign,
  bussing: Brush,
};

export const PARTY_STATUS_ICON: Record<ReservationStatus | 'late', typeof Star> = {
  pending: Clock,
  confirmed: CalendarCheck,
  arrived: DoorOpen,
  partial: UsersRound,
  seated: Armchair,
  finished: Check,
  no_show: UserX,
  cancelled: X,
  waiting: Hourglass,
  notified: MessageCircle,
  late: AlertCircle,
};
