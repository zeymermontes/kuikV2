import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hears, landingFor, sectionOfKind, sectionOfPath } from '../lib/notify/landing';

const owner = { role: 'owner' as const, sections: null };
const hostPerson = { role: 'host' as const, sections: null };
const cashierPerson = { role: 'cashier' as const, sections: null };
const door = { role: 'host' as const, sections: ['host', 'chats'] as ('host' | 'chats')[] };
// A door tablet that also has the orders: its role is cashier, its sections are three.
const doorWithOrders = { role: 'cashier' as const, sections: ['host', 'chats', 'orders'] as ('host' | 'chats' | 'orders')[] };
const kitchen = { role: 'waiter' as const, sections: ['kds'] as 'kds'[] };
const ordersOnly = { role: 'waiter' as const, sections: ['orders'] as 'orders'[] };

test('every kind belongs to one staff app', () => {
  for (const k of ['reservation_new', 'reservation_confirmed', 'reservation_cancelled', 'reservation_changed']) assert.equal(sectionOfKind(k), 'host', k);
  for (const k of ['handoff', 'customer_reply', 'flow_notify']) assert.equal(sectionOfKind(k), 'chats', k);
  assert.equal(sectionOfKind('order_new'), 'orders');
  assert.equal(sectionOfKind('something_else'), 'admin');
});

test('a path belongs to the app that serves it', () => {
  assert.equal(sectionOfPath('/whatsapp/inbox?c=1'), 'chats');
  assert.equal(sectionOfPath('/chats'), 'chats');
  assert.equal(sectionOfPath('/reservations?view=pending'), 'host');
  assert.equal(sectionOfPath('/host?d=2026-11-05'), 'host');
  assert.equal(sectionOfPath('/orders'), 'orders');
  assert.equal(sectionOfPath('/whatsapp'), 'admin');
  assert.equal(sectionOfPath('/hostess'), 'admin');
});

test('a person hears by role, a device by section', () => {
  const chatRoles = ['owner', 'manager', 'host'];
  assert.equal(hears('handoff', chatRoles, owner), true);
  assert.equal(hears('handoff', chatRoles, cashierPerson), false);
  // The door tablet with the orders is a "cashier", which the chat alerts
  // never named; it has the chats, so it hears them.
  assert.equal(hears('handoff', chatRoles, doorWithOrders), true);
  assert.equal(hears('reservation_new', ['owner', 'manager', 'cashier', 'host'], doorWithOrders), true);
  // A kitchen screen is a "waiter" by role and hears neither bookings nor chats.
  assert.equal(hears('reservation_new', ['owner', 'manager', 'cashier', 'waiter', 'host'], kitchen), false);
  assert.equal(hears('handoff', chatRoles, kitchen), false);
  // Nothing about the account is for a device.
  assert.equal(hears('billing', ['owner', 'cashier'], doorWithOrders), false);
});

test('a chat opens the inbox for a manager and the chats app for everyone else', () => {
  assert.equal(landingFor('/whatsapp/inbox?c=abc', owner), '/whatsapp/inbox?c=abc');
  assert.equal(landingFor('/whatsapp/inbox?c=abc', hostPerson), '/chats?c=abc');
  assert.equal(landingFor('/whatsapp/inbox?c=abc', door), '/chats?c=abc');
  assert.equal(landingFor('/whatsapp/inbox', door), '/chats');
  assert.equal(landingFor('/whatsapp/inbox?c=a b', door), '/chats?c=a%20b');
});

test('a booking opens the list for a person and the host stand for a device', () => {
  assert.equal(landingFor('/reservations?view=pending', owner), '/reservations?view=pending');
  assert.equal(landingFor('/reservations?view=pending', hostPerson), '/reservations?view=pending');
  // Waiting for an answer: the stand opens on its requests.
  assert.equal(landingFor('/reservations?view=pending', door), '/host?open=requests');
  // About a day: the stand opens on that day.
  assert.equal(landingFor('/reservations?d=2026-11-07', door), '/host?d=2026-11-07');
  assert.equal(landingFor('/reservations', door), '/host');
  // A date that is not a date is dropped, not passed along.
  assert.equal(landingFor('/reservations?d=tomorrow', door), '/host');
});

test('a device is sent to its hub for what it was not given', () => {
  assert.equal(landingFor('/whatsapp/inbox?c=abc', kitchen), '/terminal');
  assert.equal(landingFor('/reservations?view=pending', ordersOnly), '/terminal');
  assert.equal(landingFor('/orders', door), '/terminal');
  assert.equal(landingFor('/orders', ordersOnly), '/orders');
  // The admin panel is never a device's.
  assert.equal(landingFor('/whatsapp', doorWithOrders), '/terminal');
  assert.equal(landingFor('/billing', doorWithOrders), '/terminal');
});

test('a person keeps any other link as it is', () => {
  assert.equal(landingFor('/orders', owner), '/orders');
  assert.equal(landingFor('/whatsapp', owner), '/whatsapp');
});
