'use client';

import { useState, useTransition } from 'react';
import { KeyRound, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Employee, EmployeeRole } from '@/lib/database.types';
import { EMPLOYEE_ROLES, PERMS, ROLE_PERMS, can, initialsOf, type Perm } from '@/lib/employees';
import { Card, Input, Button } from '@/components/ui';
import { saveEmployee, deleteEmployee } from '@/app/(dashboard)/staff/actions';

type Draft = { id?: string; name: string; role: EmployeeRole; pin: string; perms: Record<string, boolean>; active: boolean; hasPin: boolean; clearPin: boolean };

const blank = (): Draft => ({ name: '', role: 'waiter', pin: '', perms: {}, active: true, hasPin: false, clearPin: false });

/** The restaurant's POS employees: who they are, their PIN and what they may do. */
export function EmployeesManager({ employees }: { employees: Employee[] }) {
  const t = useTranslations('staff');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function edit(e: Employee) {
    setError(null);
    setDraft({ id: e.id, name: e.name, role: e.role, pin: '', perms: { ...e.perms }, active: e.active, hasPin: !!e.pin_hash, clearPin: false });
  }

  function submit() {
    if (!draft) return;
    if (!draft.name.trim()) return setError(t('errName'));
    start(async () => {
      const res = await saveEmployee({
        id: draft.id,
        name: draft.name,
        role: draft.role,
        pin: draft.clearPin ? '' : draft.pin || undefined,
        perms: draft.perms,
        active: draft.active,
      });
      if (res.error === 'pin') return setError(t('errPin'));
      if (res.error === 'name') return setError(t('errName'));
      if (res.error) return setError(res.error);
      setDraft(null);
      setError(null);
    });
  }

  // A permission checkbox shows the role default until the person gets an override.
  const permOn = (d: Draft, p: Perm) => can({ role: d.role, perms: d.perms }, p);

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="font-semibold">{t('employees')}</h2>
        {!draft && (
          <Button onClick={() => setDraft(blank())} variant="secondary">
            <Plus className="h-4 w-4" /> {t('addEmployee')}
          </Button>
        )}
      </div>
      <p className="mb-4 text-sm text-neutral-500">{t('employeesHint')}</p>

      {draft && (
        <div className="mb-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">{t('empName')}</label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">{t('empRole')}</label>
              <select
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value as EmployeeRole, perms: {} })}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm"
              >
                {EMPLOYEE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`role_${r}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-neutral-600">{t('empPin')}</label>
              <div className="flex gap-2">
                <Input
                  inputMode="numeric"
                  pattern="\\d*"
                  maxLength={6}
                  value={draft.pin}
                  disabled={draft.clearPin}
                  onChange={(e) => setDraft({ ...draft, pin: e.target.value.replace(/\D/g, '') })}
                  placeholder={draft.hasPin ? '••••' : '1234'}
                  className="max-w-[10rem]"
                />
                {draft.hasPin && (
                  <label className="flex items-center gap-2 text-sm text-neutral-600">
                    <input type="checkbox" checked={draft.clearPin} onChange={(e) => setDraft({ ...draft, clearPin: e.target.checked, pin: '' })} />
                    {t('clearPin')}
                  </label>
                )}
              </div>
              {draft.hasPin && !draft.clearPin && <p className="mt-1 text-xs text-neutral-400">{t('empPinKeep')}</p>}
            </div>
            <div className="sm:col-span-2">
              <p className="mb-1 text-xs font-medium text-neutral-600">{t('empPerms')}</p>
              <p className="mb-2 text-xs text-neutral-400">{t('empPermsHint')}</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {PERMS.map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={permOn(draft, p)}
                      onChange={(e) => {
                        const next = { ...draft.perms };
                        // Back to the role default? Drop the override rather than pin it.
                        if (e.target.checked === ROLE_PERMS[draft.role][p]) delete next[p];
                        else next[p] = e.target.checked;
                        setDraft({ ...draft, perms: next });
                      }}
                    />
                    {t(`perm_${p}`)}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              {t('empActive')}
            </label>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex gap-2">
            <Button onClick={submit} disabled={pending}>
              {t('save')}
            </Button>
            <Button variant="secondary" onClick={() => setDraft(null)} disabled={pending}>
              {t('cancel')}
            </Button>
            {draft.id && (
              <button
                onClick={() => start(async () => {
                  await deleteEmployee(draft.id!);
                  setDraft(null);
                })}
                className="ml-auto flex items-center gap-1 text-sm text-red-600 hover:underline"
                disabled={pending}
              >
                <Trash2 className="h-4 w-4" /> {t('delete')}
              </button>
            )}
          </div>
        </div>
      )}

      {employees.length === 0 && !draft ? (
        <p className="py-6 text-center text-sm text-neutral-400">{t('noEmployees')}</p>
      ) : (
        <div className="divide-y divide-neutral-100">
          {employees.map((e) => (
            <div key={e.id} className={`flex items-center gap-3 py-2.5 ${e.active ? '' : 'opacity-50'}`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-600">
                {initialsOf(e.name) || <UserRound className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.name}</p>
                <p className="flex items-center gap-2 text-xs text-neutral-400">
                  {t(`role_${e.role}`)}
                  <span className="inline-flex items-center gap-1">
                    <KeyRound className="h-3 w-3" /> {e.pin_hash ? t('empPinSet') : t('empNoPin')}
                  </span>
                  {!e.active && <span>{t('empInactive')}</span>}
                </p>
              </div>
              <button onClick={() => edit(e)} className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800" aria-label={t('save')}>
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
