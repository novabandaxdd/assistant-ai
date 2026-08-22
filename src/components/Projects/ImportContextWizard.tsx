import { useRef, useState } from 'react'
import { useBrainStore } from '../../store/brainStore'
import type { BrainExportData, NodeCategory } from '../../types'
import styles from './ImportContextWizard.module.css'

interface ImportContextWizardProps {
  open: boolean
  onClose: () => void
}

type WizardStep = 'paste' | 'preview' | 'done'

interface PreviewData {
  data: BrainExportData
  projectName: string
  nodeCount: number
  linkCount: number
  categoryCounts: Partial<Record<NodeCategory, number>>
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

function buildPreview(data: BrainExportData): PreviewData {
  const projectNode = data.nodes.find(n => n.category === 'Project')
  const projectName = projectNode?.label ?? 'Unnamed Project'
  const categoryCounts: Partial<Record<NodeCategory, number>> = {}
  for (const node of data.nodes) {
    categoryCounts[node.category] = (categoryCounts[node.category] ?? 0) + 1
  }
  return {
    data,
    projectName,
    nodeCount: data.nodes.length,
    linkCount: data.links.length,
    categoryCounts,
  }
}

export default function ImportContextWizard({ open, onClose }: ImportContextWizardProps) {
  const importBrain = useBrainStore(s => s.importBrain)

  const [step,       setStep]       = useState<WizardStep>('paste')
  const [jsonText,   setJsonText]   = useState('')
  const [error,      setError]      = useState('')
  const [preview,    setPreview]    = useState<PreviewData | null>(null)
  const [importing,  setImporting]  = useState(false)
  const [importedDesc, setImportedDesc] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleClose() {
    // reset on close
    setStep('paste')
    setJsonText('')
    setError('')
    setPreview(null)
    setImporting(false)
    onClose()
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setJsonText(reader.result as string)
      setError('')
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function handleAnalyze() {
    setError('')
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonText.trim())
    } catch {
      setError('Invalid JSON — could not parse the text. Check for syntax errors and try again.')
      return
    }
    if (!validateExport(parsed)) {
      setError('JSON does not match the BrainExportData schema. Expected keys: meta, nodes, links.')
      return
    }
    setPreview(buildPreview(parsed as BrainExportData))
    setStep('preview')
  }

  async function handleImport() {
    if (!preview) return
    setImporting(true)
    try {
      await importBrain(preview.data, 'merge')
      setImportedDesc(
        `${preview.nodeCount} nodes and ${preview.linkCount} links added to ${preview.projectName}.`
      )
      setStep('done')
    } finally {
      setImporting(false)
    }
  }

  if (!open) return null

  return (
    <div
      className={styles.overlay}
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div className={styles.modal}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <div className={styles.headerText}>
            <div className={styles.eyebrow}>IMPORTAR</div>
            <h2 className={styles.title}>Importar Contexto do Projeto</h2>
          </div>
          <button className={styles.closeBtn} onClick={handleClose} aria-label="Fechar">×</button>
        </div>

        <div className={styles.body}>

          {/* ── Step 1: Paste / Upload ── */}
          {step === 'paste' && (
            <div className={styles.step}>
              <div className={styles.label}>Cole seu JSON</div>
              <textarea
                className={styles.textarea}
                placeholder={'Cole aqui o JSON gerado pelo Prompt de Contexto…\n(começa com "{")'}
                value={jsonText}
                onChange={e => { setJsonText(e.target.value); setError('') }}
              />
              <div className={styles.orDivider}>ou envie um arquivo</div>
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
              {error && <div className={styles.error}>{error}</div>}
            </div>
          )}

          {/* ── Step 2: Preview ── */}
          {step === 'preview' && preview && (
            <div className={styles.step}>
              <div className={styles.previewBox}>
                <div className={styles.previewTitle}>
                  Projeto detectado: {preview.projectName}
                </div>
                <div className={styles.previewRow}>
                  <span className={styles.previewRowLabel}>Nós para importar</span>
                  <span className={styles.previewValue}>{preview.nodeCount}</span>
                </div>
                <div className={styles.previewRow}>
                  <span className={styles.previewRowLabel}>Links para importar</span>
                  <span className={styles.previewValue}>{preview.linkCount}</span>
                </div>
                <div className={styles.previewRow}>
                  <span className={styles.previewRowLabel}>Categorias encontradas</span>
                  <span className={styles.previewValue}>
                    <div className={styles.categoryList}>
                      {(Object.entries(preview.categoryCounts) as [NodeCategory, number][])
                        .sort((a, b) => b[1] - a[1])
                        .map(([cat, count]) => `${cat} (${count})`)
                        .join(', ')}
                    </div>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Done ── */}
          {step === 'done' && (
            <div className={styles.step}>
              <div className={styles.successBox}>
                <div className={styles.successIcon}>✓</div>
                <h3 className={styles.successTitle}>Projeto importado com sucesso!</h3>
                <p className={styles.successDesc}>{importedDesc}</p>
              </div>
            </div>
          )}

        </div>

        {/* ── Footer ── */}
        <div className={styles.footer}>
          {step === 'paste' && (
            <>
              <button className={styles.cancelBtn} onClick={handleClose}>Cancelar</button>
              <button
                className={styles.actionBtn}
                disabled={!jsonText.trim()}
                onClick={handleAnalyze}
              >
                Analisar →
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button className={styles.cancelBtn} onClick={() => setStep('paste')}>← Voltar</button>
              <button
                className={styles.cancelBtn}
                onClick={handleClose}
              >
                Cancelar
              </button>
              <button
                className={styles.actionBtn}
                disabled={importing}
                onClick={() => void handleImport()}
              >
                {importing ? 'Importando…' : '✓ Importar Projeto'}
              </button>
            </>
          )}
          {step === 'done' && (
            <button className={styles.actionBtn} onClick={handleClose}>
              Fechar
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
