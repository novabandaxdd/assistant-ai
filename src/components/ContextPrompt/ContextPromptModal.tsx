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
      return `- ${project.label} — ${relatedCount} connections — updated ${formatDate(project.updatedAt)}`
    }).join('\n') || '- No projects registered'

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
      .join('\n') || '- No links registered'

    const sessionsSection = recentSessions.map(session => {
      const transcript = session.messages
        .slice(-8)
        .map(message => `  - ${message.role === 'user' ? 'User' : 'JARVIS'}: ${message.text.replace(/\s+/g, ' ').trim()}`)
        .join('\n')
      return `- Session: ${session.title} | updated ${formatDate(session.updatedAt)}\n${transcript}`
    }).join('\n') || '- No chat sessions recorded'

    return [
      '# JARVIS Brain — Universal Context Prompt v4',
      '',
      'You are being loaded as a persistent AI co-pilot for a knowledge graph called JARVIS Brain.',
      'The graph below represents a project\'s full context: entities, relationships, decisions, activities, people, and resources.',
      'Your role is to act as a second memory — always aware of what has been captured, able to reason across it, and never inventing facts.',
      '',
      '## Operating Rules',
      '- Never invent information. If something is unknown, say so explicitly or use null.',
      '- When citing facts, reference the node IDs or labels from the graph below as your primary source.',
      '- Confidence levels: "known" = explicitly stated, "inferred" = reasonably derived, "assumption" = uncertain, null = unknown.',
      '- If there is ambiguity, state your hypothesis before answering.',
      '- Respond in the user\'s language. Maintain technical and domain accuracy.',
      '- Prioritize practical actions, project continuity, and contextual awareness.',
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
      '## Knowledge Graph Nodes',
      nodesSection || '- No nodes registered',
      '',
      '## Knowledge Graph Links',
      linksSection,
      '',
      '## Recent Chat Session Memory',
      sessionsSection,
      '',
      '---',
      '',
      '# JARVIS Brain — JSON Graph Generation Instructions (Universal v4)',
      '',
      'When the user asks you to analyze their project context and generate importable data for JARVIS Brain,',
      'you must produce a single valid JSON object following the BrainExportData schema below.',
      '',
      '## CRITICAL RULES',
      '1. Respond with ONLY raw JSON — no markdown fences, no prose, no explanation before or after. Start with { end with }.',
      '2. Never invent information. Use null or "" for unknown fields.',
      '3. Every link "source" and "target" must be a plain string ID that exists in the "nodes" array.',
      '4. Every node ID and link ID must be globally unique — never reuse them.',
      '5. Adapt entity types to the user\'s project domain (see mapping table below).',
      '6. Keep labels short (max ~40 chars). Use "content" for rich context (max ~500 chars).',
      '',
      '## Root Structure',
      '{',
      '  "meta": {',
      '    "version": 1,',
      '    "exportedAt": "<ISO 8601 timestamp>",',
      '    "nodeCount": <total number of nodes>,',
      '    "linkCount": <total number of links>,',
      '    "sessionCount": 0',
      '  },',
      '  "nodes": [ ...BrainNode[] ],',
      '  "links": [ ...BrainLink[] ],',
      '  "sessions": [],',
      '  "kanbanColumns": [',
      '    { "id": "backlog",     "title": "Backlog",     "order": 0 },',
      '    { "id": "in_progress", "title": "In Progress", "order": 1 },',
      '    { "id": "in_review",   "title": "In Review",   "order": 2 },',
      '    { "id": "done",        "title": "Done",        "order": 3 }',
      '  ]',
      '}',
      '',
      '## BrainNode Schema',
      'Field      | Type     | Required | Notes',
      '-----------|----------|----------|------',
      'id         | string   | YES      | Unique slug (a-z, 0-9, hyphens only — no spaces). e.g. "proj-alpha"',
      'label      | string   | YES      | Display name in graph (max 40 chars)',
      'category   | string   | YES      | Exactly one of the 12 NodeCategory values below (CASE-SENSITIVE)',
      'content    | string   | YES      | Description/context (max ~500 chars). Use "" if nothing known.',
      'tags       | string[] | YES      | Free-form tags. Use [] if none. See special prefixes below.',
      'projectId  | string   | NO       | Set to the Project hub node ID (set on ALL nodes, including the hub itself).',
      'createdAt  | number   | YES      | Unix timestamp in ms (e.g. 1724328000000). Use current time if unknown.',
      'updatedAt  | number   | YES      | Unix timestamp in ms. Same as createdAt if no update known.',
      '',
      '### STATUS TAGS — set exactly one on every Activity node',
      '"status:backlog"      → Backlog column',
      '"status:in_progress"  → In Progress column',
      '"status:in_review"    → In Review column',
      '"status:done"         → Done column',
      '',
      '### PRIORITY TAGS — set exactly one on every Activity node',
      '"priority:high"       → High priority (red badge)',
      '"priority:medium"     → Medium priority (yellow badge, default)',
      '"priority:low"        → Low priority (gray badge)',
      '',
      'CRITICAL: Only "Activity" nodes appear in Kanban. Every Activity MUST have one status: tag and one priority: tag.',
      '',
      '## BrainLink Schema',
      'Field    | Type   | Required | Notes',
      '---------|--------|----------|------',
      'id       | string | YES      | Unique ID, pattern: "l-<source>-<target>". Never reuse.',
      'source   | string | YES      | Plain string ID of source node — MUST exist in nodes[]',
      'target   | string | YES      | Plain string ID of target node — MUST exist in nodes[]',
      'label    | string | YES      | Relationship label, e.g. "owns", "uses", "responsible for"',
      'strength | number | YES      | 0.0–1.0 (0.9=ownership, 0.7=collaboration, 0.4=loose)',
      'CRITICAL: source and target MUST be plain string IDs — NEVER nested objects like {"id": "..."}.',
      '',
      '## NodeCategory Values (12 total — CASE-SENSITIVE)',
      'Category     | Typical Use',
      '-------------|----------------------------------------------------------',
      '"Project"    | Central hub — create 1 per project, link everything to it',
      '"Meeting"    | Meetings, kickoffs, standups, reviews, retrospectives',
      '"Onboarding" | Setup processes, conventions, environment config',
      '"Tech"       | Technologies, tools, frameworks, platforms, languages',
      '"Activity"   | Tasks, work items — shown in Kanban automatically',
      '"Person"     | Team members, stakeholders, roles, contacts',
      '"Decision"   | Technical or business decisions made',
      '"Note"       | Free notes, risks, hypotheses, open questions, findings',
      '"Resource"   | Links, documents, repos, runbooks, specs, papers, assets',
      '"Module"     | Code modules, services, packages, subsystems',
      '"Feature"    | Product features, capabilities, user stories, epics',
      '"Endpoint"   | API routes, webhooks, RPC calls, e.g. "GET /users"',
      '',
      '## Domain Mapping',
      'Project Type   | Concept → Category',
      '---------------|----------------------------------------------------------------------',
      'Software Dev   | modules→Module, API routes→Endpoint, libraries→Tech, tasks→Activity',
      'QA / Testing   | test cases→Activity, environments→Tech, requirements→Resource, defects→Note',
      'Product        | user stories→Feature, epics→Feature, OKRs→Note, milestones→Activity',
      'Marketing      | campaigns→Feature, channels→Tech, assets→Resource, KPIs→Note',
      'Research       | findings→Note, hypotheses→Note, papers→Resource, tools→Tech',
      'Engineering    | components→Module, specs→Resource, milestones→Activity, systems→Tech',
      'Design         | design systems→Module, components→Feature, tools→Tech, deliverables→Resource',
      'Operations     | runbooks→Resource, infrastructure→Tech, incidents→Activity, SLAs→Note',
      'Personal       | goals→Note, habits→Activity, contacts→Person, tools→Tech',
      '',
      '## Graph Design Rules',
      '1. Create exactly ONE "Project" hub node. Set projectId on ALL nodes (including hub itself) to its id.',
      '2. Link ALL major nodes directly or transitively to the "Project" hub.',
      '3. Link "Decision" nodes to the "Meeting" or "Activity" where they were made.',
      '4. Link "Person" nodes to the "Activity" or "Feature" they own.',
      '5. Set explicit status: and priority: tags on EVERY Activity node.',
      '6. Aim for a fully connected graph — isolated nodes have little value.',
      '',
      '## Pre-Delivery Self-Check',
      '[ ] Response starts with { and ends with } — no fences, no prose.',
      '[ ] meta.nodeCount equals actual nodes array length.',
      '[ ] meta.linkCount equals actual links array length.',
      '[ ] Every node id is unique — no duplicates.',
      '[ ] Every link id is unique — no duplicates.',
      '[ ] Every link source/target is a plain string matching an existing node id.',
      '[ ] Exactly one node has category "Project".',
      '[ ] All nodes have projectId set to the Project hub id.',
      '[ ] Every Activity node has one status:X tag and one priority:X tag.',
      '[ ] No node id contains spaces or special chars (only a-z, 0-9, hyphens).',
      '[ ] sessions is [] and kanbanColumns has exactly 4 entries.',
      '',
      '---',
      '',
      '[PASTE YOUR PROJECT CONTEXT HERE]',
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
