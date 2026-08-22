/**
 * GraphLegend — floating bottom-left legend showing all category → color/shape mappings.
 * Collapsible to avoid cluttering small screens.
 */

import { useState } from 'react'
import { CATEGORY_COLORS } from '../../store/brainStore'
import type { NodeCategory } from '../../types'

interface LegendEntry {
  category: NodeCategory
  label: string
  shape: 'star' | 'circle' | 'rect' | 'diamond' | 'hex' | 'triangle' | 'pentagon'
}

const ENTRIES: LegendEntry[] = [
  { category: 'Project',    label: 'Projeto',       shape: 'star'     },
  { category: 'Feature',    label: 'Funcionalidade', shape: 'hex'      },
  { category: 'Module',     label: 'Módulo',         shape: 'rect'     },
  { category: 'Endpoint',   label: 'Endpoint',       shape: 'diamond'  },
  { category: 'Tech',       label: 'Tecnologia',     shape: 'triangle' },
  { category: 'Decision',   label: 'Decisão',        shape: 'pentagon' },
  { category: 'Meeting',    label: 'Reunião',         shape: 'circle'   },
  { category: 'Person',     label: 'Pessoa',          shape: 'circle'   },
  { category: 'Activity',   label: 'Atividade',       shape: 'circle'   },
  { category: 'Note',       label: 'Nota',            shape: 'circle'   },
  { category: 'Resource',   label: 'Recurso',         shape: 'circle'   },
  { category: 'Onboarding', label: 'Onboarding',      shape: 'circle'   },
]

function ShapeIcon({ shape, color }: { shape: LegendEntry['shape']; color: string }) {
  const size = 14
  switch (shape) {
    case 'star': return (
      <svg width={size} height={size} viewBox="-10 -10 20 20" style={{ flexShrink: 0 }}>
        <polygon
          points={Array.from({ length: 16 }, (_, i) => {
            const r   = i % 2 === 0 ? 9 : 4
            const ang = (i / 16) * Math.PI * 2 - Math.PI / 2
            return `${r * Math.cos(ang)},${r * Math.sin(ang)}`
          }).join(' ')}
          fill={color}
        />
      </svg>
    )
    case 'rect': return (
      <svg width={size} height={size} viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
        <rect x="1" y="3" width="12" height="8" rx="1.5" fill={color} />
      </svg>
    )
    case 'diamond': return (
      <svg width={size} height={size} viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
        <polygon points="7,1 13,7 7,13 1,7" fill={color} />
      </svg>
    )
    case 'hex': return (
      <svg width={size} height={size} viewBox="-10 -10 20 20" style={{ flexShrink: 0 }}>
        <polygon
          points={Array.from({ length: 6 }, (_, i) => {
            const ang = (i / 6) * Math.PI * 2 - Math.PI / 2
            return `${9 * Math.cos(ang)},${9 * Math.sin(ang)}`
          }).join(' ')}
          fill={color}
        />
      </svg>
    )
    case 'triangle': return (
      <svg width={size} height={size} viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
        <polygon points="7,1 13,13 1,13" fill={color} />
      </svg>
    )
    case 'pentagon': return (
      <svg width={size} height={size} viewBox="-10 -10 20 20" style={{ flexShrink: 0 }}>
        <polygon
          points={Array.from({ length: 5 }, (_, i) => {
            const ang = (i / 5) * Math.PI * 2 - Math.PI / 2
            return `${9 * Math.cos(ang)},${9 * Math.sin(ang)}`
          }).join(' ')}
          fill={color}
        />
      </svg>
    )
    default: return (
      <svg width={size} height={size} viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
        <circle cx="7" cy="7" r="6" fill={color} />
      </svg>
    )
  }
}

export default function GraphLegend() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div style={{
      position: 'absolute',
      bottom: 20,
      left: 246,
      zIndex: 100,
      background: 'rgba(10,13,20,0.88)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10,
      backdropFilter: 'blur(10px)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      overflow: 'hidden',
      transition: 'all 0.2s',
      minWidth: 160,
    }}>
      {/* Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '7px 12px',
          background: 'transparent', border: 'none',
          color: 'rgba(255,255,255,0.55)', fontSize: 10,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          cursor: 'pointer', fontFamily: 'Inter, sans-serif',
        }}
      >
        <span>Legenda</span>
        <span style={{ opacity: 0.5, marginLeft: 8, fontSize: 9 }}>
          {collapsed ? '▲' : '▼'}
        </span>
      </button>

      {/* Entries */}
      {!collapsed && (
        <div style={{ padding: '2px 12px 10px' }}>
          {ENTRIES.map(({ category, label, shape }) => (
            <div
              key={category}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '3px 0',
              }}
            >
              <ShapeIcon shape={shape} color={CATEGORY_COLORS[category]} />
              <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
