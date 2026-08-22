import { app, BrowserWindow, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// dist-electron/main.js → project root is two levels up
const ROOT = path.join(__dirname, '..')
const DIST = path.join(ROOT, 'dist')

process.env.DIST = DIST
process.env.VITE_PUBLIC = app.isPackaged
  ? DIST
  : path.join(ROOT, 'public')

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    width:  1400,
    height: 900,
    minWidth:  900,
    minHeight: 600,
    title: 'J.A.R.V.I.S. Brain',
    backgroundColor: '#080c14',
    // Remove default frame for a cleaner look; we keep it simple with default for now
    // so the user has native OS controls (close/minimize/maximize)
    webPreferences: {
      preload:          path.join(__dirname, 'preload.mjs'),
      nodeIntegration:  false,
      contextIsolation: true,
      // Allow IndexedDB and localStorage — both used by JARVIS
      sandbox: false,
    },
  })

  // Open external links in the system browser, not inside Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    // Dev: load Vite dev server
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    // Prod: load built index.html
    win.loadFile(path.join(DIST, 'index.html'))
  }

  win.on('closed', () => { win = null })
}

app.on('window-all-closed', () => {
  // On macOS it's conventional to keep the app running even with no windows
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  // macOS: re-create window when dock icon is clicked
  if (win === null) createWindow()
})

app.whenReady().then(createWindow)
