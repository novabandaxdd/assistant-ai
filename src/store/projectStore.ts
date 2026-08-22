import { create } from 'zustand'
import type { JarvisProject } from '../types'
import { loadProjects, saveProject, deleteProject, clearProjectsDB } from './db'

interface ProjectStore {
  projects: JarvisProject[]
  activeProjectId: string | null
  initialized: boolean

  init: () => Promise<void>
  createProject: (partial: Omit<JarvisProject, 'id' | 'createdAt' | 'updatedAt'>) => Promise<JarvisProject>
  updateProject: (id: string, updates: Partial<JarvisProject>) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  setActiveProject: (id: string | null) => void
  getActiveProject: () => JarvisProject | undefined
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  activeProjectId: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return
    let projects = await loadProjects()

    // Known mock project names seeded in older versions — wipe and start fresh
    const MOCK_NAMES = new Set(['Projeto Alpha', 'Projeto Beta', 'Projeto Gamma', 'Cuida — Taxi-BV App', 'Meu Projeto'])
    const isMockOnly = projects.length > 0 && projects.every(p => MOCK_NAMES.has(p.name))
    if (isMockOnly) {
      await clearProjectsDB()
      projects = []
    }

    if (projects.length === 0) {
      const now = Date.now()
      const defaultProject: JarvisProject = {
        id: `proj-${now}-${Math.random().toString(36).slice(2, 7)}`,
        name: 'Meu Projeto',
        type: 'software',
        status: 'active',
        color: '#f59e0b',
        createdAt: now,
        updatedAt: now,
      }
      await saveProject(defaultProject)
      projects = [defaultProject]
    }

    set({
      projects,
      activeProjectId: projects[0].id,
      initialized: true,
    })
  },

  createProject: async (partial) => {
    const now = Date.now()
    const project: JarvisProject = {
      ...partial,
      id: `proj-${now}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: now,
      updatedAt: now,
    }
    await saveProject(project)
    set(state => ({ projects: [...state.projects, project] }))
    return project
  },

  updateProject: async (id, updates) => {
    const project = get().projects.find(p => p.id === id)
    if (!project) return
    const updated: JarvisProject = { ...project, ...updates, updatedAt: Date.now() }
    await saveProject(updated)
    set(state => ({ projects: state.projects.map(p => p.id === id ? updated : p) }))
  },

  deleteProject: async (id) => {
    await deleteProject(id)
    set(state => {
      const projects = state.projects.filter(p => p.id !== id)
      const activeProjectId = state.activeProjectId === id
        ? (projects[0]?.id ?? null)
        : state.activeProjectId
      return { projects, activeProjectId }
    })
  },

  setActiveProject: (id) => set({ activeProjectId: id }),

  getActiveProject: () => {
    const { projects, activeProjectId } = get()
    return projects.find(p => p.id === activeProjectId)
  },
}))
