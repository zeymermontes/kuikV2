import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingsFor, isPast, pastCutoff, relativeDay, splitBookings } from '../lib/reservations/bookings-list';

const now = Date.parse('2026-11-06T20:00:00Z');
const at = (iso: string, id = iso) => ({ id, starts_at: iso });

test('a booking stays upcoming for an hour after its time', () => {
  assert.equal(isPast('2026-11-06T21:00:00Z', now), false);
  assert.equal(isPast('2026-11-06T20:00:00Z', now), false);
  // One minute gone: still expected at the door.
  assert.equal(isPast('2026-11-06T19:59:00Z', now), false);
  assert.equal(isPast('2026-11-06T19:01:00Z', now), false);
  assert.equal(isPast('2026-11-06T19:00:00Z', now), false);
  assert.equal(isPast('2026-11-06T18:59:59Z', now), true);
  assert.equal(isPast('2026-11-05T20:00:00Z', now), true);
});

test('the server draws the line at the same instant', () => {
  assert.equal(pastCutoff(now), '2026-11-06T19:00:00.000Z');
  assert.equal(isPast(pastCutoff(now), now), false);
});

test('a time that cannot be read is shown, not buried', () => {
  assert.equal(isPast('', now), false);
  assert.equal(isPast('not a date', now), false);
});

const rows = [
  at('2026-11-08T02:00:00Z', 'far'),
  at('2026-11-06T19:30:00Z', 'just-started'),
  at('2026-11-01T02:00:00Z', 'long-ago'),
  at('2026-11-06T22:00:00Z', 'tonight'),
  at('2026-11-06T17:00:00Z', 'earlier-today'),
];

test('upcoming runs from the soonest on, past from the latest back', () => {
  const { upcoming, past } = splitBookings(rows, now);
  assert.deepEqual(upcoming.map((r) => r.id), ['just-started', 'tonight', 'far']);
  assert.deepEqual(past.map((r) => r.id), ['earlier-today', 'long-ago']);
});

test('each filter shows its part, and all shows upcoming first', () => {
  assert.deepEqual(bookingsFor(rows, 'upcoming', now).map((r) => r.id), ['just-started', 'tonight', 'far']);
  assert.deepEqual(bookingsFor(rows, 'past', now).map((r) => r.id), ['earlier-today', 'long-ago']);
  assert.deepEqual(bookingsFor(rows, 'all', now).map((r) => r.id), ['just-started', 'tonight', 'far', 'earlier-today', 'long-ago']);
  assert.deepEqual(bookingsFor([], 'all', now), []);
});

test('a booking moves to past by itself as the clock passes its hour', () => {
  const one = [at('2026-11-06T19:30:00Z', 'x')];
  assert.equal(bookingsFor(one, 'upcoming', now).length, 1);
  assert.equal(bookingsFor(one, 'upcoming', now + 31 * 60_000).length, 0);
  assert.equal(bookingsFor(one, 'past', now + 31 * 60_000).length, 1);
});

test('the list it is given is left as it was', () => {
  const before = rows.map((r) => r.id);
  bookingsFor(rows, 'all', now);
  assert.deepEqual(rows.map((r) => r.id), before);
});

test('days are named next to today by the calendar', () => {
  // Across a month's and a year's end.
  assert.equal(relativeDay('2026-12-01', '2026-11-30'), 'tomorrow');
  assert.equal(relativeDay('2026-12-31', '2027-01-01'), 'yesterday');
  assert.equal(relativeDay('2026-11-06', '2026-11-06'), 'today');
  assert.equal(relativeDay('2026-11-07', '2026-11-06'), 'tomorrow');
  assert.equal(relativeDay('2026-11-05', '2026-11-06'), 'yesterday');
  assert.equal(relativeDay('2026-11-09', '2026-11-06'), null);
});
