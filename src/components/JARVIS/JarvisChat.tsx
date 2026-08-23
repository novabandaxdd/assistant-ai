import { useEffect, useRef, useState, useCallback } from 'react'
import { useBrainStore } from '../../store/brainStore'
import { isAIConfigured, loadAIConfig } from '../../utils/aiService'
import { vaultGet } from '../../utils/secureVault'
import { unlockXttsAudio } from '../../utils/xttsService'
import styles from './JarvisChat.module.css'
import type { JarvisMessage } from '../../types'

// ── Helpers ─────────────────────────────────────────────────────────────────

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

// ── Markdown renderer ────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let key = 0
  const combined = /(\*\*(.+?)\*\*)|(`([^`]+)`)|(https?:\/\/[^\s<>"')]+)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  combined.lastIndex = 0
  while ((match = combined.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    if (match[1])      parts.push(<strong key={key++}>{match[2]}</strong>)
    else if (match[3]) parts.push(<code key={key++} className={styles.inlineCode}>{match[4]}</code>)
    else if (match[5]) parts.push(
      <a key={key++} href={match[5]} target="_blank" rel="noopener noreferrer" className={styles.msgLink}>{match[5]}</a>
    )
    lastIndex = combined.lastIndex
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

function renderMessage(text: string): React.ReactNode {
  const lines = text.split('\n')
  const nodes: React.ReactNode[] = []
  let key = 0
  for (const line of lines) {
    if (/^- (.+)/.test(line)) {
      nodes.push(
        <div key={key++} className={styles.bulletItem}>
          <span className={styles.bulletDot}>•</span>
          <span>{renderInline(line.replace(/^- /, ''))}</span>
        </div>
      )
    } else if (/^\d+\. (.+)/.test(line)) {
      const m = line.match(/^(\d+)\. (.+)/)!
      nodes.push(
        <div key={key++} className={styles.numberedItem}>
          <span className={styles.numberedDot}>{m[1]}.</span>
          <span>{renderInline(m[2])}</span>
        </div>
      )
    } else if (line.trim() === '') {
      nodes.push(<div key={key++} className={styles.msgSpacer} />)
    } else {
      nodes.push(<div key={key++}>{renderInline(line)}</div>)
    }
  }
  return <>{nodes}</>
}

// ── Image generation ─────────────────────────────────────────────────────────

async function generateImageWithGemini(prompt: string): Promise<string | null> {
  const cfg = loadAIConfig()
  if (!cfg || cfg.provider !== 'gemini') return null

  const apiKey = await vaultGet('gemini')
  if (!apiKey) return null

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1 },
      }),
    }
  )
  if (!res.ok) return null
  const data = await res.json() as { predictions?: Array<{ bytesBase64Encoded?: string }> }
  const b64 = data.predictions?.[0]?.bytesBase64Encoded
  return b64 ? `data:image/png;base64,${b64}` : null
}

// ── Thinking text cycling ─────────────────────────────────────────────────────

const THINKING_TEXTS = [
  'Consultando grafo…',
  'Processando contexto…',
  'Formulando resposta…',
  'Analisando conexões…',
]

function ThinkingBubble() {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % THINKING_TEXTS.length), 1600)
    return () => clearInterval(id)
  }, [])
  return (
    <div className={`${styles.bubble} ${styles.thinking}`}>
      <div className={styles.thinkingDots}>
        <span /><span /><span />
      </div>
      <span className={styles.thinkingText}>{THINKING_TEXTS[idx]}</span>
    </div>
  )
}

// ── Quick chips ───────────────────────────────────────────────────────────────

const QUICK_CHIPS = [
  { icon: '📊', label: 'Status do projeto' },
  { icon: '🧠', label: 'Resumir grafo' },
  { icon: '✅', label: 'Criar atividade' },
  { icon: '🔍', label: 'Analisar saúde' },
  { icon: '🌐', label: 'Mostrar hubs' },
  { icon: '🎨', label: 'Gerar imagem' },
]

// ── Image bubble ──────────────────────────────────────────────────────────────

function ImageBubble({ src, prompt }: { src: string; prompt: string }) {
  return (
    <div className={styles.imageBubble}>
      <img src={src} alt={prompt} className={styles.generatedImage} />
      <div className={styles.imageCaption}>{prompt}</div>
    </div>
  )
}

// ── Message bubble ─────────────────────────────────────────────────────────────

function JarvisBubble({
  msg,
  prevUserText,
}: {
  msg: JarvisMessage & { imageUrl?: string }
  prevUserText?: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(msg.text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }, [msg.text])

  const handleRetry = useCallback(() => {
    if (!prevUserText) return
    unlockXttsAudio()
    window.dispatchEvent(new CustomEvent('jarvis:input', { detail: prevUserText }))
  }, [prevUserText])

  return (
    <div className={styles.bubbleWrap}>
      <div className={`${styles.bubble} ${styles.jarvisBubble}`}>
        {msg.imageUrl && <ImageBubble src={msg.imageUrl} prompt={msg.text} />}
        {!msg.imageUrl && <div className={styles.msgContent}>{renderMessage(msg.text)}</div>}
        <div className={styles.msgActions}>
          <button
            className={`${styles.actionBtn} ${copied ? styles.actionBtnActive : ''}`}
            onClick={handleCopy}
            title={copied ? 'Copiado!' : 'Copiar'}
          >
            {copied ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
          {prevUserText && (
            <button className={styles.actionBtn} onClick={handleRetry} title="Reenviar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 .49-3.9" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className={styles.msgTime}>{formatTime(msg.timestamp)}</div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

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
  const addMessage      = useBrainStore(s => s.addMessage)

  const [input, setInput]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [aiConfigured, setAiConfigured] = useState(isAIConfigured())
  const [showSessions, setShowSessions] = useState(false)
  const [generatingImage, setGeneratingImage] = useState(false)
  const bottomRef   = useRef<HTMLDivElement>(null)
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
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [input])

  // ── Image generation flow ───────────────────────────────────────────────────
  const handleImageGenerate = useCallback(async (prompt: string) => {
    if (!prompt.trim()) return
    setGeneratingImage(true)
    // Add user message
    addMessage({ role: 'user', text: prompt })
    try {
      const imgUrl = await generateImageWithGemini(prompt)
      if (imgUrl) {
        // Store as JARVIS message with image URL embedded in text (JSON format)
        addMessage({ role: 'jarvis', text: `__IMAGE__${imgUrl}__PROMPT__${prompt}` })
      } else {
        addMessage({ role: 'jarvis', text: `Senhor, a geração de imagens requer Gemini configurado com acesso ao Imagen. Certifique-se de usar o provider Gemini nas configurações.` })
      }
    } catch {
      addMessage({ role: 'jarvis', text: 'Erro ao gerar imagem. Verifique a chave da API Gemini.' })
    } finally {
      setGeneratingImage(false)
    }
  }, [addMessage])

  const sendText = (text?: string) => {
    const t = (text ?? input).trim()
    if (!t || loading || generatingImage) return
    unlockXttsAudio()
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    // Detect image generation intent
    const isImageRequest = /^(ger[ae]|cri[ae]|fa[çz]a?|draw|paint|image|imagem|foto|ilustr|desenh)/i.test(t)
    if (isImageRequest && aiConfigured) {
      void handleImageGenerate(t)
      return
    }

    window.dispatchEvent(new CustomEvent('jarvis:input', { detail: t }))
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText() }
  }

  const handleChip = (chip: string) => {
    if (chip === 'Gerar imagem') {
      setInput('Gere uma imagem de ')
      setTimeout(() => textareaRef.current?.focus(), 50)
      return
    }
    unlockXttsAudio()
    window.dispatchEvent(new CustomEvent('jarvis:input', { detail: chip }))
  }

  if (!chatOpen) return null

  const groups = groupByDate(chatHistory)
  const isProcessing = loading || generatingImage

  return (
    <div className={styles.panel}>

      {/* ── Header */}
      <div className={styles.header}>
        <div className={styles.title}>
          <span className={styles.statusDot} data-state={voiceState} />
          <span className={styles.titleText}>J.A.R.V.I.S.</span>
          <div className={`${styles.aiBadge} ${aiConfigured ? styles.aiOn : styles.aiOff}`}>
            {aiConfigured ? '⚡ AI' : '⚙ Local'}
          </div>
        </div>
        <div className={styles.headerActions}>
          <button
            className={`${styles.iconBtn} ${showSessions ? styles.iconBtnActive : ''}`}
            onClick={() => setShowSessions(s => !s)}
            title="Histórico de conversas"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
          <button
            className={styles.iconBtn}
            onClick={() => { newSession(); setShowSessions(false) }}
            title="Nova conversa"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <button className={styles.closeBtn} onClick={() => setChatOpen(false)} title="Fechar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="12" height="12">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Sessions drawer */}
      {showSessions && (
        <div className={styles.sessions}>
          <div className={styles.sessionsHeader}>Conversas salvas</div>
          {sessions.length === 0 && (
            <div className={styles.sessionsEmpty}>Nenhuma conversa salva.</div>
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

      {/* ── Messages */}
      <div className={styles.messages}>
        {chatHistory.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyRing}>
              <span className={styles.emptyLogo}>J</span>
            </div>
            <p className={styles.emptyText}>Olá, Senhor. Como posso ajudar?</p>
            <p className={styles.emptyHint}>Pergunte sobre seus projetos, crie atividades ou gere imagens.</p>
          </div>
        ) : (
          groups.map(group => (
            <div key={group.date}>
              <div className={styles.dateSep}><span>{group.date}</span></div>
              {group.msgs.map((msg: JarvisMessage) => {
                const globalIdx = chatHistory.indexOf(msg)
                const prevUser = globalIdx > 0
                  ? chatHistory.slice(0, globalIdx).reverse().find(m => m.role === 'user')
                  : undefined

                // Parse image messages
                const isImageMsg = msg.role === 'jarvis' && msg.text.startsWith('__IMAGE__')
                let imageUrl: string | undefined
                let displayText = msg.text
                if (isImageMsg) {
                  const imgMatch = msg.text.match(/^__IMAGE__(.+?)__PROMPT__(.+)$/)
                  if (imgMatch) { imageUrl = imgMatch[1]; displayText = imgMatch[2] }
                }

                return (
                  <div
                    key={msg.id}
                    className={`${styles.msg} ${msg.role === 'jarvis' ? styles.jarvisMsg : styles.userMsg}`}
                  >
                    {msg.role === 'jarvis' && (
                      <div className={styles.avatar}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="12" height="12">
                          <circle cx="12" cy="12" r="10"/>
                          <path d="M12 8v4l3 3"/>
                        </svg>
                      </div>
                    )}
                    {msg.role === 'jarvis' ? (
                      <JarvisBubble
                        msg={{ ...msg, text: displayText, imageUrl }}
                        prevUserText={prevUser?.text}
                      />
                    ) : (
                      <div className={styles.bubbleWrap}>
                        <div className={`${styles.bubble} ${styles.userBubble}`}>{msg.text}</div>
                        <div className={styles.msgTime}>{formatTime(msg.timestamp)}</div>
                      </div>
                    )}
                    {msg.role === 'user' && (
                      <div className={styles.userAvatar}>Eu</div>
                    )}
                  </div>
                )
              })}
            </div>
          ))
        )}
        {(isProcessing) && (
          <div className={`${styles.msg} ${styles.jarvisMsg}`}>
            <div className={styles.avatar}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="12" height="12">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4l3 3"/>
              </svg>
            </div>
            <ThinkingBubble />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Quick chips */}
      {chatHistory.length === 0 && !isProcessing && (
        <div className={styles.quickChips}>
          {QUICK_CHIPS.map(chip => (
            <button
              key={chip.label}
              className={styles.quickChip}
              onClick={() => handleChip(chip.label)}
            >
              <span className={styles.chipIcon}>{chip.icon}</span>
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Input */}
      <div className={`${styles.inputRow} ${isProcessing ? styles.inputRowLoading : ''}`}>
        <textarea
          ref={textareaRef}
          className={styles.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={aiConfigured ? 'Pergunte ao JARVIS… (Enter para enviar)' : 'Digite um comando…'}
          disabled={isProcessing}
          rows={1}
        />
        <button
          className={`${styles.sendBtn} ${input.trim() ? styles.sendBtnActive : ''}`}
          onClick={() => sendText()}
          disabled={isProcessing || !input.trim()}
          title="Enviar"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>

    </div>
  )
}
