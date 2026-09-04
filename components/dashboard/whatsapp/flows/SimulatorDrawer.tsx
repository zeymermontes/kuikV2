'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RotateCcw, Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { spanishSlotParser, stepGraph, type GraphRunState } from '@/lib/whatsapp/flows/engine';
import type { FlowGraph } from '@/lib/whatsapp/flows/schema';
import type { OutboundDraft } from '@/lib/whatsapp/types';

/**
 * "Probar": the REAL engine running the draft graph in the browser — same
 * stepGraph, same Spanish parsing — so what the owner rehearses here is what
 * a diner will get, byte for byte. Actions are announced, not executed.
 */

interface Bubble {
  who: 'bot' | 'me' | 'sys';
  body: string;
  buttons?: { id: string; title: string }[];
}

const SIM_VARS = {
  restaurante: 'Tu Restaurante',
  menu_url: 'https://tu-restaurante.kuik.mx',
  direccion: 'Av. Ejemplo 123',
  horario_hoy: '13:00 a 23:00',
  horario_semana: 'Lun-Dom: 13:00-23:00',
  mapa: '',
  telefono: '',
};

export function SimulatorDrawer({ graph, onClose }: { graph: FlowGraph; onClose: () => void }) {
  const t = useTranslations('whatsapp.flows');
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [state, setState] = useState<GraphRunState>({ currentNodeId: null, answers: {} });
  const [done, setDone] = useState(false);
  const [text, setText] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const booted = useRef(false);

  // The literal parser production uses, so the rehearsal matches the bot.
  const ctx = {
    vars: SIM_VARS,
    parse: spanishSlotParser(new Date().toISOString().slice(0, 10)),
  };

  const push = (result: ReturnType<typeof stepGraph>) => {
    const next: Bubble[] = [];
    for (const [i, reply] of result.replies.entries()) {
      const last = i === result.replies.length - 1;
      next.push({
        who: 'bot',
        body: reply.body,
        buttons: last ? buttonsOf(reply) : undefined,
      });
    }
    for (const action of result.actions) {
      next.push({ who: 'sys', body: t('simAction', { kind: t(`action_${action.kind}`) }) });
    }
    if (result.endBody) next.push({ who: 'bot', body: result.endBody.body });
    if (result.outcome) {
      next.push({ who: 'sys', body: t(result.outcome === 'completed' ? 'simCompleted' : 'simCanceled') });
      setDone(true);
    }
    setBubbles((b) => [...b, ...next]);
    setState(result.state);
  };

  const start = () => {
    setBubbles([]);
    setDone(false);
    const first = stepGraph(graph, { currentNodeId: null, answers: {} }, { text: 'hola' }, ctx);
    setBubbles([{ who: 'me', body: t('simTrigger') }]);
    push(first);
  };

  // Kick off once. (Strict mode double-invokes effects; the ref guards it.)
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [bubbles]);

  const send = (body: string, replyId?: string) => {
    if (done || (!body.trim() && !replyId)) return;
    setBubbles((b) => [...b, { who: 'me', body }]);
    push(stepGraph(graph, state, { text: body, replyId: replyId ?? null }, ctx));
    setText('');
  };

  return (
    <div className="animate-slide-up absolute inset-y-0 right-0 z-10 flex w-full max-w-[380px] flex-col border-l border-neutral-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <h2 className="text-sm font-semibold">{t('test')}</h2>
        <div className="flex items-center gap-1">
          <button onClick={start} title={t('simRestart')} className="p-1.5 text-neutral-400 hover:text-neutral-700">
            <RotateCcw className="h-4 w-4" />
          </button>
          <button onClick={onClose} aria-label="close" className="p-1.5 text-neutral-400 hover:text-neutral-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div ref={scroller} className="flex-1 space-y-2 overflow-y-auto bg-neutral-50 p-4">
        {bubbles.map((b, i) => (
          <div key={i}>
            {b.who === 'sys' ? (
              <div className="mx-auto w-fit rounded-full bg-neutral-200/70 px-3 py-1 text-[11px] text-neutral-600">
                {b.body}
              </div>
            ) : (
              <div className={cn('flex', b.who === 'me' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm',
                  b.who === 'me' ? 'rounded-br-sm bg-neutral-900 text-white' : 'rounded-bl-sm border border-neutral-200 bg-white',
                )}>
                  {b.body}
                </div>
              </div>
            )}
            {b.buttons && !done && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {b.buttons.map((btn) => (
                  <button
                    key={btn.id}
                    onClick={() => send(btn.title, btn.id)}
                    className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium hover:border-neutral-900"
                  >
                    {btn.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <form
        className="flex items-center gap-2 border-t border-neutral-100 p-3"
        onSubmit={(e) => { e.preventDefault(); send(text); }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={done}
          placeholder={done ? t('simDone') : t('simPlaceholder')}
          className="w-full rounded-full border border-neutral-300 px-4 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <button type="submit" disabled={done} className="rounded-full bg-neutral-900 p-2.5 text-white disabled:opacity-40">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

function buttonsOf(reply: OutboundDraft): { id: string; title: string }[] | undefined {
  if (reply.buttons?.length) return reply.buttons;
  const rows = reply.list?.sections.flatMap((s) => s.rows);
  return rows?.length ? rows.map(({ id, title }) => ({ id, title })) : undefined;
}
