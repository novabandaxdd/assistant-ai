import { useState, useEffect } from 'react'
import {
  loadAIConfig, saveAIConfig, clearAIConfig, askAI, KNOWN_BASE_URLS,
  type AIProvider, type AIConfig, type TTSProvider,
} from '../../utils/aiService'
import styles from './SettingsPanel.module.css'

interface Props {
  open: boolean
  onClose: () => void
}

// ── Provider metadata ──────────────────────────────────────────────────────
interface ProviderMeta {
  label:       string
  description: string
  badge?:      string
  badgeColor?: string
  needsUrl:    boolean
  keyPlaceholder: string
  defaultUrl?: string
  models:      string[]
  docsUrl?:    string
}

const PROVIDERS: Record<AIProvider, ProviderMeta> = {
  gemini: {
    label:          'Google Gemini',
    description:    'API gratuita · Gemini 2.0 Flash · 1M context',
    badge:          '✦ Gratuito',
    badgeColor:     '#059669',
    needsUrl:       false,
    keyPlaceholder: 'AIzaSy...',
    models:         ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-flash-latest'],
    docsUrl:        'https://aistudio.google.com/apikey',
  },
  openai: {
    label:          'OpenAI',
    description:    'Native OpenAI API · GPT-4o / GPT-4o mini',
    needsUrl:       false,
    keyPlaceholder: 'sk-...',
    models:         ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    docsUrl:        'https://platform.openai.com/api-keys',
  },
  claude: {
    label:          'Claude (Anthropic)',
    description:    'Native Anthropic API · Melhor qualidade',
    badge:          'Top Quality',
    badgeColor:     '#d97706',
    needsUrl:       false,
    keyPlaceholder: 'sk-ant-api03-...',
    models:         ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
    docsUrl:        'https://console.anthropic.com/keys',
  },
  roo: {
    label:          'Roo Code / IBM Bob',
    description:    'OpenAI-compatible · Claude Sonnet 4.6 via IBM proxy · 200k context',
    needsUrl:       true,
    keyPlaceholder: '7:xxx:96ca8495-...',
    defaultUrl:     KNOWN_BASE_URLS.roo,
    models:         [
      'global/anthropic.claude-sonnet-4-6',
      'global/anthropic.claude-sonnet-4-5-2025...',
      'global/anthropic.claude-haiku-4-5-2025...',
      'global/openai.gpt-4o',
      'global/gpt-5.1-chat',
      'global/gpt-5.4-gus',
      'global/gemini-3-flash-preview',
      'global/groq/compound',
      'global/ibm/granite-4-h-small',
    ],
    docsUrl:        'https://roocode.com',
  },
  cline: {
    label:          'Cline',
    description:    'OpenAI-compatible · Custom base URL',
    needsUrl:       true,
    keyPlaceholder: 'sk-...',
    defaultUrl:     KNOWN_BASE_URLS.cline,
    models:         ['gpt-4o', 'gpt-4o-mini', 'claude-opus-4-5'],
  },
  'openai-compat': {
    label:          'OpenAI-Compatible',
    description:    'Any custom OpenAI-compatible endpoint',
    needsUrl:       true,
    keyPlaceholder: 'your-api-key',
    models:         ['gpt-4o', 'llama-3-70b', 'mistral-large'],
  },
  local: {
    label:          'Local NLP',
    description:    'Built-in engine · No key · Works offline',
    needsUrl:       false,
    keyPlaceholder: '',
    models:         ['local-nlp'],
  },
}

const PROVIDER_ORDER: AIProvider[] = ['gemini', 'openai', 'claude', 'roo', 'cline', 'openai-compat', 'local']

// ── Component ──────────────────────────────────────────────────────────────
const TTS_VOICES = [
  { value: 'onyx',    label: 'Onyx — voz grave e autoritária (recomendada)' },
  { value: 'echo',    label: 'Echo — voz masculina clara' },
  { value: 'fable',   label: 'Fable — voz masculina narrativa' },
  { value: 'alloy',   label: 'Alloy — voz neutra' },
  { value: 'nova',    label: 'Nova — voz feminina' },
  { value: 'shimmer', label: 'Shimmer — voz feminina suave' },
]

export default function SettingsPanel({ open, onClose }: Props) {
  const [provider, setProvider] = useState<AIProvider>('gemini')
  const [apiKey,   setApiKey]   = useState('')
  const [baseUrl,  setBaseUrl]  = useState('')
  const [model,    setModel]    = useState('')
  const [maxTok,   setMaxTok]   = useState('')
  const [status,   setStatus]   = useState<'idle'|'saved'|'cleared'|'testing'|'ok'|'error'>('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [showKey,   setShowKey]   = useState(false)
  // TTS
  const [ttsProvider, setTtsProvider] = useState<TTSProvider>('browser')
  const [ttsApiKey,   setTtsApiKey]   = useState('')
  const [ttsVoice,    setTtsVoice]    = useState('onyx')
  const [showTtsKey,  setShowTtsKey]  = useState(false)

  // Load on open
  useEffect(() => {
    if (!open) return
    const cfg = loadAIConfig()
    if (cfg) {
      setProvider(cfg.provider)
      setApiKey(cfg.apiKey ?? '')
      setBaseUrl(cfg.baseUrl ?? PROVIDERS[cfg.provider].defaultUrl ?? '')
      setModel(cfg.model ?? '')
      setMaxTok(cfg.maxTokens ? String(cfg.maxTokens) : '')
      setTtsProvider(cfg.ttsProvider ?? 'browser')
      setTtsApiKey(cfg.ttsApiKey ?? (cfg.provider === 'openai' ? cfg.apiKey : ''))
      setTtsVoice(cfg.ttsVoice ?? 'onyx')
    } else {
      // Default to Gemini (free tier)
      setProvider('gemini')
      setBaseUrl('')
    }
    setStatus('idle')
    setStatusMsg('')
    setShowKey(false)
  }, [open])

  // When switching provider, update default URL
  const handleProviderChange = (p: AIProvider) => {
    setProvider(p)
    setModel('')
    setBaseUrl(PROVIDERS[p].defaultUrl ?? '')
    setStatus('idle')
  }

  const handleSave = () => {
    if (provider === 'local') {
      clearAIConfig()
      setStatus('cleared')
      setStatusMsg('')
      window.dispatchEvent(new Event('jarvis:config-changed'))
      return
    }
    if (!apiKey.trim()) {
      setStatus('error')
      setStatusMsg('API key is required.')
      return
    }
    if (PROVIDERS[provider].needsUrl && !baseUrl.trim()) {
      setStatus('error')
      setStatusMsg('Base URL is required for this provider.')
      return
    }
    const cfg: AIConfig = {
      provider,
      apiKey:      apiKey.trim(),
      baseUrl:     PROVIDERS[provider].needsUrl ? baseUrl.trim() : undefined,
      model:       model || undefined,
      maxTokens:   maxTok ? parseInt(maxTok) : undefined,
      ttsProvider: ttsProvider,
      ttsApiKey:   ttsProvider === 'openai-tts' && ttsApiKey.trim() ? ttsApiKey.trim() : undefined,
      ttsVoice:    ttsProvider === 'openai-tts' ? ttsVoice : undefined,
    }
    saveAIConfig(cfg)
    setStatus('saved')
    setStatusMsg('')
    window.dispatchEvent(new Event('jarvis:config-changed'))
  }

  const handleTest = async () => {
    if (!apiKey.trim()) return
    setStatus('testing')
    setStatusMsg('')
    try {
      const testCfg: AIConfig = {
        provider,
        apiKey:    apiKey.trim(),
        baseUrl:   PROVIDERS[provider].needsUrl ? baseUrl.trim() : undefined,
        model:     model || undefined,
        // claude-sonnet-4-6 has extended thinking with min budget_tokens=1024,
        // so max_tokens must be > 1024. Use 2048 for the test call.
        maxTokens: provider === 'roo' ? 2048 : 256,
      }
      const res = await askAI('Reply with exactly: "JARVIS online, Sir." Nothing else.', '', testCfg)
      setStatus('ok')
      setStatusMsg(res.text)
    } catch (e) {
      setStatus('error')
      setStatusMsg(e instanceof Error ? e.message : 'Connection failed.')
    }
  }

  const handleClear = () => {
    if (!confirm('Apagar todas as configurações salvas, incluindo chaves de API?')) return
    clearAIConfig()
    setApiKey(''); setBaseUrl(''); setModel(''); setMaxTok('')
    setProvider('gemini')
    setBaseUrl('')
    setStatus('cleared')
    setStatusMsg('')
    window.dispatchEvent(new Event('jarvis:config-changed'))
  }

  if (!open) return null

  const meta = PROVIDERS[provider]

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.panel}>

        {/* ── Header */}
        <div className={styles.header}>
          <div className={styles.title}>
            <span className={styles.titleIcon}>⚙</span>
            <span>JARVIS — Configuração de IA</span>
          </div>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>

          {/* ── Persistence note */}
          <div className={styles.infoBanner}>
            <span className={styles.infoIcon}>💾</span>
            <span>
              Configurações salvas em <strong>localStorage</strong> — persistem entre sessões, fechamento de aba e reinício do servidor.
              {' '}Armazenadas apenas neste dispositivo. Use <em>Esquecer</em> para apagar tudo.
            </span>
          </div>

          {/* ── Provider selector */}
          <div className={styles.field}>
            <label className={styles.label}>Provedor</label>
            <div className={styles.providerGrid}>
              {PROVIDER_ORDER.map(p => {
                const m = PROVIDERS[p]
                return (
                  <button
                    key={p}
                    className={`${styles.providerBtn} ${provider === p ? styles.providerActive : ''}`}
                    onClick={() => handleProviderChange(p)}
                  >
                    {m.badge && (
                      <span className={styles.badge} style={{ background: m.badgeColor ?? '#555' }}>
                        {m.badge}
                      </span>
                    )}
                    <span className={styles.providerName}>{m.label}</span>
                    <span className={styles.providerDesc}>{m.description}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Fields for non-local providers */}
          {provider !== 'local' && (
            <>
              {/* Base URL (for OpenAI-compat providers) */}
              {meta.needsUrl && (
                <div className={styles.field}>
                  <label className={styles.label}>
                    Base URL
                    {provider === 'roo' && (
                      <span className={styles.preset}>proxy IBM pré-configurado</span>
                    )}
                  </label>
                  <input
                    className={styles.input}
                    type="url"
                    placeholder="https://your-endpoint/v1"
                    value={baseUrl}
                    onChange={e => setBaseUrl(e.target.value)}
                    autoComplete="off"
                  />
                  {provider === 'roo' && baseUrl.startsWith('/api/') ? (
                    <div className={`${styles.hint} ${styles.hintGood}`}>
                      ✅ Usando proxy dev Vite (<code>/api/roo</code>) — CORS ignorado automaticamente.
                    </div>
                  ) : (
                    <div className={styles.hint}>
                      O endpoint deve aceitar <code>POST /chat/completions</code>
                    </div>
                  )}
                </div>
              )}

              {/* API Key */}
              <div className={styles.field}>
                <label className={styles.label}>
                  Chave de API
                  {meta.docsUrl && (
                    <a href={meta.docsUrl} target="_blank" rel="noopener noreferrer" className={styles.getKey}>
                      Obter chave ↗
                    </a>
                  )}
                </label>
                <div className={styles.keyWrap}>
                  <input
                    className={styles.input}
                    type={showKey ? 'text' : 'password'}
                    placeholder={meta.keyPlaceholder}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    autoComplete="off"
                  />
                  <button className={styles.eyeBtn} onClick={() => setShowKey(s => !s)}>
                    {showKey ? '🙈' : '👁'}
                  </button>
                </div>
                {provider === 'roo' && (
                  <div className={styles.hint}>Format: <code>7:xxx:&lt;uuid&gt;:&lt;uuid&gt;:&lt;uuid&gt;</code></div>
                )}
              </div>

              {/* Model */}
              <div className={styles.twoCol}>
                <div className={styles.field}>
                  <label className={styles.label}>Modelo</label>
                  <select
                    className={styles.select}
                    value={model}
                    onChange={e => setModel(e.target.value)}
                  >
                    <option value="">Padrão ({meta.models[0]})</option>
                    {meta.models.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>
                    Máx. tokens
                    {provider === 'roo' && <span className={styles.optional}> (até 150k)</span>}
                  </label>
                  <input
                    className={styles.input}
                    type="number"
                    placeholder={provider === 'roo' ? '4096' : '1024'}
                    value={maxTok}
                    onChange={e => setMaxTok(e.target.value)}
                    min={64}
                    max={200000}
                    step={512}
                  />
                </div>
              </div>
            </>
          )}

          {/* ── Local NLP description */}
          {provider === 'local' && (
            <div className={styles.localNote}>
              <strong>Motor NLP local</strong> — Sem chave de API. Funciona offline.
              Entende comandos como: "mostre reuniões", "o que é Projeto Alpha",
              "caminho entre João e Marina", "adicione nota sobre…"
            </div>
          )}

          {/* ── TTS (Voice) section */}
          <div className={styles.ttsDivider} />
          <div className={styles.ttsSection}>
            <div className={styles.ttsSectionTitle}>🎙 VOZ DO JARVIS</div>

            {/* TTS provider selector */}
            <div className={styles.field}>
              <label className={styles.label}>Motor de Voz</label>
              <div className={styles.ttsToggle}>
                <button
                  className={`${styles.ttsBtn} ${ttsProvider === 'browser' ? styles.ttsBtnActive : ''}`}
                  onClick={() => setTtsProvider('browser')}
                >
                  🌐 Navegador
                  <span className={styles.ttsBtnDesc}>Microsoft Daniel · pt-BR</span>
                </button>
                <button
                  className={`${styles.ttsBtn} ${ttsProvider === 'openai-tts' ? styles.ttsBtnActive : ''}`}
                  onClick={() => setTtsProvider('openai-tts')}
                >
                  ⚡ OpenAI TTS
                  <span className={styles.ttsBtnDesc}>Natural · precisa de chave OpenAI</span>
                </button>
              </div>
            </div>

            {ttsProvider === 'openai-tts' && (
              <>
                {/* TTS API Key */}
                <div className={styles.field}>
                  <label className={styles.label}>
                    Chave OpenAI (TTS)
                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer"
                      className={styles.getKey}>Obter chave ↗</a>
                  </label>
                  <div className={styles.keyWrap}>
                    <input
                      className={styles.input}
                      type={showTtsKey ? 'text' : 'password'}
                      placeholder="sk-..."
                      value={ttsApiKey}
                      onChange={e => setTtsApiKey(e.target.value)}
                      autoComplete="off"
                    />
                    <button className={styles.eyeBtn} onClick={() => setShowTtsKey(s => !s)}>
                      {showTtsKey ? '🙈' : '👁'}
                    </button>
                  </div>
                  {provider === 'openai' && (
                    <div className={`${styles.hint} ${styles.hintGood}`}>
                      ✅ Usando a mesma chave do provider OpenAI configurado acima.
                    </div>
                  )}
                </div>

                {/* Voice picker */}
                <div className={styles.field}>
                  <label className={styles.label}>Voz</label>
                  <select
                    className={styles.select}
                    value={ttsVoice}
                    onChange={e => setTtsVoice(e.target.value)}
                  >
                    {TTS_VOICES.map(v => (
                      <option key={v.value} value={v.value}>{v.label}</option>
                    ))}
                  </select>
                  <div className={styles.hint}>
                    "Onyx" é a mais similar ao JARVIS — grave e autoritária.
                    O modelo fala em português automaticamente.
                  </div>
                </div>
              </>
            )}

            {ttsProvider === 'browser' && (
              <div className={styles.hint} style={{ marginTop: 4 }}>
                Usando Microsoft Daniel (pt-BR) com pitch grave e cadência lenta.
              </div>
            )}
          </div>

          {/* ── Status message */}
          {status !== 'idle' && (
            <div className={`${styles.statusMsg} ${styles[status]}`}>
              {status === 'saved'   && `✅ Salvo! JARVIS está usando ${meta.label}. Configuração persistida.`}
              {status === 'cleared' && '✅ Configurações apagadas. Usando NLP local.'}
              {status === 'testing' && '⏳ Testando conexão…'}
              {status === 'ok'      && `✅ Conectado! Resposta: "${statusMsg}"`}
              {status === 'error'   && `❌ ${statusMsg}`}
            </div>
          )}
        </div>

        {/* ── Footer */}
        <div className={styles.footer}>
          {provider !== 'local' && apiKey.trim() && (
            <button
              className={styles.testBtn}
              onClick={handleTest}
              disabled={status === 'testing'}
            >
              {status === 'testing' ? '⏳ Testando...' : '⚡ Testar Conexão'}
            </button>
          )}
          <div className={styles.footerRight}>
            <button className={styles.clearBtn} onClick={handleClear} title="Apaga todas as chaves e configs salvas">
              🗑 Esquecer
            </button>
            <button className={styles.saveBtn} onClick={handleSave}>
              {provider === 'local' ? '⚙ Usar Local NLP' : '💾 Salvar e Ativar'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
