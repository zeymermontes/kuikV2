'use client';

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';

/**
 * One field: a Meta Pixel id, saved through whichever action the page hands
 * in (the super-admin's for Kuik's pixel, the owner's for the restaurant's).
 */
export function PixelSettings({
  initial,
  save,
  labels,
}: {
  initial: string | null;
  save: (id: string) => Promise<{ error?: string }>;
  labels: { title: string; hint: string; label: string; save: string; saved: string; invalid: string; failed: string };
}) {
  const [value, setValue] = useState(initial ?? '');
  const [state, setState] = useState<'idle' | 'saved' | 'invalid' | 'failed'>('idle');
  const [pending, start] = useTransition();

  function submit() {
    setState('idle');
    start(async () => {
      const res = await save(value);
      setState(res.error === 'invalid' ? 'invalid' : res.error ? 'failed' : 'saved');
    });
  }

  return (
    <Card className="max-w-xl">
      <h2 className="text-lg font-semibold">{labels.title}</h2>
      <p className="mt-1 text-sm text-neutral-500">{labels.hint}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          placeholder="1234567890123456"
          aria-label={labels.label}
          data-setting={labels.title}
          className="w-56 font-mono"
        />
        <Button variant="secondary" disabled={pending || value === (initial ?? '')} onClick={submit}>
          {labels.save}
        </Button>
        {state === 'saved' && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <Check className="h-3.5 w-3.5" /> {labels.saved}
          </span>
        )}
        {state === 'invalid' && <span className="text-xs text-red-600">{labels.invalid}</span>}
        {state === 'failed' && <span className="text-xs text-red-600">{labels.failed}</span>}
      </div>
    </Card>
  );
}
