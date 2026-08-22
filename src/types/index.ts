export type NodeCategory =
  | 'Project'      // projeto em si (hub)
  | 'Meeting'      // reuniões / calls
  | 'Onboarding'   // processos de onboarding
  | 'Tech'         // tecnologias / stack
  | 'Activity'     // tarefas / atividades
  | 'Person'       // pessoas / stakeholders
  | 'Decision'     // decisões tomadas
  | 'Note'         // anotações livres
  | 'Resource'     // links, docs, arquivos
  | 'Module'       // módulos / pacotes do código
  | 'Feature'      // funcionalidades extraídas do código
  | 'Endpoint'     // rotas / endpoints de API

export interface BrainNode {
  id: string
  label: string
  category: NodeCategory
  content?: string
  tags?: string[]
  createdAt?: number
  updatedAt?: number
  // injected by force-graph
  x?: number
  y?: number
  z?: number
  vx?: number
  vy?: number
  fx?: number
  fy?: number
  val?: number
  color?: string
}

export interface BrainLink {
  id: string
  source: string | BrainNode
  target: string | BrainNode
  label?: string
  strength?: number
}

export type BrainView = 'graph' | 'kanban'

export type KanbanColumnId = 'backlog' | 'in_progress' | 'in_review' | 'done'

export interface KanbanColumn {
  id: KanbanColumnId
  title: string
  order: number
}

export interface KanbanCard {
  nodeId: string
  title: string
  columnId: KanbanColumnId
  projectId: string | null
  projectName: string | null
  projectColor: string
  priority: 'low' | 'medium' | 'high'
  updatedAt: number | null
}

export interface BrainExportMeta {
  version: number
  exportedAt: string
  nodeCount: number
  linkCount: number
  sessionCount: number
}

export interface BrainExportData {
  meta: BrainExportMeta
  nodes: BrainNode[]
  links: BrainLink[]
  sessions: ChatSession[]
  kanbanColumns: KanbanColumn[]
}

export interface BrainDB {
  nodes: BrainNode[]
  links: BrainLink[]
  kanbanColumns: KanbanColumn[]
}

// ── Project Importer types ────────────────────────────────────────────────────

export type ProjectStack =
  | 'java'
  | 'spring'
  | 'react'
  | 'angular'
  | 'vue'
  | 'node'
  | 'python'
  | 'dotnet'
  | 'flutter'
  | 'generic'

export interface ParsedFile {
  path: string
  name: string
  content: string
  size: number
}

export interface DetectedStack {
  primary: ProjectStack
  secondary: ProjectStack[]
  confidence: number
  details: string
}

export interface ParsedModule {
  name: string
  path: string
  type: 'controller' | 'service' | 'repository' | 'component' | 'page' | 'hook' | 'model' | 'util' | 'config' | 'module' | 'generic'
  description: string
  dependencies: string[]
  endpoints?: ParsedEndpoint[]
}

export interface ParsedEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'WS' | 'RPC'
  path: string
  description: string
  handler?: string
}

export interface ParsedFeature {
  name: string
  description: string
  relatedModules: string[]
  category: 'auth' | 'crud' | 'integration' | 'ui' | 'infra' | 'business' | 'test'
}

export interface ParsedProject {
  name: string
  stack: DetectedStack
  modules: ParsedModule[]
  features: ParsedFeature[]
  endpoints: ParsedEndpoint[]
  dependencies: Record<string, string>   // package name → version
  entryPoints: string[]                  // main files
  configFiles: string[]
  rawFileCount: number
  summary: string
}

// ── Context documents (meetings, dailys, docs) ────────────────────────────────
export interface ContextDocument {
  id: string
  type: 'meeting' | 'daily' | 'sprint_review' | 'retrospective' | 'documentation' | 'adr' | 'note'
  title: string
  content: string
  date?: string
  participants?: string[]
  tags?: string[]
}

// ── Chat session ──────────────────────────────────────────────────────────────
export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: JarvisMessage[]
}

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking'

export interface JarvisMessage {
  id: string
  role: 'user' | 'jarvis'
  text: string
  timestamp: number
}

export interface GraphFilters {
  categories: Set<NodeCategory>
  search: string
}

export interface PhysicsConfig {
  repelStrength: number
  linkDistance: number
  showLabels: boolean
  showParticles: boolean
}
