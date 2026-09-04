import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFaqAssistantPrompt, parseFaqBlocks } from '../lib/whatsapp/faq-import';

test('parses the clean block the prompt asks for', () => {
  const out = parseFaqBlocks(
    `TEMA: Estacionamiento
PALABRAS: parking, valet, coche
RESPUESTA: Sí, tenemos estacionamiento gratis para clientes.
---
TEMA: Mascotas
RESPUESTA: Solo en terraza, con correa.
---`,
  );
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], {
    topic: 'Estacionamiento',
    keywords: ['parking', 'valet', 'coche'],
    answer: 'Sí, tenemos estacionamiento gratis para clientes.',
  });
  assert.deepEqual(out[1].keywords, []);
});

test('survives how models actually paste: fences, bold, bullets, chatter', () => {
  const out = parseFaqBlocks(
    `¡Claro! Aquí tienes el bloque final:

\`\`\`
- **TEMA:** Wifi
  **PALABRAS:** internet, clave, contraseña
  **RESPUESTA:** Sí, la clave es "mariscos2024".
Pídela también en caja.
---
\`\`\`

¿Quieres que agregue algo más?`,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].topic, 'Wifi');
  assert.equal(out[0].answer, 'Sí, la clave es "mariscos2024".\nPídela también en caja.');
  assert.deepEqual(out[0].keywords, ['internet', 'clave', 'contraseña']);
});

test('English labels work and duplicate topics collapse (accent-insensitive)', () => {
  const out = parseFaqBlocks(
    `TOPIC: Facturación
KEYWORDS: invoice, cfdi
ANSWER: Send your tax info to billing@resto.mx.
---
TEMA: FACTURACION
RESPUESTA: duplicate, must be ignored
---
TOPIC: Pets
ANSWER: Terrace only.`,
  );
  assert.equal(out.length, 2);
  assert.equal(out[0].topic, 'Facturación');
  assert.equal(out[1].topic, 'Pets');
});

test('junk without labels yields nothing; answerless topics are dropped', () => {
  assert.deepEqual(parseFaqBlocks('hola, no tengo formato'), []);
  assert.deepEqual(parseFaqBlocks('TEMA: Horario\n---'), []);
});

test('prompt embeds existing FAQs and dictates the exact format', () => {
  const prompt = buildFaqAssistantPrompt({
    locale: 'es',
    restaurantName: 'Mar And Sea',
    faqs: [{ topic: 'Estacionamiento', answer: 'Sí hay.', keywords: ['valet'] }],
  });
  assert.match(prompt, /Mar And Sea/);
  assert.match(prompt, /- Estacionamiento: Sí hay\. \(palabras clave: valet\)/);
  assert.match(prompt, /TEMA: /);
  assert.match(prompt, /No inventes NADA/);
  // A round trip: the format the prompt teaches is one the parser accepts.
  assert.equal(parseFaqBlocks('TEMA: x\nPALABRAS: a, b\nRESPUESTA: y\n---').length, 1);

  const en = buildFaqAssistantPrompt({ locale: 'en-US', restaurantName: '', faqs: [] });
  assert.match(en, /TOPIC: /);
  assert.match(en, /nothing yet/);
});
