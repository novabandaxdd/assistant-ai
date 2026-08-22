import { useState } from 'react'
import { useBrainStore } from '../../store/brainStore'
import { useSpeech } from '../../hooks/useSpeech'
import styles from './BottomBar.module.css'

export default function BottomBar() {
  const [input, setInput] = useState('')
  const voiceState  = useBrainStore(s => s.voiceState)
  const { isListening, isSpeaking, startListening, stopListening, supported } = useSpeech()

  const sendText = () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    // Route through useSpeech handleInput — handles AI + NLP + speak + chat open
    window.dispatchEvent(new CustomEvent('jarvis:input', { detail: text }))
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); sendText() }
  }

  return (
    <div className={styles.bar}>
      {/* Ask input */}
      <div className={styles.inputWrap}>
        <input
          className={styles.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder='Pergunte · "me lembre de..." · "bom dia" · "mostre..."  ·'
        />
      </div>

      {/* Action icons */}
      <div className={styles.actions}>
        {/* Pencil — write/note */}
        <button className={styles.action} title="Registrar nota" onClick={() => {
          window.dispatchEvent(new CustomEvent('jarvis:input', { detail: 'quero registrar uma nota' }))
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>

        {/* Monitor — display */}
        <button className={styles.action} title="Visualização do grafo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <path d="M8 21h8M12 17v4"/>
          </svg>
        </button>

        {/* Bell — reminder */}
        <button className={styles.action} title="Lembretes">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </button>

        {/* Lightbulb — ideas */}
        <button className={styles.action} title="Ideias" onClick={() => {
          window.dispatchEvent(new CustomEvent('jarvis:input', { detail: 'quais são os principais hubs do meu grafo?' }))
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/>
            <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>
          </svg>
        </button>

        {/* Mic — voice */}
        <button
          className={`${styles.action} ${isListening ? styles.actionActive : ''} ${isSpeaking ? styles.actionSpeaking : ''}`}
          title={isListening ? 'Parar de ouvir' : isSpeaking ? 'Falando...' : 'Comando de voz'}
          onClick={() => {
            if (!supported) return
            isListening ? stopListening() : startListening()
          }}
        >
          {isListening ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
            </svg>
          )}
        </button>
      </div>

      {/* Voice state indicator */}
      {voiceState !== 'idle' && (
        <div className={styles.voiceIndicator}>
          <span className={`${styles.voiceDot} ${styles[voiceState]}`} />
          <span>{voiceState === 'listening' ? 'Ouvindo...' : voiceState === 'thinking' ? 'Pensando...' : 'Falando...'}</span>
        </div>
      )}
    </div>
  )
}
