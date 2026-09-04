import 'server-only';

/**
 * Voice note → text, so a diner who talks instead of types still gets booked.
 *
 * Provider order: Groq's whisper-large-v3 when AI_GROQ_KEY is set (fast and
 * nearly free), else OpenAI's whisper-1 on AI_OPENAI_KEY. No key configured
 * means null — the caller then answers "¿me lo escribes?" instead of silence.
 * Platform-level keys on purpose: transcription is infrastructure, not a
 * per-tenant AI feature, and a 30-second note costs fractions of a cent.
 */

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 8 * 1024 * 1024;

function extFor(mime: string | null): string {
  const m = (mime ?? '').toLowerCase();
  if (m.includes('ogg') || m.includes('opus')) return 'ogg';
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  return 'ogg';
}

export async function transcribeAudio(
  data: Buffer,
  mime: string | null,
): Promise<string | null> {
  if (data.length === 0 || data.length > MAX_BYTES) return null;

  const groqKey = process.env.AI_GROQ_KEY;
  const openaiKey = process.env.AI_OPENAI_KEY;
  const target = groqKey
    ? { url: 'https://api.groq.com/openai/v1/audio/transcriptions', key: groqKey, model: 'whisper-large-v3' }
    : openaiKey
      ? { url: 'https://api.openai.com/v1/audio/transcriptions', key: openaiKey, model: 'whisper-1' }
      : null;
  if (!target) return null;

  const form = new FormData();
  form.append('model', target.model);
  form.append(
    'file',
    new Blob([new Uint8Array(data)], { type: mime ?? 'audio/ogg' }),
    `voice.${extFor(mime)}`,
  );

  try {
    const res = await fetch(target.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${target.key}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { text?: string };
    const text = (json.text ?? '').trim();
    return text ? text.slice(0, 1000) : null;
  } catch {
    return null;
  }
}
