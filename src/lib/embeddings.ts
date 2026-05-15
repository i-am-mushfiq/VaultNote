// ── Local Semantic Embeddings via Transformers.js ─────────────────────────────
// Uses all-MiniLM-L6-v2 (22 MB) — downloaded once, cached by the browser.
// Everything runs inside WebView2. Zero network calls after first load.

import type { FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL = 'Xenova/all-MiniLM-L6-v2';

let _pipe: FeatureExtractionPipeline | null = null;
let _loading = false;
let _loadPromise: Promise<FeatureExtractionPipeline> | null = null;
let _error: string | null = null;

export function getModelError(): string | null { return _error; }
export function resetModelError() { _error = null; _loadPromise = null; }

type ProgressCallback = (progress: { status: string; progress?: number }) => void;
let _progressCb: ProgressCallback | null = null;

export function setProgressCallback(cb: ProgressCallback) {
  _progressCb = cb;
}

export function isModelLoaded(): boolean {
  return _pipe !== null;
}

export async function loadModel(): Promise<void> {
  if (_pipe) return;
  if (_error) throw new Error(_error);   // surface previous failure immediately
  if (_loadPromise) { await _loadPromise; return; }

  _loading = true;
  _error   = null;

  try {
    const { pipeline, env } = await import('@huggingface/transformers');
    // Use browser cache (IndexedDB/Cache API) — survives WebView2 restarts
    env.allowLocalModels = false;
    env.useBrowserCache  = true;

    // Disable the WASM proxy (Web Worker) — it requires SharedArrayBuffer /
    // COOP+COEP headers which Tauri's dev server doesn't set.
    // Running ONNX on the main thread is slightly slower but always works.
    (env as any).backends = (env as any).backends ?? {};
    (env as any).backends.onnx = (env as any).backends.onnx ?? {};
    (env as any).backends.onnx.wasm = (env as any).backends.onnx.wasm ?? {};
    (env as any).backends.onnx.wasm.proxy = false;

    _loadPromise = pipeline('feature-extraction', MODEL, {
      progress_callback: (p: any) => _progressCb?.({ status: p.status, progress: p.progress }),
    }) as Promise<FeatureExtractionPipeline>;

    _pipe    = await _loadPromise;
    _loading = false;
  } catch (e) {
    _loading     = false;
    _loadPromise = null;
    _error       = e instanceof Error ? e.message : String(e);
    throw new Error(_error);
  }
}

/** Embed a single text string → normalised Float32Array of length 384. */
export async function embed(text: string): Promise<Float32Array> {
  if (!_pipe) await loadModel();
  // The model's tokeniser hard-limits at 512 tokens (~380 words / ~2500 chars).
  // We let cleanContent control the char budget; just guard against huge inputs here.
  const out = await _pipe!(text.slice(0, 3000), { pooling: 'mean', normalize: true });
  return out.data as Float32Array;
}

/** Embed multiple texts with a small delay between each to keep UI responsive. */
export async function embedBatch(
  texts: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Float32Array[]> {
  const results: Float32Array[] = [];
  for (let i = 0; i < texts.length; i++) {
    results.push(await embed(texts[i]));
    onProgress?.(i + 1, texts.length);
    // yield to event loop every 5 items
    if (i % 5 === 4) await new Promise((r) => setTimeout(r, 0));
  }
  return results;
}

// ── Similarity ────────────────────────────────────────────────────────────────

export function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** Find the top-k most similar notes to a query.
 *  minScore is caller-configurable so search, related-notes, and graph edges
 *  can each use an appropriate threshold without one global magic number. */
export function topK(
  queryVec: Float32Array,
  index: Map<string, Float32Array>,
  k = 5,
  excludePath?: string,
  minScore = 0.3,
): { path: string; score: number }[] {
  const results: { path: string; score: number }[] = [];
  for (const [path, vec] of index) {
    if (path === excludePath) continue;
    results.push({ path, score: cosineSim(queryVec, vec) });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, k).filter((r) => r.score > minScore);
}

// ── Serialisation (Float32Array ↔ JSON-safe number[]) ────────────────────────

export function vecToArray(v: Float32Array): number[] {
  return Array.from(v);
}

export function arrayToVec(a: number[]): Float32Array {
  return new Float32Array(a);
}
