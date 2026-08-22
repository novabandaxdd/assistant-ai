import { useState, useRef, useEffect } from 'react'
import { useProjectStore } from '../../store/projectStore'
import { useBrainStore } from '../../store/brainStore'
import type { ProjectType } from '../../types'
import ImportContextWizard from './ImportContextWizard'
import ProjectDashboard from './ProjectDashboard'
import styles from './ProjectSwitcher.module.css'

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

export default function ProjectSwitcher() {
  const projects        = useProjectStore(s => s.projects)
  const activeProjectId = useProjectStore(s => s.activeProjectId)
  const setActiveProject = useProjectStore(s => s.setActiveProject)
  const createProject   = useProjectStore(s => s.createProject)

  const setProjectFilter = useBrainStore(s => s.setProjectFilter)

  const [open, setOpen]               = useState(false)
  const [showForm, setShowForm]       = useState(false)
  const [newName, setNewName]         = useState('')
  const [newType, setNewType]         = useState<ProjectType>('software')
  const [creating, setCreating]       = useState(false)
  const [showImport, setShowImport]   = useState(false)
  const [showDashboard, setShowDashboard] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setShowForm(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const activeProject = projects.find(p => p.id === activeProjectId)

  function handleSelect(id: string) {
    setActiveProject(id)
    setProjectFilter(id)
    setOpen(false)
    setShowForm(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim() || creating) return
    setCreating(true)
    try {
      const project = await createProject({
        name: newName.trim(),
        type: newType,
        status: 'active',
        color: '#f59e0b',
      })
      handleSelect(project.id)
      setNewName('')
      setNewType('software')
      setShowForm(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className={styles.root} ref={containerRef}>
      <button
        className={styles.trigger}
        onClick={() => setOpen(prev => !prev)}
        title="Trocar projeto"
      >
        <span
          className={styles.colorDot}
          style={{ background: activeProject?.color ?? '#94a3b8' }}
        />
        <span className={styles.triggerName}>
          {activeProject?.name ?? 'Sem Projeto'}
        </span>
        <span className={styles.caret}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.list}>
            {projects.map(project => (
              <button
                key={project.id}
                className={`${styles.item} ${project.id === activeProjectId ? styles.active : ''}`}
                onClick={() => handleSelect(project.id)}
              >
                <span
                  className={styles.colorDot}
                  style={{ background: project.color }}
                />
                <span className={styles.itemName}>{project.name}</span>
                <span className={styles.itemType}>
                  {PROJECT_TYPE_LABELS[project.type]}
                </span>
              </button>
            ))}
          </div>

          {!showForm && (
            <>
              <button
                className={styles.dashBtn}
                onClick={() => { setShowDashboard(true); setOpen(false) }}
              >
                ⚙ Painel
              </button>
              <button
                className={styles.newBtn}
                onClick={() => setShowForm(true)}
              >
                + Novo Projeto
              </button>
              <button
                className={styles.importBtn}
                onClick={() => { setShowImport(true); setOpen(false) }}
              >
                ↓ Importar Contexto
              </button>
            </>
          )}

          {showForm && (
            <form className={styles.form} onSubmit={handleCreate}>
              <input
                className={styles.input}
                type="text"
                placeholder="Nome do projeto"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                autoFocus
                maxLength={64}
              />
              <select
                className={styles.select}
                value={newType}
                onChange={e => setNewType(e.target.value as ProjectType)}
              >
                {(Object.keys(PROJECT_TYPE_LABELS) as ProjectType[]).map(t => (
                  <option key={t} value={t}>{PROJECT_TYPE_LABELS[t]}</option>
                ))}
              </select>
              <div className={styles.formActions}>
                <button
                  type="submit"
                  className={styles.createBtn}
                  disabled={!newName.trim() || creating}
                >
                  {creating ? '…' : 'Criar'}
                </button>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => { setShowForm(false); setNewName('') }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      )}
      {showImport && (
        <ImportContextWizard
          open={showImport}
          onClose={() => setShowImport(false)}
        />
      )}
      <ProjectDashboard
        open={showDashboard}
        onClose={() => setShowDashboard(false)}
      />
    </div>
  )
}
