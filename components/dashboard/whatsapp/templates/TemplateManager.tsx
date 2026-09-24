'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff, ExternalLink, Loader2, Pencil, Plus, RefreshCw, Send, Trash2, X } from 'lucide-react';
import { Button, Card, Field, Input, Textarea } from '@/components/ui';
import { WaTemplatePreview } from '@/components/whatsapp/WaTemplatePreview';
import {
  createTemplateAction,
  deleteTemplateAction,
  editTemplateAction,
  listTemplatesAction,
  submitDraftAction,
  type LocalDraftRow,
} from '@/app/(dashboard)/whatsapp/templates/actions';
import {
  BODY_MAX,
  BUTTONS_MAX,
  BUTTON_TEXT_MAX,
  BUTTON_TYPES,
  EMPTY_DRAFT,
  TEMPLATE_CATEGORIES,
  TEMPLATE_LANGS,
  extractVars,
  isEditableInApp,
  normalizeTemplateName,
  renderPreview,
  rowToDraft,
  statusTone,
  templateParts,
  uniqueVars,
  validateTemplate,
  type MetaTemplateRow,
  type TemplateButton,
  type TemplateDraft,
} from '@/lib/whatsapp/template-rules';

const META_MANAGER = 'https://business.facebook.com/wa/manage/message-templates/';

const TONE: Record<ReturnType<typeof statusTone>, string> = {
  green: 'bg-emerald-100 text-emerald-800',
  blue: 'bg-blue-100 text-blue-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
  gray: 'bg-neutral-100 text-neutral-700',
};

/**
 * The Meta templates manager: a builder with live validation and preview on
 * the left, the account's templates on the right. Everything it writes goes
 * to the same WABA the chat sends from.
 */
export function TemplateManager({
  initialMeta,
  initialDrafts,
  initialError,
}: {
  initialMeta: MetaTemplateRow[];
  initialDrafts: LocalDraftRow[];
  initialError: string | null;
}) {
  const t = useTranslations('whatsapp.templates');
  const [draft, setDraft] = useState<TemplateDraft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<{ id: string; status: string } | null>(null);
  const [list, setList] = useState<MetaTemplateRow[]>(initialMeta);
  const [drafts, setDrafts] = useState<LocalDraftRow[]>(initialDrafts);
  const [listError, setListError] = useState<string | null>(initialError);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [refreshing, startRefresh] = useTransition();

  const issues = useMemo(() => validateTemplate(draft), [draft]);
  const bodyVars = uniqueVars(draft.body);
  const headerVar = extractVars(draft.header).length === 1;

  const set = <K extends keyof TemplateDraft>(k: K, v: TemplateDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setExample = (k: string, v: string) => setDraft((d) => ({ ...d, examples: { ...d.examples, [k]: v } }));
  const setButton = (i: number, patch: Partial<TemplateButton>) =>
    setDraft((d) => ({ ...d, buttons: (d.buttons ?? []).map((b, j) => (j === i ? { ...b, ...patch } : b)) }));

  function addVariable() {
    const next = bodyVars.length + 1;
    const sep = draft.body && !/\s$/.test(draft.body) ? ' ' : '';
    set('body', `${draft.body}${sep}{{${next}}}`);
  }

  function refresh() {
    startRefresh(async () => {
      const r = await listTemplatesAction();
      if (!r.ok) {
        setListError(r.error);
        return;
      }
      setListError(null);
      setList(r.data.meta);
      setDrafts(r.data.drafts);
    });
  }

  function errorText(error: string): string {
    if (error === 'no_official_session') return t('errNoSession');
    if (error === 'not_editable') return t('errNotEditable');
    if (error.startsWith('invalid:')) return t('errInvalid', { issue: t(`issues.${error.slice(8)}`, { n: 0, i: 0, max: 0, expected: 0 }) });
    return error;
  }

  function submit() {
    if (issues.length || pending) return;
    setNote(null);
    start(async () => {
      const r = editing ? await editTemplateAction(editing, draft) : await createTemplateAction(draft);
      if (!r.ok) {
        setNote({ ok: false, text: errorText(r.error) });
        return;
      }
      setNote({ ok: true, text: editing ? t('updated') : t('sentForReview') });
      setDraft(EMPTY_DRAFT);
      setEditing(null);
      refresh();
    });
  }

  function startEdit(row: MetaTemplateRow) {
    setDraft(rowToDraft(row));
    setEditing({ id: row.id, status: row.status });
    setNote(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setDraft(EMPTY_DRAFT);
    setEditing(null);
  }

  function remove(row: MetaTemplateRow) {
    if (!confirm(t('deleteConfirm', { name: row.name }))) return;
    start(async () => {
      const r = await deleteTemplateAction(row.name);
      if (!r.ok) {
        setNote({ ok: false, text: errorText(r.error) });
        return;
      }
      setList((cur) => cur.filter((x) => x.name !== row.name));
    });
  }

  function submitDraft(d: LocalDraftRow) {
    start(async () => {
      const r = await submitDraftAction(d.name, d.language);
      if (!r.ok) {
        setNote({ ok: false, text: errorText(r.error) });
        return;
      }
      setNote({ ok: true, text: t('sentForReview') });
      refresh();
    });
  }

  const preview = {
    header: draft.header.trim() ? renderPreview(draft.header, draft.examples, true) : null,
    body: renderPreview(draft.body, draft.examples),
    footer: draft.footer.trim() || null,
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Builder */}
      <Card>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="font-semibold">{editing ? t('editTitle', { name: draft.name }) : t('builderTitle')}</h2>
          {editing && (
            <button onClick={cancelEdit} className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800">
              <X className="h-3.5 w-3.5" /> {t('cancelEdit')}
            </button>
          )}
        </div>

        <Field label={t('name')} hint={t('nameHint')}>
          <Input value={draft.name} onChange={(e) => set('name', normalizeTemplateName(e.target.value))} placeholder={t('namePh')} disabled={!!editing} className="font-mono" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('category')}>
            <select value={draft.category} onChange={(e) => set('category', e.target.value as TemplateDraft['category'])} className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm">
              {TEMPLATE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{t(`cat_${c}`)}</option>
              ))}
            </select>
          </Field>
          <Field label={t('language')}>
            <select value={draft.language} onChange={(e) => set('language', e.target.value)} disabled={!!editing} className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm disabled:opacity-60">
              {TEMPLATE_LANGS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label={t('header')} hint={t('headerHint')}>
          <Input value={draft.header} onChange={(e) => set('header', e.target.value)} placeholder={t('headerPh')} maxLength={80} />
        </Field>

        <Field label={t('body')}>
          <Textarea value={draft.body} onChange={(e) => set('body', e.target.value)} rows={5} placeholder={t('bodyPh')} />
          <div className="mt-1 flex items-center justify-between text-xs text-neutral-500">
            <button type="button" onClick={addVariable} className="inline-flex items-center gap-1 font-medium text-neutral-800 hover:underline">
              <Plus className="h-3.5 w-3.5" /> {t('addVariable')}
            </button>
            <span className={draft.body.length > BODY_MAX ? 'text-red-600' : ''}>{draft.body.length}/{BODY_MAX}</span>
          </div>
        </Field>

        <Field label={t('footer')} hint={t('footerHint')}>
          <Input value={draft.footer} onChange={(e) => set('footer', e.target.value)} placeholder={t('footerPh')} maxLength={80} />
        </Field>

        {(bodyVars.length > 0 || headerVar) && (
          <div className="mb-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <p className="mb-2 text-sm font-medium text-neutral-700">{t('examples')}</p>
            <p className="mb-2 text-xs text-neutral-500">{t('examplesHint')}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {headerVar && (
                <Input value={draft.examples.header ?? ''} onChange={(e) => setExample('header', e.target.value)} placeholder={t('exampleHeader')} />
              )}
              {bodyVars.map((n) => (
                <Input key={n} value={draft.examples[String(n)] ?? ''} onChange={(e) => setExample(String(n), e.target.value)} placeholder={t('exampleN', { n })} />
              ))}
            </div>
          </div>
        )}

        <div className="mb-4">
          <p className="mb-1.5 text-sm font-medium text-neutral-700">{t('buttons')}</p>
          <div className="space-y-2">
            {(draft.buttons ?? []).map((b, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 p-2">
                <select value={b.type} onChange={(e) => setButton(i, { type: e.target.value as TemplateButton['type'] })} className="rounded-lg border border-neutral-300 px-2 py-2 text-xs">
                  {BUTTON_TYPES.map((bt) => (
                    <option key={bt} value={bt}>{t(`btn_${bt}`)}</option>
                  ))}
                </select>
                <Input value={b.text} onChange={(e) => setButton(i, { text: e.target.value })} placeholder={t('buttonText')} maxLength={BUTTON_TEXT_MAX} className="!w-40 !py-2 text-xs" />
                {b.type === 'URL' && <Input value={b.url ?? ''} onChange={(e) => setButton(i, { url: e.target.value })} placeholder={t('buttonUrl')} className="!min-w-[12rem] !flex-1 !py-2 text-xs" />}
                {b.type === 'PHONE_NUMBER' && <Input value={b.phone ?? ''} onChange={(e) => setButton(i, { phone: e.target.value })} placeholder={t('buttonPhone')} className="!w-44 !py-2 text-xs" />}
                <button type="button" onClick={() => set('buttons', (draft.buttons ?? []).filter((_, j) => j !== i))} className="ml-auto rounded p-1 text-neutral-400 hover:text-red-600" aria-label={t('removeButton')}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          {(draft.buttons ?? []).length < BUTTONS_MAX && (
            <button type="button" onClick={() => set('buttons', [...(draft.buttons ?? []), { type: 'QUICK_REPLY', text: '' }])} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-neutral-800 hover:underline">
              <Plus className="h-3.5 w-3.5" /> {t('addButton')}
            </button>
          )}
          {(draft.buttons ?? []).some((b) => b.type === 'QUICK_REPLY') && <p className="mt-2 text-xs text-neutral-500">{t('quickReplyNote')}</p>}
        </div>

        {issues.length > 0 && (
          <ul className="mb-4 space-y-1 text-xs text-red-700">
            {issues.map((i, k) => (
              <li key={k}>⛔ {t(`issues.${i.key}`, { n: 0, i: 0, max: 0, expected: 0, ...i.values })}</li>
            ))}
          </ul>
        )}

        {note && <p className={`mb-3 text-sm ${note.ok ? 'text-emerald-700' : 'text-red-700'}`}>{note.text}</p>}

        <Button onClick={submit} disabled={issues.length > 0 || pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {editing ? t('save') : t('create')}
        </Button>
      </Card>

      <div className="space-y-5">
        {/* Preview */}
        <Card>
          <h2 className="mb-3 font-semibold">{t('preview')}</h2>
          <WaTemplatePreview header={preview.header} body={preview.body} footer={preview.footer} buttons={draft.buttons} emptyLabel={t('previewEmpty')} />
        </Card>

        {/* Kuik's drafts */}
        {drafts.length > 0 && (
          <Card>
            <h2 className="mb-1 font-semibold">{t('draftsTitle')}</h2>
            <p className="mb-3 text-xs text-neutral-500">{t('draftsHint')}</p>
            <ul className="space-y-2">
              {drafts.map((d) => (
                <li key={`${d.name}|${d.language}`} className="rounded-xl border border-neutral-200 p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-xs font-semibold">{d.name}</span>
                    <span className="text-[11px] text-neutral-500">{d.category} · {d.language}</span>
                  </div>
                  <p className="mb-2 whitespace-pre-wrap text-xs text-neutral-600">{d.body}</p>
                  <Button variant="secondary" className="!px-3 !py-1.5 text-xs" onClick={() => submitDraft(d)} disabled={pending}>
                    <Send className="h-3.5 w-3.5" /> {t('submitDraft')}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Account list */}
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold">{t('listTitle')}</h2>
            <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={refresh} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} {t('refresh')}
            </Button>
          </div>
          {listError && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{errorText(listError)}</p>}
          {!listError && list.length === 0 && <p className="text-sm text-neutral-500">{t('empty')}</p>}
          <ul className="space-y-2">
            {list.map((row) => {
              const parts = templateParts(row.components);
              const open = openRow === row.id;
              return (
                <li key={row.id} className="rounded-xl border border-neutral-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-mono text-xs font-semibold">{row.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONE[statusTone(row.status)]}`}>{row.status}</span>
                    <span className="text-[11px] text-neutral-500">{row.category} · {row.language}</span>
                    <span className="ml-auto flex items-center gap-1">
                      <button onClick={() => setOpenRow(open ? null : row.id)} className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100" aria-label={t('preview')}>
                        {open ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      {isEditableInApp(row.status) ? (
                        <button onClick={() => startEdit(row)} className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100" aria-label={t('edit')}>
                          <Pencil className="h-4 w-4" />
                        </button>
                      ) : (
                        <a href={META_MANAGER} target="_blank" rel="noreferrer" className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100" aria-label={t('metaManager')} title={t('metaManager')}>
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      <button onClick={() => remove(row)} className="rounded p-1.5 text-neutral-500 hover:bg-red-50 hover:text-red-600" aria-label={t('delete')}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  </div>
                  {row.status === 'REJECTED' && row.rejected_reason && <p className="mt-1 text-xs text-red-700">{row.rejected_reason}</p>}
                  {open && (
                    <div className="mt-3">
                      <WaTemplatePreview header={parts.header || null} mediaHeader={parts.mediaHeader} body={parts.body} footer={parts.footer || null} buttons={parts.buttons} mediaLabel={t('mediaHeader')} />
                      {parts.unsupportedButtons > 0 && <p className="mt-2 text-xs text-amber-700">{t('unsupported')}</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
