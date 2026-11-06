import { test } from 'node:test';
import assert from 'node:assert/strict';
import { threadFrom } from '../lib/ai/thread';

// Rows as the database returns them: newest first.
const row = (direction: 'inbound' | 'outbound', body: string | null, status: string | null = direction === 'inbound' ? null : 'sent') =>
  ({ direction, body, status });

test('THE failure this exists for: a diner\'s message has no status and is still read', () => {
  const thread = threadFrom(
    [row('inbound', '13\nEl dia sabado\n8'), row('outbound', '¿Para cuántas personas?'), row('inbound', 'Reservar')],
    { limit: 10, current: '13\nEl dia sabado\n8' },
  );
  assert.deepEqual(thread, [
    { role: 'user', content: 'Reservar' },
    { role: 'assistant', content: '¿Para cuántas personas?' },
    { role: 'user', content: '13\nEl dia sabado\n8' },
  ]);
});

test('a reply that never left is not something the bot said', () => {
  const thread = threadFrom(
    [row('inbound', 'hola'), row('outbound', '¡Hola!', 'failed'), row('inbound', 'hola')],
    { limit: 10, current: 'hola' },
  );
  assert.deepEqual(thread, [{ role: 'user', content: 'hola\nhola' }]);
});

test('messages sent in a row reach the model as one turn', () => {
  const thread = threadFrom(
    [row('inbound', '8 pm'), row('inbound', 'el sábado'), row('inbound', '13'), row('outbound', 'Dígame los datos')],
    { limit: 10, current: '13\nel sábado\n8 pm' },
  );
  assert.deepEqual(thread, [
    { role: 'assistant', content: 'Dígame los datos' },
    { role: 'user', content: '13\nel sábado\n8 pm' },
  ]);
});

test('the message being answered is added when the rows do not carry it', () => {
  assert.deepEqual(
    threadFrom([row('outbound', '¿A qué hora?')], { limit: 10, current: 'a las 8' }),
    [{ role: 'assistant', content: '¿A qué hora?' }, { role: 'user', content: 'a las 8' }],
  );
  // …and joins what the diner had already said, rather than opening a second turn.
  assert.deepEqual(
    threadFrom([row('inbound', 'somos 4')], { limit: 10, current: 'a las 8' }),
    [{ role: 'user', content: 'somos 4\na las 8' }],
  );
});

test('the failed ones do not eat into the window, and empty bodies are skipped', () => {
  const rows = [row('inbound', 'tres'), row('outbound', 'x', 'failed'), row('inbound', null), row('outbound', 'dos'), row('inbound', 'uno')];
  assert.deepEqual(threadFrom(rows, { limit: 2 }).map((m) => m.content), ['dos', 'tres']);
});
