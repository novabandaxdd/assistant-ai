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
  // createProject is used by NewProjectWizard (sub-component below)

  const setProjectFilter = useBrainStore(s => s.setProjectFilter)

  const [open, setOpen]               = useState(false)
  const [showImport, setShowImport]   = useState(false)
  const [showDashboard, setShowDashboard] = useState(false)
  const [showNewWizard, setShowNewWizard] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
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

          <>
            <button
              className={styles.dashBtn}
              onClick={() => { setShowDashboard(true); setOpen(false) }}
            >
              ⚙ Painel
            </button>
            <button
              className={styles.newBtn}
              onClick={() => { setShowNewWizard(true); setOpen(false) }}
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
      {showNewWizard && (
        <NewProjectWizard
          onClose={() => setShowNewWizard(false)}
          onCreated={(id) => { handleSelect(id); setShowNewWizard(false) }}
        />
      )}
    </div>
  )
}

// ── Inline New Project Wizard ─────────────────────────────────────────────────

interface NewProjectWizardProps {
  onClose: () => void
  onCreated: (id: string) => void
}

function NewProjectWizard({ onClose, onCreated }: NewProjectWizardProps) {
  const createProject  = useProjectStore(s => s.createProject)
  const importBrain    = useBrainStore(s => s.importBrain)

  const { vaultGet } = { vaultGet: null as null } // placeholder, unused

  const [step, setStep]          = useState<1 | 2 | 3>(1)
  const [name, setName]          = useState('')
  const [type, setType]          = useState<ProjectType>('software')
  const [choice, setChoice]      = useState<'scratch' | 'import' | null>(null)
  const [jsonText, setJsonText]  = useState('')
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [creating, setCreating]  = useState(false)
  const fileRef                  = useRef<HTMLInputElement>(null)

  void vaultGet

  const TYPES = Object.entries(PROJECT_TYPE_LABELS) as [ProjectType, string][]

  async function handleFinish(importData?: import('../../types').BrainExportData) {
    if (creating) return
    setCreating(true)
    try {
      const project = await createProject({
        name: name.trim() || 'Novo Projeto',
        type,
        status: 'active',
        color: '#f59e0b',
      })
      if (importData) {
        await importBrain(importData, 'merge')
      }
      onCreated(project.id)
    } finally {
      setCreating(false)
    }
  }

  async function handleImportAndFinish() {
    setImportError('')
    let parsed: unknown
    try { parsed = JSON.parse(jsonText.trim()) }
    catch { setImportError('JSON inválido.'); return }

    const d = parsed as Record<string, unknown>
    if (!d || !Array.isArray(d.nodes) || !Array.isArray(d.links)) {
      setImportError('Schema inválido. Esperado: meta, nodes, links.')
      return
    }
    setImporting(true)
    try { await handleFinish(parsed as import('../../types').BrainExportData) }
    finally { setImporting(false) }
  }

  return (
    <div className={styles.wizardOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.wizardCard}>
        {/* Steps */}
        <div className={styles.wizardSteps}>
          {[1,2,3].map((n, i) => (
            <span key={n} className={styles.wizardStepRow}>
              {i > 0 && <span className={styles.wizardStepLine} />}
              <span className={`${styles.wizardStepDot} ${step === n ? styles.wizardStepActive : step > n ? styles.wizardStepDone : ''}`} />
            </span>
          ))}
        </div>

        {/* Step 1 — Name + Type */}
        {step === 1 && (
          <div className={styles.wizardBody}>
            <div className={styles.wizardEyebrow}>NOVO PROJETO</div>
            <h2 className={styles.wizardTitle}>Como se chama o projeto?</h2>
            <input
              className={styles.wizardInput}
              placeholder="ex: Meu MVP"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && name.trim()) setStep(2) }}
              autoFocus
              maxLength={64}
            />
            <div className={styles.wizardTypeGrid}>
              {TYPES.map(([t, label]) => (
                <button
                  key={t}
                  className={`${styles.wizardTypeBtn} ${type === t ? styles.wizardTypeBtnActive : ''}`}
                  onClick={() => setType(t)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className={styles.wizardActions}>
              <button className={styles.wizardCancel} onClick={onClose}>Cancelar</button>
              <button
                className={styles.wizardContinue}
                disabled={!name.trim()}
                onClick={() => setStep(2)}
              >
                Continuar →
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Import or Scratch */}
        {step === 2 && (
          <div className={styles.wizardBody}>
            <div className={styles.wizardEyebrow}>PONTO DE PARTIDA</div>
            <h2 className={styles.wizardTitle}>Como quer começar?</h2>
            <div className={styles.wizardChoices}>
              <button
                className={`${styles.wizardChoice} ${choice === 'scratch' ? styles.wizardChoiceActive : ''}`}
                onClick={() => setChoice('scratch')}
              >
                <span className={styles.wizardChoiceIcon}>✦</span>
                <div>
                  <div className={styles.wizardChoiceTitle}>Grafo em branco</div>
                  <div className={styles.wizardChoiceDesc}>Comece do zero e construa o grafo manualmente</div>
                </div>
              </button>
              <button
                className={`${styles.wizardChoice} ${choice === 'import' ? styles.wizardChoiceActive : ''}`}
                onClick={() => setChoice('import')}
              >
                <span className={styles.wizardChoiceIcon}>↓</span>
                <div>
                  <div className={styles.wizardChoiceTitle}>Importar JSON</div>
                  <div className={styles.wizardChoiceDesc}>Cole um JSON gerado por IA ou exporte de outro projeto</div>
                </div>
              </button>
            </div>
            <div className={styles.wizardActions}>
              <button className={styles.wizardCancel} onClick={() => setStep(1)}>← Voltar</button>
              <button
                className={styles.wizardContinue}
                disabled={!choice}
                onClick={() => {
                  if (choice === 'scratch') void handleFinish()
                  else setStep(3)
                }}
              >
                {choice === 'scratch' ? 'Criar Projeto' : 'Continuar →'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Import JSON */}
        {step === 3 && (
          <div className={styles.wizardBody}>
            <div className={styles.wizardEyebrow}>IMPORTAR CONTEXTO</div>
            <h2 className={styles.wizardTitle}>Cole o JSON do projeto</h2>
            <textarea
              className={styles.wizardTextarea}
              placeholder='{"meta":{...},"nodes":[...],"links":[...],...}'
              value={jsonText}
              onChange={e => { setJsonText(e.target.value); setImportError('') }}
              rows={7}
            />
            <div className={styles.wizardFileRow}>
              <button
                className={styles.wizardFileBtn}
                onClick={() => fileRef.current?.click()}
              >
                📁 Carregar arquivo .json
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  const r = new FileReader()
                  r.onload = () => setJsonText(r.result as string)
                  r.readAsText(f)
                  e.target.value = ''
                }}
              />
            </div>
            {importError && <div className={styles.wizardError}>{importError}</div>}
            <div className={styles.wizardActions}>
              <button className={styles.wizardCancel} onClick={() => setStep(2)}>← Voltar</button>
              <button
                className={styles.wizardContinue}
                disabled={!jsonText.trim() || importing}
                onClick={() => void handleImportAndFinish()}
              >
                {importing ? 'Importando…' : 'Importar e Criar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
