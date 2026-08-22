import { create } from 'zustand'
import type {
  BrainNode,
  BrainLink,
  NodeCategory,
  VoiceState,
  JarvisMessage,
  GraphFilters,
  PhysicsConfig,
  ChatSession,
  KanbanCard,
  KanbanColumn,
  KanbanColumnId,
  BrainExportData,
  BrainView,
} from '../types'
import { CATEGORY_COLORS } from '../data/sampleBrain'
import { useProjectStore } from './projectStore'
import {
  saveNode,
  saveLink,
  deleteNodeDB,
  deleteLinkDB,
  loadBrain,
  clearDB,
  loadSessions,
  saveSession,
  deleteSession,
  replaceKanbanColumns,
} from './db'

interface BrainStore {
  // ── Data
  nodes: BrainNode[]
  links: BrainLink[]
  kanbanColumns: KanbanColumn[]
  currentView: BrainView
  initialized: boolean

  // ── Selection & Hover
  selectedNodeId: string | null
  highlightNodeIds: Set<string>
  highlightLinkIds: Set<string>
  pathNodeIds: string[]
  hoverNodeId: string | null
  activeProjectFilterId: string | null

  // ── Filters & Physics
  filters: GraphFilters
  physics: PhysicsConfig

  // ── JARVIS chat
  voiceState: VoiceState
  chatHistory: JarvisMessage[]
  chatOpen: boolean

  // ── Chat sessions
  sessions: ChatSession[]
  activeSessionId: string | null

  // ── Actions: data
  init: () => Promise<void>
  addNode: (node: Omit<BrainNode, 'id' | 'createdAt' | 'updatedAt'>) => Promise<BrainNode>
  updateNode: (id: string, updates: Partial<BrainNode>) => Promise<void>
  removeNode: (id: string) => Promise<void>
  addLink: (source: string, target: string, label?: string) => Promise<BrainLink>
  removeLink: (id: string) => Promise<void>

  // ── Actions: selection
  selectNode: (id: string | null, forceGraphView?: boolean) => void
  highlightConnections: (nodeId: string) => void
  tracePath: (fromId: string, toId: string) => void
  clearHighlight: () => void
  setHoverNode: (id: string | null) => void

  // ── Actions: filters
  setSearch: (q: string) => void
  toggleCategory: (cat: NodeCategory) => void
  setAllCategories: (on: boolean) => void
  setProjectFilter: (projectId: string | null) => void

  // ── Actions: physics
  setPhysics: (p: Partial<PhysicsConfig>) => void
  setCurrentView: (view: BrainView) => void
  toggleView: () => void

  // ── Actions: JARVIS voice
  setVoiceState: (s: VoiceState) => void
  setChatOpen: (open: boolean) => void

  // ── Actions: messages + sessions
  addMessage: (msg: Omit<JarvisMessage, 'id' | 'timestamp'>) => void
  newSession: () => void
  loadSession: (id: string) => void
  removeSession: (id: string) => Promise<void>

  // ── Actions: export/import
  exportBrain: () => BrainExportData
  importBrain: (data: BrainExportData, mode: 'merge' | 'replace') => Promise<void>
  clearProjectData: (projectId: string) => Promise<void>

  // ── Undo / Redo
  undoStack: Array<{ description: string; undo: () => Promise<void> }>
  redoStack: Array<{ description: string; redo: () => Promise<void> }>
  undo: () => Promise<void>
  redo: () => Promise<void>
  canUndo: () => boolean
  canRedo: () => boolean

  // ── Actions: kanban
  createActivityNode: (label: string, projectId?: string | null, content?: string, priority?: KanbanCard['priority']) => Promise<BrainNode>
  moveActivityToColumn: (nodeId: string, columnId: KanbanColumnId) => Promise<void>
  getKanbanCards: () => KanbanCard[]

  // ── Derived helpers
  getNodeById: (id: string) => BrainNode | undefined
  getNeighbors: (id: string) => BrainNode[]
  getLinks: (id: string) => BrainLink[]
  filteredNodes: () => BrainNode[]
  filteredLinks: () => BrainLink[]
  topHubs: () => Array<{ node: BrainNode; count: number }>
  categoryCounts: () => Record<NodeCategory, number>
  getProjectNodes: () => BrainNode[]
  getProjectSubgraphNodeIds: (projectId: string) => Set<string>
}

const ALL_CATEGORIES = new Set<NodeCategory>([
  'Project', 'Meeting', 'Onboarding', 'Tech', 'Activity', 'Person', 'Decision', 'Note', 'Resource',
  'Module', 'Feature', 'Endpoint',
])

const DEFAULT_KANBAN_COLUMNS: KanbanColumn[] = [
  { id: 'backlog', title: 'Backlog', order: 0 },
  { id: 'in_progress', title: 'Em Progresso', order: 1 },
  { id: 'in_review', title: 'Em Revisão', order: 2 },
  { id: 'done', title: 'Concluído', order: 3 },
]

function nodeId(x: string | BrainNode): string {
  return typeof x === 'string' ? x : x.id
}

function inferColumnId(node: BrainNode): KanbanColumnId {
  const content = `${node.content ?? ''} ${(node.tags ?? []).join(' ')}`.toLowerCase()
  if (content.includes('revis')) return 'in_review'
  if (content.includes('done') || content.includes('conclu') || content.includes('finaliz')) return 'done'
  if (content.includes('progresso') || content.includes('progress') || content.includes('andamento')) return 'in_progress'
  return 'backlog'
}

function inferPriority(node: BrainNode): KanbanCard['priority'] {
  // Explicit priority tag wins first
  const tags = node.tags ?? []
  if (tags.includes('priority:high'))   return 'high'
  if (tags.includes('priority:low'))    return 'low'
  if (tags.includes('priority:medium')) return 'medium'
  const source = `${node.label} ${node.content ?? ''} ${tags.join(' ')}`.toLowerCase()
  if (source.includes('alta') || source.includes('high') || source.includes('urgente') || source.includes('p1')) return 'high'
  if (source.includes('baixa') || source.includes('low') || source.includes('p3')) return 'low'
  return 'medium'
}

function upsertTag(tags: string[] | undefined, nextTag: string, prefix: string): string[] {
  const current = (tags ?? []).filter(tag => !tag.startsWith(prefix))
  return [...current, nextTag]
}

function buildProjectSubgraphNodeIds(projectId: string, nodes: BrainNode[], links: BrainLink[]): Set<string> {
  const visible = new Set<string>([projectId])
  let changed = true
  while (changed) {
    changed = false
    for (const link of links) {
      const source = nodeId(link.source)
      const target = nodeId(link.target)
      if (visible.has(source) && !visible.has(target)) {
        visible.add(target)
        changed = true
      }
      if (visible.has(target) && !visible.has(source)) {
        visible.add(source)
        changed = true
      }
    }
  }

  const nodeIds = new Set(nodes.map(node => node.id))
  return new Set([...visible].filter(id => nodeIds.has(id)))
}

// Internal flag to suppress undo/redo tracking during undo/redo execution
let _suppressHistory = false

export const useBrainStore = create<BrainStore>((set, get) => ({
  nodes: [],
  links: [],
  kanbanColumns: DEFAULT_KANBAN_COLUMNS,
  currentView: 'graph',
  initialized: false,
  selectedNodeId: null,
  highlightNodeIds: new Set(),
  highlightLinkIds: new Set(),
  pathNodeIds: [],
  hoverNodeId: null,
  activeProjectFilterId: null,
  filters: { categories: new Set(ALL_CATEGORIES), search: '' },
  physics: { repelStrength: 120, linkDistance: 100, showLabels: true, showParticles: true },
  voiceState: 'idle',
  chatHistory: [],
  chatOpen: false,
  sessions: [],
  activeSessionId: null,
  undoStack: [],
  redoStack: [],

  init: async () => {
    if (get().initialized) return
    try {
      const [brain, sessions] = await Promise.all([loadBrain(), loadSessions()])
      const validCategories = new Set<string>([
        'Project', 'Meeting', 'Onboarding', 'Tech', 'Activity', 'Person', 'Decision', 'Note', 'Resource',
        'Module', 'Feature', 'Endpoint',
      ])
      // Known mock/sample node IDs that were seeded in older versions
      const MOCK_NODE_IDS = new Set([
        'proj-alpha','proj-beta','proj-gamma','proj-cuida',
        'ob-proc','ob-arch','ob-conv','ob-env','ob-flow',
        'meet-kick','meet-sprint1','meet-retro1','meet-arch',
        'tech-react','tech-node','tech-pg','tech-docker','tech-gh','tech-jest',
        'dec-pg','dec-arch','dec-ts',
        'person-joao','person-marina','person-carlos','person-ana',
        'feat-auth','feat-crud','feat-notif','feat-reports','feat-mobile',
        'mod-authsvc','mod-coreapi','mod-worker','mod-notif',
        'ep-login','ep-users','ep-orders',
        'note-risk1','note-debt1','note-qa',
        'res-wiki','res-figma','res-jira',
        'act-login','act-crud','act-tests',
      ])

      const isStale = brain.nodes.length > 0 && brain.nodes.some(node => !validCategories.has(node.category))
      const isMockOnly = brain.nodes.length > 0 && brain.nodes.every(node => MOCK_NODE_IDS.has(node.id))

      if (isStale || isMockOnly) {
        // Wipe stale/legacy/mock data silently — user starts fresh
        await clearDB()
        await replaceKanbanColumns(DEFAULT_KANBAN_COLUMNS)
        set({ nodes: [], links: [], kanbanColumns: DEFAULT_KANBAN_COLUMNS, initialized: true, sessions })
        return
      }

      // Migration: assign projectId = 'default' to any node that lacks one
      const nodes = brain.nodes.map(node =>
        node.projectId ? node : { ...node, projectId: 'default' }
      )
      set({
        nodes,
        links: brain.links,
        kanbanColumns: brain.kanbanColumns.length > 0 ? brain.kanbanColumns : DEFAULT_KANBAN_COLUMNS,
        initialized: true,
        sessions,
      })
    } catch {
      set({ nodes: [], links: [], kanbanColumns: DEFAULT_KANBAN_COLUMNS, initialized: true, sessions: [] })
    }
  },

  addNode: async (partial) => {
    const activeProjectId = useProjectStore.getState().activeProjectId
    const node: BrainNode = {
      projectId: activeProjectId ?? undefined,
      ...partial,
      id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await saveNode(node)
    if (_suppressHistory) {
      set(state => ({ nodes: [...state.nodes, node] }))
    } else {
      set(state => ({
        nodes: [...state.nodes, node],
        redoStack: [],
        undoStack: [
          ...state.undoStack.slice(-19),
          {
            description: `Nó adicionado: ${node.label}`,
            undo: async () => { await get().removeNode(node.id) },
          },
        ],
      }))
      window.dispatchEvent(new CustomEvent('jarvis:toast', {
        detail: { message: `Nó adicionado: ${node.label}`, type: 'success' },
      }))
    }
    return node
  },

  updateNode: async (id, updates) => {
    const node = get().nodes.find(item => item.id === id)
    if (!node) return
    const prev = { ...node }
    const updated = { ...node, ...updates, updatedAt: Date.now() }
    await saveNode(updated)
    if (_suppressHistory) {
      set(state => ({ nodes: state.nodes.map(item => item.id === id ? updated : item) }))
    } else {
      set(state => ({
        nodes: state.nodes.map(item => item.id === id ? updated : item),
        redoStack: [],
        undoStack: [
          ...state.undoStack.slice(-19),
          {
            description: `Nó editado: ${prev.label}`,
            undo: async () => { await get().updateNode(prev.id, prev) },
          },
        ],
      }))
    }
  },

  removeNode: async (id) => {
    const removedNode = get().nodes.find(n => n.id === id)
    await deleteNodeDB(id)
    const linksToRemove = get().links.filter(link => nodeId(link.source) === id || nodeId(link.target) === id)
    for (const link of linksToRemove) {
      await deleteLinkDB(link.id)
    }
    if (_suppressHistory) {
      set(state => ({
        nodes: state.nodes.filter(node => node.id !== id),
        links: state.links.filter(link => nodeId(link.source) !== id && nodeId(link.target) !== id),
        selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
      }))
    } else {
      set(state => ({
        nodes: state.nodes.filter(node => node.id !== id),
        links: state.links.filter(link => nodeId(link.source) !== id && nodeId(link.target) !== id),
        selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
        redoStack: [],
        undoStack: removedNode
          ? [
              ...state.undoStack.slice(-19),
              {
                description: `Nó removido: ${removedNode.label}`,
                undo: async () => { await get().addNode(removedNode) },
              },
            ]
          : state.undoStack,
      }))
      window.dispatchEvent(new CustomEvent('jarvis:toast', {
        detail: { message: 'Nó removido', type: 'info' },
      }))
    }
  },

  addLink: async (source, target, label) => {
    const link: BrainLink = {
      id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      source,
      target,
      label,
      strength: 0.6,
    }
    await saveLink(link)
    if (_suppressHistory) {
      set(state => ({ links: [...state.links, link] }))
    } else {
      set(state => ({
        links: [...state.links, link],
        redoStack: [],
        undoStack: [
          ...state.undoStack.slice(-19),
          {
            description: 'Conexão criada',
            undo: async () => { await get().removeLink(link.id) },
          },
        ],
      }))
      window.dispatchEvent(new CustomEvent('jarvis:toast', {
        detail: { message: 'Conexão criada', type: 'success' },
      }))
    }
    return link
  },

  removeLink: async (id) => {
    const removedLink = get().links.find(l => l.id === id)
    await deleteLinkDB(id)
    if (_suppressHistory) {
      set(state => ({ links: state.links.filter(link => link.id !== id) }))
    } else {
      set(state => ({
        links: state.links.filter(link => link.id !== id),
        redoStack: [],
        undoStack: removedLink
          ? [
              ...state.undoStack.slice(-19),
              {
                description: 'Conexão removida',
                undo: async () => {
                  await get().addLink(
                    nodeId(removedLink.source),
                    nodeId(removedLink.target),
                    removedLink.label,
                  )
                },
              },
            ]
          : state.undoStack,
      }))
      window.dispatchEvent(new CustomEvent('jarvis:toast', {
        detail: { message: 'Conexão removida', type: 'info' },
      }))
    }
  },

  selectNode: (id, forceGraphView = true) => {
    set({ selectedNodeId: id, ...(forceGraphView ? { currentView: 'graph' } : {}) })
    if (id) get().highlightConnections(id)
    else get().clearHighlight()
  },

  highlightConnections: (selectedId) => {
    const { links } = get()
    const connectedLinks = links.filter(link => nodeId(link.source) === selectedId || nodeId(link.target) === selectedId)
    const ids = new Set<string>([selectedId])
    connectedLinks.forEach(link => {
      ids.add(nodeId(link.source))
      ids.add(nodeId(link.target))
    })
    set({
      highlightNodeIds: ids,
      highlightLinkIds: new Set(connectedLinks.map(link => link.id)),
    })
  },

  tracePath: (fromId, toId) => {
    const { links, nodes } = get()
    const adjacency = new Map<string, string[]>()
    nodes.forEach(node => adjacency.set(node.id, []))
    links.forEach(link => {
      const source = nodeId(link.source)
      const target = nodeId(link.target)
      adjacency.get(source)?.push(target)
      adjacency.get(target)?.push(source)
    })
    const visited = new Map<string, string | null>([[fromId, null]])
    const queue = [fromId]
    while (queue.length) {
      const current = queue.shift()!
      if (current === toId) break
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.set(neighbor, current)
          queue.push(neighbor)
        }
      }
    }
    if (!visited.has(toId)) {
      set({ pathNodeIds: [] })
      return
    }
    const path: string[] = []
    let current: string | null = toId
    while (current) {
      path.unshift(current)
      current = visited.get(current) ?? null
    }
    set({ pathNodeIds: path, highlightNodeIds: new Set(path) })
  },

  clearHighlight: () => set({ highlightNodeIds: new Set(), highlightLinkIds: new Set(), pathNodeIds: [] }),

  setHoverNode: (id) => set({ hoverNodeId: id }),

  setSearch: (search) => set(state => ({ filters: { ...state.filters, search } })),

  toggleCategory: (cat) => set(state => {
    const categories = new Set(state.filters.categories)
    categories.has(cat) ? categories.delete(cat) : categories.add(cat)
    return { filters: { ...state.filters, categories } }
  }),

  setAllCategories: (on) => set(state => ({
    filters: { ...state.filters, categories: on ? new Set(ALL_CATEGORIES) : new Set() },
  })),

  setProjectFilter: (projectId) => set({ activeProjectFilterId: projectId }),

  setPhysics: (physics) => set(state => ({ physics: { ...state.physics, ...physics } })),

  setCurrentView: (currentView) => set({ currentView }),

  toggleView: () => set(state => ({ currentView: state.currentView === 'graph' ? 'kanban' : 'graph' })),

  setVoiceState: (voiceState) => set({ voiceState }),

  setChatOpen: (chatOpen) => set({ chatOpen }),

  addMessage: (msg) => {
    const full: JarvisMessage = { ...msg, id: `msg-${Date.now()}`, timestamp: Date.now() }
    const now = Date.now()
    set(state => {
      const newHistory = [...state.chatHistory, full]
      let { activeSessionId, sessions } = state
      let session = sessions.find(item => item.id === activeSessionId)

      if (!session) {
        const firstUserMsg = newHistory.find(message => message.role === 'user')
        const title = firstUserMsg
          ? firstUserMsg.text.slice(0, 48) + (firstUserMsg.text.length > 48 ? '…' : '')
          : `Conversa ${new Date().toLocaleDateString('pt-BR')}`
        session = { id: `sess-${now}`, title, createdAt: now, updatedAt: now, messages: newHistory }
        activeSessionId = session.id
        sessions = [session, ...sessions]
      } else {
        session = { ...session, updatedAt: now, messages: newHistory }
        sessions = sessions.map(item => item.id === session!.id ? session! : item)
      }

      saveSession(session)
      return { chatHistory: newHistory, sessions, activeSessionId }
    })
  },

  newSession: () => {
    set({ chatHistory: [], activeSessionId: null })
  },

  loadSession: (id) => {
    const session = get().sessions.find(item => item.id === id)
    if (!session) return
    set({ chatHistory: session.messages, activeSessionId: id, chatOpen: true })
  },

  removeSession: async (id) => {
    await deleteSession(id)
    set(state => {
      const sessions = state.sessions.filter(item => item.id !== id)
      const isActive = state.activeSessionId === id
      return {
        sessions,
        activeSessionId: isActive ? null : state.activeSessionId,
        chatHistory: isActive ? [] : state.chatHistory,
      }
    })
  },

  exportBrain: () => {
    const { nodes, links, sessions, kanbanColumns } = get()
    return {
      meta: {
        version: 1,
        exportedAt: new Date().toISOString(),
        nodeCount: nodes.length,
        linkCount: links.length,
        sessionCount: sessions.length,
      },
      nodes,
      links: links.map(link => ({ ...link, source: nodeId(link.source), target: nodeId(link.target) })),
      sessions,
      kanbanColumns,
    }
  },

  importBrain: async (data, mode) => {
    const importedColumns = data.kanbanColumns?.length ? data.kanbanColumns : DEFAULT_KANBAN_COLUMNS
    const importedLinks = data.links.map(link => ({ ...link, source: nodeId(link.source), target: nodeId(link.target) }))

    if (mode === 'replace') {
      await clearDB()
      for (const node of data.nodes) await saveNode(node)
      for (const link of importedLinks) await saveLink(link)
      for (const session of data.sessions ?? []) await saveSession(session)
      await replaceKanbanColumns(importedColumns)
      set({
        nodes: data.nodes,
        links: importedLinks,
        sessions: [...(data.sessions ?? [])].sort((a, b) => b.updatedAt - a.updatedAt),
        kanbanColumns: importedColumns,
        activeSessionId: null,
        chatHistory: [],
        selectedNodeId: null,
        activeProjectFilterId: null,
      })
      window.dispatchEvent(new CustomEvent('jarvis:import-complete'))
      window.dispatchEvent(new CustomEvent('jarvis:toast', {
        detail: { message: `Brain importado: ${data.nodes.length} nós`, type: 'success' },
      }))
      return
    }

    const state = get()
    const nodeMap = new Map(state.nodes.map(node => [node.id, node]))
    data.nodes.forEach(node => nodeMap.set(node.id, node))

    const linkMap = new Map(state.links.map(link => [link.id, { ...link, source: nodeId(link.source), target: nodeId(link.target) }]))
    importedLinks.forEach(link => linkMap.set(link.id, link))

    const sessionMap = new Map(state.sessions.map(session => [session.id, session]))
    for (const session of data.sessions ?? []) {
      sessionMap.set(session.id, session)
      await saveSession(session)
    }

    const nodes = [...nodeMap.values()]
    const links = [...linkMap.values()]
    for (const node of data.nodes) await saveNode(node)
    for (const link of importedLinks) await saveLink(link)
    await replaceKanbanColumns(importedColumns)

    set({
      nodes,
      links,
      sessions: [...sessionMap.values()].sort((a, b) => b.updatedAt - a.updatedAt),
      kanbanColumns: importedColumns,
    })
    window.dispatchEvent(new CustomEvent('jarvis:import-complete'))
    window.dispatchEvent(new CustomEvent('jarvis:toast', {
      detail: { message: `Brain importado: ${data.nodes.length} nós`, type: 'success' },
    }))
  },

  clearProjectData: async (projectId) => {
    const { nodes, links } = get()
    const nodeIds = new Set(nodes.filter(n => n.projectId === projectId).map(n => n.id))
    // also remove links connected to those nodes
    const linksToRemove = links.filter(link => {
      const source = nodeId(link.source)
      const target = nodeId(link.target)
      return nodeIds.has(source) || nodeIds.has(target)
    })
    for (const id of nodeIds) await deleteNodeDB(id)
    for (const link of linksToRemove) await deleteLinkDB(link.id)
    const removedLinkIds = new Set(linksToRemove.map(l => l.id))
    set(state => ({
      nodes: state.nodes.filter(n => !nodeIds.has(n.id)),
      links: state.links.filter(l => !removedLinkIds.has(l.id)),
      selectedNodeId: nodeIds.has(state.selectedNodeId ?? '') ? null : state.selectedNodeId,
    }))
  },

  createActivityNode: async (label, projectId = null, content, priority) => {
    const resolvedProjectId = projectId ?? useProjectStore.getState().activeProjectId
    const priorityTag = priority ? `priority:${priority}` : 'priority:medium'
    const baseContent = content ?? ''
    const fullContent = baseContent
      ? `${baseContent}\n\nStatus: 📋 Backlog.`
      : 'Status: 📋 Backlog.'
    const node = await get().addNode({
      label,
      category: 'Activity',
      content: fullContent,
      tags: ['status:backlog', priorityTag],
      projectId: resolvedProjectId ?? undefined,
    })
    if (resolvedProjectId) {
      await get().addLink(resolvedProjectId, node.id, 'owns')
    }
    return node
  },

  moveActivityToColumn: async (nodeIdValue, columnId) => {
    const node = get().nodes.find(item => item.id === nodeIdValue && item.category === 'Activity')
    if (!node) return

    const statusMap: Record<KanbanColumnId, string> = {
      backlog: '📋 Backlog',
      in_progress: '🔄 Em progresso',
      in_review: '🧐 Em revisão',
      done: '✅ Concluído',
    }

    const nextTags = upsertTag(node.tags, `status:${columnId}`, 'status:')
    const cleanedContent = (node.content ?? '').replace(/Status:[^.!\n]*(?:[.!]?)/i, '').trim()
    const nextContent = `${cleanedContent ? `${cleanedContent}\n\n` : ''}Status: ${statusMap[columnId]}.`
    await get().updateNode(node.id, { tags: nextTags, content: nextContent })
  },

  getKanbanCards: () => {
    const { nodes, links, activeProjectFilterId } = get()
    const storeActiveProjectId = useProjectStore.getState().activeProjectId
    // Use graph filter if set, otherwise fall back to the projectStore's active project
    const effectiveProjectId = activeProjectFilterId ?? storeActiveProjectId
    const allowedNodeIds = effectiveProjectId
      ? buildProjectSubgraphNodeIds(effectiveProjectId, nodes, links)
      : null

    return nodes
      .filter(node => node.category === 'Activity')
      .filter(node => !allowedNodeIds || allowedNodeIds.has(node.id))
      .map(node => {
        const projectLink = links.find(link => {
          const source = nodeId(link.source)
          const target = nodeId(link.target)
          const sourceNode = nodes.find(item => item.id === source)
          const targetNode = nodes.find(item => item.id === target)
          return (
            (source === node.id && targetNode?.category === 'Project') ||
            (target === node.id && sourceNode?.category === 'Project')
          )
        })

        const projectId = projectLink
          ? (() => {
              const source = nodeId(projectLink.source)
              const target = nodeId(projectLink.target)
              const sourceNode = nodes.find(item => item.id === source)
              return sourceNode?.category === 'Project' ? source : target
            })()
          : null

        const project = projectId ? nodes.find(item => item.id === projectId) : null

        return {
          nodeId: node.id,
          title: node.label,
          columnId: inferColumnId(node),
          projectId,
          projectName: project?.label ?? null,
          projectColor: project ? CATEGORY_COLORS.Project : 'rgba(255,255,255,0.2)',
          priority: inferPriority(node),
          updatedAt: node.updatedAt ?? node.createdAt ?? null,
        }
      })
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  },

  getNodeById: (id) => get().nodes.find(node => node.id === id),

  getNeighbors: (id) => {
    const { links, nodes } = get()
    const ids = new Set<string>()
    links.forEach(link => {
      const source = nodeId(link.source)
      const target = nodeId(link.target)
      if (source === id) ids.add(target)
      if (target === id) ids.add(source)
    })
    return nodes.filter(node => ids.has(node.id))
  },

  getLinks: (id) => get().links.filter(link => nodeId(link.source) === id || nodeId(link.target) === id),

  filteredNodes: () => {
    const { nodes, filters, activeProjectFilterId, links } = get()
    const allowedNodeIds = activeProjectFilterId
      ? buildProjectSubgraphNodeIds(activeProjectFilterId, nodes, links)
      : null

    return nodes.filter(node => {
      if (!filters.categories.has(node.category)) return false
      if (allowedNodeIds && !allowedNodeIds.has(node.id)) return false
      if (filters.search) {
        const query = filters.search.toLowerCase()
        return node.label.toLowerCase().includes(query)
          || (node.content ?? '').toLowerCase().includes(query)
          || (node.tags ?? []).some(tag => tag.toLowerCase().includes(query))
      }
      return true
    })
  },

  filteredLinks: () => {
    const visibleIds = new Set(get().filteredNodes().map(node => node.id))
    return get().links.filter(link => visibleIds.has(nodeId(link.source)) && visibleIds.has(nodeId(link.target)))
  },

  topHubs: () => {
    const { nodes, links } = get()
    return nodes
      .map(node => ({
        node,
        count: links.filter(link => nodeId(link.source) === node.id || nodeId(link.target) === node.id).length,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  },

  categoryCounts: () => {
    const counts = {} as Record<NodeCategory, number>
    const categories: NodeCategory[] = [
      'Project', 'Meeting', 'Onboarding', 'Tech', 'Activity', 'Person', 'Decision', 'Note', 'Resource',
      'Module', 'Feature', 'Endpoint',
    ]
    categories.forEach(category => { counts[category] = 0 })
    get().filteredNodes().forEach(node => { counts[node.category] = (counts[node.category] ?? 0) + 1 })
    return counts
  },

  getProjectNodes: () => get().nodes.filter(node => node.category === 'Project'),

  getProjectSubgraphNodeIds: (projectId) => buildProjectSubgraphNodeIds(projectId, get().nodes, get().links),

  canUndo: () => get().undoStack.length > 0,

  canRedo: () => get().redoStack.length > 0,

  undo: async () => {
    const stack = get().undoStack
    if (stack.length === 0) return
    const entry = stack[stack.length - 1]
    set(state => ({ undoStack: state.undoStack.slice(0, -1), redoStack: state.redoStack }))
    _suppressHistory = true
    try {
      await entry.undo()
    } finally {
      _suppressHistory = false
    }
    set(state => ({
      redoStack: [...state.redoStack, { description: entry.description, redo: entry.undo }],
    }))
  },

  redo: async () => {
    const stack = get().redoStack
    if (stack.length === 0) return
    const entry = stack[stack.length - 1]
    set(state => ({ redoStack: state.redoStack.slice(0, -1) }))
    _suppressHistory = true
    try {
      await entry.redo()
    } finally {
      _suppressHistory = false
    }
    set(state => ({
      undoStack: [...state.undoStack, { description: entry.description, undo: entry.redo }],
    }))
  },
}))

export { CATEGORY_COLORS }
