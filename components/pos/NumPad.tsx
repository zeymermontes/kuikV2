'use client';

import { Delete } from 'lucide-react';

/** On-screen numeric keypad editing a numeric string value. */
export function NumPad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  function press(k: string) {
    if (k === 'del') onChange(value.slice(0, -1));
    else if (k === '.') {
      if (!value.includes('.')) onChange((value || '0') + '.');
    } else {
      onChange(value === '0' ? k : value + k);
    }
  }
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];
  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((k) => (
        <button
          key={k}
          onClick={() => press(k)}
          className="flex items-center justify-center rounded-xl bg-neutral-100 py-3 text-lg font-semibold text-neutral-800 active:bg-neutral-200"
        >
          {k === 'del' ? <Delete className="h-5 w-5" /> : k}
        </button>
      ))}
    </div>
  );
}
