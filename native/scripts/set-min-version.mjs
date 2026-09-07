// Change the oldest build an app may run, without republishing anything.
//
//   node scripts/set-min-version.mjs terminal|mobile|desktop <version>|none
//
// Writes `minVersion` for that app in the bucket's latest.json (what
// /api/apps/latest serves). A build below it is blocked until it updates,
// on platforms that can install the update today; `none` lifts the
// requirement. The super-admin page does the same from the browser.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [app, value] = process.argv.slice(2);
const ids = { terminal: 'terminal', mobile: 'kuik', desktop: 'desktop' };
if (!ids[app] || !value || (value !== 'none' && !/^\d+(\.\d+){0,3}$/.test(value))) {
  console.error('usage: node scripts/set-min-version.mjs terminal|mobile|desktop <version>|none');
  process.exit(2);
}

const env = Object.fromEntries(
  readFileSync(resolve(root, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]),
);
const url = process.env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.local');

const bucket = createClient(url, key, { auth: { persistSession: false } }).storage.from('apps');
const { data: existing, error: readErr } = await bucket.download('latest.json');
if (readErr || !existing) throw new Error('latest.json is not in the bucket yet; publish a build first');
const latest = JSON.parse(await existing.text());
const id = ids[app];
if (!latest[id]?.version) throw new Error(`${id} has no published version`);

const cmp = (a, b) => {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
};
const minVersion = value === 'none' ? null : value;
if (minVersion && cmp(minVersion, latest[id].version) > 0) {
  throw new Error(`${minVersion} is newer than the published ${latest[id].version}; nobody could update to it`);
}
latest[id] = { ...latest[id], minVersion };
const { error } = await bucket.upload('latest.json', Buffer.from(JSON.stringify(latest, null, 2)), {
  contentType: 'application/json',
  upsert: true,
  cacheControl: '60',
});
if (error) throw error;
console.log(`latest.json → ${id}: published ${latest[id].version}, minimum ${minVersion ?? 'none'}`);
