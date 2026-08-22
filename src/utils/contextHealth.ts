import type { BrainNode, BrainLink } from '../types'

export interface ContextHealthCheck {
  key: string
  label: string
  status: 'ok' | 'warn' | 'fail'
  detail?: string
}

export interface ContextHealthResult {
  score: number
  grade: 'excellent' | 'good' | 'fair' | 'poor'
  checks: ContextHealthCheck[]
}

export function calculateContextHealth(
  nodes: BrainNode[],
  links: BrainLink[],
): ContextHealthResult {
  const checks: ContextHealthCheck[] = []

  // Helper: resolve node id from link source/target
  function nodeId(x: string | BrainNode): string {
    return typeof x === 'string' ? x : x.id
  }

  // Build adjacency count for each node
  const adjacencyCount = new Map<string, number>()
  for (const node of nodes) adjacencyCount.set(node.id, 0)
  for (const link of links) {
    const src = nodeId(link.source)
    const tgt = nodeId(link.target)
    adjacencyCount.set(src, (adjacencyCount.get(src) ?? 0) + 1)
    adjacencyCount.set(tgt, (adjacencyCount.get(tgt) ?? 0) + 1)
  }

  // 1. Has at least one Project node
  const projectNodes = nodes.filter(n => n.category === 'Project')
  if (projectNodes.length > 0) {
    checks.push({ key: 'has_project', label: 'Has project node', status: 'ok' })
  } else {
    checks.push({ key: 'has_project', label: 'Has project node', status: 'fail', detail: 'No Project node found' })
  }

  // 2. Project node has content/description
  const projectWithContent = projectNodes.find(n => (n.content?.length ?? 0) > 20)
  if (projectNodes.length === 0) {
    checks.push({ key: 'project_description', label: 'Project has description', status: 'fail', detail: 'No project node' })
  } else if (projectWithContent) {
    checks.push({ key: 'project_description', label: 'Project has description', status: 'ok' })
  } else {
    checks.push({ key: 'project_description', label: 'Project has description', status: 'warn', detail: 'Project description is empty or too short' })
  }

  // 3. Has at least 3 other nodes connected to project
  const projectNodeIds = new Set(projectNodes.map(n => n.id))
  const connectedToProject = new Set<string>()
  for (const link of links) {
    const src = nodeId(link.source)
    const tgt = nodeId(link.target)
    if (projectNodeIds.has(src)) connectedToProject.add(tgt)
    if (projectNodeIds.has(tgt)) connectedToProject.add(src)
  }
  const connectedCount = connectedToProject.size
  if (connectedCount >= 5) {
    checks.push({ key: 'connected_nodes', label: 'Connected nodes', status: 'ok', detail: `${connectedCount} nodes connected to project` })
  } else if (connectedCount >= 1) {
    checks.push({ key: 'connected_nodes', label: 'Connected nodes', status: 'warn', detail: `${connectedCount} nodes connected — aim for 5+` })
  } else {
    checks.push({ key: 'connected_nodes', label: 'Connected nodes', status: 'fail', detail: 'No nodes connected to project' })
  }

  // 4. Has at least one Activity/Feature node
  const hasActivityOrFeature = nodes.some(n => n.category === 'Activity' || n.category === 'Feature')
  if (hasActivityOrFeature) {
    checks.push({ key: 'has_activities', label: 'Has Activity/Feature nodes', status: 'ok' })
  } else {
    checks.push({ key: 'has_activities', label: 'Has Activity/Feature nodes', status: 'warn', detail: 'Consider adding activities or features' })
  }

  // 5. Has at least one Person node
  const hasPersonNode = nodes.some(n => n.category === 'Person')
  if (hasPersonNode) {
    checks.push({ key: 'has_people', label: 'Has Person nodes', status: 'ok' })
  } else {
    checks.push({ key: 'has_people', label: 'Has Person nodes', status: 'warn', detail: 'Optional: add team members' })
  }

  // 6. No isolated nodes (nodes with zero links)
  const isolatedCount = nodes.filter(n => (adjacencyCount.get(n.id) ?? 0) === 0).length
  if (isolatedCount === 0) {
    checks.push({ key: 'no_isolated', label: 'No isolated nodes', status: 'ok' })
  } else if (isolatedCount <= 3) {
    checks.push({ key: 'no_isolated', label: 'No isolated nodes', status: 'warn', detail: `${isolatedCount} isolated node(s)` })
  } else {
    checks.push({ key: 'no_isolated', label: 'No isolated nodes', status: 'fail', detail: `${isolatedCount} isolated nodes — connect them` })
  }

  // 7. Recent updates — any node updated in last 7 days
  const now = Date.now()
  const sevenDays = 7 * 24 * 60 * 60 * 1000
  const thirtyDays = 30 * 24 * 60 * 60 * 1000
  const mostRecent = nodes.reduce((max, n) => Math.max(max, n.updatedAt ?? n.createdAt ?? 0), 0)
  if (mostRecent > now - sevenDays) {
    checks.push({ key: 'recent_updates', label: 'Recent updates', status: 'ok', detail: 'Updated within last 7 days' })
  } else if (mostRecent > now - thirtyDays) {
    checks.push({ key: 'recent_updates', label: 'Recent updates', status: 'warn', detail: 'No updates in 7+ days' })
  } else {
    checks.push({ key: 'recent_updates', label: 'Recent updates', status: 'warn', detail: 'No updates in 30+ days' })
  }

  // 8. Node count
  const nodeCount = nodes.length
  if (nodeCount >= 10) {
    checks.push({ key: 'node_count', label: 'Node count', status: 'ok', detail: `${nodeCount} nodes` })
  } else if (nodeCount >= 3) {
    checks.push({ key: 'node_count', label: 'Node count', status: 'warn', detail: `${nodeCount} nodes — aim for 10+` })
  } else {
    checks.push({ key: 'node_count', label: 'Node count', status: 'fail', detail: `Only ${nodeCount} nodes` })
  }

  // ── Weighted score ─────────────────────────────────────────────────────────
  // Weights: has_project=20, project_description=10, connected_nodes=15,
  //          has_activities=10, has_people=5, no_isolated=10, recent_updates=15, node_count=15
  const weights: Record<string, { ok: number; warn: number; fail: number }> = {
    has_project:         { ok: 20, warn: 10, fail: 0 },
    project_description: { ok: 10, warn: 5,  fail: 0 },
    connected_nodes:     { ok: 15, warn: 7,  fail: 0 },
    has_activities:      { ok: 10, warn: 5,  fail: 5 },
    has_people:          { ok: 5,  warn: 3,  fail: 3 },
    no_isolated:         { ok: 10, warn: 6,  fail: 0 },
    recent_updates:      { ok: 15, warn: 8,  fail: 8 },
    node_count:          { ok: 15, warn: 7,  fail: 0 },
  }

  let score = 0
  for (const check of checks) {
    const w = weights[check.key]
    if (w) score += w[check.status]
  }

  score = Math.max(0, Math.min(100, score))

  let grade: ContextHealthResult['grade']
  if (score >= 85) grade = 'excellent'
  else if (score >= 65) grade = 'good'
  else if (score >= 40) grade = 'fair'
  else grade = 'poor'

  return { score, grade, checks }
}
