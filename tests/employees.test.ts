import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { can, entryMinutes, findByPin, hashPin, initialsOf, isValidPin } from '../lib/employees';
import type { Employee } from '../lib/database.types';

const emp = (over: Partial<Employee>): Employee => ({
  id: 'e1', tenant_id: 't', name: 'Ana López', role: 'waiter', pin_hash: null, perms: {}, color: null, active: true, position: 0, created_at: '', updated_at: '', ...over,
});

describe('can', () => {
  it('falls back to the role, and a per-person override wins', () => {
    assert.equal(can(emp({ role: 'waiter' }), 'discount'), false);
    assert.equal(can(emp({ role: 'cashier' }), 'discount'), true);
    assert.equal(can(emp({ role: 'cashier' }), 'void'), false);
    assert.equal(can(emp({ role: 'waiter', perms: { discount: true } }), 'discount'), true);
    assert.equal(can(emp({ role: 'manager', perms: { void: false } }), 'void'), false);
    assert.equal(can(null, 'discount'), false);
  });
});

describe('PINs', () => {
  it('accepts 4 to 6 digits only', () => {
    assert.equal(isValidPin('1234'), true);
    assert.equal(isValidPin('123456'), true);
    assert.equal(isValidPin('123'), false);
    assert.equal(isValidPin('12a4'), false);
  });
  it('hashes with the tenant as salt', async () => {
    const a = await hashPin('t1', '1234');
    const b = await hashPin('t2', '1234');
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.notEqual(a, b);
    assert.equal(a, await hashPin('t1', '1234'));
  });
  it('finds the active employee whose PIN it is', async () => {
    const h = await hashPin('t', '4321');
    const list = [emp({ id: 'a', pin_hash: h }), emp({ id: 'b', pin_hash: h, active: false }), emp({ id: 'c', pin_hash: await hashPin('t', '9999') })];
    assert.equal((await findByPin('t', '4321', list))?.id, 'a');
    assert.equal(await findByPin('t', '0000', list), null);
    assert.equal(await findByPin('t', '43', list), null);
  });
});

describe('helpers', () => {
  it('initials and minutes', () => {
    assert.equal(initialsOf('Ana López'), 'AL');
    assert.equal(initialsOf('  pedro  '), 'P');
    assert.equal(entryMinutes({ clock_in: '2026-09-06T09:00:00Z', clock_out: '2026-09-06T17:30:00Z' }), 510);
    assert.equal(entryMinutes({ clock_in: '2026-09-06T09:00:00Z', clock_out: null }, new Date('2026-09-06T09:45:00Z')), 45);
  });
});
