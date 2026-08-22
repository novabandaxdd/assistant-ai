import { useEffect, useRef, useState } from 'react'
import { useBrainStore } from '../../store/brainStore'
import type { KanbanCard, KanbanColumnId } from '../../types'
import styles from './CardDetailModal.module.css'

const COLUMN_OPTIONS: { id: KanbanColumnId; label: string }[] = [
  { id: 'backlog',     label: 'Backlog' },
  { id: 'in_progress', label: 'Em Progresso' },
  { id: 'in_review',   label: 'Em Revisão' },
  { id: 'done',        label: 'Concluído' },
]

const PRIORITY_OPTIONS: { id: KanbanCard['priority']; label: string; color: string }[] = [
  { id: 'low',    label: 'Baixa',  color: '#60a5fa' },
  { id: 'medium', label: 'Média',  color: '#f59e0b' },
  { id: 'high',   label: 'Alta',   color: '#f43f5e' },
]

function formatDateTime(ts: number | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Inline markdown renderer ─────────────────────────────────────────────────
// Handles **bold**, `code`, and [text](url) patterns
function renderMarkdown(text: string): React.ReactNode[] {
  // Combined pattern: **bold**, `code`, [label](url)
  const pattern = /(\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    if (match[0].startsWith('**')) {
      // bold
      parts.push(<strong key={match.index} className={styles.mdBold}>{match[2]}</strong>)
    } else if (match[0].startsWith('`')) {
      // inline code
      parts.push(<code key={match.index} className={styles.mdCode}>{match[3]}</code>)
    } else {
      // link
      parts.push(
        <a key={match.index} href={match[5]} target="_blank" rel="noopener noreferrer" className={styles.mdLink}>
          {match[4]}
        </a>,
      )
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {renderMarkdown(line)}
          {i < lines.length - 1 && <br />}
        </span>
      ))}
    </>
  )
}

interface CardDetailModalProps {
  nodeId: string
  card: KanbanCard
  onClose: () => void
}

export default function CardDetailModal({ nodeId, card, onClose }: CardDetailModalProps) {
  const nodes                = useBrainStore(s => s.nodes)
  const links                = useBrainStore(s => s.links)
  const updateNode           = useBrainStore(s => s.updateNode)
  const removeNode           = useBrainStore(s => s.removeNode)
  const moveActivityToColumn = useBrainStore(s => s.moveActivityToColumn)
  const selectNode           = useBrainStore(s => s.selectNode)
  const setCurrentView       = useBrainStore(s => s.setCurrentView)

  const node = nodes.find(n => n.id === nodeId)

  // ── local edit state (mirrors node fields) ────────────────────────────────
  const [title,       setTitle]       = useState(node?.label   ?? '')
  const [description, setDescription] = useState(node?.content?.replace(/\s*\n?\n?Status:[^\n]*/i, '').trim() ?? '')
  const [priority,    setPriority]    = useState<KanbanCard['priority']>(card.priority)
  const [columnId,    setColumnId]    = useState<KanbanColumnId>(card.columnId)
  const [images,      setImages]      = useState<string[]>(node?.images ?? [])
  const [saving,      setSaving]      = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(false)
  const [dirty,       setDirty]       = useState(false)
  const [idCopied,    setIdCopied]    = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // sync if node changes externally
  useEffect(() => {
    if (!node) return
    setTitle(node.label)
    setDescription(node.content?.replace(/\s*\n?\n?Status:[^\n]*/i, '').trim() ?? '')
    setImages(node.images ?? [])
  }, [node])

  if (!node) return null

  // ── derived: connected nodes count ───────────────────────────────────────
  const connectedCount = links.filter(l => {
    const src = typeof l.source === 'string' ? l.source : l.source.id
    const tgt = typeof l.target === 'string' ? l.target : l.target.id
    return src === nodeId || tgt === nodeId
  }).length

  // ── helpers ───────────────────────────────────────────────────────────────
  const markDirty = () => setDirty(true)

  const statusMap: Record<KanbanColumnId, string> = {
    backlog:     '📋 Backlog',
    in_progress: '🔄 Em progresso',
    in_review:   '🧐 Em revisão',
    done:        '✅ Concluído',
  }

  const handleCopyId = () => {
    void navigator.clipboard.writeText(nodeId).then(() => {
      setIdCopied(true)
      setTimeout(() => setIdCopied(false), 1500)
    })
  }

  const handleViewInGraph = () => {
    selectNode(nodeId, true)
    setCurrentView('graph')
    onClose()
  }

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)

    // Rebuild content: description + status line
    const statusLine = `Status: ${statusMap[columnId]}.`
    const newContent = description.trim()
      ? `${description.trim()}\n\nStatus: ${statusMap[columnId]}.`
      : statusLine

    // Rebuild priority tags (keep other tags intact)
    const otherTags = (node.tags ?? []).filter(t => !t.startsWith('priority:') && !t.startsWith('status:'))
    const newTags   = [...otherTags, `priority:${priority}`, `status:${columnId}`]

    await updateNode(nodeId, {
      label:   title.trim(),
      content: newContent,
      tags:    newTags,
      images,
    })

    // Move column if changed
    if (columnId !== card.columnId) {
      await moveActivityToColumn(nodeId, columnId)
    }

    setSaving(false)
    setDirty(false)
  }

  const handleDelete = async () => {
    await removeNode(nodeId)
    onClose()
  }

  // ── image handlers ────────────────────────────────────────────────────────
  const handleImagePick = () => fileInputRef.current?.click()

  const handleImageFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return

    const readers = files.map(file => new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload  = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    }))

    Promise.all(readers).then(newDataUrls => {
      setImages(prev => [...prev, ...newDataUrls])
      markDirty()
    }).catch(() => {})
  }

  const handleDeleteImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx))
    markDirty()
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const imageItem = items.find(item => item.type.startsWith('image/'))
    if (!imageItem) return
    const file = imageItem.getAsFile()
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setImages(prev => [...prev, reader.result as string])
      markDirty()
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal} onPaste={handlePaste}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <div className={styles.headerMeta}>
            <span
              className={styles.projectBadge}
              style={{ borderColor: card.projectColor, color: card.projectColor }}
            >
              {card.projectName ?? 'Sem projeto'}
            </span>

            {/* Connected nodes badge */}
            <span className={styles.connectionsBadge} title="Conexões no grafo">
              {connectedCount} {connectedCount === 1 ? 'conexão' : 'conexões'}
            </span>

            <span className={styles.timestamp}>
              Atualizado: {formatDateTime(node.updatedAt ?? null)}
            </span>
          </div>
          <div className={styles.headerActions}>
            {/* Ver no grafo */}
            <button className={styles.graphBtn} onClick={handleViewInGraph} title="Abrir este nó no grafo">
              Ver no grafo ↗
            </button>
            <button className={styles.closeBtn} onClick={onClose} aria-label="Fechar">×</button>
          </div>
        </div>

        {/* ── Node ID strip ── */}
        <div className={styles.nodeIdStrip}>
          <span className={styles.nodeIdLabel}>ID</span>
          <span className={styles.nodeIdValue}>{nodeId}</span>
          <button
            className={`${styles.nodeIdCopyBtn} ${idCopied ? styles.nodeIdCopied : ''}`}
            onClick={handleCopyId}
            title="Copiar ID"
          >
            {idCopied ? '✓ Copiado' : 'Copiar'}
          </button>
        </div>

        {/* ── Title ── */}
        <div className={styles.titleRow}>
          <input
            className={styles.titleInput}
            value={title}
            onChange={e => { setTitle(e.target.value); markDirty() }}
            placeholder="Título da atividade"
          />
        </div>

        <div className={styles.body}>

          {/* ── Left column ── */}
          <div className={styles.mainCol}>

            {/* Description */}
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Descrição</div>
              <textarea
                className={styles.descTextarea}
                value={description}
                onChange={e => { setDescription(e.target.value); markDirty() }}
                placeholder="Adicione uma descrição, critérios de aceite, links… Suporta **negrito**, `código` e [texto](url)"
                rows={6}
              />
              {/* Markdown preview */}
              {description.trim() && (
                <div className={styles.mdPreview}>
                  <MarkdownContent text={description} />
                </div>
              )}
            </div>

            {/* Images */}
            <div className={styles.section}>
              <div className={styles.sectionLabel}>
                Imagens
                <span className={styles.sectionHint}>— cole (Ctrl+V) ou clique em Adicionar</span>
              </div>

              {images.length > 0 && (
                <div className={styles.imageGrid}>
                  {images.map((src, idx) => (
                    <div key={idx} className={styles.imageThumb}>
                      <img src={src} alt={`Imagem ${idx + 1}`} className={styles.thumbImg} />
                      <button
                        className={styles.deleteImgBtn}
                        onClick={() => handleDeleteImage(idx)}
                        aria-label="Remover imagem"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className={styles.hiddenInput}
                onChange={handleImageFiles}
              />
              <button className={styles.addImageBtn} onClick={handleImagePick}>
                + Adicionar imagem
              </button>
            </div>

          </div>

          {/* ── Right sidebar ── */}
          <div className={styles.sideCol}>

            {/* Status / Column */}
            <div className={styles.sideSection}>
              <div className={styles.sideSectionLabel}>Status</div>
              <div className={styles.optionList}>
                {COLUMN_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    className={`${styles.optionBtn} ${columnId === opt.id ? styles.optionBtnActive : ''}`}
                    onClick={() => { setColumnId(opt.id); markDirty() }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div className={styles.sideSection}>
              <div className={styles.sideSectionLabel}>Prioridade</div>
              <div className={styles.optionList}>
                {PRIORITY_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    className={`${styles.optionBtn} ${priority === opt.id ? styles.optionBtnActive : ''}`}
                    style={priority === opt.id ? { borderColor: opt.color, color: opt.color } : {}}
                    onClick={() => { setPriority(opt.id); markDirty() }}
                  >
                    <span className={styles.priorityDot} style={{ background: opt.color }} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Created at */}
            <div className={styles.sideSection}>
              <div className={styles.sideSectionLabel}>Criado em</div>
              <div className={styles.sideMeta}>{formatDateTime(node.createdAt ?? null)}</div>
            </div>

            {/* Delete */}
            <div className={styles.sideSection}>
              {!confirmDel ? (
                <button className={styles.deleteCardBtn} onClick={() => setConfirmDel(true)}>
                  Deletar atividade
                </button>
              ) : (
                <div className={styles.confirmDel}>
                  <p>Confirmar exclusão?</p>
                  <div className={styles.confirmRow}>
                    <button className={styles.confirmYes} onClick={() => void handleDelete()}>Sim, deletar</button>
                    <button className={styles.confirmNo}  onClick={() => setConfirmDel(false)}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* ── Footer / Save ── */}
        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>Fechar</button>
          <button
            className={styles.saveBtn}
            onClick={() => void handleSave()}
            disabled={saving || !dirty || !title.trim()}
          >
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>

      </div>
    </div>
  )
}
