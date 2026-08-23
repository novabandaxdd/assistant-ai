import { useState, useRef } from 'react'
import { useBrainStore, CATEGORY_COLORS } from '../../store/brainStore'
import { saveNode, saveLink, clearDB } from '../../store/db'
import { useProjectStore } from '../../store/projectStore'
import type { BrainNode, BrainLink, NodeCategory } from '../../types'
import ImportContextWizard from '../Projects/ImportContextWizard'
import styles from './LeftSidebar.module.css'

const ALL_CATEGORIES: NodeCategory[] = [
  'Project','Meeting','Onboarding','Tech','Activity','Person','Decision','Note','Resource',
  'Module','Feature','Endpoint',
]

const CAT_LABELS: Record<NodeCategory, string> = {
  Project:    'Projeto',    Meeting:    'Reunião',   Onboarding: 'Onboarding',
  Tech:       'Tecnologia', Activity:   'Atividade', Person:     'Pessoa',
  Decision:   'Decisão',   Note:       'Nota',      Resource:   'Recurso',
  Module:     'Módulo',    Feature:    'Feature',   Endpoint:   'Endpoint',
}

// ── Collapsible section ──────────────────────────────────────────────────────
function Section({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={styles.section}>
      <button className={styles.sectionHeader} onClick={() => setOpen(o => !o)}>
        <span className={styles.sectionTitle}>{title}</span>
        <svg
          className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
          viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
          width="12" height="12"
        >
          <path d="M4 6l4 4 4-4"/>
        </svg>
      </button>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </div>
  )
}

// ── Toggle switch ────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className={styles.toggleRow}>
      <span className={styles.toggleLabel}>{label}</span>
      <span className={`${styles.toggleSwitch} ${checked ? styles.toggleOn : ''}`} onClick={() => onChange(!checked)}>
        <span className={styles.toggleThumb} />
      </span>
    </label>
  )
}

export default function LeftSidebar() {
  const [addOpen, setAddOpen]       = useState(false)
  const [newLabel, setNewLabel]     = useState('')
  const [newCat, setNewCat]         = useState<NodeCategory>('Note')
  const [newContent, setNewContent] = useState('')
  const [importWizardOpen, setImportWizardOpen] = useState(false)

  const [editOpen, setEditOpen]     = useState(false)
  const [editLabel, setEditLabel]   = useState('')
  const [editContent, setEditContent] = useState('')
  const [editTags, setEditTags]     = useState('')

  const [connectMode, setConnectMode]     = useState(false)
  const [connectTarget, setConnectTarget] = useState('')

  const nodes         = useBrainStore(s => s.nodes)
  const links         = useBrainStore(s => s.links)
  const selectedNodeId = useBrainStore(s => s.selectedNodeId)
  const filters       = useBrainStore(s => s.filters)
  const physics       = useBrainStore(s => s.physics)
  const topHubs       = useBrainStore(s => s.topHubs())
  const setSearch     = useBrainStore(s => s.setSearch)
  const selectNode    = useBrainStore(s => s.selectNode)
  const setPhysics    = useBrainStore(s => s.setPhysics)
  const addNode       = useBrainStore(s => s.addNode)
  const addLink       = useBrainStore(s => s.addLink)
  const updateNode    = useBrainStore(s => s.updateNode)
  const removeNode    = useBrainStore(s => s.removeNode)
  const removeLink    = useBrainStore(s => s.removeLink)
  const getNeighbors  = useBrainStore(s => s.getNeighbors)
  const getLinks      = useBrainStore(s => s.getLinks)
  const activeProjectFilterId = useBrainStore(s => s.activeProjectFilterId)
  const activeProjectId = useProjectStore(s => s.activeProjectId)

  const selectedNode  = useBrainStore(s => selectedNodeId ? s.nodes.find(n => n.id === selectedNodeId) ?? null : null)
  const neighbors     = selectedNodeId ? getNeighbors(selectedNodeId) : []
  const selectedLinks = selectedNodeId ? getLinks(selectedNodeId) : []

  const openEdit = () => {
    if (!selectedNode) return
    setEditLabel(selectedNode.label)
    setEditContent(selectedNode.content ?? '')
    setEditTags((selectedNode.tags ?? []).join(', '))
    setEditOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!selectedNode || !editLabel.trim()) return
    await updateNode(selectedNode.id, {
      label: editLabel.trim(),
      content: editContent.trim() || undefined,
      tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
    })
    setEditOpen(false)
  }

  const handleConnect = async () => {
    if (!selectedNode || !connectTarget) return
    const alreadyLinked = links.some(l => {
      const s = typeof l.source === 'string' ? l.source : l.source.id
      const t = typeof l.target === 'string' ? l.target : l.target.id
      return (s === selectedNode.id && t === connectTarget) ||
             (t === selectedNode.id && s === connectTarget)
    })
    if (!alreadyLinked) await addLink(selectedNode.id, connectTarget)
    setConnectMode(false)
    setConnectTarget('')
  }

  const handleExport = () => {
    const data = { nodes, links, exportedAt: new Date().toISOString() }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `jarvis-brain-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as { nodes: BrainNode[]; links: BrainLink[] }
        if (!Array.isArray(data.nodes) || !Array.isArray(data.links)) { alert('Arquivo de brain inválido.'); return }
        if (!confirm(`Importar ${data.nodes.length} nós e ${data.links.length} links? Isso substituirá o brain atual.`)) return
        await clearDB()
        for (const node of data.nodes) await saveNode(node)
        for (const link of data.links) await saveLink(link)
        useBrainStore.setState({ nodes: data.nodes, links: data.links })
      } catch { alert('Falha ao ler o arquivo.') }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleAdd = async () => {
    if (!newLabel.trim()) return
    const node = await addNode({ label: newLabel.trim(), category: newCat, content: newContent.trim() || undefined })
    setNewLabel(''); setNewContent(''); setAddOpen(false)

    // If project filter is active, auto-link to the project hub so the node
    // becomes visible (filteredNodes requires connectivity to project hub)
    const projectHubId = activeProjectFilterId ?? activeProjectId
    if (projectHubId && node.id !== projectHubId) {
      const hub = nodes.find(n => n.id === projectHubId && n.category === 'Project')
      if (hub) await addLink(projectHubId, node.id)
    }

    selectNode(node.id)
  }

  return (
    <aside className={styles.sidebar}>

      {/* ── Workspace header ─────────────────────────────────────────── */}
      <div className={styles.workspaceHeader}>
        <div className={styles.wsInfo}>
          <div className={styles.wsTitle}>AI WORKSHOP OS</div>
          <div className={styles.wsMeta}>{nodes.length} nodes · {links.length} links</div>
        </div>
        <div className={styles.wsActions}>
            <button className={styles.wsBtn} onClick={handleExport} title="Exportar JSON">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="13" height="13">
                <path d="M8 2v8M5 7l3 3 3-3M2 12h12" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Exportar
            </button>
            <button className={styles.wsBtn} onClick={() => setImportWizardOpen(true)} title="Importar contexto JSON">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="13" height="13">
                <path d="M8 11V3M5 6l3-3 3 3M2 12h12" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Importar
            </button>
          {/* legacy raw import kept as fallback, hidden */}
          <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
        </div>
      </div>

      {/* ── Search ───────────────────────────────────────────────────── */}
      <div className={styles.searchWrap}>
        <svg className={styles.searchIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="13" height="13">
          <circle cx="6.5" cy="6.5" r="4.5"/><path d="M10 10l3 3" strokeLinecap="round"/>
        </svg>
        <input
          className={styles.search}
          placeholder="Buscar no brain..."
          value={filters.search}
          onChange={e => setSearch(e.target.value)}
        />
        {filters.search && (
          <button className={styles.searchClear} onClick={() => setSearch('')}>✕</button>
        )}
      </div>

      {/* ── Inspector ────────────────────────────────────────────────── */}
      <Section title="INSPECTOR">
        {selectedNode ? (
          <div className={styles.inspector}>
            {editOpen ? (
              <div className={styles.editForm}>
                <input
                  className={styles.field}
                  value={editLabel}
                  onChange={e => setEditLabel(e.target.value)}
                  placeholder="Label"
                  autoFocus
                />
                <select
                  className={styles.field}
                  value={selectedNode.category}
                  onChange={e => updateNode(selectedNode.id, { category: e.target.value as NodeCategory })}
                >
                  {ALL_CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
                </select>
                <textarea
                  className={`${styles.field} ${styles.fieldTextarea}`}
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  placeholder="Conteúdo..."
                  rows={3}
                />
                <input
                  className={styles.field}
                  value={editTags}
                  onChange={e => setEditTags(e.target.value)}
                  placeholder="Tags (separadas por vírgula)"
                />
                <div className={styles.rowActions}>
                  <button className={styles.btnPrimary} onClick={handleSaveEdit}>Salvar</button>
                  <button className={styles.btnGhost} onClick={() => setEditOpen(false)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <>
                {/* Node identity card */}
                <div className={styles.nodeCard}>
                  <span
                    className={styles.nodeCardDot}
                    style={{ background: CATEGORY_COLORS[selectedNode.category] }}
                  />
                  <div className={styles.nodeCardBody}>
                    <div className={styles.nodeCardLabel}>{selectedNode.label}</div>
                    <div className={styles.nodeCardMeta}>
                      {CAT_LABELS[selectedNode.category]} · {selectedLinks.length} conexões
                    </div>
                  </div>
                </div>

                {/* Content */}
                {selectedNode.content && (
                  <p className={styles.nodeContent}>{selectedNode.content}</p>
                )}

                {/* Tags */}
                {selectedNode.tags && selectedNode.tags.length > 0 && (
                  <div className={styles.tagList}>
                    {selectedNode.tags.map(t => <span key={t} className={styles.tag}>{t}</span>)}
                  </div>
                )}

                {/* Connected nodes */}
                {neighbors.length > 0 && (
                  <div className={styles.neighborsList}>
                    <div className={styles.listLabel}>Conectado a</div>
                    {neighbors.slice(0, 5).map(nb => (
                      <button key={nb.id} className={styles.neighborBtn} onClick={() => selectNode(nb.id)}>
                        <span className={styles.dot} style={{ background: CATEGORY_COLORS[nb.category] }} />
                        <span className={styles.neighborLabel}>{nb.label}</span>
                      </button>
                    ))}
                    {neighbors.length > 5 && (
                      <span className={styles.moreLabel}>+{neighbors.length - 5} mais</span>
                    )}
                  </div>
                )}

                {/* Connect form */}
                {connectMode ? (
                  <div className={styles.connectForm}>
                    <select
                      className={styles.field}
                      value={connectTarget}
                      onChange={e => setConnectTarget(e.target.value)}
                      autoFocus
                    >
                      <option value="">— selecionar nó —</option>
                      {nodes.filter(n => n.id !== selectedNode.id).map(n => (
                        <option key={n.id} value={n.id}>{n.label}</option>
                      ))}
                    </select>
                    <div className={styles.rowActions}>
                      <button className={styles.btnPrimary} onClick={handleConnect} disabled={!connectTarget}>Linkar</button>
                      <button className={styles.btnGhost} onClick={() => { setConnectMode(false); setConnectTarget('') }}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.nodeActions}>
                    <button className={styles.actionBtn} onClick={openEdit} title="Editar">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="12" height="12">
                        <path d="M11.5 2.5a1.41 1.41 0 0 1 2 2L5 13H3v-2L11.5 2.5z" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Editar
                    </button>
                    <button className={styles.actionBtn} onClick={() => setConnectMode(true)} title="Conectar">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="12" height="12">
                        <path d="M3 8h10M10 5l3 3-3 3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Linkar
                    </button>
                    <button
                      className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                      onClick={() => { removeNode(selectedNode.id); selectNode(null) }}
                      title="Apagar nó"
                    >
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="12" height="12">
                        <path d="M3 4h10M6 4V2h4v2M5 4l.5 9h5L11 4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                )}

                {/* Existing links */}
                {selectedLinks.length > 0 && (
                  <div className={styles.linkList}>
                    <div className={styles.listLabel}>Links</div>
                    {selectedLinks.map(lk => {
                      const otherId = typeof lk.source === 'string'
                        ? (lk.source === selectedNode.id ? (typeof lk.target === 'string' ? lk.target : lk.target.id) : lk.source)
                        : (lk.source.id === selectedNode.id ? (typeof lk.target === 'string' ? lk.target : lk.target.id) : lk.source.id)
                      const other = nodes.find(n => n.id === otherId)
                      return other ? (
                        <div key={lk.id} className={styles.linkRow}>
                          <span className={styles.dot} style={{ background: CATEGORY_COLORS[other.category] }} />
                          <span className={styles.linkLabel}>{other.label}</span>
                          <button className={styles.unlinkBtn} onClick={() => removeLink(lk.id)} title="Remover link">
                            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" width="10" height="10">
                              <path d="M2 2l8 8M10 2L2 10" strokeLinecap="round"/>
                            </svg>
                          </button>
                        </div>
                      ) : null
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <p className={styles.emptyHint}>
            Clique em um nó para inspecioná-lo. Shift-click para traçar um caminho.
          </p>
        )}
      </Section>

      {/* ── Top Hubs ─────────────────────────────────────────────────── */}
      <Section title="TOP HUBS">
        <div className={styles.hubList}>
          {topHubs.map(({ node, count }) => (
            <button
              key={node.id}
              className={`${styles.hubBtn} ${selectedNodeId === node.id ? styles.hubActive : ''}`}
              onClick={() => selectNode(node.id)}
            >
              <span className={styles.dot} style={{ background: CATEGORY_COLORS[node.category] }} />
              <span className={styles.hubLabel}>{node.label}</span>
              <span className={styles.hubCount}>{count}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* ── Forces ───────────────────────────────────────────────────── */}
      <Section title="FORÇAS" defaultOpen={false}>
        <div className={styles.sliders}>
          <div className={styles.sliderRow}>
            <span className={styles.sliderLabel}>Repulsão</span>
            <div className={styles.sliderTrack}>
              <input
                type="range" min="20" max="400"
                value={physics.repelStrength}
                onChange={e => setPhysics({ repelStrength: +e.target.value })}
                className={styles.slider}
              />
            </div>
            <span className={styles.sliderVal}>{physics.repelStrength}</span>
          </div>
          <div className={styles.sliderRow}>
            <span className={styles.sliderLabel}>Comprimento</span>
            <div className={styles.sliderTrack}>
              <input
                type="range" min="30" max="300"
                value={physics.linkDistance}
                onChange={e => setPhysics({ linkDistance: +e.target.value })}
                className={styles.slider}
              />
            </div>
            <span className={styles.sliderVal}>{physics.linkDistance}</span>
          </div>
        </div>
      </Section>

      {/* ── Display ──────────────────────────────────────────────────── */}
      <Section title="DISPLAY" defaultOpen={false}>
        <div className={styles.toggleList}>
          <Toggle
            label="Labels dos hubs"
            checked={physics.showLabels}
            onChange={v => setPhysics({ showLabels: v })}
          />
          <Toggle
            label="Fluxo de partículas"
            checked={physics.showParticles}
            onChange={v => setPhysics({ showParticles: v })}
          />
        </div>
      </Section>

      {/* ── Add node ─────────────────────────────────────────────────── */}
      <div className={styles.addSection}>
        {addOpen ? (
          <div className={styles.addForm}>
            <div className={styles.addFormHeader}>
              <span className={styles.addFormTitle}>Novo nó</span>
              <button className={styles.addFormClose} onClick={() => setAddOpen(false)}>✕</button>
            </div>
            <input
              className={styles.field}
              placeholder="Label"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              autoFocus
            />
            <select
              className={styles.field}
              value={newCat}
              onChange={e => setNewCat(e.target.value as NodeCategory)}
            >
              {ALL_CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
            </select>
            <textarea
              className={`${styles.field} ${styles.fieldTextarea}`}
              placeholder="Conteúdo (opcional)"
              rows={2}
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
            />
            <button className={styles.addConfirmBtn} onClick={handleAdd} disabled={!newLabel.trim()}>
              Adicionar nó
            </button>
          </div>
        ) : (
          <button className={styles.addNodeBtn} onClick={() => setAddOpen(true)}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
              <path d="M8 2v12M2 8h12" strokeLinecap="round"/>
            </svg>
            Add node
          </button>
        )}
      </div>

      {/* ── Controls hint ────────────────────────────────────────────── */}
      <div className={styles.controlsHint}>
        <div className={styles.hintRow}><kbd>arrastar</kbd> orbitar &nbsp;·&nbsp; <kbd>scroll</kbd> zoom &nbsp;·&nbsp; <kbd>click</kbd> focar</div>
        <div className={styles.hintRow}><kbd>shift</kbd> caminho &nbsp;·&nbsp; <kbd>L</kbd> isolar &nbsp;·&nbsp; <kbd>esc</kbd> limpar</div>
        <div className={styles.hintRow}><kbd>Ctrl+Z</kbd> desfazer &nbsp;·&nbsp; <kbd>Ctrl+Shift+Z</kbd> refazer</div>
      </div>

      {importWizardOpen && (
        <ImportContextWizard
          open={importWizardOpen}
          onClose={() => setImportWizardOpen(false)}
        />
      )}
    </aside>
  )
}
