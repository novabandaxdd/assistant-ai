/**
 * ── ProjectGraphPanel ─────────────────────────────────────────────────────────
 * A clean, hierarchical "swimlane" visualization of a single project's subgraph.
 * Shows nodes organized in horizontal layers:
 *
 *   ROW 0: [Project Hub]
 *   ROW 1: [Tech] [Tech] [Tech]          ← stack
 *   ROW 2: [Feature] [Feature] ...       ← features (grouped by category)
 *   ROW 3: [Module] [Module] [Module]... ← modules (grouped by type)
 *   ROW 4: [Endpoint] [Endpoint] ...     ← endpoints (compact)
 *   ROW 5: [Meeting] [Decision] [Note]   ← context docs
 *
 * Connections are drawn as smooth SVG bezier curves between layers.
 * Clicking a node selects it in the brain store.
 */

import { useMemo, useState, useRef, useCallback } from 'react'
import { useBrainStore, CATEGORY_COLORS } from '../../store/brainStore'
import type { BrainNode, BrainLink, NodeCategory } from '../../types'
import styles from './ProjectGraphPanel.module.css'

interface Props {
  projectId: string | null
  onClose: () => void
}

// ── Layer ordering — determines which row a node appears in
const CATEGORY_LAYER: Partial<Record<NodeCategory, number>> = {
  Project:    0,
  Tech:       1,
  Feature:    2,
  Module:     3,
  Endpoint:   4,
  Meeting:    5,
  Decision:   5,
  Note:       5,
  Resource:   6,
  Activity:   6,
  Person:     6,
  Onboarding: 6,
}

const LAYER_LABELS: Record<number, string> = {
  0: 'Projeto',
  1: 'Stack & Tecnologias',
  2: 'Funcionalidades',
  3: 'Módulos',
  4: 'Endpoints',
  5: 'Contexto',
  6: 'Recursos & Outros',
}

// ── Shape SVG per category (tiny inline icon)
function CategoryShape({ cat, color, size = 10 }: { cat: NodeCategory; color: string; size?: number }) {
  const h = size, r = size / 2
  switch (cat) {
    case 'Project': {
      const pts = Array.from({ length: 16 }, (_, i) => {
        const radius = i % 2 === 0 ? r : r * 0.45
        const ang = (i / 16) * Math.PI * 2 - Math.PI / 2
        return `${r + radius * Math.cos(ang)},${r + radius * Math.sin(ang)}`
      }).join(' ')
      return <svg width={h} height={h} viewBox={`0 0 ${h} ${h}`} style={{ flexShrink: 0 }}><polygon points={pts} fill={color} /></svg>
    }
    case 'Feature': {
      const pts = Array.from({ length: 6 }, (_, i) => {
        const ang = (i / 6) * Math.PI * 2 - Math.PI / 2
        return `${r + r * 0.9 * Math.cos(ang)},${r + r * 0.9 * Math.sin(ang)}`
      }).join(' ')
      return <svg width={h} height={h} viewBox={`0 0 ${h} ${h}`} style={{ flexShrink: 0 }}><polygon points={pts} fill={color} /></svg>
    }
    case 'Module':
      return <svg width={h * 1.4} height={h} viewBox={`0 0 ${h * 1.4} ${h}`} style={{ flexShrink: 0 }}>
        <rect x="0.5" y="1.5" width={h * 1.4 - 1} height={h - 3} rx="2" fill={color} />
      </svg>
    case 'Endpoint':
      return <svg width={h} height={h} viewBox={`0 0 ${h} ${h}`} style={{ flexShrink: 0 }}>
        <polygon points={`${r},0 ${h},${r} ${r},${h} 0,${r}`} fill={color} />
      </svg>
    case 'Tech': {
      const pts = `${r},0 ${h},${h} 0,${h}`
      return <svg width={h} height={h} viewBox={`0 0 ${h} ${h}`} style={{ flexShrink: 0 }}><polygon points={pts} fill={color} /></svg>
    }
    case 'Decision': {
      const pts = Array.from({ length: 5 }, (_, i) => {
        const ang = (i / 5) * Math.PI * 2 - Math.PI / 2
        return `${r + r * 0.9 * Math.cos(ang)},${r + r * 0.9 * Math.sin(ang)}`
      }).join(' ')
      return <svg width={h} height={h} viewBox={`0 0 ${h} ${h}`} style={{ flexShrink: 0 }}><polygon points={pts} fill={color} /></svg>
    }
    default:
      return <svg width={h} height={h} viewBox={`0 0 ${h} ${h}`} style={{ flexShrink: 0 }}>
        <circle cx={r} cy={r} r={r - 0.5} fill={color} />
      </svg>
  }
}

function nid(x: string | BrainNode): string {
  return typeof x === 'string' ? x : x.id
}

// ── Build adjacency for the subgraph
function buildSubgraph(
  projectId: string,
  allNodes: BrainNode[],
  allLinks: BrainLink[],
) {
  const nodeMap = new Map(allNodes.map(n => [n.id, n]))

  // Collect all nodes reachable from projectId via BFS (2 hops max for clarity)
  const reachable = new Set<string>([projectId])
  const queue = [projectId]
  while (queue.length) {
    const cur = queue.shift()!
    for (const lk of allLinks) {
      const s = nid(lk.source), t = nid(lk.target)
      if (s === cur && !reachable.has(t)) { reachable.add(t); queue.push(t) }
      if (t === cur && !reachable.has(s)) { reachable.add(s); queue.push(s) }
    }
  }

  const subNodes = [...reachable].map(id => nodeMap.get(id)).filter(Boolean) as BrainNode[]
  const subLinks = allLinks.filter(lk => {
    const s = nid(lk.source), t = nid(lk.target)
    return reachable.has(s) && reachable.has(t)
  })

  return { subNodes, subLinks }
}

// ── Organize nodes into layers
function layerize(nodes: BrainNode[], projectId: string): Map<number, BrainNode[]> {
  const layers = new Map<number, BrainNode[]>()

  for (const node of nodes) {
    // Use proj: tag to check if it belongs to project, layer by category
    const layer = CATEGORY_LAYER[node.category] ?? 6
    if (!layers.has(layer)) layers.set(layer, [])
    layers.get(layer)!.push(node)
  }

  // Sort layer 0 so project hub is always first
  const l0 = layers.get(0) ?? []
  layers.set(0, l0.filter(n => n.id === projectId).concat(l0.filter(n => n.id !== projectId)))

  // Sort layers 2+ by label for consistent ordering
  for (const [k, arr] of layers.entries()) {
    if (k >= 2) arr.sort((a, b) => a.label.localeCompare(b.label))
  }

  return layers
}

export default function ProjectGraphPanel({ projectId, onClose }: Props) {
  const allNodes    = useBrainStore(s => s.nodes)
  const allLinks    = useBrainStore(s => s.links)
  const selectedId  = useBrainStore(s => s.selectedNodeId)
  const selectNode  = useBrainStore(s => s.selectNode)
  const setChatOpen = useBrainStore(s => s.setChatOpen)
  const addMessage  = useBrainStore(s => s.addMessage)

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const panRef = useRef({ x: 0, y: 0 })
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  const project = useMemo(() => allNodes.find(n => n.id === projectId), [allNodes, projectId])

  const { subNodes, subLinks } = useMemo(() => {
    if (!projectId) return { subNodes: [], subLinks: [] }
    return buildSubgraph(projectId, allNodes, allLinks)
  }, [projectId, allNodes, allLinks])

  const layers = useMemo(() => {
    if (!projectId) return new Map<number, BrainNode[]>()
    return layerize(subNodes, projectId)
  }, [subNodes, projectId])

  // ── Layout constants
  const CARD_W  = 130
  const CARD_H  = 40
  const GAP_X   = 16
  const ROW_H   = 90
  const PAD_Y   = 40
  const PAD_X   = 40

  // ── Assign x,y positions to each node
  const nodePositions = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>()
    const sortedLayers = [...layers.keys()].sort((a, b) => a - b)

    // Calculate total width needed per layer
    let maxLayerWidth = 0
    for (const [, nodes] of layers) {
      const w = nodes.length * (CARD_W + GAP_X) - GAP_X
      if (w > maxLayerWidth) maxLayerWidth = w
    }

    for (const layerIdx of sortedLayers) {
      const nodes = layers.get(layerIdx)!
      const rowWidth = nodes.length * (CARD_W + GAP_X) - GAP_X
      const offsetX = (maxLayerWidth - rowWidth) / 2

      nodes.forEach((node, i) => {
        pos.set(node.id, {
          x: PAD_X + offsetX + i * (CARD_W + GAP_X),
          y: PAD_Y + layerIdx * ROW_H,
        })
      })
    }

    return pos
  }, [layers])

  const svgWidth  = useMemo(() => {
    let maxRight = 600
    for (const { x } of nodePositions.values()) {
      if (x + CARD_W + PAD_X > maxRight) maxRight = x + CARD_W + PAD_X
    }
    return maxRight
  }, [nodePositions])

  const svgHeight = useMemo(() => {
    const sortedLayers = [...layers.keys()].sort((a, b) => a - b)
    const maxLayer = sortedLayers[sortedLayers.length - 1] ?? 0
    return PAD_Y * 2 + maxLayer * ROW_H + CARD_H + 20
  }, [layers])

  // ── Build SVG link paths between cards
  const linkPaths = useMemo(() => {
    return subLinks.map(lk => {
      const sid = nid(lk.source), tid = nid(lk.target)
      const sp = nodePositions.get(sid), tp = nodePositions.get(tid)
      if (!sp || !tp) return null

      const sx = sp.x + CARD_W / 2, sy = sp.y + CARD_H
      const tx = tp.x + CARD_W / 2, ty = tp.y
      const cy = (sy + ty) / 2

      // Straight vs. curved
      const path = sy < ty
        ? `M${sx},${sy} C${sx},${cy} ${tx},${cy} ${tx},${ty}`
        : `M${sx},${sy} C${sx},${sy + 20} ${tx},${ty - 20} ${tx},${ty}`

      const isHighlighted = hoveredId === sid || hoveredId === tid ||
                            selectedId === sid || selectedId === tid

      return { path, lk, isHighlighted, label: lk.label }
    }).filter(Boolean)
  }, [subLinks, nodePositions, hoveredId, selectedId])

  // ── Node click
  const handleNodeClick = useCallback((node: BrainNode) => {
    selectNode(node.id)
    const linkCount = subLinks.filter(l => nid(l.source) === node.id || nid(l.target) === node.id).length
    addMessage({
      role: 'jarvis',
      text: `Focando em "${node.label}" (${node.category}). ${linkCount} conexões neste subgrafo.`,
    })
    setChatOpen(true)
  }, [selectNode, addMessage, setChatOpen, subLinks])

  // ── Pan/zoom handlers
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    setZoom(z => Math.min(3, Math.max(0.3, z - e.deltaY * 0.001)))
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-node]')) return
    dragging.current = true
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return
    setPan({
      x: dragStart.current.px + (e.clientX - dragStart.current.mx),
      y: dragStart.current.py + (e.clientY - dragStart.current.my),
    })
  }

  const handleMouseUp = () => { dragging.current = false }

  if (!projectId || !project) return null

  const sortedLayers = [...layers.keys()].sort((a, b) => a - b)

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.projectDot} style={{ background: CATEGORY_COLORS.Project }} />
          <div>
            <div className={styles.projectTitle}>{project.label}</div>
            <div className={styles.projectMeta}>
              {subNodes.length} nós · {subLinks.length} conexões · {(sortedLayers.length)} camadas
            </div>
          </div>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.zoomBtn} onClick={() => setZoom(z => Math.min(3, z + 0.15))}>+</button>
          <button className={styles.zoomBtn} onClick={() => setZoom(z => Math.max(0.3, z - 0.15))}>−</button>
          <button className={styles.zoomBtn} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} title="Resetar zoom">↺</button>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
      </div>

      {/* Layer labels sidebar */}
      <div className={styles.layerLabels}>
        {sortedLayers.map(layer => (
          <div
            key={layer}
            className={styles.layerLabel}
            style={{ top: PAD_Y + layer * ROW_H * zoom + pan.y + CARD_H / 2 - 8 }}
          >
            {LAYER_LABELS[layer] ?? `Camada ${layer}`}
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div
        className={styles.canvas}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: dragging.current ? 'grabbing' : 'grab' }}
      >
        <svg
          width={svgWidth * zoom}
          height={svgHeight * zoom}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            overflow: 'visible',
          }}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        >
          {/* Layer separators */}
          {sortedLayers.map(layer => (
            <line
              key={`sep-${layer}`}
              x1={0}
              y1={PAD_Y + layer * ROW_H - 14}
              x2={svgWidth}
              y2={PAD_Y + layer * ROW_H - 14}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={1}
            />
          ))}

          {/* Links */}
          {linkPaths.map((item, i) => item && (
            <g key={`link-${i}`}>
              <path
                d={item.path}
                fill="none"
                stroke={item.isHighlighted ? '#00f5ff' : 'rgba(255,255,255,0.08)'}
                strokeWidth={item.isHighlighted ? 1.5 : 0.8}
                strokeDasharray={item.isHighlighted ? undefined : '4 3'}
              />
            </g>
          ))}

          {/* Nodes */}
          {subNodes.map(node => {
            const pos = nodePositions.get(node.id)
            if (!pos) return null
            const color = CATEGORY_COLORS[node.category] ?? '#888'
            const isSelected = node.id === selectedId
            const isHovered = node.id === hoveredId
            const isProject = node.category === 'Project'

            return (
              <g
                key={node.id}
                data-node="true"
                transform={`translate(${pos.x}, ${pos.y})`}
                style={{ cursor: 'pointer' }}
                onClick={() => handleNodeClick(node)}
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Card background */}
                <rect
                  x={0}
                  y={0}
                  width={CARD_W}
                  height={CARD_H}
                  rx={isProject ? 8 : 6}
                  fill={isSelected
                    ? `${color}22`
                    : isHovered
                      ? 'rgba(255,255,255,0.07)'
                      : 'rgba(13,15,20,0.85)'}
                  stroke={isSelected
                    ? color
                    : isHovered
                      ? `${color}66`
                      : `${color}28`}
                  strokeWidth={isSelected ? 1.5 : 1}
                />

                {/* Left color accent bar */}
                <rect
                  x={0}
                  y={0}
                  width={3}
                  height={CARD_H}
                  rx={isProject ? 4 : 3}
                  fill={color}
                  opacity={isSelected || isHovered ? 1 : 0.5}
                />

                {/* Category shape icon */}
                <foreignObject x={7} y={CARD_H / 2 - 5} width={12} height={12}>
                  <CategoryShape cat={node.category} color={color} size={11} />
                </foreignObject>

                {/* Label */}
                <text
                  x={22}
                  y={CARD_H / 2 + 1}
                  fontSize={isProject ? 10 : 9}
                  fontWeight={isProject ? 700 : 500}
                  fill={isSelected ? color : 'rgba(255,255,255,0.85)'}
                  fontFamily="Inter, sans-serif"
                  dominantBaseline="middle"
                >
                  {node.label.length > 16 ? node.label.slice(0, 15) + '…' : node.label}
                </text>

                {/* Category badge */}
                <text
                  x={22}
                  y={CARD_H / 2 + 12}
                  fontSize={7.5}
                  fill={`${color}88`}
                  fontFamily="Inter, sans-serif"
                  dominantBaseline="middle"
                >
                  {node.category}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Bottom stats */}
      <div className={styles.footer}>
        {sortedLayers.map(layer => {
          const count = layers.get(layer)?.length ?? 0
          if (!count) return null
          return (
            <div key={layer} className={styles.footerStat}>
              <span className={styles.footerCount}>{count}</span>
              <span className={styles.footerLabel}>{LAYER_LABELS[layer]}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
