import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clock12, longDate, renderNotification } from '../lib/notify/messages';

test('dates are spelled out and times read on a 12-hour clock', () => {
  assert.equal(longDate('2026-09-16', 'es'), 'Miércoles 16 de septiembre de 2026');
  assert.equal(longDate('2026-09-16', 'en'), 'Wednesday, September 16, 2026');
  assert.equal(clock12('18:00'), '6:00 pm');
  assert.equal(clock12('00:30'), '12:30 am');
  assert.equal(clock12('12:00'), '12:00 pm');
});

test('a confirmation is laid out like the bot summary', () => {
  const body = renderNotification('confirmed', 'es', { restaurant: 'Mar and Sea', name: 'Daniel', party: 2, date: '2026-09-16', time: '18:00' });
  assert.match(body, /\*confirmada\* ✅/);
  assert.match(body, /📅 Miércoles 16 de septiembre de 2026\n🕕 6:00 pm\n👥 2 personas\n🙋 A nombre de Daniel/);
  const reminder = renderNotification('reminder_24h', 'es', { restaurant: 'Mar and Sea', name: 'Ana', party: 1, date: '2026-09-17', time: '20:30' });
  assert.match(reminder, /👥 1 persona\n/);
  assert.match(reminder, /Responde \*1\*/);
});

test('the door tells a waiting party the quote, and later that the table is ready', () => {
  const wait = renderNotification('waitlist', 'es', { restaurant: 'Mar and Sea', name: 'Luis', party: 3, date: '2026-09-11', time: '14:00', minutes: 30 });
  assert.match(wait, /\*fila de espera\*/);
  assert.match(wait, /👥 3 personas\n⏱️ Tiempo estimado: 30 min/);
  assert.match(wait, /Te avisamos por aquí/);
  const noQuote = renderNotification('waitlist', 'en', { restaurant: 'Mar and Sea', name: 'Luis', party: 1, date: '2026-09-11', time: '14:00', minutes: null });
  assert.doesNotMatch(noQuote, /Estimated wait/);
  const ready = renderNotification('table_ready', 'es', { restaurant: 'Mar and Sea', name: 'Luis', party: 3, date: '2026-09-11', time: '14:00', minutes: 30 });
  assert.match(ready, /ya está \*listo\* 🎉/);
  assert.doesNotMatch(ready, /Tiempo estimado/);
});
