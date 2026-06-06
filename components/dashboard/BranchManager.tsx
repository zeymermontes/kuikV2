'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Plus, Trash2, ExternalLink, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Branch, BranchMenuMode } from '@/lib/database.types';
import { Card, Label, Input, Button } from '@/components/ui';
import { HoursEditor } from '@/components/dashboard/HoursEditor';
import { createBranch, updateBranch, deleteBranch } from '@/app/(dashboard)/branches/actions';

export function BranchManager({ branches, baseUrl }: { branches: Branch[]; baseUrl: string }) {
  const t = useTranslations('branches');
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [address, setAddress] = useState('');
  const [menuMode, setMenuMode] = useState<BranchMenuMode>('shared');
  const [copyFrom, setCopyFrom] = useState('main');
  const [pending, start] = useTransition();

  function add() {
    if (!name.trim()) return;
    start(async () => {
      await createBranch({ name, whatsapp, address, menuMode, copyFrom: menuMode === 'independent' ? copyFrom : 'none' });
      setName('');
      setWhatsapp('');
      setAddress('');
      setMenuMode('shared');
      setCopyFrom('main');
    });
  }

  return (
    <div className="max-w-2xl space-y-5">
      {/* New branch */}
      <Card className="space-y-3">
        <h2 className="font-semibold">{t('addBranch')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>{t('name')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('namePlaceholder')} />
          </div>
          <div>
            <Label>{t('whatsapp')}</Label>
            <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="5215555555555" />
          </div>
        </div>
        <div>
          <Label>{t('address')}</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>{t('menuMode')}</Label>
            <select
              value={menuMode}
              onChange={(e) => setMenuMode(e.target.value as BranchMenuMode)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm"
            >
              <option value="shared">{t('shared')}</option>
              <option value="independent">{t('independent')}</option>
            </select>
          </div>
          {menuMode === 'independent' && (
            <div>
              <Label>{t('copyFrom')}</Label>
              <select
                value={copyFrom}
                onChange={(e) => setCopyFrom(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm"
              >
                <option value="none">{t('fromScratch')}</option>
                <option value="main">{t('fromMain')}</option>
                {branches
                  .filter((b) => b.menu_mode === 'independent')
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {t('fromBranch', { name: b.name })}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>
        <p className="text-xs text-neutral-400">
          {menuMode === 'shared' ? t('sharedHint') : t('independentHint')}
        </p>
        <Button onClick={add} disabled={pending || !name.trim()}>
          <Plus className="h-4 w-4" /> {t('add')}
        </Button>
      </Card>

      {/* Existing branches */}
      {branches.map((b) => (
        <Card key={b.id} className="space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold">{b.name}</h3>
              <span className="text-xs text-neutral-400">
                {b.menu_mode === 'independent' ? t('independent') : t('shared')}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <a
                href={`${baseUrl}/b/${b.slug}`}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 text-neutral-400 hover:text-neutral-700"
                title={t('viewBranch')}
              >
                <ExternalLink className="h-4 w-4" />
              </a>
              {b.menu_mode === 'independent' && (
                <Link
                  href={`/menu?branch=${b.id}`}
                  className="p-1.5 text-neutral-400 hover:text-neutral-700"
                  title={t('editMenu')}
                >
                  <Pencil className="h-4 w-4" />
                </Link>
              )}
              <button
                onClick={() => confirm(t('confirmDelete')) && start(async () => deleteBranch(b.id))}
                className="p-1.5 text-neutral-400 hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t('whatsapp')}</Label>
              <Input
                defaultValue={b.whatsapp_phone ?? ''}
                onBlur={(e) =>
                  start(async () => updateBranch(b.id, { whatsapp_phone: e.target.value.replace(/\D/g, '') || null }))
                }
              />
            </div>
            <div>
              <Label>{t('address')}</Label>
              <Input
                defaultValue={b.address ?? ''}
                onBlur={(e) => start(async () => updateBranch(b.id, { address: e.target.value || null }))}
              />
            </div>
          </div>
          <div>
            <Label>{t('hours')}</Label>
            <HoursEditor value={b.hours} onChange={(hours) => start(async () => updateBranch(b.id, { hours }))} />
          </div>
        </Card>
      ))}
    </div>
  );
}
