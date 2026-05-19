'use client'

import { useRef, useState } from 'react'
import type { ResolvedDrawerBoxPart } from '@/src/lib/resolver/types'
import {
  Box, PanelKind, PartMeta, EbSpec,
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
// Resolver uses Z=0=front; three.js group sits at -D/2 with +Z toward viewer.
// Transform: box.z = D - local_Z - depth_extent (maps front→world+D/2, back→world-D/2).

function dbBoxAndKind(p: ResolvedDrawerBoxPart, D: number): { box: Box; kind: PanelKind } {
  switch (p.part_type) {
    case 'db_left_side':
    case 'db_right_side':
      return { box: { x: p.X, y: p.Y, z: D - p.Z - p.DX, w: p.DZ, h: p.DY, d: p.DX }, kind: 'side' }
    case 'db_bottom':
      return { box: { x: p.X, y: p.Y, z: D - p.Z - p.DX, w: p.DY, h: p.DZ, d: p.DX }, kind: 'horizontal' }
    case 'db_front':
    case 'db_back':
      return { box: { x: p.X, y: p.Y, z: D - p.Z - p.DZ, w: p.DY, h: p.DX, d: p.DZ }, kind: 'face' }
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DrawerBox3DView({
  parts, boxWidth, boxHeight, boxDepth, matCol, ebSpec,
}: {
  parts:     ResolvedDrawerBoxPart[]
  boxWidth:  number
  boxHeight: number
  boxDepth:  number
  matCol?:   MatColour
  ebSpec?:   EbSpec
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
          const { box: b, kind } = dbBoxAndKind(p, boxDepth)
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
              ebSpec={ebSpec}
            />
          )
        })}
      </group>
    </PreviewCanvas>
  )
}
