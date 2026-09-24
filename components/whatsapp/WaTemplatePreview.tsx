import { ExternalLink, Phone, Reply } from 'lucide-react';
import type { TemplateButton } from '@/lib/whatsapp/template-rules';

/**
 * The one imitation of a WhatsApp template bubble, used everywhere a
 * template is shown: the builder, the list, the chat's picker and the sent
 * message itself. One drawing, so the preview is a real promise of what the
 * diner sees. WhatsApp's own colours, never the tenant theme.
 */
export function WaTemplatePreview({
  header,
  mediaHeader,
  body,
  footer,
  buttons = [],
  emptyLabel,
  compact = false,
  mediaLabel,
}: {
  header?: string | null;
  /** IMAGE | VIDEO | DOCUMENT | LOCATION: announced, not drawn. */
  mediaHeader?: string | null;
  body: string;
  footer?: string | null;
  buttons?: TemplateButton[];
  /** Shown in place of an empty body. */
  emptyLabel?: string;
  /** No chat backdrop: the bubble alone (inside a transcript). */
  compact?: boolean;
  /** Text for the media placeholder, e.g. "Imagen". */
  mediaLabel?: string;
}) {
  const bubble = (
    <div className={`w-full max-w-[320px] overflow-hidden rounded-lg bg-white text-[#111b21] shadow-sm ${compact ? '' : 'rounded-tl-none'}`}>
      {mediaHeader && (
        <div className="flex h-24 items-center justify-center bg-[#e9edef] text-xs font-medium uppercase tracking-wide text-[#54656f]">
          {mediaLabel ? `${mediaLabel}: ${mediaHeader}` : mediaHeader}
        </div>
      )}
      <div className="px-3 pb-2 pt-2">
        {header && <p className="mb-1 whitespace-pre-wrap text-[15px] font-semibold leading-snug">{header}</p>}
        <p className={`whitespace-pre-wrap text-[14.5px] leading-snug ${body.trim() ? '' : 'italic text-[#8696a0]'}`}>{body.trim() ? body : (emptyLabel ?? '…')}</p>
        {footer && <p className="mt-1 whitespace-pre-wrap text-xs text-[#8696a0]">{footer}</p>}
      </div>
      {buttons.length > 0 && (
        <div className="border-t border-[#e9edef]">
          {buttons.map((b, i) => (
            <div key={i} className={`flex items-center justify-center gap-1.5 py-2.5 text-[14px] font-medium text-[#00a5f4] ${i > 0 ? 'border-t border-[#e9edef]' : ''}`}>
              {b.type === 'QUICK_REPLY' ? <Reply className="h-4 w-4" /> : b.type === 'URL' ? <ExternalLink className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
              <span className="truncate">{b.text || '…'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
  if (compact) return bubble;
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: '#e5ddd5 url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2740%27 height=%2740%27%3E%3Ccircle cx=%2720%27 cy=%2720%27 r=%271%27 fill=%27%23d6ccc2%27/%3E%3C/svg%3E")' }}
    >
      {bubble}
    </div>
  );
}
