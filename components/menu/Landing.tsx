'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Star,
  MapPin,
  MessageCircle,
  Wifi,
  Check,
  UtensilsCrossed,
  Camera,
  Share2,
  Globe,
  ChevronRight,
  CalendarCheck,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type {
  Tenant,
  TenantTheme,
  TenantContact,
  TenantOrdering,
  TenantLanding,
  Product,
} from '@/lib/database.types';
import { resolveMenuSettings } from '@/lib/menu-settings';
import { formatPrice } from '@/lib/utils';
import { ReservationSheet } from './ReservationSheet';

export function Landing({
  tenant,
  theme,
  contact,
  ordering,
  landing,
  featured,
}: {
  tenant: Tenant;
  theme: TenantTheme;
  contact: TenantContact;
  ordering: TenantOrdering;
  landing: TenantLanding;
  featured: Product[];
}) {
  const t = useTranslations('menu');
  const settings = resolveMenuSettings(theme.settings);
  const currency = settings.currency;
  const locale = tenant.locale === 'en' ? 'en-US' : 'es-MX';
  const showPrice = theme.show_prices;
  const [wifiCopied, setWifiCopied] = useState(false);
  const [showReserve, setShowReserve] = useState(false);
  const waDigits = contact.whatsapp_phone?.replace(/\D/g, '');

  function copyWifi() {
    if (!landing.wifi_password) return;
    navigator.clipboard?.writeText(landing.wifi_password).then(() => {
      setWifiCopied(true);
      setTimeout(() => setWifiCopied(false), 2000);
    });
  }

  const quickActions = [
    { key: 'menu', icon: UtensilsCrossed, label: t('viewMenu'), href: '/menu' },
    contact.address && {
      key: 'loc',
      icon: MapPin,
      label: t('location'),
      href: `https://maps.google.com/?q=${encodeURIComponent(contact.address)}`,
      external: true,
    },
    waDigits && {
      key: 'wa',
      icon: MessageCircle,
      label: 'WhatsApp',
      href: `https://wa.me/${waDigits}`,
      external: true,
    },
    contact.instagram && {
      key: 'ig',
      icon: Camera,
      label: 'Instagram',
      href: `https://instagram.com/${contact.instagram.replace(/^@/, '')}`,
      external: true,
    },
    contact.facebook && { key: 'fb', icon: Share2, label: 'Facebook', href: contact.facebook, external: true },
    contact.website && { key: 'web', icon: Globe, label: t('website'), href: contact.website, external: true },
  ].filter(Boolean) as {
    key: string;
    icon: typeof MapPin;
    label: string;
    href: string;
    external?: boolean;
  }[];

  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl pb-12">
      {/* Hero */}
      <section className="relative">
        {theme.cover_image_url && (
          <div className="relative h-56 w-full overflow-hidden sm:h-72">
            <Image src={theme.cover_image_url} alt={tenant.name} fill className="object-cover" priority />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
          </div>
        )}
        <div
          className={`flex flex-col items-center px-5 text-center ${
            theme.cover_image_url ? '-mt-14' : 'pt-10'
          }`}
        >
          {theme.logo_url && (
            <Image
              src={theme.logo_url}
              alt={tenant.name}
              width={104}
              height={104}
              className="h-24 w-24 rounded-full object-cover shadow-lg ring-4 ring-[var(--brand-bg)]"
            />
          )}
          <h1 className="mt-3 text-2xl font-extrabold" style={{ color: 'var(--brand-text)' }}>
            {landing.welcome_title || tenant.name}
          </h1>
          {(landing.tagline || theme.slogan) && (
            <p className="mt-1 text-sm opacity-70">{landing.tagline || theme.slogan}</p>
          )}

          {landing.show_rating && landing.rating != null && (
            <a
              href={landing.reviews_url || undefined}
              target={landing.reviews_url ? '_blank' : undefined}
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold"
              style={{ backgroundColor: 'var(--brand-surface)' }}
            >
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              {landing.rating.toFixed(1)}
            </a>
          )}
        </div>
      </section>

      {/* Service / primary CTA */}
      <div className="mt-6 flex flex-wrap justify-center gap-2 px-5">
        {ordering.ordering_enabled && ordering.service_types.length > 0 ? (
          ordering.service_types.map((s) => (
            <Link
              key={s}
              href="/menu"
              className="rounded-full px-5 py-2.5 text-sm font-semibold text-white"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {t(`service_${s}`)}
            </Link>
          ))
        ) : (
          <Link
            href="/menu"
            className="rounded-full px-6 py-3 text-sm font-semibold text-white"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {t('viewMenu')}
          </Link>
        )}
      </div>

      {contact.reservations_enabled && (
        <div className="mt-3 px-5">
          <button
            onClick={() => setShowReserve(true)}
            className="flex w-full items-center justify-center gap-2 rounded-full border py-3 text-sm font-semibold"
            style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text)' }}
          >
            <CalendarCheck className="h-4 w-4" /> {t('reserve')}
          </button>
        </div>
      )}

      {/* Featured / most ordered */}
      {featured.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 px-5 text-lg font-bold" style={{ color: 'var(--brand-secondary)' }}>
            {t('mostOrdered')}
          </h2>
          <div className="no-scrollbar flex gap-3 overflow-x-auto px-5 pb-2">
            {featured.map((p) => (
              <Link
                key={p.id}
                href={`/menu?product=${p.id}`}
                className="flex w-40 shrink-0 flex-col overflow-hidden rounded-2xl"
                style={{ backgroundColor: 'var(--brand-surface)' }}
              >
                {p.image_url ? (
                  <div className="relative aspect-square w-full">
                    <Image src={p.image_url} alt={p.name} fill className="object-cover" />
                  </div>
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center opacity-30">
                    <UtensilsCrossed className="h-8 w-8" />
                  </div>
                )}
                <div className="p-2.5">
                  <p className="line-clamp-1 text-sm font-semibold">{p.name}</p>
                  {showPrice && p.show_price && p.price != null && (
                    <p className="text-sm font-semibold" style={{ color: 'var(--brand-primary)' }}>
                      {formatPrice(p.price, currency, locale)}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Quick actions */}
      <section className="mt-8 grid grid-cols-2 gap-3 px-5 sm:grid-cols-3">
        {quickActions.map((a) => {
          const Icon = a.icon;
          const inner = (
            <>
              <Icon className="h-5 w-5" style={{ color: 'var(--brand-primary)' }} />
              <span className="text-sm font-medium">{a.label}</span>
              <ChevronRight className="ml-auto h-4 w-4 opacity-30" />
            </>
          );
          const cls = 'flex items-center gap-3 rounded-2xl px-4 py-3';
          const style = { backgroundColor: 'var(--brand-surface)' };
          return a.external ? (
            <a key={a.key} href={a.href} target="_blank" rel="noreferrer" className={cls} style={style}>
              {inner}
            </a>
          ) : (
            <Link key={a.key} href={a.href} className={cls} style={style}>
              {inner}
            </Link>
          );
        })}

        {landing.wifi_password && (
          <button onClick={copyWifi} className="flex items-center gap-3 rounded-2xl px-4 py-3 text-left" style={{ backgroundColor: 'var(--brand-surface)' }}>
            {wifiCopied ? (
              <Check className="h-5 w-5 text-green-500" />
            ) : (
              <Wifi className="h-5 w-5" style={{ color: 'var(--brand-primary)' }} />
            )}
            <span className="text-sm font-medium">{wifiCopied ? t('wifiCopied') : t('wifi')}</span>
          </button>
        )}
      </section>

      {/* Full menu CTA */}
      <div className="mt-8 px-5">
        <Link
          href="/menu"
          className="flex items-center justify-center gap-2 rounded-full py-3.5 text-center font-semibold text-white"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {t('viewFullMenu')}
          <ChevronRight className="h-5 w-5" />
        </Link>
      </div>

      {showReserve && (
        <ReservationSheet tenantId={tenant.id} required={contact.reservation_required} onClose={() => setShowReserve(false)} />
      )}
    </div>
  );
}
