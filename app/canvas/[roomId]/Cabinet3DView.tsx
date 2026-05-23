'use client'

import { useRef, useState, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { supabase } from '@/src/lib/supabase'
import { patchEdgeOverrideCache } from '@/src/lib/resolver/resolveCabinetFromDB'
import type { CabinetInstance } from '@/src/lib/types'
import type {
  ResolvedCabinet, ResolvedCasePart, ResolvedToekickPart,
  ResolvedInternalPart, ResolvedFaceZone,
  ResolvedDrawerStack, ResolvedDrawerSlide, ResolvedDrawerBoxPart,
  ResolvedSeamJoint, JointTypeOp,
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

// ── Seam joint visualization ──────────────────────────────────────────────────
// Shows Part A's touching face as a flat wireframe rectangle (Joint3DView green-zone
// style) plus drill-op markers where operations are defined.
// Blue = CM method default, Green = cabinet override.
//
// Coordinate transform: JV = joint-view coords (X=0 at interface, Y=0 at Part A top).
// Cabinet coords = actual 3D position derived from boxA/boxB.
//
// :left_side seams  — interface X = boxA.x.  JV and cabinet X are MIRRORED: Part A
//   body goes +X in cabinet but -X in JV, so cabinet_X = interfaceX - jv_x.
//   Axis X also flips: JV 'x+' ↔ cabinet 'x-'.
// :right_side seams — interface X = boxA.x+boxA.w. No mirror; Part A body goes -X in
//   both JV and cabinet: cabinet_X = interfaceX + jv_x, axis unchanged.

// Expression evaluator: supports math globals + part-dimension variables.
function evalExpr(expr: string, vars: Record<string, number>): number | null {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(...Object.keys(vars), `'use strict'; return +(${expr})`)
    const result = fn(...Object.values(vars))
    return Number.isFinite(result) ? result : null
  } catch { return null }
}

// Resolve a JointTypeOp's numeric fields + qty/spacing against actual part dimensions.
// Matches the same variable set as JointPreviewPanel.buildVars.
function evalOp(op: JointTypeOp, boxA: Box, boxB: Box): {
  tool_diameter_mm: number; depth_mm: number
  offset_x_mm: number; offset_y_mm: number; offset_z_mm: number
  qty: number; spacing_mm: number | null
} {
  const exprs = op.expressions ?? {}
  const isA   = op.target_part === 'part_a'
  const vars: Record<string, number> = {
    // target-part dimensions
    W:  isA ? boxA.w : boxB.w,
    L:  isA ? boxA.h : boxB.h,
    D:  isA ? boxA.d : boxB.d,
    T:  boxA.h,  // material thickness (Part A height = shelf/panel thickness)
    // master (Part A) dimensions
    MW: boxA.w, ML: boxA.h, MD: boxA.d,
    // slave (Part B) dimensions
    SW: boxB.w, SL: boxB.h, SD: boxB.d,
  }
  const ev = (field: string, fallback: number) =>
    exprs[field] != null ? (evalExpr(exprs[field], vars) ?? fallback) : fallback

  const rawQty = exprs.qty != null
    ? (evalExpr(exprs.qty, vars) ?? (op.qty ?? 1))
    : (op.qty ?? 1)
  const rawSpc = exprs.spacing_mm != null
    ? (evalExpr(exprs.spacing_mm, vars) ?? op.spacing_mm)
    : op.spacing_mm

  return {
    tool_diameter_mm: ev('tool_diameter_mm', op.tool_diameter_mm),
    depth_mm:         ev('depth_mm',         op.depth_mm),
    offset_x_mm:      ev('offset_x_mm',      op.offset_x_mm),
    offset_y_mm:      ev('offset_y_mm',      op.offset_y_mm),
    offset_z_mm:      ev('offset_z_mm',      op.offset_z_mm),
    qty:              Math.max(1, Math.round(rawQty)),
    spacing_mm:       rawSpc,
  }
}

type JointRefPlane =
  | { kind: 'yz'; x: number; yMin: number; yMax: number; zMin: number; zMax: number }
  | { kind: 'xz'; y: number; xMin: number; xMax: number; zMin: number; zMax: number }

type DrillAxis = 'x-' | 'x+' | 'y-' | 'y+'

interface DrillOpPos {
  x: number; y: number; z: number
  axis: DrillAxis
  radius: number
  depthLen: number
}

function computeJointRefPlane(seamKey: string, boxA: Box): JointRefPlane | null {
  const partBKey = seamKey.slice(seamKey.indexOf(':') + 1)
  if (partBKey === 'left_side') {
    return { kind: 'yz', x: boxA.x, yMin: boxA.y, yMax: boxA.y + boxA.h, zMin: boxA.z, zMax: boxA.z + boxA.d }
  }
  if (partBKey === 'right_side') {
    return { kind: 'yz', x: boxA.x + boxA.w, yMin: boxA.y, yMax: boxA.y + boxA.h, zMin: boxA.z, zMax: boxA.z + boxA.d }
  }
  if (partBKey === 'bottom') {
    return { kind: 'xz', y: boxA.y, xMin: boxA.x, xMax: boxA.x + boxA.w, zMin: boxA.z, zMax: boxA.z + boxA.d }
  }
  return null
}

function seamDrillOps(seamKey: string, boxA: Box, boxB: Box, ops: JointTypeOp[]): DrillOpPos[] {
  const partBKey = seamKey.slice(seamKey.indexOf(':') + 1)
  const isLeft  = partBKey === 'left_side'
  const isRight = partBKey === 'right_side'
  if (!isLeft && !isRight) return []

  const interfaceX = isLeft ? boxA.x : boxA.x + boxA.w
  const interfaceY = boxA.y + boxA.h  // JV Y=0

  const result: DrillOpPos[] = []

  for (const op of ops) {
    if (op.machine_operation !== 'drill') continue
    const ev    = evalOp(op, boxA, boxB)
    const U     = (op.face === 'top' || op.face === 'bottom') ? ev.offset_x_mm : ev.offset_y_mm
    const qty   = ev.qty
    const spc   = ev.spacing_mm ?? 0

    for (let i = 0; i < qty; i++) {
      const targetBox = op.target_part === 'part_a' ? boxA : boxB
      // Z: measured from front face of the target part, spacing steps toward back
      const cabZ = (targetBox.z + targetBox.d) - ev.offset_z_mm - i * spc

      let cabX: number, cabY: number, axis: DrillAxis

      if (op.target_part === 'part_a') {
        switch (op.face) {
          case 'normal':
            // Interface face — drill into Part A body
            cabX = interfaceX
            cabY = interfaceY - U
            axis = isLeft ? 'x+' : 'x-'
            break
          case 'end':
            // Far face of Part A (opposite the interface)
            cabX = isLeft ? boxA.x + boxA.w : boxA.x
            cabY = interfaceY - U
            axis = isLeft ? 'x-' : 'x+'
            break
          case 'top':
            cabY = interfaceY
            cabX = isLeft ? interfaceX + U : interfaceX - U
            axis = 'y-'
            break
          case 'bottom':
            cabY = boxA.y
            cabX = isLeft ? interfaceX + U : interfaceX - U
            axis = 'y+'
            break
          default: continue
        }
      } else {
        // Part B (gable): interface face is the inner face (touching Part A)
        const bInner = isLeft ? boxB.x + boxB.w : boxB.x
        switch (op.face) {
          case 'normal':
            // Inner face of gable — drill into gable body (away from Part A)
            cabX = bInner
            cabY = interfaceY - U
            axis = isLeft ? 'x-' : 'x+'
            break
          case 'end':
            // Outer face of gable
            cabX = isLeft ? boxB.x : boxB.x + boxB.w
            cabY = interfaceY - U
            axis = isLeft ? 'x+' : 'x-'
            break
          case 'top':
            cabY = boxB.y + boxB.h
            cabX = isLeft ? bInner - U : bInner + U
            axis = 'y-'
            break
          case 'bottom':
            cabY = boxB.y
            cabX = isLeft ? bInner - U : bInner + U
            axis = 'y+'
            break
          default: continue
        }
      }

      result.push({ x: cabX, y: cabY, z: cabZ, axis, radius: ev.tool_diameter_mm / 2, depthLen: ev.depth_mm })
    }
  }

  return result
}

function JointFaceRect({ plane, color }: { plane: JointRefPlane; color: string }) {
  const geo = useMemo(() => {
    return plane.kind === 'yz'
      ? new THREE.BoxGeometry(0.1, plane.yMax - plane.yMin, plane.zMax - plane.zMin)
      : new THREE.BoxGeometry(plane.xMax - plane.xMin, 0.1, plane.zMax - plane.zMin)
  }, [plane])

  const pos: [number, number, number] = plane.kind === 'yz'
    ? [plane.x, (plane.yMin + plane.yMax) / 2, (plane.zMin + plane.zMax) / 2]
    : [(plane.xMin + plane.xMax) / 2, plane.y, (plane.zMin + plane.zMax) / 2]

  return (
    <lineSegments position={pos}>
      <edgesGeometry args={[geo]} />
      <lineBasicMaterial color={color} opacity={0.85} transparent />
    </lineSegments>
  )
}

function DrillMarker({ x, y, z, axis, radius, depthLen }: DrillOpPos) {
  const r = Math.max(1.5, radius)
  const len = Math.max(2, depthLen)

  const cylQuat = useMemo(() => {
    const q = new THREE.Quaternion()
    if (axis === 'x-' || axis === 'x+') q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
    return q
  }, [axis])

  const offset: [number, number, number] =
    axis === 'x-' ? [-(len / 2), 0, 0] :
    axis === 'x+' ? [(len / 2), 0, 0]  :
    axis === 'y-' ? [0, -(len / 2), 0] :
                    [0, (len / 2), 0]

  return (
    <group position={[x, y, z]}>
      <mesh>
        <sphereGeometry args={[r, 8, 6]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.3} />
      </mesh>
      <mesh position={offset} quaternion={cylQuat}>
        <cylinderGeometry args={[r * 0.6, r * 0.6, len, 8]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.4} transparent opacity={0.55} />
      </mesh>
    </group>
  )
}

function SeamJointOverlay({ seamJoints, boxByKey }: {
  seamJoints: ResolvedSeamJoint[]
  boxByKey: Record<string, Box>
}) {
  const items = useMemo(() => {
    return seamJoints.flatMap(sj => {
      const boxA = boxByKey[sj.part_a_key]
      const boxB = boxByKey[sj.part_b_key]
      if (!boxA || !boxB) return []
      const plane = computeJointRefPlane(sj.seam_key, boxA)
      if (!plane) return []
      const color = sj.source === 'cabinet' ? '#22c55e' : '#60a5fa'
      const drills = seamDrillOps(sj.seam_key, boxA, boxB, sj.ops)
      console.log('[SeamJoint]', sj.seam_key, 'joint:', sj.joint_type_name,
        'raw ops:', sj.ops.length, 'drill markers:', drills.length,
        sj.ops.map(o => ({ face: o.face, target: o.target_part, qty: o.qty, spc: o.spacing_mm, expr: o.expressions })))
      return [{ key: sj.seam_key, plane, color, drills }]
    })
  }, [seamJoints, boxByKey])

  return (
    <group>
      {items.map(item => (
        <group key={item.key}>
          <JointFaceRect plane={item.plane} color={item.color} />
          {item.drills.map((d, i) => (
            <DrillMarker key={i} {...d} />
          ))}
        </group>
      ))}
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

  const boxByKey = useMemo(() => {
    const m: Record<string, Box> = {}
    for (const p of rp.case_parts) m[p.part_key] = caseBox(p)
    return m
  }, [rp.case_parts])

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
      {rp.seam_joints.length > 0 && (
        <SeamJointOverlay seamJoints={rp.seam_joints} boxByKey={boxByKey} />
      )}
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
