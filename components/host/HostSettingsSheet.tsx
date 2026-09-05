'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import type { ReservationShift } from '@/lib/database.types';
import { Sheet, Field, INPUT, PRIMARY, GHOST } from './ui';
import type { HostSettings } from './PartyList';

/** Shifts, turn times by party size, and when a booking counts as late. Managers only. */
export function HostSettingsSheet({
  settings,
  onClose,
  onSave,
}: {
  settings: HostSettings;
  onClose: () => void;
  onSave: (s: { shifts: ReservationShift[]; turns: Record<string, number>; late: number }) => void;
}) {
  const t = useTranslations('host');
  const [shifts, setShifts] = useState<ReservationShift[]>(settings.shifts);
  const [turns, setTurns] = useState<Record<string, number>>(settings.turns);
  const [late, setLate] = useState(settings.late);
  const sizes = ['1', '2', '3', '4', '5', '6', '7', '8'];

  return (
    <Sheet
      title={t('settings')}
      onClose={onClose}
      footer={
        <button onClick={() => onSave({ shifts: shifts.filter((s) => s.name.trim()), turns, late })} className={`${PRIMARY} w-full`}>
          {t('save')}
        </button>
      }
    >
      <div className="space-y-6">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-white/40">{t('shifts')}</p>
          <div className="space-y-2">
            {shifts.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className={`${INPUT} flex-1`} value={s.name} onChange={(e) => setShifts(shifts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input type="time" className={`${INPUT} w-28`} value={s.start} onChange={(e) => setShifts(shifts.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                <input type="time" className={`${INPUT} w-28`} value={s.end} onChange={(e) => setShifts(shifts.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
                <button onClick={() => setShifts(shifts.filter((_, j) => j !== i))} className="p-2 text-white/40 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <button onClick={() => setShifts([...shifts, { name: '', start: '18:00', end: '23:00' }])} className={`${GHOST} mt-2`}>
            <Plus className="h-4 w-4" /> {t('addShift')}
          </button>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-white/40">{t('turnTimes')}</p>
          <p className="mb-2 text-xs text-white/40">{t('turnTimesHint')}</p>
          <div className="grid grid-cols-4 gap-2">
            {sizes.map((k) => (
              <Field key={k} label={k === '8' ? '8+' : k}>
                <input
                  type="number"
                  inputMode="numeric"
                  className={INPUT}
                  value={turns[k] ?? ''}
                  onChange={(e) => setTurns({ ...turns, [k]: Number(e.target.value) || 0 })}
                />
              </Field>
            ))}
          </div>
        </div>

        <Field label={t('lateAfter')}>
          <input type="number" inputMode="numeric" className={INPUT} value={late} onChange={(e) => setLate(Number(e.target.value) || 0)} />
        </Field>
      </div>
    </Sheet>
  );
}
