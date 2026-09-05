'use client';

import { docToHtml, type PrintDoc } from './print-doc';

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);

/** Open a print window with thermal-receipt CSS (80mm) and trigger print. */
export function printHtml(title: string, body: string): void {
  const w = window.open('', '_blank', 'width=380,height=640');
  if (!w) return;
  w.document.write(
    `<html><head><title>${esc(title)}</title><style>
      @page { size: 80mm auto; margin: 4mm; }
      * { box-sizing: border-box; }
      body { font-family: ui-monospace, Menlo, monospace; font-size: 12px; width: 72mm; margin: 0; color: #000; }
      h1 { font-size: 15px; margin: 0 0 2px; text-align: center; }
      .muted { color: #444; }
      .row { display: flex; justify-content: space-between; gap: 8px; }
      .b { font-weight: 700; }
      .lg { font-size: 15px; }
      hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
      ul { margin: 4px 0; padding-left: 14px; }
    </style></head><body>${body}</body></html>`,
  );
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}

/** The browser fallback: the same document a printer would get, through the print dialog. */
export function printDocInBrowser(doc: PrintDoc): void {
  printHtml(doc.title, docToHtml(doc));
}
