'use client';

import dynamic from 'next/dynamic';
import type { WhatsappFlow } from '@/lib/whatsapp/types';

// React Flow is ~45kb gzip and window-bound; it loads only on this page and
// only in the browser. (ssr:false requires a client wrapper — this file.)
const FlowCanvas = dynamic(() => import('./FlowCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[calc(100dvh-1rem)] animate-pulse items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 max-md:h-[calc(100dvh-4.5rem)]">
      <div className="h-24 w-56 rounded-2xl border border-neutral-200 bg-white" />
    </div>
  ),
});

export function FlowEditorShell({ flow }: { flow: WhatsappFlow }) {
  return <FlowCanvas flow={flow} />;
}
