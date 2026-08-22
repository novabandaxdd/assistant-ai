/**
 * ── JARVIS Voice Engine ─────────────────────────────────────────────────────
 *
 * Priority order for speech:
 *   1. OpenAI TTS API (onyx voice) — natural, deep, authoritative
 *   2. Web Speech API — tuned for the deepest available pt-BR/en male voice
 *
 * Voice selection strategy:
 *   - Prefer Microsoft Daniel (Windows 11, best male pt-BR)
 *   - Fall back through a ranked list of deep/male voices
 *   - Apply lowest feasible pitch + slow rate for JARVIS cadence
 */
import { loadAIConfig } from './aiService'
import { resetXttsProbe } from './xttsService'

// ── Voice preference list — ordered best → acceptable ────────────────────────
// Windows 11 ships: Microsoft Daniel, Microsoft Francisca (pt-BR)
// Chrome on Windows may also expose Google voices
const VOICE_PREFS = [
  'Microsoft Daniel - Portuguese (Brazil)', // Win11 — exact name
  'Microsoft Daniel',                        // fallback match
  'Google português do Brasil',              // Chrome
  'Google Portuguese (Brazil)',
  'Microsoft Antonio',
  'Felipe',
  'Luciana',
  'Microsoft Maria - Portuguese (Brazil)',   // female fallback
  'Microsoft Francisca',
]

// Parameters tuned for JARVIS: low pitch, slow deliberate pace
export const TTS_PARAMS = {
  lang:   'pt-BR',
  pitch:  0.50,   // minimum — Daniel handles this well without distortion
  rate:   0.80,   // deliberate, authoritative cadence
  volume: 1.0,
}

// ── Module-level singletons ───────────────────────────────────────────────────
let _voiceCache: SpeechSynthesisVoice | null = null
let _voicesReady = false
let _audioCtx: AudioContext | null = null
let _activationBuffer: AudioBuffer | null = null
let _activationLoaded = false

// ── Voice picking ─────────────────────────────────────────────────────────────
export function pickVoice(): SpeechSynthesisVoice | null {
  if (_voiceCache) return _voiceCache
  const voices = window.speechSynthesis?.getVoices() ?? []
  if (!voices.length) return null

  for (const pref of VOICE_PREFS) {
    const v = voices.find(v => v.name === pref)
    if (v) { _voiceCache = v; return v }
  }
  for (const pref of VOICE_PREFS) {
    const v = voices.find(v => v.name.toLowerCase().includes(pref.toLowerCase()))
    if (v) { _voiceCache = v; return v }
  }
  const ptbr = voices.filter(v => v.lang === 'pt-BR' || v.lang === 'pt_BR')
  const male = ptbr.find(v => /daniel|felipe|lucas|male/i.test(v.name))
  if (male) { _voiceCache = male; return male }
  if (ptbr.length) { _voiceCache = ptbr[0]; return ptbr[0] }
  const pt = voices.find(v => v.lang.startsWith('pt'))
  if (pt) { _voiceCache = pt; return pt }
  return voices[0] ?? null
}

export function resetVoiceCache() { _voiceCache = null; resetXttsProbe() }

/** Returns the name of the currently selected voice (for debug/settings display) */
export function getSelectedVoiceName(): string {
  const v = pickVoice()
  return v ? v.name : 'nenhuma'
}

/** Call once at app startup to pre-warm the voice list.
 *  MP3 loading is deferred until after the first user gesture (AudioContext policy). */
export function initVoice() {
  if (typeof window === 'undefined') return

  // Pre-warm voices (no AudioContext needed)
  if (!_voicesReady) {
    _voicesReady = true
    const load = () => { _voiceCache = null; pickVoice() }
    window.speechSynthesis.onvoiceschanged = load
    window.speechSynthesis.getVoices()
  }
}

/** Call after the first user gesture to unlock AudioContext and load the MP3 */
export function unlockAudio() {
  if (_activationLoaded) return
  _activationLoaded = true
  loadActivationSound().catch(() => { /* optional asset */ })
}

// ── AudioContext + DSP chain ──────────────────────────────────────────────────
function getAudioCtx(): AudioContext {
  if (!_audioCtx) _audioCtx = new AudioContext()
  if (_audioCtx.state === 'suspended') _audioCtx.resume()
  return _audioCtx
}

async function loadActivationSound(): Promise<void> {
  const res = await fetch('/voice/jarvis-voice.mp3')
  if (!res.ok) return
  const buf = await res.arrayBuffer()
  const ctx = getAudioCtx()
  _activationBuffer = await ctx.decodeAudioData(buf)
}

/**
 * Play the JARVIS MP3 activation sound.
 * Returns a Promise that resolves when playback is finished.
 */
export function playActivationSound(volume = 0.85): Promise<void> {
  return new Promise(resolve => {
    if (!_activationBuffer) { resolve(); return }
    try {
      const ctx = getAudioCtx()
      const src = ctx.createBufferSource()
      src.buffer = _activationBuffer

      const gain = ctx.createGain()
      gain.gain.value = volume

      src.connect(gain)
      gain.connect(ctx.destination)
      src.onended = () => resolve()
      src.start()
    } catch {
      resolve()
    }
  })
}

// ── Text pre-processing ───────────────────────────────────────────────────────

const ABBREV_MAP: [RegExp, string][] = [
  [/\bSr\.\s/g,           'Senhor '],
  [/\bDr\.\s/g,           'Doutor '],
  [/\bEng\.\s/g,          'Engenheiro '],
  [/\bn[°º]\s*/gi,        'número '],
  [/\betc\./gi,           'et cetera'],
  [/\bAPI\b/g,            'A P I'],
  [/\bSQL\b/g,            'S Q L'],
  [/\bUI\b/g,             'interface'],
  [/\bUX\b/g,             'experiência do usuário'],
  [/\bURL\b/g,            'endereço'],
  [/\bJSON\b/g,           'J S O N'],
  [/\bGPT\b/g,            'G P T'],
]

/** Strip markdown, expand abbreviations, normalize punctuation */
function preprocessText(raw: string): string {
  let text = raw
    // Strip markdown bold/italic/code
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g,    '$1')
    .replace(/`(.+?)`/g,      '$1')
    .replace(/#+\s*/g,        '')
    // Collapse bullet points into natural sentences
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/\n+/g, ' ')
    // Strip XML tags
    .replace(/<[^>]+>/g, '')
    // Normalize multiple spaces/dots
    .replace(/\.{3,}/g, '…')
    .replace(/\s{2,}/g, ' ')
    .trim()

  for (const [pattern, replacement] of ABBREV_MAP) {
    text = text.replace(pattern, replacement)
  }

  return text
}

/**
 * Split text into speakable chunks.
 * Splits on sentence boundaries, keeping chunks short enough to avoid
 * Chrome's ~15s utterance cutoff while staying semantically coherent.
 */
function splitIntoChunks(text: string): string[] {
  // Primary split: sentence boundaries
  const rough = text
    .split(/(?<=[.!?…])\s+/)
    .flatMap(s => {
      // Secondary split: very long sentences on comma/semicolon
      if (s.length > 200) {
        return s.split(/(?<=[,;:])\s+/)
      }
      return [s]
    })
    .map(s => s.trim())
    .filter(s => s.length > 0)

  // Merge very short fragments back together (≤ 15 chars) to avoid choppy gaps
  const merged: string[] = []
  let buffer = ''
  for (const chunk of rough) {
    buffer = buffer ? `${buffer} ${chunk}` : chunk
    if (buffer.length >= 40 || /[.!?…]$/.test(buffer)) {
      merged.push(buffer)
      buffer = ''
    }
  }
  if (buffer) merged.push(buffer)

  return merged.length ? merged : [text]
}

// ── OpenAI TTS ────────────────────────────────────────────────────────────────

/**
 * Call OpenAI TTS API, decode the MP3 response, and play it via AudioContext.
 * Returns a cancel function.
 */
async function speakOpenAI(
  text:     string,
  apiKey:   string,
  voice:    string,
  opts:     SpeakOptions,
  cancelRef: { cancelled: boolean },
): Promise<void> {
  const clean = preprocessText(text)

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: clean,
      voice,
      response_format: 'mp3',
      speed: 0.95,         // slightly slower = JARVIS authoritative pace
    }),
  })

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText)
    throw new Error(`OpenAI TTS ${res.status}: ${msg}`)
  }

  if (cancelRef.cancelled) return

  const arrayBuf = await res.arrayBuffer()
  if (cancelRef.cancelled) return

  const ctx = getAudioCtx()
  const audioBuf = await ctx.decodeAudioData(arrayBuf)
  if (cancelRef.cancelled) return

  return new Promise<void>((resolve, reject) => {
    const src = ctx.createBufferSource()
    src.buffer = audioBuf
    src.connect(ctx.destination)
    src.onended = () => resolve()
    // Store source so we can stop it on cancel
    ;(cancelRef as { cancelled: boolean; source?: AudioBufferSourceNode }).source = src
    src.start()
    opts.onStart?.()
  })
}

// ── Main speak function ───────────────────────────────────────────────────────

export interface SpeakOptions {
  onStart?:  () => void
  onEnd?:    () => void
  onError?:  () => void
}

/**
 * Speak `text`.
 * Uses OpenAI TTS if configured, otherwise Web Speech API pt-BR.
 * Returns a cancel function.
 */
export function speakText(text: string, opts: SpeakOptions = {}): () => void {
  const cancelRef = { cancelled: false, source: undefined as AudioBufferSourceNode | undefined }

  const cfg       = loadAIConfig()
  const useOpenAI = cfg?.ttsProvider === 'openai-tts'
  const openAIKey = cfg?.ttsApiKey || (cfg?.provider === 'openai' ? cfg.apiKey : '')
  const voice     = cfg?.ttsVoice || 'onyx'

  if (useOpenAI && openAIKey) {
    // ── OpenAI TTS path ──────────────────────────────────────────────────────
    opts.onStart?.()
    speakOpenAI(text, openAIKey, voice, opts, cancelRef)
      .then(() => { if (!cancelRef.cancelled) opts.onEnd?.() })
      .catch(err => {
        console.warn('[JARVIS TTS] OpenAI error, falling back to browser:', err.message)
        if (!cancelRef.cancelled) speakBrowser(text, opts, cancelRef)
      })
  } else {
    // ── Browser Web Speech API — tuned for JARVIS voice ──────────────────────
    speakBrowser(text, opts, cancelRef)
  }

  return () => {
    cancelRef.cancelled = true
    cancelRef.source?.stop?.()
    window.speechSynthesis?.cancel()
  }
}

/** Browser Web Speech API implementation */
function speakBrowser(
  text:      string,
  opts:      SpeakOptions,
  cancelRef: { cancelled: boolean },
): void {
  if (typeof window === 'undefined') { opts.onEnd?.(); return }
  window.speechSynthesis.cancel()

  const clean  = preprocessText(text)
  const chunks = splitIntoChunks(clean)
  let idx     = 0
  let started = false

  const speakNext = () => {
    if (cancelRef.cancelled || idx >= chunks.length) {
      if (!cancelRef.cancelled) opts.onEnd?.()
      return
    }

    const utt   = new SpeechSynthesisUtterance(chunks[idx])
    const voice = pickVoice()
    if (voice) utt.voice = voice
    utt.lang   = TTS_PARAMS.lang
    utt.pitch  = TTS_PARAMS.pitch
    utt.rate   = TTS_PARAMS.rate
    utt.volume = TTS_PARAMS.volume

    utt.onstart = () => {
      if (!started) { started = true; opts.onStart?.() }
    }

    const watchdog = setTimeout(() => {
      if (!cancelRef.cancelled && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause()
        window.speechSynthesis.resume()
      }
    }, 10_000)

    utt.onend = () => {
      clearTimeout(watchdog)
      idx++
      setTimeout(speakNext, 20)
    }

    utt.onerror = (e) => {
      clearTimeout(watchdog)
      if (e.error === 'interrupted' || e.error === 'canceled') return
      console.warn('[JARVIS voice] TTS error:', e.error)
      opts.onError?.()
    }

    window.speechSynthesis.speak(utt)
  }

  if (_audioCtx?.state === 'suspended') {
    _audioCtx.resume().then(speakNext)
  } else {
    speakNext()
  }
}
