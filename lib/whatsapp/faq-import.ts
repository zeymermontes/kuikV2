/**
 * Fill the bot's FAQ knowledge with any chat AI as the interviewer.
 *
 * The owner copies a prompt into ChatGPT/Claude/Gemini, answers its questions,
 * and pastes the AI's final block back into Kuik. Both halves of that contract
 * live here: the prompt that dictates the output format, and the parser that
 * reads it back. Client-safe on purpose — the copy button and the paste box
 * both run in the browser.
 *
 * The exchange format is deliberately line-based, not JSON: owners paste with
 * surrounding chatter, models wrap things in fences and bold, and a labeled
 * block survives all of that.
 */

export interface FaqSeed {
  topic: string;
  answer: string;
  keywords: string[];
}

const MAX_IMPORT = 40;

/** Accent-insensitive key for matching a pasted topic to an existing card. */
export function faqTopicKey(topic: string): string {
  return topic
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function buildFaqAssistantPrompt(opts: {
  locale: string;
  restaurantName: string;
  faqs: FaqSeed[];
}): string {
  const es = opts.locale.toLowerCase().startsWith('es');
  const name = opts.restaurantName.trim() || (es ? 'mi restaurante' : 'my restaurant');

  const existing = opts.faqs
    .filter((f) => f.topic && f.answer)
    .map((f) => {
      const kw = f.keywords.length
        ? es
          ? ` (palabras clave: ${f.keywords.join(', ')})`
          : ` (keywords: ${f.keywords.join(', ')})`
        : '';
      return `- ${f.topic}: ${f.answer}${kw}`;
    })
    .join('\n');

  if (es) {
    return `Eres un consultor experto en atención a clientes de restaurantes. Vas a entrevistarme para completar la base de conocimiento del bot de WhatsApp de mi restaurante «${name}».

CONTEXTO
- Mi restaurante usa un bot que atiende su WhatsApp: resuelve dudas y toma reservaciones.
- El bot SOLO puede afirmar lo que esté escrito en su "información adicional": una lista de temas, cada uno con la respuesta exacta que le dará al cliente.
- Lo que produzcas se pegará tal cual en esa lista, así que cada respuesta debe estar redactada como se le enviará al cliente por WhatsApp: corta, clara y en el tono del restaurante.

LO QUE YA ESTÁ REGISTRADO (no lo repitas, salvo que detectes que le falta detalle):
${existing || '- (nada todavía)'}

TU TAREA
1. Entrevístame: hazme todas las preguntas que consideres útiles para que el bot responda bien a los clientes (horarios y días festivos, estacionamiento, mascotas, terraza, formas de pago, wifi, facturación, menú infantil, accesibilidad, grupos grandes y eventos, opciones vegetarianas y alergias, servicio a domicilio, tiempos de espera, música, código de vestimenta…). Pregunta de pocas en pocas y espera mis respuestas.
2. No inventes NADA: usa únicamente lo que yo te confirme. Si no respondo algo, omite ese tema.
3. Cuando terminemos (o cuando yo escriba "listo"), entrégame ÚNICAMENTE un bloque final con este formato exacto — un tema por bloque, separados por una línea de tres guiones:

TEMA: nombre corto del tema
PALABRAS: sinónimos con los que un cliente lo preguntaría, separados por comas
RESPUESTA: la respuesta lista para enviarse al cliente

---

Sin numeración, sin comentarios y sin más formato. Empieza ahora con tus primeras preguntas.`;
  }

  return `You are an expert consultant in restaurant customer service. You will interview me to complete the knowledge base of the WhatsApp bot for my restaurant "${name}".

CONTEXT
- My restaurant uses a bot that answers its WhatsApp: it resolves questions and takes reservations.
- The bot can ONLY state what is written in its "additional information": a list of topics, each with the exact answer it will give the customer.
- Whatever you produce will be pasted verbatim into that list, so each answer must read exactly as it will be sent to the customer on WhatsApp: short, clear, in the restaurant's tone.

ALREADY ON FILE (do not repeat these unless you spot missing detail):
${existing || '- (nothing yet)'}

YOUR TASK
1. Interview me: ask everything you consider useful for the bot to answer customers well (hours and holidays, parking, pets, terrace, payment methods, wifi, invoicing, kids menu, accessibility, large groups and private events, vegetarian options and allergies, delivery, wait times, music, dress code…). Ask a few questions at a time and wait for my answers.
2. Do NOT invent anything: use only what I confirm. If I skip something, drop that topic.
3. When we are done (or when I write "done"), give me ONLY a final block in this exact format — one topic per block, separated by a line of three dashes:

TOPIC: short topic name
KEYWORDS: synonyms a customer would use, comma separated
ANSWER: the answer ready to send to the customer

---

No numbering, no comments, no extra formatting. Start now with your first questions.`;
}

const TOPIC_RE = /^(?:TEMA|TOPIC)\s*[:：]\s*(.*)$/i;
const KEYWORDS_RE = /^(?:PALABRAS(?:\s+CLAVE)?|KEYWORDS?)\s*[:：]\s*(.*)$/i;
const ANSWER_RE = /^(?:RESPUESTA|ANSWER)\s*[:：]\s*(.*)$/i;
const SEPARATOR_RE = /^\s*(?:-{3,}|_{3,}|\*{3,})\s*$/;

/**
 * Parse the AI's final block back into FAQ seeds. Tolerates code fences,
 * markdown bold/bullets around labels, prose before and after the block, and
 * multi-line answers (they run until the next label or separator).
 */
export function parseFaqBlocks(text: string): FaqSeed[] {
  const out: FaqSeed[] = [];
  const seen = new Set<string>();
  let current: FaqSeed | null = null;
  let inAnswer = false;

  const push = () => {
    if (!current) return;
    const topic = current.topic.trim().slice(0, 60);
    const answer = current.answer.trim().slice(0, 800);
    const key = faqTopicKey(topic);
    if (topic && answer && !seen.has(key) && out.length < MAX_IMPORT) {
      seen.add(key);
      out.push({ topic, answer, keywords: current.keywords.slice(0, 15) });
    }
    current = null;
    inAnswer = false;
  };

  for (const raw of text.split('\n')) {
    if (raw.trim().startsWith('```')) continue;
    // Shed the markdown a chatty model wraps labels in: bold, bullets, quotes.
    const line = raw
      .replace(/\*\*/g, '')
      .replace(/^\s*(?:>+\s*)?(?:[-*•]\s+)?/, '')
      .trimEnd();

    if (SEPARATOR_RE.test(line)) {
      push();
      continue;
    }

    const topic = line.match(TOPIC_RE);
    if (topic) {
      push();
      current = { topic: topic[1].trim(), answer: '', keywords: [] };
      continue;
    }
    if (!current) continue;

    const keywords = line.match(KEYWORDS_RE);
    if (keywords) {
      current.keywords = keywords[1].split(',').map((k) => k.trim()).filter(Boolean);
      inAnswer = false;
      continue;
    }

    const answer = line.match(ANSWER_RE);
    if (answer) {
      current.answer = answer[1].trim();
      inAnswer = true;
      continue;
    }

    if (inAnswer && line.trim()) current.answer += `\n${line.trim()}`;
  }
  push();

  return out;
}
