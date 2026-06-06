'use client'

// ============================================================
// Live SVG cross-section of a CNC tool, driven by its
// shape_profile ({ type, params }). Renders centreline,
// cutting-edge silhouette and shank outline at scale.
// Shared by the Tool Library shape editor and (later) the
// Phase 2 toolpath simulator's tool head. Geometry comes from
// src/lib/cnc/toolProfile — this file is presentation only.
// ============================================================

import { buildProfile, type ToolShape } from '@/src/lib/cnc/toolProfile'

export default function ToolProfilePreview({
  shape, width = 180, height = 220, className,
}: {
  shape: ToolShape
  width?: number
  height?: number
  className?: string
}) {
  const geom = buildProfile(shape)
  const pad = 18
  const pxPerMm = Math.min(
    (width - pad * 2) / Math.max(geom.widthMm, 1),
    (height - pad * 2) / Math.max(geom.heightMm, 1),
  )
  const cx = width / 2
  const baseY = height - pad                    // tip sits near the bottom
  const X = (x: number) => cx + x * pxPerMm
  const Y = (y: number) => baseY - y * pxPerMm

  const bodyPath = geom.outline.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(p.x).toFixed(2)},${Y(p.y).toFixed(2)}`).join(' ') + ' Z'
  const s = geom.shank

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} role="img" aria-label="Tool cross-section">
      <rect x={0} y={0} width={width} height={height} fill="#0f172a" rx={6} />

      {/* Centreline */}
      <line x1={cx} y1={pad * 0.4} x2={cx} y2={height - pad * 0.4}
        stroke="#64748b" strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />

      {/* Shank */}
      <rect
        x={X(-s.halfW)} y={Y(s.top)}
        width={(s.halfW * 2) * pxPerMm} height={(s.top - s.bottom) * pxPerMm}
        fill="#94a3b8" fillOpacity={0.12} stroke="#94a3b8" strokeWidth={1.2} />

      {/* Cutting body */}
      <path d={bodyPath} fill="#60a5fa" fillOpacity={0.14} stroke="#60a5fa" strokeWidth={1.6} strokeLinejoin="round" />

      {/* Diameter dimension */}
      <text x={cx} y={height - 4} textAnchor="middle" fill="#94a3b8" fontSize={9} fontFamily="monospace">
        ⌀{geom.widthMm}mm
      </text>
    </svg>
  )
}
