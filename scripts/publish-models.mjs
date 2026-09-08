// Upload what on-device background removal needs (lib/media/segment.ts) to
// the public `apps` bucket: the int8 ISNet model and onnxruntime-web's wasm
// runtime, under models/. Served from our own bucket, cached for a year
// (the file names carry their version).
//
//   node scripts/publish-models.mjs path/to/isnet-general-use-int8.onnx
//
// The model: isnet-general-use.onnx (DIS, Apache-2.0, from rembg's
// releases) quantised with onnxruntime.quantization.quantize_dynamic to
// QUInt8 (~46 MB). The runtime files come from node_modules, so the version
// uploaded is the one the app bundles (ORT_DIR in lib/media/segment.ts).
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const model = process.argv[2];
if (!model || !existsSync(model)) {
  console.error('usage: node scripts/publish-models.mjs <isnet-general-use-int8.onnx>');
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
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');

const ortVersion = JSON.parse(readFileSync(resolve(root, 'node_modules/onnxruntime-web/package.json'), 'utf8')).version;
const dist = resolve(root, 'node_modules/onnxruntime-web/dist');
// The wasm builds the app can pick: plain (threads when isolated) and jsep (WebGPU).
const runtime = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.jsep.wasm', 'ort-wasm-simd-threaded.jsep.mjs'];

const bucket = createClient(url, key, { auth: { persistSession: false } }).storage.from('apps');
const YEAR = String(365 * 24 * 3600);
async function put(path, bytes, contentType) {
  const { error } = await bucket.upload(path, bytes, { contentType, upsert: true, cacheControl: YEAR });
  if (error) throw new Error(`${path}: ${error.message}`);
  console.log(`uploaded ${path} (${(bytes.length / 1e6).toFixed(1)} MB)`);
}

await put('models/isnet-general-use-int8.onnx', readFileSync(model), 'application/octet-stream');
for (const f of runtime) {
  const type = f.endsWith('.wasm') ? 'application/wasm' : 'text/javascript';
  await put(`models/ort-${ortVersion}/${f}`, readFileSync(resolve(dist, f)), type);
}
console.log(`done: models/${basename(model)} and ort-${ortVersion}/ → ${bucket.getPublicUrl('models').data.publicUrl}`);
