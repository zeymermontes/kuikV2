'use client';

import { Download } from 'lucide-react';

/** Downloads an array of flat objects as a CSV file (client-side). */
export function ExportButton({
  rows,
  filename,
  label,
}: {
  rows: Record<string, unknown>[];
  filename: string;
  label: string;
}) {
  function download() {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      headers.join(','),
      ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={download}
      disabled={rows.length === 0}
      className="flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-900 disabled:opacity-40"
    >
      <Download className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
