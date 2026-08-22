import { useMemo, useState } from 'react'
import { useBrainStore } from '../../store/brainStore'
import type { KanbanCard, KanbanColumnId } from '../../types'
import styles from './KanbanBoard.module.css'

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

export default function KanbanBoard() {
  const kanbanColumns = useBrainStore(state => state.kanbanColumns)
  const cards = useBrainStore(state => state.getKanbanCards())
  const createActivityNode = useBrainStore(state => state.createActivityNode)
  const moveActivityToColumn = useBrainStore(state => state.moveActivityToColumn)
  const selectNode = useBrainStore(state => state.selectNode)
  const nodes = useBrainStore(state => state.nodes)
  const activeProjectFilterId = useBrainStore(state => state.activeProjectFilterId)
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null)

  const projectOptions = useMemo(
    () => nodes.filter(node => node.category === 'Project').map(node => ({ id: node.id, label: node.label })),
    [nodes],
  )

  const cardsByColumn = useMemo(() => {
    const grouped = new Map<KanbanColumnId, KanbanCard[]>([
      ['backlog', []],
      ['in_progress', []],
      ['in_review', []],
      ['done', []],
    ])

    for (const card of cards) {
      grouped.get(card.columnId)?.push(card)
    }

    return grouped
  }, [cards])

  const handleCreateActivity = async () => {
    const selectedProjectId = activeProjectFilterId ?? projectOptions[0]?.id ?? null
    const label = window.prompt('Nome da nova atividade:', 'Nova atividade JARVIS')?.trim()
    if (!label) return
    const node = await createActivityNode(label, selectedProjectId)
    selectNode(node.id)
  }

  const handleDrop = async (columnId: KanbanColumnId) => {
    if (!draggedCardId) return
    await moveActivityToColumn(draggedCardId, columnId)
    setDraggedCardId(null)
  }

  if (cards.length === 0) {
    return (
      <section className={styles.emptyState}>
        <div className={styles.emptyEyebrow}>KANBAN OPERACIONAL</div>
        <h2 className={styles.emptyTitle}>Nenhuma atividade disponível</h2>
        <p className={styles.emptyText}>
          Crie uma atividade manualmente ou peça ao JARVIS para gerar tarefas. Nós da categoria Activity aparecem aqui automaticamente.
        </p>
        <button className={styles.createButton} onClick={handleCreateActivity}>
          Nova Atividade
        </button>
      </section>
    )
  }

  return (
    <section className={styles.boardShell}>
      <div className={styles.boardHeader}>
        <div>
          <div className={styles.eyebrow}>KANBAN VIEW</div>
          <h2 className={styles.title}>Atividades ligadas ao knowledge graph</h2>
          <p className={styles.subtitle}>
            Cada card representa o mesmo nó Activity do grafo. Arraste entre colunas para atualizar o status persistido no cérebro.
          </p>
        </div>
        <button className={styles.createButton} onClick={handleCreateActivity}>
          Nova Atividade
        </button>
      </div>

      <div className={styles.board}>
        {kanbanColumns
          .slice()
          .sort((a, b) => a.order - b.order)
          .map(column => {
            const columnCards = cardsByColumn.get(column.id) ?? []
            return (
              <div
                key={column.id}
                className={styles.column}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => void handleDrop(column.id)}
              >
                <div className={styles.columnHeader}>
                  <div>
                    <h3>{column.title}</h3>
                    <span>{columnCards.length} cards</span>
                  </div>
                </div>

                <div className={styles.columnBody}>
                  {columnCards.length === 0 ? (
                    <div className={styles.columnEmptyState}>
                      <strong>{COLUMN_EMPTY_STATE[column.id].title}</strong>
                      <p>{COLUMN_EMPTY_STATE[column.id].description}</p>
                    </div>
                  ) : (
                    columnCards.map(card => (
                      <button
                        key={card.nodeId}
                        className={`${styles.card} ${draggedCardId === card.nodeId ? styles.cardDragging : ''}`}
                        draggable
                        onDragStart={() => setDraggedCardId(card.nodeId)}
                        onDragEnd={() => setDraggedCardId(null)}
                        onClick={() => selectNode(card.nodeId)}
                      >
                        <div className={styles.cardTopRow}>
                          <span
                            className={styles.projectTag}
                            style={{
                              borderColor: card.projectColor,
                              color: card.projectColor,
                            }}
                          >
                            {card.projectName ?? 'Sem projeto'}
                          </span>
                          <PriorityDot priority={card.priority} />
                        </div>

                        <div className={styles.cardTitle}>{card.title}</div>

                        <div className={styles.cardMeta}>
                          <span>{formatDate(card.updatedAt)}</span>
                          <span className={styles.linkHint}>Abrir no grafo</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )
          })}
      </div>
    </section>
  )
}
