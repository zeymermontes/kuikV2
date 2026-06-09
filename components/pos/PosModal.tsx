'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

/** Lightweight centered modal for POS dialogs (replaces window.prompt/alert). */
export function PosModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div className="animate-fade absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="animate-slide-up relative w-full max-w-sm rounded-t-3xl bg-white p-5 text-neutral-900 shadow-xl sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="close" className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
