'use client'

import { useRef, useState, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { supabase } from '@/src/lib/supabase'
import { patchEdgeOverrideCache } from '@/src/lib/resolver/resolveCabinetFromDB'
import type { CabinetInstance } from '@/src/lib/types'
import type {
  ResolvedCabinet, ResolvedCasePart, ResolvedToekickPart,
  ResolvedInternalPart, ResolvedFaceZone,
  ResolvedDrawerStack, ResolvedDrawerSlide, ResolvedDrawerBoxPart,
} from '@/src/lib/resolver/types'
import {
  Box, PanelKind, PartMeta, PartEdge,
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

function dbBox(p: ResolvedDrawerBoxPart): Box {
  // Resolver Z is the front face; subtract depth extent to get the minimum-Z (back) corner.
  switch (p.part_type) {
    case 'db_left_side':
    case 'db_right_side':
      return { x: p.X, y: p.Y, z: p.Z - p.DX, w: p.DZ, h: p.DY, d: p.DX }
    case 'db_bottom':
      return { x: p.X, y: p.Y, z: p.Z - p.DX, w: p.DY, h: p.DZ, d: p.DX }
    case 'db_front':
    case 'db_back':
    default:
      return { x: p.X, y: p.Y, z: p.Z - p.DZ, w: p.DY, h: p.DX, d: p.DZ }
  }
}

function slideBox(s: ResolvedDrawerSlide): Box {
  // DX=depth (Z direction), DY=channel height (Y direction), DZ=runner thickness (X direction)
  return { x: s.X, y: s.Y, z: s.Z, w: s.DZ, h: s.DY, d: s.DX }
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

const DB_PART_LABELS: Record<string, string> = {
  db_left_side:  'Drawer Box Left Side',
  db_right_side: 'Drawer Box Right Side',
  db_bottom:     'Drawer Box Bottom',
  db_front:      'Drawer Box Front',
  db_back:       'Drawer Box Back',
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

function buildDbPartInfo(p: ResolvedDrawerBoxPart, b: Box, stack: ResolvedDrawerStack): PartMeta {
  return {
    id:        `db_${stack.face_zone_row}_${stack.face_zone_col}_${p.part_type}`,
    label:     DB_PART_LABELS[p.part_type] ?? p.part_type,
    w: b.w, h: b.h, d: b.d,
    thickness: p.DZ,
    edge:      p.edge_band,
    panelKind: (p.part_type === 'db_left_side' || p.part_type === 'db_right_side') ? 'side'
               : (p.part_type === 'db_bottom') ? 'horizontal' : 'face',
    detail:    `Row ${stack.face_zone_row + 1}, Col ${stack.face_zone_col + 1} · ${stack.drawer_type}`,
  }
}

function buildSlideInfo(s: ResolvedDrawerSlide, b: Box, stack: ResolvedDrawerStack): PartMeta {
  return {
    id:        `slide_${stack.face_zone_row}_${stack.face_zone_col}_${s.side}`,
    label:     `Drawer Slide (${s.side})`,
    w: b.w, h: b.h, d: b.d,
    thickness: s.DZ,
    edge:      { top: false, bottom: false, left: false, right: false },
    panelKind: 'side',
    detail:    `${s.nominal_length}mm NL · Box ht ${s.box_height}mm`,
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

// ── Door panel with animated hinge ────────────────────────────────────────────
// Wraps Part in a group whose Y rotation is lerped each frame toward the open/closed target.
// hingeX is the cabinet-space X of the hinge edge; the Part is offset so that edge aligns
// with the group origin, enabling rotation around it.

type PartProps = {
  faceColors:         [string, string, string, string, string, string]
  edgeLineColor:      string
  meta:               PartMeta
  selected:           boolean
  highlighted:        boolean
  onSelect:           (info: PartMeta | null) => void
  dragRef:            React.MutableRefObject<boolean>
  ebSpec?:            EbSpec
  contextMenuSelect?: boolean
  wire?:              boolean
}

function DoorPanel({ b, hingeSide, doorsOpen, ...partProps }: PartProps & {
  b:          Box
  hingeSide:  'left' | 'right'
  doorsOpen:  boolean
}) {
  const groupRef     = useRef<THREE.Group>(null)
  const curAngle     = useRef(0)
  const doorsOpenRef = useRef(doorsOpen)
  doorsOpenRef.current = doorsOpen

  const openAngle = hingeSide === 'left' ? -Math.PI / 2 : Math.PI / 2
  const hingeX    = hingeSide === 'left' ? b.x : b.x + b.w
  const localB: Box = { x: hingeSide === 'left' ? 0 : -b.w, y: 0, z: 0, w: b.w, h: b.h, d: b.d }

  useFrame(() => {
    if (!groupRef.current) return
    const target = doorsOpenRef.current ? openAngle : 0
    if (Math.abs(curAngle.current - target) < 0.001) {
      curAngle.current = target
      groupRef.current.rotation.y = target
      return
    }
    curAngle.current = THREE.MathUtils.lerp(curAngle.current, target, 0.12)
    groupRef.current.rotation.y = curAngle.current
  })

  return (
    <group ref={groupRef} position={[hingeX, b.y, b.z]}>
      <Part b={localB} {...partProps} />
    </group>
  )
}

// ── Edge band persistence ─────────────────────────────────────────────────────
// Parses PartMeta.id to determine which table/row to update. Internal parts use
// front/back column names instead of right/left due to their coordinate mapping.

async function saveEdge(cabId: string, part: PartMeta) {
  const { id, edge } = part
  const direct = { edge_band_top: edge.top, edge_band_bottom: edge.bottom,
                   edge_band_left: edge.left, edge_band_right: edge.right }

  let result: { error: unknown }

  if (id.startsWith('case_')) {
    result = await supabase.from('case_parts').update(direct)
      .eq('cabinet_instance_id', cabId).eq('part_key', id.slice(5))

  } else if (id.startsWith('tk_')) {
    const rest = id.slice(3), cut = rest.lastIndexOf('_')
    result = await supabase.from('toekick_parts').update(direct)
      .eq('cabinet_instance_id', cabId)
      .eq('part_key', rest.slice(0, cut))
      .eq('sort_order', parseInt(rest.slice(cut + 1)))

  } else if (id.startsWith('int_')) {
    const rest = id.slice(4), cut = rest.lastIndexOf('_')
    result = await supabase.from('internal_parts').update({
      edge_band_top: edge.top, edge_band_bottom: edge.bottom,
      edge_band_back: edge.left, edge_band_front: edge.right,
    }).eq('cabinet_instance_id', cabId)
      .eq('part_type', rest.slice(0, cut))
      .eq('sort_order', parseInt(rest.slice(cut + 1)))

  } else if (id.startsWith('zone_')) {
    const [row, col] = id.slice(5).split('_').map(Number)
    result = await supabase.from('face_zones').update(direct)
      .eq('cabinet_instance_id', cabId)
      .eq('row_index', row).eq('col_index', col)

  } else {
    return // drawer box / slide parts — no edge band columns
  }

  if (result.error) console.error('[edge save]', result.error)
  else patchEdgeOverrideCache(cabId, id, edge)
}

// ── Cabinet scene ─────────────────────────────────────────────────────────────

function CabinetScene({
  cab, rp, selected, onSelect, highlightPartKeys, materialColours, ebByMatId, doorsOpen, edgeOverrides, wire,
}: {
  cab:               CabinetInstance
  rp:                ResolvedCabinet
  selected:          PartMeta | null
  onSelect:          (info: PartMeta | null) => void
  highlightPartKeys?: string[] | null
  materialColours?:  MatColMap
  ebByMatId?:        Record<string, { thickness: number; color: string | null }>
  doorsOpen:         boolean
  edgeOverrides:     Map<string, PartEdge>
  wire?:             boolean
}) {
  const { dx, dy, dz } = cab
  const dragRef = useRef(false)
  const hlSet   = highlightPartKeys ? new Set(highlightPartKeys) : null

  function applyEdge<T extends PartMeta>(info: T): T {
    const ov = edgeOverrides.get(info.id)
    return ov ? { ...info, edge: ov } : info
  }

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
        const info = applyEdge(buildCaseInfo(p, b))
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
            contextMenuSelect
            dragRef={dragRef}
            ebSpec={ebFor(p.material_id)}
            wire={wire}
          />
        )
      })}
      {rp.toekick_parts.map((p, i) => {
        const b    = tkBox(p)
        const info = applyEdge(buildTkInfo(p, b))
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
            contextMenuSelect
            dragRef={dragRef}
            ebSpec={ebFor(p.material_id)}
            wire={wire}
          />
        )
      })}
      {rp.internal_parts.map((p, i) => {
        const b    = intBox(p)
        const info = applyEdge(buildIntInfo(p, b))
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
            contextMenuSelect
            dragRef={dragRef}
            ebSpec={ebFor(p.material_id)}
            wire={wire}
          />
        )
      })}
      {(rp.drawer_stacks ?? []).flatMap((stack, si) => {
        const slideColor = '#6b7280'

        const boxParts = stack.box_parts.map((p, pi) => {
          const b    = dbBox(p)
          const info = buildDbPartInfo(p, b, stack)
          const s    = matSpec(p.material_id, '#d4c8a8')
          const faceColors = panelFaceColors(info.panelKind as PanelKind, p.part_type, s.face, s.back, s.edge)
          return (
            <Part
              key={`db_${si}_${pi}`}
              b={b}
              faceColors={faceColors}
              edgeLineColor="#8a7a60"
              meta={info}
              selected={selected?.id === info.id}
              highlighted={false}
              onSelect={onSelect}
              contextMenuSelect
              dragRef={dragRef}
              ebSpec={ebFor(p.material_id)}
              wire={wire}
            />
          )
        })

        const slideparts = stack.slides.map((s, li) => {
          const b    = slideBox(s)
          const info = buildSlideInfo(s, b, stack)
          const sc   = s.colour ?? slideColor
          const faceColors = panelFaceColors('side', `slide_${s.side}`, sc, sc, sc)
          return (
            <Part
              key={`sl_${si}_${li}`}
              b={b}
              faceColors={faceColors}
              edgeLineColor="#4b5563"
              meta={info}
              selected={selected?.id === info.id}
              highlighted={false}
              onSelect={onSelect}
              contextMenuSelect
              dragRef={dragRef}
              wire={wire}
            />
          )
        })

        return [...boxParts, ...slideparts]
      })}
      {rp.face_zones.filter(z => z.face_type !== 'open').map((z, i) => {
        const b    = zoneBox(z)
        const info = applyEdge(buildZoneInfo(z, b))
        const isDoor = z.face_type !== 'drawer_face'
        const s    = matSpec(z.material_id, isDoor ? '#f0ebe0' : '#e2d9c8')
        const faceColors = panelFaceColors(info.panelKind, z.face_type, s.face, s.back, s.edge)
        const partProps: PartProps = {
          faceColors,
          edgeLineColor:    '#b8a98e',
          meta:             info,
          selected:         selected?.id === info.id,
          highlighted:      hlSet?.has(z.face_type) ?? false,
          onSelect,
          contextMenuSelect: true,
          dragRef,
          ebSpec:           ebFor(z.material_id),
          wire,
        }

        if (z.face_type === 'door' && z.hinge_side) {
          return (
            <DoorPanel
              key={`f${i}`}
              b={b}
              hingeSide={z.hinge_side}
              doorsOpen={doorsOpen}
              {...partProps}
            />
          )
        }

        return <Part key={`f${i}`} b={b} {...partProps} />
      })}
    </group>
  )
}

// ── Public component ─────────────────────────────────────────────────────────

export default function Cabinet3DView({
  cab, rp, highlightPartKeys, materialColours, ebByMatId, wire = false,
}: {
  cab:               CabinetInstance
  rp?:               ResolvedCabinet
  highlightPartKeys?: string[] | null
  materialColours?:  MatColMap
  ebByMatId?:        Record<string, { thickness: number; color: string | null }>
  wire?:             boolean
}) {
  const [selectedPart, setSelectedPart]   = useState<PartMeta | null>(null)
  const [doorsOpen, setDoorsOpen]         = useState(false)
  const [edgeOverrides, setEdgeOverrides] = useState<Map<string, PartEdge>>(new Map())
  const { dx, dy, dz } = cab

  const didHitPartRef   = useRef(false)
  const prevPartRef     = useRef<PartMeta | null>(null)
  const originalEdgeRef = useRef<PartEdge | null>(null)

  // Persist edge band changes when the selection moves away from a part.
  useEffect(() => {
    const prev  = prevPartRef.current
    const prevId = prev?.id
    const curId  = selectedPart?.id

    if (prev && prevId !== curId && originalEdgeRef.current) {
      const orig    = originalEdgeRef.current
      const changed = (Object.keys(orig) as (keyof PartEdge)[]).some(k => prev.edge[k] !== orig[k])
      if (changed) saveEdge(cab.id, prev)
    }

    if (selectedPart && selectedPart.id !== prevId) {
      originalEdgeRef.current = { ...selectedPart.edge }
    } else if (!selectedPart) {
      originalEdgeRef.current = null
    }
    prevPartRef.current = selectedPart
  }, [selectedPart]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelect(info: PartMeta | null) {
    if (info !== null) didHitPartRef.current = true
    setSelectedPart(info)
  }

  function handleEdgeChange(edge: PartEdge) {
    setSelectedPart(prev => {
      if (!prev) return null
      setEdgeOverrides(m => { const n = new Map(m); n.set(prev.id, edge); return n })
      return { ...prev, edge }
    })
  }

  function handleCanvasContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    if (!didHitPartRef.current) setSelectedPart(null)
    didHitPartRef.current = false
  }

  const hasDoors = rp?.face_zones.some(z => z.face_type === 'door' && z.hinge_side) ?? false

  return (
    <PreviewCanvas
      dx={dx} dy={dy} dz={dz}
      bgColor="#e8e4de"
      enablePan
      onDeselect={() => setSelectedPart(null)}
      onContextMenu={handleCanvasContextMenu}
      hint="Left-drag rotate · scroll zoom · right-click part to inspect · click empty to deselect"
      overlay={
        <>
          {selectedPart && <PartPropertiesPanel part={selectedPart} onClose={() => setSelectedPart(null)} onEdgeChange={handleEdgeChange} />}
          {hasDoors && (
            <button
              onClick={() => setDoorsOpen(o => !o)}
              className="absolute bottom-8 right-3 text-[11px] font-mono text-orange-700 hover:text-orange-600 bg-white/70 hover:bg-white/90 border border-orange-300 hover:border-orange-400 rounded px-2 py-1 transition-colors pointer-events-auto select-none"
            >
              {doorsOpen ? 'Close doors' : 'Open doors'}
            </button>
          )}
        </>
      }
    >
      {rp ? (
        <CabinetScene
          cab={cab} rp={rp}
          selected={selectedPart} onSelect={handleSelect}
          highlightPartKeys={highlightPartKeys}
          materialColours={materialColours}
          ebByMatId={ebByMatId}
          doorsOpen={doorsOpen}
          edgeOverrides={edgeOverrides}
          wire={wire}
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
