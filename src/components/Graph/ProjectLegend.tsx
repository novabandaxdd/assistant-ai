import { useMemo, useState } from 'react'
import { useBrainStore } from '../../store/brainStore'
import ProjectGraphPanel from './ProjectGraphPanel'

// ── Per-project tint colors (cycle through a distinct palette)
const PROJECT_COLORS = [
  '#f59e0b', // amber
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f43f5e', // rose
  '#0ea5e9', // sky
  '#a855f7', // purple
  '#f97316', // orange
  '#14b8a6', // teal
  '#e879f9', // fuchsia
  '#22c55e', // green
]

export default function ProjectLegend() {
  const nodes                  = useBrainStore(state => state.nodes)
  const links                  = useBrainStore(state => state.links)
  const activeProjectFilterId  = useBrainStore(state => state.activeProjectFilterId)
  const setProjectFilter       = useBrainStore(state => state.setProjectFilter)
  const getProjectNodes        = useBrainStore(state => state.getProjectNodes)
  const getProjectSubgraphNodeIds = useBrainStore(state => state.getProjectSubgraphNodeIds)

  const [panelProjectId, setPanelProjectId] = useState<string | null>(null)

  const projectItems = useMemo(() => {
    return getProjectNodes().map((project, idx) => ({
      id:    project.id,
      label: project.label,
      count: getProjectSubgraphNodeIds(project.id).size,
      color: PROJECT_COLORS[idx % PROJECT_COLORS.length],
      tags:  project.tags ?? [],
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getProjectNodes, getProjectSubgraphNodeIds, nodes.length, links.length])

  if (projectItems.length === 0) return null

  return (
    <>
      {panelProjectId && (
        <ProjectGraphPanel
          projectId={panelProjectId}
          onClose={() => setPanelProjectId(null)}
        />
      )}

      <div style={{
        position: 'absolute',
        top: 56,
        left: 246,
        zIndex: 110,
        minWidth: 230,
        maxWidth: 310,
        padding: '12px',
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(10,13,20,0.92)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
        fontFamily: 'Inter, sans-serif',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 10,
        }}>
          <div style={{ color: 'rgba(0,245,255,0.72)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Projetos ({projectItems.length})
          </div>
          {activeProjectFilterId && (
            <button
              onClick={() => setProjectFilter(null)}
              style={{
                background: 'rgba(0,245,255,0.08)',
                border: '1px solid rgba(0,245,255,0.2)',
                color: '#9ffcff',
                borderRadius: 999,
                padding: '2px 8px',
                fontSize: 10,
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              ver todos
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {projectItems.map(project => {
            const isActive = activeProjectFilterId === project.id
            return (
              <div
                key={project.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 0,
                  borderRadius: 10,
                  border: isActive ? `1px solid ${project.color}55` : '1px solid rgba(255,255,255,0.07)',
                  background: isActive ? `${project.color}10` : 'rgba(255,255,255,0.02)',
                  overflow: 'hidden',
                }}
              >
                {/* Color strip */}
                <div style={{
                  width: 4, alignSelf: 'stretch',
                  background: project.color,
                  opacity: isActive ? 1 : 0.5,
                  flexShrink: 0,
                }} />

                {/* Main button */}
                <button
                  onClick={() => setProjectFilter(isActive ? null : project.id)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', cursor: 'pointer',
                    background: 'transparent', border: 'none', textAlign: 'left',
                    color: '#f5f7fb',
                  }}
                >
                  <div style={{
                    width: 9, height: 9, borderRadius: 999,
                    background: project.color,
                    flexShrink: 0,
                    boxShadow: isActive ? `0 0 6px ${project.color}88` : 'none',
                  }} />
                  <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 600, flex: 1, color: isActive ? '#fff' : 'rgba(255,255,255,0.8)' }}>
                    {project.label}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    color: isActive ? project.color : 'rgba(255,255,255,0.35)',
                    background: isActive ? `${project.color}18` : 'rgba(255,255,255,0.05)',
                    padding: '1px 7px', borderRadius: 999,
                  }}>
                    {project.count}
                  </span>
                </button>

                {/* Subgraph view button */}
                <button
                  onClick={() => setPanelProjectId(project.id)}
                  title="Ver grafo detalhado do projeto"
                  style={{
                    background: 'transparent', border: 'none',
                    borderLeft: '1px solid rgba(255,255,255,0.07)',
                    color: 'rgba(255,255,255,0.35)',
                    cursor: 'pointer',
                    padding: '6px 10px',
                    fontSize: 12,
                    transition: 'all 0.15s',
                    alignSelf: 'stretch',
                    display: 'flex', alignItems: 'center',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = project.color; (e.currentTarget as HTMLElement).style.background = `${project.color}10` }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  ⬡
                </button>
              </div>
            )
          })}
        </div>

        {/* Hint */}
        <div style={{
          marginTop: 10,
          fontSize: 9.5,
          color: 'rgba(255,255,255,0.2)',
          textAlign: 'center',
          letterSpacing: '0.04em',
        }}>
          Clique para filtrar · ⬡ para visualizar
        </div>
      </div>
    </>
  )
}
