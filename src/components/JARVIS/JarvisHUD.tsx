import { useEffect, useRef, useState, useCallback } from 'react'
import { useBrainStore } from '../../store/brainStore'
import { useSpeech } from '../../hooks/useSpeech'
import { loadAIConfig } from '../../utils/aiService'
import type { VoiceState } from '../../types'
import ProjectSwitcher from '../Projects/ProjectSwitcher'
import SyncPanel from '../Sync/SyncPanel'
import { useSyncStore } from '../../store/syncStore'
import styles from './JarvisHUD.module.css'

// ── User Profile Badge ────────────────────────────────────────────────────────
function UserProfileBadge({ onOpenSync }: { onOpenSync: () => void }) {
  const user = useSyncStore(s => s.user)
  if (!user) return null
  return (
    <button
      className={styles.profileBadge}
      onClick={e => { e.stopPropagation(); onOpenSync() }}
      title={`${user.name} — ${user.email}\nClick to open Sync settings`}
    >
      {user.avatar
        ? <img src={user.avatar} alt={user.name} className={styles.profileAvatar} />
        : <span className={styles.profileInitial}>{user.name.charAt(0).toUpperCase()}</span>
      }
      <span className={styles.profileName}>{user.name.split(' ')[0]}</span>
    </button>
  )
}

interface JarvisHUDProps {
  onFit?: () => void
}

// ── Per-state theme ───────────────────────────────────────────────────────────
const STATE_THEME: Record<VoiceState, {
  label:     string
  subLabel:  string
  dot:       string
  ring:      string
  glow:      string
  centerGlow: string
  arc:       string
}> = {
  idle: {
    label:      'STANDBY',
    subLabel:   'clique para falar…',
    dot:        '#4ade80',
    ring:       '#00e5ff',
    glow:       'rgba(0,229,255,0.35)',
    centerGlow: 'rgba(0,80,80,0.0)',
    arc:        '#f59e0b',
  },
  listening: {
    label:      'OUVINDO',
    subLabel:   'ouvindo, Senhor…',
    dot:        '#4ade80',
    ring:       '#00e5ff',
    glow:       'rgba(0,229,255,0.75)',
    centerGlow: 'rgba(0,120,100,0.18)',
    arc:        '#f59e0b',
  },
  thinking: {
    label:      'PENSANDO',
    subLabel:   'processando…',
    dot:        '#f59e0b',
    ring:       '#f59e0b',
    glow:       'rgba(245,158,11,0.65)',
    centerGlow: 'rgba(80,60,0,0.18)',
    arc:        '#f59e0b',
  },
  speaking: {
    label:      'FALANDO',
    subLabel:   '',
    dot:        '#00e5ff',
    ring:       '#00e5ff',
    glow:       'rgba(0,229,255,0.9)',
    centerGlow: 'rgba(0,160,120,0.35)',
    arc:        '#f59e0b',
  },
}

const MODEL_LABELS: Record<string, string> = {
  'global/anthropic.claude-sonnet-4-6':        'CLAUDE SONNET 4.6',
  'global/anthropic.claude-sonnet-4-5-2025...': 'CLAUDE SONNET 4.5',
  'global/anthropic.claude-haiku-4-5-2025...':  'CLAUDE HAIKU 4.5',
  'global/openai.gpt-4o':                       'GPT-4O',
  'global/gpt-5.1-chat':                        'GPT-5.1',
  'global/gpt-5.4-gus':                         'GPT-5.4',
  'global/gemini-3-flash-preview':              'GEMINI FLASH',
  'global/groq/compound':                       'GROQ COMPOUND',
  'global/ibm/granite-4-h-small':               'IBM GRANITE',
  'claude-opus-4-5':                            'CLAUDE OPUS 4.5',
  'claude-sonnet-4-5':                          'CLAUDE SONNET 4.5',
  'claude-haiku-4-5':                           'CLAUDE HAIKU 4.5',
  'gpt-4o':                                     'GPT-4O',
  'gpt-4o-mini':                                'GPT-4O MINI',
  'gpt-4-turbo':                                'GPT-4 TURBO',
  'local-nlp':                                  'LOCAL NLP',
}

const PROVIDER_DEFAULT_LABELS: Record<string, string> = {
  gemini:          'GEMINI FLASH',
  roo:             'CLAUDE SONNET 4.6',
  claude:          'CLAUDE OPUS 4.5',
  openai:          'GPT-4O',
  cline:           'GPT-4O',
  'openai-compat': 'COMPAT',
  local:           'LOCAL NLP',
}

function getModelLabel(): string {
  const cfg = loadAIConfig()
  if (!cfg || cfg.provider === 'local') return 'LOCAL NLP'
  const model = cfg.model?.trim()
  if (!model) return PROVIDER_DEFAULT_LABELS[cfg.provider] ?? cfg.provider.toUpperCase()
  if (MODEL_LABELS[model]) return MODEL_LABELS[model]
  const last = model.split('/').pop() ?? model
  return last
    .replace(/^anthropic\./i, '')
    .replace(/^openai\./i,    '')
    .replace(/-20\d\d.*$/,    '')
    .toUpperCase()
    .slice(0, 20)
}

// ── Persist helpers ───────────────────────────────────────────────────────────
const STORAGE_KEY = 'jarvis-hud-layout'

interface HUDLayout { x: number; y: number; size: number }

/** True when the initial render is on a small screen (≤ 640px logical pixels) */
function isMobileScreen(): boolean {
  return window.innerWidth <= 640
}

const MOBILE_SIZE = 150  // px — fixed size on mobile

function loadLayout(): HUDLayout {
  if (isMobileScreen()) {
    // Mobile: fixed bottom-right, no persistence of position
    return {
      x:    window.innerWidth  - MOBILE_SIZE - 12,
      y:    window.innerHeight - MOBILE_SIZE - 100,
      size: MOBILE_SIZE,
    }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as HUDLayout
      if (typeof p.x === 'number' && typeof p.y === 'number' && typeof p.size === 'number') {
        // clamp to viewport in case window was resized
        return {
          x:    Math.max(0, Math.min(p.x, window.innerWidth  - p.size)),
          y:    Math.max(0, Math.min(p.y, window.innerHeight - p.size - 80)),
          size: Math.max(120, Math.min(p.size, 400)),
        }
      }
    }
  } catch { /* ignore */ }
  // default: bottom-right, 240px
  return {
    x: window.innerWidth  - 240 - 16,
    y: window.innerHeight - 240 - 120, // account for labels below
    size: 240,
  }
}

function saveLayout(layout: HUDLayout) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)) } catch { /* ignore */ }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function JarvisHUD({ onFit }: JarvisHUDProps) {
  const voiceState  = useBrainStore(s => s.voiceState)
  const chatOpen    = useBrainStore(s => s.chatOpen)
  const setChatOpen = useBrainStore(s => s.setChatOpen)
  const { isListening, startListening, stopListening } = useSpeech()

  const syncStatus = useSyncStore(s => s.status)
  const [syncOpen, setSyncOpen] = useState(false)

  const [, forceUpdate] = useState(0)
  useEffect(() => {
    const handler = () => forceUpdate(n => n + 1)
    window.addEventListener('jarvis:config-changed', handler)
    return () => window.removeEventListener('jarvis:config-changed', handler)
  }, [])

  void onFit

  // ── Mobile detection (reactive to resize) ────────────────────────────────
  const [isMobile, setIsMobile] = useState(isMobileScreen)
  useEffect(() => {
    const onResize = () => {
      const mobile = isMobileScreen()
      setIsMobile(mobile)
      if (mobile) {
        // Re-anchor to bottom-right on resize to mobile
        setLayout({
          x:    window.innerWidth  - MOBILE_SIZE - 12,
          y:    window.innerHeight - MOBILE_SIZE - 100,
          size: MOBILE_SIZE,
        })
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── Layout state ─────────────────────────────────────────────────────────
  const [layout, setLayout] = useState<HUDLayout>(loadLayout)

  const layoutRef = useRef(layout)
  useEffect(() => { layoutRef.current = layout }, [layout])

  const updateLayout = useCallback((next: Partial<HUDLayout>) => {
    setLayout(prev => {
      const updated = { ...prev, ...next }
      saveLayout(updated)
      return updated
    })
  }, [])

  // ── Drag ─────────────────────────────────────────────────────────────────
  const dragRef  = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const isDragging = useRef(false)

  const onDragStart = useCallback((e: React.PointerEvent) => {
    if (isMobileScreen()) return  // no drag on mobile
    // Only drag via header strip — not SVG clicks
    if ((e.target as HTMLElement).closest('svg') || (e.target as HTMLElement).closest('button')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: layoutRef.current.x, origY: layoutRef.current.y }
    isDragging.current = false
  }, [])

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (!isDragging.current && Math.abs(dx) + Math.abs(dy) < 4) return
    isDragging.current = true
    const size = layoutRef.current.size
    const x = Math.max(0, Math.min(dragRef.current.origX + dx, window.innerWidth  - size))
    const y = Math.max(0, Math.min(dragRef.current.origY + dy, window.innerHeight - size - 80))
    updateLayout({ x, y })
  }, [updateLayout])

  const onDragEnd = useCallback(() => {
    dragRef.current = null
  }, [])

  // ── Resize (corner handle) ────────────────────────────────────────────────
  const resizeRef = useRef<{ startX: number; startY: number; origSize: number } | null>(null)

  const onResizeStart = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origSize: layoutRef.current.size }
  }, [])

  const onResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current) return
    const delta = ((e.clientX - resizeRef.current.startX) + (e.clientY - resizeRef.current.startY)) / 2
    const size  = Math.max(120, Math.min(400, resizeRef.current.origSize + delta))
    updateLayout({ size })
  }, [updateLayout])

  const onResizeEnd = useCallback(() => {
    resizeRef.current = null
  }, [])

  // ── Click guard (don't fire if dragged) ──────────────────────────────────
  const handleHUDClick = () => {
    if (isDragging.current) return
    if (isListening) { stopListening(); return }
    // Primary action: toggle chat panel
    setChatOpen(!chatOpen)
    // Also try mic if supported (non-blocking)
    if (!chatOpen) startListening()
  }

  const theme     = STATE_THEME[voiceState]
  const isActive  = voiceState !== 'idle'
  const isThinkin = voiceState === 'thinking'
  const modelLabel = getModelLabel()

  // Scale factor: 240 is the "native" SVG size
  const scale = layout.size / 240

  const ticks = Array.from({ length: 36 }, (_, i) => {
    const angle = (i * 10 - 90) * (Math.PI / 180)
    const r1 = 112, r2 = i % 9 === 0 ? 100 : 105
    return {
      x1: 120 + r1 * Math.cos(angle), y1: 120 + r1 * Math.sin(angle),
      x2: 120 + r2 * Math.cos(angle), y2: 120 + r2 * Math.sin(angle),
      major: i % 9 === 0,
    }
  })

  return (
    <div
      className={`${styles.hud} ${styles[voiceState]} ${isMobile ? styles.mobile : ''}`}
      style={{
        left:   layout.x,
        top:    layout.y,
        width:  layout.size,
        cursor: isMobile ? 'default' : (isDragging.current ? 'grabbing' : 'grab'),
      }}
      title={isListening ? 'Clique para parar' : 'Clique para falar com JARVIS'}
      onPointerDown={onDragStart}
      onPointerMove={e => { onDragMove(e); onResizeMove(e) }}
      onPointerUp={e => { onDragEnd(); onResizeEnd(); e.currentTarget.releasePointerCapture(e.pointerId) }}
      onPointerCancel={() => { dragRef.current = null; resizeRef.current = null }}
    >
      {/* ── SVG + center label ────────────────────────────────────────── */}
      <div className={styles.ringWrap} style={{ width: layout.size, height: layout.size }}>
        <svg
          className={styles.rings}
          viewBox="0 0 240 240"
          fill="none"
          style={{
            width: layout.size,
            height: layout.size,
            filter: `drop-shadow(0 0 ${14 * scale}px ${theme.glow})`,
          }}
          onClick={handleHUDClick}
        >
          <circle cx="120" cy="120" r="114" stroke={theme.ring} strokeWidth="1" strokeOpacity="0.25"
            strokeDasharray="3 6" className={styles.ringDot} />

          {ticks.map((t, i) => (
            <line key={i}
              x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
              stroke={theme.ring}
              strokeWidth={t.major ? 2 : 0.9}
              strokeOpacity={t.major ? 0.8 : 0.45}
            />
          ))}

          <circle cx="120" cy="120" r="106" stroke={theme.ring} strokeWidth="1.5" strokeOpacity="0.5"
            strokeDasharray="18 8" className={styles.ring1} />

          <circle cx="120" cy="120" r="106" stroke={theme.arc} strokeWidth="3" strokeOpacity="0.9"
            strokeDasharray="55 452"
            strokeDashoffset="-20"
            strokeLinecap="round"
            className={isThinkin ? styles.arcSpin : styles.arcStatic}
          />

          <circle cx="120" cy="120" r="106" stroke={theme.arc} strokeWidth="5" strokeOpacity="0.6"
            strokeDasharray="1 510"
            strokeDashoffset="-66"
          />

          <circle cx="120" cy="120" r="88" stroke={theme.ring} strokeWidth="1.2" strokeOpacity="0.4"
            strokeDasharray="40 15" className={styles.ring2} />

          <circle cx="120" cy="120" r="70" stroke={theme.ring} strokeWidth="0.8" strokeOpacity="0.25"
            strokeDasharray="5 7" className={styles.ring3} />

          <circle cx="120" cy="120" r="52"
            fill={isThinkin ? 'rgba(40,30,0,0.4)' : 'rgba(0,30,30,0.3)'}
            stroke={theme.ring} strokeWidth="1.5" strokeOpacity={isActive ? 0.7 : 0.3}
          />

          {isActive && (
            <circle cx="120" cy="120" r="118"
              stroke={theme.ring} strokeWidth="2" strokeOpacity="0.6"
              className={styles.pulse}
            />
          )}

        </svg>

        {/* Center label */}
        <div className={styles.centerLabel} onClick={handleHUDClick} style={{ pointerEvents: 'auto', cursor: 'pointer' }}>
          <span
            className={styles.logo}
            style={{
              color: theme.ring,
              textShadow: `0 0 14px ${theme.glow}, 0 0 28px ${theme.glow}`,
              fontSize: `${Math.round(13 * scale)}px`,
            }}
          >
            J.A.R.V.I.S.
          </span>
        </div>
      </div>

      {/* ── Below: glass panel with all controls ──────────────────────── */}
      <div className={styles.below}>

        {/* Row 1: profile (left) + sync badge (right) — hidden on mobile */}
        {!isMobile && (
          <div className={styles.profileSyncRow}>
            <UserProfileBadge onOpenSync={() => { if (!isDragging.current) setSyncOpen(true) }} />
            <button
              className={styles.syncBadge}
              onClick={e => { e.stopPropagation(); if (!isDragging.current) setSyncOpen(true) }}
              title={`Status do sync: ${syncStatus}`}
            >
              {syncStatus === 'synced'  && <span style={{ color: '#4ade80' }}>● Sync</span>}
              {syncStatus === 'syncing' && <span style={{ color: '#38bdf8' }}>↑ Sync…</span>}
              {syncStatus === 'failed'  && <span style={{ color: '#f87171' }}>✗ Falhou</span>}
              {syncStatus === 'offline' && <span style={{ color: '#94a3b8' }}>⊘ Offline</span>}
              {(syncStatus === 'idle' || syncStatus === 'conflict') && <span style={{ color: '#334155' }}>☁</span>}
            </button>
          </div>
        )}

        {/* Row 2: project switcher full width — hidden on mobile (too narrow) */}
        {!isMobile && (
          <div className={styles.projectRow}>
            <ProjectSwitcher />
          </div>
        )}

        {!isMobile && <div className={styles.belowDivider} />}

        {/* Row 3: state dot + label */}
        <div className={styles.stateRow}>
          <span className={styles.stateDot} style={{ background: theme.dot, boxShadow: `0 0 5px ${theme.dot}` }} />
          <span
            className={styles.stateLabel}
            style={{
              color: theme.dot === '#f59e0b' ? '#f59e0b' : '#e2e8f0',
              fontSize: `${Math.round(13 * scale)}px`,
            }}
          >
            {theme.label}
          </span>
        </div>

        {!isMobile && theme.subLabel && (
          <div className={styles.subLabel} style={{ fontSize: `${Math.round(10 * scale)}px` }}>
            {theme.subLabel}
          </div>
        )}

        {/* Row 4: AI model badge — tap opens chat on mobile */}
        <button
          className={styles.agentBadge}
          onClick={e => { e.stopPropagation(); if (!isDragging.current) setChatOpen(!chatOpen) }}
          title="Abrir chat"
        >
          <span className={styles.agentDiamond}>◆</span>
          <span className={styles.agentName} style={{ fontSize: `${Math.round(10 * scale)}px` }}>
            {isMobile ? 'CHAT' : modelLabel}
          </span>
        </button>

      </div>

      {/* ── Resize handle (bottom-right corner) ──────────────────────── */}
      <div
        className={styles.resizeHandle}
        onPointerDown={onResizeStart}
        title="Redimensionar"
      />


      <SyncPanel open={syncOpen} onClose={() => setSyncOpen(false)} />
    </div>
  )
}
