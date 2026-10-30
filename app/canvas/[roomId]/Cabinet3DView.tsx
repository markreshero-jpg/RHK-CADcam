'use client'

import PartInfoCard from './PartInfoCard'
import { GrainContext, FrontGrainAcrossContext } from '@/src/components/three/woodGrain'
import { useGrainMatchGroups } from '@/src/lib/grainMatchStore'
import { Children, Fragment, isValidElement, useRef, useState, useEffect, useMemo, useContext, type Dispatch, type SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Edges } from '@react-three/drei'
import { saveSVGEdge } from './cabinetEditSvgHelpers'
import { useTutorial } from '@/src/lib/tutorial/store'
import type { CabinetInstance } from '@/src/lib/types'
import { dbUpdateCustomPart, dbSavePartPosOverride, type CabinetCustomPart, type PartPosOverrides, type ShapeOverrides } from './canvasDB'
import { customExtents, customFieldForExtent, customPanelKind, type CustomOrient } from '@/src/lib/customPartBox'
import type {
  ResolvedCabinet, ResolvedCasePart, ResolvedToekickPart,
  ResolvedInternalPart, ResolvedFaceZone,
  ResolvedDrawerStack, ResolvedDrawerSlide, ResolvedDrawerBoxPart,
  ResolvedSeamJoint, ResolvedHingeInstance, ResolvedHingeDrill,
} from '@/src/lib/resolver/types'
import {
  Box, PanelKind, PartMeta, PartEdge,
  MatColSpec, MatColMap, EbSpec, PartShape,
  panelFaceColors, unpackMatCol,
  Part, PartPropertiesPanel, PreviewCanvas, PassivePartsContext,
} from '@/src/components/three/PartViewer'
import { isSide, caseBox, internalBox, internalSeamPartKey, seamDrillsFor, intoPartFrame, seamExtentBoxes, coalesceOpposingDrills, dropNearDrills, type DrillOpPos, zoneBlank, zoneBevelNote, caseBevelNote, tkBevelNote } from '@/src/lib/jointDrilling'
import { DB_PART_LABELS } from '@/src/lib/partDisplayNames'
import { isShapedPanelKey, shapedPartLabel, zonePartId, zoneKey, dbPartId, stackKey } from '@/src/lib/cabinetShape/partKeys'
import { doorProfilePrimitives } from '@/src/lib/doorProfile'
import type { ResolvedDoorProfile } from '@/src/lib/resolver/types'
import { isKickSidePart } from '@/src/lib/resolver/types'
import { cabinetSlideDrills } from '@/src/lib/slideDrilling'
import { cabinetHingeDrills } from '@/src/lib/resolver/resolveHinges'
import { turnDrill } from '@/src/lib/resolver/hardwareTurn'
import { panelFrontEnd } from '@/src/lib/resolver/resolveShapedCase'
import { toggleFlushEnds } from '@/src/lib/cabinetShape/junctions'
import { seatNudge, cupAcrossOffset } from '@/src/lib/hingeSilhouette'
import type { ResolvedSlideDrill } from '@/src/lib/resolver/types'
import PartEdgeJoints from './PartEdgeJoints'
import { SlideModel } from '@/src/components/three/SlideModel'
import { HingeModel } from '@/src/components/three/HingeModel'
import { FixtureModel, FixtureOutline } from '@/src/components/three/FixtureModel'
import type { LocalFixtureBox } from '@/src/lib/cabinetContents'
import { getPalette } from '@/src/lib/partPalette'
import { dbBox, slideBox } from '@/src/lib/drawerHardwareBoxes'
import { tkBox, intBox, zoneBox, INT_PANEL_KIND, partShapes } from '@/src/lib/partSolids'
import type { LayerView } from '@/src/lib/displayLayers/resolve'
import { casePartItem, kickPartItem, internalPartItem, faceZoneItem, drawerBoxPartItem } from '@/src/lib/displayLayers/registry'
import { customPartItem } from '@/src/lib/displayLayers/customPartKinds'
import { PartAlpha, NO_ROTATION, EdgeEditContext } from '@/src/components/three/PartViewer'
import { useHandOpMarkers, HandOpMarkers3D } from './HandOpMarkers'
import { areaSubtraction, type CabinetOpMarker } from '@/src/lib/optimiser/partOpProject'
import { handleShape, type HandleShape } from '@/src/lib/handleGeometry'
import Handle3D from '@/src/components/three/Handle3D'
import Bin3D from '@/src/components/three/Bin3D'
import Runner3D from '@/src/components/three/Runner3D'
import AccessoryModel, { hasAccessoryModel } from '@/src/components/three/AccessoryModel'
import RailBlockModel from '@/src/components/three/RailBlockModel'
import BifoldTrackModel from '@/src/components/three/BifoldTrackModel'
import { bifoldTracks, bifoldFoldAngle } from '@/src/lib/resolver/resolveBifold'
import { railBlockEnds } from '@/src/lib/resolver/railBlocks'
import JointFittingModel from '@/src/components/three/JointFittingModel'
import { edgeLabel } from '@/src/lib/cabinetShape/footprint'
import { PartHideTicks } from '@/src/components/PartHideTicks'
import { splitCaseParts, splitBaseKey, splitPieceRange } from '@/src/lib/cabinetSplit'

export type { MatColSpec, MatColMap }

// Faint black outline drawn around every panel (and, via Part, every edge-tape
// strip) so parts and their edging read clearly against the material colours.
const PANEL_OUTLINE = '#1a1a1a'

// Outline colour for a part category: the editor's faint black line, or — in the
// room 3D view (roomOutlines) — the softer part-palette colour the room used
// before it shared this renderer.
type OutlineCategory = 'carcase' | 'toekick' | 'internal' | 'door' | 'drawer_face' | 'drawer_box'
// In the room, a layer-set colour for the part's display item (Phase 3) wins.
function makeOutline(room: boolean | undefined, palette: ReturnType<typeof getPalette>, layers?: LayerView) {
  return (cat: OutlineCategory, item?: string | null) =>
    room ? ((item ? layers?.colorOf(item) : undefined) ?? palette[cat]) : PANEL_OUTLINE
}

// ── Cabinet-specific coordinate helpers ───────────────────────────────────────
// Cabinet origin = bottom-left-back corner (+X=right, +Y=up, +Z=front).
// Each helper returns { x,y,z (part origin), w (X extent), h (Y extent), d (Z extent) }.

// tkBox / intBox / zoneBox: src/lib/partSolids.ts (shared with the cabinet sheets)
// dbBox / slideBox: src/lib/drawerHardwareBoxes.ts (shared with plan + room 3D)

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
  kick_return:         'Toe Kick Return',
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
  rail_support:        'Rail support',
}

// Panel kind dispatch for ResolvedInternalPart — drives panelFaceColors + edgeStrips orientation.


const FACE_LABELS: Record<string, string> = {
  door:        'Door',
  drawer_face: 'Drawer Face',
  false_panel: 'False Panel',
}

// ── PartMeta builders ─────────────────────────────────────────────────────────

function buildCaseInfo(p: ResolvedCasePart, b: Box): PartMeta {
  return {
    id:        `case_${p.part_key}`,
    label:     CASE_LABELS[p.part_key] ?? shapedPartLabel(p.part_key) ?? p.part_key,
    w: b.w, h: b.h, d: b.d,
    thickness: p.DZ,
    edge:      p.edge_band,
    // Curved end face board: face kind, so its extruded-up walls take the face colour (as mitred doors).
    panelKind: p.wrap ? 'face' : isSide(p.part_key) ? 'side' : p.part_key === 'back' || isShapedPanelKey(p.part_key) || p.upright ? 'face' : 'horizontal',
    materialId: p.material_id,
    ...(p.outline && (!p.AY || isShapedPanelKey(p.part_key)) ? { outline: p.outline } : {}),
    ...(caseBevelNote(p) ? { detail: `${caseBevelNote(p)} — cut ${Math.round(isSide(p.part_key) ? p.DX : p.DY)} long` } : {}),
  }
}

function buildTkInfo(p: ResolvedToekickPart, b: Box): PartMeta {
  const mitre = tkBevelNote(p)
  return { ...buildTkInfoBase(p, b), ...(mitre ? { detail: `${mitre} — cut ${Math.round(p.DY)} long` } : {}) }
}

function buildTkInfoBase(p: ResolvedToekickPart, b: Box): PartMeta {
  return {
    id:        `tk_${p.part_key}_${p.sort_order}`,
    label:     TK_LABELS[p.part_key] ?? p.part_key,
    w: b.w, h: b.h, d: b.d,
    thickness: p.DZ,
    edge:      p.edge_band,
    panelKind: p.part_key === 'spreader_horizontal'
      ? 'horizontal'
      : isKickSidePart(p.part_key)
      ? 'side'
      : 'face',
    detail:    p.sort_order > 0 ? `#${p.sort_order}` : undefined,
    materialId: p.material_id,
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
    materialId: p.material_id,
    ...(p.outline ? { outline: p.outline } : {}),
  }
}

function buildDbPartInfo(p: ResolvedDrawerBoxPart, b: Box, stack: ResolvedDrawerStack): PartMeta {
  return {
    id:        dbPartId(stack, p.part_type),
    label:     DB_PART_LABELS[p.part_type] ?? p.part_type,
    w: b.w, h: b.h, d: b.d,
    thickness: p.DZ,
    edge:      p.edge_band,
    panelKind: (p.part_type === 'db_left_side' || p.part_type === 'db_right_side') ? 'side'
               : (p.part_type === 'db_bottom') ? 'horizontal' : 'face',
    detail:    `Row ${stack.face_zone_row + 1}, Col ${stack.face_zone_col + 1} · ${stack.drawer_type}`,
    materialId: p.material_id,
  }
}

function buildSlideInfo(s: ResolvedDrawerSlide, b: Box, stack: ResolvedDrawerStack): PartMeta {
  return {
    id:        `slide_${stackKey(stack)}_${s.side}`,
    hardware:  true,
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
    hardware:  true,
    label:     `Inner Drawer Slide (${s.side})`,
    w: b.w, h: b.h, d: b.d,
    thickness: s.DZ,
    edge:      { top: false, bottom: false, left: false, right: false },
    panelKind: 'side',
    detail:    `${s.nominal_length}mm NL · Box ht ${s.box_height}mm`,
  }
}

// Hardware ids that aren't panels: no Part Editor, no shape, no delete.
// Slides keep their older slide_ / int_slide_ ids; everything else is hw_.
function isHardwarePartId(id: string): boolean {
  return id.startsWith('hw_') || id.startsWith('slide_') || id.startsWith('int_slide_')
}

const _hwInv = new THREE.Matrix4(), _hwMat = new THREE.Matrix4()
const _hwBox = new THREE.Box3(), _hwTmp = new THREE.Box3()
const _hwC = new THREE.Vector3(), _hwS = new THREE.Vector3()

// Click-to-select wrapper for cabinet hardware drawn as models (runners, hinges,
// handles, bins) rather than Part boxes. Mirrors Part's pick behaviour —
// right-click selects on desktop, tap selects on touch, orbit drags don't
// select. The model's own materials can't be recoloured, so selection / hover
// draws an outline box around the meshes, measured each frame in this group's
// space (models load async, hinge arms fold, bins slide).
function PickableHardware({ meta, selected, onSelect, dragRef, children }: {
  meta:     PartMeta
  selected: boolean
  onSelect: (meta: PartMeta | null) => void
  dragRef:  React.MutableRefObject<boolean>
  children: React.ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  const touchDownRef = useRef<{ x: number; y: number } | null>(null)
  const groupRef = useRef<THREE.Group>(null)
  const boxRef   = useRef<THREE.Mesh>(null)
  const passive  = useContext(PassivePartsContext)
  const outline  = selected ? '#f59e0b' : hovered ? '#ff6200' : null
  useFrame(() => {
    const g = groupRef.current, m = boxRef.current
    if (!g || !m) return
    g.updateWorldMatrix(true, true)
    _hwInv.copy(g.matrixWorld).invert()
    _hwBox.makeEmpty()
    // Measure the hardware only — never the outline box itself (drei's Edges
    // lines are a Mesh too, so including them grew the box every frame).
    for (const child of g.children) {
      if (child === m) continue
      child.traverse(o => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh || !mesh.visible) return
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
        _hwTmp.copy(mesh.geometry.boundingBox!).applyMatrix4(_hwMat.multiplyMatrices(_hwInv, mesh.matrixWorld))
        _hwBox.union(_hwTmp)
      })
    }
    if (_hwBox.isEmpty()) { m.visible = false; return }
    _hwBox.getCenter(_hwC); _hwBox.getSize(_hwS)
    m.position.copy(_hwC)
    m.scale.set(_hwS.x + 2, _hwS.y + 2, _hwS.z + 2)
    m.visible = true
  })
  // userData.partId tags the hardware's meshes for the cross section (z_section_view X4).
  if (passive) return <group userData={{ partId: meta.id }}>{children}</group>
  return (
    <group
      ref={groupRef}
      userData={{ partId: meta.id }}
      onPointerDown={e => {
        dragRef.current = false
        const ne = e.nativeEvent as PointerEvent
        touchDownRef.current = ne.pointerType === 'touch' ? { x: ne.clientX, y: ne.clientY } : null
      }}
      onPointerMove={e => {
        if (!e.buttons) return
        const t = touchDownRef.current, ne = e.nativeEvent as PointerEvent
        if (!t || Math.hypot(ne.clientX - t.x, ne.clientY - t.y) > 8) dragRef.current = true
      }}
      onClick={e => {
        if (!touchDownRef.current) return
        e.stopPropagation()
        if (!dragRef.current) onSelect(meta)
      }}
      onContextMenu={e => { e.stopPropagation(); onSelect(meta) }}
      onPointerOver={e => { e.stopPropagation(); setHovered(true) }}
      onPointerOut={() => setHovered(false)}
    >
      {children}
      {outline && (
        <mesh ref={boxRef} visible={false} raycast={() => null}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color={outline} transparent opacity={selected ? 0.2 : 0} depthWrite={false} />
          <Edges threshold={10} color={outline} linewidth={selected ? 1.5 : 2.5} />
        </mesh>
      )}
    </group>
  )
}

function buildHingeInfo(h: ResolvedHingeInstance): PartMeta {
  return {
    id:        `hw_hinge_${h.row_index}_${h.col_index}_${h.sort_order}`,
    hardware:  true,
    label:     h.hinge_name ? `Hinge — ${h.hinge_name}` : 'Hinge',
    w: 0, h: 0, d: 0,
    thickness: 0,
    edge:      { top: false, bottom: false, left: false, right: false },
    panelKind: 'side',
    detail:    `${h.hinge_edge} edge · ${Math.round(h.y_position_mm)}mm up the door`
             + (h.mount_target ? '' : ' · no mounting surface')
             + (h.mount_angle_deg ? ` · ${h.mount_angle_deg}° mount${h.angle_matched === false ? ' (no match, default used)' : ''}` : ''),
  }
}

function buildHandleInfo(s: HandleShape, z: ResolvedFaceZone): PartMeta {
  const h = s.handle
  return {
    id:        `hw_handle_${zoneKey(z)}`,
    hardware:  true,
    label:     `Handle — ${h.name}`,
    w: Math.round(s.w), h: Math.round(s.h), d: Math.round(s.projection),
    thickness: Math.round(s.projection),
    edge:      { top: false, bottom: false, left: false, right: false },
    panelKind: 'face',
    detail:    [
      h.orientation,
      h.bore_centres ? `${h.bore_centres}mm centres` : null,
      h.holes.length ? `${h.holes.length} × Ø${h.hole_dia} holes${h.drilled ? '' : ' (not drilled)'}` : null,
    ].filter(Boolean).join(' · '),
  }
}

function buildBinInfo(stack: ResolvedDrawerStack): PartMeta {
  return {
    id:        `hw_bin_${stackKey(stack)}`,
    hardware:  true,
    label:     'Pull-out Bin',
    w: Math.round(stack.box_width), h: Math.round(stack.box_height), d: Math.round(stack.box_depth),
    thickness: 0,
    edge:      { top: false, bottom: false, left: false, right: false },
    panelKind: 'side',
    detail:    `Row ${stack.face_zone_row + 1}, Col ${stack.face_zone_col + 1}`
             + (stack.slides[0] ? ` · ${stack.slides[0].nominal_length}mm NL` : ''),
  }
}

function buildZoneInfo(z: ResolvedFaceZone, b: Box): PartMeta {
  return {
    id:        zonePartId(z),
    label:     FACE_LABELS[z.face_type] ?? z.face_type,
    w: b.w, h: b.h, d: b.d,
    thickness: z.DZ,
    edge:      z.edge_band,
    panelKind: 'face',
    dxIsWidth: true,   // face zone: DX=width, DY=height (already upright)
    detail:    [
      z.facet ? edgeLabel(z.facet) : null,
      `Row ${z.row_index + 1}, Col ${z.col_index + 1}`,
      z.hinge_side ? `Hinge: ${z.hinge_side}` : null,
      zoneBevelNote(z) ? `${zoneBevelNote(z)} — cut ${Math.round(zoneBlank(z).width)} wide` : null,
    ].filter(Boolean).join(' · '),
    materialId: z.material_id,
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
  shape?:             PartShape   // mitred doors (z_cabinet_shape) / Shape Editor overrides
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

/** Sliding bi-fold pair (z_bifold_slide): how one of its doors opens. span = both doors +
 *  the gap between them; maxAngle = how far they fold (the open pack, door thicknesses
 *  side by side at the hinge gable). */
interface BifoldOpen { role: 'outer' | 'leading'; span: number; maxAngle: number }

function DoorPanel({ b, hingeSide, doorsOpen, doorProfile, hinges, cupDrills, showDrilling, showPanel = true, panelAlpha = 1, hingeAlpha = 1, handle, handleMeta, handleAlpha = 1, handleParts, selectedId, bifold, ...partProps }: PartProps & {
  handle?:    HandleShape | null   // z_handles H2 — swings with the door
  handleMeta?: PartMeta            // click-to-select info for the handle
  selectedId?: string | null       // selected part id (hinge / handle highlight)
  handleAlpha?: number
  handleParts?: { bar: boolean; holes: boolean }
  b:          Box
  hingeSide:  'left' | 'right'
  doorsOpen:  boolean
  showPanel?: boolean   // false = door hidden by the layer set; hinge bodies still swing
  panelAlpha?: number   // layer-set material alpha (ghost / opacity) — door, hinges
  hingeAlpha?: number
  doorProfile?: ResolvedDoorProfile | null
  hinges?:    ResolvedHingeInstance[]
  cupDrills?: ResolvedHingeDrill[]   // world coords; converted to local below
  showDrilling?: boolean
  bifold?:    BifoldOpen
}) {
  const groupRef     = useRef<THREE.Group>(null)
  const curAngle     = useRef(0)
  const doorsOpenRef = useRef(doorsOpen)
  doorsOpenRef.current = doorsOpen

  const sign      = hingeSide === 'left' ? -1 : 1
  const openAngle = sign * (bifold ? bifold.maxAngle : Math.PI / 2)
  // A bi-fold's leading door turns about its leading edge (the carriage on the top
  // track), the far side from the hinge gable; that edge slides toward the gable as
  // the pair folds: span·(1 − cos θ) for the outer door at θ. It turns the other way,
  // so the joint between the doors comes out into the room.
  const leading   = bifold?.role === 'leading'
  const pivotLeft = leading ? hingeSide === 'right' : hingeSide === 'left'
  const hingeX    = pivotLeft ? b.x : b.x + b.w
  const localB: Box = { x: pivotLeft ? 0 : -b.w, y: 0, z: 0, w: b.w, h: b.h, d: b.d }
  const mirror    = hingeSide === 'left'   // swapped: left hand gets the X reflection

  const place = (a: number) => {
    const g = groupRef.current
    if (!g) return
    if (!leading) { g.rotation.y = a; return }
    g.rotation.y = -a
    g.position.x = hingeX + sign * bifold!.span * (1 - Math.cos(a))
  }
  useFrame(() => {
    if (!groupRef.current) return
    const target = doorsOpenRef.current ? openAngle : 0
    if (Math.abs(curAngle.current - target) < 0.001) {
      curAngle.current = target
      place(target)
      return
    }
    curAngle.current = THREE.MathUtils.lerp(curAngle.current, target, 0.12)
    place(curAngle.current)
  })

  return (
    <group ref={groupRef} position={[hingeX, b.y, b.z]}>
      {showPanel && (
        <PartAlpha a={panelAlpha}>
          <Part b={localB} {...partProps} />
          {doorProfile && <DoorProfile3D profile={doorProfile} b={localB} />}
        </PartAlpha>
      )}
      {handle && (() => {
        const h3 = <Handle3D s={handle} offset={[-hingeX, -b.y, -b.z]} opacity={handleAlpha} showBar={handleParts?.bar ?? true} showHoles={handleParts?.holes ?? true} />
        return handleMeta
          ? <PickableHardware meta={handleMeta} selected={selectedId === handleMeta.id} onSelect={partProps.onSelect} dragRef={partProps.dragRef}>{h3}</PickableHardware>
          : h3
      })()}
      {/* Door-side hinge body (HingeCupArm = cup + front arm to the knuckle) lives
          inside the rotating group so it swings with the door. The gable-side back
          arm (HingeArm) folds separately near the plate (see below). Local origin
          sits on the hinge axis; y = hinge height from door bottom. */}
      {(hinges ?? []).filter(h => h.model_url).map((h, hi) => { const hm = buildHingeInfo(h); return (
        <PartAlpha key={`cup${hi}`} a={hingeAlpha}>
        <PickableHardware meta={hm} selected={selectedId === hm.id} onSelect={partProps.onSelect} dragRef={partProps.dragRef}>
        <HingeMeshPlaced
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
        </PickableHardware>
        </PartAlpha>
      )})}
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
  faceHighlighted, materialColours, ebByMatId, edgeOverrides, wire, partOverrides, dragRef, shapes3D,
  showFace = true, showBox = true, showSlides = true, roomOutlines, layers, handle,
}: {
  handle?:           HandleShape | null   // z_handles H2 — slides with the drawer
  roomOutlines?:     boolean
  layers?:           LayerView
  showFace?:         boolean
  showBox?:          boolean
  showSlides?:       boolean
  faceZone:          ResolvedFaceZone
  stack:             ResolvedDrawerStack
  targetTravel:      number
  // Sampled shape overrides by part id — front zone + drawer-box parts (slides
  // are hardware, never shaped).
  shapes3D?:         Map<string, PartShape>
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
  const outline = makeOutline(roomOutlines, palette, layers)
  const alpha = (id: string) => layers ? layers.alpha(id) : 1

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
    // Tape with no colour on record reads as the part's material face colour —
    // one colour for every strip, matched to the face.
    return { thick: spec.thickness, color: spec.color ?? unpackMatCol(materialColours?.[matId], '#c8b89a').face }
  }
  function applyEdgeOv<T extends PartMeta>(info: T): T {
    const ov = edgeOverrides.get(info.id)
    return ov ? { ...info, edge: ov } : info
  }

  const zoneId      = zonePartId(faceZone)
  const pz          = applyPosOv(faceZone, zoneId, partOverrides)
  const zb          = zoneBox(pz)
  const zInfo       = applyEdgeOv(buildZoneInfo(faceZone, zb))
  const zs          = matSpec(faceZone.material_id, '#e2d9c8')
  const zFaceColors = panelFaceColors(zInfo.panelKind, faceZone.face_type, zs.face, zs.back, zs.edge)
  const slideColor  = '#6b7280'

  return (
    <group ref={groupRef} userData={{ drawerTravel: true }}>
      {showFace && <PartAlpha a={alpha('drawer_fronts')}><Part
        b={zb}
        faceColors={zFaceColors}
        edgeLineColor={outline('drawer_face', 'drawer_fronts')}
        meta={zInfo}
        selected={selected?.id === zInfo.id}
        highlighted={faceHighlighted}
        onSelect={onSelect}
        contextMenuSelect
        dragRef={dragRef}
        ebSpec={ebFor(faceZone.material_id)}
        wire={wire}
        rotation={getRotOv(zoneId, partOverrides)}
        shape={shapes3D?.get(zoneId)}
      /></PartAlpha>}
      {handle && (() => { const hm = buildHandleInfo(handle, faceZone); return (
        <PickableHardware meta={hm} selected={selected?.id === hm.id} onSelect={onSelect} dragRef={dragRef}>
          <Handle3D s={handle} opacity={alpha('handles')} showBar={!layers || layers.show('handles')} showHoles={!layers || layers.show('handle_holes')} />
        </PickableHardware>
      )})()}
      {(showBox ? stack.box_parts.filter(p => !layers || layers.show(drawerBoxPartItem(p.part_type))) : []).map((p, pi) => {
        const it   = drawerBoxPartItem(p.part_type)
        const id   = dbPartId(stack, p.part_type)
        const pp   = applyPosOv(p, id, partOverrides)
        const b    = dbBox(pp)
        const info = buildDbPartInfo(p, b, stack)
        const s    = matSpec(p.material_id, '#d4c8a8')
        const fc   = panelFaceColors(info.panelKind as PanelKind, p.part_type, s.face, s.back, s.edge)
        return (
          <PartAlpha key={`db_${pi}`} a={alpha(it)}><Part
            b={b}
            faceColors={fc}
            edgeLineColor={outline('drawer_box', it)}
            meta={info}
            selected={selected?.id === info.id}
            highlighted={false}
            onSelect={onSelect}
            contextMenuSelect
            dragRef={dragRef}
            ebSpec={ebFor(p.material_id)}
            wire={wire}
            rotation={getRotOv(id, partOverrides)}
            shape={shapes3D?.get(id)}
          /></PartAlpha>
        )
      })}
      {/* Pull-out bin (z_bin_cabinet B5): the generic bin replaces its rails. */}
      {stack.drawer_type === 'bin' && (!layers || layers.show('bins')) && (() => { const bm = buildBinInfo(stack); return (
        <PickableHardware meta={bm} selected={selected?.id === bm.id} onSelect={onSelect} dragRef={dragRef}>
          <Bin3D stack={stack} opacity={alpha('bins')} />
        </PickableHardware>
      )})()}
      {(showSlides && stack.drawer_type !== 'bin' ? stack.slides : []).map((sl, li) => {
        const id   = `slide_${stackKey(stack)}_${sl.side}`
        const ps   = applyPosOv(sl, id, partOverrides)
        const b    = slideBox(ps)
        const sc   = sl.colour ?? slideColor
        const info = buildSlideInfo(sl, b, stack)
        if (ps.model_url && ps.model_format) {
          // Front-top-outer corner of the rail (model convention origin).
          const originX = ps.side === 'left' ? ps.X : ps.X + ps.DZ
          const originY = ps.Y + ps.DY
          const originZ = ps.Z + ps.DX
          return (
            <PartAlpha key={`sl_${li}`} a={alpha('drawer_runners')}><PickableHardware meta={info} selected={selected?.id === info.id} onSelect={onSelect} dragRef={dragRef}><SlideModel
              url={ps.model_url}
              format={ps.model_format}
              scale={ps.model_scale}
              anchor={{ x: ps.model_anchor_x, y: ps.model_anchor_y, z: ps.model_anchor_z }}
              position={[originX, originY, originZ]}
              sideOrientation={ps.side}
              color={sc}
              fallbackBox={{ w: ps.DZ, h: ps.DY, d: ps.DX }}
            /></PickableHardware></PartAlpha>
          )
        }
        // Parametric runner family (z_runner_models), drawn at this rail's size.
        if (ps.drawn_as) return <PartAlpha key={`sl_${li}`} a={alpha('drawer_runners')}><PickableHardware meta={info} selected={selected?.id === info.id} onSelect={onSelect} dragRef={dragRef}><Runner3D rail={ps} opacity={alpha('drawer_runners')} /></PickableHardware></PartAlpha>
        const fc   = panelFaceColors('side', `slide_${sl.side}`, sc, sc, sc)
        return (
          <PartAlpha key={`sl_${li}`} a={alpha('drawer_runners')}><Part
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
          /></PartAlpha>
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
function PartWithHoles({ b, drills, faceColors, edgeLineColor, meta, selected, highlighted, onSelect, dragRef, wire, contextMenuSelect = false, ebSpec, rotation, subtractions, shape }: {
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
  subtractions?:      { center: [number, number, number]; size: [number, number, number] }[]
  shape?:             PartShape | null
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
        subtractions={subtractions}
        shape={shape}
      />
      {/* Dark disc + bore-wall markers per hole, depth-aware: the entry disc
          sits on the face the bit enters, the bore wall runs depthLen into the
          panel, and stopped holes get a flat bottom cap instead of an exit
          disc — only true through-bores mark the far face. In wire mode,
          depthTest=false + renderOrder=10 makes them show through panel edges.
          Nested so the markers share the part's pivot ([b.x,b.y,b.z]) and
          rotation: outer group sits at the reference corner and carries the
          rotation, the inner group offsets to the box centre — matching how
          Part positions its mesh. With no rotation this is identical to placing
          the markers at the absolute box centre. */}
      <group position={[b.x, b.y, b.z]} rotation={rotation ?? NO_ROTATION}>
      <group position={[b.w / 2, b.h / 2, b.d / 2]}>
        {drills.map((d, i) => {
          const localX = d.x - (b.x + b.w / 2)
          const localY = d.y - (b.y + b.h / 2)
          const localZ = d.z - (b.z + b.d / 2)
          const eps    = 0.2
          const ro     = wire ? 10 : 0
          const dt     = !wire

          const ax  = d.axis[0] as 'x' | 'y' | 'z'
          const dir = d.axis[1] === '+' ? 1 : -1
          const extent  = ax === 'x' ? b.w : ax === 'y' ? b.h : b.d
          const len     = Math.min(Math.max(d.depthLen, 0.1), extent)
          const through = d.depthLen >= extent - 0.05
          const entry   = -dir * extent / 2          // entry face, local coord along ax

          const at = (v: number): [number, number, number] =>
            ax === 'x' ? [v, localY, localZ] : ax === 'y' ? [localX, v, localZ] : [localX, localY, v]
          // circleGeometry faces +Z, cylinderGeometry runs along +Y — rotate onto ax.
          const discRot: [number, number, number] = ax === 'x' ? [0, Math.PI / 2, 0] : ax === 'y' ? [Math.PI / 2, 0, 0] : [0, 0, 0]
          const cylRot:  [number, number, number] = ax === 'x' ? [0, 0, Math.PI / 2] : ax === 'y' ? [0, 0, 0] : [Math.PI / 2, 0, 0]

          return (
            <group key={i}>
              {/* entry disc, just outside the entry face */}
              <mesh position={at(entry - dir * eps)} rotation={discRot} renderOrder={ro}>
                <circleGeometry args={[d.radius, 32]} />
                <meshBasicMaterial color="#0a0a0a" side={THREE.DoubleSide} depthTest={dt} />
              </mesh>
              {/* exit disc — through-bores only */}
              {through && (
                <mesh position={at(-entry + dir * eps)} rotation={discRot} renderOrder={ro}>
                  <circleGeometry args={[d.radius, 32]} />
                  <meshBasicMaterial color="#0a0a0a" side={THREE.DoubleSide} depthTest={dt} />
                </mesh>
              )}
              {/* bore wall from the entry face to depth — open-ended, BackSide shows inner wall */}
              <mesh position={at(entry + dir * len / 2)} rotation={cylRot} renderOrder={ro}>
                <cylinderGeometry args={[d.radius, d.radius, len, 32, 1, true]} />
                <meshBasicMaterial color="#0a0a0a" side={THREE.BackSide} depthTest={dt} />
              </mesh>
              {/* flat bottom cap for stopped holes */}
              {!through && (
                <mesh position={at(entry + dir * len)} rotation={discRot} renderOrder={ro}>
                  <circleGeometry args={[d.radius, 32]} />
                  <meshBasicMaterial color="#0a0a0a" side={THREE.DoubleSide} depthTest={dt} />
                </mesh>
              )}
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
  drills: { x: number; y: number; z: number; axis: ResolvedSlideDrill['axis']; radius: number; depthLen: number; dir?: { x: number; y: number; z: number } }[]
  wire?:  boolean
  color?: string
}) {
  const ro = wire ? 10 : 0
  const dt = !wire
  return (
    <group>
      {drills.map((d, i) => {
        // Off-axis bore (a plate on an angled panel / a turned facet's drawer).
        if (d.dir) {
          const len = Math.max(2, d.depthLen)
          const v = new THREE.Vector3(d.dir.x, d.dir.y, d.dir.z).normalize()
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v)
          const e = new THREE.Euler().setFromQuaternion(q)
          const qd = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), v)
          const ed = new THREE.Euler().setFromQuaternion(qd)
          return (
            <group key={i}>
              <mesh position={[d.x, d.y, d.z]} rotation={[ed.x, ed.y, ed.z]} renderOrder={ro}>
                <circleGeometry args={[d.radius, 24]} />
                <meshBasicMaterial color={color} side={THREE.DoubleSide} depthTest={dt} />
              </mesh>
              <mesh position={[d.x + v.x * len / 2, d.y + v.y * len / 2, d.z + v.z * len / 2]} rotation={[e.x, e.y, e.z]} renderOrder={ro}>
                <cylinderGeometry args={[d.radius, d.radius, len, 24, 1, true]} />
                <meshBasicMaterial color={color} side={THREE.DoubleSide} depthTest={dt} />
              </mesh>
            </group>
          )
        }
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


// ── PartMeta by stable id ──────────────────────────────────────────────────────
// Rebuild the same PartMeta the 3D render produces for a part id, without going
// through the scene — used by hosts that open the Part Editor from non-3D entry
// points (e.g. the Overrides tab's shape rows). Pos/size overrides are applied;
// per-part edge overrides are NOT (they load async in the 3D view — banding
// display seed only, acceptable for this path).
export function buildPartMetaById(
  rp: ResolvedCabinet,
  partId: string,
  customParts?: CabinetCustomPart[],
  partOverrides?: PartPosOverrides,
): PartMeta | null {
  const sz = (b: Box) => applySizeOv(b, partId, partOverrides)
  if (partId.startsWith('case_')) {
    const p = rp.case_parts.find(x => `case_${x.part_key}` === partId)
    return p ? buildCaseInfo(p, sz(caseBox(applyPosOv(p, partId, partOverrides)))) : null
  }
  if (partId.startsWith('tk_')) {
    const p = rp.toekick_parts.find(x => `tk_${x.part_key}_${x.sort_order}` === partId)
    return p ? buildTkInfo(p, sz(tkBox(applyPosOv(p, partId, partOverrides)))) : null
  }
  if (partId.startsWith('int_')) {
    const p = rp.internal_parts.find(x => `int_${x.part_type}_${x.sort_order}` === partId)
    return p ? buildIntInfo(p, sz(intBox(applyPosOv(p, partId, partOverrides)))) : null
  }
  if (partId.startsWith('zone_')) {
    const z = rp.face_zones.find(x => zonePartId(x) === partId)
    return z ? buildZoneInfo(z, sz(zoneBox(applyPosOv(z, partId, partOverrides)))) : null
  }
  if (partId.startsWith('db_')) {
    for (const s of rp.drawer_stacks ?? []) {
      const p = s.box_parts.find(x => dbPartId(s, x.part_type) === partId)
      if (p) return buildDbPartInfo(p, sz(dbBox(applyPosOv(p, partId, partOverrides))), s)
    }
    return null
  }
  if (partId.startsWith('custom_')) {
    const cp = customParts?.find(x => `custom_${x.id}` === partId)
    if (!cp) return null
    const orient = (cp.orientation ?? 'flat') as CustomOrient
    const { ex, ey, ez } = customExtents(orient, Number(cp.dx), Number(cp.dy), Number(cp.dz))
    return {
      id: partId,
      label: cp.name ?? 'Custom Part',
      w: ex, h: ey, d: ez,
      thickness: Number(cp.dz),
      edge: { top: cp.edge_top, bottom: cp.edge_bottom, left: cp.edge_left, right: cp.edge_right },
      panelKind: customPanelKind(orient),
      // Front-standing customs match the face-zone frame (DX=width, DY=length).
      dxIsWidth: orient === 'front' || undefined,
      materialId: cp.material_id ?? undefined,
    }
  }
  return null
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

// A front zone on a shaped cabinet's facet (z_cabinet_shape Phase 3) carries
// AY about its min corner. Turning the whole rendered zone — door swing,
// hinges, profile, drawer — about that corner keeps every child in the zone's
// own square frame. AY = 0 → the element as-is.
function turnZone(z: ResolvedFaceZone, i: number, el: React.ReactNode): React.ReactNode {
  if (!z.AY) return el
  return (
    <group key={`turn${i}`} position={[z.X, z.Y, z.Z]} rotation={[0, z.AY * Math.PI / 180, 0]}>
      <group position={[-z.X, -z.Y, -z.Z]}>{el}</group>
    </group>
  )
}

// Case part rotation: the resolver's own AY (shaped-cabinet panels / facet
// rails, z_cabinet_shape) plus any Part Editor rotation override.
function caseRot(p: ResolvedCasePart, id: string, overrides: PartPosOverrides | undefined): [number, number, number] | undefined {
  const ov = getRotOv(id, overrides)
  if (!p.AY) return ov
  const ay = p.AY * Math.PI / 180
  return ov ? [ov[0], ov[1] + ay, ov[2]] : [0, ay, 0]
}

// Kick part rotation: shaped cabinets turn kick boards / spreaders onto their
// edge (z_cabinet_shape 4b) plus any Part Editor rotation override.
function tkRot(p: ResolvedToekickPart, id: string, overrides: PartPosOverrides | undefined): [number, number, number] | undefined {
  const ov = getRotOv(id, overrides)
  if (!p.AY) return ov
  const ay = p.AY * Math.PI / 180
  return ov ? [ov[0], ov[1] + ay, ov[2]] : [0, ay, 0]
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
  return <group ref={groupRef} userData={{ drawerTravel: true }}>{children}</group>
}

// Exploded view (edit modal slider): every top-level part / assembly slides out
// from the cabinet centre by `amount` × its own centre's distance from it, so a
// part keeps its holes, hinges and handles with it. Each child gets its own
// wrapper group that only this moves, so the offset is absolute (0 = assembled)
// and never fights the part's own position or a door / drawer animation.
function ExplodeGroup({ amount, centre, version, position, children }: {
  amount: number; centre: [number, number, number]; version: unknown
  position: [number, number, number]; children: React.ReactNode
}) {
  const ref = useRef<THREE.Group>(null)
  const tmp = useMemo(() => ({ box: new THREE.Box3(), c: new THREE.Vector3(), inv: new THREE.Matrix4() }), [])
  useFrame(() => {
    const g = ref.current
    if (!g) return
    for (const w of g.children) {
      if (!amount) { if (w.position.lengthSq()) w.position.set(0, 0, 0); continue }
      const u = w.userData as { exC?: THREE.Vector3; exVer?: unknown }
      if (!u.exC || u.exVer !== version) {
        // The wrapper's centre with it at rest (its offset is a pure translation).
        g.updateWorldMatrix(true, false)
        w.updateWorldMatrix(false, true)
        tmp.box.setFromObject(w)
        if (tmp.box.isEmpty()) continue
        tmp.inv.copy(g.matrixWorld).invert()
        u.exC = tmp.box.getCenter(tmp.c).applyMatrix4(tmp.inv).sub(w.position).clone()
        u.exVer = version
      }
      w.position.set((u.exC.x - centre[0]) * amount, (u.exC.y - centre[1]) * amount, (u.exC.z - centre[2]) * amount)
    }
  })
  return <group ref={ref} position={position}>{explodeItems(children).map(({ key, node }) => <group key={key}>{node}</group>)}</group>
}

// The scene's children with fragments opened up (the internals block returns a
// fragment of parts), so each part gets its own explode wrapper. Keys carry the
// fragment path so siblings from different fragments never collide.
function explodeItems(nodes: React.ReactNode, prefix = ''): { key: string; node: React.ReactNode }[] {
  return Children.toArray(nodes).flatMap((ch, i) => {
    const key = `${prefix}${isValidElement(ch) && ch.key != null ? ch.key : i}`
    return isValidElement(ch) && ch.type === Fragment
      ? explodeItems((ch.props as { children?: React.ReactNode }).children, `${key}/`)
      : [{ key, node: ch }]
  })
}

// ── Cabinet scene ─────────────────────────────────────────────────────────────

// Exported so the room 3D view renders cabinets with the exact same geometry
// (overrides, shapes, hardware models). `layers` gates everything by display
// layer item; omitted (cabinet editor) = show everything.
export type SceneCustomPart = Pick<CabinetCustomPart,
  'id' | 'name' | 'material_id' | 'dx' | 'dy' | 'dz' | 'x' | 'y' | 'z' |
  'edge_top' | 'edge_bottom' | 'edge_left' | 'edge_right' | 'visible' | 'orientation'> &
  { part_library_id?: string | null; library_key?: string | null }

export function CabinetScene({
  cab, rp, selected, onSelect, highlightPartKeys, materialColours, ebByMatId, doorsOpen, openDrawers, openInnerDrawers, edgeOverrides, wire, customParts, partOverrides, shapeOverrides, showDrilling: showDrillingProp = true, handMarkers = [], layers, roomOutlines, explode = 0,
}: {
  roomOutlines?:        boolean
  // Exploded view, 0 = assembled (edit modal slider; the room 3D leaves it off).
  explode?:             number
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
  customParts?:         SceneCustomPart[]
  partOverrides?:       PartPosOverrides
  shapeOverrides?:      ShapeOverrides
  showDrilling?:        boolean
  handMarkers?:         CabinetOpMarker[]
  layers?:              LayerView
}) {
  const show = (id: string) => !layers || layers.show(id)
  // "Ghost" style / opacity in 3D (Phase 3c): material alpha per display item.
  const alpha = (id: string) => layers ? layers.alpha(id) : 1
  const showDrilling = showDrillingProp && show('machining')
  const gmGroups = useGrainMatchGroups(cab.room_id)
  const frontsAcross = gmGroups.find(g => g.id === cab.grain_match_group_id)?.direction === 'horizontal'
  const { dx, dy, dz } = cab
  const dragRef = useRef(false)
  const hlSet   = highlightPartKeys ? new Set(highlightPartKeys) : null
  const palette = useMemo(() => getPalette(), [])
  const outline = makeOutline(roomOutlines, palette, layers)

  // Shape Editor overrides → sampled outlines, cached per part so Part's
  // geometry memo only re-tessellates when a shape actually changes. Mirror
  // matches the Part Editor's display rule (right-hand side twins — case or
  // drawer-box — were authored on the mirrored frame). Slides are hardware,
  // not panels: never shaped.
  const shapes3D = useMemo(() => {
    return partShapes(rp, shapeOverrides)
  }, [shapeOverrides, rp])

  const boxByKey = useMemo(() => {
    const m: Record<string, Box> = {}
    for (const p of rp.case_parts) {
      const pp = applyPosOv(p, `case_${p.part_key}`, partOverrides)
      m[p.part_key] = caseBox(pp)
    }
    // Internal shelves/dividers participate in seams too (int_… keys).
    for (const p of rp.internal_parts) {
      const key = internalSeamPartKey(p)
      const b = internalBox(applyPosOv(p, key, partOverrides))
      if (b) m[key] = b
    }
    return m
  }, [rp.case_parts, rp.internal_parts, partOverrides])
  // Height split (z_cabinet_split): the case parts as made, and which ones were cut.
  const casePieces = useMemo(() => splitCaseParts(rp.case_parts, rp.split_at), [rp.case_parts, rp.split_at])
  const cutBases = useMemo(() => new Set(casePieces.filter(q => q.part_key.startsWith('split:')).map(q => splitBaseKey(q.part_key))), [casePieces])

  const drawerStackByKey = useMemo(() => {
    const m = new Map<string, ResolvedDrawerStack>()
    for (const s of rp.drawer_stacks ?? []) {
      m.set(stackKey(s), s)
    }
    return m
  }, [rp.drawer_stacks])

  // Collect drill holes grouped by which part they enter, for CSG subtraction.
  // Opposing coincident bores (division drilled from both compartments) are
  // coalesced into single through-bores first.
  const holesByPartKey = useMemo(() => {
    const m = new Map<string, DrillOpPos[]>()
    if (!showDrilling) return m
    const flat: DrillOpPos[] = []
    for (const sj of rp.seam_joints) {
      const bA = boxByKey[sj.part_a_key]
      const bB = boxByKey[sj.part_b_key]
      if (!bA || !bB) continue
      flat.push(...seamDrillsFor(sj, rp, bA, bB))
    }
    // Turned panels measure their through-bore along their plan AABB (L3).
    const turned = rp.case_parts.filter(p => p.AY)
    const eb = turned.length ? seamExtentBoxes(rp) : null
    const ext = eb ? { ...boxByKey, ...Object.fromEntries(turned.map(p => [p.part_key, eb[p.part_key]])) } : boxByKey
    for (const d of coalesceOpposingDrills(dropNearDrills(flat), ext)) {
      const arr = m.get(d.targetPartKey) ?? []
      arr.push(d)
      m.set(d.targetPartKey, arr)
    }
    return m
  }, [rp, boxByKey, showDrilling])

  // Slide-imposed drilling (cabinet member + drawer-box surfaces), already
  // resolved to absolute cabinet coords on each slide. Rendered as an overlay.
  const slideDrills = useMemo(
    () => (showDrilling ? cabinetSlideDrills(rp.drawer_stacks ?? [], rp.internal_slides ?? []) : []),
    [rp.drawer_stacks, showDrilling],
  )
  // Door hinge_side per zone — decides which doors animate (left/right swing).
  const zoneEdge = useMemo(() => {
    const m = new Map<string, string | undefined>()
    for (const z of rp.face_zones) if (z.face_type === 'door') m.set(zoneKey(z), z.hinge_side)
    return m
  }, [rp.face_zones])
  // Cup + anchor bores grouped by door zone (world coords) — these ride inside the
  // door's rotating group for animated doors so they swing with the door.
  const cupDrillsByZone = useMemo(() => {
    const m = new Map<string, ResolvedHingeDrill[]>()
    const push = (k: string, ds: ResolvedHingeDrill[]) => m.set(k, [...(m.get(k) ?? []), ...ds])
    for (const h of rp.hinge_instances ?? []) {
      push(zoneKey(h), h.cup_drills)
      // Bi-fold screw holes ride on the trailing door (z_cabinet_shape L2).
      const mt = h.mount_target
      if (h.pie === 'bifold' && mt?.table === 'face_zones') {
        push(zoneKey({ facet: mt.facet, row_index: mt.row_index ?? 0, col_index: mt.col_index ?? 0 }), h.plate_drills)
      }
    }
    // Sliding bi-fold fittings (z_bifold_slide): zone-local → cabinet coords.
    for (const z of rp.face_zones) {
      if (!z.bifold_holes?.length) continue
      push(zoneKey(z), z.bifold_holes.map(p => ({
        x: z.X + p.x, y: z.Y + p.y, z: z.Z, axis: 'z+' as const,
        radius: p.dia / 2, depthLen: p.depth, kind: p.dia >= 35 ? 'cup' as const : 'anchor' as const,
      })))
    }
    return m
  }, [rp.hinge_instances, rp.face_zones])
  // World-fixed hinge markers: plate bores always; cup/anchor bores only for
  // non-animated (top/bottom) doors — left/right doors render theirs in DoorPanel.
  // Knock-in blocks behind the finger-pull rails, at the drilled holes (z_handles D20).
  const railBlocks = useMemo(() => railBlockEnds(rp.case_parts, rp.internal_parts), [rp])
  // Sliding bi-fold tracks (z_bifold_slide), cut to the inside width.
  const bifoldTrackList = useMemo(() => bifoldTracks(rp), [rp])
  // Bi-fold pair opening: span = both doors + the gap; folded as far as the two
  // door thicknesses side by side (+4) at the hinge gable allow.
  const bifoldOpen = useMemo(() => {
    const pair = rp.face_zones.filter(z => z.bifold_role)
    if (pair.length !== 2) return null
    const span = Math.max(...pair.map(z => z.X + z.DX)) - Math.min(...pair.map(z => z.X))
    return { span, maxAngle: bifoldFoldAngle(span, Math.max(...pair.map(z => z.DZ))) }
  }, [rp])
  // Joint fittings (z_joints C4, e.g. Lamello Cabineo): one per set, at the
  // set's middle hole — drawn whether or not drilling is shown.
  const jointFittings = useMemo(() => {
    const out: DrillOpPos[] = []
    for (const sj of rp.seam_joints) {
      if (!sj.ops.some(o => o.fitting)) continue
      const bA = boxByKey[sj.part_a_key], bB = boxByKey[sj.part_b_key]
      if (bA && bB) out.push(...seamDrillsFor(sj, rp, bA, bB).filter(d => d.fitting))
    }
    return out
  }, [rp, boxByKey])
  const hingeDrills = useMemo(() => {
    if (!showDrilling) return []
    const out: ResolvedHingeDrill[] = []
    for (const h of rp.hinge_instances ?? []) {
      // World-fixed: a turned facet door's zone-frame drills → cabinet coords.
      const edge = zoneEdge.get(zoneKey(h))
      if (edge !== 'left' && edge !== 'right') out.push(...h.cup_drills.map(d => turnDrill(h.turn, d)))
      if (h.pie !== 'bifold') out.push(...h.plate_drills.map(d => turnDrill(h.turn, d)))
    }
    return out
  }, [rp.hinge_instances, zoneEdge, showDrilling])
  // Hinges grouped by door zone, keyed `${row}_${col}` — only those with a 3D
  // model (hinge model and/or a separate plate model).
  const hingesByZone = useMemo(() => {
    const m = new Map<string, ResolvedHingeInstance[]>()
    for (const h of rp.hinge_instances ?? []) {
      if (!h.model_url && !h.plate_model_url) continue
      // Models are placed on the door's hinge side — not on a bi-fold's pie edge.
      if (h.pie === 'bifold') continue
      const k = zoneKey(h)
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
    // Tape with no colour on record reads as the part's material face colour —
    // one colour for every strip, matched to the face.
    return { thick: spec.thickness, color: spec.color ?? unpackMatCol(materialColours?.[matId], '#c8b89a').face }
  }

  // Pocket/route (area) ops → real CSG recesses per part (keyed by source_part_key).
  // Drills/grooves stay as HandOpMarkers3D overlays.
  const pocketsByPart = useMemo(() => {
    const m = new Map<string, { center: [number, number, number]; size: [number, number, number] }[]>()
    for (const mk of handMarkers) {
      if (mk.kind !== 'area') continue
      const arr = m.get(mk.partKey) ?? []
      arr.push(areaSubtraction(mk))
      m.set(mk.partKey, arr)
    }
    return m
  }, [handMarkers])

  // Grained colours render the generic wood grain (z_material_colours MC9).
  const grainIds = layers && !layers.show('grain') ? new Set<string>() : new Set(Object.entries(materialColours ?? {})
    .filter(([, v]) => typeof v === 'object' && v.grain).map(([k]) => k))
  return (
    <GrainContext.Provider value={grainIds}>
    <FrontGrainAcrossContext.Provider value={frontsAcross}>
    <ExplodeGroup amount={explode} centre={[dx / 2, dy / 2, dz / 2]} version={rp} position={[-dx / 2, -dy / 2, -dz / 2]}>
      {showDrilling && handMarkers.length > 0 && (
        <HandOpMarkers3D markers={handMarkers} csgPartKeys={new Set([...pocketsByPart.keys()].filter(k => k.startsWith('case_')))} />
      )}
      {/* Height split (z_cabinet_split): cut sides / back draw as their pieces. Each piece is the
          part it came from for geometry, colours, selection and holes (its own height's only). */}
      {casePieces.filter(q => show(casePartItem(splitBaseKey(q.part_key)))).map(piece => {
        const base  = splitBaseKey(piece.part_key) as typeof piece.part_key
        const cut   = cutBases.has(base)
        const p     = { ...piece, part_key: base }
        const id    = `case_${base}`
        const key   = `case_${piece.part_key}`
        const [y0, y1] = splitPieceRange(piece)
        const pp    = applyPosOv(p, id, partOverrides)
        const b     = cut ? caseBox(pp) : applySizeOv(caseBox(pp), id, partOverrides)
        const info  = applyEdge(buildCaseInfo(p, b))
        const s     = matSpec(p.material_id, '#ddd3bb')
        // Turned per-edge panels draw in their own frame (z_cabinet_shape L3).
        const holes = (holesByPartKey.get(p.part_key) ?? []).filter(d => !cut || (d.y >= y0 - 0.5 && d.y <= y1 + 0.5)).map(d => intoPartFrame(p, d))
        const pockets = pocketsByPart.get(id)

        if (holes.length > 0) {
          return (
            <PartAlpha key={key} a={alpha(casePartItem(p.part_key))}><PartWithHoles
              b={b}
              drills={holes}
              faceColors={panelFaceColors(info.panelKind, p.part_key, s.face, s.back, s.edge)}
              edgeLineColor={outline('carcase', casePartItem(p.part_key))}
              meta={info}
              selected={selected?.id === info.id}
              highlighted={hlSet?.has(p.part_key) ?? false}
              onSelect={onSelect}
              dragRef={dragRef}
              wire={wire}
              contextMenuSelect
              ebSpec={ebFor(p.material_id)}
              rotation={caseRot(p, id, partOverrides)}
              subtractions={pockets}
              shape={cut ? undefined : shapes3D.get(id)}
            /></PartAlpha>
          )
        }

        return (
          <PartAlpha key={key} a={alpha(casePartItem(p.part_key))}><Part
            b={b}
            faceColors={panelFaceColors(info.panelKind, p.part_key, s.face, s.back, s.edge)}
            edgeLineColor={outline('carcase', casePartItem(p.part_key))}
            meta={info}
            selected={selected?.id === info.id}
            highlighted={hlSet?.has(p.part_key) ?? false}
            onSelect={onSelect}
            contextMenuSelect
            dragRef={dragRef}
            ebSpec={ebFor(p.material_id)}
            wire={wire}
            rotation={caseRot(p, id, partOverrides)}
            subtractions={pockets}
            shape={cut ? undefined : shapes3D.get(id)}
          /></PartAlpha>
        )
      })}
      {rp.toekick_parts.filter(p => show(kickPartItem(p.part_key))).map((p, i) => {
        const id   = `tk_${p.part_key}_${p.sort_order}`
        const pp   = applyPosOv(p, id, partOverrides)
        const b    = applySizeOv(tkBox(pp), id, partOverrides)
        const info = applyEdge(buildTkInfo(p, b))
        const s    = matSpec(p.material_id, '#78716c')
        return (
          <PartAlpha key={`t${i}`} a={alpha(kickPartItem(p.part_key))}><Part
            b={b}
            faceColors={panelFaceColors(info.panelKind, p.part_key, s.face, s.back, s.edge)}
            edgeLineColor={outline('toekick', kickPartItem(p.part_key))}
            meta={info}
            selected={selected?.id === info.id}
            highlighted={hlSet?.has(p.part_key) ?? false}
            onSelect={onSelect}
            contextMenuSelect
            dragRef={dragRef}
            ebSpec={ebFor(p.material_id)}
            wire={wire}
            rotation={tkRot(p, id, partOverrides)}
            shape={shapes3D.get(id)}
          /></PartAlpha>
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
          // A hanging rail draws in its product's colour (z_accessories A5).
          const ac   = p.accessory?.colour
          const s    = ac ? { face: ac, back: ac, edge: ac } : matSpec(p.material_id, '#e8dece')
          const holes = holesByPartKey.get(id) ?? []
          // Rail / rail supports with a library model draw the model (z_accessories S1).
          if (hasAccessoryModel(pp)) {
            const box = (
              <mesh position={[b.x + b.w / 2, b.y + b.h / 2, b.z + b.d / 2]}>
                <boxGeometry args={[b.w, b.h, b.d]} />
                <meshStandardMaterial color={s.face} />
              </mesh>
            )
            return (
              <PartAlpha key={key} a={alpha(internalPartItem(p.part_type))}><PickableHardware meta={info} selected={selected?.id === info.id} onSelect={onSelect} dragRef={dragRef}>
                <AccessoryModel part={pp} color={s.face} fallback={box} />
              </PickableHardware></PartAlpha>
            )
          }
          if (holes.length > 0) {
            return (
              <PartAlpha key={key} a={alpha(internalPartItem(p.part_type))}><PartWithHoles
                b={b}
                drills={holes}
                faceColors={panelFaceColors(info.panelKind, p.part_type, s.face, s.back, s.edge)}
                edgeLineColor={outline('internal', internalPartItem(p.part_type))}
                meta={info}
                selected={selected?.id === info.id}
                highlighted={hlSet?.has(p.part_type) ?? false}
                onSelect={onSelect}
                dragRef={dragRef}
                wire={wire}
                contextMenuSelect
                ebSpec={ebFor(p.material_id)}
                rotation={getRotOv(id, partOverrides)}
                shape={shapes3D.get(id)}
              /></PartAlpha>
            )
          }
          return (
            <PartAlpha key={key} a={alpha(internalPartItem(p.part_type))}><Part
              b={b}
              faceColors={panelFaceColors(info.panelKind, p.part_type, s.face, s.back, s.edge)}
              edgeLineColor={outline('internal', internalPartItem(p.part_type))}
              meta={info}
              selected={selected?.id === info.id}
              highlighted={hlSet?.has(p.part_type) ?? false}
              onSelect={onSelect}
              contextMenuSelect
              dragRef={dragRef}
              ebSpec={ebFor(p.material_id)}
              wire={wire}
              rotation={getRotOv(id, partOverrides)}
              shape={shapes3D.get(id)}
            /></PartAlpha>
          )
        }
        const renderIntSlide = (sl: ResolvedDrawerSlide, li: number, key: string) => {
          const info0 = buildInternalSlideInfo(sl, slideBox(sl), li)
          const ps    = applyPosOv(sl, info0.id, partOverrides)
          const b     = slideBox(ps)
          const sc    = sl.colour ?? '#6b7280'
          const info  = buildInternalSlideInfo(sl, b, li)
          if (ps.model_url && ps.model_format) {
            const originX = ps.side === 'left' ? ps.X : ps.X + ps.DZ
            const originY = ps.Y + ps.DY
            const originZ = ps.Z + ps.DX
            return (
              <PartAlpha key={key} a={alpha('inner_drawer_runners')}><PickableHardware meta={info} selected={selected?.id === info.id} onSelect={onSelect} dragRef={dragRef}><SlideModel
                url={ps.model_url}
                format={ps.model_format}
                scale={ps.model_scale}
                anchor={{ x: ps.model_anchor_x, y: ps.model_anchor_y, z: ps.model_anchor_z }}
                position={[originX, originY, originZ]}
                sideOrientation={ps.side}
                color={sc}
                fallbackBox={{ w: ps.DZ, h: ps.DY, d: ps.DX }}
              /></PickableHardware></PartAlpha>
            )
          }
          if (ps.drawn_as) return <PartAlpha key={key} a={alpha('inner_drawer_runners')}><PickableHardware meta={info} selected={selected?.id === info.id} onSelect={onSelect} dragRef={dragRef}><Runner3D rail={ps} opacity={alpha('inner_drawer_runners')} /></PickableHardware></PartAlpha>
          const fc   = panelFaceColors('side', `slide_${sl.side}`, sc, sc, sc)
          return (
            <PartAlpha key={key} a={alpha('inner_drawer_runners')}><Part
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
            /></PartAlpha>
          )
        }

        // Group inner-drawer / pull-out parts + slides by inner_drawer_index so
        // they animate together when the user opens a drawer in 3D.
        const grouped = new Map<number, { parts: ResolvedInternalPart[]; slides: { sl: ResolvedDrawerSlide; li: number }[] }>()
        const ungroupedParts: ResolvedInternalPart[] = []
        for (const p of rp.internal_parts) {
          if (!show(internalPartItem(p.part_type))) continue
          if (p.inner_drawer_index != null) {
            const g = grouped.get(p.inner_drawer_index) ?? { parts: [], slides: [] }
            g.parts.push(p)
            grouped.set(p.inner_drawer_index, g)
          } else {
            ungroupedParts.push(p)
          }
        }
        const ungroupedSlides: { sl: ResolvedDrawerSlide; li: number }[] = [];
        ;(show('inner_drawer_runners') ? rp.internal_slides ?? [] : []).forEach((sl, li) => {
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
      {rp.face_zones.filter(z => z.face_type !== 'open').map((z, i) => turnZone(z, i, (() => {
        const id = zonePartId(z)

        if (z.face_type === 'drawer_face') {
          const stack = drawerStackByKey.get(zoneKey(z))
          if (stack) {
            if (!show('drawer_fronts') && !show('drawer_boxes') && !show('drawer_box_backs') && !show('drawer_runners') && !show('bins')) return null
            return (
              <DrawerAssembly
                showFace={show('drawer_fronts')}
                showBox={show('drawer_boxes') || show('drawer_box_backs')}
                showSlides={show('drawer_runners')}
                handle={show('drawer_fronts') && (show('handles') || show('handle_holes')) ? handleShape(z) : null}
                roomOutlines={roomOutlines}
                layers={layers}
                key={`f${i}`}
                faceZone={z}
                stack={stack}
                targetTravel={openDrawers.get(zoneKey(z)) ?? 0}
                selected={selected}
                onSelect={onSelect}
                faceHighlighted={hlSet?.has(z.face_type) ?? false}
                materialColours={materialColours}
                ebByMatId={ebByMatId}
                edgeOverrides={edgeOverrides}
                wire={wire}
                partOverrides={partOverrides}
                dragRef={dragRef}
                shapes3D={shapes3D}
              />
            )
          }
        }

        const faceItem   = faceZoneItem(z.face_type)
        const showFaceZone = !faceItem || show(faceItem)
        const isHingedDoor = z.face_type === 'door' && (z.hinge_side === 'left' || z.hinge_side === 'right')
        if (!showFaceZone && !(isHingedDoor && show('hinges'))) return null
        const pz         = applyPosOv(z, id, partOverrides)
        const b          = applySizeOv(zoneBox(pz), id, partOverrides)
        const info       = applyEdge(buildZoneInfo(z, b))
        const s          = matSpec(z.material_id, '#f0ebe0')
        const faceColors = panelFaceColors(info.panelKind, z.face_type, s.face, s.back, s.edge)
        const partProps: PartProps = {
          faceColors,
          edgeLineColor:     outline(z.face_type === 'drawer_face' ? 'drawer_face' : 'door', faceItem),
          meta:              info,
          selected:          selected?.id === info.id,
          highlighted:       hlSet?.has(z.face_type) ?? false,
          onSelect,
          contextMenuSelect: true,
          dragRef,
          ebSpec:            ebFor(z.material_id),
          wire,
          shape:             shapes3D.get(id),
        }

        // Handle on a front that doesn't move (lift-up / fixed doors, false panels).
        const staticShape = showFaceZone && (show('handles') || show('handle_holes')) ? handleShape(z) : null
        const hMeta        = staticShape ? buildHandleInfo(staticShape, z) : undefined
        const staticHandle = staticShape && hMeta ? (
          <PickableHardware meta={hMeta} selected={selected?.id === hMeta.id} onSelect={onSelect} dragRef={dragRef}>
            <Handle3D s={staticShape} opacity={alpha('handles')} showBar={show('handles')} showHoles={show('handle_holes')} />
          </PickableHardware>
        ) : null

        if (z.face_type === 'door' && (z.hinge_side === 'left' || z.hinge_side === 'right')) {
          const zoneHinges = show('hinges') ? hingesByZone.get(zoneKey(z)) ?? [] : []
          const bifold: BifoldOpen | undefined = z.bifold_role && bifoldOpen ? { role: z.bifold_role, ...bifoldOpen } : undefined
          const hingeX = z.hinge_side === 'left' ? b.x : b.x + b.w
          const mirror = z.hinge_side === 'left'   // swapped to match DoorPanel
          return (
            <group key={`f${i}`}>
              <DoorPanel
                b={b}
                hingeSide={z.hinge_side}
                doorsOpen={doorsOpen}
                doorProfile={z.door_profile}
                showPanel={showFaceZone}
                panelAlpha={alpha(faceItem ?? 'doors')}
                hingeAlpha={alpha('hinges')}
                hinges={zoneHinges}
                cupDrills={cupDrillsByZone.get(zoneKey(z))}
                showDrilling={showDrilling}
                handle={showFaceZone && (show('handles') || show('handle_holes')) ? handleShape(z) : null}
                handleMeta={hMeta}
                selectedId={selected?.id ?? null}
                handleAlpha={alpha('handles')}
                handleParts={{ bar: show('handles'), holes: show('handle_holes') }}
                bifold={bifold}
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
                const hm = buildHingeInfo(h)
                return (
                <PartAlpha key={`plate${hi}`} a={alpha('hinges')}>
                <PickableHardware meta={hm} selected={selected?.id === hm.id} onSelect={onSelect} dragRef={dragRef}>
                <HingeMeshPlaced
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
                </PickableHardware>
                </PartAlpha>
                )})}
              {/* Gable-side back arm (HingeArm) of a SPLIT hinge body. Sits at the
                  model origin on the gable and folds about that plate-end pivot by
                  a fraction of the door angle, so the body articulates at the
                  knuckle. Renders nothing if the body GLB has no HingeArm mesh
                  (one-piece bodies just swing with the door inside DoorPanel). */}
              {zoneHinges.filter(h => h.model_url).map((h, hi) => { const hm = buildHingeInfo(h); return (
                <PartAlpha key={`arm${hi}`} a={alpha('hinges')}>
                <PickableHardware meta={hm} selected={selected?.id === hm.id} onSelect={onSelect} dragRef={dragRef}>
                <HingeArmFold
                  url={h.model_url!}
                  pivot={[
                    hingeX + cupAcrossOffset(h.cup_x_from_edge_mm, mirror, h.model_scale),
                    b.y + h.y_position_mm,
                    b.z - ((h.bore_to_door_mm ?? 0) * h.model_scale + seatNudge(b.d)),
                  ]}
                  openAngle={(z.hinge_side === 'left' ? -1 : 1) * (bifold ? bifold.maxAngle : Math.PI / 2)}
                  doorsOpen={doorsOpen}
                  mirror={mirror}
                  scale={h.model_scale}
                  color="#c0c6d0"
                  foldFraction={h.arm_fold_fraction}
                />
                </PickableHardware>
                </PartAlpha>
              )})}
            </group>
          )
        }

        if (z.face_type === 'door' && z.door_profile) {
          return (
            <group key={`f${i}`}>
              <PartAlpha a={alpha(faceItem ?? 'doors')}><Part b={b} rotation={getRotOv(id, partOverrides)} shape={shapes3D.get(id)} {...partProps} />
              <DoorProfile3D profile={z.door_profile} b={b} /></PartAlpha>
              {staticHandle}
            </group>
          )
        }

        return <group key={`f${i}`}><PartAlpha a={alpha(faceItem ?? 'doors')}><Part b={b} rotation={getRotOv(id, partOverrides)} shape={shapes3D.get(id)} {...partProps} /></PartAlpha>{staticHandle}</group>
      })()))}
      {(customParts ?? []).filter(p => p.visible && Number(p.dz) > 0 && show(customPartItem(p))).map((p, i) => {
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
          dxIsWidth: orient === 'front' || undefined,
          materialId: p.material_id ?? undefined,
        }
        return (
          <PartAlpha key={`cust${i}`} a={alpha(customPartItem(p))}><Part
            b={b}
            faceColors={panelFaceColors(kind, 'custom', s.face, s.back, s.edge)}
            edgeLineColor={outline('carcase', customPartItem(p))}
            meta={info}
            selected={selected?.id === info.id}
            highlighted={false}
            onSelect={onSelect}
            contextMenuSelect
            dragRef={dragRef}
            ebSpec={ebFor(p.material_id ?? '')}
            wire={wire}
            shape={shapes3D.get(`custom_${p.id}`)}
          /></PartAlpha>
        )
      })}
      {showDrilling && rp.seam_joints.length > 0 && (
        <SeamJointOverlay seamJoints={rp.seam_joints} boxByKey={boxByKey} wire={wire} />
      )}
      {slideDrills.length > 0 && (
        <SlideDrillMarkers drills={slideDrills} wire={wire} />
      )}
      {show('hinges') && hingeDrills.length > 0 && (
        <SlideDrillMarkers drills={hingeDrills} wire={wire} color={palette.hinges} />
      )}
      {show('bifold') && bifoldTrackList.map(t => (
        <PartAlpha key={`bftrack_${t.which}`} a={alpha('bifold')}><BifoldTrackModel t={t} wire={wire} /></PartAlpha>
      ))}
      {show('rail_blocks') && railBlocks.map(e => (
        <PartAlpha key={`rblk_${e.railKey}_${e.panelKey}`} a={alpha('rail_blocks')}><RailBlockModel end={e} /></PartAlpha>
      ))}
      {show('joint_fittings') && jointFittings.map((d, i) => (
        <PartAlpha key={`jfit_${d.targetPartKey}_${i}`} a={alpha('joint_fittings')}><JointFittingModel drill={d} /></PartAlpha>
      ))}
    </ExplodeGroup>
    </FrontGrainAcrossContext.Provider>
    </GrainContext.Provider>
  )
}

// ── Public component ─────────────────────────────────────────────────────────

export default function Cabinet3DView({
  cab, rp, highlightPartKeys, materialColours, ebByMatId, wire = false, customParts, partOverrides, shapeOverrides, onPartSelect, showDrilling = true, onUpdate, onDeletePart,
  setCustomParts, onOverridesChange, onEditPart, panelHost, onPanelVisibleChange, compactInfo = false,
  fixtures, selectedFixtureId, onFixtureSelect, onEdgeSaved,
}: {
  cab:               CabinetInstance
  rp?:               ResolvedCabinet
  highlightPartKeys?: string[] | null
  materialColours?:  MatColMap
  ebByMatId?:        Record<string, { thickness: number; color: string | null }>
  wire?:             boolean
  customParts?:      CabinetCustomPart[]
  partOverrides?:    PartPosOverrides
  // Shape Editor overrides (latest revision per part) — shaped parts render as
  // extruded silhouettes instead of boxes.
  shapeOverrides?:   ShapeOverrides
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
  // openShape=true ("⬠ Edit Shape") asks the host to open it with the shape
  // overlay already on top.
  onEditPart?:       (part: PartMeta, openShape?: boolean) => void
  // When set, the part panel portals into this element (the edit modal's sidebar)
  // instead of floating over the 3D canvas.
  panelHost?:        HTMLElement | null
  // Fires when the part panel shows/hides so the host can swap the cabinet info
  // out while it's docked. Pass a stable function (e.g. a setState).
  onPanelVisibleChange?: (visible: boolean) => void
  // Phones (z_mobile): a tap shows the small read-only PartInfoCard over the model;
  // its "Details" opens the full panel (docked via panelHost as usual).
  compactInfo?:      boolean
  // Linked fixtures drawn inside the cabinet (z_ubo U5) — e.g. a UBO's oven —
  // and their selection. Edit modal only; the room 3D draws fixtures itself.
  fixtures?:          LocalFixtureBox[]
  selectedFixtureId?: string | null
  onFixtureSelect?:   (id: string) => void
  // Fires after an edge-band click is saved, so the host can patch its copy of
  // the resolved cabinet (otherwise reopening shows the old edges).
  onEdgeSaved?:       (partId: string, edge: PartEdge) => void
}) {
  const [selectedPart, setSelectedPart]       = useState<PartMeta | null>(null)
  const [fullFor, setFullFor]                 = useState<string | null>(null)   // compactInfo: part showing the full panel
  const showFullPanel = !!selectedPart && (!compactInfo || fullFor === selectedPart.id)
  const [editMenu, setEditMenu]               = useState<{ cx: number; cy: number } | null>(null)
  const [doorsOpen, setDoorsOpen]             = useState(false)
  const [explode, setExplode]                 = useState(0)   // exploded view, 0–100 %
  const [openDrawers, setOpenDrawers]         = useState<Map<string, number>>(new Map())
  const [openInnerDrawers, setOpenInnerDrawers] = useState<Map<number, number>>(new Map())
  const [edgeOverrides, setEdgeOverrides]     = useState<Map<string, PartEdge>>(new Map())
  const { dx, dy, dz } = cab
  // Hand-added part_operations, projected to cabinet space (generated rows excluded
  // — the resolver already draws those). Shown with the carcase-drilling toggle.
  const handMarkers = useHandOpMarkers(cab.id, rp)

  const didHitPartRef   = useRef(false)
  const hitHardwareRef  = useRef(false)   // last pick was a hinge / handle / bin (no edit menu)

  // Report panel visibility to the host (edit modal) so it can swap the cabinet
  // info out while the docked part panel is showing.
  useEffect(() => {
    onPanelVisibleChange?.(showFullPanel)
    return () => onPanelVisibleChange?.(false)
  }, [showFullPanel, onPanelVisibleChange])

  // Delete/Backspace removes the selected part (custom → deleted, resolved →
  // hidden). Capture phase + stopImmediatePropagation so the canvas behind the
  // modal never sees it (it would delete the whole cabinet). A ref keeps the
  // listener bound once while always seeing the current selection.
  const deleteSelRef = useRef<() => void>(() => {})
  useEffect(() => {
    deleteSelRef.current = () => {
      if (!selectedPart || !onDeletePart || isHardwarePartId(selectedPart.id)) return
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
    if (info !== null) { didHitPartRef.current = true; hitHardwareRef.current = isHardwarePartId(info.id) && !info.id.includes('slide_') }
    setSelectedPart(info)
    if (onPartSelect && info) {
      // Case parts report their part_key; internal seam parts report their
      // family (adj_shelf / fixed_shelf / divider) — the CM builder's joint
      // group keys. Everything else reports null.
      const intFamily = info.id.startsWith('int_')
        ? ['adj_shelf', 'fixed_shelf', 'divider'].find(f => info.id.startsWith(`int_${f}_`)) ?? null
        : null
      onPartSelect(info.id.startsWith('case_') ? info.id.slice(5) : intFamily)
    }
  }

  // Saved on every click — waiting for the selection to move lost the edit when
  // the modal was closed with the part still selected.
  function handleEdgeChange(edge: PartEdge) {
    if (selectedPart) saveEdge(selectedPart, edge)
  }
  function saveEdge(part: PartMeta, edge: PartEdge) {
    setEdgeOverrides(m => new Map(m).set(part.id, edge))
    setSelectedPart(s => (s && s.id === part.id ? { ...s, edge } : s))
    if (part.id.startsWith('custom_')) {
      const cid = part.id.slice(7)
      setCustomParts?.(prev => prev.map(p => p.id === cid
        ? { ...p, edge_top: edge.top, edge_bottom: edge.bottom, edge_left: edge.left, edge_right: edge.right } : p))
      saveSVGEdge(cab.id, { ...part, edge })
      return
    }
    saveSVGEdge(cab.id, { ...part, edge }).then(() => onEdgeSaved?.(part.id, edge))
  }

  // Edge banding straight on the selected part (z_edgeband_edit): its four edges
  // show on the 3D part — taped cyan, bare rose — and a click toggles one. Board
  // parts only (case, kick, internal, fronts, added parts), the same set the
  // properties panel's edge ticks save.
  // Paint mode (EB2): every board part shows its edges at once and a click applies
  // the brush — toggle, tape or bare; Shift+click does all four edges of the part.
  const [ebPaint, setEbPaint] = useState<null | 'toggle' | 'tape' | 'bare'>(null)
  const edgeEdit = useMemo(() => {
    const bandable = (p: PartMeta) => !p.hardware && /^(case_|tk_|int_|zone_|custom_)/.test(p.id)
    const onToggle = (p: PartMeta, side: keyof PartEdge, whole: boolean) => {
      const v = ebPaint === 'tape' ? true : ebPaint === 'bare' ? false : !p.edge[side]
      const edge = whole ? { top: v, bottom: v, left: v, right: v } : { ...p.edge, [side]: v }
      if ((['top', 'bottom', 'left', 'right'] as const).some(k => edge[k] !== p.edge[k])) saveEdge(p, edge)
      useTutorial.getState().emit(ebPaint ? 'edgeband_paint_edge' : 'edgeband_part_edge')
    }
    if (ebPaint) return { partId: null, all: bandable, onToggle }
    return selectedPart && bandable(selectedPart) ? { partId: selectedPart.id, onToggle } : null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPart, ebPaint])
  // Escape leaves the paint mode before it closes the modal.
  useEffect(() => {
    if (!ebPaint) return
    useTutorial.getState().emit('edgeband_paint')
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.preventDefault(); e.stopImmediatePropagation(); setEbPaint(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [ebPaint])

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

  // Right-click option: bevel a shaped cabinet's side panel flush with the
  // angled front it meets, or back to square (footprint.joins, z_cabinet_shape_edit E2).
  const frontEnd = onUpdate && selectedPart?.id.startsWith('case_')
    ? panelFrontEnd(cab.footprint, cab.dx, cab.dz, selectedPart.id.slice(5)) : null
  function toggleFlushEnd(edgeId: string) {
    const fp = cab.footprint
    if (!fp || !onUpdate) return
    void onUpdate(cab.id, { footprint: toggleFlushEnds(fp, cab.dx, cab.dz, edgeId) })
  }

  function handleCanvasContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    if (didHitPartRef.current) {
      // A part was right-clicked (and just selected via contextMenuSelect). Offer
      // the Part Editor at the cursor when the host supports it.
      if ((onEditPart || onUpdate) && !hitHardwareRef.current) setEditMenu({ cx: e.clientX, cy: e.clientY })
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
      n.set(stackKey(s), travel)
    })
    setOpenDrawers(n)
  }

  const hasDoors      = rp?.face_zones.some(z => z.face_type === 'door' && z.hinge_side) ?? false
  const hasDrawers    = (rp?.drawer_stacks?.length ?? 0) > 0
  const hasInnerDrawers = (rp?.internal_slides ?? []).some(s => s.inner_drawer_index != null)
  const anyDrawerOpen = [...openDrawers.values(), ...openInnerDrawers.values()].some(t => t > 0)

  // Toolbar "Open drawers": every inner drawer out to its slide length.
  function openAllInner() {
    const n = new Map<number, number>()
    for (const s of rp?.internal_slides ?? []) {
      if (s.inner_drawer_index != null && !n.has(s.inner_drawer_index)) n.set(s.inner_drawer_index, s.nominal_length ?? 300)
    }
    setOpenInnerDrawers(n)
  }
  const drawerZoneIds = new Set((rp?.drawer_stacks ?? []).map(s => `zone_${stackKey(s)}`))

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
      hint={ebPaint ? 'Edge banding: click an edge to paint it (cyan = taped, rose = bare) · Shift+click = all four edges of that part · Esc or Done to finish · Left-drag rotate'
        : selectedPart && edgeEdit ? "Click the picked part's edges to tape (cyan) or untape (rose) · right-click another part to pick it · Left-drag rotate" : "Left-drag rotate · scroll zoom · Ctrl fast · Shift fine · right-click part to inspect"}
      overlay={
        <>
          {ebPaint && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-gray-900/90 border border-gray-700 rounded px-2 py-1 text-[11px] pointer-events-auto select-none"
              data-eb-paint>
              <span className="text-gray-400 mr-1">Edge banding</span>
              {([['toggle', 'Toggle'], ['tape', 'Edge'], ['bare', 'No edge']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setEbPaint(k)}
                  className={`px-2 py-0.5 rounded border transition-colors ${ebPaint === k
                    ? k === 'bare' ? 'bg-rose-600 border-rose-500 text-white' : k === 'tape' ? 'bg-cyan-600 border-cyan-500 text-white' : 'bg-gray-600 border-gray-500 text-white'
                    : 'border-gray-600 text-gray-300 hover:text-white hover:border-gray-400'}`}>
                  {l}
                </button>
              ))}
              <button onClick={() => setEbPaint(null)}
                className="ml-1 px-2 py-0.5 rounded border border-orange-500 text-orange-300 hover:bg-orange-600 hover:text-white">Done</button>
            </div>
          )}
          {selectedPart && !showFullPanel && (
            <PartInfoCard part={selectedPart}
              ebThickness={selectedPart.materialId ? ebByMatId?.[selectedPart.materialId]?.thickness : undefined}
              onClose={() => setSelectedPart(null)}
              onDetails={() => setFullFor(selectedPart.id)} />
          )}
          {selectedPart && showFullPanel && (() => {
            const panel = (
              <PartPropertiesPanel
                className={panelHost ? 'relative w-full' : undefined}
                part={selectedPart}
                onClose={() => setSelectedPart(null)}
                onEdgeChange={handleEdgeChange}
                ebThickness={selectedPart.materialId ? ebByMatId?.[selectedPart.materialId]?.thickness : undefined}
                onSizeChange={!selectedPart.hardware && /^(case_|tk_|int_|zone_|custom_)/.test(selectedPart.id) ? handleSizeChange : undefined}
                actions={drawerActions}
                jointControls={onUpdate && rp && /^(case_|int_(adj_shelf|fixed_shelf|divider)_)/.test(selectedPart.id)
                  ? <PartEdgeJoints cabinet={cab} rp={rp}
                      partKey={selectedPart.id.startsWith('case_') ? selectedPart.id.slice(5) : selectedPart.id}
                      onUpdate={onUpdate} />
                  : undefined}
              />
            )
            return panelHost ? createPortal(panel, panelHost) : panel
          })()}
          {editMenu && selectedPart && (onEditPart || frontEnd) && (
            <>
              <div className="fixed inset-0 z-[55]"
                onClick={() => setEditMenu(null)}
                onContextMenu={e => { e.preventDefault(); setEditMenu(null) }} />
              <div className="fixed z-[56] bg-gray-800 border border-gray-700 rounded shadow-xl py-1 text-[11px] pointer-events-auto"
                style={{ left: editMenu.cx, top: editMenu.cy }}
                onClick={e => e.stopPropagation()}>
                {onEditPart && (
                  <button
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-200 transition-colors whitespace-nowrap"
                    onClick={() => { onEditPart(selectedPart); setEditMenu(null) }}>
                    ✎ Edit Part
                  </button>
                )}
                {/* Slides are hardware — every panel part is shapeable (scope
                    amendment 2026-07-30). */}
                {onEditPart && !isHardwarePartId(selectedPart.id) && (
                  <button
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-200 transition-colors whitespace-nowrap"
                    onClick={() => { onEditPart(selectedPart, true); setEditMenu(null) }}>
                    ⬠ Edit Shape
                  </button>
                )}
                {/* Shaped cabinets (z_cabinet_shape 4a): a side panel's end at an
                    angled front is square unless bevelled flush here. */}
                {frontEnd && (
                  <button
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-200 transition-colors whitespace-nowrap"
                    onClick={() => { toggleFlushEnd(frontEnd.edgeId); setEditMenu(null) }}>
                    {frontEnd.flush ? '▭ Square front edge' : '◢ Bevel front edge to facet'}
                  </button>
                )}
                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-200 transition-colors whitespace-nowrap"
                  onClick={() => { setEbPaint('toggle'); setEditMenu(null) }}>
                  ▤ Edit edge banding (all parts)
                </button>
                <PartHideTicks partId={selectedPart.id} className="px-3 pt-1.5 pb-1 mt-1 border-t border-gray-700" />
              </div>
            </>
          )}
          <div className="absolute bottom-8 right-3 flex flex-col gap-1 items-end pointer-events-none">
            <label className="flex items-center gap-1.5 text-[11px] font-mono text-gray-700 bg-white/70 border border-gray-300 rounded px-2 py-1 pointer-events-auto select-none"
              title="Pull the parts apart from the cabinet centre. Double-click to put it back together.">
              Explode
              <input type="range" min={0} max={100} step={1} value={explode}
                onChange={e => setExplode(Number(e.target.value))}
                onDoubleClick={() => setExplode(0)}
                onPointerDown={e => e.stopPropagation()}
                className="w-24 accent-orange-600 cursor-pointer" />
            </label>
            <button
              onClick={() => setEbPaint(m => (m ? null : 'toggle'))}
              className={`text-[11px] font-mono rounded px-2 py-1 transition-colors pointer-events-auto select-none border ${ebPaint
                ? 'text-white bg-cyan-600 border-cyan-500 hover:bg-cyan-500'
                : 'text-cyan-800 hover:text-cyan-700 bg-white/70 hover:bg-white/90 border-cyan-400 hover:border-cyan-500'}`}
            >
              {ebPaint ? 'Done edge banding' : 'Edge banding'}
            </button>
            {hasDoors && (
              <button
                onClick={() => setDoorsOpen(o => !o)}
                className="text-[11px] font-mono text-orange-700 hover:text-orange-600 bg-white/70 hover:bg-white/90 border border-orange-300 hover:border-orange-400 rounded px-2 py-1 transition-colors pointer-events-auto select-none"
              >
                {doorsOpen ? 'Close doors' : 'Open doors'}
              </button>
            )}
            {(hasDrawers || hasInnerDrawers) && (
              <button
                onClick={() => {
                  if (anyDrawerOpen) { setOpenDrawers(new Map()); setOpenInnerDrawers(new Map()) }
                  else { openAllCascade(); openAllInner() }
                }}
                className="text-[11px] font-mono text-orange-700 hover:text-orange-600 bg-white/70 hover:bg-white/90 border border-orange-300 hover:border-orange-400 rounded px-2 py-1 transition-colors pointer-events-auto select-none"
              >
                {anyDrawerOpen ? 'Close drawers' : 'Open drawers'}
              </button>
            )}
          </div>
        </>
      }
    >
      {rp ? (
        <EdgeEditContext.Provider value={edgeEdit}>
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
          shapeOverrides={shapeOverrides}
          showDrilling={showDrilling}
          handMarkers={handMarkers}
          explode={explode / 100}
        />
        </EdgeEditContext.Provider>
      ) : (
        <mesh>
          <boxGeometry args={[dx, dy, dz]} />
          <meshStandardMaterial color="#ddd3bb" roughness={0.7} />
        </mesh>
      )}
      {/* Linked fixtures (z_ubo U5), in cabinet space like CabinetScene's root group. */}
      {!!fixtures?.length && (
        <group position={[-dx / 2, -dy / 2, -dz / 2]}>
          {fixtures.map(b => (
            <group key={b.f.id} position={[b.x0 + b.w / 2, b.y0, b.z0 + b.d / 2]} rotation={[0, -b.yaw * Math.PI / 180, 0]}
              onClick={onFixtureSelect ? e => { e.stopPropagation(); onFixtureSelect(b.f.id) } : undefined}>
              <group position={[-b.f.width / 2, 0, -b.f.depth / 2]}>
                <FixtureModel f={b.f} />
                {selectedFixtureId === b.f.id && <FixtureOutline w={b.f.width} h={b.f.height} d={b.f.depth} color="#facc15" />}
              </group>
            </group>
          ))}
        </group>
      )}
    </PreviewCanvas>
  )
}
