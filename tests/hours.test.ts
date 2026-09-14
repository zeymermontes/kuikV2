import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSchedule, parseWeekHours, serializeSchedule, hoursOn, isOpenNowIn, todayHoursIn, upcomingSpecials, defaultWeekHours,
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
