import { useEffect, useRef, useState } from 'react'
import type { BrainNode, NodeCategory } from '../../types'
import styles from './GraphContextMenu.module.css'

const ALL_CATEGORIES: NodeCategory[] = [
  'Project', 'Meeting', 'Onboarding', 'Tech', 'Activity', 'Person',
  'Decision', 'Note', 'Resource', 'Module', 'Feature', 'Endpoint',
]

const CAT_ICONS: Record<NodeCategory, string> = {
  Project:    '★', Meeting:    '📅', Onboarding: '🚀', Tech:       '⚙',
  Activity:   '✓', Person:     '👤', Decision:   '◆', Note:       '📝',
  Resource:   '🔗', Module:    '📦', Feature:    '✦', Endpoint:   '⬡',
}

interface Props {
  x: number
  y: number
  nodeId?: string
  nodeLabel?: string
  allNodes: BrainNode[]
  onClose: () => void
  onCreateNode: (label: string, category: NodeCategory) => Promise<void>
  onLinkTo: (targetId: string) => Promise<void>
  onSelect: () => void
}

export default function GraphContextMenu({
  x, y, nodeId, nodeLabel, allNodes, onClose, onCreateNode, onLinkTo, onSelect,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'main' | 'create' | 'link'>('main')
  const [newLabel, setNewLabel] = useState('')
  const [newCategory, setNewCategory] = useState<NodeCategory>('Note')
  const [linkSearch, setLinkSearch] = useState('')
  const [creating, setCreating] = useState(false)

  // Clamp to viewport
  const [pos, setPos] = useState({ left: x, top: y })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos({
      left: Math.min(x, window.innerWidth  - rect.width  - 8),
      top:  Math.min(y, window.innerHeight - rect.height - 8),
    })
  }, [x, y, mode])

  // Close on outside click or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [onClose])

  const filteredNodes = allNodes.filter(n =>
    n.id !== nodeId &&
    n.label.toLowerCase().includes(linkSearch.toLowerCase())
  ).slice(0, 10)

  const handleCreate = async () => {
    if (!newLabel.trim() || creating) return
    setCreating(true)
    await onCreateNode(newLabel.trim(), newCategory)
    setCreating(false)
  }

  return (
    <div
      ref={ref}
      className={styles.menu}
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={e => e.preventDefault()}
    >
      {/* ── Main menu */}
      {mode === 'main' && (
        <>
          {nodeId ? (
            <>
              <div className={styles.menuHeader}>
                <span className={styles.menuHeaderDot} />
                <span className={styles.menuHeaderLabel}>{nodeLabel}</span>
              </div>
              <div className={styles.divider} />
              <button className={styles.item} onClick={onSelect}>
                <span className={styles.itemIcon}>◎</span> Focar nó
              </button>
              <button className={styles.item} onClick={() => setMode('link')}>
                <span className={styles.itemIcon}>⇀</span> Conectar a…
              </button>
              <button className={`${styles.item} ${styles.itemNew}`} onClick={() => setMode('create')}>
                <span className={styles.itemIcon}>+</span> Criar nó aqui
              </button>
            </>
          ) : (
            <>
              <div className={styles.menuHeader}>
                <span className={styles.menuHeaderLabel}>Grafo</span>
              </div>
              <div className={styles.divider} />
              <button className={`${styles.item} ${styles.itemNew}`} onClick={() => setMode('create')}>
                <span className={styles.itemIcon}>+</span> Criar novo nó
              </button>
            </>
          )}
        </>
      )}

      {/* ── Create node mode */}
      {mode === 'create' && (
        <div className={styles.form}>
          <div className={styles.formTitle}>Novo nó</div>
          <input
            className={styles.formInput}
            placeholder="Nome do nó…"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleCreate() }}
            autoFocus
            maxLength={60}
          />
          <div className={styles.catGrid}>
            {ALL_CATEGORIES.map(cat => (
              <button
                key={cat}
                className={`${styles.catBtn} ${newCategory === cat ? styles.catBtnActive : ''}`}
                onClick={() => setNewCategory(cat)}
                title={cat}
              >
                <span>{CAT_ICONS[cat]}</span>
                <span className={styles.catBtnLabel}>{cat}</span>
              </button>
            ))}
          </div>
          <div className={styles.formActions}>
            <button
              className={styles.formCreate}
              onClick={void handleCreate}
              disabled={!newLabel.trim() || creating}
            >
              {creating ? '…' : 'Criar'}
            </button>
            <button className={styles.formCancel} onClick={() => setMode('main')}>
              Voltar
            </button>
          </div>
        </div>
      )}

      {/* ── Link mode */}
      {mode === 'link' && (
        <div className={styles.form}>
          <div className={styles.formTitle}>Conectar a…</div>
          <input
            className={styles.formInput}
            placeholder="Buscar nó…"
            value={linkSearch}
            onChange={e => setLinkSearch(e.target.value)}
            autoFocus
          />
          <div className={styles.linkList}>
            {filteredNodes.length === 0 && (
              <div className={styles.linkEmpty}>Nenhum nó encontrado</div>
            )}
            {filteredNodes.map(n => (
              <button
                key={n.id}
                className={styles.linkItem}
                onClick={() => void onLinkTo(n.id)}
              >
                <span className={styles.linkItemIcon}>{CAT_ICONS[n.category]}</span>
                <span className={styles.linkItemLabel}>{n.label}</span>
                <span className={styles.linkItemCat}>{n.category}</span>
              </button>
            ))}
          </div>
          <button className={styles.formCancel} onClick={() => setMode('main')}>
            Voltar
          </button>
        </div>
      )}
    </div>
  )
}
