/**
 * ── Project Graph Builder ─────────────────────────────────────────────────────
 * Converts a ParsedProject + ContextDocuments into BrainNodes + BrainLinks and
 * merges them into the global brain store.
 *
 * Graph structure produced (layered):
 *
 *   [Project hub]  ←── amber star (large)
 *      ├── [Tech]      stack nodes — triangles
 *      ├── [Feature]   inferred features — hexagons (grouped by category)
 *      │       └── linked back to relevant [Module] nodes
 *      ├── [Module]    service / component / controller nodes — rectangles
 *      │       └── linked to [Endpoint] nodes (diamonds)
 *      ├── [Resource]  config files & entry points
 *      └── [Meeting/Decision/Note/Resource] context docs — satellites
 *
 * Every node gets:
 *   • tags: [...existing, `proj:${projectId}`]   ← for per-project cluster tinting
 *   • tags includes module type for rendering hints
 */

import type { BrainNode, BrainLink, ParsedProject, ParsedModule, NodeCategory, ContextDocument } from '../types'

// ── Unique project colors (cycling palette — distinct from category colors)
const PROJECT_TINT_PALETTE = [
  '#f59e0b', // amber
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f43f5e', // rose
  '#0ea5e9', // sky
  '#a855f7', // purple
  '#f97316', // orange
  '#14b8a6', // teal
]
let _paletteIdx = 0
const _projectColorCache = new Map<string, string>()

export function getProjectTintColor(projectId: string): string {
  if (!_projectColorCache.has(projectId)) {
    _projectColorCache.set(projectId, PROJECT_TINT_PALETTE[_paletteIdx % PROJECT_TINT_PALETTE.length])
    _paletteIdx++
  }
  return _projectColorCache.get(projectId)!
}

// ── Id generator (deterministic so re-import doesn't duplicate)
function stableId(prefix: string, label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 30)
  return `${prefix}-${slug}-${Date.now().toString(36)}`
}

function makeNode(
  id: string,
  label: string,
  category: NodeCategory,
  content: string,
  tags: string[] = [],
): BrainNode {
  return {
    id,
    label,
    category,
    content,
    tags,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

function makeLink(source: string, target: string, label?: string, strength = 0.7): BrainLink {
  return {
    id: `link-${source.slice(-8)}-${target.slice(-8)}-${Math.random().toString(36).slice(2, 6)}`,
    source,
    target,
    label,
    strength,
  }
}

// ── Stack → display label map
const STACK_LABELS: Record<string, string> = {
  java:    'Java',
  spring:  'Spring Boot',
  react:   'React',
  angular: 'Angular',
  vue:     'Vue.js',
  node:    'Node.js',
  python:  'Python',
  dotnet:  '.NET / C#',
  flutter: 'Flutter / Dart',
  generic: 'Generic',
}

// ── Module type → short display prefix
const MODULE_TYPE_PREFIX: Record<ParsedModule['type'], string> = {
  controller: '🔀',
  service:    '⚙️',
  repository: '🗄️',
  component:  '🧩',
  page:       '📄',
  hook:       '🪝',
  model:      '📦',
  util:       '🔧',
  config:     '⚙️',
  module:     '📐',
  generic:    '📁',
}

// ── Feature category → tag
const FEATURE_CATEGORY_TAG: Record<string, string> = {
  auth:        'security',
  crud:        'data',
  integration: 'integration',
  ui:          'frontend',
  infra:       'infrastructure',
  business:    'business-logic',
  test:        'quality',
}

// ── Context doc type → NodeCategory
const CONTEXT_TYPE_CATEGORY: Record<ContextDocument['type'], NodeCategory> = {
  meeting:       'Meeting',
  daily:         'Meeting',
  sprint_review: 'Meeting',
  retrospective: 'Meeting',
  documentation: 'Resource',
  adr:           'Decision',
  note:          'Note',
}

// ── Context doc type → link label
const CONTEXT_LINK_LABELS: Record<ContextDocument['type'], string> = {
  meeting:       'reunião',
  daily:         'daily',
  sprint_review: 'sprint review',
  retrospective: 'retro',
  documentation: 'docs',
  adr:           'decisão',
  note:          'nota',
}

// ─────────────────────────────────────────────────────────────────────────────
// Main build function
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildResult {
  nodes: BrainNode[]
  links: BrainLink[]
  projectNodeId: string
}

export function buildProjectGraph(
  project: ParsedProject,
  contextDocs: ContextDocument[] = [],
): BuildResult {
  const nodes: BrainNode[] = []
  const links: BrainLink[] = []

  // ── 1. Project hub ──────────────────────────────────────────────────────────
  const projectId = stableId('proj', project.name)
  const projectTag = `proj:${projectId}`   // cluster tag — used by ForceGraph for tinting

  nodes.push(makeNode(
    projectId,
    project.name,
    'Project',
    project.summary,
    [project.stack.primary, ...project.stack.secondary, projectTag, 'hub'],
  ))

  // ── 2. Stack / Tech nodes ───────────────────────────────────────────────────
  const stackIds = new Map<string, string>()
  const allStacks = [project.stack.primary, ...project.stack.secondary]

  for (const stack of [...new Set(allStacks)]) {
    const label = STACK_LABELS[stack] ?? stack
    const id    = stableId('tech', label)
    stackIds.set(stack, id)
    nodes.push(makeNode(
      id,
      label,
      'Tech',
      `Stack detectada: ${label}. Confiança: ${project.stack.confidence}%.`,
      [stack, 'stack', 'tech', projectTag],
    ))
    links.push(makeLink(projectId, id, 'usa', 0.8))
  }

  // ── 3. Feature nodes — grouped by category ──────────────────────────────────
  const featureIds = new Map<string, string>()
  const featuresByCategory = new Map<string, typeof project.features>()

  for (const feature of project.features) {
    if (!featuresByCategory.has(feature.category)) featuresByCategory.set(feature.category, [])
    featuresByCategory.get(feature.category)!.push(feature)
  }

  // Category group nodes — optional visual grouping hubs
  // (only create if category has 2+ features to avoid clutter)
  const categoryGroupIds = new Map<string, string>()
  for (const [cat, feats] of featuresByCategory.entries()) {
    if (feats.length >= 2) {
      const catLabel = CAT_LABELS[cat] ?? cat
      const catId = stableId('featgrp', cat + projectId)
      categoryGroupIds.set(cat, catId)
      nodes.push(makeNode(
        catId,
        catLabel,
        'Feature',
        `Grupo de funcionalidades: ${feats.map(f => f.name).join(', ')}`,
        [cat, 'feature-group', projectTag],
      ))
      links.push(makeLink(projectId, catId, 'funcionalidades', 0.6))
    }
  }

  for (const feature of project.features) {
    const id = stableId('feat', feature.name)
    featureIds.set(feature.name, id)
    nodes.push(makeNode(
      id,
      feature.name,
      'Feature',
      feature.description,
      [feature.category, FEATURE_CATEGORY_TAG[feature.category] ?? feature.category, projectTag],
    ))
    const groupId = categoryGroupIds.get(feature.category)
    if (groupId) {
      links.push(makeLink(groupId, id, feature.category, 0.8))
    } else {
      links.push(makeLink(projectId, id, 'funcionalidade', 0.6))
    }
  }

  // ── 4. Module nodes — grouped by type ───────────────────────────────────────
  const moduleIds = new Map<string, string>()

  // Group modules by type for cleaner layout (controllers together, services together etc.)
  const modulesByType = new Map<string, typeof project.modules>()
  for (const mod of project.modules) {
    if (!modulesByType.has(mod.type)) modulesByType.set(mod.type, [])
    modulesByType.get(mod.type)!.push(mod)
  }

  // Module type group hubs (only for types with 3+ members)
  const moduleGroupIds = new Map<string, string>()
  for (const [type, mods] of modulesByType.entries()) {
    if (mods.length >= 3) {
      const typeLabel = MODULE_TYPE_LABELS[type] ?? type
      const groupId = stableId('modgrp', type + projectId)
      moduleGroupIds.set(type, groupId)
      nodes.push(makeNode(
        groupId,
        typeLabel,
        'Module',
        `${mods.length} módulos do tipo ${typeLabel}`,
        [type, 'module-group', projectTag],
      ))
      links.push(makeLink(projectId, groupId, type, 0.6))
    }
  }

  for (const mod of project.modules) {
    const prefix = MODULE_TYPE_PREFIX[mod.type] ?? ''
    const id     = stableId('mod', mod.name)
    moduleIds.set(mod.name, id)

    const endpointSummary = mod.endpoints && mod.endpoints.length > 0
      ? `\nEndpoints: ${mod.endpoints.map(e => `${e.method} ${e.path}`).slice(0, 5).join(', ')}`
      : ''

    nodes.push(makeNode(
      id,
      `${prefix} ${mod.name}`.trim(),
      'Module',
      `${mod.description}${endpointSummary}`,
      [mod.type, project.stack.primary, projectTag],
    ))

    // Link module → group or project
    const groupId = moduleGroupIds.get(mod.type)
    if (groupId) {
      links.push(makeLink(groupId, id, mod.type, 0.8))
    } else {
      links.push(makeLink(projectId, id, mod.type, 0.6))
    }

    // Link module → features it belongs to
    for (const [featName, featId] of featureIds.entries()) {
      const feature = project.features.find(f => f.name === featName)
      if (feature?.relatedModules.includes(mod.name)) {
        links.push(makeLink(featId, id, 'implementa', 0.9))
      }
    }
  }

  // ── 5. Endpoint nodes (top 25 — deduplicated) ───────────────────────────────
  const endpointsSeen = new Set<string>()
  let endpointCount   = 0

  for (const ep of project.endpoints.slice(0, 25)) {
    const key = `${ep.method}:${ep.path}`
    if (endpointsSeen.has(key)) continue
    endpointsSeen.add(key)

    if (endpointCount >= 25) break
    endpointCount++

    const id    = stableId('ep', `${ep.method}-${ep.path}`)
    const label = `${ep.method} ${ep.path}`

    nodes.push(makeNode(
      id,
      label,
      'Endpoint',
      ep.description,
      [ep.method.toLowerCase(), 'api', 'rest', projectTag],
    ))

    // Link endpoint back to the module that owns it
    let linked = false
    for (const mod of project.modules) {
      if (mod.endpoints?.some(e => e.method === ep.method && e.path === ep.path)) {
        const modId = moduleIds.get(mod.name)
        if (modId) { links.push(makeLink(modId, id, 'expõe', 0.9)); linked = true; break }
      }
    }
    if (!linked) links.push(makeLink(projectId, id, 'endpoint', 0.5))
  }

  // ── 6. Config & entry points as Resource nodes ──────────────────────────────
  const importantConfigs = project.configFiles.slice(0, 5)
  for (const cfgPath of importantConfigs) {
    const name = cfgPath.split('/').pop() ?? cfgPath
    const id   = stableId('res', name)
    nodes.push(makeNode(
      id,
      name,
      'Resource',
      `Arquivo de configuração: ${cfgPath}`,
      ['config', project.stack.primary, projectTag],
    ))
    links.push(makeLink(projectId, id, 'configura', 0.4))
  }

  // ── 7. Context documents — satellite nodes linked to project hub ─────────────
  for (const doc of contextDocs) {
    const category = CONTEXT_TYPE_CATEGORY[doc.type]
    const id = stableId('ctx', doc.title)
    const linkLabel = CONTEXT_LINK_LABELS[doc.type]

    const contentLines = [
      doc.date ? `📅 ${doc.date}` : '',
      doc.participants?.length ? `👥 ${doc.participants.join(', ')}` : '',
      doc.content,
    ].filter(Boolean).join('\n')

    nodes.push(makeNode(
      id,
      doc.title,
      category,
      contentLines,
      [doc.type, project.stack.primary, projectTag, 'context-doc'],
    ))
    links.push(makeLink(projectId, id, linkLabel, 0.5))

    // Cross-link context docs to relevant modules/features by keyword matching
    const docText = (doc.title + ' ' + doc.content).toLowerCase()
    for (const [modName, modId] of moduleIds.entries()) {
      if (docText.includes(modName.toLowerCase()) && modName.length > 3) {
        links.push(makeLink(id, modId, 'referencia', 0.3))
        break // link to at most 1 module per doc to avoid noise
      }
    }
    for (const [featName, featId] of featureIds.entries()) {
      if (docText.includes(featName.toLowerCase()) && featName.length > 4) {
        links.push(makeLink(id, featId, 'relaciona', 0.3))
        break
      }
    }
  }

  return { nodes, links, projectNodeId: projectId }
}

// ── Label maps for group hubs
const CAT_LABELS: Record<string, string> = {
  auth:        '🔐 Autenticação',
  crud:        '📝 CRUD / Dados',
  integration: '🔗 Integrações',
  ui:          '🎨 Interface',
  infra:       '🏗️ Infraestrutura',
  business:    '💼 Regras de Negócio',
  test:        '🧪 Testes',
}

const MODULE_TYPE_LABELS: Record<string, string> = {
  controller:  '🔀 Controllers',
  service:     '⚙️ Services',
  repository:  '🗄️ Repositories',
  component:   '🧩 Components',
  page:        '📄 Pages',
  hook:        '🪝 Hooks',
  model:       '📦 Models',
  util:        '🔧 Utils',
  config:      '⚙️ Configs',
  module:      '📐 Modules',
  generic:     '📁 Files',
}
