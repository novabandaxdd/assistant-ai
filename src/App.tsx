import { useCallback, useEffect, useState } from 'react'
import { useBrainStore } from './store/brainStore'
import ToastContainer from './components/Toast/Toast'
import { useProjectStore } from './store/projectStore'
import { initSyncStore } from './store/syncStore'
import { useJarvisEngine } from './hooks/useJarvisEngine'
import { createSnapshot } from './utils/snapshotService'
import ForceGraph from './components/Graph/ForceGraph'
import GraphLegend from './components/Graph/GraphLegend'
import ProjectLegend from './components/Graph/ProjectLegend'
import KanbanBoard from './components/Kanban/KanbanBoard'
import LeftSidebar from './components/Sidebar/LeftSidebar'
import RightSidebar from './components/Sidebar/RightSidebar'
import JarvisHUD from './components/JARVIS/JarvisHUD'
import JarvisChat from './components/JARVIS/JarvisChat'
import BottomBar from './components/JARVIS/BottomBar'
import Toolbar from './components/Toolbar'
import LoginScreen from './components/Auth/LoginScreen'
import OnboardingWizard from './components/Projects/OnboardingWizard'
import './App.css'

const AUTO_SNAPSHOT_KEY   = 'jarvis_last_auto_snapshot'
// Persists across sessions — once user passes login screen it's set
const LOGIN_DONE_KEY      = 'jarvis_login_done'

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function App() {
  const init = useBrainStore(s => s.init)
  const initialized = useBrainStore(s => s.initialized)
  const currentView = useBrainStore(s => s.currentView)

  const projectStoreInit = useProjectStore(s => s.init)
  const projectInitialized = useProjectStore(s => s.initialized)
  const projects = useProjectStore(s => s.projects)
  const activeProjectId = useProjectStore(s => s.activeProjectId)

  // ── Login gate — true if user has ever passed the login screen ───────────
  const [loginDone, setLoginDone] = useState(
    () => localStorage.getItem(LOGIN_DONE_KEY) === '1'
  )

  function handleLoginDone() {
    localStorage.setItem(LOGIN_DONE_KEY, '1')
    setLoginDone(true)
  }

  // ── Single JARVIS engine instance — owns the jarvis:input listener ───────
  useJarvisEngine()

  useEffect(() => { void init() }, [init])
  useEffect(() => { void projectStoreInit() }, [projectStoreInit])

  // ── Initialize sync store (restore user profile from localStorage) ─────
  useEffect(() => { initSyncStore() }, [])

  // ── Listen for import-complete → create 'Import snapshot' ─────────────
  useEffect(() => {
    const handler = () => {
      const projectId = useProjectStore.getState().activeProjectId
      if (projectId) {
        void createSnapshot(projectId, 'Import snapshot', 'auto')
      }
    }
    window.addEventListener('jarvis:import-complete', handler)
    return () => window.removeEventListener('jarvis:import-complete', handler)
  }, [])

  // ── Daily auto-snapshot (after 5 min if not yet done today) ───────────
  useEffect(() => {
    if (!initialized || !projectInitialized || !activeProjectId) return
    const lastDate = localStorage.getItem(AUTO_SNAPSHOT_KEY)
    if (lastDate === todayKey()) return

    const timer = setTimeout(() => {
      const currentProjectId = useProjectStore.getState().activeProjectId
      if (!currentProjectId) return
      void createSnapshot(currentProjectId, 'Auto snapshot', 'auto').then(() => {
        localStorage.setItem(AUTO_SNAPSHOT_KEY, todayKey())
      })
    }, 5 * 60 * 1000) // 5 minutes

    return () => clearTimeout(timer)
  }, [initialized, projectInitialized, activeProjectId])

  const undo = useBrainStore(s => s.undo)
  const redo = useBrainStore(s => s.redo)
  const canUndo = useBrainStore(s => s.canUndo)
  const canRedo = useBrainStore(s => s.canRedo)

  // ── Undo / redo keyboard shortcuts ──────────────────────────────────────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (!canUndo()) return
        const description = useBrainStore.getState().undoStack.at(-1)?.description ?? ''
        void undo().then(() => {
          window.dispatchEvent(new CustomEvent('jarvis:toast', {
            detail: { message: `Desfeito: ${description}`, type: 'info' },
          }))
        })
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        if (!canRedo()) return
        const description = useBrainStore.getState().redoStack.at(-1)?.description ?? ''
        void redo().then(() => {
          window.dispatchEvent(new CustomEvent('jarvis:toast', {
            detail: { message: `Refeito: ${description}`, type: 'info' },
          }))
        })
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [undo, redo, canUndo, canRedo])

  const handleFit = useCallback(() => {
    window.dispatchEvent(new CustomEvent('graph:fit'))
  }, [])

  // ── Step 1: Login screen (shown once, on first ever visit) ──────────────
  if (!loginDone) {
    return (
      <LoginScreen
        onLogin={handleLoginDone}
        onSkip={handleLoginDone}   // local-only mode, still proceeds
      />
    )
  }

  // ── Loading ─────────────────────────────────────────────────────────────
  if (!initialized || !projectInitialized) {
    return (
      <div className="loading">
        <div className="loading-inner">
          <div className="loading-ring" />
          <div className="loading-text">J.A.R.V.I.S.</div>
          <div className="loading-sub">Initializing second memory...</div>
        </div>
      </div>
    )
  }

  // ── Step 2: Onboarding wizard (shown on first project setup) ────────────
  const showOnboarding =
    projectInitialized &&
    initialized &&
    projects.length === 1 &&
    projects[0].name === 'Meu Projeto'

  if (showOnboarding) {
    return <OnboardingWizard onComplete={() => { /* projectStore already updated */ }} />
  }

  // ── Step 3: Main app ────────────────────────────────────────────────────
  return (
    <div className="app">
      {currentView === 'graph' ? (
        <>
          <ForceGraph />
          <GraphLegend />
          <ProjectLegend />
        </>
      ) : (
        <KanbanBoard />
      )}

      <LeftSidebar />
      <RightSidebar />
      <Toolbar onFit={handleFit} />
      <BottomBar />
      <JarvisHUD onFit={handleFit} />
      <JarvisChat />
      <ToastContainer />
    </div>
  )
}
