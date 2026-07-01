'use client'

import { useRef, useState, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { supabase } from '@/src/lib/supabase'
import { patchEdgeOverrideCache } from '@/src/lib/resolver/resolveCabinetFromDB'
import type { CabinetInstance } from '@/src/lib/types'
import { dbUpdateCustomPart, dbSavePartPosOverride, type CabinetCustomPart, type PartPosOverrides } from './canvasDB'
import { customExtents, customFieldForExtent, customPanelKind, type CustomOrient } from '@/src/lib/customPartBox'
import type {
  ResolvedCabinet, ResolvedCasePart, ResolvedToekickPart,
  ResolvedInternalPart, ResolvedFaceZone,
  ResolvedDrawerStack, ResolvedDrawerSlide, ResolvedDrawerBoxPart,
  ResolvedSeamJoint, ResolvedHingeInstance, ResolvedHingeDrill,
} from '@/src/lib/resolver/types'
import {
  Box, PanelKind, PartMeta, PartEdge,
  MatColSpec, MatColMap, EbSpec,
  panelFaceColors, unpackMatCol,
  Part, PartPropertiesPanel, PreviewCanvas,
} from '@/src/components/three/PartViewer'
import { isSide, caseBox, seamDrillOps, type DrillOpPos } from '@/src/lib/jointDrilling'
import { doorProfilePrimitives } from '@/src/lib/doorProfile'
import type { ResolvedDoorProfile } from '@/src/lib/resolver/types'
import { cabinetSlideDrills } from '@/src/lib/slideDrilling'
import { cabinetHingeDrills } from '@/src/lib/resolver/resolveHinges'
import { seatNudge, cupAcrossOffset } from '@/src/lib/hingeSilhouette'
import type { ResolvedSlideDrill } from '@/src/lib/resolver/types'
import PartEdgeJoints from './PartEdgeJoints'
import { SlideModel } from '@/src/components/three/SlideModel'
import { HingeModel } from '@/src/components/three/HingeModel'
import { getPalette } from '@/src/lib/partPalette'
import { useHandOpMarkers, HandOpMarkers3D } from './HandOpMarkers'
import type { CabinetOpMarker } from '@/src/lib/optimiser/partOpProject'

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
  // Inner-drawer / pull-out parts come from resolveDrawerBox (see fittings.ts) and
  // carry the drawer-box dimension convention (per-part DX/DY/DZ semantics + Z =
  // front face). They map to a cabinet Box the same way dbBox does for face drawers.
  switch (p.part_type) {
    case 'divider':
      return { x: p.X, y: p.Y, z: p.Z, w: p.DZ, h: p.DY, d: p.DX }
    case 'inner_drawer_side':
    case 'pull_out_side':
      return { x: p.X, y: p.Y, z: p.Z - p.DX, w: p.DZ, h: p.DY, d: p.DX }
    case 'inner_drawer_front':
    case 'inner_drawer_back':
    case 'pull_out_back':
      return { x: p.X, y: p.Y, z: p.Z - p.DZ, w: p.DY, h: p.DX, d: p.DZ }
    case 'inner_drawer_bottom':
    case 'pull_out_bottom':
      return { x: p.X, y: p.Y, z: p.Z - p.DX, w: p.DY, h: p.DZ, d: p.DX }
    // adj_shelf, fixed_shelf, accessory — horizontal shelf-like; Z stored is the back edge.
    default:
      return { x: p.X, y: p.Y, z: p.Z, w: p.DY, h: p.DZ, d: p.DX }
  }
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
  inner_drawer_side:   'Inner Drawer Side',
  inner_drawer_front:  'Inner Drawer Front',
  pull_out_bottom:     'Pull-out Bottom',
  pull_out_side:       'Pull-out Side',
  pull_out_back:       'Pull-out Back',
  accessory:           'Accessory',
}

// Panel kind dispatch for ResolvedInternalPart — drives panelFaceColors + edgeStrips orientation.
const INT_PANEL_KIND: Record<string, 'side' | 'horizontal' | 'face'> = {
  divider:             'side',
  inner_drawer_side:   'side',
  pull_out_side:       'side',
  inner_drawer_front:  'face',
  inner_drawer_back:   'face',
  pull_out_back:       'face',
  // adj_shelf, fixed_shelf, inner_drawer_bottom, pull_out_bottom, accessory → horizontal (default below)
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
    panelKind: INT_PANEL_KIND[p.part_type] ?? 'horizontal',
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

// Inner-drawer / pull-out slide: no parent face zone, so the id key is anchored
// to the rail's position (Y + side) to keep selection stable across re-resolves.
function buildInternalSlideInfo(s: ResolvedDrawerSlide, b: Box, index: number): PartMeta {
  return {
    id:        `int_slide_${index}_${s.side}`,
    label:     `Inner Drawer Slide (${s.side})`,
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

// Routing-profile overlay drawn just proud of a door's front face, as line
// segments (inset frame + grooves). Lives inside the door's animated group so
// it swings with the door. Geometry from the shared doorProfilePrimitives.
function DoorProfile3D({ profile, b, color = '#5a4a32' }: {
  profile: ResolvedDoorProfile
  b:       Box
  color?:  string
}) {
  const geo = useMemo(() => {
    const W = b.w, H = b.h
    if (W <= 0 || H <= 0) return null
    const prims = doorProfilePrimitives(profile, { w: W, h: H, thickness: b.d })
    const zf = b.z + b.d + 0.3   // sit slightly proud of the front face
    const pts: THREE.Vector3[] = []
    const seg = (x1: number, y1: number, x2: number, y2: number) => {
      pts.push(new THREE.Vector3(b.x + x1, b.y + y1, zf), new THREE.Vector3(b.x + x2, b.y + y2, zf))
    }
    for (const ir of prims.insetRects) {
      const x0 = ir.x, y0 = ir.y, x1 = ir.x + ir.w, y1 = ir.y + ir.h
      seg(x0, y0, x1, y0); seg(x1, y0, x1, y1); seg(x1, y1, x0, y1); seg(x0, y1, x0, y0)
    }
    for (const gl of prims.grooveLines) seg(gl.x1, gl.y1, gl.x2, gl.y2)
    return pts.length ? new THREE.BufferGeometry().setFromPoints(pts) : null
  }, [profile, b.x, b.y, b.z, b.w, b.h, b.d])
  if (!geo) return null
  return (
    <lineSegments geometry={geo} renderOrder={1}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  )
}

// ── Hinge model placement ─────────────────────────────────────────────────────
// Combined-GLB convention: origin = plate-face bore centre, +Y = hinge axis
// (vertical), +Z = gable→door, mm units.
//
// Orientation knobs (3D-only; the depth/across placement is shared with the 2D
// silhouette via hingeSilhouette.ts so both stay in sync):
//   HINGE_FLIP_Z   — reverse the gable→door axis so the cup-arm points INTO the
//                    cabinet instead of out the front.
//   HINGE_BASE_YAW — constant yaw correction about the vertical axis, if needed.
//   mirror flag    — left/right hand. A left and right hinge are X-mirror images;
//                    `mirror` (passed in) marks which hand gets the X reflection.
const HINGE_FLIP_Z   = false
const HINGE_BASE_YAW = 0   // radians

function HingeMeshPlaced({ url, mesh, position, mirror, scale, color }: {
  url:      string
  mesh:     'HingePlate' | 'HingeCupArm'
  position: [number, number, number]
  mirror:   boolean        // this hand gets the X reflection
  scale:    number
  color?:   string
}) {
  const s  = scale || 1
  const sz = HINGE_FLIP_Z ? -s : s
  return (
    <group position={position} rotation={[0, HINGE_BASE_YAW, 0]} scale={[(mirror ? -s : s), s, sz]}>
      <HingeModel url={url} mesh={mesh} color={color} />
    </group>
  )
}

// Gable-side back arm (HingeArm mesh) of a split hinge body. Folds about its
// plate-end pivot (the model origin on the gable) by `foldFraction` of the
// door's open angle — a simple knuckle-fold approximation. Lerps in step with
// the door (same factor as DoorPanel). Renders nothing when the GLB has no
// HingeArm mesh. `foldFraction` is the per-hinge value from the materials library.
function HingeArmFold({ url, pivot, openAngle, doorsOpen, mirror, scale, color, foldFraction }: {
  url:          string
  pivot:        [number, number, number]
  openAngle:    number
  doorsOpen:    boolean
  mirror:       boolean
  scale:        number
  color?:       string
  foldFraction: number
}) {
  const groupRef = useRef<THREE.Group>(null)
  const cur      = useRef(0)
  const openRef  = useRef(doorsOpen)
  openRef.current = doorsOpen
  useFrame(() => {
    if (!groupRef.current) return
    const target = openRef.current ? openAngle * foldFraction : 0
    if (Math.abs(cur.current - target) < 0.001) { cur.current = target; groupRef.current.rotation.y = target; return }
    cur.current = THREE.MathUtils.lerp(cur.current, target, 0.12)
    groupRef.current.rotation.y = cur.current
  })
  const s  = scale || 1
  const sz = HINGE_FLIP_Z ? -s : s
  return (
    <group ref={groupRef} position={pivot}>
      <group rotation={[0, HINGE_BASE_YAW, 0]} scale={[(mirror ? -s : s), s, sz]}>
        <HingeModel url={url} mesh="HingeArm" color={color} requireName />
      </group>
    </group>
  )
}

function DoorPanel({ b, hingeSide, doorsOpen, doorProfile, hinges, cupDrills, showDrilling, ...partProps }: PartProps & {
  b:          Box
  hingeSide:  'left' | 'right'
  doorsOpen:  boolean
  doorProfile?: ResolvedDoorProfile | null
  hinges?:    ResolvedHingeInstance[]
  cupDrills?: ResolvedHingeDrill[]   // world coords; converted to local below
  showDrilling?: boolean
}) {
  const groupRef     = useRef<THREE.Group>(null)
  const curAngle     = useRef(0)
  const doorsOpenRef = useRef(doorsOpen)
  doorsOpenRef.current = doorsOpen

  const openAngle = hingeSide === 'left' ? -Math.PI / 2 : Math.PI / 2
  const hingeX    = hingeSide === 'left' ? b.x : b.x + b.w
  const localB: Box = { x: hingeSide === 'left' ? 0 : -b.w, y: 0, z: 0, w: b.w, h: b.h, d: b.d }
  const mirror    = hingeSide === 'left'   // swapped: left hand gets the X reflection

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
      {doorProfile && <DoorProfile3D profile={doorProfile} b={localB} />}
      {/* Door-side hinge body (HingeCupArm = cup + front arm to the knuckle) lives
          inside the rotating group so it swings with the door. The gable-side back
          arm (HingeArm) folds separately near the plate (see below). Local origin
          sits on the hinge axis; y = hinge height from door bottom. */}
      {(hinges ?? []).filter(h => h.model_url).map((h, hi) => (
        <HingeMeshPlaced
          key={`cup${hi}`}
          url={h.model_url!}
          mesh="HingeCupArm"
          // X = offset so the cup bore lands cup_x_from_edge in from the edge.
          // Z = bore-to-door + seating so the cup beds into the door from its back.
          position={[
            cupAcrossOffset(h.cup_x_from_edge_mm, mirror, h.model_scale),
            h.y_position_mm,
            -((h.bore_to_door_mm ?? 0) * h.model_scale + seatNudge(b.d)),
          ]}
          mirror={mirror}
          scale={h.model_scale}
          color="#c0c6d0"
        />
      ))}
      {/* Cup + anchor bore markers — inside the group, so they swing with the
          door. Convert from world to door-group-local coords. */}
      {showDrilling && (cupDrills?.length ?? 0) > 0 && (
        <SlideDrillMarkers
          drills={cupDrills!.map(dr => ({ ...dr, x: dr.x - hingeX, y: dr.y - b.y, z: dr.z - b.z }))}
          wire={partProps.wire}
          color="#a855f7"
        />
      )}
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
  const palette = useMemo(() => getPalette(), [])

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
        edgeLineColor={faceZone.face_type === 'drawer_face' ? palette.drawer_face : palette.door}
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
            edgeLineColor={palette.drawer_box}
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
        const sc   = sl.colour ?? slideColor
        if (ps.model_url && ps.model_format) {
          // Front-top-outer corner of the rail (model convention origin).
          const originX = ps.side === 'left' ? ps.X : ps.X + ps.DZ
          const originY = ps.Y + ps.DY
          const originZ = ps.Z + ps.DX
          return (
            <SlideModel
              key={`sl_${li}`}
              url={ps.model_url}
              format={ps.model_format}
              scale={ps.model_scale}
              anchor={{ x: ps.model_anchor_x, y: ps.model_anchor_y, z: ps.model_anchor_z }}
              position={[originX, originY, originZ]}
              sideOrientation={ps.side}
              color={sc}
              fallbackBox={{ w: ps.DZ, h: ps.DY, d: ps.DX }}
            />
          )
        }
        const info = buildSlideInfo(sl, b, stack)
        const fc   = panelFaceColors('side', `slide_${sl.side}`, sc, sc, sc)
        return (
          <Part
            key={`sl_${li}`}
            b={b}
            faceColors={fc}
            edgeLineColor={palette.slides}
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
function PartWithHoles({ b, drills, faceColors, edgeLineColor, meta, selected, highlighted, onSelect, dragRef, wire, contextMenuSelect = false, ebSpec, rotation }: {
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
  rotation?:          [number, number, number]
}) {
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
        rotation={rotation}
      />
      {/* Dark disc markers on each hole's entry and exit face. In wire mode,
          depthTest=false + renderOrder=10 makes them show through panel edges.
          Nested so the markers share the part's pivot ([b.x,b.y,b.z]) and
          rotation: outer group sits at the reference corner and carries the
          rotation, the inner group offsets to the box centre — matching how
          Part positions its mesh. With no rotation this is identical to placing
          the markers at the absolute box centre. */}
      <group position={[b.x, b.y, b.z]} rotation={rotation}>
      <group position={[b.w / 2, b.h / 2, b.d / 2]}>
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
      </group>
    </>
  )
}

// Slide drilling markers — bore cylinders + entry discs at absolute cabinet
// coords. Unlike PartWithHoles (which CSG-subtracts per part), these are an
// overlay: each ResolvedSlideDrill already carries its cabinet-space entry point
// and axis, so we just place a marker. Colour-coded amber to distinguish from
// the dark carcase-joint holes. The scene group is pre-translated by the cabinet
// half-extents, so absolute coords map directly to local space here.
function SlideDrillMarkers({ drills, wire, color = '#d97706' }: {
  drills: { x: number; y: number; z: number; axis: ResolvedSlideDrill['axis']; radius: number; depthLen: number }[]
  wire?:  boolean
  color?: string
}) {
  const ro = wire ? 10 : 0
  const dt = !wire
  return (
    <group>
      {drills.map((d, i) => {
        const isX = d.axis === 'x-' || d.axis === 'x+'
        const isY = d.axis === 'y-' || d.axis === 'y+'
        // Bore travels `depthLen` from the entry point along the axis sign.
        const sign = d.axis.endsWith('+') ? 1 : -1
        const len  = Math.max(2, d.depthLen)
        // Cylinder is centred; offset its midpoint half the length along the bore.
        const mid: [number, number, number] = [
          d.x + (isX ? sign * len / 2 : 0),
          d.y + (isY ? sign * len / 2 : 0),
          d.z + (!isX && !isY ? sign * len / 2 : 0),
        ]
        // Cylinder default axis = Y; rotate onto the bore axis.
        const rot: [number, number, number] = isX ? [0, 0, Math.PI / 2]
                                            : isY ? [0, 0, 0]
                                            :       [Math.PI / 2, 0, 0]
        // Entry disc faces along the axis.
        const discRot: [number, number, number] = isX ? [0, Math.PI / 2, 0]
                                                : isY ? [Math.PI / 2, 0, 0]
                                                :       [0, 0, 0]
        return (
          <group key={i}>
            <mesh position={[d.x, d.y, d.z]} rotation={discRot} renderOrder={ro}>
              <circleGeometry args={[d.radius, 24]} />
              <meshBasicMaterial color={color} side={THREE.DoubleSide} depthTest={dt} />
            </mesh>
            <mesh position={mid} rotation={rot} renderOrder={ro}>
              <cylinderGeometry args={[d.radius, d.radius, len, 24, 1, true]} />
              <meshBasicMaterial color={color} side={THREE.DoubleSide} depthTest={dt} />
            </mesh>
          </group>
        )
      })}
    </group>
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

// Apply an absolute size override (sw/sh/sd) to a freshly-built box. Used so the
// right-click panel can resize a resolved part in the 3D preview.
function applySizeOv(b: Box, id: string, overrides: PartPosOverrides | undefined): Box {
  const ov = overrides?.[id]
  if (!ov || (ov.sw == null && ov.sh == null && ov.sd == null)) return b
  return { ...b, w: ov.sw ?? b.w, h: ov.sh ?? b.h, d: ov.sd ?? b.d }
}

function getRotOv(id: string, overrides: PartPosOverrides | undefined): [number, number, number] | undefined {
  const ov = overrides?.[id]
  if (!ov || (!ov.oax && !ov.oay && !ov.oaz)) return undefined
  const D = Math.PI / 180
  return [(ov.oax ?? 0) * D, (ov.oay ?? 0) * D, (ov.oaz ?? 0) * D]
}

// ── Animated group for inner-drawer slide-out ─────────────────────────────────
// Lerps its position.z toward targetTravel each frame. Used to slide an inner-
// drawer assembly (box parts + face + slide rails) forward together when the
// user toggles it open in the 3D view's right-click menu.
function AnimatedGroup({ targetTravel, children }: { targetTravel: number; children: React.ReactNode }) {
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
  return <group ref={groupRef}>{children}</group>
}

// ── Cabinet scene ─────────────────────────────────────────────────────────────

function CabinetScene({
  cab, rp, selected, onSelect, highlightPartKeys, materialColours, ebByMatId, doorsOpen, openDrawers, openInnerDrawers, edgeOverrides, wire, customParts, partOverrides, showDrilling = true, handMarkers = [],
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
  openInnerDrawers:     Map<number, number>
  edgeOverrides:        Map<string, PartEdge>
  wire?:                boolean
  customParts?:         CabinetCustomPart[]
  partOverrides?:       PartPosOverrides
  showDrilling?:        boolean
  handMarkers?:         CabinetOpMarker[]
}) {
  const { dx, dy, dz } = cab
  const dragRef = useRef(false)
  const hlSet   = highlightPartKeys ? new Set(highlightPartKeys) : null
  const palette = useMemo(() => getPalette(), [])

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

  // Slide-imposed drilling (cabinet member + drawer-box surfaces), already
  // resolved to absolute cabinet coords on each slide. Rendered as an overlay.
  const slideDrills = useMemo(
    () => (showDrilling ? cabinetSlideDrills(rp.drawer_stacks ?? [], rp.internal_slides ?? []) : []),
    [rp.drawer_stacks, showDrilling],
  )
  // Door hinge_side per zone — decides which doors animate (left/right swing).
  const zoneEdge = useMemo(() => {
    const m = new Map<string, string | undefined>()
    for (const z of rp.face_zones) if (z.face_type === 'door') m.set(`${z.row_index}_${z.col_index}`, z.hinge_side)
    return m
  }, [rp.face_zones])
  // Cup + anchor bores grouped by door zone (world coords) — these ride inside the
  // door's rotating group for animated doors so they swing with the door.
  const cupDrillsByZone = useMemo(() => {
    const m = new Map<string, ResolvedHingeDrill[]>()
    for (const h of rp.hinge_instances ?? []) {
      const k = `${h.row_index}_${h.col_index}`
      const arr = m.get(k) ?? []
      arr.push(...h.cup_drills)
      m.set(k, arr)
    }
    return m
  }, [rp.hinge_instances])
  // World-fixed hinge markers: plate bores always; cup/anchor bores only for
  // non-animated (top/bottom) doors — left/right doors render theirs in DoorPanel.
  const hingeDrills = useMemo(() => {
    if (!showDrilling) return []
    const out: ResolvedHingeDrill[] = []
    for (const h of rp.hinge_instances ?? []) {
      const edge = zoneEdge.get(`${h.row_index}_${h.col_index}`)
      if (edge !== 'left' && edge !== 'right') out.push(...h.cup_drills)
      out.push(...h.plate_drills)
    }
    return out
  }, [rp.hinge_instances, zoneEdge, showDrilling])
  // Hinges grouped by door zone, keyed `${row}_${col}` — only those with a 3D
  // model (hinge model and/or a separate plate model).
  const hingesByZone = useMemo(() => {
    const m = new Map<string, ResolvedHingeInstance[]>()
    for (const h of rp.hinge_instances ?? []) {
      if (!h.model_url && !h.plate_model_url) continue
      const k = `${h.row_index}_${h.col_index}`
      const arr = m.get(k) ?? []
      arr.push(h)
      m.set(k, arr)
    }
    return m
  }, [rp.hinge_instances])

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
      {showDrilling && handMarkers.length > 0 && <HandOpMarkers3D markers={handMarkers} />}
      {rp.case_parts.map((p, i) => {
        const id    = `case_${p.part_key}`
        const pp    = applyPosOv(p, id, partOverrides)
        const b     = applySizeOv(caseBox(pp), id, partOverrides)
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
              edgeLineColor={palette.carcase}
              meta={info}
              selected={selected?.id === info.id}
              highlighted={hlSet?.has(p.part_key) ?? false}
              onSelect={onSelect}
              dragRef={dragRef}
              wire={wire}
              contextMenuSelect
              ebSpec={ebFor(p.material_id)}
              rotation={getRotOv(id, partOverrides)}
            />
          )
        }

        return (
          <Part
            key={`c${i}`}
            b={b}
            faceColors={panelFaceColors(info.panelKind, p.part_key, s.face, s.back, s.edge)}
            edgeLineColor={palette.carcase}
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
        const b    = applySizeOv(tkBox(pp), id, partOverrides)
        const info = applyEdge(buildTkInfo(p, b))
        const s    = matSpec(p.material_id, '#78716c')
        return (
          <Part
            key={`t${i}`}
            b={b}
            faceColors={panelFaceColors(info.panelKind, p.part_key, s.face, s.back, s.edge)}
            edgeLineColor={palette.toekick}
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
      {(() => {
        // Inline helpers so the same JSX is reused for grouped (inner drawer,
        // wrapped in AnimatedGroup) and ungrouped (shelves, dividers, accessories).
        const renderIntPart = (p: ResolvedInternalPart, key: string) => {
          const id   = `int_${p.part_type}_${p.sort_order}`
          const pp   = applyPosOv(p, id, partOverrides)
          const b    = applySizeOv(intBox(pp), id, partOverrides)
          const info = applyEdge(buildIntInfo(p, b))
          const s    = matSpec(p.material_id, '#e8dece')
          return (
            <Part
              key={key}
              b={b}
              faceColors={panelFaceColors(info.panelKind, p.part_type, s.face, s.back, s.edge)}
              edgeLineColor={palette.internal}
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
        }
        const renderIntSlide = (sl: ResolvedDrawerSlide, li: number, key: string) => {
          const info0 = buildInternalSlideInfo(sl, slideBox(sl), li)
          const ps    = applyPosOv(sl, info0.id, partOverrides)
          const b     = slideBox(ps)
          const sc    = sl.colour ?? '#6b7280'
          if (ps.model_url && ps.model_format) {
            const originX = ps.side === 'left' ? ps.X : ps.X + ps.DZ
            const originY = ps.Y + ps.DY
            const originZ = ps.Z + ps.DX
            return (
              <SlideModel
                key={key}
                url={ps.model_url}
                format={ps.model_format}
                scale={ps.model_scale}
                anchor={{ x: ps.model_anchor_x, y: ps.model_anchor_y, z: ps.model_anchor_z }}
                position={[originX, originY, originZ]}
                sideOrientation={ps.side}
                color={sc}
                fallbackBox={{ w: ps.DZ, h: ps.DY, d: ps.DX }}
              />
            )
          }
          const info = buildInternalSlideInfo(sl, b, li)
          const fc   = panelFaceColors('side', `slide_${sl.side}`, sc, sc, sc)
          return (
            <Part
              key={key}
              b={b}
              faceColors={fc}
              edgeLineColor={palette.slides}
              meta={info}
              selected={selected?.id === info.id}
              highlighted={false}
              onSelect={onSelect}
              contextMenuSelect
              dragRef={dragRef}
              wire={wire}
              rotation={getRotOv(info.id, partOverrides)}
            />
          )
        }

        // Group inner-drawer / pull-out parts + slides by inner_drawer_index so
        // they animate together when the user opens a drawer in 3D.
        const grouped = new Map<number, { parts: ResolvedInternalPart[]; slides: { sl: ResolvedDrawerSlide; li: number }[] }>()
        const ungroupedParts: ResolvedInternalPart[] = []
        for (const p of rp.internal_parts) {
          if (p.inner_drawer_index != null) {
            const g = grouped.get(p.inner_drawer_index) ?? { parts: [], slides: [] }
            g.parts.push(p)
            grouped.set(p.inner_drawer_index, g)
          } else {
            ungroupedParts.push(p)
          }
        }
        const ungroupedSlides: { sl: ResolvedDrawerSlide; li: number }[] = [];
        (rp.internal_slides ?? []).forEach((sl, li) => {
          if (sl.inner_drawer_index != null) {
            const g = grouped.get(sl.inner_drawer_index) ?? { parts: [], slides: [] }
            g.slides.push({ sl, li })
            grouped.set(sl.inner_drawer_index, g)
          } else {
            ungroupedSlides.push({ sl, li })
          }
        })

        return (
          <>
            {ungroupedParts.map((p, i) => renderIntPart(p, `s${i}`))}
            {ungroupedSlides.map(({ sl, li }) => renderIntSlide(sl, li, `isl_${li}`))}
            {[...grouped.entries()].map(([idx, g]) => (
              <AnimatedGroup key={`idg_${idx}`} targetTravel={openInnerDrawers.get(idx) ?? 0}>
                {g.parts.map((p, i) => renderIntPart(p, `gs_${idx}_${i}`))}
                {g.slides.map(({ sl, li }) => renderIntSlide(sl, li, `gisl_${idx}_${li}`))}
              </AnimatedGroup>
            ))}
          </>
        )
      })()}
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
        const b          = applySizeOv(zoneBox(pz), id, partOverrides)
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

        if (z.face_type === 'door' && (z.hinge_side === 'left' || z.hinge_side === 'right')) {
          const zoneHinges = hingesByZone.get(`${z.row_index}_${z.col_index}`) ?? []
          const hingeX = z.hinge_side === 'left' ? b.x : b.x + b.w
          const mirror = z.hinge_side === 'left'   // swapped to match DoorPanel
          return (
            <group key={`f${i}`}>
              <DoorPanel
                b={b}
                hingeSide={z.hinge_side}
                doorsOpen={doorsOpen}
                doorProfile={z.door_profile}
                hinges={zoneHinges}
                cupDrills={cupDrillsByZone.get(`${z.row_index}_${z.col_index}`)}
                showDrilling={showDrilling}
                {...partProps}
              />
              {/* Plates stay fixed in world space at the bore-centre anchor.
                  Source: the plate's own GLB when uploaded (for hinge models that
                  ship without a plate), else the combined GLB's HingePlate mesh.
                  Either way it sits at the hinge Y, so it tracks the hinge. */}
              {zoneHinges.map((h, hi) => {
                const plateUrl   = h.plate_model_url ?? h.model_url
                const plateScale = h.plate_model_url ? h.plate_model_scale : h.model_scale
                if (!plateUrl) return null
                return (
                <HingeMeshPlaced
                  key={`plate${hi}`}
                  url={plateUrl}
                  mesh="HingePlate"
                  // Same across + depth offsets so the plate stays consistent
                  // with the cup (plate ends up back at the gable).
                  position={[
                    // The plate model is mirrored for left hinges, so the across
                    // (X) nudge must flip with the mirror to move the same way on
                    // both hands. Y/Z are not mirrored.
                    hingeX + cupAcrossOffset(h.cup_x_from_edge_mm, mirror, h.model_scale) + (mirror ? 1 : -1) * h.plate_anchor_x,
                    b.y + h.y_position_mm + h.plate_anchor_y,
                    b.z - ((h.bore_to_door_mm ?? 0) * h.model_scale + seatNudge(b.d)) + h.plate_anchor_z,
                  ]}
                  mirror={mirror}
                  scale={plateScale}
                  color="#8b919b"
                />
                )})}
              {/* Gable-side back arm (HingeArm) of a SPLIT hinge body. Sits at the
                  model origin on the gable and folds about that plate-end pivot by
                  a fraction of the door angle, so the body articulates at the
                  knuckle. Renders nothing if the body GLB has no HingeArm mesh
                  (one-piece bodies just swing with the door inside DoorPanel). */}
              {zoneHinges.filter(h => h.model_url).map((h, hi) => (
                <HingeArmFold
                  key={`arm${hi}`}
                  url={h.model_url!}
                  pivot={[
                    hingeX + cupAcrossOffset(h.cup_x_from_edge_mm, mirror, h.model_scale),
                    b.y + h.y_position_mm,
                    b.z - ((h.bore_to_door_mm ?? 0) * h.model_scale + seatNudge(b.d)),
                  ]}
                  openAngle={z.hinge_side === 'left' ? -Math.PI / 2 : Math.PI / 2}
                  doorsOpen={doorsOpen}
                  mirror={mirror}
                  scale={h.model_scale}
                  color="#c0c6d0"
                  foldFraction={h.arm_fold_fraction}
                />
              ))}
            </group>
          )
        }

        if (z.face_type === 'door' && z.door_profile) {
          return (
            <group key={`f${i}`}>
              <Part b={b} rotation={getRotOv(id, partOverrides)} {...partProps} />
              <DoorProfile3D profile={z.door_profile} b={b} />
            </group>
          )
        }

        return <Part key={`f${i}`} b={b} rotation={getRotOv(id, partOverrides)} {...partProps} />
      })}
      {(customParts ?? []).filter(p => p.visible && Number(p.dz) > 0).map((p, i) => {
        const orient = (p.orientation ?? 'flat') as CustomOrient
        const { ex, ey, ez } = customExtents(orient, Number(p.dx), Number(p.dy), Number(p.dz))
        const b: Box = { x: p.x, y: p.y, z: p.z, w: ex, h: ey, d: ez }
        const kind = customPanelKind(orient)
        const s = matSpec(p.material_id ?? '', '#a78bfa')
        const info: PartMeta = {
          id: `custom_${p.id}`,
          label: p.name ?? 'Custom Part',
          w: b.w, h: b.h, d: b.d,
          thickness: Number(p.dz),
          edge: { top: p.edge_top, bottom: p.edge_bottom, left: p.edge_left, right: p.edge_right },
          panelKind: kind,
        }
        return (
          <Part
            key={`cust${i}`}
            b={b}
            faceColors={panelFaceColors(kind, 'custom', s.face, s.back, s.edge)}
            edgeLineColor="#7c3aed"
            meta={info}
            selected={selected?.id === info.id}
            highlighted={false}
            onSelect={onSelect}
            contextMenuSelect
            dragRef={dragRef}
            ebSpec={ebFor(p.material_id ?? '')}
            wire={wire}
          />
        )
      })}
      {showDrilling && rp.seam_joints.length > 0 && (
        <SeamJointOverlay seamJoints={rp.seam_joints} boxByKey={boxByKey} wire={wire} />
      )}
      {slideDrills.length > 0 && (
        <SlideDrillMarkers drills={slideDrills} wire={wire} />
      )}
      {hingeDrills.length > 0 && (
        <SlideDrillMarkers drills={hingeDrills} wire={wire} color={palette.hinges} />
      )}
    </group>
  )
}

// ── Public component ─────────────────────────────────────────────────────────

export default function Cabinet3DView({
  cab, rp, highlightPartKeys, materialColours, ebByMatId, wire = false, customParts, partOverrides, onPartSelect, showDrilling = true, onUpdate, onDeletePart,
  setCustomParts, onOverridesChange, onEditPart,
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
  // Delete/hide a part by id (custom part → deleted; resolved part → hidden).
  onDeletePart?:     (partId: string) => void
  // Editing custom-part dims live from the inspector panel.
  setCustomParts?:   Dispatch<SetStateAction<CabinetCustomPart[]>>
  // Persist a resolved part's size override; receives the merged override map.
  onOverridesChange?: (o: PartPosOverrides) => void
  // Right-click → "Edit Part" opens the single-part operation editor (Part Editor).
  // The host renders the editor as a modal-level overlay so cabinet context is kept.
  onEditPart?:       (part: PartMeta) => void
}) {
  const [selectedPart, setSelectedPart]       = useState<PartMeta | null>(null)
  const [editMenu, setEditMenu]               = useState<{ cx: number; cy: number } | null>(null)
  const [doorsOpen, setDoorsOpen]             = useState(false)
  const [openDrawers, setOpenDrawers]         = useState<Map<string, number>>(new Map())
  const [openInnerDrawers, setOpenInnerDrawers] = useState<Map<number, number>>(new Map())
  const [edgeOverrides, setEdgeOverrides]     = useState<Map<string, PartEdge>>(new Map())
  const { dx, dy, dz } = cab
  // Hand-added part_operations, projected to cabinet space (generated rows excluded
  // — the resolver already draws those). Shown with the carcase-drilling toggle.
  const handMarkers = useHandOpMarkers(cab.id, rp)

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

  // Delete/Backspace removes the selected part (custom → deleted, resolved →
  // hidden). Capture phase + stopImmediatePropagation so the canvas behind the
  // modal never sees it (it would delete the whole cabinet). A ref keeps the
  // listener bound once while always seeing the current selection.
  const deleteSelRef = useRef<() => void>(() => {})
  useEffect(() => {
    deleteSelRef.current = () => {
      if (!selectedPart || !onDeletePart) return
      onDeletePart(selectedPart.id)
      setSelectedPart(null)
    }
  })
  useEffect(() => {
    if (!onDeletePart) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      e.preventDefault(); e.stopImmediatePropagation()
      deleteSelRef.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onDeletePart])

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

  // Resize the selected part from the inspector. The panel edits the visible 3D
  // box (w/h/d). Custom parts are authoritative (real dims → cut list); resolved
  // parts store an absolute size override applied to the preview box.
  function handleSizeChange(dim: 'w' | 'h' | 'd', value: number) {
    if (!selectedPart) return
    const id = selectedPart.id
    setSelectedPart(prev => prev ? { ...prev, [dim]: value } : prev)   // instant panel feedback
    if (id.startsWith('custom_')) {
      const cpId = id.slice('custom_'.length)
      const cp = customParts?.find(p => p.id === cpId)
      if (!cp) return
      // Map the edited box extent back to the intrinsic field for this orientation.
      const field = customFieldForExtent((cp.orientation ?? 'flat') as CustomOrient, dim)
      const expressions = { ...(cp.expressions ?? {}) }
      delete expressions[field]   // a manual size clears that field's formula
      setCustomParts?.(prev => prev.map(p => p.id === cpId ? { ...p, [field]: value, expressions } : p))
      dbUpdateCustomPart(cpId, { [field]: value, expressions }).catch(console.error)
    } else {
      const cur = partOverrides?.[id] ?? { ox: 0, oy: 0, oz: 0 }
      const key: 'sw' | 'sh' | 'sd' = dim === 'w' ? 'sw' : dim === 'h' ? 'sh' : 'sd'
      dbSavePartPosOverride(cab.id, id, { ...cur, [key]: value }, partOverrides ?? {})
        .then(u => onOverridesChange?.(u))
        .catch(console.error)
    }
  }

  function handleCanvasContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    if (didHitPartRef.current) {
      // A part was right-clicked (and just selected via contextMenuSelect). Offer
      // the Part Editor at the cursor when the host supports it.
      if (onEditPart) setEditMenu({ cx: e.clientX, cy: e.clientY })
    } else {
      setSelectedPart(null)
      setEditMenu(null)
    }
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

  // Find the inner-drawer instance index for the selected face. Inner-drawer
  // faces are tagged in fittings.ts via `inner_drawer_index`; look up by part
  // id (`int_inner_drawer_front_${sort_order}`).
  function innerDrawerIndexForSelected(): number | null {
    if (!selectedPart || !selectedPart.id.startsWith('int_inner_drawer_front_')) return null
    const sortOrder = parseInt(selectedPart.id.slice('int_inner_drawer_front_'.length))
    const part = rp?.internal_parts.find(p =>
      p.part_type === 'inner_drawer_front' && p.sort_order === sortOrder
    )
    return part?.inner_drawer_index ?? null
  }

  function toggleSingleInnerDrawer(idx: number) {
    if (!rp) return
    const slide = (rp.internal_slides ?? []).find(s => s.inner_drawer_index === idx)
    const nl    = slide?.nominal_length ?? 300
    setOpenInnerDrawers(prev => {
      const n = new Map(prev)
      n.set(idx, (n.get(idx) ?? 0) > 0 ? 0 : nl)
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

  const innerDrawerIdx = innerDrawerIndexForSelected()

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
  })() : innerDrawerIdx != null ? (() => {
    const isOpen = (openInnerDrawers.get(innerDrawerIdx) ?? 0) > 0
    return (
      <button
        className="w-full text-left text-xs text-gray-300 hover:text-white py-0.5 transition-colors"
        onClick={() => toggleSingleInnerDrawer(innerDrawerIdx)}
      >
        {isOpen ? 'Close Inner Drawer' : 'Open Inner Drawer'}
      </button>
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
              onSizeChange={/^(case_|tk_|int_|zone_|custom_)/.test(selectedPart.id) ? handleSizeChange : undefined}
              actions={drawerActions}
              jointControls={onUpdate && rp && selectedPart.id.startsWith('case_')
                ? <PartEdgeJoints cabinet={cab} rp={rp} partKey={selectedPart.id.slice(5)} onUpdate={onUpdate} />
                : undefined}
            />
          )}
          {editMenu && selectedPart && onEditPart && (
            <>
              <div className="fixed inset-0 z-[55]"
                onClick={() => setEditMenu(null)}
                onContextMenu={e => { e.preventDefault(); setEditMenu(null) }} />
              <div className="fixed z-[56] bg-gray-800 border border-gray-700 rounded shadow-xl py-1 text-[11px] pointer-events-auto"
                style={{ left: editMenu.cx, top: editMenu.cy }}
                onClick={e => e.stopPropagation()}>
                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-200 transition-colors whitespace-nowrap"
                  onClick={() => { onEditPart(selectedPart); setEditMenu(null) }}>
                  ✎ Edit Part
                </button>
              </div>
            </>
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
            {openInnerDrawers.size > 0 && (
              <button
                onClick={() => setOpenInnerDrawers(new Map())}
                className="text-[11px] font-mono text-orange-700 hover:text-orange-600 bg-white/70 hover:bg-white/90 border border-orange-300 hover:border-orange-400 rounded px-2 py-1 transition-colors pointer-events-auto select-none"
              >
                Close inner drawers
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
          openInnerDrawers={openInnerDrawers}
          edgeOverrides={edgeOverrides}
          wire={wire}
          customParts={customParts}
          partOverrides={partOverrides}
          showDrilling={showDrilling}
          handMarkers={handMarkers}
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
