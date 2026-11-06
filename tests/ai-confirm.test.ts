import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingHold, carriesDetail, finalizeHold, summaryOf } from '../lib/ai/confirm';
import { bareHourLines, bareHours } from '../lib/ai/hours-guide';
import { buildSystemPrompt } from '../lib/ai/prompt';

// A Friday.
const TODAY = '2026-11-06';

test('a booking is not made on the turn its last detail arrives', () => {
  const hold = finalizeHold({ missingRequired: ['Hora'], said: 'a las 8 de la noche', today: TODAY });
  assert.match(hold ?? '', /resumen/);
});

test('with everything on record and a plain yes, it goes ahead', () => {
  for (const said of ['sí', 'Si por favor', 'correcto, gracias', 'está bien', '👍', 'adelante']) {
    assert.equal(finalizeHold({ missingRequired: [], said, today: TODAY }), null, `held on ${said}`);
  }
});

test('a no, or a yes that changes something, holds it', () => {
  assert.match(finalizeHold({ missingRequired: [], said: 'no', today: TODAY }) ?? '', /no confirmó/);
  for (const said of ['sí, pero a las 9', 'mejor el domingo', 'sí pero somos 6', 'que sea a las 8:30']) {
    assert.match(finalizeHold({ missingRequired: [], said, today: TODAY }) ?? '', /cambió o agregó/, `not held on ${said}`);
  }
});

test('what counts as carrying a detail', () => {
  assert.equal(carriesDetail('sí', TODAY), false);
  assert.equal(carriesDetail('muchas gracias', TODAY), false);
  assert.equal(carriesDetail('a las 9 mejor', TODAY), true);
  assert.equal(carriesDetail('para 6 personas', TODAY), true);
  assert.equal(carriesDetail('el domingo', TODAY), true);
});

test('without a flow: the last message must have read the booking back', () => {
  const args = { customer_name: 'Ana López', party_size: 4 };
  assert.match(bookingHold({ lastBotMessage: '¿A nombre de quién?', args, said: 'Ana López', today: TODAY }) ?? '', /resumen/);
  assert.equal(
    bookingHold({ lastBotMessage: 'Le confirmo: 4 personas, sábado 7 a las 8:00 p.m., a nombre de Ana López. ¿Correcto?', args, said: 'sí', today: TODAY }),
    null,
  );
  assert.match(
    bookingHold({ lastBotMessage: 'Le confirmo: 4 personas, a nombre de Ana López. ¿Correcto?', args, said: 'sí pero a las 9', today: TODAY }) ?? '',
    /cambió/,
  );
});

test('the summary the server writes when the model skipped it', () => {
  const text = summaryOf(
    [
      { key: 'party_size', label: 'Personas', type: 'number' },
      { key: 'date', label: 'Fecha', type: 'date' },
      { key: 'time', label: 'Hora', type: 'time' },
      { key: 'customer_name', label: 'Nombre', type: 'text' },
      { key: 'occasion', label: 'Ocasión', type: 'text' },
    ],
    { party_size: 13, date: '2026-11-07', time: '20:00', customer_name: 'Zeymer Montes' },
  );
  assert.match(text, /Personas: 13/);
  assert.match(text, /Hora: 8:00 p\.m\./);
  assert.match(text, /Nombre: Zeymer Montes/);
  assert.match(text, /sábado/i);
  assert.doesNotMatch(text, /Ocasión/);
  assert.match(text, /¿Es correcto\?$/);
});

const day = (open: string, close: string, closed = false) => ({ open, close, closed });
const week = (open: string, close: string) => Array.from({ length: 7 }, () => day(open, close));

test('a place that opens at one: "a las 8" can only be the evening', () => {
  const h = bareHours(week('13:00', '23:00'));
  assert.deepEqual(h.evening, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(h.morning, []);
  assert.deepEqual(h.either, []);
  const lines = bareHourLines(week('13:00', '23:00')).join('\n');
  assert.match(lines, /SIN preguntar/);
  assert.doesNotMatch(lines, /NO elijas/);
});

test('a place that serves breakfast and dinner: "a las 8" has to be asked', () => {
  const h = bareHours(week('08:00', '23:00'));
  assert.deepEqual(h.either, [8, 9, 10]);
  assert.deepEqual(h.evening, [1, 2, 3, 4, 5, 6, 7, 12]);
  assert.deepEqual(h.morning, [11]);
  assert.match(bareHourLines(week('08:00', '23:00')).join('\n'), /a las 8, 9 y 10: puede ser de la mañana o de la noche\. NO elijas/);
});

test('one day with breakfast is enough to ask; closed days and no hours say nothing', () => {
  const mixed = [...Array.from({ length: 5 }, () => day('13:00', '23:00')), day('08:00', '23:00'), day('00:00', '00:00', true)];
  assert.deepEqual(bareHours(mixed).either, [8, 9, 10]);
  assert.deepEqual(bareHourLines(null), []);
  assert.deepEqual(bareHourLines([day('00:00', '00:00', true)]), []);
});

test('open past midnight: one in the morning is a real hour', () => {
  const h = bareHours(week('18:00', '02:00'));
  // 01:00 is inside the night; 13:00 is not.
  assert.deepEqual(h.morning, [1, 12]);
  assert.deepEqual(h.evening, [6, 7, 8, 9, 10, 11]);
  assert.deepEqual(h.either, []);
});

test('the prompt asks for the summary always and for the unclear thing only', () => {
  const prompt = buildSystemPrompt({
    restaurant: 'Mar', today: TODAY, goals: [], intake: 'all_at_once',
    collecting: { goalName: 'Reservar', needed: [{ key: 'time', prompt: '¿A qué hora?' }], known: { party_size: 4 }, viaRun: true },
  });
  assert.match(prompt, /nada se registra sin ese sí/);
  assert.match(prompt, /pregunta solo por eso/);
  assert.match(prompt, /varios\s+mensajes seguidos/);
  assert.match(prompt, /finalizar_flujo/);
});

test('the date a message states, counted here rather than by the model', async () => {
  const { dateSaid } = await import('../lib/ai/confirm');
  assert.equal(dateSaid('Zeymer Montes\nmi cumpleaños\nsábado\n8pm\n13', TODAY), '2026-11-07');
  assert.equal(dateSaid('mañana a las 8', TODAY), '2026-11-07');
  assert.equal(dateSaid('el 20 de noviembre', TODAY), '2026-11-20');
  // None, two, or one that people mean two ways: left to the conversation.
  assert.equal(dateSaid('13\n8', TODAY), null);
  assert.equal(dateSaid('hoy no, mejor mañana', TODAY), null);
  assert.equal(dateSaid('el próximo sábado', TODAY), null);
  assert.equal(dateSaid('la otra semana', TODAY), null);
});

test('the model\'s date against what was said: now decides, earlier only catches the wrong week', async () => {
  const { dateMismatch } = await import('../lib/ai/confirm');
  // Said now, written a week late.
  assert.equal(dateMismatch({ written: '2026-11-14', now: 'el sábado a las 8', earlier: [], today: TODAY }), '2026-11-07');
  assert.equal(dateMismatch({ written: '2026-11-07', now: 'el sábado a las 8', earlier: [], today: TODAY }), null);
  // Said two messages ago, and the model drifts to the Saturday after.
  assert.equal(dateMismatch({ written: '2026-11-14', now: 'son 13 personas', earlier: ['son 13 personas', 'sábado\n8pm'], today: TODAY }), '2026-11-07');
  // They agreed on another day since: not this check's business.
  assert.equal(dateMismatch({ written: '2026-11-08', now: 'sí, ese día', earlier: ['el sábado'], today: TODAY }), null);
  // And an explicit "el 14" now is what stands.
  assert.equal(dateMismatch({ written: '2026-11-14', now: 'sí, el 14', earlier: ['el sábado'], today: TODAY }), null);
});
