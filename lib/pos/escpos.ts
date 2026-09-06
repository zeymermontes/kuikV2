// ESC/POS renderer: the TypeScript twin of print-agent/escpos.go.
//
// The Go copy runs in the print agent on the register PC. This one runs in
// the Terminal app on a tablet, where the WebView renders the bytes and the
// native side only owns the socket (native/plugins/kuik-printer). Both follow
// renderText in print-doc.ts for layout, and tests/escpos.test.ts mirrors
// escpos_test.go, so a change to one shows up as a failing test in the other.
//
// The subset every receipt printer honours: init, alignment, bold, double
// size, feed, cut, drawer pulse, and code page WPC1252 for accents.

import type { PrintAlign, PrintDoc } from './print-doc';

export const ESC = 0x1b;
export const GS = 0x1d;

/** Lay `doc` out at `width` characters per line (32 for 58 mm, 48 for 80 mm) and return the bytes to send. */
export function renderEscPos(doc: PrintDoc, width: number, cut: boolean): Uint8Array {
  if (width <= 0) width = 48;
  const out: number[] = [];
  const push = (...b: number[]) => out.push(...b);
  const text = (s: string) => out.push(...encodeCp1252(s));

  push(ESC, 0x40); // initialise
  push(ESC, 0x74, 16); // code page WPC1252
  push(ESC, 0x61, 0); // left

  for (const ln of doc.lines) {
    switch (ln.t) {
      case 'hr':
        push(ESC, 0x61, 0);
        text('-'.repeat(width));
        push(0x0a);
        break;
      case 'feed':
        push(ESC, 0x64, Math.max(1, ln.n ?? 1));
        break;
      case 'text': {
        const w = ln.size === 2 ? Math.floor(width / 2) : width;
        setStyle(push, !!ln.bold, ln.size === 2);
        push(ESC, 0x61, alignCode(ln.align));
        for (const s of wrap(ln.v, w)) {
          text(s);
          push(0x0a);
        }
        setStyle(push, false, false);
        break;
      }
      case 'row': {
        const w = ln.size === 2 ? Math.floor(width / 2) : width;
        setStyle(push, !!ln.bold, ln.size === 2);
        push(ESC, 0x61, 0);
        text(row(ln.l, ln.r, w));
        push(0x0a);
        setStyle(push, false, false);
        break;
      }
    }
  }

  push(ESC, 0x61, 0);
  if (doc.drawer) {
    // Pin 2, 50 ms on / 500 ms off: the pulse every drawer understands.
    push(ESC, 0x70, 0, 25, 250);
  }
  if (cut && doc.cut !== false) {
    push(ESC, 0x64, 3); // clear the tear bar
    push(GS, 0x56, 66, 0); // partial cut
  }
  return Uint8Array.from(out);
}

function setStyle(push: (...b: number[]) => void, bold: boolean, double: boolean) {
  push(ESC, 0x45, bold ? 1 : 0);
  push(GS, 0x21, double ? 0x11 : 0x00);
}

function alignCode(a?: PrintAlign): number {
  return a === 'center' ? 1 : a === 'right' ? 2 : 0;
}

/** Right column flush right, left column trimmed to leave at least one space (renderText's rule). */
export function row(l: string, r: string, w: number): string {
  let rr = Array.from(r);
  if (rr.length > w) rr = rr.slice(0, w);
  const room = Math.max(0, w - rr.length - 1);
  let ll = Array.from(l);
  if (ll.length > room) ll = ll.slice(0, room);
  const pad = Math.max(1, w - ll.length - rr.length);
  return ll.join('') + ' '.repeat(pad) + rr.join('');
}

/** Break on words; hard-break a single word longer than the line. */
export function wrap(text: string, w: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let cur = '';
    for (const word of words) {
      if (cur === '') cur = word;
      else if (Array.from(cur).length + 1 + Array.from(word).length <= w) cur += ' ' + word;
      else {
        out.push(cur);
        cur = word;
      }
      while (Array.from(cur).length > w) {
        const rs = Array.from(cur);
        out.push(rs.slice(0, w).join(''));
        cur = rs.slice(w).join('');
      }
    }
    out.push(cur);
  }
  return out;
}

/** UTF-8 → Windows-1252. Latin-1 maps 1:1; the 1252-only symbols are listed; anything else is '?'. */
export function encodeCp1252(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const r = ch.codePointAt(0)!;
    if (r < 0x80) out.push(r);
    else if (r >= 0xa0 && r <= 0xff) out.push(r);
    else out.push(CP1252.get(ch) ?? 0x3f);
  }
  return Uint8Array.from(out);
}

const CP1252 = new Map<string, number>([
  ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84], ['…', 0x85], ['†', 0x86], ['‡', 0x87], ['ˆ', 0x88], ['‰', 0x89],
  ['Š', 0x8a], ['‹', 0x8b], ['Œ', 0x8c], ['Ž', 0x8e], ['‘', 0x91], ['’', 0x92], ['“', 0x93], ['”', 0x94], ['•', 0x95],
  ['–', 0x96], ['—', 0x97], ['˜', 0x98], ['™', 0x99], ['š', 0x9a], ['›', 0x9b], ['œ', 0x9c], ['ž', 0x9e], ['Ÿ', 0x9f],
  ['×', 0xd7], ['·', 0xb7],
]);

/** "192.168.1.50" or "192.168.1.50:9100" → host and port (9100 by default, the raw JetDirect port). */
export function splitPrinterAddress(address: string): { host: string; port: number } | null {
  const a = address.trim();
  if (!a) return null;
  const i = a.lastIndexOf(':');
  if (i < 0) return { host: a, port: 9100 };
  const port = Number(a.slice(i + 1));
  const host = a.slice(0, i);
  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return { host, port };
}
