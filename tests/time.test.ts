import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayInTz, nowHHMMInTz, zonedWallTimeToUtc, isPastInTz, weekdayInTz, addDays }
  from '../lib/time';

const MX = 'America/Mexico_City';

test('THE live bug: 23:00 UTC is still the previous day in Mexico', () => {
  // Render runs in UTC. At 2026-08-26T02:00Z it is still the 25th in Mexico,
  // so a reservation for the evening of the 25th must stay visible.
  const at = new Date('2026-08-26T02:00:00Z');
  assert.equal(at.toISOString().slice(0, 10), '2026-08-26');   // what the code does today
  assert.equal(todayInTz(MX, at), '2026-08-25');               // what it should do
});

test('wall time converts to the right instant', () => {
  // Mexico City is UTC-6 year round since 2022.
  assert.equal(zonedWallTimeToUtc('2026-08-25', '20:30', MX).toISOString(),
               '2026-08-26T02:30:00.000Z');
});

test('Baja California still observes DST, and tzdata knows it', () => {
  const summer = zonedWallTimeToUtc('2026-07-15', '12:00', 'America/Tijuana'); // UTC-7
  const winter = zonedWallTimeToUtc('2026-01-15', '12:00', 'America/Tijuana'); // UTC-8
  assert.equal(summer.toISOString(), '2026-07-15T19:00:00.000Z');
  assert.equal(winter.toISOString(), '2026-01-15T20:00:00.000Z');
  // ...while the rest of Mexico does not move.
  assert.equal(zonedWallTimeToUtc('2026-07-15', '12:00', MX).toISOString(),
               '2026-07-15T18:00:00.000Z');
  assert.equal(zonedWallTimeToUtc('2026-01-15', '12:00', MX).toISOString(),
               '2026-01-15T18:00:00.000Z');
});

test('round trip survives a DST spring-forward', () => {
  for (const d of ['2026-04-04', '2026-04-05', '2026-04-06']) {
    const back = todayInTz('America/Tijuana', zonedWallTimeToUtc(d, '12:00', 'America/Tijuana'));
    assert.equal(back, d);
  }
});

test('midnight formats as 00:00, never 24:00', () => {
  assert.equal(nowHHMMInTz(MX, new Date('2026-08-25T06:00:00Z')), '00:00');
});

test('weekday index is Mon=0, matching lib/hours.ts', () => {
  assert.equal(weekdayInTz(MX, new Date('2026-08-24T18:00:00Z')), 0); // Monday
  assert.equal(weekdayInTz(MX, new Date('2026-08-30T18:00:00Z')), 6); // Sunday
});

test('isPastInTz uses local time', () => {
  const now = new Date('2026-08-26T02:00:00Z'); // 20:00 on the 25th in Mexico
  assert.equal(isPastInTz('2026-08-25', '19:00', MX, now), true);
  assert.equal(isPastInTz('2026-08-25', '21:00', MX, now), false);
});

test('addDays crosses months without timezone drift', () => {
  assert.equal(addDays('2026-08-31', 1), '2026-09-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});

test('a tenant with no timezone yet falls back to Mexico, not to the server', () => {
  // Rows predating the migration have `timezone: undefined`. Deferring to the
  // runtime zone would put UTC back in charge — the exact bug being fixed.
  const at = new Date('2026-08-26T02:00:00Z');
  assert.equal(todayInTz(undefined as unknown as string, at), '2026-08-25');
  assert.equal(todayInTz('', at), '2026-08-25');
});
