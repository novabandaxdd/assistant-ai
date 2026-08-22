import { useState, useEffect, useCallback, useRef } from 'react'
import { useBrainStore } from '../store/brainStore'
import {
  initVoice,
  speakText,
  resetVoiceCache,
} from '../utils/jarvisVoice'
import { isAIConfigured } from '../utils/aiService'
import { unlockXttsAudio } from '../utils/xttsService'

export interface SpeechHook {
  isListening:    boolean
  isSpeaking:     boolean
  startListening: () => void
  stopListening:  () => void
  speak:          (text: string) => void
  cancelSpeech:   () => void
  supported:      boolean
  transcript:     string
  aiConfigured:   boolean
}

// ─────────────────────────────────────────────────────────────────────────────
export function useSpeech(): SpeechHook {
  const [isListening,  setIsListening]  = useState(false)
  const [isSpeaking,   setIsSpeaking]   = useState(false)
  const [transcript,   setTranscript]   = useState('')
  const [aiConfigured, setAiConfigured] = useState(isAIConfigured())

  const recogRef      = useRef<SpeechRecognition | null>(null)
  const cancelSpeakFn = useRef<(() => void) | null>(null)

  // ── Store refs ────────────────────────────────────────────────────────────
  const setVoiceState = useBrainStore(s => s.setVoiceState)
  const setVoiceStateRef = useRef(setVoiceState)
  useEffect(() => { setVoiceStateRef.current = setVoiceState }, [setVoiceState])

  const supported =
    typeof window !== 'undefined' &&
    ('speechSynthesis' in window) &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  // ── Boot voice engine once ────────────────────────────────────────────────
  useEffect(() => {
    if (!supported) return
    initVoice()
  }, [supported])

  // ── Sync AI config ────────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => {
      setAiConfigured(isAIConfigured())
      resetVoiceCache()
    }
    window.addEventListener('jarvis:config-changed', check)
    return () => window.removeEventListener('jarvis:config-changed', check)
  }, [])

  // ── speak ─────────────────────────────────────────────────────────────────
  const speak = useCallback((text: string) => {
    if (!supported || !text.trim()) return
    cancelSpeakFn.current?.()
    setIsSpeaking(true)
    setVoiceStateRef.current('speaking')

    const cancel = speakText(text, {
      onStart: () => {
        setIsSpeaking(true)
        setVoiceStateRef.current('speaking')
      },
      onEnd: () => {
        setIsSpeaking(false)
        setVoiceStateRef.current('idle')
        cancelSpeakFn.current = null
      },
      onError: () => {
        setIsSpeaking(false)
        setVoiceStateRef.current('idle')
        cancelSpeakFn.current = null
      },
    })
    cancelSpeakFn.current = cancel
  }, [supported])

  const cancelSpeech = useCallback(() => {
    cancelSpeakFn.current?.()
    cancelSpeakFn.current = null
    window.speechSynthesis?.cancel()
    setIsSpeaking(false)
    setVoiceStateRef.current('idle')
  }, [])

  // ── startListening ────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!supported || isListening) return
    // Unlock AudioContext synchronously inside this gesture
    unlockXttsAudio()
    // Stop speaking first — prevents mic picking up JARVIS
    cancelSpeakFn.current?.()
    window.speechSynthesis?.cancel()

    const SR = window.SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition: typeof SpeechRecognition }).webkitSpeechRecognition
    const recog = new SR()
    recog.lang            = 'pt-BR'
    recog.continuous      = false
    recog.interimResults  = false
    recog.maxAlternatives = 1

    recog.onstart = () => {
      setIsListening(true)
      setVoiceStateRef.current('listening')
    }
    recog.onend = () => {
      setIsListening(false)
      // voiceState reset handled by the engine hook after processing
    }
    recog.onerror = (e) => {
      setIsListening(false)
      const ignored = ['no-speech', 'aborted']
      if (!ignored.includes(e.error)) {
        // Dispatch error as a message via the engine
        window.dispatchEvent(new CustomEvent('jarvis:recognition-error', { detail: e.error }))
      }
      setVoiceStateRef.current('idle')
    }
    recog.onresult = (e: SpeechRecognitionEvent) => {
      const heard = e.results[0]?.[0]?.transcript?.trim()
      if (heard) {
        // dispatch to the singleton engine — NOT called directly
        window.dispatchEvent(new CustomEvent('jarvis:input', { detail: heard }))
      }
    }

    recogRef.current = recog
    recog.start()
  }, [supported, isListening])

  const stopListening = useCallback(() => {
    recogRef.current?.stop()
    setIsListening(false)
  }, [])

  // Expose transcript setter for engine to update
  const setTranscriptRef = useRef(setTranscript)
  useEffect(() => { setTranscriptRef.current = setTranscript }, [])

  return {
    isListening, isSpeaking, startListening, stopListening,
    speak, cancelSpeech, supported, transcript, aiConfigured,
  }
}
