'use client'

import { useRef, useState } from 'react'
import type { ResolvedDrawerBoxPart } from '@/src/lib/resolver/types'
import {
  Box, PanelKind, PartMeta, EbSpec,
  panelFaceColors,
  Part, PartPropertiesPanel, PreviewCanvas,
} from '@/src/components/three/PartViewer'
import { SlideModel } from '@/src/components/three/SlideModel'

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

const SLIDE_H = 30   // 5-piece runner band height (mm) — matches 2D views

export interface RunnerSpec {
  thickness:      number               // mm, runner_thickness from slide
  nominal_length: number | null        // mm, optional
  colour:         string | null
  // 3D model — when modelUrl + modelFormat are set, render the uploaded model
  // for both rails instead of the procedural metallic boxes.
  modelUrl?:      string | null
  modelFormat?:   'glb' | 'stl' | 'obj' | null
  modelScale?:    number
  anchorX?:       number
  anchorY?:       number
  anchorZ?:       number
}

export default function DrawerBox3DView({
  parts, boxWidth, boxHeight, boxDepth, matCol, ebSpec, runner, isSystem,
  matColById, ebSpecById, slideSetback = 0,
}: {
  parts:     ResolvedDrawerBoxPart[]
  boxWidth:  number
  boxHeight: number
  boxDepth:  number
  matCol?:   MatColour
  ebSpec?:   EbSpec
  runner?:   RunnerSpec | null
  isSystem?: boolean
  // Per-id lookups so parts that carry their own material_id / edge_band.id
  // (e.g. inner-drawer fronts using a Front material distinct from the Box)
  // render with the right colour and banding instead of the global default.
  matColById?: Record<string, MatColour>
  ebSpecById?: Record<string, EbSpec>
  // mm to recess the slides into the cabinet from the front plane — matches
  // the whole-drawer setback so slides travel with the drawer assembly.
  slideSetback?: number
}) {
  const [selectedPart, setSelectedPart] = useState<PartMeta | null>(null)
  const dragRef = useRef(false)
  const col = matCol ?? FALLBACK_COL

  const ox = -boxWidth  / 2
  const oy = -boxHeight / 2
  const oz = -boxDepth  / 2

  const sw          = runner?.thickness ?? 0
  const showRunners = sw > 0
  const runnerH     = isSystem ? boxHeight : SLIDE_H
  const runnerD     = isSystem
    ? boxDepth
    : Math.min(runner?.nominal_length ?? boxDepth, boxDepth)
  const runnerCol   = runner?.colour ?? '#6b7280'
  // Resolver lays parts out from X=0..boxW (= boxWidth - 2*sw). Centre them inside
  // the cabinet by shifting the drawer-parts group right by `sw`.
  const partShift   = sw

  return (
    <PreviewCanvas
      dx={boxWidth} dy={boxHeight} dz={boxDepth}
      bgColor="#111827"
      enablePan={false}
      onDeselect={() => setSelectedPart(null)}
      overlay={selectedPart && <PartPropertiesPanel part={selectedPart} onClose={() => setSelectedPart(null)} />}
    >
      <group position={[ox, oy, oz]}>
        {/* Drawer runners — drawn alongside the box parts */}
        {showRunners && (() => {
          // Local coords: x=0..boxWidth (cabinet), y=0..boxHeight, z=0..boxDepth.
          // 2D side view places runner at z=0..runnerD where z=0 = front of box.
          // The 3D part transform maps resolver-z=0 → local-z=boxDepth (front of cabinet).
          // So runner spans local z = boxDepth - runnerD .. boxDepth.
          const zStart    = boxDepth - runnerD - slideSetback
          const zFront    = boxDepth - slideSetback
          const hasModel  = !!(runner?.modelUrl && runner?.modelFormat)
          const fbBox     = { w: sw, h: runnerH, d: runnerD }
          const anchor    = { x: runner?.anchorX ?? 0, y: runner?.anchorY ?? 0, z: runner?.anchorZ ?? 0 }
          const modelScl  = runner?.modelScale ?? 1
          // Front-top-outer corner of each rail (model convention origin).
          const lOrigin: [number, number, number] = [0,        runnerH, zFront]
          const rOrigin: [number, number, number] = [boxWidth, runnerH, zFront]
          if (hasModel) {
            return (
              <>
                <SlideModel
                  url={runner!.modelUrl!} format={runner!.modelFormat!}
                  scale={modelScl} anchor={anchor}
                  position={lOrigin} sideOrientation="left"
                  color={runnerCol} fallbackBox={fbBox}
                />
                <SlideModel
                  url={runner!.modelUrl!} format={runner!.modelFormat!}
                  scale={modelScl} anchor={anchor}
                  position={rOrigin} sideOrientation="right"
                  color={runnerCol} fallbackBox={fbBox}
                />
              </>
            )
          }
          const lBox = { x: 0,             y: 0, z: zStart, w: sw, h: runnerH, d: runnerD }
          const rBox = { x: boxWidth - sw, y: 0, z: zStart, w: sw, h: runnerH, d: runnerD }
          return (
            <>
              {[lBox, rBox].map((b, i) => (
                <mesh key={i} position={[b.x + b.w / 2, b.y + b.h / 2, b.z + b.d / 2]}>
                  <boxGeometry args={[b.w, b.h, b.d]} />
                  <meshStandardMaterial color={runnerCol} roughness={0.4} metalness={0.6} />
                </mesh>
              ))}
            </>
          )
        })()}
        <group position={[partShift, 0, 0]}>
          {parts.map((p, i) => {
            const { box: b, kind } = dbBoxAndKind(p, boxDepth)
            const isBottom = p.part_type === 'db_bottom'
            // Prefer a per-part material colour when the resolver stamped a
            // distinct material_id on the part (inner-drawer front uses the
            // schedule's Front material; bottom can use the Bottom material).
            const partCol = (p.material_id && matColById?.[p.material_id]) || col
            const c = {
              face: isBottom ? partCol.back : partCol.face,
              back: partCol.back,
              edge: partCol.edge,
            }
            const partEbSpec = (p.edge_band?.id && ebSpecById?.[p.edge_band.id]) || ebSpec
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
                edgeLineColor={partCol.edge}
                meta={meta}
                selected={selectedPart?.id === meta.id}
                highlighted={false}
                onSelect={setSelectedPart}
                dragRef={dragRef}
                ebSpec={partEbSpec}
              />
            )
          })}
        </group>
      </group>
    </PreviewCanvas>
  )
}
