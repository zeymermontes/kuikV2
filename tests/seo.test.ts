import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/** Every key of `expected` must match in `actual` (extra keys are fine). */
function includesObject(actual: unknown, expected: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(expected)) assert.deepEqual((actual as Record<string, unknown>)[k], v, k);
}
import { clampText, faqJsonLd, openingHoursJsonLd, restaurantJsonLd, softwareJsonLd, telephoneFor, tenantDescription, tenantOrigin } from '../lib/seo';
import type { FullTenant, MenuCategory } from '../lib/database.types';

function tenant(over: Partial<FullTenant['tenant']> = {}, contact: Partial<FullTenant['contact']> = {}): FullTenant {
  return {
    tenant: {
      id: 't1', owner_id: 'u', name: 'Kavaa', subdomain: 'kavaa', custom_domain: null, custom_domain_status: 'none',
      locale: 'es', timezone: 'America/Mexico_City', country_iso: 'MX', is_published: true, created_at: '', updated_at: '', ...over,
    },
    theme: { slogan: 'matcha & coffee', logo_url: 'https://x/logo.png', cover_image_url: null, show_prices: true, settings: {} } as FullTenant['theme'],
    contact: {
      whatsapp_phone: '+52 1 33 1234 5678', address: 'Av. Chapultepec 123, Guadalajara', maps_url: null, hours: null, reservations_enabled: true,
      instagram: '@kavaa', facebook: null, website: null, email: null, ...contact,
    } as FullTenant['contact'],
    ordering: { ordering_enabled: true } as FullTenant['ordering'],
    landing: { tagline: null } as FullTenant['landing'],
    loyalty: {} as FullTenant['loyalty'],
    plan: 'basic',
    branches: [],
    promotions: [],
  };
}

describe('clampText', () => {
  it('leaves short text alone and cuts long text at a word', () => {
    assert.equal(clampText('Hola mundo'), 'Hola mundo');
    const long = clampText('palabra '.repeat(40), 50);
    assert.ok(long.length <= 50);
    assert.equal(long.endsWith('…'), true);
    assert.doesNotMatch(long, /palab…$/);
  });
});

describe('tenantDescription', () => {
  it('says what, where and how to order, within meta length', () => {
    const d = tenantDescription(tenant(), 'es');
    assert.ok(d.includes('Menú de Kavaa'));
    assert.ok(d.includes('matcha & coffee'));
    assert.ok(d.includes('Guadalajara'));
    assert.ok(d.includes('pide por WhatsApp o reserva en línea'));
    assert.ok(d.length <= 158);
  });
  it('speaks English for an English menu', () => {
    assert.match(tenantDescription(tenant({ locale: 'en' }), 'en') as string, /^Kavaa menu/);
  });
});

describe('tenantOrigin', () => {
  it('prefers a verified custom domain and ignores an unverified one', () => {
    // The protocol follows the environment (http on localhost), the host is what matters here.
    assert.match(tenantOrigin(tenant({ custom_domain: 'kavaa.mx', custom_domain_status: 'verified' })), /^https?:\/\/kavaa\.mx$/);
    assert.match(tenantOrigin(tenant({ custom_domain: 'kavaa.mx', custom_domain_status: 'pending' })) as string, /^https?:\/\/kavaa\./);
    assert.doesNotMatch(tenantOrigin(tenant({ custom_domain: 'kavaa.mx', custom_domain_status: 'pending' })), /kavaa\.mx$/);
  });
});

describe('openingHoursJsonLd', () => {
  it('merges days with the same hours and drops closed days', () => {
    const week = [
      ...Array(5).fill({ closed: false, open: '09:00', close: '18:00' }),
      { closed: false, open: '10:00', close: '14:00' },
      { closed: true, open: '09:00', close: '18:00' },
    ];
    const spec = openingHoursJsonLd(week);
    assert.equal((spec).length, 2);
    includesObject(spec[0], { dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '18:00' });
    includesObject(spec[1], { dayOfWeek: ['Saturday'] });
  });
  it('returns nothing for unset hours', () => {
    assert.deepEqual(openingHoursJsonLd(null), []);
  });
});

describe('telephoneFor', () => {
  it('normalises to +digits and rejects junk', () => {
    assert.equal(telephoneFor('+52 (33) 1234-5678'), '+523312345678');
    assert.equal(telephoneFor('12345'), null);
    assert.equal(telephoneFor(null), null);
  });
});

describe('restaurantJsonLd', () => {
  const menu: MenuCategory[] = [
    {
      id: 'c1', name: 'Matcha', entries: [
        { kind: 'product', id: 'p1', name: 'Matcha latte', description: 'Iced', price: 140, show_price: true, is_available: true, image_url: 'https://x/m.png' },
        { kind: 'separator', id: 's1' },
        { kind: 'product', id: 'p2', name: 'Secret', price: 99, show_price: false, is_available: true },
      ],
      subcategories: [],
    } as unknown as MenuCategory,
  ];
  it('describes the place and its menu with prices only where shown', () => {
    const ld = restaurantJsonLd(tenant(), menu, 'MXN') as Record<string, unknown> & { hasMenu: { hasMenuSection: { hasMenuItem: Record<string, unknown>[] }[] } };
    assert.equal(ld['@type'], 'Restaurant');
    assert.equal(ld.telephone, '+5213312345678');
    assert.deepEqual(ld.sameAs, ['https://instagram.com/kavaa']);
    assert.equal(ld.acceptsReservations, 'True');
    includesObject(ld.address, { addressCountry: 'MX' });
    const items = ld.hasMenu.hasMenuSection[0].hasMenuItem;
    assert.equal((items).length, 2);
    includesObject(items[0].offers, { price: 140, priceCurrency: 'MXN' });
    assert.equal(items[1].offers, undefined);
  });
  it('links to the menu page when no menu is given', () => {
    const ld = restaurantJsonLd(tenant(), null, 'MXN');
    assert.match(ld.hasMenu as string, /\/menu$/);
    assert.ok(!('email' in ld));
  });
});

describe('marketing JSON-LD', () => {
  it('lists plans as monthly offers with an aggregate range', () => {
    const ld = softwareJsonLd([{ name: 'Menú', amount: 299, currency: 'MXN' }, { name: 'Restaurante', amount: 499, currency: 'MXN' }]) as { offers: Record<string, unknown> };
    includesObject(ld.offers, { '@type': 'AggregateOffer', lowPrice: 299, highPrice: 499, offerCount: 2 });
  });
  it('turns the FAQ into a FAQPage', () => {
    const ld = faqJsonLd([{ q: '¿Q?', a: 'A.' }]) as { mainEntity: { name: string }[] };
    assert.equal(ld.mainEntity[0].name, '¿Q?');
  });
});
