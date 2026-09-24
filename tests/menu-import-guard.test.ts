import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IMPORT_LIMITS,
  isCssColor,
  isFontName,
  isHostedMediaUrl,
  isPrivateIp,
  publicHttpUrl,
  sanitizeImportPayload,
} from '../lib/menu-import-guard';
import { importCategoryTheme } from '../lib/category-theme';

const SUPA = 'https://abc.supabase.co';

test('hosted media: exact origin and the public media path, not a prefix', () => {
  assert.ok(isHostedMediaUrl(`${SUPA}/storage/v1/object/public/media/t/x.png`, SUPA));
  assert.equal(isHostedMediaUrl('https://abc.supabase.co@evil.com/storage/v1/object/public/media/x.png', SUPA), false);
  assert.equal(isHostedMediaUrl('https://abc.supabase.co.evil.com/storage/v1/object/public/media/x.png', SUPA), false);
  assert.equal(isHostedMediaUrl(`${SUPA}/rest/v1/tenants`, SUPA), false);
  assert.equal(isHostedMediaUrl(`${SUPA}/storage/v1/object/public/media/x.png`, ''), false);
  assert.equal(isHostedMediaUrl('not a url', SUPA), false);
});

test('private ranges, v4 and v6, mapped and bracketed', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', '[::1]', '::ffff:10.0.0.1', '::ffff:127.0.0.1', 'ff02::1']) {
    assert.ok(isPrivateIp(ip), ip);
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '172.15.0.1', '1.1.1.1', '2606:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(isPrivateIp(ip), false, ip);
  }
});

test('public http url: scheme, credentials, ports and literal hosts', () => {
  assert.ok(publicHttpUrl('https://example.com/a.png'));
  assert.ok(publicHttpUrl('http://example.com:80/a.png'));
  assert.equal(publicHttpUrl('ftp://example.com/a.png'), null);
  assert.equal(publicHttpUrl('file:///etc/passwd'), null);
  assert.equal(publicHttpUrl('https://user:pw@example.com/a.png'), null);
  assert.equal(publicHttpUrl('https://example.com:8080/a.png'), null);
  assert.equal(publicHttpUrl('http://127.0.0.1/a.png'), null);
  assert.equal(publicHttpUrl('http://169.254.169.254/latest/meta-data'), null);
  assert.equal(publicHttpUrl('http://[::1]/a.png'), null);
  assert.equal(publicHttpUrl('http://localhost/a.png'), null);
  assert.equal(publicHttpUrl('http://db.internal.local/a.png'), null);
});

test('theme values: colours and fonts CSS can take as-is, nothing else', () => {
  for (const v of ['#fff', '#2d5a27', '#2d5a27cc', 'rgb(1, 2, 3)', 'rgba(1,2,3,0.5)', 'hsl(120 50% 50% / 0.4)', 'transparent']) {
    assert.ok(isCssColor(v), v);
  }
  for (const v of ['red; background:url(https://evil/px)', '#fff)', 'url(x)', 'var(--x)', '', 12, null, '#ggg', 'a'.repeat(65)]) {
    assert.equal(isCssColor(v), false, String(v));
  }
  assert.ok(isFontName('Playfair Display'));
  assert.ok(isFontName('Space Mono'));
  assert.equal(isFontName("x'; background:url(x)"), false);
  assert.equal(isFontName('</style>'), false);
});

test('category theme: unknown keys dropped, bad values dropped, shorthands validated', () => {
  const t = importCategoryTheme({
    color: '#2d5a27',
    background: 'red; x:y',
    theme: {
      text_color: '#fff',
      font_category: 'Lora',
      font_price: '</style>',
      tab_bar_color: 'url(javascript:1)',
      background_image: 'bg.jpg',
      plan: 'pro',
    } as never,
  });
  assert.deepEqual(t, {
    primary_color: '#2d5a27',
    secondary_color: '#2d5a27',
    button_color: '#2d5a27',
    text_color: '#fff',
    font_category: 'Lora',
    background_image: 'bg.jpg',
  });
  assert.equal(importCategoryTheme({ theme: { plan: 'pro' } as never }), null);
});

test('payload: a real export round-trips unchanged in substance', () => {
  const input = {
    design: { primary_color: '#2d5a27', font_family: 'Outfit', slogan: 'matcha & coffee', tab_bar_color: '#fafafa00' },
    categories: [
      {
        name: 'Matcha',
        icon: '🍵',
        image: 'https://abc.supabase.co/storage/v1/object/public/media/t/icon.png',
        theme: { card_color: '#f4f6e8' },
        products: [
          {
            name: 'Matcha latte',
            description: null,
            price: 140,
            compareAtPrice: null,
            cost: 0,
            available: true,
            hidden: false,
            tags: ['bestseller'],
            image: 'matcha-latte.png',
            optionGroups: [
              { name: 'Tamaño', kind: 'drink', required: true, multiple: false, options: [{ name: 'Chico', price: 0 }, { name: 'Grande', price: 30 }] },
            ],
          },
        ],
        subcategories: [{ name: 'Extras', products: [{ name: 'Nieve', price: 30 }] }],
      },
    ],
  };
  const out = sanitizeImportPayload(input);
  assert.deepEqual(out, input);
});

test('payload: wrong-typed optionals reset, CSS in design dropped, unknown keys stripped', () => {
  const out = sanitizeImportPayload({
    design: { primary_color: 'red; background:url(x)', secondary_color: '#333', font_family: "x'; y", plan: 'pro' },
    categories: [
      { name: 'A', products: [{ name: 'P', tags: { a: 1 }, price: 'abc', available: 'yes', optionGroups: 'nope', extra: true }] },
    ],
  });
  assert.deepEqual(out.design, { secondary_color: '#333' });
  const p = out.categories[0].products![0] as unknown as Record<string, unknown>;
  assert.equal(p.tags, undefined);
  assert.equal(p.price, null);
  assert.equal(p.available, undefined);
  assert.equal(p.optionGroups, undefined);
  assert.equal('extra' in p, false);
});

test('payload: what cannot be repaired is refused', () => {
  assert.throws(() => sanitizeImportPayload({ categories: 'x' }), /Invalid import file at categories/);
  assert.throws(() => sanitizeImportPayload({ categories: [{ products: [] }] }), /at categories\.0\.name/);
  assert.throws(() => sanitizeImportPayload(null), /Invalid import file/);
  const big = { categories: Array.from({ length: 3 }, (_, i) => ({ name: `C${i}`, products: Array.from({ length: 2000 }, (_, j) => ({ name: `P${j}` })) })) };
  assert.throws(() => sanitizeImportPayload(big), new RegExp(`limit is ${IMPORT_LIMITS.productsTotal}`));
  const tooMany = { categories: Array.from({ length: IMPORT_LIMITS.categories + 1 }, (_, i) => ({ name: `C${i}` })) };
  assert.throws(() => sanitizeImportPayload(tooMany), /Invalid import file/);
});
