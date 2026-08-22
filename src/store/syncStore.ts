import { create } from 'zustand'
import {
  signInWithGoogle,
  signOut as gSignOut,
  getStoredUser,
  isTokenValid,
  getInMemoryToken,
  type GoogleUser,
} from '../utils/googleAuth'
import {
  ensureJarvisFolder,
  ensureProjectFolder,
  uploadFile,
  downloadFile,
  listFiles,
} from '../utils/driveService'
import { useBrainStore } from './brainStore'
import { createSnapshot } from '../utils/snapshotService'
import type { BrainExportData } from '../types'

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'failed' | 'conflict' | 'offline'

interface SyncStore {
  user: Omit<GoogleUser, 'accessToken'> | null
  status: SyncStatus
  lastSyncAt: number | null
  error: string | null
  driveConnected: boolean

  // Setters
  setUser: (user: Omit<GoogleUser, 'accessToken'> | null) => void
  setStatus: (status: SyncStatus) => void
  setLastSync: (ts: number) => void
  setError: (err: string | null) => void

  // Auth
  connectGoogle: () => Promise<void>
  disconnectGoogle: () => void

  // Sync
  syncNow: (projectId: string) => Promise<void>
  loadFromDrive: (projectId: string) => Promise<void>
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  user: null,
  status: 'idle',
  lastSyncAt: null,
  error: null,
  driveConnected: false,

  setUser: (user) => set({ user }),
  setStatus: (status) => set({ status }),
  setLastSync: (ts) => set({ lastSyncAt: ts }),
  setError: (err) => set({ error: err }),

  connectGoogle: async () => {
    set({ status: 'syncing', error: null })
    try {
      const googleUser = await signInWithGoogle()
      const profile: Omit<GoogleUser, 'accessToken'> = {
        id: googleUser.id,
        email: googleUser.email,
        name: googleUser.name,
        avatar: googleUser.avatar,
        tokenExpiry: googleUser.tokenExpiry,
      }
      set({ user: profile, driveConnected: true, status: 'idle' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect Google'
      set({ status: 'failed', error: message })
      throw err
    }
  },

  disconnectGoogle: () => {
    gSignOut()
    set({ user: null, driveConnected: false, status: 'idle', error: null, lastSyncAt: null })
  },

  syncNow: async (projectId: string) => {
    const brain = useBrainStore.getState()

    // Check online
    if (!navigator.onLine) {
      set({ status: 'offline', error: 'No internet connection' })
      throw new Error('offline')
    }

    set({ status: 'syncing', error: null })

    try {
      // Ensure valid token
      let token = getInMemoryToken()
      if (!token || !isTokenValid()) {
        const freshUser = await signInWithGoogle()
        token = freshUser.accessToken
        const profile: Omit<GoogleUser, 'accessToken'> = {
          id: freshUser.id,
          email: freshUser.email,
          name: freshUser.name,
          avatar: freshUser.avatar,
          tokenExpiry: freshUser.tokenExpiry,
        }
        set({ user: profile, driveConnected: true })
      }

      // Ensure folder structure
      const jarvisId = await ensureJarvisFolder(token)
      const projectFolderId = await ensureProjectFolder(token, jarvisId, projectId)

      // Export and upload graph
      const exportData = brain.exportBrain()
      await uploadFile(token, projectFolderId, 'graph.json', exportData)

      // Create auto snapshot and upload
      const snapshot = await createSnapshot(projectId, 'Auto sync', 'auto')

      // Ensure snapshots subfolder
      const snapsFolderId = await ensureProjectFolder(token, projectFolderId, 'snapshots')
      await uploadFile(token, snapsFolderId, `snapshot-${snapshot.id}.json`, snapshot)

      const now = Date.now()
      set({ status: 'synced', lastSyncAt: now, error: null })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed'
      if (message === 'offline' || message.includes('offline')) {
        set({ status: 'offline', error: 'No internet connection' })
      } else {
        set({ status: 'failed', error: message })
      }
      throw err
    }
  },

  loadFromDrive: async (projectId: string) => {
    const brain = useBrainStore.getState()

    if (!navigator.onLine) {
      set({ status: 'offline', error: 'No internet connection' })
      throw new Error('offline')
    }

    set({ status: 'syncing', error: null })

    try {
      let token = getInMemoryToken()
      if (!token || !isTokenValid()) {
        const freshUser = await signInWithGoogle()
        token = freshUser.accessToken
        const profile: Omit<GoogleUser, 'accessToken'> = {
          id: freshUser.id,
          email: freshUser.email,
          name: freshUser.name,
          avatar: freshUser.avatar,
          tokenExpiry: freshUser.tokenExpiry,
        }
        set({ user: profile, driveConnected: true })
      }

      const jarvisId = await ensureJarvisFolder(token)
      const projectFolderId = await ensureProjectFolder(token, jarvisId, projectId)
      const files = await listFiles(token, projectFolderId)
      const graphFile = files.find(f => f.name === 'graph.json')

      if (!graphFile) {
        throw new Error('No graph.json found in Drive for this project')
      }

      const data = await downloadFile(token, graphFile.id) as BrainExportData
      await brain.importBrain(data, 'merge')

      set({ status: 'synced', lastSyncAt: Date.now(), error: null })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Load from Drive failed'
      set({ status: 'failed', error: message })
      throw err
    }
  },
}))

// Initialize from localStorage on module load
export function initSyncStore(): void {
  const stored = getStoredUser()
  if (stored) {
    useSyncStore.getState().setUser(stored)
    useSyncStore.getState().setStatus('idle')
    // driveConnected = true only if token was valid — we don't know yet
    // User will need to re-auth when they try to sync
  }
}
