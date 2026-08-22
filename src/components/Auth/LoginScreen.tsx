import { useState } from 'react'
import { useSyncStore } from '../../store/syncStore'
import { getGoogleClientId, setGoogleClientId } from '../../utils/googleAuth'
import styles from './LoginScreen.module.css'

interface LoginScreenProps {
  onLogin: () => void
  onSkip: () => void   // continue without Google (local-only mode)
}

// ── Inline setup guide ────────────────────────────────────────────────────────
function SetupGuide({ onDone }: { onDone: (clientId: string) => void }) {
  const [clientId, setClientId] = useState('')
  const [saving,   setSaving]   = useState(false)

  function handleSave() {
    const trimmed = clientId.trim()
    if (!trimmed) return
    setSaving(true)
    setGoogleClientId(trimmed)
    setTimeout(() => {
      setSaving(false)
      onDone(trimmed)
    }, 400)
  }

  return (
    <div className={styles.setupGuide}>
      <div className={styles.setupTitle}>Configuração única necessária</div>
      <p className={styles.setupDesc}>
        Configuração única — feita uma vez por quem instala o JARVIS. Siga os 5 passos abaixo.
      </p>

      <ol className={styles.setupSteps}>
        <li>
          Acesse{' '}
          <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className={styles.setupLink}>
            console.cloud.google.com
          </a>
          {' '}→ crie ou selecione um projeto.
        </li>
        <li>
          No menu lateral: <strong>APIs e Serviços → Biblioteca</strong>.
          Busque <strong>"Google Drive API"</strong> e clique em <strong>Ativar</strong>.
        </li>
        <li>
          Vá em <strong>APIs e Serviços → Credenciais</strong> → <strong>Criar Credenciais → OAuth 2.0 Client ID</strong>.<br />
          Tipo: <strong>Aplicativo da Web</strong>. Em <strong>Origens JavaScript autorizadas</strong> adicione a URL do app
          (ex: <code>http://localhost:5173</code> para dev).
        </li>
        <li>
          Vá em <strong>Público-alvo</strong> (ou "Tela de permissão OAuth") → clique em <strong>Publicar app</strong> → confirme.
          Isso permite que qualquer conta Google faça login sem precisar de aprovação individual.
        </li>
        <li>
          Volte em <strong>Credenciais</strong>, copie o <strong>Client ID</strong> gerado e cole abaixo.
        </li>
      </ol>

      <div className={styles.setupNote}>
        ℹ️ O JARVIS solicita acesso apenas aos arquivos <em>que ele cria</em> no seu Drive — não ao Drive inteiro.
        O token OAuth fica apenas em memória e é apagado ao fechar a aba.
      </div>

      <div className={styles.setupInputRow}>
        <input
          className={styles.setupInput}
          type="text"
          placeholder="Cole seu OAuth 2.0 Client ID aqui…"
          value={clientId}
          onChange={e => setClientId(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && clientId.trim()) handleSave() }}
          autoFocus
          spellCheck={false}
        />
        <button
          className={styles.setupSaveBtn}
          onClick={handleSave}
          disabled={!clientId.trim() || saving}
        >
          {saving ? '…' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}

// ── Main login screen ─────────────────────────────────────────────────────────
export default function LoginScreen({ onLogin, onSkip }: LoginScreenProps) {
  const connectGoogle = useSyncStore(s => s.connectGoogle)

  const [phase,      setPhase]      = useState<'main' | 'setup' | 'connecting' | 'error'>('main')
  const [errorMsg,   setErrorMsg]   = useState('')
  const [showSetup,  setShowSetup]  = useState(!getGoogleClientId())

  async function handleGoogleLogin() {
    setPhase('connecting')
    setErrorMsg('')
    try {
      await connectGoogle()
      onLogin()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed'
      setErrorMsg(msg)
      setPhase('error')
    }
  }

  function handleSetupDone(_clientId: string) {
    setShowSetup(false)
    setPhase('main')
  }

  const hasClientId = !!getGoogleClientId()

  return (
    <div className={styles.root}>
      {/* Scanline texture */}
      <div className={styles.scanlines} aria-hidden />

      <div className={styles.card}>
        {/* ── Logo ── */}
        <div className={styles.logoArea}>
          <div className={styles.logoRing} aria-hidden>
            <svg viewBox="0 0 80 80" fill="none" className={styles.logoSvg}>
              <circle cx="40" cy="40" r="36" stroke="#00e5ff" strokeWidth="1.5" strokeOpacity="0.4" strokeDasharray="12 6" />
              <circle cx="40" cy="40" r="28" stroke="#00e5ff" strokeWidth="1" strokeOpacity="0.25" strokeDasharray="5 4" />
              <circle cx="40" cy="40" r="16" stroke="#00e5ff" strokeWidth="1.5" strokeOpacity="0.5" />
              <circle cx="40" cy="40" r="6" fill="rgba(0,229,255,0.2)" stroke="#00e5ff" strokeWidth="1.5" />
            </svg>
          </div>
          <div className={styles.logoText}>J.A.R.V.I.S.</div>
          <div className={styles.logoSub}>Project Intelligence Hub</div>
        </div>

        {/* ── Setup guide (if no Client ID yet) ── */}
        {showSetup && (
          <SetupGuide onDone={handleSetupDone} />
        )}

        {/* ── Main login buttons ── */}
        {!showSetup && (
          <div className={styles.loginArea}>
            {phase === 'connecting' ? (
              <div className={styles.connectingState}>
                <div className={styles.connectingSpinner} aria-hidden />
                <span>Conectando ao Google…</span>
              </div>
            ) : (
              <>
                {phase === 'error' && (
                  <div className={styles.errorBox}>{errorMsg}</div>
                )}

                {hasClientId ? (
                  <button
                    className={styles.googleBtn}
                    onClick={() => void handleGoogleLogin()}
                  >
                    <GoogleIcon />
                    Continuar com Google
                  </button>
                ) : (
                  <button
                    className={styles.googleBtnDisabled}
                    onClick={() => setShowSetup(true)}
                  >
                    <GoogleIcon />
                    Continuar com Google
                    <span className={styles.setupNeeded}>Configuração necessária →</span>
                  </button>
                )}

                <button className={styles.skipBtn} onClick={onSkip}>
                  Continuar sem Google
                  <span className={styles.skipNote}>Dados armazenados apenas localmente</span>
                </button>

                {hasClientId && (
                  <button
                    className={styles.reconfigureLink}
                    onClick={() => setShowSetup(true)}
                  >
                    Reconfigurar Client ID
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Footer ── */}
        <div className={styles.footer}>
          O Google Sign-in sincroniza seus projetos com <strong>o seu próprio Google Drive</strong>.
          O JARVIS nunca armazena seus dados em servidores externos.
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.googleIcon} aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
