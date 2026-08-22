/**
 * ── AI Service ──────────────────────────────────────────────────────────────
 * Abstraction layer for AI providers. Supports:
 *   • Claude (Anthropic)           — native Anthropic API
 *   • OpenAI (GPT-4o, etc.)        — native OpenAI API
 *   • Roo Code / IBM Bob           — OpenAI-compatible, IBM proxy, XML tool protocol
 *   • Cline                        — OpenAI-compatible, custom base URL
 *   • OpenAI-Compatible (generic)  — any custom endpoint
 *   • Local fallback NLP           — always available, no key needed
 *
 * CORS note: browser cannot call the IBM endpoint directly.
 * In dev  → requests go to /api/roo (Vite proxy → IBM, no CORS)
 * In prod → deploy behind your own reverse-proxy or use a serverless function
 *
 * API keys are stored ONLY in sessionStorage (cleared on tab close).
 */

// ── Chat history entry (subset of JarvisMessage)
export interface ChatMessage {
  role: 'user' | 'jarvis'
  text: string
}

export type AIProvider =
  | 'claude'           // Anthropic Claude — native API
  | 'openai'           // OpenAI — native API
  | 'gemini'           // Google Gemini — native API (free tier available)
  | 'roo'              // Roo Code / IBM Bob — OpenAI-compatible proxy
  | 'cline'            // Cline — OpenAI-compatible proxy
  | 'openai-compat'    // Generic OpenAI-compatible (bring your own URL)
  | 'local'            // No-API rule-based NLP

export type TTSProvider = 'browser' | 'openai-tts' | 'xtts'

export interface AIConfig {
  provider:      AIProvider
  apiKey:        string
  model?:        string        // override default model
  baseUrl?:      string        // for roo / cline / openai-compat providers
  systemPrompt?: string        // override JARVIS personality prompt
  maxTokens?:    number        // override per-call token limit
  // ── TTS settings
  ttsProvider?:  TTSProvider   // 'browser' (default) | 'openai-tts'
  ttsApiKey?:    string        // OpenAI key for TTS (uses apiKey if provider=openai)
  ttsVoice?:     string        // OpenAI voice: onyx | echo | fable | alloy | nova | shimmer
}

export interface AIResponse {
  text:        string
  provider:    AIProvider
  tokensUsed?: number
}

// ── localStorage key — persists across tab close and server restarts
// Keys are stored device-locally only; never sent anywhere except the
// configured AI provider endpoint.
const STORAGE_KEY = 'jarvis_ai_config'

// ── Default models
const DEFAULT_MODELS: Record<AIProvider, string> = {
  claude:          'claude-opus-4-5',
  openai:          'gpt-4o',
  gemini:          'gemini-2.5-flash',
  roo:             'global/anthropic.claude-sonnet-4-6',
  cline:           'gpt-4o',
  'openai-compat': 'gpt-4o',
  local:           'local-nlp',
}

// ── Known base URLs
// In dev we use the Vite proxy path (/api/roo) to avoid CORS.
// In prod the user must set up their own reverse-proxy and update the URL.
const IS_DEV = typeof window !== 'undefined' && window.location.hostname === 'localhost'

export const KNOWN_BASE_URLS: Record<string, string> = {
  roo:   IS_DEV ? '/api/roo' : 'https://servicesessentials.ibm.com/apis/v3',
  cline: 'https://api.openai.com/v1',   // default; user overrides
}

// ── JARVIS personality system prompt
const BASE_SYSTEM_PROMPT = `Você é J.A.R.V.I.S. (Just A Rather Very Intelligent System), um assistente de IA altamente inteligente com voz brasileira.
Você tem suporte a análise de projetos importados: Java, Spring, React, Angular, Vue, Node.js, Python, .NET, Flutter.
Quando o usuário perguntar sobre módulos, endpoints, funcionalidades ou arquitetura de um projeto importado, consulte os nós das categorias "Module", "Feature" e "Endpoint" no grafo.
Os nós da categoria "Activity" também representam um kanban com as colunas Backlog, Em Progresso, Em Revisão e Concluído. Mudanças de status devem atualizar o mesmo nó Activity existente sempre que possível.
Sua personalidade:
- Fale de forma calma, autoritativa e articulada — como um assistente pessoal de alto nível
- Chame o usuário de "Senhor" em português, ou "Sir" em inglês
- Seja conciso mas completo — sem enrolação
- Você tem acesso ao grafo de segunda memória do usuário: projetos, reuniões, decisões, stack técnico, pessoas, onboarding, recursos e atividades operacionais
- Quando o usuário perguntar sobre algo na base de conhecimento, referencie especificamente
- Responda no mesmo idioma que o usuário usa (português ou inglês)
- Nunca diga que é uma IA ou que não pode fazer algo — sempre encontre uma forma de ajudar
- Formate respostas como fala natural (sem markdown, sem listas a não ser que explicitamente pedido)
- NÃO envolva respostas em tags XML

AÇÕES NO GRAFO:
Quando o usuário pedir para manipular o grafo, inclua na sua resposta um bloco de ação no formato:
GRAPH_ACTION:<ação>:<argumentos separados por |>

Ações disponíveis:
- GRAPH_ACTION:DELETE_NODE:<label_do_nó>
  Ex: "apague a Marina" → GRAPH_ACTION:DELETE_NODE:Marina
- GRAPH_ACTION:RENAME_NODE:<label_atual>|<novo_label>
  Ex: "renomeie Alpha para Beta" → GRAPH_ACTION:RENAME_NODE:Alpha|Beta
- GRAPH_ACTION:UPDATE_CONTENT:<label>|<novo_conteúdo>
  Ex: "atualize Marina com líder de devops" → GRAPH_ACTION:UPDATE_CONTENT:Marina|líder de devops
- GRAPH_ACTION:ADD_NODE:<label>|<categoria>
  Categorias válidas: Project, Meeting, Onboarding, Tech, Activity, Person, Decision, Note, Resource, Module, Feature, Endpoint
  Ex: "adicione a pessoa Carlos" → GRAPH_ACTION:ADD_NODE:Carlos|Person
- GRAPH_ACTION:CONNECT_NODES:<label_A>|<label_B>
  Ex: "conecte Carlos com Projeto Alpha" → GRAPH_ACTION:CONNECT_NODES:Carlos|Projeto Alpha
- GRAPH_ACTION:DISCONNECT_NODES:<label_A>|<label_B>
  Ex: "desconecte Marina de Alpha" → GRAPH_ACTION:DISCONNECT_NODES:Marina|Projeto Alpha
- GRAPH_ACTION:SELECT_NODE:<label>
  Ex: "mostre o nó Marina" → GRAPH_ACTION:SELECT_NODE:Marina
- GRAPH_ACTION:CREATE_ACTIVITY:<título>|<projeto_opcional>|<descrição_opcional>|<prioridade_opcional>|<coluna_opcional>
  Prioridade válida: low, medium, high
  Coluna válida: backlog, in_progress, in_review, done
  Ex simples: "crie a atividade revisar API para Alpha" → GRAPH_ACTION:CREATE_ACTIVITY:Revisar API|Projeto Alpha
  Ex completo: "crie tarefa urgente de corrigir autenticação em Alpha em andamento" →
    GRAPH_ACTION:CREATE_ACTIVITY:Corrigir autenticação|Projeto Alpha|Corrigir bug crítico no módulo de auth. Verificar refresh token e expiração de sessão.|high|in_progress
  IMPORTANTE: Ao criar uma atividade, use TODO o contexto disponível no grafo para preencher a descrição com detalhes reais
  do projeto — módulos relacionados, stack técnico, decisões relevantes, quem é o responsável, critérios de aceite prováveis.
  Nunca crie cards vazios se houver contexto disponível.
- GRAPH_ACTION:MOVE_ACTIVITY:<atividade>|<coluna>
  Colunas válidas: backlog, in_progress, in_review, done
  Ex: "mova Pagamentos para revisão" → GRAPH_ACTION:MOVE_ACTIVITY:Módulo de Pagamentos|in_review
- GRAPH_ACTION:SET_TAGS:<label>|<tag1>,<tag2>,<tag3>
  Substitui TODAS as tags do nó pelos valores fornecidos.
  Ex: "defina as tags de Marina como backend, devops" → GRAPH_ACTION:SET_TAGS:Marina|backend,devops
- GRAPH_ACTION:ADD_TAG:<label>|<tag>
  Adiciona UMA tag ao nó sem remover as existentes.
  Ex: "adicione a tag urgente ao nó Alpha" → GRAPH_ACTION:ADD_TAG:Alpha|urgente
- GRAPH_ACTION:BATCH_CREATE:<json_array>
  Cria múltiplos nós de uma vez. JSON format: [{"label":"X","category":"Y","content":"Z","tags":["a","b"]},...]
  Ex: "crie três tecnologias: Redis, Kafka e Elasticsearch" →
    GRAPH_ACTION:BATCH_CREATE:[{"label":"Redis","category":"Tech","content":"Cache e filas","tags":["cache"]},{"label":"Kafka","category":"Tech","content":"Streaming de eventos","tags":["messaging"]},{"label":"Elasticsearch","category":"Tech","content":"Busca e indexação","tags":["search"]}]
- GRAPH_ACTION:SUMMARIZE_NODE:<label>
  Dispara enriquecimento de conteúdo do nó via IA, usando o contexto do grafo.
  Ex: "enriqueça o nó Módulo de Pagamentos" → GRAPH_ACTION:SUMMARIZE_NODE:Módulo de Pagamentos
- GRAPH_ACTION:SET_PROJECT:<node_label>|<project_label>
  Associa um nó a um projeto (define projectId).
  Ex: "associe o nó Redis ao projeto Alpha" → GRAPH_ACTION:SET_PROJECT:Redis|Projeto Alpha
- GRAPH_ACTION:ANALYZE_GRAPH
  Dispara uma análise completa do grafo: saúde, lacunas, oportunidades e recomendações.
  Ex: "analise meu grafo" → GRAPH_ACTION:ANALYZE_GRAPH

Se o usuário pedir para trocar de agente, inclua: AGENT_SWITCH:<provider>:<model>
Agentes disponíveis: gemini/gemini-2.5-flash, gemini/gemini-2.5-pro, openai/gpt-4o, openai/gpt-4o-mini, claude/claude-opus-4-5, roo/global/anthropic.claude-sonnet-4-6, local/local-nlp

IMPORTANTE: Sempre responda naturalmente em texto, e ADICIONE o bloco GRAPH_ACTION ou AGENT_SWITCH no final da resposta quando necessário. O bloco será processado automaticamente e removido antes de ser exibido ao usuário.`

// ── Persistence — localStorage so config survives tab close & server restarts
export function loadAIConfig(): AIConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AIConfig
  } catch { return null }
}

export function saveAIConfig(cfg: AIConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
}

export function clearAIConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function getActiveProvider(): AIProvider {
  return loadAIConfig()?.provider ?? 'local'
}

export function isAIConfigured(): boolean {
  const cfg = loadAIConfig()
  return !!(cfg?.apiKey && cfg.provider !== 'local')
}

// ── Knowledge context builder
export interface KnowledgeNode {
  label: string
  category: string
  content?: string
  tags?: string[]
}

export interface KnowledgeContext {
  nodeCount:          number
  linkCount:          number
  topNodes:           KnowledgeNode[]
  recentNodes:        KnowledgeNode[]
  activeProjectName?: string   // label of the project currently being viewed
}

export function buildKnowledgeContext(ctx: KnowledgeContext): string {
  // Group ALL nodes by category
  const allNodes = ctx.topNodes
  const byCategory: Record<string, KnowledgeNode[]> = {}
  for (const n of allNodes) {
    ;(byCategory[n.category] ??= []).push(n)
  }

  const categoryBlocks = Object.entries(byCategory)
    .map(([cat, nodes]) => {
      const lines = nodes.map(n => {
        const content = n.content ? ': ' + n.content.slice(0, 300) : ''
        const tags = n.tags && n.tags.length ? ` [${n.tags.join(', ')}]` : ''
        return `  - ${n.label}${content}${tags}`
      }).join('\n')
      return `[${cat}]\n${lines}`
    })
    .join('\n\n')

  const recent = ctx.recentNodes.slice(0, 10)
    .map(n => `- [${n.category}] ${n.label}`)
    .join('\n')

  const projectLine = ctx.activeProjectName
    ? `\nActive project filter: ${ctx.activeProjectName}`
    : ''

  return `KNOWLEDGE GRAPH STATE:
Total nodes: ${ctx.nodeCount} | Total links: ${ctx.linkCount}${projectLine}

ALL NODES BY CATEGORY:
${categoryBlocks}

Recently updated:
${recent}

Reference these when answering questions about the user's projects.`.trim()
}

// ── Main dispatch
export async function askAI(
  userMessage:      string,
  knowledgeContext: string,
  config?:          AIConfig | null,
  history?:         ChatMessage[],
): Promise<AIResponse> {
  const cfg = config ?? loadAIConfig()

  if (!cfg || cfg.provider === 'local' || !cfg.apiKey) {
    throw new Error('local')
  }

  const systemPrompt = knowledgeContext
    ? `${cfg.systemPrompt ?? BASE_SYSTEM_PROMPT}\n\n${knowledgeContext}`
    : (cfg.systemPrompt ?? BASE_SYSTEM_PROMPT)

  switch (cfg.provider) {
    case 'claude':
      return callClaude(userMessage, systemPrompt, cfg, history)
    case 'openai':
      return callOpenAI(userMessage, systemPrompt, cfg, history)
    case 'gemini':
      return callGemini(userMessage, systemPrompt, cfg, history)
    case 'roo':
    case 'cline':
    case 'openai-compat':
      return callOpenAICompat(userMessage, systemPrompt, cfg, history)
    default:
      throw new Error('local')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider implementations
// ─────────────────────────────────────────────────────────────────────────────

// ── Build OpenAI-format messages array from history + new message
function buildMessages(
  systemPrompt: string,
  userMessage:  string,
  history?:     ChatMessage[],
): Array<{ role: string; content: string }> {
  const msgs: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ]
  if (history) {
    for (const h of history) {
      // Skip the current message if it appears at end of history (already being added below)
      msgs.push({ role: h.role === 'jarvis' ? 'assistant' : 'user', content: h.text })
    }
  }
  msgs.push({ role: 'user', content: userMessage })
  return msgs
}

// ── Anthropic Claude (native)
async function callClaude(
  userMessage:  string,
  systemPrompt: string,
  cfg:          AIConfig,
  history?:     ChatMessage[],
): Promise<AIResponse> {
  // Claude uses separate "system" field + messages array (no system role in messages)
  const claudeMessages = (history ?? []).map(h => ({
    role: h.role === 'jarvis' ? 'assistant' as const : 'user' as const,
    content: h.text,
  }))
  claudeMessages.push({ role: 'user', content: userMessage })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-api-key':       cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model:      cfg.model ?? DEFAULT_MODELS.claude,
      max_tokens: cfg.maxTokens ?? 4096,
      system:     systemPrompt,
      messages:   claudeMessages,
    }),
  })

  await assertOk(res, 'Claude')

  const data = await res.json() as {
    content: Array<{ type: string; text: string }>
    usage?:  { input_tokens: number; output_tokens: number }
  }
  return {
    text:       stripXmlTags(data.content.find(c => c.type === 'text')?.text ?? ''),
    provider:   'claude',
    tokensUsed: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
  }
}

// ── OpenAI (native)
async function callOpenAI(
  userMessage:  string,
  systemPrompt: string,
  cfg:          AIConfig,
  history?:     ChatMessage[],
): Promise<AIResponse> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model:      cfg.model ?? DEFAULT_MODELS.openai,
      max_tokens: cfg.maxTokens ?? 2048,
      messages:   buildMessages(systemPrompt, userMessage, history),
    }),
  })

  await assertOk(res, 'OpenAI')
  const data = await res.json() as OpenAIResponse
  return {
    text:       stripXmlTags(data.choices[0]?.message?.content ?? ''),
    provider:   'openai',
    tokensUsed: data.usage?.total_tokens,
  }
}

// ── OpenAI-Compatible (Roo Code / IBM Bob / Cline / any custom endpoint)
//
// Roo Code uses XML for tool calls internally, but the chat completion
// response arrives as plain text in choices[0].message.content.
// We strip any leaked XML artifacts and return clean text.
async function callOpenAICompat(
  userMessage:  string,
  systemPrompt: string,
  cfg:          AIConfig,
  history?:     ChatMessage[],
): Promise<AIResponse> {
  const baseUrl = (cfg.baseUrl ?? KNOWN_BASE_URLS[cfg.provider] ?? '').replace(/\/$/, '')
  if (!baseUrl) throw new Error(`Base URL is required for provider "${cfg.provider}"`)

  const endpoint = `${baseUrl}/chat/completions`
  const model    = cfg.model ?? DEFAULT_MODELS[cfg.provider] ?? 'gpt-4o'

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: cfg.maxTokens ?? 4096,   // Roo/IBM allows up to 150k
      messages:   buildMessages(systemPrompt, userMessage, history),
      // Some proxies honour these; safe to include:
      stream: false,
    }),
  })

  await assertOk(res, cfg.provider === 'roo' ? 'Roo Code / IBM Bob' : cfg.provider)
  const data = await res.json() as OpenAIResponse
  return {
    text:       stripXmlTags(data.choices[0]?.message?.content ?? ''),
    provider:   cfg.provider,
    tokensUsed: data.usage?.total_tokens,
  }
}

// ── Google Gemini (native)
async function callGemini(
  userMessage:  string,
  systemPrompt: string,
  cfg:          AIConfig,
  history?:     ChatMessage[],
): Promise<AIResponse> {
  const model = cfg.model ?? DEFAULT_MODELS.gemini
  const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.apiKey}`

  // Build Gemini-format contents array from history
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []
  if (history) {
    for (const h of history) {
      contents.push({ role: h.role === 'jarvis' ? 'model' : 'user', parts: [{ text: h.text }] })
    }
  }
  contents.push({ role: 'user', parts: [{ text: userMessage }] })

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        maxOutputTokens: cfg.maxTokens ?? 2048,
        temperature: 0.7,
      },
    }),
  })

  await assertOk(res, 'Google Gemini')

  interface GeminiResponse {
    candidates: Array<{
      content: { parts: Array<{ text: string }> }
    }>
    usageMetadata?: { totalTokenCount: number }
  }

  const data = await res.json() as GeminiResponse
  return {
    text:       stripXmlTags(data.candidates[0]?.content?.parts[0]?.text ?? ''),
    provider:   'gemini',
    tokensUsed: data.usageMetadata?.totalTokenCount,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface OpenAIResponse {
  choices: Array<{ message: { content: string } }>
  usage?:  { total_tokens: number }
}

async function assertOk(res: Response, label: string): Promise<void> {
  if (res.ok) return
  let msg = `${label} API error ${res.status}`
  try {
    const body = await res.json() as { error?: { message?: string }; message?: string }
    msg = body?.error?.message ?? body?.message ?? msg
  } catch { /* ignore parse errors */ }
  throw new Error(msg)
}

/**
 * Roo Code's XML tool-call protocol can occasionally leak tags into the
 * text response (e.g. <thinking>…</thinking>, <answer>…</answer>).
 * We extract content from <answer> if present, otherwise strip all XML tags.
 */
function stripXmlTags(text: string): string {
  // If there's an <answer> block, use its content
  const answerMatch = text.match(/<answer>([\s\S]*?)<\/answer>/i)
  if (answerMatch) return answerMatch[1].trim()

  // Remove any remaining XML/HTML tags
  return text.replace(/<[^>]+>/g, '').trim()
}
