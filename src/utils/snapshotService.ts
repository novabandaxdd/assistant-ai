import type { ProjectSnapshot } from '../types'
import { useBrainStore } from '../store/brainStore'
import { useProjectStore } from '../store/projectStore'
import { saveSnapshot, loadSnapshots, deleteSnapshot } from '../store/db'

export { loadSnapshots, deleteSnapshot }

export async function createSnapshot(
  projectId: string,
  label: string,
  source: 'auto' | 'manual',
): Promise<ProjectSnapshot> {
  const brain = useBrainStore.getState()
  const projectNodes = brain.nodes.filter(n => n.projectId === projectId)

  // Collect node IDs in the project subgraph for link filtering
  const nodeIds = new Set(projectNodes.map(n => n.id))
  const projectLinks = brain.links.filter(link => {
    const src = typeof link.source === 'string' ? link.source : link.source.id
    const tgt = typeof link.target === 'string' ? link.target : link.target.id
    return nodeIds.has(src) || nodeIds.has(tgt)
  })

  const snapshot: ProjectSnapshot = {
    id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    projectId,
    createdAt: Date.now(),
    label,
    source,
    nodeCount: projectNodes.length,
    linkCount: projectLinks.length,
    content: {
      nodes: projectNodes,
      links: projectLinks,
      sessions: brain.sessions,
      kanbanColumns: brain.kanbanColumns,
    },
  }

  await saveSnapshot(snapshot)
  return snapshot
}

export async function listSnapshots(projectId: string): Promise<ProjectSnapshot[]> {
  return loadSnapshots(projectId)
}

export async function restoreSnapshot(snapshot: ProjectSnapshot): Promise<void> {
  const brain = useBrainStore.getState()
  await brain.importBrain(
    {
      meta: {
        version: 1,
        exportedAt: new Date(snapshot.createdAt).toISOString(),
        nodeCount: snapshot.nodeCount,
        linkCount: snapshot.linkCount,
        sessionCount: snapshot.content.sessions.length,
      },
      nodes: snapshot.content.nodes,
      links: snapshot.content.links,
      sessions: snapshot.content.sessions,
      kanbanColumns: snapshot.content.kanbanColumns,
    },
    'merge',
  )
}

export async function getLatestSnapshot(projectId: string): Promise<ProjectSnapshot | null> {
  const snaps = await loadSnapshots(projectId)
  return snaps[0] ?? null
}

// Re-export useProjectStore so consumers can get activeProjectId
export { useProjectStore }
