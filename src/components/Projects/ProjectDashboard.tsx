import { useEffect, useState, useCallback } from 'react'
import { useBrainStore } from '../../store/brainStore'
import { useProjectStore } from '../../store/projectStore'
import { calculateContextHealth } from '../../utils/contextHealth'
import {
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
  deleteSnapshot,
} from '../../utils/snapshotService'
import type { ProjectSnapshot } from '../../types'
import type { ProjectType } from '../../types'
import styles from './ProjectDashboard.module.css'

const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  software:    'Software',
  qa:          'QA',
  product:     'Produto',
  marketing:   'Marketing',
  research:    'Pesquisa',
  engineering: 'Engenharia',
  design:      'Design',
  operations:  'Operações',
  personal:    'Pessoal',
  custom:      'Personalizado',
}

const PRESET_COLORS = [
  '#f59e0b', '#00e5ff', '#4ade80', '#c084fc',
  '#f87171', '#38bdf8', '#fb923c', '#a3e635',
]

function healthBarColor(score: number): string {
  if (score >= 70) return 'linear-gradient(90deg, #4ade80, #22c55e)'
  if (score >= 40) return 'linear-gradient(90deg, #fbbf24, #f59e0b)'
  return 'linear-gradient(90deg, #f87171, #ef4444)'
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function ProjectDashboard({ open, onClose }: Props) {
  const nodes = useBrainStore(s => s.nodes)
  const links = useBrainStore(s => s.links)
  const sessions = useBrainStore(s => s.sessions)
  const exportBrain = useBrainStore(s => s.exportBrain)
  const clearProjectData = useBrainStore(s => s.clearProjectData)

  const projects = useProjectStore(s => s.projects)
  const activeProjectId = useProjectStore(s => s.activeProjectId)
  const updateProject = useProjectStore(s => s.updateProject)
  const deleteProjectStore = useProjectStore(s => s.deleteProject)
  const setActiveProject = useProjectStore(s => s.setActiveProject)
  const createProject = useProjectStore(s => s.createProject)

  const project = projects.find(p => p.id === activeProjectId) ?? null
  const projectId = project?.id ?? null

  // Nodes/links scoped to this project
  const projectNodes = nodes.filter(n => n.projectId === projectId)
  const projectNodeIds = new Set(projectNodes.map(n => n.id))
  const projectLinks = links.filter(link => {
    const src = typeof link.source === 'string' ? link.source : link.source.id
    const tgt = typeof link.target === 'string' ? link.target : link.target.id
    return projectNodeIds.has(src) || projectNodeIds.has(tgt)
  })

  const health = calculateContextHealth(projectNodes, projectLinks)

  const [snapshots, setSnapshots] = useState<ProjectSnapshot[]>([])
  const [creatingSnap, setCreatingSnap] = useState(false)

  // Edit form state
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState<ProjectType>('software')
  const [editColor, setEditColor] = useState('#f59e0b')
  const [saving, setSaving] = useState(false)

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const loadSnaps = useCallback(async () => {
    if (!projectId) return
    const snaps = await listSnapshots(projectId)
    setSnapshots(snaps)
  }, [projectId])

  useEffect(() => {
    if (open && projectId) {
      void loadSnaps()
    }
  }, [open, projectId, loadSnaps])

  useEffect(() => {
    if (project) {
      setEditName(project.name)
      setEditType(project.type)
      setEditColor(project.color)
    }
  }, [project])

  if (!open || !project) return null

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  async function handleCreateSnapshot() {
    if (!projectId || creatingSnap) return
    setCreatingSnap(true)
    try {
      await createSnapshot(projectId, 'Manual', 'manual')
      await loadSnaps()
    } finally {
      setCreatingSnap(false)
    }
  }

  async function handleRestore(snap: ProjectSnapshot) {
    await restoreSnapshot(snap)
  }

  async function handleDeleteSnap(id: string) {
    await deleteSnapshot(id)
    await loadSnaps()
  }

  function handleExport() {
    if (!project) return
    const data = exportBrain()
    const payload = JSON.stringify(data, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const date = new Date().toISOString().slice(0, 10)
    link.href = url
    link.download = `jarvis-${project.name.replace(/\s+/g, '-').toLowerCase()}-${date}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!project || !editName.trim() || saving) return
    setSaving(true)
    try {
      await updateProject(project.id, { name: editName.trim(), type: editType, color: editColor })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!project || deleting) return
    const currentProject = project
    setDeleting(true)
    try {
      await clearProjectData(currentProject.id)
      await deleteProjectStore(currentProject.id)
      // Switch to next project or create new
      const remaining = projects.filter(p => p.id !== currentProject.id)
      if (remaining.length > 0) {
        setActiveProject(remaining[0].id)
      } else {
        const newProj = await createProject({
              name: 'Novo Projeto',
          type: 'software',
          status: 'active',
          color: '#f59e0b',
        })
        setActiveProject(newProj.id)
      }
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString('pt-BR', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  }

  const gradeClass = styles[`grade${health.grade.charAt(0).toUpperCase()}${health.grade.slice(1)}`]

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.projectTitle}>
              <span className={styles.projectDot} style={{ background: project.color }} />
              {project.name}
            </div>
            <div className={styles.projectMeta}>
              {PROJECT_TYPE_LABELS[project.type]} · {project.status}
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.divider} />

        {/* ── Context Health ──────────────────────────────────────────────── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Saúde do Contexto</div>
          <div className={styles.healthRow}>
            <div className={styles.healthBarWrap}>
              <div
                className={styles.healthBar}
                style={{
                  width: `${health.score}%`,
                  background: healthBarColor(health.score),
                }}
              />
            </div>
            <span className={styles.healthScore}>{health.score}%</span>
          </div>
          <span className={`${styles.healthGrade} ${gradeClass}`}>
            {health.grade.charAt(0).toUpperCase() + health.grade.slice(1)}
          </span>
          <div className={styles.checkList}>
            {health.checks.map(check => (
              <div key={check.key}>
                <div className={styles.checkItem}>
                  <span className={`${styles.checkIcon} ${styles[check.status]}`}>
                    {check.status === 'ok' ? '✓' : check.status === 'warn' ? '⚠' : '✗'}
                  </span>
                  <span className={styles.checkLabel}>{check.label}</span>
                </div>
                {check.detail && (
                  <div className={styles.checkDetail}>{check.detail}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.divider} />

        {/* ── Graph Stats ─────────────────────────────────────────────────── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Estatísticas do Grafo</div>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{projectNodes.length}</div>
              <div className={styles.statLabel}>Nós</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{projectLinks.length}</div>
              <div className={styles.statLabel}>Links</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{sessions.length}</div>
              <div className={styles.statLabel}>Sessões</div>
            </div>
          </div>
        </div>

        <div className={styles.divider} />

        {/* ── Snapshots ───────────────────────────────────────────────────── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Snapshots</div>
          <button
            className={styles.btnCreate}
            onClick={handleCreateSnapshot}
            disabled={creatingSnap}
          >
            {creatingSnap ? '…' : '+ Criar Snapshot'}
          </button>
          {snapshots.length === 0 ? (
            <div className={styles.noSnapshots}>Nenhum snapshot ainda</div>
          ) : (
            <div className={styles.snapshotList}>
              {snapshots.map(snap => (
                <div key={snap.id} className={styles.snapshotItem}>
                  <span className={styles.snapshotDate}>{formatDate(snap.createdAt)}</span>
                  <span className={styles.snapshotLabel} title={snap.label}>{snap.label}</span>
                  <span className={`${styles.snapshotSource} ${styles[snap.source]}`}>
                    {snap.source}
                  </span>
                  <button
                    className={styles.restoreBtn}
                    onClick={() => handleRestore(snap)}
                    title="Restaurar este snapshot"
                  >
                    Restaurar
                  </button>
                  <button
                    className={styles.restoreBtn}
                    onClick={() => handleDeleteSnap(snap.id)}
                    title="Excluir snapshot"
                    style={{ borderColor: 'rgba(248,113,113,0.25)', color: 'rgba(248,113,113,0.7)' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.divider} />

        {/* ── Edit Form ───────────────────────────────────────────────────── */}
        {editing && (
          <form className={styles.editForm} onSubmit={handleSaveEdit}>
            <div className={styles.editRow}>
              <input
                className={styles.editInput}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="Nome do projeto"
                maxLength={64}
                autoFocus
              />
              <select
                className={styles.editSelect}
                value={editType}
                onChange={e => setEditType(e.target.value as ProjectType)}
              >
                {(Object.keys(PROJECT_TYPE_LABELS) as ProjectType[]).map(t => (
                  <option key={t} value={t}>{PROJECT_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div className={styles.colorSwatches}>
              {PRESET_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  className={`${styles.colorSwatch} ${editColor === color ? styles.selected : ''}`}
                  style={{ background: color }}
                  onClick={() => setEditColor(color)}
                  title={color}
                />
              ))}
            </div>
            <div className={styles.editActions}>
              <button type="submit" className={styles.btn} disabled={!editName.trim() || saving}>
                {saving ? '…' : 'Salvar'}
              </button>
              <button type="button" className={styles.btn} onClick={() => setEditing(false)}>
                Cancelar
              </button>
            </div>
          </form>
        )}

        {/* ── Delete confirm ───────────────────────────────────────────────── */}
        {confirmDelete && (
          <div className={styles.confirmBox}>
            <span>Excluir <strong>{project.name}</strong> e todos os seus dados? Esta ação não pode ser desfeita.</span>
            <div className={styles.confirmActions}>
              <button className={styles.confirmYes} onClick={handleDelete} disabled={deleting}>
                {deleting ? '…' : 'Sim, Excluir'}
              </button>
              <button className={styles.confirmNo} onClick={() => setConfirmDelete(false)}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* ── Action row ─────────────────────────────────────────────────── */}
        {!editing && !confirmDelete && (
          <div className={styles.actionRow}>
            <button className={styles.btn} onClick={() => setEditing(true)}>
              ✎ Editar Projeto
            </button>
            <button className={styles.btn} onClick={handleExport}>
              ↓ Exportar
            </button>
            <button
              className={styles.btnDanger}
              onClick={() => setConfirmDelete(true)}
            >
              ✕ Excluir
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
