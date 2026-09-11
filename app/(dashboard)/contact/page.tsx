import { getTranslations } from 'next-intl/server';
import { requireOwner } from '@/lib/auth';
import { ContactForm } from '@/components/dashboard/ContactForm';
import { JumpToSetting } from '@/components/dashboard/JumpToSetting';
import { PixelSettings } from '@/components/dashboard/PixelSettings';
import { updateMetaPixelId } from '@/app/(dashboard)/settings-actions';

export default async function ContactPage() {
  const { tenant, contact } = await requireOwner();
  const t = await getTranslations('contact');

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{t('title')}</h1>
      <ContactForm contact={contact} />
      <div className="mt-6">
        <PixelSettings
          initial={tenant.meta_pixel_id}
          save={updateMetaPixelId}
          labels={{ title: t('pixelTitle'), hint: t('pixelHint'), label: t('pixelTitle'), save: t('pixelSave'), saved: t('pixelSaved'), invalid: t('pixelInvalid'), failed: t('pixelFailed') }}
        />
      </div>
      <JumpToSetting />
    </div>
  );
}
