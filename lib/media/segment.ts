'use client';

// Background removal in the browser: ISNet (the DIS "general use" model,
// Apache-2.0) run by onnxruntime-web (MIT). Nothing leaves the device and
// nothing is billed. The model (int8, ~45 MB) and the runtime's wasm files
// are served from our own public `apps` bucket (scripts/publish-models.mjs)
// and kept in the Cache API, so the download happens once per browser.
//
// The model takes a 1024×1024 RGB tensor and answers a 1024×1024 saliency
// map; the map is stretched back to the photo's size and becomes its alpha.

import type { InferenceSession } from 'onnxruntime-web';

export const MODEL_SIZE = 1024;
const CACHE = 'kuik-models-v1';

function modelsBase(): string {
  const base = process.env.NEXT_PUBLIC_MODELS_BASE || `${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')}/storage/v1/object/public/apps/models`;
  return base.replace(/\/$/, '');
}
const MODEL_FILE = 'isnet-general-use-int8.onnx';
const ORT_DIR = 'ort-1.29.0/';

export type SegmentProgress = { phase: 'download'; loaded: number; total: number } | { phase: 'load' } | { phase: 'run' };

/** Fetch through the Cache API, reporting bytes as they arrive on a first download. */
async function fetchCached(url: string, onProgress?: (loaded: number, total: number) => void): Promise<ArrayBuffer> {
  const cache = typeof caches !== 'undefined' ? await caches.open(CACHE).catch(() => null) : null;
  const hit = await cache?.match(url);
  if (hit) return hit.arrayBuffer();
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`model_fetch_${res.status}`);
  const total = Number(res.headers.get('content-length') ?? 0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  await cache?.put(url, new Response(out, { headers: { 'content-type': 'application/octet-stream' } })).catch(() => {});
  return out.buffer;
}

let sessionPromise: Promise<InferenceSession> | null = null;

async function session(onProgress: (p: SegmentProgress) => void): Promise<InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await import('onnxruntime-web');
      ort.env.wasm.wasmPaths = `${modelsBase()}/${ORT_DIR}`;
      const bytes = await fetchCached(`${modelsBase()}/${MODEL_FILE}`, (loaded, total) => onProgress({ phase: 'download', loaded, total }));
      onProgress({ phase: 'load' });
      // wasm only: the WebGPU provider accepts this model and then fails at
      // run time (its MaxPool kernel lacks ceil_mode). Threads come along
      // when the page is cross-origin isolated; otherwise one core.
      return await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
    })().catch((e) => {
      sessionPromise = null; // next call tries again
      throw e;
    });
  }
  return sessionPromise;
}

/** The model's input: the photo resized to 1024², RGB planes, ImageNet mean subtracted (ISNet uses std 1). */
export function preprocess(rgba: Uint8ClampedArray, size = MODEL_SIZE): Float32Array {
  const plane = size * size;
  const out = new Float32Array(3 * plane);
  const mean = [0.485, 0.456, 0.406];
  for (let i = 0; i < plane; i++) {
    out[i] = rgba[i * 4] / 255 - mean[0];
    out[plane + i] = rgba[i * 4 + 1] / 255 - mean[1];
    out[2 * plane + i] = rgba[i * 4 + 2] / 255 - mean[2];
  }
  return out;
}

/** The model's output (one plane) normalised to 0..255, min to max, as the alpha of a 1024² mask. */
export function maskFromOutput(pred: Float32Array, size = MODEL_SIZE): Uint8ClampedArray<ArrayBuffer> {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < size * size; i++) {
    const v = pred[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || 1;
  const mask = new Uint8ClampedArray(new ArrayBuffer(size * size * 4));
  for (let i = 0; i < size * size; i++) {
    const a = Math.round(((pred[i] - lo) / span) * 255);
    mask[i * 4 + 3] = a;
  }
  return mask;
}

/**
 * The photo with its background made transparent, at the photo's own size
 * (capped at 1280 px on the long side, what the menu uses anyway).
 */
export async function segmentForeground(source: ImageBitmap, onProgress: (p: SegmentProgress) => void): Promise<ImageData> {
  const s = await session(onProgress);
  const ort = await import('onnxruntime-web');
  onProgress({ phase: 'run' });

  // Model input.
  const small = document.createElement('canvas');
  small.width = MODEL_SIZE;
  small.height = MODEL_SIZE;
  const sctx = small.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(source, 0, 0, MODEL_SIZE, MODEL_SIZE);
  const input = new ort.Tensor('float32', preprocess(sctx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data), [1, 3, MODEL_SIZE, MODEL_SIZE]);
  const results = await s.run({ [s.inputNames[0]]: input });
  const pred = results[s.outputNames[0]].data as Float32Array;

  // The mask, drawn at the photo's size with the browser's own resampling.
  const scale = Math.min(1, 1280 / Math.max(source.width, source.height));
  const w = Math.round(source.width * scale);
  const h = Math.round(source.height * scale);
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = MODEL_SIZE;
  maskCanvas.height = MODEL_SIZE;
  maskCanvas.getContext('2d')!.putImageData(new ImageData(maskFromOutput(pred), MODEL_SIZE, MODEL_SIZE), 0, 0);

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d', { willReadFrequently: true })!;
  octx.drawImage(maskCanvas, 0, 0, w, h);
  // Keep the mask's alpha, paint the photo's colour into it.
  octx.globalCompositeOperation = 'source-in';
  octx.drawImage(source, 0, 0, w, h);
  return octx.getImageData(0, 0, w, h);
}
