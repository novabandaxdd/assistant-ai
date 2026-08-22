import { useBrainStore } from '../store/brainStore'
import { loadAIConfig, saveAIConfig, KNOWN_BASE_URLS, type AIProvider } from './aiService'
import type { BrainNode, NodeCategory } from '../types'

// ── JARVIS NLP engine — rule-based, no API needed ────────────────────────────
export interface NLPResult {
  response: string
  action?: () => Promise<void> | void
}

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]
}

const FILLERS = [
  'Prontamente, Senhor.',
  'Imediatamente, Senhor.',
  'Com certeza, Senhor.',
  'Executando, Senhor.',
  'Considerado, Senhor.',
]

// ── Category map ──────────────────────────────────────────────────────────────
const CAT_MAP: Record<string, NodeCategory> = {
  projeto: 'Project',    projetos: 'Project',    project: 'Project',    projects: 'Project',
  reunião: 'Meeting',    reunioes: 'Meeting',     meeting: 'Meeting',    meetings: 'Meeting',
  onboarding: 'Onboarding',
  tech: 'Tech',          tecnologia: 'Tech',      tecnologias: 'Tech',   stack: 'Tech',
  atividade: 'Activity', atividades: 'Activity',  activity: 'Activity',  tarefa: 'Activity',    tarefas: 'Activity',
  pessoa: 'Person',      pessoas: 'Person',       person: 'Person',      people: 'Person',
  decisão: 'Decision',   decisoes: 'Decision',    decision: 'Decision',
  nota: 'Note',          notas: 'Note',           note: 'Note',          notes: 'Note',
  recurso: 'Resource',   recursos: 'Resource',    resource: 'Resource',
}

function resolveCategory(raw: string): NodeCategory | undefined {
  const r = raw.toLowerCase().trim()
  return CAT_MAP[r] ?? Object.entries(CAT_MAP).find(([k]) => r.includes(k))?.[1]
}

// ── Node finder — fuzzy, by label and optional category ──────────────────────
function findNode(label: string, nodes: BrainNode[], category?: string): BrainNode | undefined {
  const q   = label.toLowerCase().trim()
  const cat = category ? resolveCategory(category) : undefined

  const match = (n: BrainNode) => cat ? n.category === cat : true

  return (
    nodes.find(n => match(n) && n.label.toLowerCase() === q) ??
    nodes.find(n => match(n) && n.label.toLowerCase().includes(q)) ??
    nodes.find(n => match(n) && q.includes(n.label.toLowerCase())) ??
    // broader search without category constraint
    nodes.find(n => n.label.toLowerCase() === q) ??
    nodes.find(n => n.label.toLowerCase().includes(q))
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export function processCommand(raw: string): NLPResult {
  const store = useBrainStore.getState()
  const text  = raw.trim()
  const lo    = text.toLowerCase()

  // ── Status / saudação ────────────────────────────────────────────────────
  if (/^(oi|olá|hey|jarvis|acordar|iniciar|status|como está|ajuda|help)/i.test(lo)) {
    const { nodes, links } = store
    return {
      response: `Sistema operacional, Senhor. Sua base de conhecimento contém ${nodes.length} nós e ${links.length} conexões ativas. Como posso auxiliá-lo?`,
    }
  }

  // ── APAGAR NÓ ─────────────────────────────────────────────────────────────
  // "apague a Marina", "delete o nó Projeto Alpha", "remova a reunião Sprint 1",
  // "exclua Marina - Devops", "apaga o João"
  const deleteMatch = lo.match(
    /^(?:apague?|delete?|remova?|exclua?|excluir?|deletar?|apagar?)\s+(?:o\s+|a\s+|os?\s+n[oó]s?\s+|o\s+n[oó]\s+)?(.+)/i
  )
  if (deleteMatch) {
    const label = deleteMatch[1].trim()
    const node  = findNode(label, store.nodes)
    if (!node) return { response: `Não encontrei nenhum nó com o nome "${label}" em sua base, Senhor. Verifique o nome e tente novamente.` }
    const linkCount = store.getLinks(node.id).length
    return {
      response: `${pick(FILLERS)} Removendo "${node.label}" e suas ${linkCount} conexão${linkCount !== 1 ? 'ões' : ''} do grafo, Senhor.`,
      action: async () => {
        await store.removeNode(node.id)
        store.selectNode(null)
        store.clearHighlight()
      },
    }
  }

  // ── RENOMEAR NÓ ───────────────────────────────────────────────────────────
  // "renomeie Marina para Marina Silva", "mude o nome de Alpha para Beta"
  const renameMatch = lo.match(
    /(?:renomei[ea]r?|mude?\s+(?:o\s+)?nome\s+(?:de\s+)?|renomear?\s+)(.+?)\s+(?:para|como|p[/])\s+(.+)/i
  )
  if (renameMatch) {
    const [, fromRaw, toRaw] = renameMatch
    const node = findNode(fromRaw.trim(), store.nodes)
    if (!node) return { response: `Não encontrei "${fromRaw.trim()}" para renomear, Senhor.` }
    const newLabel = toRaw.trim()
    return {
      response: `${pick(FILLERS)} Renomeando "${node.label}" para "${newLabel}", Senhor.`,
      action: async () => { await store.updateNode(node.id, { label: newLabel }) },
    }
  }

  // ── ATUALIZAR CONTEÚDO / DESCRIÇÃO ────────────────────────────────────────
  // "atualize a descrição de Marina com lider de devops"
  // "adicione a nota de Alpha: reunião cancelada"
  const updateMatch = lo.match(
    /(?:atualize?|edite?|modifique?|altere?|mude?\s+(?:a\s+)?(?:descri[cç][aã]o|conte[uú]do|nota)\s+(?:de\s+)?|adicione?\s+(?:a\s+)?(?:descri[cç][aã]o|conte[uú]do|nota)\s+(?:de\s+)?)(.+?)\s+(?:com|para|:|=)\s+(.+)/i
  )
  if (updateMatch) {
    const [, labelRaw, contentRaw] = updateMatch
    const node = findNode(labelRaw.trim(), store.nodes)
    if (!node) return { response: `Não encontrei "${labelRaw.trim()}" para atualizar, Senhor.` }
    return {
      response: `${pick(FILLERS)} Atualizando o conteúdo de "${node.label}", Senhor.`,
      action: async () => { await store.updateNode(node.id, { content: contentRaw.trim() }) },
    }
  }

  // ── ADICIONAR NÓ (qualquer categoria) ────────────────────────────────────
  // "adicione a pessoa Marina", "crie um projeto chamado Alpha 2",
  // "nova reunião Sprint 5", "adicione tecnologia React"
  const addNodeMatch = lo.match(
    /^(?:adicione?r?|criei?r?|novo?a?\s+|inserir?\s+|incluir?\s+)(?:um[a]?\s+)?(?:novo?a?\s+)?(?:(projeto|person[a]?|pessoa|reunião|meeting|onboarding|tech|tecnologia|atividade|tarefa|decisão|nota|recurso|node|nó)\s+(?:chamad[oa]\s+|de\s+nome\s+)?)?(.+)/i
  )
  if (addNodeMatch) {
    const catRaw  = addNodeMatch[1]?.trim() ?? ''
    const label   = addNodeMatch[2]?.trim() ?? ''
    if (label) {
      const category: NodeCategory = resolveCategory(catRaw) ?? 'Note'
      return {
        response: `${pick(FILLERS)} Adicionando "${label}" como ${category} ao grafo, Senhor.`,
        action: async () => { await store.addNode({ label, category }) },
      }
    }
  }

  // ── CONECTAR DOIS NÓS ─────────────────────────────────────────────────────
  const connectMatch = lo.match(/(?:conecte?|ligar?|relacionar?|link)\s+(.+?)\s+(?:com|e|a|ao?|à)\s+(.+)/i)
  if (connectMatch) {
    const nodeA = findNode(connectMatch[1].trim(), store.nodes)
    const nodeB = findNode(connectMatch[2].trim(), store.nodes)
    if (!nodeA || !nodeB) return { response: `Não localizei ambos os nós para conectar, Senhor. Verifique os nomes.` }
    const alreadyLinked = store.links.some(l => {
      const s = typeof l.source === 'string' ? l.source : l.source.id
      const t = typeof l.target === 'string' ? l.target : l.target.id
      return (s === nodeA.id && t === nodeB.id) || (t === nodeA.id && s === nodeB.id)
    })
    if (alreadyLinked) return { response: `"${nodeA.label}" e "${nodeB.label}" já estão conectados, Senhor.` }
    return {
      response: `${pick(FILLERS)} Estabelecendo conexão entre "${nodeA.label}" e "${nodeB.label}", Senhor.`,
      action: async () => { await store.addLink(nodeA.id, nodeB.id) },
    }
  }

  // ── DESCONECTAR / REMOVER LINK ────────────────────────────────────────────
  const disconnectMatch = lo.match(/(?:desconecte?|desligar?|remover?\s+(?:a\s+)?(?:liga[cç][aã]o|cone[xc][aã]o|link)\s+(?:entre|de))\s+(.+?)\s+(?:e|de|com)\s+(.+)/i)
  if (disconnectMatch) {
    const nodeA = findNode(disconnectMatch[1].trim(), store.nodes)
    const nodeB = findNode(disconnectMatch[2].trim(), store.nodes)
    if (!nodeA || !nodeB) return { response: `Não localizei os nós para desconectar, Senhor.` }
    const link = store.links.find(l => {
      const s = typeof l.source === 'string' ? l.source : l.source.id
      const t = typeof l.target === 'string' ? l.target : l.target.id
      return (s === nodeA.id && t === nodeB.id) || (t === nodeA.id && s === nodeB.id)
    })
    if (!link) return { response: `Não existe conexão entre "${nodeA.label}" e "${nodeB.label}", Senhor.` }
    return {
      response: `${pick(FILLERS)} Removendo a conexão entre "${nodeA.label}" e "${nodeB.label}", Senhor.`,
      action: async () => { await store.removeLink(link.id) },
    }
  }

  // ── O QUE É / EXPLIQUE ────────────────────────────────────────────────────
  const whatMatch = lo.match(/(?:o que é|explique|me fale sobre|fale sobre|descreva)\s+(.+)/i)
  if (whatMatch) {
    const node = findNode(whatMatch[1].trim(), store.nodes)
    if (!node) return { response: `Não encontrei informações sobre "${whatMatch[1].trim()}" em sua base, Senhor.` }
    const neighbors   = store.getNeighbors(node.id)
    const content     = node.content ? node.content.slice(0, 200) : 'Sem descrição disponível.'
    const neighborList = neighbors.slice(0, 3).map(n => n.label).join(', ')
    return {
      response: `${node.label} (${node.category}): ${content}${neighbors.length > 0 ? ` Conectado a: ${neighborList}${neighbors.length > 3 ? ` e mais ${neighbors.length - 3}` : ''}.` : ''}`,
      action: () => { store.selectNode(node.id) },
    }
  }

  // ── QUANTAS CONEXÕES ──────────────────────────────────────────────────────
  const connMatch = lo.match(/quantas?\s+conexões\s+(?:tem|possui|há em)\s+(.+)/i)
  if (connMatch) {
    const node = findNode(connMatch[1].trim(), store.nodes)
    if (!node) return { response: `Não localizei o nó "${connMatch[1].trim()}", Senhor.` }
    const count = store.getLinks(node.id).length
    return {
      response: `"${node.label}" possui ${count} conexão${count !== 1 ? 'ões' : ''}, Senhor.`,
      action: () => { store.selectNode(node.id) },
    }
  }

  // ── FOCAR / SELECIONAR NÓ ─────────────────────────────────────────────────
  const focusMatch = lo.match(/(?:focar?|selecionar?|abrir?|mostrar?|ir para)\s+(?:o\s+|a\s+)?(.+)/i)
  if (focusMatch) {
    const node = findNode(focusMatch[1].trim(), store.nodes)
    if (node) {
      return {
        response: `Focando em "${node.label}" (${node.category}). ${store.getLinks(node.id).length} conexão(ões) ativa(s).`,
        action: () => { store.selectNode(node.id) },
      }
    }
  }

  // ── CAMINHO ENTRE DOIS NÓS ───────────────────────────────────────────────
  const pathMatch = lo.match(/(?:caminho|rota|path)\s+(?:entre|de)\s+(.+?)\s+(?:e|até|para)\s+(.+)/i)
  if (pathMatch) {
    const nodeA = findNode(pathMatch[1].trim(), store.nodes)
    const nodeB = findNode(pathMatch[2].trim(), store.nodes)
    if (!nodeA || !nodeB) return { response: `Não localizei os nós, Senhor. Verifique os nomes.` }
    store.tracePath(nodeA.id, nodeB.id)
    const path = store.pathNodeIds
    if (path.length === 0) return { response: `Não há caminho entre "${nodeA.label}" e "${nodeB.label}", Senhor.` }
    const via = path.slice(1, -1).map(id => store.getNodeById(id)?.label ?? id)
    const viaText = via.length > 0 ? ` passando por ${via.join(' → ')}` : ' diretamente'
    return {
      response: `Caminho de "${nodeA.label}" até "${nodeB.label}": ${path.length - 1} passo${path.length > 2 ? 's' : ''}${viaText}, Senhor.`,
    }
  }

  // ── FILTRAR POR CATEGORIA ─────────────────────────────────────────────────
  const showMatch = lo.match(/(?:mostre?|exibir?|filtrar?|ver?)\s+(?:todos?\s+os?\s+)?(?:nós\s+de\s+)?(.+)/i)
  if (showMatch) {
    const cat = resolveCategory(showMatch[1].trim())
    if (cat) {
      return {
        response: `${pick(FILLERS)} Filtrando para mostrar apenas "${cat}", Senhor.`,
        action: () => { store.setAllCategories(false); store.toggleCategory(cat) },
      }
    }
  }

  // ── MOSTRAR TUDO ─────────────────────────────────────────────────────────
  if (/(?:mostrar?\s+)?tudo|todos\s+os\s+nós|resetar?\s+filtros?|limpar?\s+filtros?|exibir?\s+tudo/i.test(lo)) {
    return {
      response: `Exibindo todos os nós e conexões, Senhor.`,
      action: () => { store.setAllCategories(true); store.setSearch(''); store.clearHighlight() },
    }
  }

  // ── BUSCA ─────────────────────────────────────────────────────────────────
  const searchMatch = lo.match(/(?:busque?|pesquise?|encontre?|procure?)\s+(.+)/i)
  if (searchMatch) {
    const q     = searchMatch[1].trim()
    const found = store.nodes.filter(n =>
      n.label.toLowerCase().includes(q.toLowerCase()) ||
      (n.content ?? '').toLowerCase().includes(q.toLowerCase()) ||
      (n.tags ?? []).some(t => t.toLowerCase().includes(q.toLowerCase()))
    )
    if (found.length === 0) return { response: `Sem resultados para "${q}", Senhor.` }
    return {
      response: `${found.length} resultado${found.length > 1 ? 's' : ''} para "${q}": ${found.slice(0, 4).map(n => `${n.label} (${n.category})`).join(', ')}${found.length > 4 ? ` e mais ${found.length - 4}` : ''}, Senhor.`,
      action: () => { store.setSearch(q) },
    }
  }

  // ── PRINCIPAIS HUBS ──────────────────────────────────────────────────────
  if (/(?:principais?\s+)?hubs?|centros?|mais\s+conectados?/i.test(lo)) {
    const hubs = store.topHubs().slice(0, 5)
    return { response: `Principais hubs: ${hubs.map((h, i) => `${i + 1}. ${h.node.label} (${h.count})`).join(', ')}, Senhor.` }
  }

  // ── TROCAR DE AGENTE ─────────────────────────────────────────────────────
  const switchMatch = lo.match(
    /(?:trocar?\s+(?:de\s+)?agente?|mudar?\s+(?:para\s+)?(?:o\s+)?agente?|usar?\s+(?:o\s+)?agente?|ativar?\s+(?:o\s+)?agente?|muda\s+(?:para\s+)?|trocar?\s+para\s+|switch\s+(?:to\s+)?(?:agent\s+)?)(.+)/i
  )
  if (switchMatch) return switchAgentCommand(switchMatch[1].trim().toLowerCase())

  // ── QUAL AGENTE ──────────────────────────────────────────────────────────
  if (/qual\s+(?:agente|modelo|ai)|que\s+(?:agente|modelo)|qual\s+(?:é\s+)?(?:o\s+)?(?:agente|modelo)\s+ativo/i.test(lo)) {
    const cfg = loadAIConfig()
    if (!cfg || cfg.provider === 'local') return { response: 'Operando com NLP local, Senhor. Sem agente externo configurado.' }
    return { response: `Usando "${cfg.model ?? cfg.provider}" via ${cfg.provider.toUpperCase()}, Senhor.` }
  }

  // ── RESUMO / LISTAR TODOS ─────────────────────────────────────────────────
  if (/(?:listar?|list[ae]?\s+(?:todos?|tudo))|resumo\s+(?:da\s+)?(?:base|grafo)/i.test(lo)) {
    const counts = store.categoryCounts()
    const parts  = Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${v} ${k}`)
      .join(', ')
    return { response: `Sua base contém: ${parts}. Total: ${store.nodes.length} nós e ${store.links.length} links, Senhor.` }
  }

  // ── FALLBACK ─────────────────────────────────────────────────────────────
  return {
    response: pick([
      `Compreendo, Senhor. Posso criar, apagar, renomear, conectar ou descrever qualquer nó. O que deseja fazer?`,
      `Sua base contém ${store.nodes.length} nós. Tente: "apague [nome]", "adicione pessoa [nome]", "renomeie [A] para [B]", "conecte [A] com [B]".`,
      `Processando, Senhor. Posso executar qualquer operação no grafo por comando de voz ou texto.`,
    ]),
  }
}

// ── Agent switcher ────────────────────────────────────────────────────────────
function switchAgentCommand(target: string): NLPResult {
  const cfg = loadAIConfig()
  const agentMap: Array<{ pattern: RegExp; provider: AIProvider; model: string; label: string }> = [
    { pattern: /claude\s*sonnet|sonnet/,          provider: 'roo',    model: 'global/anthropic.claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { pattern: /claude\s*opus|opus/,              provider: 'claude', model: 'claude-opus-4-5',                    label: 'Claude Opus 4.5'  },
    { pattern: /claude\s*haiku|haiku/,            provider: 'claude', model: 'claude-haiku-4-5',                   label: 'Claude Haiku 4.5' },
    { pattern: /gpt.?5|gpt\s*cinco/,             provider: 'roo',    model: 'global/gpt-5.1-chat',               label: 'GPT-5'            },
    { pattern: /gpt.?4|gpt\s*quatro|gpt.?four/,  provider: 'openai', model: 'gpt-4o',                             label: 'GPT-4o'           },
    { pattern: /gemini/,                          provider: 'roo',    model: 'global/gemini-3-flash-preview',      label: 'Gemini Flash'     },
    { pattern: /granite|ibm/,                     provider: 'roo',    model: 'global/ibm/granite-4-h-small',       label: 'IBM Granite'      },
    { pattern: /groq|compound/,                   provider: 'roo',    model: 'global/groq/compound',               label: 'Groq Compound'    },
    { pattern: /local|offline|sem\s+internet/,    provider: 'local',  model: 'local-nlp',                          label: 'Local NLP'        },
    { pattern: /roo|ibm\s*bob|bob/,              provider: 'roo',    model: 'global/anthropic.claude-sonnet-4-6', label: 'Roo/IBM Bob'      },
  ]
  const match = agentMap.find(a => a.pattern.test(target))
  if (!match) return { response: `Não reconheci "${target}", Senhor. Disponíveis: Claude Sonnet, Opus, GPT-4, GPT-5, Gemini, Granite, Groq, Local.` }
  if (!cfg && match.provider !== 'local') return { response: `Nenhuma chave de API configurada, Senhor. Configure nas ⚙ Configurações primeiro.` }
  saveAIConfig({ ...(cfg ?? { provider: match.provider, apiKey: '' }), provider: match.provider, model: match.model, baseUrl: match.provider === 'roo' ? KNOWN_BASE_URLS.roo : cfg?.baseUrl })
  window.dispatchEvent(new Event('jarvis:config-changed'))
  return { response: `Agente alterado para ${match.label}, Senhor.` }
}
