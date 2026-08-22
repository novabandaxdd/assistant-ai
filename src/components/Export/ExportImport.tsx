import { useEffect, useMemo, useRef, useState } from 'react'
import { useBrainStore } from '../../store/brainStore'
import type { BrainExportData } from '../../types'
import styles from './ExportImport.module.css'

interface ExportImportProps {
  open: boolean
  onClose: () => void
}

export default function ExportImport({ open, onClose }: ExportImportProps) {
  const exportBrain = useBrainStore(state => state.exportBrain)
  const importBrain = useBrainStore(state => state.importBrain)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [lastImportedMeta, setLastImportedMeta] = useState<BrainExportData['meta'] | null>(null)

  const exportData = useMemo(() => exportBrain(), [exportBrain])

  useEffect(() => {
    if (!open) {
      setMode('merge')
      setImportError(null)
      setImporting(false)
      setLastImportedMeta(null)
    }
  }, [open])

  if (!open) return null

  const handleDownload = () => {
    const payload = JSON.stringify(exportData, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const date = new Date(exportData.meta.exportedAt).toISOString().slice(0, 10)
    link.href = url
    link.download = `jarvis-brain-export-${date}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handlePickFile = () => {
    fileInputRef.current?.click()
  }

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setImportError(null)
    setImporting(true)

    try {
      const raw = await file.text()
      const parsed = JSON.parse(raw) as Partial<BrainExportData>

      if (!parsed.meta || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.links) || !Array.isArray(parsed.sessions)) {
        throw new Error('Arquivo inválido. Estrutura de exportação não reconhecida.')
      }

      const payload: BrainExportData = {
        meta: parsed.meta,
        nodes: parsed.nodes,
        links: parsed.links,
        sessions: parsed.sessions,
        kanbanColumns: Array.isArray(parsed.kanbanColumns) ? parsed.kanbanColumns : [],
      }

      await importBrain(payload, mode)
      setLastImportedMeta(payload.meta)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Falha ao importar arquivo.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div>
            <div className={styles.eyebrow}>PORTABILIDADE</div>
            <h2 className={styles.title}>Exportar / importar JARVIS Brain</h2>
            <p className={styles.subtitle}>
              Leve seu grafo, links, sessões de chat e colunas do kanban para outra máquina sem perder contexto.
            </p>
          </div>
          <button className={styles.closeButton} onClick={onClose} aria-label="Fechar modal de exportação e importação">
            ×
          </button>
        </div>

        <div className={styles.body}>
          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <h3>Exportar snapshot completo</h3>
              <span className={styles.badge}>JSON legível</span>
            </div>
            <div className={styles.metaGrid}>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Versão</span>
                <strong>{exportData.meta.version}</strong>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Nós</span>
                <strong>{exportData.meta.nodeCount}</strong>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Links</span>
                <strong>{exportData.meta.linkCount}</strong>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Sessões</span>
                <strong>{exportData.meta.sessionCount}</strong>
              </div>
            </div>
            <p className={styles.supportingText}>
              O arquivo inclui cabeçalho com metadata, todos os nós, links, sessões persistidas e configuração do kanban.
            </p>
            <button className={styles.primaryButton} onClick={handleDownload}>
              Baixar exportação completa
            </button>
          </section>

          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <h3>Importar contexto existente</h3>
              <span className={styles.badge}>Merge ou replace</span>
            </div>

            <div className={styles.modeToggle}>
              <button
                className={`${styles.modeButton} ${mode === 'merge' ? styles.modeButtonActive : ''}`}
                onClick={() => setMode('merge')}
              >
                Mesclar
              </button>
              <button
                className={`${styles.modeButton} ${mode === 'replace' ? styles.modeButtonActive : ''}`}
                onClick={() => setMode('replace')}
              >
                Substituir tudo
              </button>
            </div>

            <p className={styles.supportingText}>
              {mode === 'merge'
                ? 'Mesclar preserva o cérebro atual e adiciona/atualiza itens pelo mesmo id.'
                : 'Substituir apaga o cérebro atual e grava exatamente o conteúdo do arquivo importado.'}
            </p>

            <input
              ref={fileInputRef}
              className={styles.hiddenInput}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
            />

            <button className={styles.secondaryButton} onClick={handlePickFile} disabled={importing}>
              {importing ? 'Importando…' : 'Selecionar arquivo JSON'}
            </button>

            {importError && <div className={styles.errorBox}>{importError}</div>}

            {lastImportedMeta && !importError && (
              <div className={styles.successBox}>
                Importação concluída. Snapshot de {lastImportedMeta.nodeCount} nós, {lastImportedMeta.linkCount} links e {lastImportedMeta.sessionCount} sessões.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
