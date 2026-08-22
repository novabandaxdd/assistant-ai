import { useState } from 'react'
import { useBrainStore } from '../store/brainStore'
import { useSpeech } from '../hooks/useSpeech'
import SettingsPanel from './JARVIS/SettingsPanel'
import ProjectImporter from './ProjectImporter/ProjectImporter'
import ExportImport from './Export/ExportImport'
import ContextPromptModal from './ContextPrompt/ContextPromptModal'
import styles from './Toolbar.module.css'

interface ToolbarProps {
  onFit: () => void
}

export default function Toolbar({ onFit }: ToolbarProps) {
  const pathNodeIds    = useBrainStore(s => s.pathNodeIds)
  const clearHighlight = useBrainStore(s => s.clearHighlight)
  const currentView    = useBrainStore(s => s.currentView)
  const toggleView     = useBrainStore(s => s.toggleView)
  const { isListening, isSpeaking, startListening, stopListening, aiConfigured } = useSpeech()
  const [settingsOpen,       setSettingsOpen]       = useState(false)
  const [importerOpen,       setImporterOpen]       = useState(false)
  const [exportOpen,         setExportOpen]         = useState(false)
  const [contextPromptOpen,  setContextPromptOpen]  = useState(false)

  const isKanban = currentView === 'kanban'

  return (
    <>
      <div className={styles.toolbar}>

        {/* ── Left group: view navigation ─────────────────────────── */}
        <div className={styles.group}>
          {/* Fit — only relevant on graph view */}
          {!isKanban && (
            <button className={styles.iconBtn} onClick={onFit} title="Ajustar grafo na tela (Fit)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
            </button>
          )}

          {/* Graph / Kanban toggle */}
          <button
            className={`${styles.viewToggle} ${isKanban ? styles.viewKanban : styles.viewGraph}`}
            onClick={toggleView}
            title={isKanban ? 'Voltar ao Grafo' : 'Abrir Kanban'}
          >
            {isKanban ? (
              /* Graph icon */
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="2"/><circle cx="4" cy="6" r="2"/><circle cx="20" cy="6" r="2"/>
                <circle cx="4" cy="18" r="2"/><circle cx="20" cy="18" r="2"/>
                <line x1="6" y1="6" x2="10" y2="11"/><line x1="18" y1="6" x2="14" y2="11"/>
                <line x1="6" y1="18" x2="10" y2="13"/><line x1="18" y1="18" x2="14" y2="13"/>
              </svg>
            ) : (
              /* Kanban icon */
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="5" height="16" rx="1"/>
                <rect x="10" y="4" width="5" height="10" rx="1"/>
                <rect x="17" y="4" width="5" height="13" rx="1"/>
              </svg>
            )}
            <span>{isKanban ? 'Grafo' : 'Kanban'}</span>
          </button>
        </div>

        <div className={styles.divider} />

        {/* ── Center group: tools ──────────────────────────────────── */}
        <div className={styles.group}>
          {/* Import project */}
          <button
            className={styles.iconBtn}
            onClick={() => setImporterOpen(true)}
            title="Importar projeto — analisar código e gerar grafo"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16 16 12 12 8 16"/>
              <line x1="12" y1="12" x2="12" y2="21"/>
              <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
            </svg>
          </button>

          {/* Export / Import brain */}
          <button
            className={styles.iconBtn}
            onClick={() => setExportOpen(true)}
            title="Exportar / Importar Brain (JSON)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>

          {/* Context prompt */}
          <button
            className={styles.iconBtn}
            onClick={() => setContextPromptOpen(true)}
            title="Gerar prompt de contexto JARVIS para outra IA"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16 18 22 12 16 6"/>
              <polyline points="8 6 2 12 8 18"/>
            </svg>
          </button>
        </div>

        <div className={styles.divider} />

        {/* ── Right group: voice + settings ───────────────────────── */}
        <div className={styles.group}>
          {/* Mic */}
          <button
            className={`${styles.iconBtn} ${isListening ? styles.listening : ''} ${isSpeaking ? styles.speaking : ''}`}
            onClick={() => isListening ? stopListening() : startListening()}
            title={isListening ? 'Parar de ouvir' : isSpeaking ? 'JARVIS falando...' : 'Comando de voz'}
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

          {/* Settings */}
          <button
            className={`${styles.iconBtn} ${aiConfigured ? styles.aiActive : ''}`}
            onClick={() => setSettingsOpen(true)}
            title={aiConfigured ? 'IA configurada — clique para alterar' : 'Configurar IA (Claude / OpenAI)'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
            </svg>
            {aiConfigured && <span className={styles.aiDot} />}
          </button>
        </div>

        {/* ── Clear path (contextual) ──────────────────────────────── */}
        {pathNodeIds.length > 0 && (
          <>
            <div className={styles.divider} />
            <button
              className={`${styles.iconBtn} ${styles.btnPath}`}
              onClick={clearHighlight}
              title={`Limpar caminho (${pathNodeIds.length - 1} saltos)`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </>
        )}
      </div>

      <SettingsPanel      open={settingsOpen}      onClose={() => setSettingsOpen(false)} />
      <ProjectImporter    open={importerOpen}      onClose={() => setImporterOpen(false)} />
      <ExportImport       open={exportOpen}        onClose={() => setExportOpen(false)} />
      <ContextPromptModal open={contextPromptOpen} onClose={() => setContextPromptOpen(false)} />
    </>
  )
}
