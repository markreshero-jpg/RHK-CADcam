'use client'

import { Suspense, useMemo, useEffect, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Edges, Text } from '@react-three/drei'
import { Shape, ExtrudeGeometry, Vector3, DoubleSide } from 'three'
import type { Wall, CabinetInstance, Room } from '@/src/lib/types'
import type {
  ResolvedCabinet, ResolvedToekickPart,
  ResolvedInternalPart, ResolvedFaceZone,
} from '@/src/lib/resolver/types'
import {
  wallDir, wallInwardNormal, centroid, wallEnd, lineIntersect, dist,
} from '@/src/lib/geometry'
import type { Pt } from '@/src/lib/geometry'
import { getUserPrefs } from '@/src/lib/userPrefs'
import { getPalette } from '@/src/lib/partPalette'
import { caseBox, isSide } from '@/src/lib/jointDrilling'
import { customExtents, customPanelKind } from '@/src/lib/customPartBox'
import {
  panelFaceColors, edgeCoreBox, edgeStrips, unpackMatCol,
  type PanelKind, type PartEdge, type EbSpec,
} from '@/src/components/three/PartViewer'
import type { EbByMatId } from './useMaterialColours'

const TO_RAD = Math.PI / 180
const FOV    = 40

// ── Helpers ───────────────────────────────────────────────────────────────────

function cabFloorY(cab: CabinetInstance, room: Room): number {
  if (cab.assembly_class === 'wall' || cab.assembly_class === 'wall_corner')
    return (room.wall_cabinet_top ?? 2100) - cab.dy
  // Floor units sit at pos_z (0 unless raised — a kick-detached member is lifted by
  // the kick height so its carcase stays put while the kick assembly fills below).
  return cab.pos_z ?? 0
}

// Same logic as wallMitrePolygon; returns [startInside, endInside, endOutside, startOutside]
function mitreCorners(w: Wall, walls: Wall[], cx: number, cy: number): [Pt, Pt, Pt, Pt] {
  const d    = wallDir(w)
  const in_  = wallInwardNormal(w, cx, cy)
  const s    = { x: w.pos_x, y: w.pos_y }
  const e    = wallEnd(w)
  const ox   = -in_.x * w.thickness, oy = -in_.y * w.thickness
  let pSO    = { x: s.x + ox, y: s.y + oy }
  let pEO    = { x: e.x + ox, y: e.y + oy }
  const SNAP = 5
  for (const o of walls) {
    if (o.id === w.id || o.wall_type === 'island') continue
    const od  = wallDir(o)
    const oIn = wallInwardNormal(o, cx, cy)
    const oS  = { x: o.pos_x, y: o.pos_y }
    const oE  = wallEnd(o)
    const oox = -oIn.x * o.thickness, ooy = -oIn.y * o.thickness
    if (dist(s, oS) < SNAP) pSO = lineIntersect(pSO, d, { x: oS.x + oox, y: oS.y + ooy }, od) ?? pSO
    if (dist(s, oE) < SNAP) pSO = lineIntersect(pSO, d, { x: oE.x + oox, y: oE.y + ooy }, od) ?? pSO
    if (dist(e, oS) < SNAP) pEO = lineIntersect(pEO, d, { x: oS.x + oox, y: oS.y + ooy }, od) ?? pEO
    if (dist(e, oE) < SNAP) pEO = lineIntersect(pEO, d, { x: oE.x + oox, y: oE.y + ooy }, od) ?? pEO
  }
  return [s, e, pEO, pSO]
}

// ── Cabinet part box helpers (mirrors Cabinet3DView exactly) ──────────────────

type Box = { x: number; y: number; z: number; w: number; h: number; d: number }

// Box helpers below MUST stay identical to Cabinet3DView so room view and the
// cabinet editor place every part the same way. caseBox is the shared canonical
// helper from jointDrilling (imported above).
function tkBox(p: ResolvedToekickPart): Box {
  return p.part_key === 'spreader_horizontal'
    ? { x: p.X, y: p.Y, z: p.Z, w: p.DX, h: p.DY, d: p.DZ }
    : { x: p.X, y: p.Y, z: p.Z, w: p.DY, h: p.DX, d: p.DZ }
}
function intBox(p: ResolvedInternalPart): Box {
  // Inner-drawer / pull-out parts carry the drawer-box dimension convention
  // (per-part DX/DY/DZ semantics + Z = front face); shelves/dividers differ.
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
  return { x: z.X, y: z.Y, z: z.Z, w: z.DX, h: z.DY, d: z.DZ }   // face: DX=width, DY=height
}

// Panel-kind dispatch for ResolvedInternalPart — drives panelFaceColors + edgeStrips
// orientation. Mirrors INT_PANEL_KIND in Cabinet3DView. Anything not listed → horizontal.
const INT_PANEL_KIND: Record<string, PanelKind> = {
  divider:            'side',
  inner_drawer_side:  'side',
  pull_out_side:      'side',
  inner_drawer_front: 'face',
  inner_drawer_back:  'face',
  pull_out_back:      'face',
}

// Single part mesh (no pointer events — click captured by whole-cabinet overlay).
// Renders per-face colours (interior / exposed / raw edge) and overlays edge-tape
// strips on the banded edges, so raw (unedged) edges stay the bare substrate colour
// while edged ones show the tape colour — matching Cabinet3DView exactly.
function Part({ b, faceColors, edgeColor, edge, panelKind, ebSpec }: {
  b:          Box
  faceColors: [string, string, string, string, string, string]
  edgeColor:  string
  edge:       PartEdge
  panelKind:  PanelKind
  ebSpec?:    EbSpec
}) {
  const tapeT = ebSpec ? Math.max(0, ebSpec.thick) : 0
  const strips = ebSpec ? edgeStrips(b, edge, panelKind, tapeT) : []
  const core = ebSpec ? edgeCoreBox(b, edge, panelKind, tapeT) : b
  return (
    <>
      <mesh position={[core.x + core.w / 2, core.y + core.h / 2, core.z + core.d / 2]}>
        <boxGeometry args={[core.w, core.h, core.d]} />
        {faceColors.map((c, i) => (
          <meshStandardMaterial key={i} attach={`material-${i}`} color={c} roughness={0.7} metalness={0.05} />
        ))}
        <Edges threshold={10} color={edgeColor} />
      </mesh>
      {strips.map((s, i) => (
        <mesh key={i} position={s.pos}>
          <boxGeometry args={s.args} />
          <meshStandardMaterial
            color={ebSpec!.color}
            roughness={0.35}
            metalness={0}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      ))}
    </>
  )
}

// ── Wall mesh with mitre ──────────────────────────────────────────────────────
// ExtrudeGeometry approach:
//   • Shape is in Three.js XY plane using (planX, −planY) as coords.
//   • Extruded along +Z then rotateX(−π/2) maps: X→worldX, Z(height)→worldY, −Y→worldZ.
//   • So (planX,−planY) → (worldX, 0, planY) at floor — exactly right.

function WallMesh({ wall, walls, room, cx, cy }: {
  wall: Wall; walls: Wall[]; room: Room; cx: number; cy: number
}) {
  const height   = wall.height ?? room.room_dy ?? 2400
  const angleRad = wall.angle * TO_RAD

  const corners = useMemo(
    () => wall.wall_type === 'island' ? null : mitreCorners(wall, walls, cx, cy),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wall.id, walls.map(w => w.id).join(), cx, cy],
  )

  const geometry = useMemo(() => {
    if (!corners) return null
    const [s, e, pEO, pSO] = corners
    const shape = new Shape()
    shape.moveTo(s.x,   -s.y)
    shape.lineTo(e.x,   -e.y)
    shape.lineTo(pEO.x, -pEO.y)
    shape.lineTo(pSO.x, -pSO.y)
    shape.closePath()
    const geo = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
    geo.rotateX(-Math.PI / 2)
    geo.computeVertexNormals()
    return geo
  }, [corners, height])

  useEffect(() => () => { geometry?.dispose() }, [geometry])

  // Islands are invisible — they exist only as placement targets in plan view
  if (wall.wall_type === 'island') return null

  if (!geometry) return null

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#cbd5e1" roughness={0.85} metalness={0} />
      <Edges threshold={25} color="#94a3b8" />
    </mesh>
  )
}

// ── Wall label (flat text on wall top edge) ───────────────────────────────────

function WallLabel({ wall, room, cx, cy }: { wall: Wall; room: Room; cx: number; cy: number }) {
  if (wall.wall_type === 'island') return null
  const height = (wall.height ?? room.room_dy ?? 2400) + 10
  const e = wallEnd(wall)
  // Start from the midpoint of the inner face, then shift outward by half the wall thickness
  // so the label sits over the wall centre rather than just the inner edge.
  const inward = wallInwardNormal(wall, cx, cy)
  const midX = (wall.pos_x + e.x) / 2 - inward.x * wall.thickness / 2
  const midZ = (wall.pos_y + e.y) / 2 - inward.y * wall.thickness / 2
  const angleRad = wall.angle * TO_RAD

  return (
    <Text
      position={[midX, height, midZ]}
      rotation={[-Math.PI / 2, 0, -angleRad]}
      fontSize={75}
      color="#1e293b"
      anchorX="center"
      anchorY="middle"
      outlineWidth={5}
      outlineColor="#f1f5f9"
    >
      {wall.name}
    </Text>
  )
}

// ── Cabinet mesh ──────────────────────────────────────────────────────────────
// The resolved cabinet's local space matches Cabinet3DView exactly:
//   +X = along wall (width), +Y = up (height), +Z = into room (depth).
// We place the group's origin at the cabinet's bottom-back-left world corner,
// then apply rotY = −angleRad so local +X aligns with the wall direction.
//
// The scaleZ term flips the depth axis when necessary:
//   isNaturalPerp = true  → rotY=−angle makes +Z point toward wall inward ✓
//   isNaturalPerp = false → +Z points outward → need scaleZ = −1
//   isFlipped (island)    → cabinet faces opposite side → flip again
//   net: needFlip = (isNaturalPerp === isFlipped)

type MatColEntry = string | { face?: string; back?: string; edge?: string }

function CabinetMesh({ cab, wall, cx, cy, room, selected, onSelect, onContextMenu, rp, materialColours, ebByMatId }: {
  cab: CabinetInstance
  wall: Wall
  cx: number; cy: number
  room: Room
  selected: boolean
  onSelect: () => void
  onContextMenu: (x: number, y: number) => void
  rp?: ResolvedCabinet
  materialColours?: Record<string, MatColEntry>
  ebByMatId?: EbByMatId
}) {
  const angleRad = wall.angle * TO_RAD
  const perp     = wallInwardNormal(wall, cx, cy)
  const wd       = wallDir(wall)

  const isFlipped = wall.wall_type === 'island' &&
    Math.abs(((cab.rotation - wall.angle) % 360 + 360) % 360 - 180) < 5

  // natural +Z after rotY=−angle = (−sin θ, cos θ) in plan space
  const isNaturalPerp = (perp.x * (-Math.sin(angleRad)) + perp.y * Math.cos(angleRad)) >= 0
  const scaleZ = (isNaturalPerp === isFlipped) ? -1 : 1

  const floorY = cabFloorY(cab, room)
  const rotY   = -angleRad

  const SEL  = '#d97706'
  const SELE = '#fbbf24'
  const SEL6: [string, string, string, string, string, string] = [SEL, SEL, SEL, SEL, SEL, SEL]
  const palette = useMemo(() => getPalette(), [])

  // Per-material face/back/edge colours and edge-tape spec. Mirrors Cabinet3DView so
  // the room view paints exposed/interior/raw surfaces and edge-banding identically.
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

  if (!rp) {
    // Fallback box when resolver data isn't loaded yet
    const actualPerp = isFlipped ? { x: -perp.x, y: -perp.y } : perp
    const cx3 = cab.pos_x + (cab.dx / 2) * wd.x + (cab.dz / 2) * actualPerp.x
    const cz3 = cab.pos_y + (cab.dx / 2) * wd.y + (cab.dz / 2) * actualPerp.y
    return (
      <mesh
        position={[cx3, floorY + cab.dy / 2, cz3]}
        rotation={[0, rotY, 0]}
        onClick={e => { e.stopPropagation(); onSelect() }}
        onContextMenu={e => { e.stopPropagation(); onContextMenu(e.nativeEvent.clientX, e.nativeEvent.clientY) }}
      >
        <boxGeometry args={[cab.dx, cab.dy, cab.dz]} />
        <meshStandardMaterial color={selected ? SEL : '#d4c5aa'} roughness={0.7} metalness={0.05} />
        <Edges threshold={10} color={selected ? SELE : '#a89880'} />
      </mesh>
    )
  }

  // Resolved parts: render each panel in cabinet-local coordinates.
  // Group origin = bottom-back-left corner of cabinet in world space.
  // Pointer handlers live on the outer group so a click on ANY descendant part
  // bubbles up and selects the cabinet — the transparent overlay alone is unreliable
  // (when scaleZ === -1 its front faces flip inward and the raycaster culls them).
  return (
    <group
      position={[cab.pos_x, floorY, cab.pos_y]}
      rotation={[0, rotY, 0]}
      onClick={e => { e.stopPropagation(); onSelect() }}
      onContextMenu={e => { e.stopPropagation(); onContextMenu(e.nativeEvent.clientX, e.nativeEvent.clientY) }}
    >
      <group scale={[1, 1, scaleZ]}>

        {/* ── Carcass ── */}
        {rp.case_parts.map((p, i) => {
          const kind: PanelKind = isSide(p.part_key) ? 'side' : p.part_key === 'back' ? 'face' : 'horizontal'
          const s = matSpec(p.material_id, '#ddd3bb')
          return (
            <Part key={`c${i}`}
              b={caseBox(p)}
              faceColors={selected ? SEL6 : panelFaceColors(kind, p.part_key, s.face, s.back, s.edge)}
              edgeColor={selected ? SELE : palette.carcase}
              edge={p.edge_band}
              panelKind={kind}
              ebSpec={selected ? undefined : ebFor(p.material_id)}
            />
          )
        })}

        {/* ── Toe kick ── */}
        {rp.toekick_parts.map((p, i) => {
          const kind: PanelKind = p.part_key === 'spreader_horizontal'
            ? 'horizontal'
            : p.part_key === 'spreader_vertical'
            ? 'side'
            : 'face'
          const s = matSpec(p.material_id, '#78716c')
          return (
            <Part key={`t${i}`}
              b={tkBox(p)}
              faceColors={selected ? SEL6 : panelFaceColors(kind, p.part_key, s.face, s.back, s.edge)}
              edgeColor={selected ? SELE : palette.toekick}
              edge={p.edge_band}
              panelKind={kind}
              ebSpec={selected ? undefined : ebFor(p.material_id)}
            />
          )
        })}

        {/* ── Shelves / internal (incl. inner-drawer / pull-out boxes) ── */}
        {rp.internal_parts.map((p, i) => {
          const kind: PanelKind = INT_PANEL_KIND[p.part_type] ?? 'horizontal'
          const s = matSpec(p.material_id, '#e8dece')
          return (
            <Part key={`s${i}`}
              b={intBox(p)}
              faceColors={selected ? SEL6 : panelFaceColors(kind, p.part_type, s.face, s.back, s.edge)}
              edgeColor={selected ? SELE : palette.internal}
              edge={p.edge_band}
              panelKind={kind}
              ebSpec={selected ? undefined : ebFor(p.material_id)}
            />
          )
        })}

        {/* ── Face zones ── */}
        {rp.face_zones.filter(z => z.face_type !== 'open').map((z, i) => {
          const s = matSpec(z.material_id, z.face_type === 'drawer_face' ? '#e2d9c8' : '#f0ebe0')
          return (
            <Part key={`f${i}`}
              b={zoneBox(z)}
              faceColors={selected ? SEL6 : panelFaceColors('face', z.face_type, s.face, s.back, s.edge)}
              edgeColor={selected ? SELE : (z.face_type === 'drawer_face' ? palette.drawer_face : palette.door)}
              edge={z.edge_band}
              panelKind="face"
              ebSpec={selected ? undefined : ebFor(z.material_id)}
            />
          )
        })}

        {/* ── Custom parts (panels / fillers / end panels) — room-visible only ── */}
        {(rp.custom_parts ?? []).filter(p => p.show_in_room && Number(p.dz) > 0).map((p, i) => {
          const s = matSpec(p.material_id ?? '', '#a78bfa')
          const { ex, ey, ez } = customExtents(p.orientation, Number(p.dx), Number(p.dy), Number(p.dz))
          const b: Box = { x: p.x, y: p.y, z: p.z, w: ex, h: ey, d: ez }
          const kind = customPanelKind(p.orientation)
          return (
            <Part key={`cust${i}`}
              b={b}
              faceColors={selected ? SEL6 : panelFaceColors(kind, 'custom', s.face, s.back, s.edge)}
              edgeColor={selected ? SELE : palette.carcase}
              edge={{ top: p.edge_top, bottom: p.edge_bottom, left: p.edge_left, right: p.edge_right }}
              panelKind={kind}
              ebSpec={selected ? undefined : ebFor(p.material_id ?? '')}
            />
          )
        })}

        {/* Transparent click-capture overlay for the whole cabinet bounding box.
            DoubleSide so the raycaster still hits it when scaleZ === -1 flips the
            winding. The click bubbles to the outer group (which carries the handlers). */}
        <mesh position={[cab.dx / 2, cab.dy / 2, cab.dz / 2]}>
          <boxGeometry args={[cab.dx, cab.dy, cab.dz]} />
          <meshStandardMaterial transparent opacity={0} depthWrite={false} side={DoubleSide} />
        </mesh>

      </group>
    </group>
  )
}

// ── Wall visibility menu (DOM overlay) ───────────────────────────────────────

function WallVisibilityMenu({ x, y, walls, hiddenWallIds, onToggle, onShowAll, onBirdsEye, onReset, onClose }: {
  x: number; y: number
  walls: Wall[]
  hiddenWallIds: Set<string>
  onToggle: (id: string) => void
  onShowAll: () => void
  onBirdsEye: () => void
  onReset: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const handler = () => onClose()
    window.addEventListener('pointerdown', handler)
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('pointerdown', handler)
      window.removeEventListener('keydown', handler)
    }
  }, [onClose])

  const standardWalls = walls.filter(w => w.wall_type !== 'island')

  return (
    <div
      className="fixed z-50 bg-gray-800 border border-gray-600 rounded shadow-xl py-1 min-w-[190px] select-none"
      style={{ left: x, top: y }}
      onPointerDown={e => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 text-xs text-gray-400 font-medium uppercase tracking-wider border-b border-gray-700">
        Wall Visibility
      </div>
      {standardWalls.map(w => (
        <label
          key={w.id}
          className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 cursor-pointer"
        >
          <input
            type="checkbox"
            checked={!hiddenWallIds.has(w.id)}
            onChange={() => onToggle(w.id)}
            className="w-3.5 h-3.5 accent-blue-500 cursor-pointer"
          />
          <span className="truncate">{w.name}</span>
        </label>
      ))}
      {hiddenWallIds.size > 0 && (
        <>
          <div className="my-1 border-t border-gray-700" />
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-blue-400 hover:bg-gray-700"
            onClick={onShowAll}
          >
            Show all walls
          </button>
        </>
      )}
      <div className="my-1 border-t border-gray-700" />
      <div className="px-3 py-1 text-xs text-gray-400 font-medium uppercase tracking-wider">
        Views
      </div>
      <button
        className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
        onClick={() => { onBirdsEye(); onClose() }}
      >
        Bird's Eye
      </button>
      <button
        className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
        onClick={() => { onReset(); onClose() }}
      >
        Reset view
      </button>
    </div>
  )
}

// ── Cabinet context menu (DOM overlay) ───────────────────────────────────────

function CabContextMenu({ x, y, onEdit, onDelete, onClose }: {
  x: number; y: number
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown',    close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown',    close)
    }
  }, [onClose])

  return (
    <div
      className="fixed z-50 bg-gray-800 border border-gray-600 rounded shadow-xl py-1 min-w-[140px] select-none"
      style={{ left: x, top: y }}
      onPointerDown={e => e.stopPropagation()}
    >
      <button
        className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
        onClick={() => { onEdit(); onClose() }}
      >
        Edit cabinet
      </button>
      <div className="my-1 border-t border-gray-700" />
      <button
        className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-gray-700"
        onClick={() => { onDelete(); onClose() }}
      >
        Delete
      </button>
    </div>
  )
}

// ── Custom zoom ───────────────────────────────────────────────────────────────
// Replaces OrbitControls built-in scroll zoom so we can vary speed per modifier
// and zoom toward the 3D point under the cursor rather than the orbit target.
//
// Standard direction: scroll up = zoom in. Reversed by user pref (Settings → User → Preferences).
// Ctrl = fast zoom, Shift = fine zoom, no modifier = normal.

function CustomZoom({ controlsRef }: { controlsRef: React.RefObject<any> }) {
  const { camera, gl } = useThree()

  useEffect(() => {
    const canvas = gl.domElement

    function onWheel(e: WheelEvent) {
      e.preventDefault()
      if (!controlsRef.current) return

      // Speed multiplier by modifier key
      let speed = 0.12
      if (e.ctrlKey)  speed = 0.40
      if (e.shiftKey) speed = 0.03

      // Standard: scroll up (deltaY < 0) = zoom in; toggle inverts
      const inv = getUserPrefs().invertScroll
      const zoomIn = inv ? e.deltaY > 0 : e.deltaY < 0

      // Standard dolly: move along camera's forward axis toward the orbit target
      const dir = new Vector3()
      camera.getWorldDirection(dir)

      const target: Vector3 = controlsRef.current.target
      const dist = camera.position.distanceTo(target)
      const move = dist * speed * (zoomIn ? 1 : -1)

      camera.position.addScaledVector(dir, move)
      controlsRef.current.update()
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [camera, gl, controlsRef])

  return null
}

// ── Camera persistence ─────────────────────────────────────────────────────────
// Saves the camera position + orbit target into a parent-held ref so the view is
// retained when the 3D Canvas unmounts (switching to elevation/plan) and restored
// when it remounts. Without this, returning to 3D resets to the default view.

export type Camera3DState = { pos: [number, number, number]; target: [number, number, number] }

function CameraPersistence({ controlsRef, stateRef }: {
  controlsRef: React.RefObject<any>
  stateRef?: React.MutableRefObject<Camera3DState | null>
}) {
  // Subscribe to the *active default* camera. On first render the default is still
  // R3F's throwaway camera — drei's <PerspectiveCamera makeDefault> only swaps it in
  // via an effect. Depending on `camera` re-runs this once that swap settles, so we
  // read/write the camera OrbitControls actually drives (its `.object`), not the
  // stale one. Without this we'd persist/restore the wrong camera and 3D would still
  // appear to reset.
  const camera = useThree(s => s.camera)

  useEffect(() => {
    const ctrl = controlsRef.current
    if (!ctrl) return

    // Restore the saved view (e.g. returning from elevation/plan).
    const saved = stateRef?.current
    if (saved) {
      camera.position.set(saved.pos[0], saved.pos[1], saved.pos[2])
      ctrl.target.set(saved.target[0], saved.target[1], saved.target[2])
      ctrl.update()
    }

    // Persist on every camera change (orbit, pan, and CustomZoom — which calls
    // controls.update(), firing OrbitControls' 'change' event).
    if (!stateRef) return
    const save = () => {
      stateRef.current = {
        pos: [camera.position.x, camera.position.y, camera.position.z],
        target: [ctrl.target.x, ctrl.target.y, ctrl.target.z],
      }
    }
    ctrl.addEventListener('change', save)
    return () => ctrl.removeEventListener('change', save)
  }, [camera, controlsRef, stateRef])

  return null
}

// ── Camera controller ─────────────────────────────────────────────────────────
// Reacts to an incrementing signal to programmatically reposition the camera.

function CameraController({ signal, controlsRef, midX, midZ, camHeight, targetY }: {
  signal: number
  controlsRef: React.RefObject<any>
  midX: number; midZ: number; camHeight: number; targetY: number
}) {
  const { camera } = useThree()

  useEffect(() => {
    if (signal === 0 || !controlsRef.current) return
    // Tiny Z offset prevents gimbal lock when camera is directly above target.
    camera.position.set(midX, camHeight, midZ + 1)
    controlsRef.current.target.set(midX, targetY, midZ)
    controlsRef.current.update()
  }, [signal]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

// Reacts to an incrementing signal to snap the camera back to the default 3D view
// (the angled position computed from room bounds). Drives the "Reset view" button.

function ResetView({ signal, controlsRef, position, target }: {
  signal: number
  controlsRef: React.RefObject<any>
  position: [number, number, number]
  target: [number, number, number]
}) {
  const { camera } = useThree()

  useEffect(() => {
    if (signal === 0 || !controlsRef.current) return
    camera.position.set(position[0], position[1], position[2])
    controlsRef.current.target.set(target[0], target[1], target[2])
    controlsRef.current.update()
  }, [signal]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

// ── Room scene ────────────────────────────────────────────────────────────────

function RoomScene({ walls, cabinets, room, selectedId, onSelectCabinet, onCabContextMenu, resolvedParts, materialColours, ebByMatId, hiddenWallIds, birdsEyeSignal, resetSignal, cameraStateRef }: {
  walls: Wall[]
  cabinets: CabinetInstance[]
  room: Room
  selectedId: string | null
  onSelectCabinet: (id: string) => void
  onCabContextMenu: (cabId: string, x: number, y: number) => void
  resolvedParts: Map<string, ResolvedCabinet>
  materialColours?: Record<string, MatColEntry>
  ebByMatId?: EbByMatId
  hiddenWallIds: Set<string>
  birdsEyeSignal: number
  resetSignal: number
  cameraStateRef?: React.MutableRefObject<Camera3DState | null>
}) {
  const controlsRef = useRef<any>(null)
  const { x: cx, y: cy } = useMemo(() => centroid(walls), [walls])
  const roomH = room.room_dy ?? 2400

  const bounds = useMemo(() => {
    const pts = walls.flatMap(w => [{ x: w.pos_x, y: w.pos_y }, wallEnd(w)])
    const xs = pts.map(p => p.x), zs = pts.map(p => p.y)
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
  }, [walls])

  const spanX   = bounds.maxX - bounds.minX
  const spanZ   = bounds.maxZ - bounds.minZ
  const span    = Math.max(spanX, spanZ, roomH)
  const camDist = span * 1.5
  const midX    = (bounds.minX + bounds.maxX) / 2
  const midZ    = (bounds.minZ + bounds.maxZ) / 2

  // Memoise the default camera position + orbit target so their array identity is
  // stable across re-renders. Inline literals are fresh every render, which makes
  // react-three-fiber re-apply them — snapping the camera back to default on any
  // re-render (selection, async part loads) and clobbering both the retained view
  // and live orbiting. Stable arrays apply only on mount / genuine geometry change.
  const camPosition = useMemo<[number, number, number]>(
    () => [midX + camDist * 0.55, camDist * 0.65, midZ + camDist * 0.85],
    [midX, midZ, camDist],
  )
  const camTarget = useMemo<[number, number, number]>(
    () => [midX, roomH * 0.3, midZ],
    [midX, midZ, roomH],
  )

  return (
    <>
      <PerspectiveCamera
        makeDefault fov={FOV}
        position={camPosition}
        near={10} far={500000}
      />
      <OrbitControls
        ref={controlsRef}
        target={camTarget}
        minDistance={span * 0.1}
        maxDistance={span * 8}
        enablePan enableDamping={false}
        enableZoom={false}
      />
      <CustomZoom controlsRef={controlsRef} />
      <CameraPersistence controlsRef={controlsRef} stateRef={cameraStateRef} />
      <ResetView signal={resetSignal} controlsRef={controlsRef} position={camPosition} target={camTarget} />
      <CameraController
        signal={birdsEyeSignal}
        controlsRef={controlsRef}
        midX={midX} midZ={midZ}
        camHeight={span * 2}
        targetY={0}
      />

      <ambientLight intensity={1.8} />
      <directionalLight position={[midX + span, roomH * 2, midZ + span * 0.8]} intensity={1.6} />
      <directionalLight position={[midX - span * 0.4, roomH * 0.5, midZ - span * 0.5]} intensity={0.6} color="#e8f0ff" />

      {/* Floor */}
      <mesh position={[midX, 0, midZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[spanX + 1500, spanZ + 1500]} />
        <meshStandardMaterial color="#c8b89a" roughness={0.9} />
      </mesh>

      {/* Walls */}
      {walls.map(w => hiddenWallIds.has(w.id) ? null : (
        <WallMesh key={w.id} wall={w} walls={walls} room={room} cx={cx} cy={cy} />
      ))}

      {/* Wall name labels on top edge */}
      {walls.map(w => hiddenWallIds.has(w.id) ? null : (
        <WallLabel key={`lbl_${w.id}`} wall={w} room={room} cx={cx} cy={cy} />
      ))}

      {/* Cabinets */}
      {cabinets.map(cab => {
        const wall = walls.find(w => w.id === cab.wall_id)
        if (!wall || (cab.wall_id != null && hiddenWallIds.has(cab.wall_id))) return null
        return (
          <CabinetMesh
            key={cab.id}
            cab={cab} wall={wall} cx={cx} cy={cy} room={room}
            selected={selectedId === cab.id}
            onSelect={() => onSelectCabinet(cab.id)}
            onContextMenu={(x, y) => onCabContextMenu(cab.id, x, y)}
            rp={resolvedParts.get(cab.id)}
            materialColours={materialColours}
            ebByMatId={ebByMatId}
          />
        )
      })}
    </>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

type MenuState     = { x: number; y: number; cabId: string }
type WallMenuState = { x: number; y: number }

export default function Room3DScene({ walls, cabinets, room, selectedId, onSelectCabinet, onDeselect, onEditCabinet, onDeleteCabinet, resolvedParts, materialColours, ebByMatId, cameraStateRef, resetSignal = 0 }: {
  walls: Wall[]
  cabinets: CabinetInstance[]
  room: Room
  selectedId: string | null
  onSelectCabinet: (id: string) => void
  onDeselect: () => void
  onEditCabinet: (id: string) => void
  onDeleteCabinet: (id: string) => void
  resolvedParts: Map<string, ResolvedCabinet>
  materialColours?: Record<string, MatColEntry>
  ebByMatId?: EbByMatId
  cameraStateRef?: React.MutableRefObject<Camera3DState | null>
  resetSignal?: number
}) {
  const [menu, setMenu]               = useState<MenuState | null>(null)
  const [wallMenu, setWallMenu]       = useState<WallMenuState | null>(null)
  const [hiddenWallIds, setHiddenWallIds] = useState<Set<string>>(new Set())
  const [birdsEyeSignal, setBirdsEyeSignal] = useState(0)
  // Local reset trigger (from the right-click menu), combined with the parent's
  // resetSignal prop so either source snaps the camera back to the default view.
  const [resetViewSignal, setResetViewSignal] = useState(0)
  // Tracks whether the right-click landed on a cabinet so the div-level handler
  // can distinguish "empty space" right-clicks (which should show the wall menu).
  const hitCabRef = useRef(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setMenu(null); setWallMenu(null); onDeselect() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDeselect])

  function toggleWallVisibility(id: string) {
    setHiddenWallIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div
      className="flex-1 relative min-w-0"
      onContextMenu={e => {
        e.preventDefault()
        if (!hitCabRef.current) {
          setMenu(null)
          setWallMenu({ x: e.clientX, y: e.clientY })
          onDeselect()
        }
        hitCabRef.current = false
      }}
    >
      <Canvas gl={{ antialias: true }} dpr={[1, 2]} style={{ background: '#e8e4de' }}>
        <Suspense fallback={null}>
          {walls.length > 0 && (
            <RoomScene
              walls={walls} cabinets={cabinets} room={room}
              selectedId={selectedId} onSelectCabinet={onSelectCabinet}
              onCabContextMenu={(cabId, x, y) => {
                hitCabRef.current = true
                setWallMenu(null)
                setMenu({ cabId, x, y })
              }}
              resolvedParts={resolvedParts}
              materialColours={materialColours}
              ebByMatId={ebByMatId}
              hiddenWallIds={hiddenWallIds}
              birdsEyeSignal={birdsEyeSignal}
              resetSignal={resetSignal + resetViewSignal}
              cameraStateRef={cameraStateRef}
            />
          )}
        </Suspense>
      </Canvas>

      {walls.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm pointer-events-none select-none">
          Draw walls in Plan view first
        </div>
      )}

      <div className="absolute bottom-2 left-3 text-[10px] text-gray-700 pointer-events-none select-none">
        Left-drag rotate · scroll zoom · right-drag pan · right-click for options
      </div>

      {menu && (
        <CabContextMenu
          x={menu.x} y={menu.y}
          onEdit={() => onEditCabinet(menu.cabId)}
          onDelete={() => onDeleteCabinet(menu.cabId)}
          onClose={() => setMenu(null)}
        />
      )}

      {wallMenu && (
        <WallVisibilityMenu
          x={wallMenu.x} y={wallMenu.y}
          walls={walls}
          hiddenWallIds={hiddenWallIds}
          onToggle={toggleWallVisibility}
          onShowAll={() => setHiddenWallIds(new Set())}
          onBirdsEye={() => setBirdsEyeSignal(s => s + 1)}
          onReset={() => setResetViewSignal(s => s + 1)}
          onClose={() => setWallMenu(null)}
        />
      )}
    </div>
  )
}
