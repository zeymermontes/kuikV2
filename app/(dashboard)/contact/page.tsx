import { getTranslations } from 'next-intl/server';
import { requireOwner } from '@/lib/auth';
import { ContactForm } from '@/components/dashboard/ContactForm';

export default async function ContactPage() {
  const { contact } = await requireOwner();
  const t = await getTranslations('contact');

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{t('title')}</h1>
      <ContactForm contact={contact} />
    </div>
  );
}
