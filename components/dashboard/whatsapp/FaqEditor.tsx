'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BookOpen, Plus, Trash2 } from 'lucide-react';
import { Button, Card, Field, Input, Textarea } from '@/components/ui';
import { deleteFaq, saveFaq } from '@/app/(dashboard)/whatsapp/actions';

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
export function FaqEditor({ faqs: initial }: { faqs: Faq[] }) {
  const t = useTranslations('whatsapp.faqs');
  const router = useRouter();
  const [faqs, setFaqs] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [, start] = useTransition();

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
