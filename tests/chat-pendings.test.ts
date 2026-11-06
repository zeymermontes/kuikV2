import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSummary, promisesFollowUp, sameSummary, summaryFromDiner, totalPending, SUMMARY_MAX } from '../lib/chats/pendings';
import { chatTone, chatsFor, needsPerson } from '../lib/chats/list';
import { sectionOfKind } from '../lib/notify/landing';

test('THE reply this exists for: a promise that somebody will answer', () => {
  assert.ok(promisesFollowUp('¡Perfecto, Zeymer! Tu solicitud quedó registrada 🎉 El restaurante la revisará y te avisarán para confirmarla. Sobre el anticipo, se lo comento a alguien del restaurante para que te digan. ¡Gracias y feliz cumpleaños! 🥳'));
});

test('the other ways the bot says someone will get back to them', () => {
  for (const reply of [
    'No tengo ese dato, la verdad 🙈 Puedo preguntarle a alguien del restaurante y te aviso.',
    'Eso lo consulto con el equipo y te confirmo.',
    'Le paso tu pregunta al encargado para que te respondan.',
    'Una persona del restaurante te contestará por aquí.',
    'Voy a consultarlo con alguien del restaurante.',
  ]) assert.ok(promisesFollowUp(reply), reply);
});

test('a booking waiting to be confirmed is not a question left for a person', () => {
  for (const reply of [
    '¡Listo! Quedó registrada tu solicitud. El restaurante la revisará y te avisarán para confirmarla.',
    'Queda como solicitud y el restaurante te confirma después.',
    'Abrimos de 13:00 a 23:00. ¿Te ayudo con una reservación?',
    'No tengo ese dato.',
  ]) assert.equal(promisesFollowUp(reply), false, reply);
});

test('a pending is one short line', () => {
  assert.equal(cleanSummary('  Pregunta si\n se requiere   anticipo '), 'Pregunta si se requiere anticipo');
  const long = cleanSummary('x'.repeat(400));
  assert.equal(long.length, SUMMARY_MAX);
  assert.ok(long.endsWith('…'));
  assert.equal(cleanSummary('   '), '');
});

test('the same question twice is one pending', () => {
  assert.ok(sameSummary('¿Se requiere anticipo?', 'se requiere anticipo'));
  assert.equal(sameSummary('¿Se requiere anticipo?', '¿Hay estacionamiento?'), false);
});

test('written from the diner\'s own words when the bot left none: the question, if there is one', () => {
  assert.equal(summaryFromDiner('Si\n¿Se requiere anticipo?'), 'Preguntó: ¿Se requiere anticipo?');
  assert.equal(summaryFromDiner('quiero saber lo del anticipo'), 'Preguntó: quiero saber lo del anticipo');
});

test('a chat that is owed something counts as needing a person, and stays yellow', () => {
  const owed = { waiting: false, lastAt: '2026-11-06T10:00:00Z', staffReplied: true, pending: { questions: 1, bookings: 1 } };
  const quiet = { waiting: false, lastAt: '2026-11-06T11:00:00Z', staffReplied: false, pending: { questions: 0, bookings: 0 } };
  assert.equal(totalPending(owed.pending), 2);
  assert.ok(needsPerson(owed));
  assert.equal(needsPerson(quiet), false);
  assert.deepEqual(chatsFor([quiet, owed], 'waiting'), [owed]);
  // Answered in the chat or not: it is yellow until somebody marks it done.
  assert.equal(chatTone(owed), 'needsReply');
  assert.equal(chatTone(quiet), 'idle');
});

test('the alert for a pending belongs to the chats', () => {
  assert.equal(sectionOfKind('chat_pending'), 'chats');
});
