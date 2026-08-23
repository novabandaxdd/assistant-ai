import { useState } from 'react'
import { useBrainStore, CATEGORY_COLORS } from '../../store/brainStore'
import type { NodeCategory } from '../../types'
import styles from './RightSidebar.module.css'

const ALL_CATEGORIES: NodeCategory[] = [
  'Project','Meeting','Onboarding','Tech','Activity','Person','Decision','Note','Resource',
  'Module','Feature','Endpoint',
]

// Labels in pt-BR
const CAT_LABELS: Record<NodeCategory, string> = {
  Project:    'Projeto',
  Meeting:    'Reunião',
  Onboarding: 'Onboarding',
  Tech:       'Tecnologia',
  Activity:   'Atividade',
  Person:     'Pessoa',
  Decision:   'Decisão',
  Note:       'Nota',
  Resource:   'Recurso',
  Module:     'Módulo',
  Feature:    'Feature',
  Endpoint:   'Endpoint',
}

export default function RightSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  const filters          = useBrainStore(s => s.filters)
  const counts           = useBrainStore(s => s.categoryCounts())
  const toggleCategory   = useBrainStore(s => s.toggleCategory)
  const setAllCategories = useBrainStore(s => s.setAllCategories)
  const nodes            = useBrainStore(s => s.nodes)
  const links            = useBrainStore(s => s.links)
  const selectedId       = useBrainStore(s => s.selectedNodeId)
  const selectedNode     = selectedId ? nodes.find(n => n.id === selectedId) : null

  const allOn = filters.categories.size === ALL_CATEGORIES.length

  // Connections for selected node
  const connectedLinks = selectedId
    ? links.filter(l => {
        const s = typeof l.source === 'string' ? l.source : l.source.id
        const t = typeof l.target === 'string' ? l.target : l.target.id
        return s === selectedId || t === selectedId
      })
    : []

  const connectedNodeIds = new Set(connectedLinks.flatMap(l => {
    const s = typeof l.source === 'string' ? l.source : l.source.id
    const t = typeof l.target === 'string' ? l.target : l.target.id
    return [s, t]
  }))
  connectedNodeIds.delete(selectedId ?? '')

  const connectedNodes = nodes.filter(n => connectedNodeIds.has(n.id)).slice(0, 12)

  return (
    <>
      {/* Mobile toggle button */}
      <button
        className={styles.filterToggle}
        onClick={() => setMobileOpen(o => !o)}
        aria-label="Filtros"
      >
        ⚙
      </button>

      {/* Overlay — closes drawer on tap outside */}
      {mobileOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 290,
            background: 'rgba(0,0,0,0.45)',
          }}
          onClick={() => setMobileOpen(false)}
        />
      )}

    <aside className={`${styles.sidebar} ${mobileOpen ? styles.open : ''}`}>
      {/* ── Selected node panel ──────────────────────────────────────────── */}
      {selectedNode ? (
        <div className={styles.nodePanel}>
          {/* Node identity */}
          <div className={styles.nodePanelHeader}>
            <span
              className={styles.nodeCatBadge}
              style={{ background: `${CATEGORY_COLORS[selectedNode.category]}22`, color: CATEGORY_COLORS[selectedNode.category] }}
            >
              {CAT_LABELS[selectedNode.category]}
            </span>
          </div>
          <div className={styles.nodeLabel}>{selectedNode.label}</div>

          {/* Tags */}
          {selectedNode.tags && selectedNode.tags.length > 0 && (
            <div className={styles.tagRow}>
              {selectedNode.tags.slice(0, 6).map(t => (
                <span key={t} className={styles.tag}>{t}</span>
              ))}
            </div>
          )}

          {/* Content / description */}
          {selectedNode.content && (
            <div className={styles.nodeContent}>{selectedNode.content}</div>
          )}

          {/* Connections list */}
          {connectedNodes.length > 0 && (
            <div className={styles.connSection}>
              <div className={styles.connTitle}>
                Conexões <span className={styles.connCount}>{connectedLinks.length}</span>
              </div>
              <div className={styles.connList}>
                {connectedNodes.map(n => (
                  <div key={n.id} className={styles.connItem}>
                    <span
                      className={styles.connDot}
                      style={{ background: CATEGORY_COLORS[n.category] }}
                    />
                    <span className={styles.connLabel}>{n.label}</span>
                  </div>
                ))}
                {connectedLinks.length > 12 && (
                  <div className={styles.connMore}>+{connectedLinks.length - 12} mais</div>
                )}
              </div>
            </div>
          )}

          <div className={styles.divider} />
        </div>
      ) : null}

      {/* ── Category filter ──────────────────────────────────────────────── */}
      <div className={styles.header}>FILTRAR</div>
      <div className={styles.all}>
        <label className={styles.allToggle}>
          <input type="checkbox" checked={allOn} onChange={e => setAllCategories(e.target.checked)} />
          <span>Todos</span>
        </label>
        <span className={styles.total}>{nodes.length}</span>
      </div>
      <div className={styles.list}>
        {ALL_CATEGORIES.map(cat => {
          const active = filters.categories.has(cat)
          const count  = counts[cat] ?? 0
          return (
            <button
              key={cat}
              className={`${styles.item} ${active ? styles.active : styles.inactive}`}
              onClick={() => toggleCategory(cat)}
            >
              <span className={styles.dot} style={{ background: CATEGORY_COLORS[cat] }} />
              <span className={styles.label}>{CAT_LABELS[cat]}</span>
              <span className={styles.count}>{count}</span>
            </button>
          )
        })}
      </div>
    </aside>
    </>
  )
}
