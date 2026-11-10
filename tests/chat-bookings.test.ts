import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingsOfChat, isUpcoming, phoneTail, samePhone } from '../lib/chats/bookings';

test('a phone is told by its last ten digits, however it was written', () => {
  assert.equal(phoneTail('+52 667 123 4567'), '6671234567');
  assert.equal(phoneTail('5216671234567'), '6671234567');
  assert.equal(phoneTail('6671234567'), '6671234567');
  assert.equal(phoneTail('12345'), null);
  assert.equal(phoneTail(null), null);
  assert.ok(samePhone('+526671234567', '667 123 4567'));
  assert.equal(samePhone('+526671234567', '+526671234568'), false);
  assert.equal(samePhone(null, '6671234567'), false);
});

test('a booking is upcoming while asked for or accepted and not long past its time', () => {
  const now = Date.parse('2026-11-10T20:00:00Z');
  assert.ok(isUpcoming({ status: 'pending', starts_at: '2026-11-14T02:00:00Z' }, now));
  assert.ok(isUpcoming({ status: 'confirmed', starts_at: '2026-11-10T19:30:00Z' }, now));
  assert.equal(isUpcoming({ status: 'confirmed', starts_at: '2026-11-10T18:30:00Z' }, now), false);
  assert.equal(isUpcoming({ status: 'cancelled', starts_at: '2026-11-14T02:00:00Z' }, now), false);
  assert.equal(isUpcoming({ status: 'seated', starts_at: '2026-11-14T02:00:00Z' }, now), false);
});

test('a chat shows the bookings made through it and the ones under its number, nearest first', () => {
  const now = Date.parse('2026-11-10T20:00:00Z');
  const rows = [
    { id: 'a', status: 'confirmed' as const, starts_at: '2026-11-15T02:00:00Z', phone: '+526670000001', whatsapp_conversation_id: null },
    { id: 'b', status: 'pending' as const, starts_at: '2026-11-12T02:00:00Z', phone: null, whatsapp_conversation_id: 'c1' },
    { id: 'c', status: 'pending' as const, starts_at: '2026-11-12T03:00:00Z', phone: '+526679999999', whatsapp_conversation_id: 'c2' },
    { id: 'd', status: 'cancelled' as const, starts_at: '2026-11-13T02:00:00Z', phone: null, whatsapp_conversation_id: 'c1' },
  ];
  assert.deepEqual(bookingsOfChat(rows, { conversationId: 'c1', phone: '6670000001' }, now).map((r) => r.id), ['b', 'a']);
  assert.deepEqual(bookingsOfChat(rows, { conversationId: 'c9', phone: null }, now), []);
});
