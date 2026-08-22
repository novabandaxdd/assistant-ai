/**
 * ── useJarvisEngine ────────────────────────────────────────────────────────
 *
 * Singleton hook — must be called ONCE in App.tsx only.
 *
 * Owns:
 *   • The single 'jarvis:input' event listener (prevents duplicate messages)
 *   • The single 'jarvis:recognition-error' listener
 *   • The JARVIS startup greeting
 *   • AI / NLP message processing pipeline
 *
 * useSpeech() handles mic + TTS state only, and dispatches events here.
 */

import { useEffect, useRef } from 'react'
import { useBrainStore } from '../store/brainStore'
import { processCommand } from '../utils/jarvisNLP'
import { askAI, buildKnowledgeContext, loadAIConfig, loadAIConfigWithKey, saveAIConfig, isAIConfigured } from '../utils/aiService'
import type { AIConfig } from '../utils/aiService'
import { playActivationSound, speakText, unlockAudio } from '../utils/jarvisVoice'
import type { KanbanCard, KanbanColumnId, NodeCategory } from '../types'

// ── Knowledge context ─────────────────────────────────────────────────────────
function buildContext() {
  const store = useBrainStore.getState()
  const recent = [...store.nodes].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))

  // Resolve active project name from filter ID
  const activeProjectName = store.activeProjectFilterId
    ? store.nodes.find(n => n.id === store.activeProjectFilterId)?.label
    : undefined

  return buildKnowledgeContext({
    nodeCount:   store.nodes.length,
    linkCount:   store.links.length,
    // Pass ALL nodes, each with tags — grouped by category inside buildKnowledgeContext
    topNodes:    store.nodes.map(n => ({
      label:    n.label,
      category: n.category,
      content:  n.content,
      tags:     n.tags,
    })),
    recentNodes: recent.slice(0, 10).map(n => ({
      label:    n.label,
      category: n.category,
      content:  n.content,
      tags:     n.tags,
    })),
    activeProjectName,
  })
}

// ── Message processing ────────────────────────────────────────────────────────
async function processMessage(
  raw:     string,
  history: Array<{ role: 'user' | 'jarvis'; text: string }>,
): Promise<{ response: string; action?: () => Promise<void> | void }> {
  const aiConfig = await loadAIConfigWithKey()
  if (isAIConfigured() && aiConfig) {
    try {
      const result = await askAI(raw, buildContext(), aiConfig, history)

      // Handle AGENT_SWITCH protocol embedded in AI response
      const switchMatch = result.text.match(/AGENT_SWITCH:([^:]+):([^\s]+)/)
      if (switchMatch) {
        const [, provider, model] = switchMatch
        const cleanText = result.text.replace(/AGENT_SWITCH:[^\s]+/g, '').trim()
        return {
          response: cleanText || `Agente alterado para ${model}, Senhor.`,
          action: () => {
            const cfg = loadAIConfig()
            if (cfg) {
              saveAIConfig({ ...cfg, provider: provider as Parameters<typeof saveAIConfig>[0]['provider'], model })
              window.dispatchEvent(new Event('jarvis:config-changed'))
            }
          },
        }
      }

      // Handle GRAPH_ACTION protocol embedded in AI response
      const graphActions = [...result.text.matchAll(/GRAPH_ACTION:(\w+):([^\n]+)/g)]
      if (graphActions.length > 0) {
        const cleanText = result.text.replace(/GRAPH_ACTION:[^\n]+/g, '').trim()
        return {
          response: cleanText || 'Executado, Senhor.',
          action: async () => {
            const store = useBrainStore.getState()
            for (const [, type, argsRaw] of graphActions) {
              const args = argsRaw.split('|').map((s: string) => s.trim())
              switch (type) {
                case 'DELETE_NODE': {
                  const node = store.nodes.find(n =>
                    n.label.toLowerCase() === args[0].toLowerCase() ||
                    n.label.toLowerCase().includes(args[0].toLowerCase())
                  )
                  if (node) { await store.removeNode(node.id); store.selectNode(null) }
                  break
                }
                case 'RENAME_NODE': {
                  const node = store.nodes.find(n =>
                    n.label.toLowerCase().includes(args[0].toLowerCase())
                  )
                  if (node) await store.updateNode(node.id, { label: args[1] })
                  break
                }
                case 'UPDATE_CONTENT': {
                  const node = store.nodes.find(n =>
                    n.label.toLowerCase().includes(args[0].toLowerCase())
                  )
                  if (node) await store.updateNode(node.id, { content: args[1] })
                  break
                }
                case 'ADD_NODE': {
                  await store.addNode({
                    label: args[0],
                    category: (args[1] as NodeCategory) || 'Note',
                  })
                  break
                }
                case 'CONNECT_NODES': {
                  const a = store.nodes.find(n => n.label.toLowerCase().includes(args[0].toLowerCase()))
                  const b = store.nodes.find(n => n.label.toLowerCase().includes(args[1].toLowerCase()))
                  if (a && b) await store.addLink(a.id, b.id)
                  break
                }
                case 'DISCONNECT_NODES': {
                  const a = store.nodes.find(n => n.label.toLowerCase().includes(args[0].toLowerCase()))
                  const b = store.nodes.find(n => n.label.toLowerCase().includes(args[1].toLowerCase()))
                  if (a && b) {
                    const link = store.links.find(l => {
                      const src = typeof l.source === 'string' ? l.source : l.source.id
                      const tgt = typeof l.target === 'string' ? l.target : l.target.id
                      return (src === a.id && tgt === b.id) || (src === b.id && tgt === a.id)
                    })
                    if (link) await store.removeLink(link.id)
                  }
                  break
                }
                case 'SELECT_NODE': {
                  const node = store.nodes.find(n =>
                    n.label.toLowerCase().includes(args[0].toLowerCase())
                  )
                  if (node) store.selectNode(node.id)
                  break
                }
                case 'CREATE_ACTIVITY': {
                  const project = args[1]
                    ? store.nodes.find(n => n.category === 'Project' && n.label.toLowerCase().includes(args[1].toLowerCase()))
                    : null
                  const actContent  = args[2] ?? undefined
                  const actPriority = (args[3] as KanbanCard['priority']) || undefined
                  const actColumn   = (args[4] as KanbanColumnId) || undefined
                  const node = await store.createActivityNode(args[0], project?.id ?? null, actContent, actPriority)
                  if (actColumn && actColumn !== 'backlog') {
                    await store.moveActivityToColumn(node.id, actColumn)
                  }
                  break
                }
                case 'MOVE_ACTIVITY': {
                  const node = store.nodes.find(n =>
                    n.category === 'Activity' && n.label.toLowerCase().includes(args[0].toLowerCase())
                  )
                  if (node) {
                    await store.moveActivityToColumn(node.id, (args[1] as KanbanColumnId) || 'backlog')
                  }
                  break
                }
                case 'SET_TAGS': {
                  const node = store.nodes.find(n =>
                    n.label.toLowerCase().includes(args[0].toLowerCase())
                  )
                  if (node) {
                    const tags = args[1].split(',').map((t: string) => t.trim()).filter(Boolean)
                    await store.updateNode(node.id, { tags })
                  }
                  break
                }
                case 'ADD_TAG': {
                  const node = store.nodes.find(n =>
                    n.label.toLowerCase().includes(args[0].toLowerCase())
                  )
                  if (node) {
                    const existing = node.tags ?? []
                    const tag = args[1].trim()
                    if (tag && !existing.includes(tag)) {
                      await store.updateNode(node.id, { tags: [...existing, tag] })
                    }
                  }
                  break
                }
                case 'BATCH_CREATE': {
                  try {
                    const items = JSON.parse(args[0]) as Array<{
                      label: string
                      category: string
                      content?: string
                      tags?: string[]
                    }>
                    for (const item of items) {
                      await store.addNode({
                        label:    item.label,
                        category: (item.category as NodeCategory) || 'Note',
                        content:  item.content,
                        tags:     item.tags,
                      })
                    }
                  } catch { /* malformed JSON — skip */ }
                  break
                }
                case 'SET_PROJECT': {
                  const node = store.nodes.find(n =>
                    n.label.toLowerCase().includes(args[0].toLowerCase())
                  )
                  const project = store.nodes.find(n =>
                    n.category === 'Project' && n.label.toLowerCase().includes(args[1].toLowerCase())
                  )
                  if (node && project) {
                    await store.updateNode(node.id, { projectId: project.id })
                  }
                  break
                }
                case 'SUMMARIZE_NODE': {
                  const node = store.nodes.find(n =>
                    n.label.toLowerCase().includes(args[0].toLowerCase())
                  )
                  if (node) {
                    const aiConfig = loadAIConfig() as AIConfig | null
                    if (aiConfig) {
                      const enrichPrompt = `Baseado no contexto do grafo, escreva um conteúdo descritivo enriquecido e conciso (máx 400 chars) para o nó "${node.label}" (categoria: ${node.category}). Conteúdo atual: "${node.content ?? '(vazio)'}". Responda APENAS com o novo conteúdo, sem prefixos nem formatação extra.`
                      const enrichResult = await askAI(enrichPrompt, buildContext(), aiConfig, [])
                      const newContent = enrichResult.text.replace(/GRAPH_ACTION:[^\n]+/g, '').trim()
                      if (newContent) {
                        await store.updateNode(node.id, { content: newContent })
                      }
                    }
                  }
                  break
                }
                case 'ANALYZE_GRAPH': {
                  const aiConfig = loadAIConfig() as AIConfig | null
                  if (aiConfig) {
                    const analyzePrompt = `Analise o estado completo do grafo de conhecimento fornecido no contexto. Identifique: (1) nós isolados ou pouco conectados, (2) categorias sub-representadas, (3) possíveis lacunas de conhecimento, (4) oportunidades de conexão entre nós existentes, (5) recomendações de organização. Responda de forma estruturada e acionável, em português.`
                    const analyzeResult = await askAI(analyzePrompt, buildContext(), aiConfig, [])
                    const analysisText = analyzeResult.text.replace(/GRAPH_ACTION:[^\n]+/g, '').trim()
                    if (analysisText) {
                      useBrainStore.getState().addMessage({ role: 'jarvis', text: analysisText })
                    }
                  }
                  break
                }
              }
            }
          },
        }
      }

      return { response: result.text }
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg !== 'local') console.warn('[JARVIS AI]', msg)
    }
  }
  return processCommand(raw)
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useJarvisEngine() {
  const processingRef = useRef(false)
  const cancelSpeakFn = useRef<(() => void) | null>(null)
  const greetedRef    = useRef(false)
  const unlockedRef   = useRef(false)  // AudioContext unlock flag

  // Store actions via ref to avoid stale closures
  const setVoiceState = useBrainStore(s => s.setVoiceState)
  const addMessage    = useBrainStore(s => s.addMessage)
  const setChatOpen   = useBrainStore(s => s.setChatOpen)

  const setVoiceStateRef = useRef(setVoiceState)
  const addMessageRef    = useRef(addMessage)
  const setChatOpenRef   = useRef(setChatOpen)
  useEffect(() => { setVoiceStateRef.current = setVoiceState }, [setVoiceState])
  useEffect(() => { addMessageRef.current    = addMessage },    [addMessage])
  useEffect(() => { setChatOpenRef.current   = setChatOpen },   [setChatOpen])

  // ── Stable speak wrapper ──────────────────────────────────────────────────
  const speak = useRef((text: string) => {
    cancelSpeakFn.current?.()
    setVoiceStateRef.current('speaking')
    const cancel = speakText(text, {
      onEnd:   () => { setVoiceStateRef.current('idle'); cancelSpeakFn.current = null },
      onError: () => { setVoiceStateRef.current('idle'); cancelSpeakFn.current = null },
    })
    cancelSpeakFn.current = cancel
  })

  // ── Unlock AudioContext on first user interaction ─────────────────────────
  useEffect(() => {
    const unlock = () => {
      if (unlockedRef.current) return
      unlockedRef.current = true
      unlockAudio()   // loads MP3 into AudioContext buffer after gesture
    }
    window.addEventListener('click',     unlock, { once: true })
    window.addEventListener('keydown',   unlock, { once: true })
    window.addEventListener('touchstart',unlock, { once: true })
    return () => {
      window.removeEventListener('click',      unlock)
      window.removeEventListener('keydown',    unlock)
      window.removeEventListener('touchstart', unlock)
    }
  }, [])

  // ── Startup greeting (text only — no audio on load) ───────────────────────
  useEffect(() => {
    if (greetedRef.current) return
    greetedRef.current = true
    // Just add the greeting message to chat — no sound, no TTS on startup
    addMessageRef.current({ role: 'jarvis', text: 'Sistema JARVIS operacional, Senhor. Segunda memória ativa.' })
  }, [])

  // ── Main input handler ────────────────────────────────────────────────────
  const handleInput = useRef(async (heard: string) => {
    if (!heard.trim()) return

    // Guard against concurrent processing
    if (processingRef.current) {
      console.warn('[JARVIS engine] still processing, dropping:', heard)
      return
    }
    processingRef.current = true

    setVoiceStateRef.current('thinking')
    setChatOpenRef.current(true)

    // Full session history for AI context (excluding greeting messages)
    const history = useBrainStore.getState().chatHistory
      .filter(m => m.role === 'user' || m.role === 'jarvis')
      .slice(-30)  // last 30 messages = full context without token overflow
    addMessageRef.current({ role: 'user', text: heard })

    try {
      const result = await processMessage(heard, history)
      addMessageRef.current({ role: 'jarvis', text: result.response })

      // Play activation sound for greetings — only when NOT using XTTS
      // (XTTS already produces the full cloned voice; MP3 would overlap)
      const isGreeting = /^(ol[aá]|oi|hey|bom dia|boa tarde|boa noite|status)/i.test(heard)
      const cfg = loadAIConfig()
      if (isGreeting && unlockedRef.current && cfg?.ttsProvider !== 'xtts') {
        await playActivationSound(0.55).catch(() => {})
      }

      speak.current(result.response)
      await result.action?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido'
      addMessageRef.current({ role: 'jarvis', text: `Desculpe Senhor, ocorreu um erro: ${msg}` })
      speak.current('Desculpe Senhor, ocorreu um erro.')
    } finally {
      processingRef.current = false
      setVoiceStateRef.current('idle')
    }
  })

  // ── Register event listeners — ONCE ──────────────────────────────────────
  useEffect(() => {
    // Single jarvis:input listener — the only one in the whole app
    const onInput = (e: Event) => {
      handleInput.current((e as CustomEvent<string>).detail)
    }

    // Recognition error → add message
    const onRecogError = (e: Event) => {
      const err = (e as CustomEvent<string>).detail
      addMessageRef.current({
        role: 'jarvis',
        text: `Não consegui captar o áudio, Senhor. (${err}) Tente novamente.`,
      })
    }

    window.addEventListener('jarvis:input',             onInput)
    window.addEventListener('jarvis:recognition-error', onRecogError)

    return () => {
      window.removeEventListener('jarvis:input',             onInput)
      window.removeEventListener('jarvis:recognition-error', onRecogError)
    }
  }, []) // empty deps — must never re-register
}
