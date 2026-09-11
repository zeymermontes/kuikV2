import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayAvailability, weekdayOfDate, type DayAvailabilityInput } from '../lib/reservations/day';

const HOURS = Array.from({ length: 7 }, (_, i) => ({ closed: i === 0, open: '13:00', close: '22:00' })); // Mondays closed

function base(over: Partial<DayAvailabilityInput> = {}): DayAvailabilityInput {
  return {
    date: '2026-09-12', // a Saturday
    today: '2026-09-11',
    enabled: true,
    maxDays: 30,
    slotMinutes: 30,
    hours: HOURS,
    areas: [],
    reservations: [],
    ...over,
  };
}

test('weekdayOfDate is Monday-based whatever the runtime zone', () => {
  assert.equal(weekdayOfDate('2026-09-14'), 0); // Monday
  assert.equal(weekdayOfDate('2026-09-13'), 6); // Sunday
});

test('reservations off, the past, too far, and a closed weekday each say why', () => {
  assert.deepEqual(dayAvailability(base({ enabled: false })), { ok: false, reason: 'not_enabled' });
  assert.deepEqual(dayAvailability(base({ date: '2026-09-10' })), { ok: false, reason: 'past' });
  assert.deepEqual(dayAvailability(base({ date: '2026-12-01' })), { ok: false, reason: 'too_far' });
  assert.deepEqual(dayAvailability(base({ date: '2026-09-14' })), { ok: false, reason: 'closed' });
  assert.deepEqual(dayAvailability(base()), { ok: true });
});

test('no capped areas can never fill; a capped one fills slot by slot', () => {
  const full = Array.from({ length: 18 }, (_, i) => ({ areaId: 'a', time: `${13 + Math.floor(i / 2)}:${i % 2 ? '30' : '00'}`, partySize: 10 }));
  assert.deepEqual(dayAvailability(base({ areas: [{ id: 'a', maxCovers: 10 }], reservations: full })), { ok: false, reason: 'full' });
  assert.deepEqual(dayAvailability(base({ areas: [{ id: 'a', maxCovers: null }], reservations: full })), { ok: true });
  // One slot with room for two but not for six.
  const almost = full.filter((r) => r.time !== '20:00').concat({ areaId: 'a', time: '20:00', partySize: 8 });
  assert.deepEqual(dayAvailability(base({ areas: [{ id: 'a', maxCovers: 10 }], reservations: almost, partySize: 2 })), { ok: true });
  assert.deepEqual(dayAvailability(base({ areas: [{ id: 'a', maxCovers: 10 }], reservations: almost, partySize: 6 })), { ok: false, reason: 'full' });
});

test('bookings in another area do not count against this one', () => {
  const elsewhere = [{ areaId: 'b', time: '20:00', partySize: 50 }];
  assert.deepEqual(dayAvailability(base({ areas: [{ id: 'a', maxCovers: 4 }], reservations: elsewhere })), { ok: true });
});
