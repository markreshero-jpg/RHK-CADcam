'use client'

import { useRef, useState } from 'react'
import type { ResolvedDrawerBoxPart } from '@/src/lib/resolver/types'
import {
  Box, PanelKind, PartMeta,
  panelFaceColors,
  Part, PartPropertiesPanel, PreviewCanvas,
} from '@/src/components/three/PartViewer'

// ── Colour type (re-exported for DrawerBoxPreviewPanel) ────────────────────────

export interface MatColour {
  face: string
  back: string
  edge: string
}

const FALLBACK_COL: MatColour = { face: '#b0c4b8', back: '#8a9e90', edge: '#6b8070' }

// ── Part labels ────────────────────────────────────────────────────────────────

const DB_LABELS: Record<ResolvedDrawerBoxPart['part_type'], string> = {
  db_left_side:  'Left Side',
  db_right_side: 'Right Side',
  db_bottom:     'Bottom Panel',
  db_front:      'Front Panel',
  db_back:       'Back Panel',
}

// ── Box + kind conversion ──────────────────────────────────────────────────────

function dbBoxAndKind(p: ResolvedDrawerBoxPart): { box: Box; kind: PanelKind } {
  switch (p.part_type) {
    case 'db_left_side':
    case 'db_right_side':
      return { box: { x: p.X, y: p.Y, z: p.Z, w: p.DZ, h: p.DY, d: p.DX }, kind: 'side' }
    case 'db_bottom':
      return { box: { x: p.X, y: p.Y, z: p.Z, w: p.DY, h: p.DZ, d: p.DX }, kind: 'horizontal' }
    case 'db_front':
    case 'db_back':
      return { box: { x: p.X, y: p.Y, z: p.Z, w: p.DY, h: p.DX, d: p.DZ }, kind: 'face' }
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DrawerBox3DView({
  parts, boxWidth, boxHeight, boxDepth, matCol,
}: {
  parts:     ResolvedDrawerBoxPart[]
  boxWidth:  number
  boxHeight: number
  boxDepth:  number
  matCol?:   MatColour
}) {
  const [selectedPart, setSelectedPart] = useState<PartMeta | null>(null)
  const dragRef = useRef(false)
  const col = matCol ?? FALLBACK_COL

  const ox = -boxWidth  / 2
  const oy = -boxHeight / 2
  const oz = -boxDepth  / 2

  return (
    <PreviewCanvas
      dx={boxWidth} dy={boxHeight} dz={boxDepth}
      bgColor="#111827"
      enablePan={false}
      onDeselect={() => setSelectedPart(null)}
      overlay={selectedPart && <PartPropertiesPanel part={selectedPart} onClose={() => setSelectedPart(null)} />}
    >
      <group position={[ox, oy, oz]}>
        {parts.map((p, i) => {
          const { box: b, kind } = dbBoxAndKind(p)
          const isBottom = p.part_type === 'db_bottom'
          const c = {
            face: isBottom ? col.back : col.face,
            back: col.back,
            edge: col.edge,
          }
          const meta: PartMeta = {
            id:        `${p.part_type}_${i}`,
            label:     DB_LABELS[p.part_type],
            w: b.w, h: b.h, d: b.d,
            thickness: p.DZ,
            edge:      p.edge_band,
            panelKind: kind,
          }
          return (
            <Part
              key={meta.id}
              b={b}
              faceColors={panelFaceColors(kind, p.part_type, c.face, c.back, c.edge)}
              edgeLineColor={col.edge}
              meta={meta}
              selected={selectedPart?.id === meta.id}
              highlighted={false}
              onSelect={setSelectedPart}
              dragRef={dragRef}
            />
          )
        })}
      </group>
    </PreviewCanvas>
  )
}
