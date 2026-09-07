// Upload a release APK to the public `apps` bucket and refresh latest.json,
// which kuik.mx/apps and the in-app update banner read.
//
//   node scripts/publish-apk.mjs terminal|mobile path/to/app-release.apk
//
// Uses SUPABASE_SERVICE_ROLE_KEY from the repo's .env.local. The bucket is
// created if missing (public: downloads need no policy, uploads need the
// service role, so nothing else can write to it).
import { createClient } from '@supabase/supabase-js';
import { readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [app, apkPath] = process.argv.slice(2);
if (!['terminal', 'mobile'].includes(app) || !apkPath) {
  console.error('usage: node scripts/publish-apk.mjs terminal|mobile <apk>');
  process.exit(2);
}

const env = Object.fromEntries(
  readFileSync(resolve(root, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.local');

// Version from the Android project, the one Android enforces.
const gradle = readFileSync(resolve(root, 'native', app, 'android/app/build.gradle'), 'utf8');
const version = gradle.match(/versionName "([^"]+)"/)?.[1];
const versionCode = Number(gradle.match(/versionCode (\d+)/)?.[1]);
if (!version || !versionCode) throw new Error('versionName/versionCode not found in build.gradle');

const id = app === 'terminal' ? 'terminal' : 'kuik';
const file = id === 'terminal' ? 'kuik-terminal.apk' : 'kuik.apk';
const versioned = file.replace(/\.apk$/, `-${version}.apk`);
const bytes = readFileSync(apkPath);
const size = statSync(apkPath).size;

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data: buckets } = await supabase.storage.listBuckets();
if (!buckets?.some((b) => b.id === 'apps')) {
  const { error } = await supabase.storage.createBucket('apps', { public: true, fileSizeLimit: 300 * 1024 * 1024 });
  if (error) throw error;
  console.log('created bucket apps');
}
const bucket = supabase.storage.from('apps');
for (const name of [file, versioned]) {
  const { error } = await bucket.upload(name, bytes, { contentType: 'application/vnd.android.package-archive', upsert: true, cacheControl: '300' });
  if (error) throw error;
  console.log(`uploaded ${name} (${(size / 1e6).toFixed(1)} MB)`);
}

const { data: existing } = await bucket.download('latest.json');
const latest = existing ? JSON.parse(await existing.text()) : {};
latest[id] = {
  version,
  versionCode,
  android: { url: bucket.getPublicUrl(file).data.publicUrl, size, publishedAt: new Date().toISOString() },
  ios: latest[id]?.ios ?? null,
};
const { error } = await bucket.upload('latest.json', Buffer.from(JSON.stringify(latest, null, 2)), {
  contentType: 'application/json',
  upsert: true,
  cacheControl: '60',
});
if (error) throw error;
console.log(`latest.json → ${id} ${version} (${versionCode})`);
console.log(bucket.getPublicUrl(file).data.publicUrl);
