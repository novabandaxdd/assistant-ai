import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { useBrainStore, CATEGORY_COLORS } from '../../store/brainStore'
import type { BrainNode, BrainLink, NodeCategory } from '../../types'
import GraphContextMenu from './GraphContextMenu'

interface NodeObject extends BrainNode {
  val: number
  color: string
  x?: number
  y?: number
}

function nid(x: string | BrainNode): string {
  return typeof x === 'string' ? x : x.id
}

// ── Tooltip rendered at mouse position
interface TooltipState {
  label: string
  category: string
  linkCount: number
  mx: number
  my: number
}

// ── Base radius by category — gives visual hierarchy
const CATEGORY_BASE_RADIUS: Partial<Record<NodeCategory, number>> = {
  Project:    9,
  Tech:       6,
  Feature:    6,
  Module:     5,
  Endpoint:   4,
  Meeting:    5,
  Decision:   5,
  Person:     5,
  Note:       3.5,
  Resource:   3.5,
  Onboarding: 5,
  Activity:   4,
}

// ── Draw shapes per category
function drawShape(
  ctx: CanvasRenderingContext2D,
  n: NodeObject,
  radius: number,
  fillStyle: string,
  strokeStyle?: string,
  lineWidth?: number,
) {
  ctx.beginPath()

  switch (n.category) {
    case 'Project': {
      // ── 8-pointed star
      const spikes = 8
      const outer  = radius
      const inner  = radius * 0.45
      for (let i = 0; i < spikes * 2; i++) {
        const r   = i % 2 === 0 ? outer : inner
        const ang = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2
        if (i === 0) ctx.moveTo((n.x ?? 0) + r * Math.cos(ang), (n.y ?? 0) + r * Math.sin(ang))
        else         ctx.lineTo((n.x ?? 0) + r * Math.cos(ang), (n.y ?? 0) + r * Math.sin(ang))
      }
      ctx.closePath()
      break
    }

    case 'Module': {
      // ── Rounded rect
      const hw = radius * 1.4, hh = radius * 0.85
      const rx = (n.x ?? 0) - hw, ry = (n.y ?? 0) - hh
      const rr = 2
      ctx.roundRect(rx, ry, hw * 2, hh * 2, rr)
      break
    }

    case 'Endpoint': {
      // ── Diamond
      const nx = n.x ?? 0, ny = n.y ?? 0
      ctx.moveTo(nx,          ny - radius)
      ctx.lineTo(nx + radius, ny)
      ctx.lineTo(nx,          ny + radius)
      ctx.lineTo(nx - radius, ny)
      ctx.closePath()
      break
    }

    case 'Feature': {
      // ── Hexagon
      const sides = 6
      for (let i = 0; i < sides; i++) {
        const ang = (i / sides) * Math.PI * 2 - Math.PI / 2
        const px  = (n.x ?? 0) + radius * Math.cos(ang)
        const py  = (n.y ?? 0) + radius * Math.sin(ang)
        if (i === 0) ctx.moveTo(px, py)
        else         ctx.lineTo(px, py)
      }
      ctx.closePath()
      break
    }

    case 'Decision': {
      // ── Pentagon
      const sides = 5
      for (let i = 0; i < sides; i++) {
        const ang = (i / sides) * Math.PI * 2 - Math.PI / 2
        const px  = (n.x ?? 0) + radius * Math.cos(ang)
        const py  = (n.y ?? 0) + radius * Math.sin(ang)
        if (i === 0) ctx.moveTo(px, py)
        else         ctx.lineTo(px, py)
      }
      ctx.closePath()
      break
    }

    case 'Person': {
      // ── Circle with outer ring hint
      ctx.arc(n.x ?? 0, n.y ?? 0, radius, 0, 2 * Math.PI)
      break
    }

    case 'Tech': {
      // ── Triangle (upward)
      const nx = n.x ?? 0, ny = n.y ?? 0
      ctx.moveTo(nx,              ny - radius)
      ctx.lineTo(nx + radius * 0.87, ny + radius * 0.5)
      ctx.lineTo(nx - radius * 0.87, ny + radius * 0.5)
      ctx.closePath()
      break
    }

    default:
      // ── Circle (Meeting, Note, Resource, Activity, Onboarding)
      ctx.arc(n.x ?? 0, n.y ?? 0, radius, 0, 2 * Math.PI)
  }

  ctx.fillStyle = fillStyle
  ctx.fill()

  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle
    ctx.lineWidth   = lineWidth ?? 1.5
    ctx.stroke()
  }
}

// ── Context menu state
interface ContextMenuState {
  x: number
  y: number
  graphX: number
  graphY: number
  nodeId?: string
  nodeLabel?: string
}

export default function ForceGraph() {
  const fgRef      = useRef<ReturnType<typeof ForceGraph2D> | null>(null)
  const tooltipRef = useRef<TooltipState | null>(null)
  const tooltipEl  = useRef<HTMLDivElement>(null)
  const shiftRef   = useRef(false)

  // Layout mode: 'force' | 'radial'
  const [layout, setLayout] = useState<'force' | 'radial'>('force')
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  // ── Store slices
  const nodes       = useBrainStore(s => s.filteredNodes())
  const links       = useBrainStore(s => s.filteredLinks())
  const selectedId  = useBrainStore(s => s.selectedNodeId)
  const hlNodes     = useBrainStore(s => s.highlightNodeIds)
  const hlLinks     = useBrainStore(s => s.highlightLinkIds)
  const physics     = useBrainStore(s => s.physics)
  const selectNode  = useBrainStore(s => s.selectNode)
  const tracePath   = useBrainStore(s => s.tracePath)
  const addMessage  = useBrainStore(s => s.addMessage)
  const setChatOpen = useBrainStore(s => s.setChatOpen)
  const getLinks    = useBrainStore(s => s.getLinks)
  const addNode     = useBrainStore(s => s.addNode)
  const addLink     = useBrainStore(s => s.addLink)

  // ── Track Shift key via ref
  useEffect(() => {
    const dn  = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftRef.current = true }
    const up  = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftRef.current = false }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        useBrainStore.getState().selectNode(null)
        useBrainStore.getState().clearHighlight()
        hideTooltip()
      }
    }
    window.addEventListener('keydown', dn)
    window.addEventListener('keyup',   up)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('keydown', dn)
      window.removeEventListener('keyup',   up)
      window.removeEventListener('keydown', esc)
    }
  }, [])

  // ── Track mouse for tooltip
  useEffect(() => {
    const mv = (e: MouseEvent) => {
      if (!tooltipEl.current || !tooltipRef.current) return
      tooltipEl.current.style.left = `${e.clientX + 14}px`
      tooltipEl.current.style.top  = `${e.clientY - 40}px`
    }
    window.addEventListener('mousemove', mv)
    return () => window.removeEventListener('mousemove', mv)
  }, [])

  // ── Tooltip helpers
  const showTooltip = useCallback((node: NodeObject, linkCount: number) => {
    tooltipRef.current = { label: node.label, category: node.category, linkCount, mx: 0, my: 0 }
    if (!tooltipEl.current) return
    tooltipEl.current.querySelector('.tt-label')!.textContent = node.label
    tooltipEl.current.querySelector('.tt-cat')!.textContent   = node.category
    tooltipEl.current.querySelector('.tt-meta')!.textContent  =
      `${linkCount} conexõe${linkCount !== 1 ? 's' : ''} · clique para focar`
    const dot = tooltipEl.current.querySelector('.tt-dot') as HTMLElement
    if (dot) dot.style.background = CATEGORY_COLORS[node.category as NodeCategory] ?? '#888'
    tooltipEl.current.style.display = 'block'
  }, [])

  const hideTooltip = useCallback(() => {
    tooltipRef.current = null
    if (tooltipEl.current) tooltipEl.current.style.display = 'none'
  }, [])

  // ── graphData: stable references
  const graphData = useMemo(() => {
    const lc = new Map<string, number>()
    links.forEach(l => {
      const s = nid(l.source), t = nid(l.target)
      lc.set(s, (lc.get(s) ?? 0) + 1)
      lc.set(t, (lc.get(t) ?? 0) + 1)
    })
    return {
      nodes: nodes.map(n => ({
        ...n,
        val:   Math.max(1, (lc.get(n.id) ?? 0) * 0.5 + 1),
        color: CATEGORY_COLORS[n.category] ?? '#888',
      })),
      links: links.map(l => ({
        ...l,
        source: nid(l.source),
        target: nid(l.target),
      })),
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, links.length,
      nodes.map(n => n.id).join(','),
      links.map(l => `${nid(l.source)}-${nid(l.target)}`).join(','),
  ])

  // ── Apply radial layout when mode switches
  useEffect(() => {
    const fg = fgRef.current as unknown as {
      d3Force?: (name: string, force?: unknown) => unknown
      d3ReheatSimulation?: () => void
    }
    if (!fg?.d3Force) return

    if (layout === 'radial') {
      // Find project hub (most connected node)
      const lc = new Map<string, number>()
      links.forEach(l => {
        const s = nid(l.source), t = nid(l.target)
        lc.set(s, (lc.get(s) ?? 0) + 1)
        lc.set(t, (lc.get(t) ?? 0) + 1)
      })
      const hubId = nodes.reduce((best, n) =>
        (lc.get(n.id) ?? 0) > (lc.get(best) ?? 0) ? n.id : best,
        nodes[0]?.id ?? ''
      )

      // Assign radial positions based on distance from hub (BFS)
      const adj = new Map<string, string[]>()
      nodes.forEach(n => adj.set(n.id, []))
      links.forEach(l => {
        const s = nid(l.source), t = nid(l.target)
        adj.get(s)?.push(t); adj.get(t)?.push(s)
      })

      const dist = new Map<string, number>([[hubId, 0]])
      const q = [hubId]
      while (q.length) {
        const cur = q.shift()!
        for (const nb of adj.get(cur) ?? []) {
          if (!dist.has(nb)) { dist.set(nb, (dist.get(cur) ?? 0) + 1); q.push(nb) }
        }
      }

      // Place nodes at concentric circles
      const byDepth = new Map<number, string[]>()
      dist.forEach((d, id) => {
        if (!byDepth.has(d)) byDepth.set(d, [])
        byDepth.get(d)!.push(id)
      })

      const nodeMap = new Map(graphData.nodes.map(n => [n.id, n]))
      const RING_GAP = 130
      byDepth.forEach((ids, depth) => {
        ids.forEach((id, i) => {
          const n = nodeMap.get(id)
          if (!n) return
          if (depth === 0) {
            n.fx = 0; n.fy = 0
          } else {
            const angle = (i / ids.length) * 2 * Math.PI - Math.PI / 2
            const r     = depth * RING_GAP
            n.fx = r * Math.cos(angle)
            n.fy = r * Math.sin(angle)
          }
        })
      })
      fg.d3ReheatSimulation?.()
    } else {
      // Release all fixed positions
      graphData.nodes.forEach(n => { n.fx = undefined; n.fy = undefined })
      fg.d3ReheatSimulation?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout])

  // ── Fit / physics
  const handleFit = useCallback(() => {
    const fg = fgRef.current as unknown as { zoomToFit?: (ms: number, pad: number) => void }
    fg?.zoomToFit?.(600, 80)
  }, [])

  useEffect(() => {
    const t = setTimeout(handleFit, 800)
    return () => clearTimeout(t)
  }, [handleFit])

  useEffect(() => {
    window.addEventListener('graph:fit', handleFit)
    return () => window.removeEventListener('graph:fit', handleFit)
  }, [handleFit])

  useEffect(() => {
    const fg = fgRef.current as unknown as {
      d3Force?: (name: string) => { strength?: (v: number) => void; distance?: (v: number) => void } | undefined
    }
    if (!fg?.d3Force) return
    fg.d3Force('charge')?.strength?.(-physics.repelStrength)
    fg.d3Force('link')?.distance?.(physics.linkDistance)
  }, [physics.repelStrength, physics.linkDistance])

  // ── Interactions
  const handleNodeClick = useCallback((node: unknown) => {
    const n = node as NodeObject
    if (!n?.id) return
    hideTooltip()

    if (shiftRef.current) {
      const current = useBrainStore.getState().selectedNodeId
      if (current && current !== n.id) {
        tracePath(current, n.id)
        return
      }
    }

    selectNode(n.id)
    const cnt = getLinks(n.id).length
    addMessage({
      role: 'jarvis',
      text: `Focando em "${n.label}". Categoria: ${n.category}. ${cnt} conexão${cnt !== 1 ? 'ões' : ''} ativa${cnt !== 1 ? 's' : ''}.`,
    })
    setChatOpen(true)
  }, [hideTooltip, tracePath, selectNode, getLinks, addMessage, setChatOpen])

  const handleNodeHover = useCallback((node: unknown) => {
    const n = node as NodeObject | null
    if (!n?.id) { hideTooltip(); return }
    const cnt = getLinks(n.id).length
    showTooltip(n, cnt)
  }, [getLinks, showTooltip, hideTooltip])

  // ── Canvas draw — refs for selectedId/hlNodes so draw doesn't need to re-bind
  const selectedIdRef = useRef(selectedId)
  const hlNodesRef    = useRef(hlNodes)
  const hlLinksRef    = useRef(hlLinks)
  const showLabelsRef = useRef(physics.showLabels)
  useEffect(() => { selectedIdRef.current = selectedId },    [selectedId])
  useEffect(() => { hlNodesRef.current    = hlNodes },       [hlNodes])
  useEffect(() => { hlLinksRef.current    = hlLinks },       [hlLinks])
  useEffect(() => { showLabelsRef.current = physics.showLabels }, [physics.showLabels])

  const drawNode = useCallback((node: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const n            = node as NodeObject
    const isSelected    = n.id === selectedIdRef.current
    const isHighlighted = hlNodesRef.current.size > 0 && hlNodesRef.current.has(n.id)
    const isDimmed      = hlNodesRef.current.size > 0 && !hlNodesRef.current.has(n.id)

    const baseR  = CATEGORY_BASE_RADIUS[n.category as NodeCategory] ?? 4
    const radius = Math.max(baseR, baseR + n.val * 0.8)

    ctx.save()

    if (isSelected || isHighlighted) {
      ctx.shadowColor = isSelected ? '#00f5ff' : n.color
      ctx.shadowBlur  = isSelected ? 20 : 12
    }

    const fillColor = isDimmed ? `${n.color}25` : n.color

    drawShape(
      ctx, n, radius, fillColor,
      isSelected ? '#00f5ff' : isHighlighted ? '#ffffff88' : undefined,
      isSelected ? 2 / globalScale : 1.2 / globalScale,
    )

    // Person — extra outer ring
    if (n.category === 'Person' && !isDimmed) {
      ctx.beginPath()
      ctx.arc(n.x ?? 0, n.y ?? 0, radius + 2.5, 0, 2 * Math.PI)
      ctx.strokeStyle = `${n.color}55`
      ctx.lineWidth   = 1 / globalScale
      ctx.stroke()
    }

    ctx.restore()

    if (showLabelsRef.current && globalScale > 0.5) {
      const fontSize = Math.max(2.5, 10 / globalScale)
      ctx.font         = `${n.category === 'Project' ? 'bold ' : ''}${fontSize}px Inter, sans-serif`
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle    = isDimmed
        ? 'rgba(255,255,255,0.12)'
        : isSelected
          ? '#00f5ff'
          : 'rgba(255,255,255,0.88)'
      ctx.fillText(n.label, n.x ?? 0, (n.y ?? 0) + radius + fontSize * 1.0)
    }
  }, [])

  const getLinkColor = useCallback((link: unknown) => {
    const l = link as BrainLink & { id: string }
    if (hlLinksRef.current.size > 0) {
      return hlLinksRef.current.has(l.id) ? '#00f5ff' : 'rgba(255,255,255,0.03)'
    }
    return 'rgba(255,255,255,0.10)'
  }, [])

  const getLinkWidth = useCallback((link: unknown) => {
    const l = link as BrainLink & { id: string }
    return hlLinksRef.current.has(l.id) ? 2 : 0.6
  }, [])

  const dims = useMemo(() => ({ w: window.innerWidth, h: window.innerHeight }), [])

  useEffect(() => {
    const handle = () => {
      const fg = fgRef.current as unknown as { width?: (v: number) => void; height?: (v: number) => void }
      fg?.width?.(window.innerWidth)
      fg?.height?.(window.innerHeight)
    }
    window.addEventListener('resize', handle)
    return () => window.removeEventListener('resize', handle)
  }, [])

  // ── Context menu handler
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    // Get graph coords from pixel position
    const fg = fgRef.current as unknown as {
      screen2GraphCoords?: (x: number, y: number) => { x: number; y: number }
    }
    const graphCoords = fg?.screen2GraphCoords?.(e.clientX, e.clientY) ?? { x: 0, y: 0 }

    // Check if right-click landed near a node
    const nodeAtPoint = graphData.nodes.find(n => {
      const dx = (n.x ?? 0) - graphCoords.x
      const dy = (n.y ?? 0) - graphCoords.y
      return Math.sqrt(dx * dx + dy * dy) < 16
    })

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      graphX: graphCoords.x,
      graphY: graphCoords.y,
      nodeId: nodeAtPoint?.id,
      nodeLabel: nodeAtPoint?.label,
    })
  }, [graphData.nodes])

  return (
    <div
      style={{ position: 'absolute', inset: 0, background: '#0d0f14' }}
      onContextMenu={handleContextMenu}
    >
      <ForceGraph2D
        ref={fgRef as never}
        graphData={graphData}
        width={dims.w}
        height={dims.h}
        backgroundColor="#0d0f14"
        nodeCanvasObject={drawNode}
        nodeCanvasObjectMode={() => 'replace'}
        linkColor={getLinkColor}
        linkWidth={getLinkWidth}
        linkLabel={(l: unknown) => (l as BrainLink).label ?? ''}
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
        linkDirectionalArrowColor={getLinkColor}
        linkDirectionalParticles={physics.showParticles ? 2 : 0}
        linkDirectionalParticleSpeed={0.005}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleColor={() => '#00f5ff99'}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onBackgroundClick={() => {
          useBrainStore.getState().selectNode(null)
          useBrainStore.getState().clearHighlight()
          hideTooltip()
        }}
        enableNodeDrag={true}
        nodeRelSize={4}
        cooldownTicks={layout === 'radial' ? 0 : 200}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.4}
        minZoom={0.1}
        maxZoom={8}
        onBackgroundRightClick={() => { /* handled by div onContextMenu */ }}
      />

      {/* Layout toggle — clear of right sidebar (160px) and toolbar */}
      <div style={{
        position: 'absolute', top: 12, right: 176,
        display: 'flex', gap: 6, zIndex: 100,
      }}>
        {(['force', 'radial'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => setLayout(mode)}
            title={mode === 'force' ? 'Force-directed layout' : 'Radial (project-centric) layout'}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              borderRadius: 5,
              border: `1px solid ${layout === mode ? 'rgba(0,245,255,0.5)' : 'rgba(255,255,255,0.12)'}`,
              background: layout === mode ? 'rgba(0,245,255,0.08)' : 'rgba(10,13,20,0.8)',
              color: layout === mode ? '#00f5ff' : 'rgba(255,255,255,0.45)',
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
              transition: 'all 0.15s',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            {mode === 'force' ? '⬡ Force' : '◎ Radial'}
          </button>
        ))}
      </div>

      {/* Tooltip */}
      <div
        ref={tooltipEl}
        style={{
          display: 'none',
          position: 'fixed',
          pointerEvents: 'none',
          zIndex: 200,
          background: 'rgba(10,13,20,0.95)',
          border: '1px solid rgba(0,245,255,0.22)',
          borderRadius: 8,
          padding: '7px 12px',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
          transition: 'opacity 0.1s',
          minWidth: 120,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <div className="tt-dot" style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0 }} />
          <div className="tt-label" style={{ color: '#fff', fontWeight: 600, fontSize: 13 }} />
        </div>
        <div className="tt-cat"  style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginBottom: 1, fontFamily: 'monospace' }} />
        <div className="tt-meta" style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }} />
      </div>
      {/* Context menu */}
      {contextMenu && (
        <GraphContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          nodeLabel={contextMenu.nodeLabel}
          onClose={() => setContextMenu(null)}
          onCreateNode={async (label, category) => {
            const node = await addNode({ label, category })
            setContextMenu(null)
            selectNode(node.id)
          }}
          onLinkTo={async (targetId) => {
            if (contextMenu.nodeId) {
              await addLink(contextMenu.nodeId, targetId)
            }
            setContextMenu(null)
          }}
          onSelect={() => {
            if (contextMenu.nodeId) selectNode(contextMenu.nodeId)
            setContextMenu(null)
          }}
          allNodes={useBrainStore.getState().nodes}
        />
      )}
    </div>
  )
}
