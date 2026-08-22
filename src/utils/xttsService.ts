/**
 * xttsService.ts
 * ──────────────
 * Client for the local JARVIS Voice Server (jarvis_voice_server.py).
 *
 * Pipeline:
 *   - Split text into sentences
 *   - Fetch each sentence WAV in parallel (all requests fire immediately)
 *   - Play sentence N as soon as its WAV arrives AND sentence N-1 finished
 *   - First audio starts in ~5s regardless of total text length
 */

const XTTS_BASE  = 'http://127.0.0.1:5432'
const TIMEOUT_MS = 90_000

let _serverAvailable: boolean | null = null
let _probePromise: Promise<boolean> | null = null
let _sharedCtx: AudioContext | null = null

export function getOrCreateAudioContext(): AudioContext {
  if (!_sharedCtx || _sharedCtx.state === 'closed') {
    _sharedCtx = new AudioContext()
  }
  return _sharedCtx
}

export function unlockXttsAudio(): void {
  const ctx = getOrCreateAudioContext()
  if (ctx.state === 'suspended') ctx.resume()
}

// ── Probe ────────────────────────────────────────────────────────────────────
export async function probeXttsServer(): Promise<boolean> {
  if (_serverAvailable !== null) return _serverAvailable
  if (_probePromise) return _probePromise

  _probePromise = (async () => {
    try {
      const ctrl = new AbortController()
      const t    = setTimeout(() => ctrl.abort(), 2_000)
      const res  = await fetch(`${XTTS_BASE}/health`, { signal: ctrl.signal })
      clearTimeout(t)
      _serverAvailable = res.ok
      if (res.ok) console.info('[JARVIS XTTS] Servidor local detectado ✓')
      return res.ok
    } catch {
      _serverAvailable = false
      return false
    } finally {
      _probePromise = null
    }
  })()

  return _probePromise
}

export function resetXttsProbe() {
  _serverAvailable = null
  _probePromise    = null
}

// ── Sentence splitter ────────────────────────────────────────────────────────
function splitSentences(text: string): string[] {
  const clean = text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/#+\s*/g, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n+/g, ' ')
    .trim()

  const raw = clean
    .split(/(?<=[.!?…])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 1)

  // Merge very short fragments into previous
  const merged: string[] = []
  for (const s of raw) {
    if (merged.length > 0 && merged[merged.length - 1].length < 20) {
      merged[merged.length - 1] += ' ' + s
    } else {
      merged.push(s)
    }
  }

  return merged.length ? merged : [clean]
}

// ── Fetch one sentence WAV (no throw — returns null on error) ────────────────
async function fetchWav(
  sentence: string,
  language: string,
  cancelRef: { cancelled: boolean },
): Promise<ArrayBuffer | null> {
  if (cancelRef.cancelled) return null
  const ctrl    = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${XTTS_BASE}/speak`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text: sentence, language }),
      signal:  ctrl.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.arrayBuffer()
  } catch (err) {
    clearTimeout(timeout)
    if (!cancelRef.cancelled) console.warn('[XTTS] fetch failed:', err)
    return null
  }
}

// ── Decode ArrayBuffer → AudioBuffer ────────────────────────────────────────
async function decode(wav: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = getOrCreateAudioContext()
  return ctx.decodeAudioData(wav.slice(0))
}

// ── Play one AudioBuffer, resolve when done ──────────────────────────────────
function play(
  buf: AudioBuffer,
  cancelRef: { cancelled: boolean; source?: AudioBufferSourceNode },
): Promise<void> {
  return new Promise(resolve => {
    if (cancelRef.cancelled) { resolve(); return }
    const ctx = getOrCreateAudioContext()
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    cancelRef.source = src
    src.onended = () => resolve()
    src.start()
  })
}

// ── Main: streaming sentence-by-sentence ─────────────────────────────────────
export async function speakXtts(
  text:      string,
  language:  string,
  cancelRef: { cancelled: boolean; source?: AudioBufferSourceNode },
  onStart?:  () => void,
): Promise<void> {
  // Ensure AudioContext is running
  const ctx = getOrCreateAudioContext()
  if (ctx.state === 'suspended') await ctx.resume()

  const sentences = splitSentences(text)
  console.info('[XTTS] Sentences:', sentences)

  if (sentences.length === 0) return

  // Fire ALL fetch requests immediately — they run in parallel on the server
  // (server serialises synthesis via semaphore, but HTTP connections are concurrent)
  const fetches = sentences.map(s => fetchWav(s, language, cancelRef))

  let started = false

  // Consume in order: await each fetch, then play it before moving to next
  // While we're playing sentence N, sentence N+1 is already being fetched
  for (let i = 0; i < fetches.length; i++) {
    if (cancelRef.cancelled) break

    const wav = await fetches[i]          // wait for this sentence's WAV
    if (!wav || cancelRef.cancelled) continue

    const buf = await decode(wav)         // decode WAV → AudioBuffer
    if (cancelRef.cancelled) break

    if (!started) {
      started = true
      onStart?.()
      console.info(`[XTTS] Playing sentence ${i + 1}/${sentences.length}`)
    }

    await play(buf, cancelRef)            // play, then loop to next sentence
  }
}
