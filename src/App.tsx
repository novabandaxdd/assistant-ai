import { useEffect, useCallback } from 'react'
import { useBrainStore } from './store/brainStore'
import { useJarvisEngine } from './hooks/useJarvisEngine'
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
import './App.css'

export default function App() {
  const init = useBrainStore(s => s.init)
  const initialized = useBrainStore(s => s.initialized)
  const currentView = useBrainStore(s => s.currentView)

  // ── Single JARVIS engine instance — owns the jarvis:input listener ───────
  useJarvisEngine()

  useEffect(() => { init() }, [init])

  const handleFit = useCallback(() => {
    window.dispatchEvent(new CustomEvent('graph:fit'))
  }, [])

  if (!initialized) {
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
    </div>
  )
}
