import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_DRAFT,
  buildComponents,
  cleanParam,
  isEditableInApp,
  localStatus,
  normalizeTemplateName,
  renderPreview,
  rowToDraft,
  sendTemplateObject,
  templateParts,
  toOption,
  uniqueVars,
  validateTemplate,
  type TemplateDraft,
} from '../lib/whatsapp/template-rules';

const keys = (d: TemplateDraft) => validateTemplate(d).map((i) => i.key);
const draft = (over: Partial<TemplateDraft>): TemplateDraft => ({ ...EMPTY_DRAFT, name: 'pedido_listo', body: 'Hola, tu pedido está listo.', ...over });

test('a plain valid draft has no issues', () => {
  assert.deepEqual(keys(draft({})), []);
});

test('name: required and a-z 0-9 _ only; the normalizer gets there from anything', () => {
  assert.ok(keys(draft({ name: '' })).includes('nameRequired'));
  assert.ok(keys(draft({ name: 'Pedido Listo' })).includes('nameChars'));
  assert.equal(normalizeTemplateName('Pedido Listo — Día 1'), 'pedido_listo_dia_1');
});

test('body variables: sequential, with examples, not adjacent, not only variables', () => {
  assert.ok(keys(draft({ body: 'Hola {{2}}, ya.', examples: { '2': 'x' } })).includes('varsSequential'));
  assert.ok(keys(draft({ body: 'Hola {{1}}, ya.' })).includes('exampleMissing'));
  assert.ok(keys(draft({ body: 'Hola {{1}} {{2}} ya.', examples: { '1': 'a', '2': 'b' } })).includes('varsAdjacent'));
  assert.ok(keys(draft({ body: '{{1}}', examples: { '1': 'a' } })).includes('bodyOnlyVars'));
  assert.deepEqual(keys(draft({ body: 'Hola {{1}}, tu pedido {{2}} va en camino.', examples: { '1': 'Ana', '2': '#12' } })), []);
});

test('body cannot start or end with a variable, punctuation notwithstanding (Meta 2388299)', () => {
  assert.ok(keys(draft({ body: '{{1}}, hola.', examples: { '1': 'a' } })).includes('bodyStartsWithVar'));
  assert.ok(keys(draft({ body: 'El total es de {{1}}.', examples: { '1': '350' } })).includes('bodyEndsWithVar'));
  assert.ok(keys(draft({ body: 'El total es de {{1}} MXN.', examples: { '1': '350' } })).every((k) => k !== 'bodyEndsWithVar'));
});

test('header: text only, one variable that must be {{1}} with its example; footer: no variables', () => {
  assert.ok(keys(draft({ header: 'Hola {{2}}', examples: { header: 'x' } })).includes('headerVarMustBeOne'));
  assert.ok(keys(draft({ header: 'Hola {{1}}' })).includes('headerExampleMissing'));
  assert.ok(keys(draft({ header: 'Hola {{1}} y {{2}}' })).includes('headerOneVar'));
  assert.ok(keys(draft({ header: 'x'.repeat(61) })).includes('headerTooLong'));
  assert.ok(keys(draft({ footer: 'Gracias {{1}}' })).includes('footerNoVars'));
});

test('buttons: limits, grouping, text and url/phone shape', () => {
  const q = (text: string) => ({ type: 'QUICK_REPLY' as const, text });
  const u = (text: string, url: string) => ({ type: 'URL' as const, text, url });
  const p = (text: string, phone: string) => ({ type: 'PHONE_NUMBER' as const, text, phone });
  assert.ok(keys(draft({ buttons: [q('Sí'), u('Ver', 'https://a.co/x'), q('No')] })).includes('buttonsInterleaved'));
  assert.deepEqual(keys(draft({ buttons: [q('Sí'), q('No'), u('Ver', 'https://a.co/x'), p('Llamar', '+52 55 1234 5678')] })), []);
  assert.ok(keys(draft({ buttons: [u('a', 'https://a.co/x'), u('b', 'https://a.co/y'), u('c', 'https://a.co/z')] })).includes('urlButtonsTooMany'));
  assert.ok(keys(draft({ buttons: [q('Sí'), q('sí')] })).includes('buttonTextDuplicate'));
  assert.ok(keys(draft({ buttons: [u('Ver', 'https://a.co/{{1}}')] })).includes('buttonUrlNoVars'));
  assert.ok(keys(draft({ buttons: [u('Ver', 'ftp://a')] })).includes('buttonUrlInvalid'));
  assert.ok(keys(draft({ buttons: [p('Llamar', '123')] })).includes('buttonPhoneInvalid'));
  assert.ok(keys(draft({ buttons: [q('x'.repeat(26))] })).includes('buttonTextTooLong'));
});

test('buildComponents produces what Meta documents', () => {
  const comps = buildComponents(
    draft({
      header: 'Hola {{1}}',
      body: 'Tu pedido {{1}} ya está listo. El total es {{2}} MXN.',
      footer: 'Responde si tienes dudas.',
      examples: { header: 'Ana', '1': '#1042', '2': '350' },
      buttons: [
        { type: 'QUICK_REPLY', text: 'Confirmar' },
        { type: 'URL', text: 'Ver pedido', url: 'https://ejemplo.com/pedidos' },
        { type: 'PHONE_NUMBER', text: 'Llamar', phone: '+52 (55) 1234-5678' },
      ],
    }),
  );
  assert.deepEqual(comps, [
    { type: 'HEADER', format: 'TEXT', text: 'Hola {{1}}', example: { header_text: ['Ana'] } },
    { type: 'BODY', text: 'Tu pedido {{1}} ya está listo. El total es {{2}} MXN.', example: { body_text: [['#1042', '350']] } },
    { type: 'FOOTER', text: 'Responde si tienes dudas.' },
    {
      type: 'BUTTONS',
      buttons: [
        { type: 'QUICK_REPLY', text: 'Confirmar' },
        { type: 'URL', text: 'Ver pedido', url: 'https://ejemplo.com/pedidos' },
        { type: 'PHONE_NUMBER', text: 'Llamar', phone_number: '+525512345678' },
      ],
    },
  ]);
});

test('templateParts reads both the bare array and the stored wrapper, and flags what cannot be sent', () => {
  const comps = [
    { type: 'HEADER', format: 'IMAGE' },
    { type: 'BODY', text: 'Hola {{1}}' },
    { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Ver', url: 'https://a.co/{{1}}' }, { type: 'COPY_CODE', text: 'Copiar' }, { type: 'QUICK_REPLY', text: 'Ok' }] },
  ];
  const p = templateParts(comps);
  assert.equal(p.mediaHeader, 'IMAGE');
  assert.equal(p.body, 'Hola {{1}}');
  assert.deepEqual(p.buttons, [{ type: 'QUICK_REPLY', text: 'Ok' }]);
  assert.equal(p.unsupportedButtons, 2);
  assert.equal(templateParts({ components: [{ type: 'BODY', text: 'x' }] }).body, 'x');
  assert.deepEqual(templateParts(null).buttons, []);
});

test('toOption: variables counted, blockers named', () => {
  const o = toOption({
    id: '1', name: 't', status: 'APPROVED', category: 'UTILITY', language: 'es_MX',
    components: [{ type: 'HEADER', format: 'TEXT', text: 'Hola {{1}}' }, { type: 'BODY', text: 'Pedido {{1}} por {{2}}, sí {{1}}.' }, { type: 'FOOTER', text: 'Pie' }],
  });
  assert.equal(o.varCount, 2);
  assert.equal(o.headerVar, true);
  assert.equal(o.footer, 'Pie');
  assert.equal(o.blocked, null);
  const media = toOption({ id: '2', name: 'm', status: 'APPROVED', category: 'MARKETING', language: 'es_MX', components: [{ type: 'HEADER', format: 'VIDEO' }, { type: 'BODY', text: 'x' }] });
  assert.equal(media.blocked, 'media-header');
});

test('renderPreview fills from a list or a map, leaving unknowns visible', () => {
  assert.equal(renderPreview('Hola {{1}}, pedido {{2}}.', ['Ana']), 'Hola Ana, pedido {{2}}.');
  assert.equal(renderPreview('Hola {{1}}', { '1': 'Ana' }), 'Hola Ana');
  assert.equal(renderPreview('Hola {{1}}', { header: 'Luis' }, true), 'Hola Luis');
});

test('send object: header and body parameters only when there are values', () => {
  assert.deepEqual(sendTemplateObject({ name: 'a', lang: 'es_MX', params: [] }), { name: 'a', language: { code: 'es_MX' } });
  assert.deepEqual(sendTemplateObject({ name: 'a', lang: 'es_MX', params: ['#1', '350'], headerParam: 'Ana' }), {
    name: 'a',
    language: { code: 'es_MX' },
    components: [
      { type: 'header', parameters: [{ type: 'text', text: 'Ana' }] },
      { type: 'body', parameters: [{ type: 'text', text: '#1' }, { type: 'text', text: '350' }] },
    ],
  });
  assert.equal(cleanParam('a\nb\t c      d'), 'a b  c    d');
});

test('statuses: editable set, local vocabulary, row back to draft', () => {
  assert.ok(isEditableInApp('rejected'));
  assert.equal(isEditableInApp('APPROVED'), false);
  assert.equal(localStatus('FLAGGED'), 'paused');
  assert.equal(localStatus('IN_APPEAL'), 'pending');
  const d = rowToDraft({ id: '1', name: 'x', status: 'REJECTED', category: 'MARKETING', language: 'en_US', components: [{ type: 'BODY', text: 'Hi {{1}}.' }] });
  assert.equal(d.category, 'MARKETING');
  assert.equal(d.body, 'Hi {{1}}.');
  assert.deepEqual(d.examples, {});
  assert.deepEqual(uniqueVars('{{2}} {{1}} {{2}}'), [1, 2]);
});
