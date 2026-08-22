import { openDB, type IDBPDatabase } from 'idb'
import type { BrainNode, BrainLink, BrainDB, ChatSession, KanbanColumn, JarvisProject, ProjectSnapshot } from '../types'

const DB_NAME    = 'jarvis-brain'
const DB_VERSION = 4

const DEFAULT_KANBAN_COLUMNS: KanbanColumn[] = [
  { id: 'backlog', title: 'Backlog', order: 0 },
  { id: 'in_progress', title: 'Em Progresso', order: 1 },
  { id: 'in_review', title: 'Em Revisão', order: 2 },
  { id: 'done', title: 'Concluído', order: 3 },
]

let db: IDBPDatabase | null = null

async function getDB() {
  if (db) return db
  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        db.createObjectStore('nodes', { keyPath: 'id' })
        db.createObjectStore('links', { keyPath: 'id' })
      }
      if (oldVersion < 2) {
        const store = db.createObjectStore('sessions', { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt')
      }
      if (oldVersion < 3) {
        db.createObjectStore('kanbanColumns', { keyPath: 'id' })
      }
      if (oldVersion < 4) {
        db.createObjectStore('projects', { keyPath: 'id' })
        db.createObjectStore('snapshots', { keyPath: 'id' })
        const nodesStore = tx.objectStore('nodes')
        nodesStore.createIndex('projectId', 'projectId')
      }
    },
  })
  return db
}

// ── Graph ─────────────────────────────────────────────────────────────────────

export async function loadBrain(): Promise<BrainDB> {
  try {
    const d = await getDB()
    const [nodes, links, kanbanColumns] = await Promise.all([
      d.getAll('nodes') as Promise<BrainNode[]>,
      d.getAll('links') as Promise<BrainLink[]>,
      d.getAll('kanbanColumns') as Promise<KanbanColumn[]>,
    ])
    return {
      nodes,
      links,
      kanbanColumns: kanbanColumns.length > 0 ? kanbanColumns : DEFAULT_KANBAN_COLUMNS,
    }
  } catch {
    return { nodes: [], links: [], kanbanColumns: DEFAULT_KANBAN_COLUMNS }
  }
}

export async function saveNode(node: BrainNode): Promise<void> {
  try { const d = await getDB(); await d.put('nodes', node) } catch {}
}

export async function saveLink(link: BrainLink): Promise<void> {
  try { const d = await getDB(); await d.put('links', link) } catch {}
}

export async function deleteNodeDB(id: string): Promise<void> {
  try { const d = await getDB(); await d.delete('nodes', id) } catch {}
}

export async function deleteLinkDB(id: string): Promise<void> {
  try { const d = await getDB(); await d.delete('links', id) } catch {}
}

export async function saveKanbanColumn(column: KanbanColumn): Promise<void> {
  try { const d = await getDB(); await d.put('kanbanColumns', column) } catch {}
}

export async function replaceKanbanColumns(columns: KanbanColumn[]): Promise<void> {
  try {
    const d = await getDB()
    const tx = d.transaction('kanbanColumns', 'readwrite')
    await tx.store.clear()
    for (const column of columns) {
      await tx.store.put(column)
    }
    await tx.done
  } catch {}
}

export async function clearDB(): Promise<void> {
  try {
    const d = await getDB()
    await Promise.all([d.clear('nodes'), d.clear('links'), d.clear('kanbanColumns')])
  } catch {}
}

export async function clearProjectsDB(): Promise<void> {
  try {
    const d = await getDB()
    await d.clear('projects')
  } catch {}
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function saveProject(project: JarvisProject): Promise<void> {
  try { const d = await getDB(); await d.put('projects', project) } catch {}
}

export async function loadProjects(): Promise<JarvisProject[]> {
  try {
    const d = await getDB()
    return d.getAll('projects') as Promise<JarvisProject[]>
  } catch {
    return []
  }
}

export async function deleteProject(id: string): Promise<void> {
  try { const d = await getDB(); await d.delete('projects', id) } catch {}
}

// ── Chat sessions ─────────────────────────────────────────────────────────────

export async function loadSessions(): Promise<ChatSession[]> {
  try {
    const d    = await getDB()
    const all  = await d.getAll('sessions') as ChatSession[]
    // Sort newest first
    return all.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

export async function saveSession(session: ChatSession): Promise<void> {
  try { const d = await getDB(); await d.put('sessions', session) } catch {}
}

export async function deleteSession(id: string): Promise<void> {
  try { const d = await getDB(); await d.delete('sessions', id) } catch {}
}

// ── Snapshots ─────────────────────────────────────────────────────────────────

export async function saveSnapshot(snapshot: ProjectSnapshot): Promise<void> {
  try { const d = await getDB(); await d.put('snapshots', snapshot) } catch {}
}

export async function loadSnapshots(projectId: string): Promise<ProjectSnapshot[]> {
  try {
    const d = await getDB()
    const all = await d.getAll('snapshots') as ProjectSnapshot[]
    return all
      .filter(s => s.projectId === projectId)
      .sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

export async function deleteSnapshot(id: string): Promise<void> {
  try { const d = await getDB(); await d.delete('snapshots', id) } catch {}
}
