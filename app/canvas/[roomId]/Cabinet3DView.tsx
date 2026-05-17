'use client'

import { useRef, useState } from 'react'
import type { CabinetInstance } from '@/src/lib/types'
import type {
  ResolvedCabinet, ResolvedCasePart, ResolvedToekickPart,
  ResolvedInternalPart, ResolvedFaceZone,
} from '@/src/lib/resolver/types'
import {
  Box, PanelKind, PartMeta,
  MatColSpec, MatColMap, EbSpec,
  panelFaceColors, unpackMatCol,
  Part, PartPropertiesPanel, PreviewCanvas,
} from '@/src/components/three/PartViewer'

export type { MatColSpec, MatColMap }

// ── Cabinet-specific coordinate helpers ───────────────────────────────────────
// Cabinet origin = bottom-left-back corner (+X=right, +Y=up, +Z=front).
// Each helper returns { x,y,z (part origin), w (X extent), h (Y extent), d (Z extent) }.

function isSide(k: string) { return k === 'left_side' || k === 'right_side' }

function caseBox(p: ResolvedCasePart): Box {
  if (isSide(p.part_key))
    return { x: p.X, y: p.Y, z: p.Z, w: p.DZ, h: p.DY, d: p.DX }
  if (p.part_key === 'back')
    return { x: p.X, y: p.Y + p.DZ, z: p.Z, w: p.DY, h: p.DX, d: p.DZ }
  return { x: p.X, y: p.Y, z: p.Z, w: p.DY, h: p.DZ, d: p.DX }
}

function tkBox(p: ResolvedToekickPart): Box {
  return p.part_key === 'spreader_horizontal'
    ? { x: p.X, y: p.Y, z: p.Z, w: p.DX, h: p.DY, d: p.DZ }
    : { x: p.X, y: p.Y, z: p.Z, w: p.DY, h: p.DX, d: p.DZ }
}

function intBox(p: ResolvedInternalPart): Box {
  return { x: p.X, y: p.Y, z: p.Z, w: p.DY, h: p.DZ, d: p.DX }
}

function zoneBox(z: ResolvedFaceZone): Box {
  return { x: z.X, y: z.Y, z: z.Z, w: z.DY, h: z.DX, d: z.DZ }
}

// ── Part labels ────────────────────────────────────────────────────────────────

const CASE_LABELS: Record<string, string> = {
  left_side:  'Left Gable',
  right_side: 'Right Gable',
  bottom:     'Bottom Panel',
  back:       'Back Panel',
  full_top:   'Top Panel',
  front_rail: 'Front Top Rail',
  back_rail:  'Back Top Rail',
}

const TK_LABELS: Record<string, string> = {
  kick_front_face:     'Toe Kick Face',
  kick_sub_front:      'Toe Kick Sub-Front',
  kick_back:           'Toe Kick Back',
  spreader_vertical:   'Toe Kick Leg',
  spreader_horizontal: 'Toe Kick Spreader',
}

const INT_LABELS: Record<string, string> = {
  adj_shelf:           'Adjustable Shelf',
  fixed_shelf:         'Fixed Shelf',
  inner_drawer_bottom: 'Inner Drawer Bottom',
  inner_drawer_back:   'Inner Drawer Back',
}

const FACE_LABELS: Record<string, string> = {
  door:        'Door',
  drawer_face: 'Drawer Face',
  false_panel: 'False Panel',
}

// ── PartMeta builders ─────────────────────────────────────────────────────────

function buildCaseInfo(p: ResolvedCasePart, b: Box): PartMeta {
  return {
    id:        `case_${p.part_key}`,
    label:     CASE_LABELS[p.part_key] ?? p.part_key,
    w: b.w, h: b.h, d: b.d,
    thickness: p.DZ,
    edge:      p.edge_band,
    panelKind: isSide(p.part_key) ? 'side' : p.part_key === 'back' ? 'face' : 'horizontal',
  }
}

function buildTkInfo(p: ResolvedToekickPart, b: Box): PartMeta {
  return {
    id:        `tk_${p.part_key}_${p.sort_order}`,
    label:     TK_LABELS[p.part_key] ?? p.part_key,
    w: b.w, h: b.h, d: b.d,
    thickness: p.DZ,
    edge:      p.edge_band,
    panelKind: p.part_key === 'spreader_horizontal' ? 'horizontal' : 'face',
    detail:    p.sort_order > 0 ? `#${p.sort_order}` : undefined,
  }
}

function buildIntInfo(p: ResolvedInternalPart, b: Box): PartMeta {
  return {
    id:        `int_${p.part_type}_${p.sort_order}`,
    label:     `${INT_LABELS[p.part_type] ?? p.part_type} ${p.sort_order + 1}`,
    w: b.w, h: b.h, d: b.d,
    thickness: p.DZ,
    edge:      p.edge_band,
    panelKind: 'horizontal',
    detail:    p.y_locked ? 'Position locked' : undefined,
  }
}

function buildZoneInfo(z: ResolvedFaceZone, b: Box): PartMeta {
  return {
    id:        `zone_${z.row_index}_${z.col_index}`,
    label:     FACE_LABELS[z.face_type] ?? z.face_type,
    w: b.w, h: b.h, d: b.d,
    thickness: z.DZ,
    edge:      z.edge_band,
    panelKind: 'face',
    detail:    [
      `Row ${z.row_index + 1}, Col ${z.col_index + 1}`,
      z.hinge_side ? `Hinge: ${z.hinge_side}` : null,
    ].filter(Boolean).join(' · '),
  }
}

// ── Cabinet scene ─────────────────────────────────────────────────────────────

function CabinetScene({
  cab, rp, selected, onSelect, highlightPartKeys, materialColours, ebByMatId,
}: {
  cab:               CabinetInstance
  rp:                ResolvedCabinet
  selected:          PartMeta | null
  onSelect:          (info: PartMeta | null) => void
  highlightPartKeys?: string[] | null
  materialColours?:  MatColMap
  ebByMatId?:        Record<string, { thickness: number; color: string | null }>
}) {
  const { dx, dy, dz } = cab
  const dragRef = useRef(false)
  const hlSet   = highlightPartKeys ? new Set(highlightPartKeys) : null

  function matSpec(matId: string, fallback: string) {
    return unpackMatCol(materialColours?.[matId], fallback)
  }

  function ebFor(matId: string): EbSpec | undefined {
    const spec = ebByMatId?.[matId]
    if (!spec) return undefined
    return { thick: spec.thickness, color: spec.color ?? '#c8b89a' }
  }

  return (
    <group position={[-dx / 2, -dy / 2, -dz / 2]}>
      {rp.case_parts.map((p, i) => {
        const b    = caseBox(p)
        const info = buildCaseInfo(p, b)
        const s    = matSpec(p.material_id, '#ddd3bb')
        return (
          <Part
            key={`c${i}`}
            b={b}
            faceColors={panelFaceColors(info.panelKind, p.part_key, s.face, s.back, s.edge)}
            edgeLineColor="#b8a98e"
            meta={info}
            selected={selected?.id === info.id}
            highlighted={hlSet?.has(p.part_key) ?? false}
            onSelect={onSelect}
            dragRef={dragRef}
            ebSpec={ebFor(p.material_id)}
          />
        )
      })}
      {rp.toekick_parts.map((p, i) => {
        const b    = tkBox(p)
        const info = buildTkInfo(p, b)
        const s    = matSpec(p.material_id, '#78716c')
        return (
          <Part
            key={`t${i}`}
            b={b}
            faceColors={panelFaceColors(info.panelKind, p.part_key, s.face, s.back, s.edge)}
            edgeLineColor="#57534e"
            meta={info}
            selected={selected?.id === info.id}
            highlighted={hlSet?.has(p.part_key) ?? false}
            onSelect={onSelect}
            dragRef={dragRef}
            ebSpec={ebFor(p.material_id)}
          />
        )
      })}
      {rp.internal_parts.map((p, i) => {
        const b    = intBox(p)
        const info = buildIntInfo(p, b)
        const s    = matSpec(p.material_id, '#e8dece')
        return (
          <Part
            key={`s${i}`}
            b={b}
            faceColors={panelFaceColors(info.panelKind, p.part_type, s.face, s.back, s.edge)}
            edgeLineColor="#c4b49c"
            meta={info}
            selected={selected?.id === info.id}
            highlighted={hlSet?.has(p.part_type) ?? false}
            onSelect={onSelect}
            dragRef={dragRef}
            ebSpec={ebFor(p.material_id)}
          />
        )
      })}
      {rp.face_zones.filter(z => z.face_type !== 'open').map((z, i) => {
        const b    = zoneBox(z)
        const info = buildZoneInfo(z, b)
        const isDoor = z.face_type !== 'drawer_face'
        const s    = matSpec(z.material_id, isDoor ? '#f0ebe0' : '#e2d9c8')
        return (
          <Part
            key={`f${i}`}
            b={b}
            faceColors={panelFaceColors(info.panelKind, z.face_type, s.face, s.back, s.edge)}
            edgeLineColor="#b8a98e"
            meta={info}
            selected={selected?.id === info.id}
            highlighted={hlSet?.has(z.face_type) ?? false}
            onSelect={onSelect}
            dragRef={dragRef}
            ebSpec={ebFor(z.material_id)}
          />
        )
      })}
    </group>
  )
}

// ── Public component ─────────────────────────────────────────────────────────

export default function Cabinet3DView({
  cab, rp, highlightPartKeys, materialColours, ebByMatId,
}: {
  cab:               CabinetInstance
  rp?:               ResolvedCabinet
  highlightPartKeys?: string[] | null
  materialColours?:  MatColMap
  ebByMatId?:        Record<string, { thickness: number; color: string | null }>
}) {
  const [selectedPart, setSelectedPart] = useState<PartMeta | null>(null)
  const { dx, dy, dz } = cab

  return (
    <PreviewCanvas
      dx={dx} dy={dy} dz={dz}
      bgColor="#e8e4de"
      enablePan
      onDeselect={() => setSelectedPart(null)}
      overlay={selectedPart && <PartPropertiesPanel part={selectedPart} onClose={() => setSelectedPart(null)} />}
    >
      {rp ? (
        <CabinetScene
          cab={cab} rp={rp}
          selected={selectedPart} onSelect={setSelectedPart}
          highlightPartKeys={highlightPartKeys}
          materialColours={materialColours}
          ebByMatId={ebByMatId}
        />
      ) : (
        <mesh>
          <boxGeometry args={[dx, dy, dz]} />
          <meshStandardMaterial color="#ddd3bb" roughness={0.7} />
        </mesh>
      )}
    </PreviewCanvas>
  )
}
