// Google Drive REST API integration — direct fetch, no SDK needed.

export interface DriveFile {
  id: string
  name: string
  modifiedTime: string
}

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

function authHeader(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` }
}

// ── Search helpers ─────────────────────────────────────────────────────────
async function findFile(
  accessToken: string,
  query: string,
): Promise<DriveFile | null> {
  const params = new URLSearchParams({
    q: query,
    fields: 'files(id,name,modifiedTime)',
    spaces: 'drive',
    pageSize: '1',
  })
  const res = await fetch(`${DRIVE_API}/files?${params}`, {
    headers: authHeader(accessToken),
  })
  if (!res.ok) throw new Error(`Drive search failed: ${res.status}`)
  const data = await res.json() as { files: DriveFile[] }
  return data.files[0] ?? null
}

// ── Folder management ──────────────────────────────────────────────────────
export async function ensureJarvisFolder(accessToken: string): Promise<string> {
  const existing = await findFile(
    accessToken,
    `mimeType='application/vnd.google-apps.folder' and name='JARVIS' and 'root' in parents and trashed=false`,
  )
  if (existing) return existing.id

  const res = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: {
      ...authHeader(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'JARVIS',
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['root'],
    }),
  })
  if (!res.ok) throw new Error(`Failed to create JARVIS folder: ${res.status}`)
  const folder = await res.json() as DriveFile
  return folder.id
}

export async function ensureProjectFolder(
  accessToken: string,
  jarvisFolderId: string,
  projectId: string,
): Promise<string> {
  const safeName = projectId.replace(/[^a-zA-Z0-9_-]/g, '_')
  const existing = await findFile(
    accessToken,
    `mimeType='application/vnd.google-apps.folder' and name='${safeName}' and '${jarvisFolderId}' in parents and trashed=false`,
  )
  if (existing) return existing.id

  const res = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: {
      ...authHeader(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: safeName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [jarvisFolderId],
    }),
  })
  if (!res.ok) throw new Error(`Failed to create project folder: ${res.status}`)
  const folder = await res.json() as DriveFile
  return folder.id
}

// ── File upload (create or update) ────────────────────────────────────────
export async function uploadFile(
  accessToken: string,
  folderId: string,
  filename: string,
  content: object,
): Promise<DriveFile> {
  const jsonBody = JSON.stringify(content, null, 2)
  const blob = new Blob([jsonBody], { type: 'application/json' })

  // Check if file already exists
  const existing = await findFile(
    accessToken,
    `name='${filename}' and '${folderId}' in parents and trashed=false`,
  )

  if (existing) {
    // Update existing file (PATCH media)
    const res = await fetch(`${UPLOAD_API}/files/${existing.id}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        ...authHeader(accessToken),
        'Content-Type': 'application/json',
      },
      body: blob,
    })
    if (!res.ok) throw new Error(`Failed to update file: ${res.status}`)
    return res.json() as Promise<DriveFile>
  }

  // Create new file via multipart upload
  const metadata = JSON.stringify({ name: filename, parents: [folderId] })
  const boundary = 'jarvis_boundary_xyz'
  const multipart = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    metadata,
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
    jsonBody,
    `\r\n--${boundary}--`,
  ].join('')

  const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart`, {
    method: 'POST',
    headers: {
      ...authHeader(accessToken),
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipart,
  })
  if (!res.ok) throw new Error(`Failed to create file: ${res.status}`)
  return res.json() as Promise<DriveFile>
}

// ── File download ──────────────────────────────────────────────────────────
export async function downloadFile(accessToken: string, fileId: string): Promise<object> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: authHeader(accessToken),
  })
  if (!res.ok) throw new Error(`Failed to download file: ${res.status}`)
  return res.json() as Promise<object>
}

// ── List files in folder ───────────────────────────────────────────────────
export async function listFiles(accessToken: string, folderId: string): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id,name,modifiedTime)',
    orderBy: 'modifiedTime desc',
  })
  const res = await fetch(`${DRIVE_API}/files?${params}`, {
    headers: authHeader(accessToken),
  })
  if (!res.ok) throw new Error(`Failed to list files: ${res.status}`)
  const data = await res.json() as { files: DriveFile[] }
  return data.files
}

// ── Delete a file ──────────────────────────────────────────────────────────
export async function deleteFile(accessToken: string, fileId: string): Promise<void> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
    method: 'DELETE',
    headers: authHeader(accessToken),
  })
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to delete file: ${res.status}`)
  }
}
