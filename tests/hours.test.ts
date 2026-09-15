import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSchedule, parseWeekHours, serializeSchedule, hoursOn, isOpenNowIn, todayHoursIn, upcomingSpecials, defaultWeekHours, nextOpeningIn,
} from '../lib/hours';

const week = defaultWeekHours(); // 09:00–18:00 every day
const stored = {
  week,
  special: [
    { date: '2026-12-25', label: 'Navidad', closed: true, open: '09:00', close: '18:00' },
    { date: '2026-05-10', label: 'Día de las madres', closed: false, open: '08:00', close: '23:00' },
  ],
};

test('both stored shapes parse; the bare week has no special dates', () => {
  assert.deepEqual(parseSchedule(week), { week, special: [] });
  assert.equal(parseWeekHours(stored)?.length, 7);
  assert.equal(parseSchedule(stored)?.special.map((d) => d.date).join(','), '2026-05-10,2026-12-25');
  assert.equal(parseSchedule({ week: [1, 2] }), null);
  assert.equal(parseSchedule(null), null);
});

test('the plain week is written back while nothing is special', () => {
  assert.deepEqual(serializeSchedule({ week, special: [] }), week);
  const s = parseSchedule(stored)!;
  assert.equal((serializeSchedule(s) as { special: unknown[] }).special.length, 2);
});

test('a special date overrides its weekday, with its label', () => {
  const s = parseSchedule(stored)!;
  assert.deepEqual(hoursOn(s, '2026-12-25'), { closed: true, open: '09:00', close: '18:00', label: 'Navidad' });
  assert.equal(hoursOn(s, '2026-05-10').close, '23:00');
  assert.equal(hoursOn(s, '2026-12-26').close, '18:00');
  assert.equal(hoursOn(week, '2026-12-25').closed, false);
});

test('open-now and today read the special date in the restaurant zone', () => {
  const s = parseSchedule(stored)!;
  const xmasNoon = new Date('2026-12-25T18:00:00Z'); // 12:00 in Mexico City
  assert.equal(isOpenNowIn(s, 'America/Mexico_City', xmasNoon), false);
  assert.equal(isOpenNowIn(week, 'America/Mexico_City', xmasNoon), true);
  assert.equal(todayHoursIn(s, 'America/Mexico_City', xmasNoon).label, 'Navidad');
  const mothers = new Date('2026-05-11T03:30:00Z'); // 22:30 on May 10 in Mexico City
  assert.equal(isOpenNowIn(s, 'America/Mexico_City', mothers), true);
});

test('upcoming specials start today and stop at the horizon', () => {
  const s = parseSchedule(stored)!;
  assert.deepEqual(upcomingSpecials(s, '2026-05-10').map((d) => d.date), ['2026-05-10']);
  assert.deepEqual(upcomingSpecials(s, '2026-05-11').map((d) => d.date), []);
  assert.deepEqual(upcomingSpecials(s, '2026-05-11', 365).map((d) => d.date), ['2026-12-25']);
});

test('the next opening skips closed days and says how far away it is', () => {
  const tz = 'America/Mexico_City';
  const sched = {
    week: week.map((d, i) => (i === 1 || i === 2 ? { ...d, closed: true } : d)), // Tue & Wed closed
    special: [] as { date: string; label: string; closed: boolean; open: string; close: string }[],
  };
  // Monday 2026-09-14 at 20:00 local (02:00Z next day): Tue and Wed closed → Thursday.
  const monNight = new Date('2026-09-15T02:00:00Z');
  assert.deepEqual(nextOpeningIn(sched, tz, monNight), { date: '2026-09-17', open: '09:00', daysAhead: 3, label: undefined });
  // Monday 07:00 local: opens later today.
  assert.equal(nextOpeningIn(sched, tz, new Date('2026-09-14T13:00:00Z'))?.daysAhead, 0);
  // Monday 10:00 local: open now → nothing to announce.
  assert.equal(nextOpeningIn(sched, tz, new Date('2026-09-14T16:00:00Z')), null);
  // Thursday night → Friday is tomorrow.
  assert.equal(nextOpeningIn(sched, tz, new Date('2026-09-18T02:00:00Z'))?.daysAhead, 1);
});
