// Google Identity Services — loaded via <script> tag in index.html
// Token is held IN MEMORY only, never persisted.

const CLIENT_ID_KEY = 'jarvis_google_client_id'
const USER_PROFILE_KEY = 'jarvis_user'

export interface GoogleUser {
  id: string
  email: string
  name: string
  avatar: string
  accessToken: string   // in memory only
  tokenExpiry: number
}

// ── In-memory token storage ────────────────────────────────────────────────
let _inMemoryToken: string | null = null
let _tokenExpiry: number = 0

declare global {
  interface Window {
    google: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            callback: (response: { access_token: string; expires_in: number; error?: string }) => void
          }): { requestAccessToken(): void }
          revoke(token: string, callback?: () => void): void
        }
        id: {
          initialize(config: object): void
        }
      }
    }
  }
}

// ── Client ID helpers ──────────────────────────────────────────────────────
export function getGoogleClientId(): string | null {
  try {
    return localStorage.getItem(CLIENT_ID_KEY) ?? null
  } catch {
    return null
  }
}

export function setGoogleClientId(clientId: string): void {
  try {
    localStorage.setItem(CLIENT_ID_KEY, clientId.trim())
  } catch { /* ignore */ }
}

// ── User profile storage (no token) ───────────────────────────────────────
export function getStoredUser(): Omit<GoogleUser, 'accessToken'> | null {
  try {
    const raw = localStorage.getItem(USER_PROFILE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Omit<GoogleUser, 'accessToken'>
  } catch {
    return null
  }
}

function storeUserProfile(user: Omit<GoogleUser, 'accessToken'>): void {
  try {
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(user))
  } catch { /* ignore */ }
}

function clearUserProfile(): void {
  try {
    localStorage.removeItem(USER_PROFILE_KEY)
  } catch { /* ignore */ }
}

// ── Token validity ──────────────────────────────────────────────────────────
export function isTokenValid(): boolean {
  return !!_inMemoryToken && Date.now() < _tokenExpiry
}

export function getInMemoryToken(): string | null {
  if (!isTokenValid()) return null
  return _inMemoryToken
}

// ── Fetch user info from Google ────────────────────────────────────────────
async function fetchUserInfo(accessToken: string): Promise<Omit<GoogleUser, 'accessToken' | 'tokenExpiry'>> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Failed to fetch user info: ${res.status}`)
  const data = await res.json() as { id: string; email: string; name: string; picture: string }
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    avatar: data.picture,
  }
}

// ── Sign in ─────────────────────────────────────────────────────────────────
export function signInWithGoogle(): Promise<GoogleUser> {
  return new Promise((resolve, reject) => {
    const clientId = getGoogleClientId()
    if (!clientId) {
      reject(new Error('Google Client ID not configured. Please set your OAuth 2.0 Client ID in the Sync settings.'))
      return
    }

    if (typeof window.google === 'undefined' || !window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services library not loaded. Please refresh the page.'))
      return
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'openid profile email https://www.googleapis.com/auth/drive.file',
      callback: async (response) => {
        if (response.error) {
          reject(new Error(`Google auth error: ${response.error}`))
          return
        }
        try {
          const token = response.access_token
          const expiry = Date.now() + (response.expires_in - 60) * 1000 // 1-min buffer

          // Store token in memory
          _inMemoryToken = token
          _tokenExpiry = expiry

          const profile = await fetchUserInfo(token)
          const user: GoogleUser = { ...profile, accessToken: token, tokenExpiry: expiry }

          // Persist profile (no token) to localStorage
          storeUserProfile({ id: user.id, email: user.email, name: user.name, avatar: user.avatar, tokenExpiry: expiry })

          resolve(user)
        } catch (err) {
          reject(err)
        }
      },
    })

    tokenClient.requestAccessToken()
  })
}

// ── Sign out ────────────────────────────────────────────────────────────────
export function signOut(): void {
  if (_inMemoryToken && typeof window.google !== 'undefined' && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(_inMemoryToken)
  }
  _inMemoryToken = null
  _tokenExpiry = 0
  clearUserProfile()
}
