'use client';

import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Category } from '@/lib/database.types';
import { Input, Label, Button } from '@/components/ui';
import { ImageUploader } from '@/components/dashboard/ImageUploader';
import { Drawer } from './Drawer';
import { updateCategory, deleteCategory } from '@/app/(dashboard)/menu/actions';

export function CategoryDrawer({
  tenantId,
  category,
  onClose,
}: {
  tenantId: string;
  category: Category;
  onClose: () => void;
}) {
  const t = useTranslations('menuEditor');
  const tc = useTranslations('common');

  return (
    <Drawer
      title={category.name}
      onClose={onClose}
      footer={
        <button
          onClick={() => {
            if (confirm('¿Eliminar categoría?')) {
              deleteCategory(category.id);
              onClose();
            }
          }}
          className="flex items-center gap-1 text-sm text-neutral-400 hover:text-red-500"
        >
          <Trash2 className="h-4 w-4" /> {tc('delete')}
        </button>
      }
    >
      <div className="space-y-5">
        <div>
          <Label>{t('categoryName')}</Label>
          <Input
            key={category.name}
            defaultValue={category.name}
            onBlur={(e) =>
              e.target.value !== category.name &&
              updateCategory(category.id, { name: e.target.value })
            }
          />
        </div>

        <div>
          <Label>{t('station')}</Label>
          <Input
            defaultValue={category.station ?? ''}
            placeholder={t('stationHint')}
            onBlur={(e) => updateCategory(category.id, { station: e.target.value.trim() || null })}
          />
        </div>

        {/* Tab icon / image */}
        <div className="rounded-xl bg-neutral-50 p-3">
          <p className="mb-2 text-xs font-medium text-neutral-500">{t('tabIcon')}</p>
          <div className="flex items-start gap-3">
            <div className="w-20">
              <Input
                defaultValue={category.icon ?? ''}
                placeholder="🌮"
                maxLength={4}
                onBlur={(e) => updateCategory(category.id, { icon: e.target.value || null })}
                className="text-center text-xl"
              />
              <p className="mt-1 text-center text-[10px] text-neutral-400">{t('emoji')}</p>
            </div>
            <div className="flex-1">
              <ImageUploader
                value={category.icon_image_url}
                tenantId={tenantId}
                folder="icons"
                shape="square"
                onChange={(url) => updateCategory(category.id, { icon_image_url: url })}
              />
              <p className="mt-1 text-[10px] text-neutral-400">{t('tabIconHint')}</p>
            </div>
          </div>
        </div>

        {/* Section banner */}
        <div className="rounded-xl bg-neutral-50 p-3">
          <p className="mb-2 text-xs font-medium text-neutral-500">{t('banner')}</p>
          <Input
            defaultValue={category.banner_name ?? ''}
            placeholder={t('bannerName')}
            onBlur={(e) => updateCategory(category.id, { banner_name: e.target.value || null })}
            className="mb-3"
          />
          <ImageUploader
            value={category.banner_image_url}
            tenantId={tenantId}
            folder="banners"
            shape="wide"
            onChange={(url) => updateCategory(category.id, { banner_image_url: url })}
          />
        </div>

        <Button variant="secondary" className="w-full" onClick={onClose}>
          {tc('save')}
        </Button>
      </div>
    </Drawer>
  );
}
