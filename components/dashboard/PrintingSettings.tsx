'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Printer as PrinterIcon, Plus, Trash2, Copy, Check, Cpu, Pencil, CircleDot } from 'lucide-react';
import type { PrintAgent, Printer, PrinterKind, PrinterRole, PrinterWidth, TenantOrdering } from '@/lib/database.types';
import { Card, Label, Input, Textarea, Button } from '@/components/ui';
import { updateOrdering } from '@/app/(dashboard)/settings-actions';
import {
  createPrintAgent,
  deletePrintAgent,
  deletePrinter,
  printJobStatus,
  savePrinter,
  sendTestPrint,
  type PrinterInput,
} from '@/app/(dashboard)/printing-actions';

const ROLES: PrinterRole[] = ['receipt', 'kitchen', 'report'];

// The install steps differ per OS: file name, how to run a downloaded binary,
// and the warning each OS shows for an unsigned program. Detected from the
// browser, but the manager may be reading this on a phone about a Windows PC.
type Platform = 'windows' | 'mac' | 'linux' | 'pi';
const PLATFORMS: Platform[] = ['windows', 'mac', 'linux', 'pi'];
const FILES: Record<Platform, string[]> = {
  windows: ['kuik-print-agent-windows-amd64.exe'],
  mac: ['kuik-print-agent-darwin-arm64', 'kuik-print-agent-darwin-amd64'],
  linux: ['kuik-print-agent-linux-amd64'],
  pi: ['kuik-print-agent-linux-arm64', 'kuik-print-agent-linux-arm'],
};

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return 'windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'mac';
  if (/Linux|X11/i.test(ua)) return 'linux';
  return 'windows';
}

function runCommand(platform: Platform, token: string): string {
  const f = FILES[platform][0];
  switch (platform) {
    case 'windows':
      return `.\\${f} --token ${token}`;
    case 'mac':
      return `chmod +x ${f} && xattr -d com.apple.quarantine ${f}\n./${f} --token ${token}`;
    default:
      return `chmod +x ${f} && ./${f} --token ${token}`;
  }
}
const WIDTHS: PrinterWidth[] = [32, 48];
const ONLINE_MS = 90_000;
// Where the built binaries are published (print-agent/build.sh → Google Drive).
const DOWNLOAD_URL = process.env.NEXT_PUBLIC_PRINT_AGENT_URL || 'https://drive.google.com/drive/folders/1sHQck1nZch8xO52dsdpF1jcIzjrJoHwz?usp=drive_link';

const empty = (agentId: string | null): PrinterInput => ({
  name: '',
  kind: 'network',
  address: '',
  width: 48,
  roles: ['receipt'],
  stations: [],
  has_drawer: false,
  cut: true,
  copies: 1,
  enabled: true,
  agent_id: agentId,
});

/**
 * Printing setup: the agent(s) installed in the restaurant, the printers each
 * one reaches, and what prints by itself. Lives on the Ordering page next to
 * the other POS settings.
 */
export function PrintingSettings({
  agents,
  printers,
  stations,
  ordering,
}: {
  agents: PrintAgent[];
  printers: Printer[];
  /** Kitchen stations known from the menu's categories, for routing. */
  stations: string[];
  ordering: TenantOrdering;
}) {
  const t = useTranslations('printing');
  const router = useRouter();
  const [o, setO] = useState(ordering);
  const [agentName, setAgentName] = useState('');
  const [newAgent, setNewAgent] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<PrinterInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<{ printerId: string; state: 'sending' | 'queued' | 'done' | 'failed'; error?: string | null } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [platform, setPlatform] = useState<Platform>('windows');

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const id = setTimeout(() => setPlatform(detectPlatform()), 0);
    return () => clearTimeout(id);
  }, []);

  function set<K extends keyof TenantOrdering>(key: K, value: TenantOrdering[K]) {
    setO((s) => ({ ...s, [key]: value }));
    updateOrdering({ [key]: value });
  }

  async function addAgent() {
    const name = agentName.trim() || t('agentDefaultName');
    const { token } = await createPrintAgent(name);
    setNewAgent({ name, token });
    setAgentName('');
    router.refresh();
  }

  async function copyToken() {
    if (!newAgent) return;
    try {
      await navigator.clipboard.writeText(newAgent.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the token is on screen; selecting it still works */
    }
  }

  async function save() {
    if (!editing || !editing.address.trim()) return;
    setSaving(true);
    try {
      await savePrinter(editing);
      setEditing(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function runTest(printerId: string) {
    setTest({ printerId, state: 'sending' });
    try {
      const jobId = await sendTestPrint(printerId);
      setTest({ printerId, state: 'queued' });
      // The agent claims and prints within a couple of seconds when it is
      // online; give it twenty before calling it a no-show.
      let ticks = 0;
      const tick = async () => {
        const st = await printJobStatus(jobId);
        if (st?.status === 'done') return setTest({ printerId, state: 'done' });
        if (st?.status === 'failed') return setTest({ printerId, state: 'failed', error: st.error });
        if (++ticks > 13) return setTest({ printerId, state: 'failed', error: t('testNoAgent') });
        setTimeout(tick, 1500);
      };
      setTimeout(tick, 1500);
    } catch (e) {
      setTest({ printerId, state: 'failed', error: e instanceof Error ? e.message : String(e) });
    }
  }

  const online = (a: PrintAgent) => !!a.last_seen_at && now - Date.parse(a.last_seen_at) < ONLINE_MS;
  const agentName_ = (id: string | null) => agents.find((a) => a.id === id)?.name ?? t('noAgent');
  const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const seg = (on: boolean) =>
    `rounded-xl border px-3 py-2 text-sm font-semibold ${on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-600'}`;

  return (
    <div className="max-w-2xl space-y-5">
      {/* ── Agents ─────────────────────────────────────────────────────── */}
      <Card className="space-y-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Cpu className="h-4 w-4" /> {t('agents')}
          </h2>
          <p className="text-sm text-neutral-500">{t('agentsHint')}</p>
        </div>

        {agents.length > 0 && (
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
            {agents.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <CircleDot className={`h-4 w-4 shrink-0 ${online(a) ? 'text-green-500' : 'text-neutral-300'}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.name}</p>
                  <p className="truncate text-xs text-neutral-400">
                    {online(a) ? t('online') : a.last_seen_at ? t('lastSeen', { when: new Date(a.last_seen_at).toLocaleString() }) : t('neverSeen')}
                    {a.platform ? ` · ${a.platform}` : ''}
                    {a.version ? ` · v${a.version}` : ''}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (!confirm(t('deleteAgentConfirm'))) return;
                    await deletePrintAgent(a.id);
                    router.refresh();
                  }}
                  className="rounded-lg p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                  title={t('delete')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {newAgent ? (
          <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
            <p className="font-semibold text-amber-900">{t('tokenTitle', { name: newAgent.name })}</p>
            <p className="text-amber-800">{t('tokenOnce')}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 select-all break-all rounded-lg bg-white px-2 py-1.5 font-mono text-xs">{newAgent.token}</code>
              <Button variant="secondary" onClick={copyToken} className="shrink-0 px-3">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">{t('platform')}</p>
              <div className="flex flex-wrap gap-1.5">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlatform(p)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      platform === p ? 'border-amber-900 bg-amber-900 text-white' : 'border-amber-300 bg-white text-amber-900'
                    }`}
                  >
                    {t(`platform_${p}`)}
                  </button>
                ))}
              </div>
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-amber-900">
              <li>
                {t(`step1_${platform}`)}
                {DOWNLOAD_URL && (
                  <>
                    {' '}
                    <a href={DOWNLOAD_URL} target="_blank" rel="noreferrer" className="underline">
                      {t('download')}
                    </a>
                  </>
                )}
                <ul className="mt-1 list-none space-y-0.5 pl-0 font-mono text-xs">
                  {FILES[platform].map((f, i) => (
                    <li key={f}>
                      {f}
                      <span className="ml-1 font-sans text-amber-700">{t(`file_${platform}_${i}`)}</span>
                    </li>
                  ))}
                </ul>
              </li>
              <li>
                {t(`step2_${platform}`)}
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-white px-2 py-1.5 font-mono text-xs">
                  {runCommand(platform, newAgent.token)}
                </pre>
                <p className="mt-1 rounded-lg bg-white/60 px-2 py-1.5 text-xs">{t(`warning_${platform}`)}</p>
              </li>
              <li>{t(`step3_${platform}`)}</li>
              <li>{t('step3')}</li>
            </ol>
            <Button variant="ghost" onClick={() => setNewAgent(null)} className="px-2 py-1 text-xs">
              {t('tokenDone')}
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder={t('agentNamePlaceholder')} />
            <Button onClick={addAgent} className="shrink-0">
              <Plus className="h-4 w-4" /> {t('addAgent')}
            </Button>
          </div>
        )}
      </Card>

      {/* ── Printers ───────────────────────────────────────────────────── */}
      <Card className="space-y-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <PrinterIcon className="h-4 w-4" /> {t('printers')}
          </h2>
          <p className="text-sm text-neutral-500">{t('printersHint')}</p>
        </div>

        {printers.length > 0 && (
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
            {printers.map((p) => {
              const tst = test?.printerId === p.id ? test : null;
              return (
                <li key={p.id} className="px-3 py-2.5 text-sm">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {p.name}
                        {!p.enabled && <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">{t('disabled')}</span>}
                      </p>
                      <p className="truncate text-xs text-neutral-400">
                        {p.kind === 'network' ? t('kind_network') : t('kind_system')} · {p.address} · {p.width === 32 ? '58 mm' : '80 mm'} ·{' '}
                        {p.roles.map((r) => t(`role_${r}`)).join(', ') || t('noRole')}
                        {p.roles.includes('kitchen') && p.stations.length > 0 ? ` (${p.stations.join(', ')})` : ''}
                        {p.has_drawer ? ` · ${t('drawer')}` : ''} · {agentName_(p.agent_id)}
                      </p>
                    </div>
                    <Button variant="secondary" onClick={() => runTest(p.id)} disabled={tst?.state === 'sending' || tst?.state === 'queued'} className="px-3 py-1.5 text-xs">
                      {t('test')}
                    </Button>
                    <button
                      onClick={() =>
                        setEditing({
                          id: p.id,
                          name: p.name,
                          kind: p.kind,
                          address: p.address,
                          width: p.width,
                          roles: p.roles,
                          stations: p.stations,
                          has_drawer: p.has_drawer,
                          cut: p.cut,
                          copies: p.copies,
                          enabled: p.enabled,
                          agent_id: p.agent_id,
                        })
                      }
                      className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
                      title={t('edit')}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(t('deletePrinterConfirm'))) return;
                        await deletePrinter(p.id);
                        router.refresh();
                      }}
                      className="rounded-lg p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                      title={t('delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {tst && (
                    <p
                      className={`mt-1 text-xs ${
                        tst.state === 'done' ? 'text-green-600' : tst.state === 'failed' ? 'text-red-600' : 'text-neutral-500'
                      }`}
                    >
                      {tst.state === 'sending' && t('testSending')}
                      {tst.state === 'queued' && t('testQueued')}
                      {tst.state === 'done' && t('testDone')}
                      {tst.state === 'failed' && `${t('testFailed')}${tst.error ? `: ${tst.error}` : ''}`}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {editing ? (
          <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <div>
              <Label>{t('printerName')}</Label>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder={t('printerNamePlaceholder')} />
            </div>
            <div>
              <Label>{t('connection')}</Label>
              <div className="grid grid-cols-2 gap-2">
                {(['network', 'system'] as PrinterKind[]).map((k) => (
                  <button key={k} type="button" onClick={() => setEditing({ ...editing, kind: k })} className={seg(editing.kind === k)}>
                    {t(`kind_${k}`)}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-neutral-400">{t(editing.kind === 'network' ? 'kindNetworkHint' : 'kindSystemHint')}</p>
            </div>
            <div>
              <Label>{editing.kind === 'network' ? t('address') : t('systemName')}</Label>
              <Input
                value={editing.address}
                onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                placeholder={editing.kind === 'network' ? '192.168.1.50:9100' : t('systemNamePlaceholder')}
              />
            </div>
            <div>
              <Label>{t('agent')}</Label>
              <select
                value={editing.agent_id ?? ''}
                onChange={(e) => setEditing({ ...editing, agent_id: e.target.value || null })}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="">{t('noAgent')}</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              {agents.length === 0 && <p className="mt-1 text-xs text-amber-600">{t('agentNeeded')}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('paper')}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {WIDTHS.map((w) => (
                    <button key={w} type="button" onClick={() => setEditing({ ...editing, width: w })} className={seg(editing.width === w)}>
                      {w === 32 ? '58 mm' : '80 mm'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>{t('copies')}</Label>
                <Input type="number" min={1} max={3} value={editing.copies} onChange={(e) => setEditing({ ...editing, copies: Number(e.target.value) || 1 })} />
              </div>
            </div>
            <div>
              <Label>{t('roles')}</Label>
              <div className="flex flex-wrap gap-2">
                {ROLES.map((r) => (
                  <button key={r} type="button" onClick={() => setEditing({ ...editing, roles: toggleIn(editing.roles, r) })} className={seg(editing.roles.includes(r))}>
                    {t(`role_${r}`)}
                  </button>
                ))}
              </div>
            </div>
            {editing.roles.includes('kitchen') && (
              <div>
                <Label>{t('stations')}</Label>
                <p className="mb-1 text-xs text-neutral-400">{t('stationsHint')}</p>
                <div className="flex flex-wrap gap-2">
                  {stations.map((s) => (
                    <button key={s} type="button" onClick={() => setEditing({ ...editing, stations: toggleIn(editing.stations, s) })} className={seg(editing.stations.includes(s))}>
                      {s}
                    </button>
                  ))}
                  {stations.length === 0 && <p className="text-xs text-neutral-400">{t('noStations')}</p>}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={editing.has_drawer} onChange={(e) => setEditing({ ...editing, has_drawer: e.target.checked })} className="h-4 w-4 rounded" />
                {t('hasDrawer')}
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={editing.cut} onChange={(e) => setEditing({ ...editing, cut: e.target.checked })} className="h-4 w-4 rounded" />
                {t('cut')}
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={editing.enabled} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} className="h-4 w-4 rounded" />
                {t('enabled')}
              </label>
            </div>
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving || !editing.address.trim()}>
                {t('save')}
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                {t('cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setEditing(empty(agents[0]?.id ?? null))}>
            <Plus className="h-4 w-4" /> {t('addPrinter')}
          </Button>
        )}
      </Card>

      {/* ── What prints by itself ──────────────────────────────────────── */}
      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">{t('behaviour')}</h2>
          <p className="text-sm text-neutral-500">{t('behaviourHint')}</p>
        </div>
        <div>
          <Label>{t('receiptMode')}</Label>
          <div className="grid grid-cols-3 gap-2">
            {(['ask', 'auto', 'off'] as const).map((m) => (
              <button key={m} type="button" onClick={() => set('print_receipt_mode', m)} className={seg(o.print_receipt_mode === m)}>
                {t(`receipt_${m}`)}
              </button>
            ))}
          </div>
        </div>
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="text-sm font-medium">{t('kitchenAuto')}</span>
          <input type="checkbox" checked={o.print_kitchen_auto} onChange={(e) => set('print_kitchen_auto', e.target.checked)} className="h-5 w-5 rounded border-neutral-300" />
        </label>
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="text-sm font-medium">{t('drawerCash')}</span>
          <input type="checkbox" checked={o.print_drawer_cash} onChange={(e) => set('print_drawer_cash', e.target.checked)} className="h-5 w-5 rounded border-neutral-300" />
        </label>
        <div>
          <Label>{t('footer')}</Label>
          <Textarea
            rows={3}
            defaultValue={o.receipt_footer ?? ''}
            placeholder={t('footerPlaceholder')}
            onBlur={(e) => set('receipt_footer', e.target.value.trim() || null)}
          />
        </div>
      </Card>
    </div>
  );
}
