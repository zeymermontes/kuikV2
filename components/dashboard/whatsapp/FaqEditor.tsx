'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { BookOpen, ChevronDown, ClipboardCopy, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button, Card, Field, Input, Textarea } from '@/components/ui';
import { deleteFaq, saveFaq } from '@/app/(dashboard)/whatsapp/actions';
import { buildFaqAssistantPrompt, faqTopicKey, parseFaqBlocks } from '@/lib/whatsapp/faq-import';

export interface Faq {
  id: string;
  topic: string;
  answer: string;
  keywords: string[];
  enabled: boolean;
}

/**
 * The restaurant's own answers to the questions the menu can't cover:
 * parking, pets, terrace, payment methods. The AI serves these through
 * consultar_info — it can only say what's written here, so writing more
 * here IS making the bot smarter.
 */
export function FaqEditor({ faqs: initial, restaurantName }: { faqs: Faq[]; restaurantName: string }) {
  const t = useTranslations('whatsapp.faqs');
  const locale = useLocale();
  const router = useRouter();
  const [faqs, setFaqs] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [assistOpen, setAssistOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState('');
  const [importMsg, setImportMsg] = useState<{ ok: boolean; count: number } | null>(null);
  const [importing, startImport] = useTransition();
  const [, start] = useTransition();

  async function copyPrompt() {
    const prompt = buildFaqAssistantPrompt({ locale, restaurantName, faqs });
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked (http, permissions): show the text for manual copy.
      window.prompt(t('assistCopy'), prompt);
    }
  }

  function importPaste() {
    const seeds = parseFaqBlocks(pasted);
    if (seeds.length === 0) {
      setImportMsg({ ok: false, count: 0 });
      return;
    }
    startImport(async () => {
      const byTopic = new Map(faqs.map((f) => [faqTopicKey(f.topic), f] as const));
      const merged = [...faqs];
      let saved = 0;
      for (const seed of seeds) {
        const existing = byTopic.get(faqTopicKey(seed.topic));
        const res = await saveFaq({
          id: existing && !existing.id.startsWith('new_') ? existing.id : undefined,
          topic: seed.topic,
          answer: seed.answer,
          keywords: seed.keywords.join(', '),
          enabled: true,
        });
        if (!res.ok) continue;
        saved += 1;
        const next: Faq = { id: res.id ?? `new_${Date.now().toString(36)}`, ...seed, enabled: true };
        const at = existing ? merged.findIndex((f) => f.id === existing.id) : -1;
        if (at >= 0) merged[at] = next; else merged.push(next);
      }
      setFaqs(merged);
      if (saved > 0) setPasted('');
      setImportMsg({ ok: saved > 0, count: saved });
      router.refresh();
    });
  }

  const persist = (faq: Faq) => start(async () => {
    await saveFaq({
      id: faq.id.startsWith('new_') ? undefined : faq.id,
      topic: faq.topic,
      answer: faq.answer,
      keywords: faq.keywords.join(', '),
      enabled: faq.enabled,
    });
    router.refresh();
  });

  const patch = (id: string, p: Partial<Faq>) =>
    setFaqs((cur) => cur.map((f) => (f.id === id ? { ...f, ...p } : f)));

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <BookOpen className="h-4 w-4 text-neutral-500" /> {t('title')}
          </h2>
          <p className="text-sm text-neutral-500">{t('hint')}</p>
        </div>
        <Button
          variant="secondary"
          className="px-3 py-1.5 text-xs"
          onClick={() => {
            const id = `new_${Date.now().toString(36)}`;
            setFaqs((cur) => [...cur, { id, topic: '', answer: '', keywords: [], enabled: true }]);
            setAdding(true);
          }}
        >
          <Plus className="h-3.5 w-3.5" /> {t('add')}
        </Button>
      </div>

      {/* Fill-by-interview: copy a prompt into any chat AI, paste its final
          block back, and the list below populates itself. */}
      <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50">
        <button
          onClick={() => setAssistOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-violet-500" /> {t('assistTitle')}
          </span>
          <ChevronDown className={`h-4 w-4 text-neutral-400 transition ${assistOpen ? 'rotate-180' : ''}`} />
        </button>
        {assistOpen && (
          <div className="space-y-3 border-t border-dashed border-neutral-300 px-3 py-3">
            <p className="text-xs text-neutral-500">{t('assistHint')}</p>
            <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={copyPrompt}>
              <ClipboardCopy className="h-3.5 w-3.5" /> {copied ? t('assistCopied') : t('assistCopy')}
            </Button>
            <Textarea
              rows={4}
              value={pasted}
              placeholder={t('assistPastePlaceholder')}
              onChange={(e) => { setPasted(e.target.value); setImportMsg(null); }}
              className="text-xs"
            />
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                className="px-3 py-1.5 text-xs"
                onClick={importPaste}
                disabled={!pasted.trim() || importing}
              >
                {importing ? t('assistImporting') : t('assistImport')}
              </Button>
              {importMsg && (
                <p className={`text-xs ${importMsg.ok ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {importMsg.ok ? t('assistImported', { count: importMsg.count }) : t('assistParseError')}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {faqs.length === 0 && !adding && (
        <p className="rounded-lg bg-neutral-50 px-3 py-3 text-sm text-neutral-500">{t('empty')}</p>
      )}

      <div className="space-y-3">
        {faqs.map((faq) => (
          <div key={faq.id} className="rounded-xl border border-neutral-200 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Input
                value={faq.topic}
                placeholder={t('topicPlaceholder')}
                onChange={(e) => patch(faq.id, { topic: e.target.value })}
                onBlur={() => faq.topic && faq.answer && persist(faq)}
                className="font-medium"
              />
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-neutral-500">
                <input
                  type="checkbox"
                  checked={faq.enabled}
                  onChange={(e) => {
                    patch(faq.id, { enabled: e.target.checked });
                    persist({ ...faq, enabled: e.target.checked });
                  }}
                  className="h-4 w-4 accent-neutral-900"
                />
                {t('enabled')}
              </label>
              <button
                onClick={() => {
                  setFaqs((cur) => cur.filter((f) => f.id !== faq.id));
                  if (!faq.id.startsWith('new_')) start(async () => { await deleteFaq(faq.id); router.refresh(); });
                }}
                className="p-1.5 text-neutral-400 hover:text-red-600"
                title={t('delete')}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <Textarea
              rows={2}
              value={faq.answer}
              placeholder={t('answerPlaceholder')}
              onChange={(e) => patch(faq.id, { answer: e.target.value })}
              onBlur={() => faq.topic && faq.answer && persist(faq)}
            />
            <Field label="" hint={t('keywordsHint')}>
              <Input
                value={faq.keywords.join(', ')}
                placeholder={t('keywordsPlaceholder')}
                onChange={(e) => patch(faq.id, { keywords: e.target.value.split(',').map((k) => k.trim()) })}
                onBlur={() => faq.topic && faq.answer && persist(faq)}
                className="mt-2 text-xs"
              />
            </Field>
          </div>
        ))}
      </div>
    </Card>
  );
}
