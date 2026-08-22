import { useMemo, useState, useCallback } from 'react'
import { useBrainStore } from '../../store/brainStore'
import type { KanbanCard, KanbanColumnId } from '../../types'
import styles from './KanbanBoard.module.css'
import CardDetailModal from './CardDetailModal'

const COLUMN_EMPTY_STATE: Record<KanbanColumnId, { title: string; description: string }> = {
  backlog: {
    title: 'Nenhuma atividade em backlog',
    description: 'Crie uma nova atividade para transformar ideias e pedidos em trabalho rastreável.',
  },
  in_progress: {
    title: 'Nada em progresso',
    description: 'Arraste um card para cá quando o trabalho entrar em execução.',
  },
  in_review: {
    title: 'Nada em revisão',
    description: 'Use esta coluna para aprovações, QA e validações antes da conclusão.',
  },
  done: {
    title: 'Nada concluído ainda',
    description: 'Atividades finalizadas aparecem aqui para manter histórico operacional.',
  },
}

const PRIORITY_LABELS: Record<KanbanCard['priority'], string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
}

type PriorityFilter = 'all' | KanbanCard['priority']

const PRIORITY_FILTER_OPTIONS: { id: PriorityFilter; label: string }[] = [
  { id: 'all',    label: 'Todos' },
  { id: 'high',   label: 'Alta' },
  { id: 'medium', label: 'Média' },
  { id: 'low',    label: 'Baixa' },
]

// Project colors for swimlane headers (deterministic palette)
const SWIMLANE_COLORS = [
  '#00f5ff', '#a78bfa', '#34d399', '#f59e0b', '#f43f5e',
  '#60a5fa', '#fb923c', '#e879f9', '#4ade80', '#facc15',
]

function getSwimlaneBg(color: string) {
  // Very subtle tint from the project color
  const hex = color.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r},${g},${b},0.07)`
}

function formatDate(timestamp: number | null) {
  if (!timestamp) return 'Sem data'
  return new Date(timestamp).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  })
}

function PriorityDot({ priority }: { priority: KanbanCard['priority'] }) {
  return <span className={`${styles.priorityDot} ${styles[`priority_${priority}`]}`} aria-hidden="true" />
}

function WipCount({ count }: { count: number }) {
  const cls = count >= 8
    ? styles.wipCountDanger
    : count >= 5
      ? styles.wipCountWarn
      : styles.wipCount
  return <span className={cls}>WIP: {count}</span>
}

// ── New Card Modal ──────────────────────────────────────────────────────────────
interface NewCardModalProps {
  projectOptions: Array<{ id: string; label: string }>
  defaultProjectId: string | null
  onClose: () => void
  onCreate: (data: {
    label: string
    content: string
    priority: KanbanCard['priority']
    projectId: string | null
    columnId: KanbanColumnId
  }) => Promise<void>
}

function NewCardModal({ projectOptions, defaultProjectId, onClose, onCreate }: NewCardModalProps) {
  const [label,     setLabel]     = useState('')
  const [content,   setContent]   = useState('')
  const [priority,  setPriority]  = useState<KanbanCard['priority']>('medium')
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId)
  const [columnId,  setColumnId]  = useState<KanbanColumnId>('backlog')
  const [saving,    setSaving]    = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!label.trim()) return
    setSaving(true)
    await onCreate({ label: label.trim(), content: content.trim(), priority, projectId, columnId })
    setSaving(false)
    onClose()
  }

  return (
    <div className={styles.modalOverlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div className={styles.modalEyebrow}>NOVA ATIVIDADE</div>
          <h3 className={styles.modalTitle}>Criar card no Kanban</h3>
          <button className={styles.modalClose} onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <form className={styles.modalForm} onSubmit={e => { void handleSubmit(e) }}>
          {/* Título */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Título <span className={styles.required}>*</span></label>
            <input
              className={styles.fieldInput}
              type="text"
              placeholder="Ex: Implementar autenticação OAuth"
              value={label}
              onChange={e => setLabel(e.target.value)}
              autoFocus
              required
            />
          </div>

          {/* Descrição */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Descrição / contexto</label>
            <textarea
              className={styles.fieldTextarea}
              placeholder="Detalhes, critérios de aceite, links relevantes…"
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={4}
            />
          </div>

          {/* Linha: Prioridade + Coluna */}
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Prioridade</label>
              <select className={styles.fieldSelect} value={priority} onChange={e => setPriority(e.target.value as KanbanCard['priority'])}>
                <option value="low">🔵 Baixa</option>
                <option value="medium">🟡 Média</option>
                <option value="high">🔴 Alta</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Coluna inicial</label>
              <select className={styles.fieldSelect} value={columnId} onChange={e => setColumnId(e.target.value as KanbanColumnId)}>
                <option value="backlog">Backlog</option>
                <option value="in_progress">Em Progresso</option>
                <option value="in_review">Em Revisão</option>
                <option value="done">Concluído</option>
              </select>
            </div>
          </div>

          {/* Projeto */}
          {projectOptions.length > 0 && (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Projeto</label>
              <select
                className={styles.fieldSelect}
                value={projectId ?? ''}
                onChange={e => setProjectId(e.target.value || null)}
              >
                <option value="">Sem projeto</option>
                {projectOptions.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelButton} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.submitButton} disabled={saving || !label.trim()}>
              {saving ? 'Criando…' : 'Criar atividade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main board ──────────────────────────────────────────────────────────────────
export default function KanbanBoard() {
  const kanbanColumns        = useBrainStore(state => state.kanbanColumns)
  const cards                = useBrainStore(state => state.getKanbanCards())
  const createActivityNode   = useBrainStore(state => state.createActivityNode)
  const moveActivityToColumn = useBrainStore(state => state.moveActivityToColumn)
  const selectNode           = useBrainStore(state => state.selectNode)
  const nodes                = useBrainStore(state => state.nodes)
  const activeProjectFilterId = useBrainStore(state => state.activeProjectFilterId)
  const setProjectFilter     = useBrainStore(state => state.setProjectFilter)

  const [draggedCardId,  setDraggedCardId]  = useState<string | null>(null)
  const [dragOverColId,  setDragOverColId]  = useState<KanbanColumnId | null>(null)
  const [showModal,      setShowModal]      = useState(false)
  const [detailCard,     setDetailCard]     = useState<KanbanCard | null>(null)

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [searchText,      setSearchText]      = useState('')
  const [priorityFilter,  setPriorityFilter]  = useState<PriorityFilter>('all')
  const [swimlaneEnabled, setSwimLaneEnabled] = useState(false)

  const projectOptions = useMemo(
    () => nodes.filter(node => node.category === 'Project').map(node => ({ id: node.id, label: node.label })),
    [nodes],
  )

  // Active project label for header
  const activeProject = activeProjectFilterId
    ? projectOptions.find(p => p.id === activeProjectFilterId) ?? null
    : null

  // ── Filtered cards ────────────────────────────────────────────────────────────
  const filteredCards = useMemo(() => {
    const lc = searchText.toLowerCase()
    return cards.filter(card => {
      if (lc && !card.title.toLowerCase().includes(lc)) return false
      if (priorityFilter !== 'all' && card.priority !== priorityFilter) return false
      return true
    })
  }, [cards, searchText, priorityFilter])

  const cardsByColumn = useMemo(() => {
    const grouped = new Map<KanbanColumnId, KanbanCard[]>([
      ['backlog', []],
      ['in_progress', []],
      ['in_review', []],
      ['done', []],
    ])
    for (const card of filteredCards) {
      grouped.get(card.columnId)?.push(card)
    }
    return grouped
  }, [filteredCards])

  // Build a stable project-color mapping for swimlane dividers
  const projectColorMap = useMemo(() => {
    const map = new Map<string, string>()
    let idx = 0
    for (const card of cards) {
      if (card.projectId && !map.has(card.projectId)) {
        const color = card.projectColor || SWIMLANE_COLORS[idx % SWIMLANE_COLORS.length]
        map.set(card.projectId, color)
        idx++
      }
    }
    return map
  }, [cards])

  const handleCreate = async (data: {
    label: string
    content: string
    priority: KanbanCard['priority']
    projectId: string | null
    columnId: KanbanColumnId
  }) => {
    const node = await createActivityNode(data.label, data.projectId, data.content, data.priority)
    if (data.columnId !== 'backlog') {
      await moveActivityToColumn(node.id, data.columnId)
    }
    selectNode(node.id, false)
  }

  const handleDrop = useCallback(async (columnId: KanbanColumnId) => {
    if (!draggedCardId) return
    await moveActivityToColumn(draggedCardId, columnId)
    setDraggedCardId(null)
    setDragOverColId(null)
  }, [draggedCardId, moveActivityToColumn])

  const handleDragOver = useCallback((e: React.DragEvent, columnId: KanbanColumnId) => {
    e.preventDefault()
    setDragOverColId(columnId)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if leaving the column element itself (not a child)
    if (e.currentTarget === e.target || !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setDragOverColId(null)
    }
  }, [])

  const noCards = cards.length === 0

  // ── Swimlane grouping helper ──────────────────────────────────────────────────
  function groupByProject(columnCards: KanbanCard[]): Array<{ projectId: string | null; projectName: string | null; color: string; cards: KanbanCard[] }> {
    const map = new Map<string, { projectId: string | null; projectName: string | null; color: string; cards: KanbanCard[] }>()
    for (const card of columnCards) {
      const key = card.projectId ?? '__none__'
      if (!map.has(key)) {
        map.set(key, {
          projectId: card.projectId,
          projectName: card.projectName,
          color: card.projectColor || '#555',
          cards: [],
        })
      }
      map.get(key)!.cards.push(card)
    }
    return Array.from(map.values())
  }

  function renderCards(columnCards: KanbanCard[]) {
    if (swimlaneEnabled) {
      const groups = groupByProject(columnCards)
      return groups.map(group => (
        <div key={group.projectId ?? '__none__'} className={styles.swimlaneGroup}>
          <div
            className={styles.swimlaneHeader}
            style={{ borderColor: group.color, background: getSwimlaneBg(group.color) }}
          >
            <span style={{ color: group.color }}>{group.projectName ?? 'Sem projeto'}</span>
            <span style={{ color: group.color, opacity: 0.7 }}>{group.cards.length}</span>
          </div>
          {group.cards.map(card => renderCard(card))}
        </div>
      ))
    }
    return columnCards.map(card => renderCard(card))
  }

  function renderCard(card: KanbanCard) {
    return (
      <button
        key={card.nodeId}
        className={`${styles.card} ${draggedCardId === card.nodeId ? styles.cardDragging : ''}`}
        draggable
        onDragStart={() => setDraggedCardId(card.nodeId)}
        onDragEnd={() => { setDraggedCardId(null); setDragOverColId(null) }}
        onClick={() => setDetailCard(card)}
      >
        <div className={styles.cardTopRow}>
          <span
            className={styles.projectTag}
            style={{ borderColor: card.projectColor, color: card.projectColor }}
          >
            {card.projectName ?? 'Sem projeto'}
          </span>
          <PriorityDot priority={card.priority} />
        </div>

        <div className={styles.cardTitle}>{card.title}</div>

        <div className={styles.cardMeta}>
          <span>{formatDate(card.updatedAt)}</span>
          <span className={styles.priorityLabel}>{PRIORITY_LABELS[card.priority]}</span>
          <span className={styles.linkHint}>Ver no grafo</span>
        </div>
      </button>
    )
  }

  return (
    <section className={styles.boardShell}>
      {/* ── Header ── */}
      <div className={styles.boardHeader}>
        <div className={styles.boardHeaderLeft}>
          <div className={styles.eyebrow}>KANBAN VIEW</div>
          <h2 className={styles.title}>
            {activeProject ? activeProject.label : 'Todos os projetos'}
          </h2>
          <p className={styles.subtitle}>
            Cada card representa o mesmo nó Activity do grafo. Arraste entre colunas para atualizar o status.
          </p>
        </div>

        <div className={styles.boardHeaderRight}>
          {/* Swimlane toggle */}
          <button
            className={`${styles.swimlaneToggle} ${swimlaneEnabled ? styles.swimlaneToggleActive : ''}`}
            onClick={() => setSwimLaneEnabled(v => !v)}
            title="Agrupar por projeto"
          >
            ⬛ Por projeto
          </button>

          {/* Project selector */}
          {projectOptions.length > 1 && (
            <select
              className={styles.projectSelect}
              value={activeProjectFilterId ?? ''}
              onChange={e => setProjectFilter(e.target.value || null)}
            >
              <option value="">Todos os projetos</option>
              {projectOptions.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          )}

          <button className={styles.createButton} onClick={() => setShowModal(true)}>
            + Nova Atividade
          </button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      {!noCards && (
        <div className={styles.filterBar}>
          <input
            className={styles.filterSearch}
            type="search"
            placeholder="Buscar atividades…"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />

          <div className={styles.filterPriorityBtns}>
            {PRIORITY_FILTER_OPTIONS.map(opt => (
              <button
                key={opt.id}
                className={`${styles.filterPriorityBtn} ${priorityFilter === opt.id ? styles.filterPriorityBtnActive : ''}`}
                onClick={() => setPriorityFilter(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <span className={styles.filterSummary}>
            {filteredCards.length} de {cards.length} atividade{cards.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* ── Empty state (no cards at all) ── */}
      {noCards ? (
        <div className={styles.emptyInline}>
          <div className={styles.emptyEyebrow}>SEM ATIVIDADES</div>
          <h3 className={styles.emptyTitle}>Nenhuma atividade {activeProject ? `em "${activeProject.label}"` : 'registrada'}</h3>
          <p className={styles.emptyText}>
            Crie uma atividade manualmente ou peça ao JARVIS para gerar tarefas a partir do contexto do projeto.
          </p>
          <p className={styles.emptyShortcutHint}>Pressione <kbd>N</kbd> para criar nova atividade</p>
        </div>
      ) : (
        /* ── Board grid ── */
        <div className={styles.board}>
          {kanbanColumns
            .slice()
            .sort((a, b) => a.order - b.order)
            .map(column => {
              const columnCards = cardsByColumn.get(column.id) ?? []
              const isDropOver  = dragOverColId === column.id
              return (
                <div
                  key={column.id}
                  className={`${styles.column} ${isDropOver ? styles.columnDropOver : ''}`}
                  onDragOver={e => handleDragOver(e, column.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={() => void handleDrop(column.id)}
                >
                  <div className={styles.columnHeader}>
                    <h3>{column.title}</h3>
                    <div className={styles.columnHeaderRight}>
                      <span>{columnCards.length} {columnCards.length === 1 ? 'card' : 'cards'}</span>
                      <WipCount count={columnCards.length} />
                    </div>
                  </div>

                  <div className={styles.columnBody}>
                    {columnCards.length === 0 ? (
                      <div className={styles.columnEmptyState}>
                        <strong>{COLUMN_EMPTY_STATE[column.id].title}</strong>
                        <p>{COLUMN_EMPTY_STATE[column.id].description}</p>
                      </div>
                    ) : (
                      renderCards(columnCards)
                    )}
                  </div>
                </div>
              )
            })}
        </div>
      )}

      {/* ── New Card Modal ── */}
      {showModal && (
        <NewCardModal
          projectOptions={projectOptions}
          defaultProjectId={activeProjectFilterId ?? projectOptions[0]?.id ?? null}
          onClose={() => setShowModal(false)}
          onCreate={handleCreate}
        />
      )}

      {/* ── Card Detail Modal ── */}
      {detailCard && (
        <CardDetailModal
          nodeId={detailCard.nodeId}
          card={detailCard}
          onClose={() => setDetailCard(null)}
        />
      )}
    </section>
  )
}
