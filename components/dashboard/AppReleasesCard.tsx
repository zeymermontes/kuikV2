'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import type { AppReleases, ReleaseKey } from '@/lib/apps/releases';
import { Button, Card, Input } from '@/components/ui';
import { setAppMinVersion } from '@/app/(dashboard)/admin/actions';

const NAMES: Record<ReleaseKey, string> = { kuik: 'Kuik (teléfono)', terminal: 'Kuik Terminal (tablet)', desktop: 'Kuik Caja (PC)' };
const ORDER: ReleaseKey[] = ['terminal', 'kuik', 'desktop'];

/**
 * Super-admin view of the native apps' release feed: what is published and
 * the oldest build each app may still run. The scripts under native/scripts
 * publish builds; this is where a minimum is raised or lifted between them.
 */
export function AppReleasesCard({ releases }: { releases: AppReleases }) {
  const t = useTranslations('superAdmin');
  return (
    <Card>
      <h2 className="text-lg font-semibold">{t('apps')}</h2>
      <p className="mt-1 text-sm text-neutral-500">{t('appsHint')}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-neutral-100 text-xs uppercase text-neutral-400">
            <tr>
              <th className="py-2 pr-4">{t('appsApp')}</th>
              <th className="py-2 pr-4">{t('appsLatest')}</th>
              <th className="py-2">{t('appsMin')}</th>
            </tr>
          </thead>
          <tbody>
            {ORDER.map((key) => (
              <ReleaseRow key={key} app={key} release={releases[key] ?? null} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ReleaseRow({ app, release }: { app: ReleaseKey; release: { version: string; minVersion: string | null; publishedAt?: string; android?: { publishedAt: string } | null } | null }) {
  const t = useTranslations('superAdmin');
  const [value, setValue] = useState(release?.minVersion ?? '');
  const [state, setState] = useState<'idle' | 'saved' | string>('idle');
  const [pending, startTransition] = useTransition();

  function save(next: string) {
    setState('idle');
    startTransition(async () => {
      const res = await setAppMinVersion(app, next.trim() === '' ? null : next.trim());
      if (res.error) setState(res.error);
      else {
        setValue(next.trim());
        setState('saved');
      }
    });
  }

  const published = release?.publishedAt ?? release?.android?.publishedAt;
  const date = published ? new Date(published).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : null;

  return (
    <tr className="border-b border-neutral-50 align-top last:border-0">
      <td className="py-3 pr-4 font-medium">{NAMES[app]}</td>
      <td className="py-3 pr-4 text-neutral-600">
        {release ? (
          <>
            v{release.version}
            {date && <span className="text-neutral-400"> · {date}</span>}
          </>
        ) : (
          <span className="text-neutral-400">{t('appsNotPublished')}</span>
        )}
      </td>
      <td className="py-3">
        {release && (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              data-setting={t('appsMin')}
              placeholder={t('appsMinNone')}
              inputMode="decimal"
              className="w-28"
              aria-label={t('appsMin')}
            />
            <Button variant="secondary" disabled={pending} onClick={() => save(value)}>
              {t('appsSave')}
            </Button>
            <button
              type="button"
              disabled={pending || value === release.version}
              onClick={() => save(release.version)}
              className="text-xs font-medium text-neutral-500 underline-offset-2 hover:underline disabled:opacity-40"
            >
              {t('appsRequireLatest')}
            </button>
            <button
              type="button"
              disabled={pending || value === ''}
              onClick={() => save('')}
              className="text-xs font-medium text-neutral-500 underline-offset-2 hover:underline disabled:opacity-40"
            >
              {t('appsAllowAll')}
            </button>
            {state === 'saved' && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <Check className="h-3.5 w-3.5" /> {t('appsSaved')}
              </span>
            )}
            {state !== 'idle' && state !== 'saved' && <span className="text-xs text-red-600">{t(`appsErr_${state}`)}</span>}
          </div>
        )}
      </td>
    </tr>
  );
}
