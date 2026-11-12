import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanActiveUntil, currentFlows, isCurrent } from '../lib/whatsapp/flows/active';

test('a flow with a last day is offered through that day and not after', () => {
  assert.ok(isCurrent('2026-12-24', '2026-12-01'));
  assert.ok(isCurrent('2026-12-24', '2026-12-24'));
  assert.equal(isCurrent('2026-12-24', '2026-12-25'), false);
  assert.ok(isCurrent(null, '2027-01-01'));
  assert.ok(isCurrent(undefined, '2027-01-01'));
});

test('the current list keeps the order and drops only what expired', () => {
  const flows = [
    { key: 'reservation', active_until: null },
    { key: 'posadas', active_until: '2026-12-24' },
    { key: 'human', active_until: null },
  ];
  assert.deepEqual(currentFlows(flows, '2026-12-24').map((f) => f.key), ['reservation', 'posadas', 'human']);
  assert.deepEqual(currentFlows(flows, '2026-12-25').map((f) => f.key), ['reservation', 'human']);
});

test('a last day is a real calendar date or nothing', () => {
  assert.equal(cleanActiveUntil('2026-12-24'), '2026-12-24');
  assert.equal(cleanActiveUntil(' 2026-12-24 '), '2026-12-24');
  assert.equal(cleanActiveUntil('2026-02-30'), null);
  assert.equal(cleanActiveUntil('24/12/2026'), null);
  assert.equal(cleanActiveUntil(''), null);
  assert.equal(cleanActiveUntil(null), null);
});
