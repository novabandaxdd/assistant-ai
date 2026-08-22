import { useEffect, useRef, useState } from 'react'
import { useBrainStore } from '../../store/brainStore'
import { isAIConfigured } from '../../utils/aiService'
import { unlockXttsAudio } from '../../utils/xttsService'
import styles from './JarvisChat.module.css'
import type { JarvisMessage } from '../../types'

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Hoje'
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/** Group messages by date so we can render date separators */
function groupByDate(msgs: JarvisMessage[]) {
  const groups: { date: string; msgs: JarvisMessage[] }[] = []
  let lastDate = ''
  for (const msg of msgs) {
    const d = formatDate(msg.timestamp)
    if (d !== lastDate) {
      groups.push({ date: d, msgs: [] })
      lastDate = d
    }
    groups[groups.length - 1].msgs.push(msg)
  }
  return groups
}

export default function JarvisChat() {
  const chatOpen        = useBrainStore(s => s.chatOpen)
  const chatHistory     = useBrainStore(s => s.chatHistory)
  const sessions        = useBrainStore(s => s.sessions)
  const activeSessionId = useBrainStore(s => s.activeSessionId)
  const setChatOpen     = useBrainStore(s => s.setChatOpen)
  const newSession      = useBrainStore(s => s.newSession)
  const loadSession     = useBrainStore(s => s.loadSession)
  const removeSession   = useBrainStore(s => s.removeSession)
  const voiceState      = useBrainStore(s => s.voiceState)

  const [input, setInput]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [aiConfigured, setAiConfigured] = useState(isAIConfigured())
  const [showSessions, setShowSessions] = useState(false)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const check = () => setAiConfigured(isAIConfigured())
    window.addEventListener('jarvis:config-changed', check)
    return () => window.removeEventListener('jarvis:config-changed', check)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  useEffect(() => {
    setLoading(voiceState === 'thinking')
  }, [voiceState])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`
  }, [input])

  const sendText = () => {
    const text = input.trim()
    if (!text || loading) return
    unlockXttsAudio()
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    window.dispatchEvent(new CustomEvent('jarvis:input', { detail: text }))
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText() }
  }

  if (!chatOpen) return null

  const groups = groupByDate(chatHistory)

  return (
    <div className={styles.panel}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div className={styles.title}>
          <span className={styles.dot} />
          <span>J.A.R.V.I.S.</span>
        </div>
        <div className={styles.headerRight}>
          <div className={`${styles.aiBadge} ${aiConfigured ? styles.aiOn : styles.aiOff}`}>
            {aiConfigured ? '⚡ AI' : '⚙ Local'}
          </div>
          {/* Sessions toggle */}
          <button
            className={`${styles.iconBtn} ${showSessions ? styles.iconBtnActive : ''}`}
            onClick={() => setShowSessions(s => !s)}
            title="Histórico de conversas"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
          {/* New session */}
          <button
            className={styles.iconBtn}
            onClick={() => { newSession(); setShowSessions(false) }}
            title="Nova conversa"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <button className={styles.close} onClick={() => setChatOpen(false)} title="Fechar">✕</button>
        </div>
      </div>

      {/* ── Sessions drawer ───────────────────────────────────────────────── */}
      {showSessions && (
        <div className={styles.sessions}>
          <div className={styles.sessionsHeader}>Conversas salvas</div>
          {sessions.length === 0 && (
            <div className={styles.sessionsEmpty}>Nenhuma conversa ainda.</div>
          )}
          {sessions.map(s => (
            <div
              key={s.id}
              className={`${styles.sessionItem} ${s.id === activeSessionId ? styles.sessionActive : ''}`}
              onClick={() => { loadSession(s.id); setShowSessions(false) }}
            >
              <div className={styles.sessionTitle}>{s.title}</div>
              <div className={styles.sessionMeta}>
                {formatDate(s.updatedAt)} · {s.messages.length} msgs
              </div>
              <button
                className={styles.sessionDel}
                onClick={e => { e.stopPropagation(); removeSession(s.id) }}
                title="Apagar"
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Messages ─────────────────────────────────────────────────────── */}
      <div className={styles.messages}>
        {chatHistory.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>J</div>
            <span>Diga algo ou escreva um comando, Senhor.</span>
          </div>
        ) : (
          groups.map(group => (
            <div key={group.date}>
              <div className={styles.dateSep}>{group.date}</div>
              {group.msgs.map((msg: JarvisMessage) => (
                <div
                  key={msg.id}
                  className={`${styles.msg} ${msg.role === 'jarvis' ? styles.jarvisMsg : styles.userMsg}`}
                >
                  {msg.role === 'jarvis' && <span className={styles.avatar}>J</span>}
                  <div className={styles.bubbleWrap}>
                    <div className={styles.bubble}>{msg.text}</div>
                    <div className={styles.msgTime}>{formatTime(msg.timestamp)}</div>
                  </div>
                  {msg.role === 'user' && <span className={styles.userAvatar}>Eu</span>}
                </div>
              ))}
            </div>
          ))
        )}
        {loading && (
          <div className={`${styles.msg} ${styles.jarvisMsg}`}>
            <span className={styles.avatar}>J</span>
            <div className={`${styles.bubble} ${styles.thinking}`}>
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input ────────────────────────────────────────────────────────── */}
      <div className={styles.inputRow}>
        <textarea
          ref={textareaRef}
          className={styles.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={aiConfigured ? 'Pergunte ao JARVIS... (Enter para enviar)' : 'Digite um comando...'}
          disabled={loading}
          rows={1}
          autoFocus
        />
        <button className={styles.send} onClick={sendText} disabled={loading || !input.trim()} title="Enviar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  )
}
