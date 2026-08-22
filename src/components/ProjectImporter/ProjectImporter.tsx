/**
 * ── ProjectImporter ───────────────────────────────────────────────────────────
 * Full-screen modal that lets the user:
 *   1. Drop a project folder (or browse) from any stack
 *   2. Optionally paste context documents (meeting notes, dailys, sprint reviews)
 *   3. Preview the parsed result before committing to the graph
 *   4. Merge the generated nodes + links into the brain store
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { useBrainStore } from '../../store/brainStore'
import { readDroppedFiles, readInputFiles, parseProject } from '../../utils/projectParser'
import { buildProjectGraph } from '../../utils/projectGraphBuilder'
import type { ParsedProject, ContextDocument } from '../../types'
import styles from './ProjectImporter.module.css'

interface ProjectImporterProps {
  open: boolean
  onClose: () => void
}

type Step = 'drop' | 'parsing' | 'context' | 'preview' | 'importing' | 'done'

const CONTEXT_TYPES: Array<{ value: ContextDocument['type']; label: string }> = [
  { value: 'meeting',       label: 'Reunião / Call' },
  { value: 'daily',         label: 'Daily Standup' },
  { value: 'sprint_review', label: 'Sprint Review' },
  { value: 'retrospective', label: 'Retrospectiva' },
  { value: 'documentation', label: 'Documentação' },
  { value: 'adr',           label: 'ADR (Decision Record)' },
  { value: 'note',          label: 'Nota livre' },
]

// ─────────────────────────────────────────────────────────────────────────────

export default function ProjectImporter({ open, onClose }: ProjectImporterProps) {
  const [step,        setStep]        = useState<Step>('drop')
  const [fileCount,   setFileCount]   = useState(0)
  const [parsed,      setParsed]      = useState<ParsedProject | null>(null)
  const [dragOver,    setDragOver]    = useState(false)
  const [progress,    setProgress]    = useState(0)
  const [error,       setError]       = useState<string | null>(null)
  const [projectName, setProjectName] = useState('')

  // Context documents
  const [contextDocs, setContextDocs] = useState<ContextDocument[]>([])
  const [addingDoc,   setAddingDoc]   = useState(false)
  const [docTitle,    setDocTitle]    = useState('')
  const [docType,     setDocType]     = useState<ContextDocument['type']>('meeting')
  const [docDate,     setDocDate]     = useState('')
  const [docContent,  setDocContent]  = useState('')
  const [docPeople,   setDocPeople]   = useState('')

  const fileInputRef   = useRef<HTMLInputElement>(null)
  const addNode        = useBrainStore(s => s.addNode)
  const addLink        = useBrainStore(s => s.addLink)
  const selectNode     = useBrainStore(s => s.selectNode)
  const addMessage     = useBrainStore(s => s.addMessage)
  const setChatOpen    = useBrainStore(s => s.setChatOpen)

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep('drop'); setParsed(null); setFileCount(0)
        setError(null); setContextDocs([]); setProjectName('')
        setProgress(0)
      }, 300)
    }
  }, [open])

  // ── File processing ──────────────────────────────────────────────────────────
  const processFiles = useCallback(async (
    getFiles: () => Promise<import('../../types').ParsedFile[]>
  ) => {
    setError(null)
    setStep('parsing')
    setProgress(0)

    try {
      const files = await getFiles()
      if (files.length === 0) {
        setError('Nenhum arquivo de código encontrado. Certifique-se de soltar uma pasta de projeto.')
        setStep('drop')
        return
      }
      setFileCount(files.length)
      setProgress(60)

      const result = parseProject(files)
      setProjectName(result.name)
      setParsed(result)
      setProgress(100)
      setTimeout(() => setStep('context'), 400)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao processar os arquivos.')
      setStep('drop')
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    processFiles(() => readDroppedFiles(e.dataTransfer, count => setFileCount(count)))
  }, [processFiles])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return
    const fileList = e.target.files
    processFiles(() => readInputFiles(fileList, count => setFileCount(count)))
    e.target.value = ''
  }, [processFiles])

  // ── Context document management ──────────────────────────────────────────────
  const handleAddDoc = () => {
    if (!docTitle.trim() || !docContent.trim()) return
    const doc: ContextDocument = {
      id:           `doc-${Date.now()}`,
      type:         docType,
      title:        docTitle.trim(),
      content:      docContent.trim(),
      date:         docDate || undefined,
      participants: docPeople.split(',').map(p => p.trim()).filter(Boolean),
    }
    setContextDocs(prev => [...prev, doc])
    setDocTitle(''); setDocContent(''); setDocDate(''); setDocPeople('')
    setAddingDoc(false)
  }

  const removeDoc = (id: string) => setContextDocs(prev => prev.filter(d => d.id !== id))

  // ── Import into graph ────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!parsed) return
    setStep('importing')

    const finalProject = projectName.trim() ? { ...parsed, name: projectName.trim() } : parsed
    // Context docs are now passed directly to the builder — it handles linking + cross-refs
    const { nodes, links, projectNodeId: projBuilderId } = buildProjectGraph(finalProject, contextDocs)

    let imported = 0
    const total  = nodes.length + links.length

    // ── Step 1: Save nodes, build a map from builder-id → real store-id
    const idMap = new Map<string, string>()
    for (const node of nodes) {
      const created = await addNode({
        label:    node.label,
        category: node.category,
        content:  node.content,
        tags:     node.tags,
      } as Parameters<typeof addNode>[0])
      idMap.set(node.id, created.id)
      imported++
      setProgress(Math.round((imported / total) * 75))
    }

    // ── Step 2: Save links using resolved ids
    for (const lk of links) {
      const srcBuilderId = typeof lk.source === 'string' ? lk.source : lk.source.id
      const tgtBuilderId = typeof lk.target === 'string' ? lk.target : lk.target.id
      const srcId = idMap.get(srcBuilderId)
      const tgtId = idMap.get(tgtBuilderId)
      if (srcId && tgtId) {
        await addLink(srcId, tgtId, lk.label)
      }
      imported++
      setProgress(Math.round((imported / total) * 100))
    }

    // Select the project hub and open chat
    const projNodeId = idMap.get(projBuilderId)
    const hub = projNodeId ? useBrainStore.getState().nodes.find(n => n.id === projNodeId) : null
    if (hub) selectNode(hub.id)

    const totalNodes = nodes.length
    const featureCount = finalProject.features.length
    const moduleCount = finalProject.modules.length
    const endpointCount = finalProject.endpoints.length
    const contextCount = contextDocs.length

    addMessage({
      role: 'jarvis',
      text: `Projeto "${finalProject.name}" importado com sucesso, Senhor.\n\n` +
        `📦 Stack: ${finalProject.stack.details} (${finalProject.stack.confidence}% confiança)\n` +
        `🧩 ${moduleCount} módulos · ✨ ${featureCount} funcionalidades · 🔀 ${endpointCount} endpoints\n` +
        `${contextCount > 0 ? `📄 ${contextCount} documento${contextCount > 1 ? 's' : ''} de contexto mesclados\n` : ''}` +
        `🕸️ ${totalNodes} nós gerados no grafo. O contexto está atualizado.`,
    })
    setChatOpen(true)
    setStep('done')
  }

  if (!open) return null

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.title}>
              <span className={styles.titleIcon}>⬡</span>
              Importar Projeto
            </div>
            <div className={styles.subtitle}>
              {step === 'drop'     && 'Solte qualquer projeto — Java, Spring, React, Angular, Vue, Node, Python...'}
              {step === 'parsing'  && `Analisando ${fileCount > 0 ? fileCount + ' arquivos' : 'projeto'}...`}
              {step === 'context'  && `"${parsed?.name}" detectado — adicione documentos de contexto`}
              {step === 'preview'  && `Prévia do grafo — ${parsed?.modules.length} módulos, ${parsed?.features.length} funcionalidades`}
              {step === 'importing'&& 'Construindo o grafo...'}
              {step === 'done'     && 'Grafo gerado com sucesso!'}
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Step indicator */}
        <div className={styles.steps}>
          {(['drop','context','preview'] as Step[]).map((s, i) => (
            <div key={s} className={`${styles.step} ${
              step === s ? styles.stepActive :
              ['parsing','context','preview','importing','done'].indexOf(step) > ['drop','context','preview'].indexOf(s) ? styles.stepDone : ''
            }`}>
              <span className={styles.stepNum}>{i + 1}</span>
              <span className={styles.stepLabel}>
                {s === 'drop' ? 'Soltar Projeto' : s === 'context' ? 'Contexto' : 'Importar'}
              </span>
            </div>
          ))}
        </div>

        <div className={styles.body}>

          {/* ── STEP: drop ───────────────────────────────────────────────────── */}
          {(step === 'drop' || step === 'parsing') && (
            <div
              className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''} ${step === 'parsing' ? styles.dropZoneParsing : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => step === 'drop' && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                // @ts-ignore — webkitdirectory is valid HTML5
                webkitdirectory=""
                multiple
                style={{ display: 'none' }}
                onChange={handleFileInput}
              />

              {step === 'parsing' ? (
                <div className={styles.parsingState}>
                  <div className={styles.parsingRing} />
                  <div className={styles.parsingLabel}>Analisando arquivos...</div>
                  {fileCount > 0 && <div className={styles.parsingCount}>{fileCount} arquivos lidos</div>}
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${progress}%` }} />
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.dropIcon}>⬡</div>
                  <div className={styles.dropTitle}>Solte sua pasta de projeto aqui</div>
                  <div className={styles.dropSub}>ou clique para navegar</div>
                  <div className={styles.stackBadges}>
                    {['Java','Spring','React','Angular','Vue','Node.js','Python','.NET','Flutter'].map(s => (
                      <span key={s} className={styles.stackBadge}>{s}</span>
                    ))}
                  </div>
                  {error && <div className={styles.error}>{error}</div>}
                </>
              )}
            </div>
          )}

          {/* ── STEP: context ────────────────────────────────────────────────── */}
          {step === 'context' && parsed && (
            <div className={styles.contextStep}>
              {/* Project name override */}
              <div className={styles.contextSection}>
                <div className={styles.sectionTitle}>Nome do Projeto</div>
                <input
                  className={styles.nameInput}
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  placeholder={parsed.name}
                />
              </div>

              {/* Stack summary */}
              <div className={styles.contextSection}>
                <div className={styles.sectionTitle}>Stack Detectada</div>
                <div className={styles.stackSummary}>
                  <span className={styles.stackPrimary}>{parsed.stack.details}</span>
                  <span className={styles.stackConf}>{parsed.stack.confidence}% confiança</span>
                  <span className={styles.stackFiles}>{parsed.rawFileCount} arquivos analisados</span>
                </div>
                <div className={styles.stackStats}>
                  <span>{parsed.modules.length} módulos</span>
                  <span>{parsed.features.length} funcionalidades</span>
                  <span>{parsed.endpoints.length} endpoints</span>
                  <span>{Object.keys(parsed.dependencies).length} dependências</span>
                </div>
              </div>

              {/* Features preview */}
              {parsed.features.length > 0 && (
                <div className={styles.contextSection}>
                  <div className={styles.sectionTitle}>Funcionalidades Detectadas</div>
                  <div className={styles.featureList}>
                    {parsed.features.map(f => (
                      <div key={f.name} className={styles.featureChip}>
                        <span className={`${styles.featureDot} ${styles[`cat_${f.category}`]}`} />
                        {f.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Context docs */}
              <div className={styles.contextSection}>
                <div className={styles.sectionTitleRow}>
                  <div className={styles.sectionTitle}>Documentos de Contexto <span className={styles.optional}>(opcional)</span></div>
                  {!addingDoc && (
                    <button className={styles.addDocBtn} onClick={() => setAddingDoc(true)}>+ Adicionar</button>
                  )}
                </div>
                <div className={styles.sectionHint}>
                  Junte reuniões, dailys, sprint reviews e docs ao grafo do projeto.
                </div>

                {/* Existing docs */}
                {contextDocs.length > 0 && (
                  <div className={styles.docList}>
                    {contextDocs.map(d => (
                      <div key={d.id} className={styles.docItem}>
                        <span className={styles.docType}>{d.type}</span>
                        <span className={styles.docTitle}>{d.title}</span>
                        {d.date && <span className={styles.docDate}>{d.date}</span>}
                        <button className={styles.docRemove} onClick={() => removeDoc(d.id)}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add doc form */}
                {addingDoc && (
                  <div className={styles.addDocForm}>
                    <div className={styles.formRow}>
                      <select
                        className={styles.docTypeSelect}
                        value={docType}
                        onChange={e => setDocType(e.target.value as ContextDocument['type'])}
                      >
                        {CONTEXT_TYPES.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                      <input
                        className={styles.docInput}
                        placeholder="Título"
                        value={docTitle}
                        onChange={e => setDocTitle(e.target.value)}
                      />
                    </div>
                    <div className={styles.formRow}>
                      <input
                        className={styles.docInput}
                        type="date"
                        value={docDate}
                        onChange={e => setDocDate(e.target.value)}
                        style={{ flex: '0 0 140px' }}
                      />
                      <input
                        className={styles.docInput}
                        placeholder="Participantes (vírgula)"
                        value={docPeople}
                        onChange={e => setDocPeople(e.target.value)}
                      />
                    </div>
                    <textarea
                      className={styles.docTextarea}
                      placeholder="Conteúdo — resumo, decisões, ações..."
                      value={docContent}
                      onChange={e => setDocContent(e.target.value)}
                      rows={4}
                    />
                    <div className={styles.formActions}>
                      <button className={styles.saveDocBtn} onClick={handleAddDoc} disabled={!docTitle.trim() || !docContent.trim()}>
                        Salvar
                      </button>
                      <button className={styles.cancelDocBtn} onClick={() => { setAddingDoc(false); setDocTitle(''); setDocContent('') }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className={styles.ctaRow}>
                <button className={styles.previewBtn} onClick={() => setStep('preview')}>
                  Visualizar prévia →
                </button>
              </div>
            </div>
          )}

          {/* ── STEP: preview ────────────────────────────────────────────────── */}
          {step === 'preview' && parsed && (
            <div className={styles.previewStep}>
              <div className={styles.previewCols}>
                {/* Left col */}
                <div className={styles.previewCol}>
                  <div className={styles.previewSection}>
                    <div className={styles.sectionTitle}>📦 Módulos ({parsed.modules.length})</div>
                    <div className={styles.previewList}>
                      {parsed.modules.slice(0, 20).map(m => (
                        <div key={m.path} className={styles.previewItem}>
                          <span className={`${styles.previewTag} ${styles[`modType_${m.type}`]}`}>{m.type}</span>
                          <span className={styles.previewItemLabel}>{m.name}</span>
                        </div>
                      ))}
                      {parsed.modules.length > 20 && (
                        <div className={styles.moreItems}>+{parsed.modules.length - 20} mais</div>
                      )}
                    </div>
                  </div>

                  {parsed.endpoints.length > 0 && (
                    <div className={styles.previewSection}>
                      <div className={styles.sectionTitle}>🔀 Endpoints ({parsed.endpoints.length})</div>
                      <div className={styles.previewList}>
                        {parsed.endpoints.slice(0, 10).map((ep, i) => (
                          <div key={i} className={styles.previewItem}>
                            <span className={`${styles.previewTag} ${styles[`method_${ep.method}`]}`}>{ep.method}</span>
                            <span className={styles.previewItemLabel}>{ep.path}</span>
                          </div>
                        ))}
                        {parsed.endpoints.length > 10 && (
                          <div className={styles.moreItems}>+{parsed.endpoints.length - 10} mais</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right col */}
                <div className={styles.previewCol}>
                  <div className={styles.previewSection}>
                    <div className={styles.sectionTitle}>✨ Funcionalidades ({parsed.features.length})</div>
                    <div className={styles.previewList}>
                      {parsed.features.map(f => (
                        <div key={f.name} className={styles.previewItem}>
                          <span className={`${styles.previewTag} ${styles[`cat_${f.category}`]}`}>{f.category}</span>
                          <span className={styles.previewItemLabel}>{f.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {Object.keys(parsed.dependencies).length > 0 && (
                    <div className={styles.previewSection}>
                      <div className={styles.sectionTitle}>📚 Dependências</div>
                      <div className={styles.previewList}>
                        {Object.entries(parsed.dependencies).slice(0, 12).map(([name]) => (
                          <div key={name} className={styles.previewItem}>
                            <span className={styles.previewItemLabel}>{name}</span>
                          </div>
                        ))}
                        {Object.keys(parsed.dependencies).length > 12 && (
                          <div className={styles.moreItems}>+{Object.keys(parsed.dependencies).length - 12} mais</div>
                        )}
                      </div>
                    </div>
                  )}

                  {contextDocs.length > 0 && (
                    <div className={styles.previewSection}>
                      <div className={styles.sectionTitle}>📝 Contexto ({contextDocs.length})</div>
                      <div className={styles.previewList}>
                        {contextDocs.map(d => (
                          <div key={d.id} className={styles.previewItem}>
                            <span className={styles.previewTag}>{d.type}</span>
                            <span className={styles.previewItemLabel}>{d.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.ctaRow}>
                <button className={styles.backBtn} onClick={() => setStep('context')}>← Voltar</button>
                <button className={styles.importBtn} onClick={handleImport}>
                  ⬡ Gerar Grafo
                </button>
              </div>
            </div>
          )}

          {/* ── STEP: importing ──────────────────────────────────────────────── */}
          {step === 'importing' && (
            <div className={styles.importingState}>
              <div className={styles.parsingRing} />
              <div className={styles.parsingLabel}>Construindo o grafo...</div>
              <div className={styles.progressBar} style={{ width: 240 }}>
                <div className={styles.progressFill} style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* ── STEP: done ───────────────────────────────────────────────────── */}
          {step === 'done' && (
            <div className={styles.doneState}>
              <div className={styles.doneIcon}>⬡</div>
              <div className={styles.doneTitle}>Grafo Gerado!</div>
              <div className={styles.doneSub}>
                "{projectName || parsed?.name}" foi integrado à sua segunda memória.
              </div>
              <button className={styles.importBtn} onClick={onClose} style={{ marginTop: 24 }}>
                Fechar e explorar
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
