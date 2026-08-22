import { useRef, useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import { useBrainStore } from '../../store/brainStore'
import { useSyncStore } from '../../store/syncStore'
import type { ProjectType, BrainExportData } from '../../types'
import { GENERATE_CONTEXT_PROMPT } from '../../utils/generateContextPrompt'
import styles from './OnboardingWizard.module.css'

const TYPE_OPTIONS: { type: ProjectType; icon: string; label: string }[] = [
  { type: 'software',    icon: '💻', label: 'Software Dev' },
  { type: 'qa',          icon: '🧪', label: 'QA / Testing' },
  { type: 'product',     icon: '📦', label: 'Product' },
  { type: 'marketing',   icon: '📣', label: 'Marketing' },
  { type: 'research',    icon: '🔬', label: 'Research' },
  { type: 'engineering', icon: '⚙️',  label: 'Engineering' },
  { type: 'design',      icon: '🎨', label: 'Design' },
  { type: 'operations',  icon: '🏗️',  label: 'Operations' },
  { type: 'personal',    icon: '👤', label: 'Personal' },
  { type: 'custom',      icon: '✦',  label: 'Other' },
]

interface OnboardingWizardProps {
  onComplete: () => void
}

function validateExport(data: unknown): data is BrainExportData {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return (
    'meta' in d &&
    Array.isArray(d.nodes) &&
    Array.isArray(d.links)
  )
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const projects        = useProjectStore(s => s.projects)
  const updateProject   = useProjectStore(s => s.updateProject)
  const setActiveProject = useProjectStore(s => s.setActiveProject)

  const setProjectFilter  = useBrainStore(s => s.setProjectFilter)
  const clearProjectData  = useBrainStore(s => s.clearProjectData)
  const importBrain       = useBrainStore(s => s.importBrain)

  const projectId = projects[0]?.id ?? ''

  const syncUser        = useSyncStore(s => s.user)
  const connectGoogle   = useSyncStore(s => s.connectGoogle)
  const syncNow         = useSyncStore(s => s.syncNow)

  const [step,          setStep]          = useState<1 | 2 | 3 | 4>(1)
  const [projectName,   setProjectName]   = useState('')
  const [selectedType,  setSelectedType]  = useState<ProjectType>('software')
  const [startChoice,   setStartChoice]   = useState<'import' | 'scratch' | null>(null)
  const [jsonText,      setJsonText]      = useState('')
  const [importError,   setImportError]   = useState('')
  const [importing,     setImporting]     = useState(false)
  const [showPrompt,    setShowPrompt]    = useState(false)
  const [promptCopied,  setPromptCopied]  = useState(false)
  const [driveConnecting, setDriveConnecting] = useState(false)
  const [driveError,    setDriveError]    = useState('')
  const [driveSynced,   setDriveSynced]   = useState(false)

  const fileInputRef   = useRef<HTMLInputElement>(null)

  function handleCopyPrompt() {
    void navigator.clipboard.writeText(GENERATE_CONTEXT_PROMPT).then(() => {
      setPromptCopied(true)
      window.setTimeout(() => setPromptCopied(false), 2000)
    })
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  // Saves project settings + clears placeholder data, then shows Drive step
  async function finishStep3(importData?: BrainExportData) {
    await updateProject(projectId, { name: projectName.trim() || 'My Project', type: selectedType })
    setActiveProject(projectId)
    setProjectFilter(projectId)
    await clearProjectData('default')
    if (importData) {
      await importBrain(importData, 'merge')
    }
    // If user is already logged in with Google (from login screen), skip to Drive sync
    // Otherwise go to Drive step so they can connect
    setStep(4)
  }

  // Final exit — called from step 4 (either after sync or skip)
  function finishOnboarding() {
    onComplete()
  }

  async function handleConnectAndSync() {
    setDriveConnecting(true)
    setDriveError('')
    try {
      // If not yet connected, authenticate first
      if (!syncUser) {
        await connectGoogle()
      }
      // Sync current project
      await syncNow(projectId)
      setDriveSynced(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed'
      setDriveError(msg)
    } finally {
      setDriveConnecting(false)
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setJsonText(reader.result as string)
      setImportError('')
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleImportAndStart() {
    setImportError('')
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonText.trim())
    } catch {
      setImportError('Invalid JSON — could not parse the text. Check for syntax errors.')
      return
    }
    if (!validateExport(parsed)) {
      setImportError('JSON does not match the BrainExportData schema. Expected keys: meta, nodes, links.')
      return
    }
    setImporting(true)
    try {
      await finishStep3(parsed as BrainExportData)
    } finally {
      setImporting(false)
    }
  }

  // ── Step dots ──────────────────────────────────────────────────────────────
  function Dots() {
    return (
      <div className={styles.stepBar}>
        {([1, 2, 3, 4] as const).map((n, i) => (
          <>
            {i > 0 && <div key={`line-${n}`} className={styles.stepLine} />}
            <div
              key={`dot-${n}`}
              className={[
                styles.stepDot,
                step === n ? styles.active : step > n ? styles.done : '',
              ].join(' ')}
            />
          </>
        ))}
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <Dots />
        <div className={styles.body}>

          {/* ── STEP 1 — Welcome + Project Name ── */}
          {step === 1 && (
            <div className={styles.step}>
              <div className={styles.eyebrow}>INICIALIZANDO</div>
              <h1 className={styles.title}>Bem-vindo ao J.A.R.V.I.S.</h1>
              <p className={styles.subtitle}>
                Seu hub de inteligência de projetos com IA. Vamos configurar seu primeiro projeto.
              </p>
              <div className={styles.label}>Como se chama seu projeto?</div>
              <input
                className={styles.input}
                type="text"
                placeholder="ex: Meu MVP"
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && projectName.trim()) setStep(2) }}
                autoFocus
                maxLength={64}
              />
              <div className={styles.actions}>
                <span />
                <button
                  className={styles.continueBtn}
                  disabled={!projectName.trim()}
                  onClick={() => setStep(2)}
                >
                  Continuar →
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2 — Project Type ── */}
          {step === 2 && (
            <div className={styles.step}>
              <div className={styles.eyebrow}>PASSO 2 DE 4</div>
              <h2 className={styles.title}>Que tipo de projeto?</h2>
              <p className={styles.subtitle}>
                Isso ajuda o J.A.R.V.I.S. a adaptar terminologia e estrutura do grafo ao seu domínio.
              </p>
              <div className={styles.typeGrid}>
                {TYPE_OPTIONS.map(opt => (
                  <button
                    key={opt.type}
                    className={[styles.typeCard, selectedType === opt.type ? styles.selected : ''].join(' ')}
                    onClick={() => setSelectedType(opt.type)}
                  >
                    <span className={styles.typeIcon}>{opt.icon}</span>
                    <span className={styles.typeLabel}>{opt.label}</span>
                  </button>
                ))}
              </div>
              <div className={styles.actions}>
                <button className={styles.backBtn} onClick={() => setStep(1)}>← Voltar</button>
                <button className={styles.continueBtn} onClick={() => setStep(3)}>
                  Continuar →
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3 — Import or Scratch ── */}
          {step === 3 && (
            <div className={styles.step}>
              <div className={styles.eyebrow}>PASSO 3 DE 4</div>
              <h2 className={styles.title}>Como quer começar?</h2>
              <p className={styles.subtitle}>
                Importe um JSON de contexto gerado por IA ou comece com um projeto em branco.
              </p>

              <div className={styles.startOptions}>
                <button
                  className={[styles.startCard, startChoice === 'import' ? styles.selected : ''].join(' ')}
                  onClick={() => { setStartChoice('import'); setImportError('') }}
                >
                  <span className={styles.startCardIcon}>📋</span>
                  <div className={styles.startCardText}>
                    <strong>Importar Contexto do Projeto</strong>
                    <span>Cole ou envie um JSON gerado pelo Prompt de Contexto</span>
                  </div>
                </button>

                <button
                  className={[styles.startCard, startChoice === 'scratch' ? styles.selected : ''].join(' ')}
                  onClick={() => { setStartChoice('scratch'); setImportError('') }}
                >
                  <span className={styles.startCardIcon}>🚀</span>
                  <div className={styles.startCardText}>
                    <strong>Começar do Zero</strong>
                    <span>Comece com um projeto em branco e construa o grafo manualmente</span>
                  </div>
                </button>
              </div>

              {/* ── Context Prompt hint (always visible in step 3) ── */}
              <div className={styles.promptHint}>
                <span className={styles.promptHintText}>
                  Não tem um JSON ainda? Copie o prompt abaixo e cole em qualquer IA (Claude, GPT, Gemini…) junto com o contexto do seu projeto.
                </span>
                <button
                  className={styles.promptToggleBtn}
                  onClick={() => setShowPrompt(v => !v)}
                >
                  {showPrompt ? 'Ocultar prompt ↑' : 'Obter Prompt de Contexto ↓'}
                </button>
              </div>

              {/* Inline prompt viewer */}
              {showPrompt && (
                <div className={styles.promptBox}>
                  <div className={styles.promptBoxHeader}>
                    <span className={styles.promptBoxTitle}>Prompt Universal de Contexto</span>
                    <button className={styles.copyPromptBtn} onClick={handleCopyPrompt}>
                      {promptCopied ? '✓ Copiado!' : 'Copiar prompt'}
                    </button>
                  </div>
                  <pre className={styles.promptPre}>{GENERATE_CONTEXT_PROMPT}</pre>
                </div>
              )}

              {/* Inline import sub-panel */}
              {startChoice === 'import' && (
                <div className={styles.importArea}>
                  <textarea
                    className={styles.textarea}
                    placeholder='Cole seu JSON aqui… (começa com "{")'
                    value={jsonText}
                    onChange={e => { setJsonText(e.target.value); setImportError('') }}
                  />
                  <div className={styles.importOr}>— ou envie um arquivo —</div>
                  <label className={styles.fileLabel}>
                    📂 Escolher arquivo .json
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json,application/json"
                      className={styles.hiddenFileInput}
                      onChange={handleFileUpload}
                    />
                  </label>
                  {importError && <div className={styles.importError}>{importError}</div>}
                </div>
              )}

              <div className={styles.actions}>
                <button className={styles.backBtn} onClick={() => setStep(2)}>← Voltar</button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {startChoice === 'import' && (
                    <button className={styles.skipLink} onClick={() => void finishStep3()}>
                      Pular por agora
                    </button>
                  )}
                  {startChoice === 'scratch' && (
                    <button
                      className={styles.continueBtn}
                      onClick={() => void finishStep3()}
                    >
                      Continuar →
                    </button>
                  )}
                  {startChoice === 'import' && (
                    <button
                      className={styles.continueBtn}
                      disabled={!jsonText.trim() || importing}
                      onClick={() => void handleImportAndStart()}
                    >
                      {importing ? 'Importando…' : 'Importar e Continuar →'}
                    </button>
                  )}
                  {!startChoice && (
                    <button className={styles.continueBtn} disabled>
                      Continuar →
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 4 — Connect Google Drive ── */}
          {step === 4 && (
            <div className={styles.step}>
              <div className={styles.eyebrow}>PASSO 4 DE 4</div>
              <h2 className={styles.title}>Conectar Google Drive</h2>
              <p className={styles.subtitle}>
                Sincronize seu projeto com seu próprio Google Drive para backup automático e acesso multi-dispositivo.
              </p>

              {driveSynced ? (
                /* ── Success state ── */
                <div className={styles.driveSuccess}>
                  <div className={styles.driveSuccessIcon}>✓</div>
                  <div className={styles.driveSuccessText}>
                    <strong>Drive conectado e sincronizado!</strong>
                    <span>Seu projeto está salvo no Google Drive.</span>
                  </div>
                </div>
              ) : (
                /* ── Connect card ── */
                <div className={styles.driveCard}>
                  {syncUser ? (
                    /* Already authenticated — show user + sync button */
                    <div className={styles.driveUser}>
                      {syncUser.avatar
                        ? <img src={syncUser.avatar} alt={syncUser.name} className={styles.driveAvatar} />
                        : <div className={styles.driveAvatarPlaceholder}>{syncUser.name.charAt(0)}</div>
                      }
                      <div className={styles.driveUserInfo}>
                        <div className={styles.driveUserName}>{syncUser.name}</div>
                        <div className={styles.driveUserEmail}>{syncUser.email}</div>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.driveDescription}>
                      <div className={styles.driveFeatureList}>
                        <div className={styles.driveFeature}>☁ Backups automáticos diários</div>
                        <div className={styles.driveFeature}>🔄 Acesse de qualquer dispositivo</div>
                        <div className={styles.driveFeature}>🔒 Armazenado no <strong>seu</strong> Google Drive</div>
                        <div className={styles.driveFeature}>🎯 Acessa apenas arquivos criados pelo JARVIS</div>
                      </div>
                    </div>
                  )}

                  {driveError && (
                    <div className={styles.driveError}>{driveError}</div>
                  )}

                  <button
                    className={styles.driveConnectBtn}
                    onClick={() => void handleConnectAndSync()}
                    disabled={driveConnecting}
                  >
                    {driveConnecting ? (
                      <><span className={styles.driveSpinner} /> Conectando…</>
                    ) : syncUser ? (
                      '↑ Sincronizar projeto no Drive'
                    ) : (
                      <><GoogleDriveIcon /> Conectar Google Drive</>
                    )}
                  </button>
                </div>
              )}

              <div className={styles.actions}>
                <span />
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {!driveSynced && (
                    <button className={styles.skipLink} onClick={finishOnboarding}>
                      Pular por agora
                    </button>
                  )}
                  <button
                    className={styles.continueBtn}
                    onClick={finishOnboarding}
                  >
                    {driveSynced ? 'Abrir JARVIS →' : 'Finalizar →'}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

function GoogleDriveIcon() {
  return (
    <svg viewBox="0 0 87.3 78" className={styles.driveIcon} aria-hidden>
      <path fill="#0066da" d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L28.7 52.6H0c0 1.55.4 3.1 1.2 4.5z"/>
      <path fill="#00ac47" d="M43.65 25L29.7 0c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.1A9.06 9.06 0 000 52.6h28.7z"/>
      <path fill="#ea4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57.1c.8-1.4 1.2-2.95 1.2-4.5H58.6l6.05 11.5z"/>
      <path fill="#00832d" d="M43.65 25L57.6 0H29.7z"/>
      <path fill="#2684fc" d="M58.6 52.6h28.7L73.55 29.3 57.6 0H29.7l28.9 52.6z"/>
      <path fill="#ffba00" d="M28.7 52.6l-15 24.2a9.06 9.06 0 003.3 3.3l35-77.1H29.7L28.7 52.6z"/>
    </svg>
  )
}
