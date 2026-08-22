import { useEffect, useMemo, useState } from 'react'
import { useBrainStore } from '../../store/brainStore'
import styles from './ContextPromptModal.module.css'

interface ContextPromptModalProps {
  open: boolean
  onClose: () => void
}

function formatDate(timestamp?: number | null) {
  if (!timestamp) return 'N/A'
  return new Date(timestamp).toLocaleString('pt-BR')
}

export default function ContextPromptModal({ open, onClose }: ContextPromptModalProps) {
  const nodes = useBrainStore(state => state.nodes)
  const links = useBrainStore(state => state.links)
  const sessions = useBrainStore(state => state.sessions)
  const activeProjectFilterId = useBrainStore(state => state.activeProjectFilterId)
  const getProjectNodes = useBrainStore(state => state.getProjectNodes)
  const getProjectSubgraphNodeIds = useBrainStore(state => state.getProjectSubgraphNodeIds)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) {
      setCopied(false)
    }
  }, [open])

  const prompt = useMemo(() => {
    const projectNodes = getProjectNodes()
    const visibleNodeIds = activeProjectFilterId ? getProjectSubgraphNodeIds(activeProjectFilterId) : null
    const visibleNodes = visibleNodeIds ? nodes.filter(node => visibleNodeIds.has(node.id)) : nodes
    const visibleLinks = visibleNodeIds
      ? links.filter(link => visibleNodeIds.has(typeof link.source === 'string' ? link.source : link.source.id) && visibleNodeIds.has(typeof link.target === 'string' ? link.target : link.target.id))
      : links

    const grouped = new Map<string, typeof visibleNodes>()
    for (const node of visibleNodes) {
      const list = grouped.get(node.category) ?? []
      list.push(node)
      grouped.set(node.category, list)
    }

    const recentSessions = [...sessions]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 5)

    const activeProjects = projectNodes.map(project => {
      const relatedCount = links.filter(link => {
        const source = typeof link.source === 'string' ? link.source : link.source.id
        const target = typeof link.target === 'string' ? link.target : link.target.id
        return source === project.id || target === project.id
      }).length
      return `- ${project.label} — ${relatedCount} conexões — atualizado em ${formatDate(project.updatedAt)}`
    }).join('\n') || '- Nenhum projeto registrado'

    const features = visibleNodes.filter(node => node.category === 'Feature').map(node => `- ${node.label}${node.content ? ` — ${node.content}` : ''}`).join('\n') || '- Nenhuma feature registrada'
    const modules = visibleNodes.filter(node => node.category === 'Module').map(node => `- ${node.label}${node.content ? ` — ${node.content}` : ''}`).join('\n') || '- Nenhum módulo registrado'
    const activities = visibleNodes.filter(node => node.category === 'Activity').map(node => `- ${node.label}${node.content ? ` — ${node.content}` : ''}`).join('\n') || '- Nenhuma atividade registrada'

    const nodesSection = [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, categoryNodes]) => {
        const items = categoryNodes
          .sort((a, b) => a.label.localeCompare(b.label))
          .map(node => {
            const tagText = node.tags?.length ? ` | tags: ${node.tags.join(', ')}` : ''
            const contentText = node.content ? ` | content: ${node.content.replace(/\s+/g, ' ').trim()}` : ''
            return `- (${node.id}) ${node.label}${tagText}${contentText}`
          })
          .join('\n')
        return `### ${category}\n${items}`
      })
      .join('\n\n')

    const linksSection = visibleLinks
      .map(link => {
        const source = typeof link.source === 'string' ? link.source : link.source.id
        const target = typeof link.target === 'string' ? link.target : link.target.id
        return `- ${source} -> ${target}${link.label ? ` | ${link.label}` : ''}`
      })
      .join('\n') || '- Nenhum link registrado'

    const sessionsSection = recentSessions.map(session => {
      const transcript = session.messages
        .slice(-8)
        .map(message => `  - ${message.role === 'user' ? 'Usuário' : 'JARVIS'}: ${message.text.replace(/\s+/g, ' ').trim()}`)
        .join('\n')
      return `- Sessão: ${session.title} | atualizada em ${formatDate(session.updatedAt)}\n${transcript}`
    }).join('\n') || '- Nenhuma sessão de chat registrada'

    return [
      '# JARVIS Brain Bootstrap Context',
      '',
      'Você está assumindo o contexto de uma segunda memória chamada JARVIS Brain.',
      'Use este material para responder como um copiloto técnico com memória persistente sobre projetos, pessoas, decisões, atividades e histórico conversacional.',
      '',
      '## Operating Rules',
      '- Preserve project continuity and avoid perder contexto já estabelecido.',
      '- Quando citar fatos, use os nós e links abaixo como fonte principal.',
      '- Se houver ambiguidades, explicite a hipótese antes de responder.',
      '- Priorize ações práticas, contexto de projeto e continuidade técnica.',
      '',
      '## Snapshot Summary',
      `- Generated at: ${new Date().toISOString()}`,
      `- Total nodes: ${visibleNodes.length}`,
      `- Total links: ${visibleLinks.length}`,
      `- Total chat sessions: ${sessions.length}`,
      `- Active project filter: ${activeProjectFilterId ?? 'none'}`,
      '',
      '## Active Projects',
      activeProjects,
      '',
      '## Features',
      features,
      '',
      '## Modules',
      modules,
      '',
      '## Activities / Kanban-Relevant Work',
      activities,
      '',
      '## Knowledge Graph Nodes',
      nodesSection || '- Nenhum nó registrado',
      '',
      '## Knowledge Graph Links',
      linksSection,
      '',
      '## Recent Chat Session Memory',
      sessionsSection,
      '',
      '## User Preferences Inferred',
      '- Prefere respostas objetivas, técnicas e contextualizadas.',
      '- Trabalha com múltiplos projetos e precisa de continuidade entre sessões.',
      '- Usa JARVIS Brain como segunda memória para engenharia, reuniões, arquitetura e execução.',
      '',
      '## Expected Assistant Behavior',
      '- Agir como continuação direta do JARVIS Brain.',
      '- Entender que nós de Activity representam trabalho operacional e também podem refletir um kanban.',
      '- Fazer referência a projetos, módulos, features, pessoas e decisões quando relevante.',
      '- Responder no idioma do usuário, mantendo precisão técnica.',
    ].join('\n')
  }, [activeProjectFilterId, getProjectNodes, getProjectSubgraphNodeIds, links, nodes, sessions])

  if (!open) return null

  const handleCopy = async () => {
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className={styles.overlay} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div>
            <div className={styles.eyebrow}>BOOTSTRAP PROMPT</div>
            <h2 className={styles.title}>Generate Context Prompt</h2>
            <p className={styles.subtitle}>
              Gere um markdown pronto para colar no Claude, GPT, Roo Code ou qualquer outro agente para transferir o estado atual do JARVIS Brain.
            </p>
          </div>
          <button className={styles.closeButton} onClick={onClose} aria-label="Fechar modal de contexto">
            ×
          </button>
        </div>

        <div className={styles.actions}>
          <button className={styles.copyButton} onClick={handleCopy}>
            {copied ? 'Copiado' : 'Copiar markdown'}
          </button>
        </div>

        <div className={styles.content}>
          <pre className={styles.promptBlock}>{prompt}</pre>
        </div>
      </div>
    </div>
  )
}
