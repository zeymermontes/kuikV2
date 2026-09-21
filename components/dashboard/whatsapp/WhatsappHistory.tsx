'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card, Button } from '@/components/ui';
import { clearWhatsappHistory } from '@/app/(dashboard)/whatsapp/actions';

/**
 * Clear the chat history. The page mounts this only while no number is
 * connected — typically between unlinking one number and pairing another, so
 * the new number does not inherit the old one's conversations.
 */
export function WhatsappHistory({ conversations }: { conversations: number }) {
  const t = useTranslations('whatsapp');
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  function clear() {
    if (!confirm(t('historyConfirm', { n: conversations }))) return;
    start(async () => {
      const res = await clearWhatsappHistory();
      setNote('error' in res ? { ok: false, text: t(`historyErr_${res.error}`) } : { ok: true, text: t('historyDone') });
    });
  }

  return (
    <Card className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">{t('historyTitle')}</h2>
        <p className="text-sm text-neutral-500">{note?.ok ? note.text : t('historyHint', { n: conversations })}</p>
        {note && !note.ok && <p className="mt-1 text-sm text-red-600">{note.text}</p>}
      </div>
      <Button variant="danger" onClick={clear} disabled={pending || conversations === 0 || note?.ok}>
        <Trash2 className="h-4 w-4" /> {pending ? '…' : t('historyClear')}
      </Button>
    </Card>
  );
}
