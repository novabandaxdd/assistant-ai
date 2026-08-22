// Preload script — runs in a privileged context before the renderer page loads.
// Expose only what the renderer actually needs via contextBridge.
// Currently JARVIS needs nothing beyond the standard browser APIs, so this
// file is intentionally minimal.
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
})
