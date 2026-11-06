import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSettler, settleMs, SETTLE_FRAGMENT_MS, SETTLE_MAX_MS, SETTLE_SENTENCE_MS, type PendingPart } from '../lib/whatsapp/settle';

const part = (id: string, text: string, replyId: string | null = null): PendingPart => ({ id, text, replyId });

/** Waits that end only when the test says so, in the order they were asked for. */
function manual() {
  const pending: (() => void)[] = [];
  let clock = 0;
  return {
    wait: () => new Promise<void>((resolve) => pending.push(resolve)),
    now: () => clock,
    advance: (ms: number) => { clock += ms; },
    /** Wake the oldest sleeper and let everything it triggers finish. */
    async wake() {
      pending.shift()?.();
      await new Promise((r) => setImmediate(r));
    },
    sleepers: () => pending.length,
  };
}

test('a tap waits for nothing; a fragment waits longer than a sentence', () => {
  assert.equal(settleMs(part('a', 'Reservar', 'flow:reservar')), 0);
  assert.equal(settleMs({ text: '', kind: 'audio_unreadable' }), 0);
  assert.equal(settleMs(part('a', '13')), SETTLE_FRAGMENT_MS);
  assert.equal(settleMs(part('a', 'el sábado')), SETTLE_FRAGMENT_MS);
  assert.equal(settleMs(part('a', 'Hola, quiero una mesa para mañana')), SETTLE_SENTENCE_MS);
  assert.equal(settleMs(part('a', '¿Abren hoy?')), SETTLE_SENTENCE_MS);
  assert.equal(settleMs(part('a', '13\nsábado\n8')), SETTLE_SENTENCE_MS);
});

test('three messages in a row are answered once, together, in order', async () => {
  const t = manual();
  const runs: string[][] = [];
  const s = createSettler({ wait: t.wait, now: t.now, run: async (_k, parts) => { runs.push(parts.map((p) => p.text)); } });
  const done = [s.push('c', part('1', '13')), s.push('c', part('2', 'el sábado')), s.push('c', part('3', 'a las 8'))];
  await t.wake(); // the first wakes: two newer behind it, it leaves
  await t.wake();
  assert.deepEqual(runs, []);
  await t.wake(); // the last one answers for all three
  await Promise.all(done);
  assert.deepEqual(runs, [['13', 'el sábado', 'a las 8']]);
});

test('a tap closes the batch at once, with what was typed just before it', async () => {
  const t = manual();
  const runs: string[][] = [];
  const s = createSettler({ wait: t.wait, now: t.now, run: async (_k, parts) => { runs.push(parts.map((p) => p.text)); } });
  const typed = s.push('c', part('1', 'hola'));
  await s.push('c', part('2', 'Reservar', 'flow:reservar'));
  assert.deepEqual(runs, [['hola', 'Reservar']]);
  await t.wake(); // the typed one wakes to find itself answered
  await typed;
  assert.equal(runs.length, 1);
});

test('a message that lands while an answer is being written is answered next, alone', async () => {
  const t = manual();
  const runs: string[][] = [];
  let release!: () => void;
  const s = createSettler({
    wait: t.wait, now: t.now,
    run: async (_k, parts) => {
      runs.push(parts.map((p) => p.text));
      if (runs.length === 1) await new Promise<void>((r) => { release = r; });
    },
  });
  const first = s.push('c', part('1', 'quiero reservar'));
  await t.wake(); // first batch starts and hangs on the model
  const second = s.push('c', part('2', 'para 4'));
  await t.wake(); // second wakes, has to wait for the first answer
  assert.deepEqual(runs, [['quiero reservar']]);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(runs, [['quiero reservar'], ['para 4']]);
});

test('conversations do not wait for each other', async () => {
  const t = manual();
  const runs: string[] = [];
  const s = createSettler({ wait: t.wait, now: t.now, run: async (k) => { runs.push(k); } });
  const a = s.push('a', part('1', 'hola'));
  const b = s.push('b', part('2', 'hola'));
  await t.wake();
  await t.wake();
  await Promise.all([a, b]);
  assert.deepEqual(runs.sort(), ['a', 'b']);
});

test('someone who never stops typing is still answered', async () => {
  const t = manual();
  const runs: string[][] = [];
  const s = createSettler({ wait: t.wait, now: t.now, run: async (_k, parts) => { runs.push(parts.map((p) => p.text)); } });
  void s.push('c', part('1', 'uno'));
  t.advance(SETTLE_MAX_MS);
  void s.push('c', part('2', 'dos')); // past the limit: no more waiting for this batch
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(runs, [['uno', 'dos']]);
});

test('a failed answer does not jam the conversation', async () => {
  const t = manual();
  let calls = 0;
  const s = createSettler({ wait: t.wait, now: t.now, run: async () => { calls++; if (calls === 1) throw new Error('boom'); } });
  const first = s.push('c', part('1', 'hola')).then(() => 'answered', () => 'failed');
  await t.wake();
  assert.equal(await first, 'failed');
  const second = s.push('c', part('2', 'hola'));
  await t.wake();
  await second;
  assert.equal(calls, 2);
});
