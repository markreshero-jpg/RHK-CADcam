'use client'

import { useRef, useState, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { supabase } from '@/src/lib/supabase'
import { patchEdgeOverrideCache } from '@/src/lib/resolver/resolveCabinetFromDB'
import type { CabinetInstance } from '@/src/lib/types'
import type { CabinetCustomPart, PartPosOverrides } from './canvasDB'
import type {
  ResolvedCabinet, ResolvedCasePart, ResolvedToekickPart,
  ResolvedInternalPart, ResolvedFaceZone,
  ResolvedDrawerStack, ResolvedDrawerSlide, ResolvedDrawerBoxPart,
  ResolvedSeamJoint,
} from '@/src/lib/resolver/types'
import {
  Box, PanelKind, PartMeta, PartEdge,
  MatColSpec, MatColMap, EbSpec,
  panelFaceColors, unpackMatCol,
  Part, PartPropertiesPanel, PreviewCanvas,
} from '@/src/components/three/PartViewer'
import { isSide, caseBox, seamDrillOps, type DrillOpPos } from '@/src/lib/jointDrilling'
import PartEdgeJoints from './PartEdgeJoints'

export type { MatColSpec, MatColMap }

// ── Cabinet-specific coordinate helpers ───────────────────────────────────────
// Cabinet origin = bottom-left-back corner (+X=right, +Y=up, +Z=front).
// Each helper returns { x,y,z (part origin), w (X extent), h (Y extent), d (Z extent) }.

function tkBox(p: ResolvedToekickPart): Box {
  return p.part_key === 'spreader_horizontal'
    ? { x: p.X, y: p.Y, z: p.Z, w: p.DX, h: p.DY, d: p.DZ }
    : { x: p.X, y: p.Y, z: p.Z, w: p.DY, h: p.DX, d: p.DZ }
}

function intBox(p: ResolvedInternalPart): Box {
  return p.part_type === 'divider'
    ? { x: p.X, y: p.Y, z: p.Z, w: p.DZ, h: p.DY, d: p.DX }
    : { x: p.X, y: p.Y, z: p.Z, w: p.DY, h: p.DZ, d: p.DX }
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
    panelKind: p.part_type === 'divider' ? 'side' : 'horizontal',
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

// ── Drawer assembly with animated slide-out ───────────────────────────────────
// Groups the drawer face zone, drawer box parts, and slides into one Three.js group.
// targetTravel=0 means closed; any positive value is the Z distance to lerp toward.

function DrawerAssembly({
  faceZone, stack, targetTravel, selected, onSelect,
  faceHighlighted, materialColours, ebByMatId, edgeOverrides, wire, partOverrides, dragRef,
}: {
  faceZone:          ResolvedFaceZone
  stack:             ResolvedDrawerStack
  targetTravel:      number
  selected:          PartMeta | null
  onSelect:          (info: PartMeta | null) => void
  faceHighlighted:   boolean
  materialColours?:  MatColMap
  ebByMatId?:        Record<string, { thickness: number; color: string | null }>
  edgeOverrides:     Map<string, PartEdge>
  wire?:             boolean
  partOverrides?:    PartPosOverrides
  dragRef:           React.MutableRefObject<boolean>
}) {
  const groupRef        = useRef<THREE.Group>(null)
  const curZ            = useRef(0)
  const targetTravelRef = useRef(targetTravel)
  targetTravelRef.current = targetTravel

  useFrame(() => {
    if (!groupRef.current) return
    const target = targetTravelRef.current
    if (Math.abs(curZ.current - target) < 0.5) {
      curZ.current = target
      groupRef.current.position.z = target
      return
    }
    curZ.current = THREE.MathUtils.lerp(curZ.current, target, 0.1)
    groupRef.current.position.z = curZ.current
  })

  function matSpec(matId: string, fallback: string) {
    return unpackMatCol(materialColours?.[matId], fallback)
  }
  function ebFor(matId: string): EbSpec | undefined {
    const spec = ebByMatId?.[matId]
    if (!spec) return undefined
    return { thick: spec.thickness, color: spec.color ?? '#c8b89a' }
  }
  function applyEdgeOv<T extends PartMeta>(info: T): T {
    const ov = edgeOverrides.get(info.id)
    return ov ? { ...info, edge: ov } : info
  }

  const zoneId      = `zone_${faceZone.row_index}_${faceZone.col_index}`
  const pz          = applyPosOv(faceZone, zoneId, partOverrides)
  const zb          = zoneBox(pz)
  const zInfo       = applyEdgeOv(buildZoneInfo(faceZone, zb))
  const zs          = matSpec(faceZone.material_id, '#e2d9c8')
  const zFaceColors = panelFaceColors(zInfo.panelKind, faceZone.face_type, zs.face, zs.back, zs.edge)
  const slideColor  = '#6b7280'

  return (
    <group ref={groupRef}>
      <Part
        b={zb}
        faceColors={zFaceColors}
        edgeLineColor="#b8a98e"
        meta={zInfo}
        selected={selected?.id === zInfo.id}
        highlighted={faceHighlighted}
        onSelect={onSelect}
        contextMenuSelect
        dragRef={dragRef}
        ebSpec={ebFor(faceZone.material_id)}
        wire={wire}
        rotation={getRotOv(zoneId, partOverrides)}
      />
      {stack.box_parts.map((p, pi) => {
        const id   = `db_${stack.face_zone_row}_${stack.face_zone_col}_${p.part_type}`
        const pp   = applyPosOv(p, id, partOverrides)
        const b    = dbBox(pp)
        const info = buildDbPartInfo(p, b, stack)
        const s    = matSpec(p.material_id, '#d4c8a8')
        const fc   = panelFaceColors(info.panelKind as PanelKind, p.part_type, s.face, s.back, s.edge)
        return (
          <Part
            key={`db_${pi}`}
            b={b}
            faceColors={fc}
            edgeLineColor="#8a7a60"
            meta={info}
            selected={selected?.id === info.id}
            highlighted={false}
            onSelect={onSelect}
            contextMenuSelect
            dragRef={dragRef}
            ebSpec={ebFor(p.material_id)}
            wire={wire}
            rotation={getRotOv(id, partOverrides)}
          />
        )
      })}
      {stack.slides.map((sl, li) => {
        const id   = `slide_${stack.face_zone_row}_${stack.face_zone_col}_${sl.side}`
        const ps   = applyPosOv(sl, id, partOverrides)
        const b    = slideBox(ps)
        const info = buildSlideInfo(sl, b, stack)
        const sc   = sl.colour ?? slideColor
        const fc   = panelFaceColors('side', `slide_${sl.side}`, sc, sc, sc)
        return (
          <Part
            key={`sl_${li}`}
            b={b}
            faceColors={fc}
            edgeLineColor="#4b5563"
            meta={info}
            selected={selected?.id === info.id}
            highlighted={false}
            onSelect={onSelect}
            contextMenuSelect
            dragRef={dragRef}
            wire={wire}
            rotation={getRotOv(id, partOverrides)}
          />
        )
      })}
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

type JointRefPlane =
  | { kind: 'yz'; x: number; yMin: number; yMax: number; zMin: number; zMax: number }
  | { kind: 'xz'; y: number; xMin: number; xMax: number; zMin: number; zMax: number }

function computeJointRefPlane(seamKey: string, boxA: Box, boxB?: Box): JointRefPlane | null {
  const partBKey   = seamKey.slice(seamKey.indexOf(':') + 1)
  const isVertical = boxA.h > boxA.d   // back panel: h ≈ 700, d ≈ 6 → vertical
  const zMin = boxA.z
  const zMax = (isVertical && boxB) ? boxB.z + boxB.d : boxA.z + boxA.d
  if (partBKey === 'left_side') {
    return { kind: 'yz', x: boxA.x, yMin: boxA.y, yMax: boxA.y + boxA.h, zMin, zMax }
  }
  if (partBKey === 'right_side') {
    return { kind: 'yz', x: boxA.x + boxA.w, yMin: boxA.y, yMax: boxA.y + boxA.h, zMin, zMax }
  }
  if (partBKey === 'bottom') {
    return { kind: 'xz', y: boxA.y, xMin: boxA.x, xMax: boxA.x + boxA.w, zMin: boxA.z, zMax: boxA.z + boxA.d }
  }
  return null
}

function JointFaceRect({ plane, color, wire }: { plane: JointRefPlane; color: string; wire?: boolean }) {
  const geo = useMemo(() => {
    // Explicit rectangle: 8 points = 4 line segment pairs forming a closed loop.
    // Avoids BoxGeometry's extraneous depth edges from the 0.1mm-thick approach.
    const pts = plane.kind === 'yz'
      ? [
          new THREE.Vector3(plane.x, plane.yMin, plane.zMin),
          new THREE.Vector3(plane.x, plane.yMax, plane.zMin),
          new THREE.Vector3(plane.x, plane.yMax, plane.zMin),
          new THREE.Vector3(plane.x, plane.yMax, plane.zMax),
          new THREE.Vector3(plane.x, plane.yMax, plane.zMax),
          new THREE.Vector3(plane.x, plane.yMin, plane.zMax),
          new THREE.Vector3(plane.x, plane.yMin, plane.zMax),
          new THREE.Vector3(plane.x, plane.yMin, plane.zMin),
        ]
      : [
          new THREE.Vector3(plane.xMin, plane.y, plane.zMin),
          new THREE.Vector3(plane.xMax, plane.y, plane.zMin),
          new THREE.Vector3(plane.xMax, plane.y, plane.zMin),
          new THREE.Vector3(plane.xMax, plane.y, plane.zMax),
          new THREE.Vector3(plane.xMax, plane.y, plane.zMax),
          new THREE.Vector3(plane.xMin, plane.y, plane.zMax),
          new THREE.Vector3(plane.xMin, plane.y, plane.zMax),
          new THREE.Vector3(plane.xMin, plane.y, plane.zMin),
        ]
    return new THREE.BufferGeometry().setFromPoints(pts)
  }, [plane])

  return (
    <lineSegments geometry={geo} renderOrder={wire ? 10 : 0}>
      <lineBasicMaterial color={color} depthTest={!wire} />
    </lineSegments>
  )
}



// PartWithHoles delegates all panel rendering to Part (correct per-face material
// colours + edgebanding + click/hover handling) and overlays dark disc markers
// on hole entry and exit faces. three-bvh-csg v0.0.16 collapses all box face
// groups to a single materialIndex, so CSG cannot give us per-face colours;
// the disc-marker approach keeps rendering correct while showing hole positions.
function PartWithHoles({ b, drills, faceColors, edgeLineColor, meta, selected, highlighted, onSelect, dragRef, wire, contextMenuSelect = false, ebSpec }: {
  b:                  Box
  drills:             DrillOpPos[]
  faceColors:         [string, string, string, string, string, string]
  edgeLineColor:      string
  meta:               PartMeta
  selected:           boolean
  highlighted:        boolean
  onSelect:           (info: PartMeta | null) => void
  dragRef:            React.MutableRefObject<boolean>
  wire?:              boolean
  contextMenuSelect?: boolean
  ebSpec?:            EbSpec
}) {
  const groupPos: [number, number, number] = [b.x + b.w / 2, b.y + b.h / 2, b.z + b.d / 2]
  return (
    <>
      <Part
        b={b}
        faceColors={faceColors}
        edgeLineColor={edgeLineColor}
        meta={meta}
        selected={selected}
        highlighted={highlighted}
        onSelect={onSelect}
        dragRef={dragRef}
        wire={wire}
        contextMenuSelect={contextMenuSelect}
        ebSpec={ebSpec}
      />
      {/* Dark disc markers on each hole's entry and exit face. In wire mode,
          depthTest=false + renderOrder=10 makes them show through panel edges. */}
      <group position={groupPos}>
        {drills.map((d, i) => {
          const isX    = d.axis === 'x-' || d.axis === 'x+'
          const isZ    = d.axis === 'z-' || d.axis === 'z+'
          const localY = d.y - (b.y + b.h / 2)
          const localZ = d.z - (b.z + b.d / 2)
          const localX = d.x - (b.x + b.w / 2)
          const eps    = 0.2
          const ro     = wire ? 10 : 0
          const dt     = !wire
          if (isX) {
            return (
              <group key={i}>
                {/* entry disc */}
                <mesh position={[-b.w / 2 - eps, localY, localZ]} rotation={[0, Math.PI / 2, 0]} renderOrder={ro}>
                  <circleGeometry args={[d.radius, 32]} />
                  <meshBasicMaterial color="#0a0a0a" side={THREE.DoubleSide} depthTest={dt} />
                </mesh>
                {/* exit disc */}
                <mesh position={[b.w / 2 + eps, localY, localZ]} rotation={[0, Math.PI / 2, 0]} renderOrder={ro}>
                  <circleGeometry args={[d.radius, 32]} />
                  <meshBasicMaterial color="#0a0a0a" side={THREE.DoubleSide} depthTest={dt} />
                </mesh>
                {/* bore cylinder — open-ended, BackSide shows inner wall */}
                <mesh position={[0, localY, localZ]} rotation={[0, 0, Math.PI / 2]} renderOrder={ro}>
                  <cylinderGeometry args={[d.radius, d.radius, b.w, 32, 1, true]} />
                  <meshBasicMaterial color="#0a0a0a" side={THREE.BackSide} depthTest={dt} />
                </mesh>
              </group>
            )
          }
          if (isZ) {
            return (
              <group key={i}>
                {/* entry disc — circleGeometry faces +Z by default, no rotation needed */}
                <mesh position={[localX, localY, -b.d / 2 - eps]} renderOrder={ro}>
                  <circleGeometry args={[d.radius, 32]} />
                  <meshBasicMaterial color="#0a0a0a" side={THREE.DoubleSide} depthTest={dt} />
                </mesh>
                {/* exit disc */}
                <mesh position={[localX, localY, b.d / 2 + eps]} renderOrder={ro}>
                  <circleGeometry args={[d.radius, 32]} />
                  <meshBasicMaterial color="#0a0a0a" side={THREE.DoubleSide} depthTest={dt} />
                </mesh>
                {/* bore cylinder along Z — rotate cylinder's Y axis onto Z */}
                <mesh position={[localX, localY, 0]} rotation={[Math.PI / 2, 0, 0]} renderOrder={ro}>
                  <cylinderGeometry args={[d.radius, d.radius, b.d, 32, 1, true]} />
                  <meshBasicMaterial color="#0a0a0a" side={THREE.BackSide} depthTest={dt} />
                </mesh>
              </group>
            )
          }
          return (
            <group key={i}>
              {/* entry disc */}
              <mesh position={[localX, -b.h / 2 - eps, localZ]} rotation={[Math.PI / 2, 0, 0]} renderOrder={ro}>
                <circleGeometry args={[d.radius, 32]} />
                <meshBasicMaterial color="#0a0a0a" side={THREE.DoubleSide} depthTest={dt} />
              </mesh>
              {/* exit disc */}
              <mesh position={[localX, b.h / 2 + eps, localZ]} rotation={[Math.PI / 2, 0, 0]} renderOrder={ro}>
                <circleGeometry args={[d.radius, 32]} />
                <meshBasicMaterial color="#0a0a0a" side={THREE.DoubleSide} depthTest={dt} />
              </mesh>
              {/* bore cylinder — open-ended, BackSide shows inner wall */}
              <mesh position={[localX, 0, localZ]} renderOrder={ro}>
                <cylinderGeometry args={[d.radius, d.radius, b.h, 32, 1, true]} />
                <meshBasicMaterial color="#0a0a0a" side={THREE.BackSide} depthTest={dt} />
              </mesh>
            </group>
          )
        })}
      </group>
    </>
  )
}

function SeamJointOverlay({ seamJoints, boxByKey, wire }: {
  seamJoints: ResolvedSeamJoint[]
  boxByKey:   Record<string, Box>
  wire?:      boolean
}) {
  const items = useMemo(() => {
    return seamJoints.flatMap(sj => {
      const boxA = boxByKey[sj.part_a_key]
      if (!boxA) return []
      const boxB = boxByKey[sj.part_b_key]
      const plane = computeJointRefPlane(sj.seam_key, boxA, boxB)
      if (!plane) return []
      const color = sj.source === 'cabinet' ? '#22c55e' : '#60a5fa'
      return [{ key: sj.seam_key, plane, color }]
    })
  }, [seamJoints, boxByKey])

  return (
    <group>
      {items.map(item => (
        <JointFaceRect key={item.key} plane={item.plane} color={item.color} wire={wire} />
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

// ── Position override helper ──────────────────────────────────────────────────

function applyPosOv<T extends { X: number; Y: number; Z: number }>(p: T, id: string, overrides: PartPosOverrides | undefined): T {
  const ov = overrides?.[id]
  return ov ? { ...p, X: p.X + ov.ox, Y: p.Y + ov.oy, Z: p.Z + ov.oz } : p
}

function getRotOv(id: string, overrides: PartPosOverrides | undefined): [number, number, number] | undefined {
  const ov = overrides?.[id]
  if (!ov || (!ov.oax && !ov.oay && !ov.oaz)) return undefined
  const D = Math.PI / 180
  return [(ov.oax ?? 0) * D, (ov.oay ?? 0) * D, (ov.oaz ?? 0) * D]
}

// ── Cabinet scene ─────────────────────────────────────────────────────────────

function CabinetScene({
  cab, rp, selected, onSelect, highlightPartKeys, materialColours, ebByMatId, doorsOpen, openDrawers, edgeOverrides, wire, customParts, partOverrides, showDrilling = true,
}: {
  cab:                  CabinetInstance
  rp:                   ResolvedCabinet
  selected:             PartMeta | null
  onSelect:             (info: PartMeta | null) => void
  highlightPartKeys?:   string[] | null
  materialColours?:     MatColMap
  ebByMatId?:           Record<string, { thickness: number; color: string | null }>
  doorsOpen:            boolean
  openDrawers:          Map<string, number>
  edgeOverrides:        Map<string, PartEdge>
  wire?:                boolean
  customParts?:         CabinetCustomPart[]
  partOverrides?:       PartPosOverrides
  showDrilling?:        boolean
}) {
  const { dx, dy, dz } = cab
  const dragRef = useRef(false)
  const hlSet   = highlightPartKeys ? new Set(highlightPartKeys) : null

  const boxByKey = useMemo(() => {
    const m: Record<string, Box> = {}
    for (const p of rp.case_parts) {
      const pp = applyPosOv(p, `case_${p.part_key}`, partOverrides)
      m[p.part_key] = caseBox(pp)
    }
    return m
  }, [rp.case_parts, partOverrides])

  const drawerStackByKey = useMemo(() => {
    const m = new Map<string, ResolvedDrawerStack>()
    for (const s of rp.drawer_stacks ?? []) {
      m.set(`${s.face_zone_row}_${s.face_zone_col}`, s)
    }
    return m
  }, [rp.drawer_stacks])

  // Collect drill holes grouped by which case part they enter, for CSG subtraction.
  const holesByPartKey = useMemo(() => {
    const m = new Map<string, DrillOpPos[]>()
    if (!showDrilling) return m
    for (const sj of rp.seam_joints) {
      const bA = boxByKey[sj.part_a_key]
      const bB = boxByKey[sj.part_b_key]
      if (!bA || !bB) continue
      for (const d of seamDrillOps(sj.seam_key, bA, bB, sj.ops, { bottomBackJoin: sj.bottom_back_join })) {
        const arr = m.get(d.targetPartKey) ?? []
        arr.push(d)
        m.set(d.targetPartKey, arr)
      }
    }
    return m
  }, [rp.seam_joints, boxByKey, showDrilling])

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
        const id    = `case_${p.part_key}`
        const pp    = applyPosOv(p, id, partOverrides)
        const b     = caseBox(pp)
        const info  = applyEdge(buildCaseInfo(p, b))
        const s     = matSpec(p.material_id, '#ddd3bb')
        const holes = holesByPartKey.get(p.part_key) ?? []

        if (holes.length > 0) {
          return (
            <PartWithHoles
              key={`c${i}`}
              b={b}
              drills={holes}
              faceColors={panelFaceColors(info.panelKind, p.part_key, s.face, s.back, s.edge)}
              edgeLineColor="#b8a98e"
              meta={info}
              selected={selected?.id === info.id}
              highlighted={hlSet?.has(p.part_key) ?? false}
              onSelect={onSelect}
              dragRef={dragRef}
              wire={wire}
              contextMenuSelect
              ebSpec={ebFor(p.material_id)}
            />
          )
        }

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
            rotation={getRotOv(id, partOverrides)}
          />
        )
      })}
      {rp.toekick_parts.map((p, i) => {
        const id   = `tk_${p.part_key}_${p.sort_order}`
        const pp   = applyPosOv(p, id, partOverrides)
        const b    = tkBox(pp)
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
            rotation={getRotOv(id, partOverrides)}
          />
        )
      })}
      {rp.internal_parts.map((p, i) => {
        const id   = `int_${p.part_type}_${p.sort_order}`
        const pp   = applyPosOv(p, id, partOverrides)
        const b    = intBox(pp)
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
            rotation={getRotOv(id, partOverrides)}
          />
        )
      })}
      {rp.face_zones.filter(z => z.face_type !== 'open').map((z, i) => {
        const id = `zone_${z.row_index}_${z.col_index}`

        if (z.face_type === 'drawer_face') {
          const stack = drawerStackByKey.get(`${z.row_index}_${z.col_index}`)
          if (stack) {
            return (
              <DrawerAssembly
                key={`f${i}`}
                faceZone={z}
                stack={stack}
                targetTravel={openDrawers.get(`${z.row_index}_${z.col_index}`) ?? 0}
                selected={selected}
                onSelect={onSelect}
                faceHighlighted={hlSet?.has(z.face_type) ?? false}
                materialColours={materialColours}
                ebByMatId={ebByMatId}
                edgeOverrides={edgeOverrides}
                wire={wire}
                partOverrides={partOverrides}
                dragRef={dragRef}
              />
            )
          }
        }

        const pz         = applyPosOv(z, id, partOverrides)
        const b          = zoneBox(pz)
        const info       = applyEdge(buildZoneInfo(z, b))
        const s          = matSpec(z.material_id, '#f0ebe0')
        const faceColors = panelFaceColors(info.panelKind, z.face_type, s.face, s.back, s.edge)
        const partProps: PartProps = {
          faceColors,
          edgeLineColor:     '#b8a98e',
          meta:              info,
          selected:          selected?.id === info.id,
          highlighted:       hlSet?.has(z.face_type) ?? false,
          onSelect,
          contextMenuSelect: true,
          dragRef,
          ebSpec:            ebFor(z.material_id),
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

        return <Part key={`f${i}`} b={b} rotation={getRotOv(id, partOverrides)} {...partProps} />
      })}
      {(customParts ?? []).filter(p => p.visible && Number(p.dz) > 0).map((p, i) => {
        const b: Box = { x: p.x, y: p.y, z: p.z, w: Number(p.dy), h: Number(p.dz), d: Number(p.dx) }
        const s = matSpec(p.material_id ?? '', '#a78bfa')
        const info: PartMeta = {
          id: `custom_${p.id}`,
          label: p.name ?? 'Custom Part',
          w: b.w, h: b.h, d: b.d,
          thickness: b.h,
          edge: { top: p.edge_top, bottom: p.edge_bottom, left: p.edge_left, right: p.edge_right },
          panelKind: 'horizontal',
        }
        return (
          <Part
            key={`cust${i}`}
            b={b}
            faceColors={panelFaceColors('horizontal', 'custom', s.face, s.back, s.edge)}
            edgeLineColor="#7c3aed"
            meta={info}
            selected={selected?.id === info.id}
            highlighted={false}
            onSelect={onSelect}
            contextMenuSelect
            dragRef={dragRef}
            wire={wire}
          />
        )
      })}
      {showDrilling && rp.seam_joints.length > 0 && (
        <SeamJointOverlay seamJoints={rp.seam_joints} boxByKey={boxByKey} wire={wire} />
      )}
    </group>
  )
}

// ── Public component ─────────────────────────────────────────────────────────

export default function Cabinet3DView({
  cab, rp, highlightPartKeys, materialColours, ebByMatId, wire = false, customParts, partOverrides, onPartSelect, showDrilling = true, onUpdate,
}: {
  cab:               CabinetInstance
  rp?:               ResolvedCabinet
  highlightPartKeys?: string[] | null
  materialColours?:  MatColMap
  ebByMatId?:        Record<string, { thickness: number; color: string | null }>
  wire?:             boolean
  customParts?:      CabinetCustomPart[]
  partOverrides?:    PartPosOverrides
  // Fires with the carcase part_key when a case part is selected (null when a
  // non-case part is picked). Lets callers drive an external panel from clicks.
  onPartSelect?:     (partKey: string | null) => void
  // Show carcase joint drilling (holes + seam overlay). Default on.
  showDrilling?:     boolean
  // When provided, the part panel shows inline edge-joint (drilling) controls for
  // the selected case part, persisting to cabinet.carcase_joints.
  onUpdate?:         (id: string, u: Partial<CabinetInstance>) => void | Promise<void>
}) {
  const [selectedPart, setSelectedPart]       = useState<PartMeta | null>(null)
  const [doorsOpen, setDoorsOpen]             = useState(false)
  const [openDrawers, setOpenDrawers]         = useState<Map<string, number>>(new Map())
  const [edgeOverrides, setEdgeOverrides]     = useState<Map<string, PartEdge>>(new Map())
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
    if (onPartSelect && info) {
      onPartSelect(info.id.startsWith('case_') ? info.id.slice(5) : null)
    }
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

  function toggleSingleDrawer(row: number, col: number) {
    const key   = `${row}_${col}`
    const stack = rp?.drawer_stacks?.find(s => s.face_zone_row === row && s.face_zone_col === col)
    const nl    = stack?.slides[0]?.nominal_length ?? 300
    setOpenDrawers(prev => {
      const n = new Map(prev)
      n.set(key, (n.get(key) ?? 0) > 0 ? 0 : nl)
      return n
    })
  }

  function openAllCascade() {
    if (!rp) return
    // Sort stacks bottom-to-top: higher row_index = lower in the cabinet = more extension.
    const stacks = [...(rp.drawer_stacks ?? [])].sort((a, b) => a.face_zone_row - b.face_zone_row)
    const n = new Map<string, number>()
    stacks.forEach((s, i) => {
      const nl     = s.slides[0]?.nominal_length ?? 300
      const travel = nl * Math.max(0.2, 1 - i * 0.2)
      n.set(`${s.face_zone_row}_${s.face_zone_col}`, travel)
    })
    setOpenDrawers(n)
  }

  const hasDoors      = rp?.face_zones.some(z => z.face_type === 'door' && z.hinge_side) ?? false
  const hasDrawers    = (rp?.drawer_stacks?.length ?? 0) > 0
  const drawerZoneIds = new Set((rp?.drawer_stacks ?? []).map(s => `zone_${s.face_zone_row}_${s.face_zone_col}`))

  const drawerActions = selectedPart && drawerZoneIds.has(selectedPart.id) ? (() => {
    const [, rowStr, colStr] = selectedPart.id.split('_')
    const row = parseInt(rowStr), col = parseInt(colStr)
    const key = `${row}_${col}`
    const isOpen = (openDrawers.get(key) ?? 0) > 0
    return (
      <>
        <button
          className="w-full text-left text-xs text-gray-300 hover:text-white py-0.5 transition-colors"
          onClick={() => toggleSingleDrawer(row, col)}
        >
          {isOpen ? 'Close Drawer' : 'Open Drawer'}
        </button>
        {(rp?.drawer_stacks?.length ?? 0) > 1 && (
          <button
            className="w-full text-left text-xs text-gray-300 hover:text-white py-0.5 transition-colors"
            onClick={openAllCascade}
          >
            Open all drawers
          </button>
        )}
      </>
    )
  })() : undefined

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
          {selectedPart && (
            <PartPropertiesPanel
              part={selectedPart}
              onClose={() => setSelectedPart(null)}
              onEdgeChange={handleEdgeChange}
              actions={drawerActions}
              jointControls={onUpdate && rp && selectedPart.id.startsWith('case_')
                ? <PartEdgeJoints cabinet={cab} rp={rp} partKey={selectedPart.id.slice(5)} onUpdate={onUpdate} />
                : undefined}
            />
          )}
          <div className="absolute bottom-8 right-3 flex flex-col gap-1 items-end pointer-events-none">
            {hasDoors && (
              <button
                onClick={() => setDoorsOpen(o => !o)}
                className="text-[11px] font-mono text-orange-700 hover:text-orange-600 bg-white/70 hover:bg-white/90 border border-orange-300 hover:border-orange-400 rounded px-2 py-1 transition-colors pointer-events-auto select-none"
              >
                {doorsOpen ? 'Close doors' : 'Open doors'}
              </button>
            )}
            {hasDrawers && openDrawers.size > 0 && (
              <button
                onClick={() => setOpenDrawers(new Map())}
                className="text-[11px] font-mono text-orange-700 hover:text-orange-600 bg-white/70 hover:bg-white/90 border border-orange-300 hover:border-orange-400 rounded px-2 py-1 transition-colors pointer-events-auto select-none"
              >
                Close drawers
              </button>
            )}
          </div>
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
          openDrawers={openDrawers}
          edgeOverrides={edgeOverrides}
          wire={wire}
          customParts={customParts}
          partOverrides={partOverrides}
          showDrilling={showDrilling}
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
