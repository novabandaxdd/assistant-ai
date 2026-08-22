import { useState, useEffect } from 'react'
import { useSyncStore } from '../../store/syncStore'
import { useProjectStore } from '../../store/projectStore'
import { getGoogleClientId, setGoogleClientId } from '../../utils/googleAuth'
import styles from './SyncPanel.module.css'

const STATUS_LABELS: Record<string, string> = {
  idle:     'Não sincronizado',
  syncing:  'Sincronizando…',
  synced:   'Sincronizado',
  failed:   'Falha na sincronização',
  conflict: 'Conflito detectado',
  offline:  'Offline',
}

const STATUS_DOT: Record<string, string> = {
  idle:     styles.statusIdle,
  syncing:  styles.statusSyncing,
  synced:   styles.statusSynced,
  failed:   styles.statusFailed,
  conflict: styles.statusConflict,
  offline:  styles.statusOffline,
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function SyncPanel({ open, onClose }: Props) {
  const user = useSyncStore(s => s.user)
  const status = useSyncStore(s => s.status)
  const lastSyncAt = useSyncStore(s => s.lastSyncAt)
  const error = useSyncStore(s => s.error)
  const connectGoogle = useSyncStore(s => s.connectGoogle)
  const disconnectGoogle = useSyncStore(s => s.disconnectGoogle)
  const syncNow = useSyncStore(s => s.syncNow)
  const loadFromDrive = useSyncStore(s => s.loadFromDrive)

  const activeProjectId = useProjectStore(s => s.activeProjectId)

  const [clientId, setClientId] = useState(getGoogleClientId() ?? '')
  const [saved, setSaved] = useState(false)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    if (open) {
      setClientId(getGoogleClientId() ?? '')
      setSaved(false)
    }
  }, [open])

  if (!open) return null

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  function handleSaveClientId() {
    setGoogleClientId(clientId)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleConnect() {
    if (working) return
    setWorking(true)
    try {
      await connectGoogle()
    } catch { /* error shown in store */ } finally {
      setWorking(false)
    }
  }

  async function handleSyncNow() {
    if (!activeProjectId || working) return
    setWorking(true)
    try {
      await syncNow(activeProjectId)
    } catch { /* error shown in store */ } finally {
      setWorking(false)
    }
  }

  async function handleLoadFromDrive() {
    if (!activeProjectId || working) return
    setWorking(true)
    try {
      await loadFromDrive(activeProjectId)
    } catch { /* error shown in store */ } finally {
      setWorking(false)
    }
  }

  function formatLastSync(): string {
    if (!lastSyncAt) return '—'
    const d = new Date(lastSyncAt)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) {
      return `Hoje, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    }
    return d.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const isBusy = status === 'syncing' || working

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.panel}>
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className={styles.header}>
          <span className={styles.title}>Sincronização Google Drive</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.divider} />

        {/* ── User / Connect ───────────────────────────────────────────────── */}
        {user ? (
          <div className={styles.userCard}>
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} className={styles.avatar} />
            ) : (
              <div className={styles.avatarPlaceholder}>👤</div>
            )}
            <div className={styles.userInfo}>
              <div className={styles.userName}>{user.name}</div>
              <div className={styles.userEmail}>{user.email}</div>
            </div>
            <button className={styles.disconnectBtn} onClick={disconnectGoogle}>
              Desconectar
            </button>
          </div>
        ) : (
          <button
            className={styles.connectBtn}
            onClick={handleConnect}
            disabled={isBusy || !getGoogleClientId()}
            title={!getGoogleClientId() ? 'Configure seu Google Client ID primeiro' : 'Conectar Google Drive'}
          >
            {isBusy ? '…' : '▶ Conectar Google Drive'}
          </button>
        )}

        {/* ── Status ──────────────────────────────────────────────────────── */}
        <div className={styles.statusRow}>
          <span className={`${styles.statusDot} ${STATUS_DOT[status] ?? styles.statusIdle}`} />
          <span className={styles.statusLabel}>{STATUS_LABELS[status] ?? status}</span>
          <span className={styles.lastSync}>Último sync: {formatLastSync()}</span>
        </div>

        {error && (
          <div className={styles.errorBox}>{error}</div>
        )}

        {/* ── Sync actions ─────────────────────────────────────────────────── */}
        {user && (
          <div className={styles.actionRow}>
            <button
              className={styles.btn}
              onClick={handleSyncNow}
              disabled={isBusy}
              title="Enviar projeto atual para o Drive"
            >
              {isBusy ? '…' : '↑ Sincronizar Agora'}
            </button>
            <button
              className={styles.btn}
              onClick={handleLoadFromDrive}
              disabled={isBusy}
              title="Baixar e mesclar projeto do Drive"
            >
              ↓ Carregar do Drive
            </button>
          </div>
        )}

        <div className={styles.divider} />

        {/* ── Client ID setup ──────────────────────────────────────────────── */}
        <div className={styles.clientIdSection}>
          <div className={styles.sectionTitle}>Google Client ID (obrigatório)</div>
          <div className={styles.clientIdRow}>
            <input
              className={styles.clientIdInput}
              type="text"
              value={clientId}
              onChange={e => { setClientId(e.target.value); setSaved(false) }}
              placeholder="Cole seu OAuth 2.0 Client ID aqui"
              spellCheck={false}
            />
            <button className={styles.saveBtn} onClick={handleSaveClientId}>
              Salvar
            </button>
          </div>
          {saved && <span className={styles.savedNote}>✓ Salvo</span>}
          <p className={styles.infoNote}>
            Para usar a sincronização com o Google Drive, crie um{' '}
            <a
              href="https://console.cloud.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.infoLink}
            >
              projeto no Google Cloud
            </a>
            {' '}com um OAuth 2.0 web client ID.
            Ative a <strong>Drive API</strong> e adicione a origem do seu app às
            origens JavaScript autorizadas. O token de acesso é armazenado apenas em memória
            e nunca é persistido.
          </p>
        </div>
      </div>
    </div>
  )
}
