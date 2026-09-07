// Upload Kuik Caja installers (from the desktop workflow, or a local
// electron-builder run) to the public `apps` bucket and refresh latest.json.
//
//   node scripts/publish-desktop.mjs <dir with .dmg/.zip/.exe/.AppImage/.deb/.yml> [--mandatory | --min <version>|none]
//
// --mandatory makes this version the minimum: an older Kuik Caja is blocked
// until it restarts into the update it downloads by itself. --min sets
// another minimum; neither keeps the one already set (see publish-apk.mjs).
//
// Everything goes flat under apps/desktop/: electron-updater's generic
// provider reads latest.yml, latest-mac.yml and latest-linux.yml there and the
// installer files they name. latest.json gets `desktop` with one link per OS,
// which kuik.mx/apps shows.
//
// Credentials: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment
// (CI), else the repo's .env.local (local runs).
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const mandatory = args.includes('--mandatory');
const minIdx = args.indexOf('--min');
const minArg = minIdx >= 0 ? args[minIdx + 1] : undefined;
const [dir] = args.filter((a, i) => !a.startsWith('--') && !(minIdx >= 0 && i === minIdx + 1));
if (!dir || (minIdx >= 0 && !minArg)) {
  console.error('usage: node scripts/publish-desktop.mjs <dir> [--mandatory | --min <version>|none]');
  process.exit(2);
}
if (minArg && minArg !== 'none' && !/^\d+(\.\d+){0,3}$/.test(minArg)) throw new Error(`--min: not a version: ${minArg}`);

let url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if ((!url || !key) && existsSync(resolve(root, '.env.local'))) {
  const env = Object.fromEntries(
    readFileSync(resolve(root, '.env.local'), 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]),
  );
  url ||= env.NEXT_PUBLIC_SUPABASE_URL;
  key ||= env.SUPABASE_SERVICE_ROLE_KEY;
}
if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');

const version = JSON.parse(readFileSync(resolve(root, 'native/desktop/package.json'), 'utf8')).version;

const files = readdirSync(dir)
  .filter((f) => /\.(dmg|zip|exe|AppImage|deb|yml|blockmap)$/.test(f) && f !== 'builder-debug.yml')
  .sort();
if (files.length === 0) throw new Error(`no installers in ${dir}`);

const types = {
  dmg: 'application/x-apple-diskimage',
  zip: 'application/zip',
  exe: 'application/vnd.microsoft.portable-executable',
  AppImage: 'application/octet-stream',
  deb: 'application/vnd.debian.binary-package',
  yml: 'text/yaml',
  blockmap: 'application/octet-stream',
};

const supabase = createClient(url, key, { auth: { persistSession: false } });
const LIMIT = 300 * 1024 * 1024;
const { data: buckets } = await supabase.storage.listBuckets();
const apps = buckets?.find((b) => b.id === 'apps');
if (!apps) {
  const { error } = await supabase.storage.createBucket('apps', { public: true, fileSizeLimit: LIMIT });
  if (error) throw error;
} else if ((apps.file_size_limit ?? 0) < LIMIT) {
  // An installer is over 100 MB. The bucket's cap can only go as high as the
  // project's own upload limit (Supabase → Project Settings → Storage), so
  // say so plainly instead of failing on the first big file.
  const { error } = await supabase.storage.updateBucket('apps', { public: true, fileSizeLimit: LIMIT });
  if (error) {
    throw new Error(
      `the apps bucket allows ${Math.round((apps.file_size_limit ?? 0) / 1e6)} MB per file and cannot be raised to 300 MB: ` +
        `raise "Upload file size limit" under Project Settings → Storage in the Supabase dashboard, then rerun (${error.message})`,
    );
  }
}
const bucket = supabase.storage.from('apps');

const links = {};
for (const name of files) {
  const path = join(dir, name);
  const ext = name.slice(name.lastIndexOf('.') + 1);
  const { error } = await bucket.upload(`desktop/${name}`, readFileSync(path), {
    contentType: types[ext] ?? 'application/octet-stream',
    upsert: true,
    cacheControl: ext === 'yml' ? '60' : '3600',
  });
  if (error) throw new Error(`${name}: ${error.message}`);
  const size = statSync(path).size;
  console.log(`uploaded desktop/${name} (${(size / 1e6).toFixed(1)} MB)`);
  const publicUrl = bucket.getPublicUrl(`desktop/${name}`).data.publicUrl;
  // The download the page offers per OS: dmg for Mac, the NSIS exe, the AppImage.
  if (ext === 'dmg') links.mac = { url: publicUrl, size };
  if (ext === 'exe') links.win = { url: publicUrl, size };
  if (ext === 'AppImage') links.linux = { url: publicUrl, size };
}

const { data: existing } = await bucket.download('latest.json');
const latest = existing ? JSON.parse(await existing.text()) : {};
const minVersion = mandatory ? version : minArg === 'none' ? null : (minArg ?? latest.desktop?.minVersion ?? null);
// The previous entry's links survive when an OS was not rebuilt; its version never does.
latest.desktop = { ...latest.desktop, ...links, version, minVersion, publishedAt: new Date().toISOString() };
const { error } = await bucket.upload('latest.json', Buffer.from(JSON.stringify(latest, null, 2)), {
  contentType: 'application/json',
  upsert: true,
  cacheControl: '60',
});
if (error) throw error;
console.log(`latest.json → desktop ${version}: ${Object.keys(links).join(', ') || 'no new installers'}, minimum ${minVersion ?? 'none'}${mandatory ? ' (mandatory)' : ''}`);
