'use client'

import { Suspense, useMemo, useEffect, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Edges, Text } from '@react-three/drei'
import { Shape, Path, ExtrudeGeometry, Matrix4, Vector2, Vector3 } from 'three'
import type { Wall, CabinetInstance, Room, BenchtopInstance, BenchtopEdgeProfile } from '@/src/lib/types'
import { btSegments, outlinePoints, outwardNormal, effectiveProfileId, waterfallJoin } from '@/src/lib/benchtopGeometry'
import type { BtElevInfo } from './BenchtopElevation'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import type { LayerView } from '@/src/lib/displayLayers/resolve'
import {
  wallDir, wallInwardNormal, centroid, wallEnd, lineIntersect, dist,
} from '@/src/lib/geometry'
import type { Pt } from '@/src/lib/geometry'
import { wheelZoomFactor } from '@/src/lib/wheelZoom'
import { PassivePartsContext, alphaMat, type PartEdge, type MatColMap } from '@/src/components/three/PartViewer'
import type { EbByMatId } from './useMaterialColours'
import { CabinetScene, type SceneCustomPart } from './Cabinet3DView'
import { dbLoadRoomPartDetails, type PartPosOverrides, type ShapeOverrides } from './canvasDB'
import { useHandOpMarkersMulti } from './HandOpMarkers'
import type { CabinetOpMarker } from '@/src/lib/optimiser/partOpProject'
import Measure3D, { NO_MEASURE } from './Measure3D'

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

// ── Wall mesh with mitre ──────────────────────────────────────────────────────
// ExtrudeGeometry approach:
//   • Shape is in Three.js XY plane using (planX, −planY) as coords.
//   • Extruded along +Z then rotateX(−π/2) maps: X→worldX, Z(height)→worldY, −Y→worldZ.
//   • So (planX,−planY) → (worldX, 0, planY) at floor — exactly right.

function WallMesh({ wall, walls, room, cx, cy, color = '#cbd5e1', alpha = 1 }: {
  wall: Wall; walls: Wall[]; room: Room; cx: number; cy: number; color?: string; alpha?: number
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
    <mesh key={alpha < 1 ? 't' : 'o'} geometry={geometry}>
      <meshStandardMaterial color={color} roughness={0.85} metalness={0} {...alphaMat(alpha)} />
      <Edges threshold={25} color="#94a3b8" transparent opacity={alpha} />
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
      userData={NO_MEASURE}
    >
      {wall.name}
    </Text>
  )
}

// ── Benchtop mesh (benchtop Phase 3b, P-i) ────────────────────────────────────
// Outline (curves sampled, cutouts as holes) extruded by the top's thickness so
// its surface sits at topZ. Same plan → world mapping as WallMesh. Waterfall
// edges (profile generates = 'waterfall') get a leg panel from the floor to
// the underside, set in by the thickness under that edge.

function BenchtopMesh({ bt, info, profiles, selected, onSelect, color, alpha }: {
  bt: BenchtopInstance
  info: BtElevInfo
  profiles: Record<string, BenchtopEdgeProfile>
  selected: boolean
  /** Only in F4 Benchtop mode — otherwise no handler, so clicks pass to the cabinets. */
  onSelect?: () => void
  color: string
  alpha: number
}) {
  const { topZ, thick, defaultProfileId } = info
  const T = thick.total
  const segs = useMemo(() => btSegments(bt), [bt])

  // Waterfall edges (straight only). Mitre: the slab is cut back by T on that
  // edge and the leg is a full-height prism with the 45° face, plus a wedge
  // filling the top corner — so the joint shows as the diagonal on the side
  // faces. Butt: the top runs over a leg that stops at the underside.
  const waterfalls = useMemo(() => segs.flatMap((s, i) => {
    if (s.type !== 'line' || s.edge?.wall || topZ - T <= 0) return []
    const pid = effectiveProfileId(s, defaultProfileId)
    if (!pid || profiles[pid]?.generates !== 'waterfall') return []
    return [{ i, s, n: outwardNormal(segs, i), join: waterfallJoin(s) }]
  }), [segs, defaultProfileId, profiles, topZ, T])

  const slab = useMemo(() => {
    // Cut mitred waterfall edges back by T (their neighbours' ends follow).
    const cut = segs.map(q => ({ ...q, p0: { ...q.p0 }, p1: { ...q.p1 } }))
    for (const w of waterfalls) {
      if (w.join !== 'mitre') continue
      const k = w.i, prev = (k - 1 + cut.length) % cut.length, next = (k + 1) % cut.length
      const mv = (q: Pt) => ({ x: q.x - w.n.x * T, y: q.y - w.n.y * T })
      cut[k].p0 = mv(cut[k].p0); cut[k].p1 = mv(cut[k].p1)
      cut[prev].p1 = cut[k].p0; cut[next].p0 = cut[k].p1
    }
    const pts = outlinePoints(cut, 24)
    if (pts.length < 3) return null
    const shape = new Shape(pts.map(p => new Vector2(p.x, -p.y)))
    for (const c of bt.cutout_polygons ?? []) {
      if (c.length >= 3) shape.holes.push(new Path(c.map(p => new Vector2(p.x, -p.y))))
    }
    const geo = new ExtrudeGeometry(shape, { depth: T, bevelEnabled: false })
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, topZ - T, 0)
    geo.computeVertexNormals()
    return geo
  }, [segs, waterfalls, bt.cutout_polygons, T, topZ])

  // Leg / wedge prisms: a profile in (u = inward from the outer face, v = up),
  // extruded along the edge, placed by a basis matrix (u → −n, v → up, z → edge).
  const legGeos = useMemo(() => waterfalls.flatMap(w => {
    const len = Math.hypot(w.s.p1.x - w.s.p0.x, w.s.p1.y - w.s.p0.y)
    const prism = (prof: [number, number][]) => {
      const g = new ExtrudeGeometry(new Shape(prof.map(([u, v]) => new Vector2(u, v))), { depth: len, bevelEnabled: false })
      // u × up must point along +z; pick the end so the basis is right-handed.
      const zv = { x: w.n.y, y: -w.n.x }
      const d = { x: (w.s.p1.x - w.s.p0.x) / len, y: (w.s.p1.y - w.s.p0.y) / len }
      const o = zv.x * d.x + zv.y * d.y > 0 ? w.s.p0 : w.s.p1
      const m = new Matrix4().makeBasis(new Vector3(-w.n.x, 0, -w.n.y), new Vector3(0, 1, 0), new Vector3(zv.x, 0, zv.y))
      m.setPosition(o.x, 0, o.y)
      g.applyMatrix4(m)
      g.computeVertexNormals()
      return g
    }
    const under = topZ - T
    return w.join === 'mitre'
      ? [{ key: `l${w.i}`, geo: prism([[0, 0], [T, 0], [T, under], [0, topZ]]) },
         { key: `w${w.i}`, geo: prism([[T, under], [T, topZ], [0, topZ]]) }]
      : [{ key: `l${w.i}`, geo: prism([[0, 0], [T, 0], [T, under], [0, under]]) }]
  }), [waterfalls, T, topZ])

  useEffect(() => () => { slab?.dispose() }, [slab])
  useEffect(() => () => { legGeos.forEach(l => l.geo.dispose()) }, [legGeos])

  if (!slab) return null
  const col = selected ? '#f59e0b' : color
  const click = onSelect ? (e: { stopPropagation: () => void }) => { e.stopPropagation(); onSelect() } : undefined
  return (
    <group>
      {[{ key: 'slab', geo: slab }, ...legGeos].map(m => (
        <mesh key={m.key} geometry={m.geo} onClick={click}>
          <meshStandardMaterial color={col} roughness={0.5} metalness={0} {...alphaMat(alpha)} />
          <Edges threshold={20} color="#64748b" transparent opacity={alpha} />
        </mesh>
      ))}
    </group>
  )
}

// ── Cabinet mesh ──────────────────────────────────────────────────────────────
// Parts are drawn by Cabinet3DView's CabinetScene — the same renderer as the
// cabinet editor — so part overrides, drawn shapes, added parts and hardware
// models match the editor exactly, gated by the display layer set.
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

function CabinetMesh({ cab, wall, cx, cy, room, selected, onSelect, onContextMenu, rp, materialColours, ebByMatId, layers, partOverrides, shapeOverrides, handMarkers }: {
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
  layers: LayerView
  partOverrides?: PartPosOverrides
  shapeOverrides?: ShapeOverrides
  handMarkers?: CabinetOpMarker[]
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
  // Selected cabinet = amber tint: every material lookup resolves to amber and
  // edge tape is dropped (so strips don't paint over the tint).
  const partColours = selected ? SELECTED_COLOURS : (materialColours as MatColMap | undefined)
  const partEdgebands = selected ? undefined : ebByMatId

  // Room-visible added parts only (show_in_room), in CabinetScene's shape.
  const customParts = useMemo(
    () => (rp?.custom_parts ?? []).filter(p => p.show_in_room) as unknown as SceneCustomPart[],
    [rp?.custom_parts],
  )

  if (!rp) {
    // Fallback box when resolver data isn't loaded yet (or failed) — stands in for
    // the carcase, so it follows the carcase layer items.
    if (!layers.any('carcass_gables', 'carcass_top', 'carcass_bottom', 'carcass_back')) return null
    // Ghost / opacity: follow whichever carcase item is shown (gables first).
    const placeholderAlpha = layers.alpha(
      ['carcass_gables', 'carcass_top', 'carcass_bottom', 'carcass_back'].find(id => layers.show(id))!,
    )
    const actualPerp = isFlipped ? { x: -perp.x, y: -perp.y } : perp
    const cx3 = cab.pos_x + (cab.dx / 2) * wd.x + (cab.dz / 2) * actualPerp.x
    const cz3 = cab.pos_y + (cab.dx / 2) * wd.y + (cab.dz / 2) * actualPerp.y
    return (
      <mesh
        key={placeholderAlpha < 1 ? 't' : 'o'}
        position={[cx3, floorY + cab.dy / 2, cz3]}
        rotation={[0, rotY, 0]}
        onClick={e => { e.stopPropagation(); onSelect() }}
        onContextMenu={e => { e.stopPropagation(); onContextMenu(e.nativeEvent.clientX, e.nativeEvent.clientY) }}
      >
        <boxGeometry args={[cab.dx, cab.dy, cab.dz]} />
        <meshStandardMaterial color={selected ? SEL : '#d4c5aa'} roughness={0.7} metalness={0.05} {...alphaMat(placeholderAlpha)} />
        <Edges threshold={10} color={selected ? SELE : '#a89880'} transparent opacity={placeholderAlpha} />
      </mesh>
    )
  }

  // Group origin = bottom-back-left corner of cabinet in world space; CabinetScene
  // is centred on the cabinet, so it's offset by half the box.
  // Pointer targets = the parts actually drawn. R3F raycasts every descendant of
  // a group with handlers, so a click / right-click on any shown part bubbles to
  // the outer group; parts hidden by the layer set aren't rendered, so they (and
  // empty space where they'd be) can't be clicked. Parts are passive
  // (PassivePartsContext) so no part-level handler competes with the cabinet's.
  // No bounding-box overlay: it made hidden parts selectable.
  return (
    <group
      position={[cab.pos_x, floorY, cab.pos_y]}
      rotation={[0, rotY, 0]}
      onClick={e => { e.stopPropagation(); onSelect() }}
      onContextMenu={e => { e.stopPropagation(); onContextMenu(e.nativeEvent.clientX, e.nativeEvent.clientY) }}
    >
      <group scale={[1, 1, scaleZ]}>
        {/* Per-cabinet Suspense: a hardware model still loading only hides this cabinet. */}
        <Suspense fallback={null}>
          <PassivePartsContext.Provider value>
          <group position={[cab.dx / 2, cab.dy / 2, cab.dz / 2]}>
            <CabinetScene
              cab={cab}
              rp={rp}
              selected={null}
              onSelect={NOOP}
              materialColours={partColours}
              ebByMatId={partEdgebands}
              doorsOpen={false}
              openDrawers={EMPTY_DRAWERS}
              openInnerDrawers={EMPTY_INNER_DRAWERS}
              edgeOverrides={EMPTY_EDGES}
              customParts={customParts}
              partOverrides={partOverrides}
              shapeOverrides={shapeOverrides}
              showDrilling={layers.show('machining')}
              handMarkers={handMarkers}
              layers={layers}
              roomOutlines
            />
          </group>
          </PassivePartsContext.Provider>
        </Suspense>

      </group>
    </group>
  )
}

const NOOP = () => {}
const SELECTED_COLOURS: MatColMap = new Proxy({}, {
  get: () => ({ face: '#d97706', back: '#d97706', edge: '#fbbf24' }),
}) as MatColMap
const EMPTY_DRAWERS = new Map<string, number>()
const EMPTY_INNER_DRAWERS = new Map<number, number>()
const EMPTY_EDGES = new Map<string, PartEdge>()

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

  // Islands have no wall mesh in 3D, but toggling one still hides/shows the
  // cabinets placed on it — list them after the standard walls.
  const menuWalls = [
    ...walls.filter(w => w.wall_type !== 'island'),
    ...walls.filter(w => w.wall_type === 'island'),
  ]

  return (
    <div
      className="fixed z-50 bg-gray-800 border border-gray-600 rounded shadow-xl py-1 min-w-[190px] select-none"
      style={{ left: x, top: y }}
      onPointerDown={e => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 text-xs text-gray-400 font-medium uppercase tracking-wider border-b border-gray-700">
        Wall Visibility
      </div>
      {menuWalls.map(w => (
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

function CabContextMenu({ x, y, onEdit, onReplace, onDelete, onClose }: {
  x: number; y: number
  onEdit: () => void
  onReplace?: () => void
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
      {onReplace && (
        <button
          className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
          onClick={() => { onReplace(); onClose() }}
        >
          Replace with library cabinet…
        </button>
      )}
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
// Ctrl = fast zoom, Shift = fine zoom, no modifier = normal. Also handles touch pinch.

function CustomZoom({ controlsRef }: { controlsRef: React.RefObject<any> }) {
  const { camera, gl } = useThree()

  useEffect(() => {
    const canvas = gl.domElement

    function onWheel(e: WheelEvent) {
      e.preventDefault()
      if (!controlsRef.current) return

      // Same rate as the 2D views (Ctrl = fast, Shift = fine)
      const zoom = wheelZoomFactor(e)

      // Standard dolly: move along camera's forward axis toward the orbit target,
      // shrinking the camera→target distance by the zoom factor
      const dir = new Vector3()
      camera.getWorldDirection(dir)

      const target: Vector3 = controlsRef.current.target
      const dist = camera.position.distanceTo(target)
      const move = dist * (1 - 1 / zoom)

      camera.position.addScaledVector(dir, move)
      controlsRef.current.update()
    }

    // Touchscreen pinch. OrbitControls' own pinch dolly is gated on enableZoom (off,
    // so the wheel handler above owns zoom); its two-finger pan still runs alongside.
    // Scales the camera→target distance by the finger-spread ratio, clamped to the
    // controls' min/max distance. No invertScroll here — pinch direction is physical.
    const touches = new Map<number, { x: number; y: number }>()
    let lastSpread = 0

    function spread() {
      const [a, b] = [...touches.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType !== 'touch') return
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      lastSpread = touches.size === 2 ? spread() : 0
    }

    function onPointerMove(e: PointerEvent) {
      if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const ctrl = controlsRef.current
      if (touches.size !== 2 || !ctrl || lastSpread <= 0) return

      const now = spread()
      if (now <= 0) return
      const target: Vector3 = ctrl.target
      const offset = camera.position.clone().sub(target)
      const dist = offset.length()
      const next = Math.min(ctrl.maxDistance, Math.max(ctrl.minDistance, dist * (lastSpread / now)))
      lastSpread = now

      camera.position.copy(target).add(offset.multiplyScalar(next / dist))
      ctrl.update()
    }

    function onPointerUp(e: PointerEvent) {
      if (!touches.delete(e.pointerId)) return
      lastSpread = touches.size === 2 ? spread() : 0
    }

    // move/up on the document: OrbitControls captures the pointer, and a finger
    // lifted off-canvas must still clear its entry.
    const doc = canvas.ownerDocument
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('pointerdown', onPointerDown)
    doc.addEventListener('pointermove', onPointerMove)
    doc.addEventListener('pointerup', onPointerUp)
    doc.addEventListener('pointercancel', onPointerUp)
    return () => {
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onPointerDown)
      doc.removeEventListener('pointermove', onPointerMove)
      doc.removeEventListener('pointerup', onPointerUp)
      doc.removeEventListener('pointercancel', onPointerUp)
    }
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

function RoomScene({ walls, cabinets, room, selectedId, onSelectCabinet, onCabContextMenu, resolvedParts, materialColours, ebByMatId, hiddenWallIds, birdsEyeSignal, resetSignal, cameraStateRef, layers, bt, pickBenchtops, measuring }: {
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
  layers: LayerView
  bt?: Bt3DProps
  pickBenchtops: boolean
  measuring: boolean
}) {
  const controlsRef = useRef<any>(null)
  const { x: cx, y: cy } = useMemo(() => centroid(walls), [walls])

  // Part overrides + drawn shapes for every cabinet. Re-fetched when the resolved
  // map changes (a cabinet edit re-resolves → new map), so editor changes show here.
  const cabIdsKey = cabinets.map(c => c.id).join(',')
  const [details, setDetails] = useState<{ posById: Map<string, PartPosOverrides>; shapesById: Map<string, ShapeOverrides> } | null>(null)
  useEffect(() => {
    let cancelled = false
    dbLoadRoomPartDetails(cabIdsKey ? cabIdsKey.split(',') : []).then(d => { if (!cancelled) setDetails(d) })
    return () => { cancelled = true }
  }, [cabIdsKey, resolvedParts])
  // Hand-added operations only load while the machining layer is shown.
  const handMarkersByCab = useHandOpMarkersMulti(
    layers.show('machining') ? cabinets.map(c => c.id) : [], resolvedParts,
  )
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
      {layers.show('walls') && walls.map(w => hiddenWallIds.has(w.id) ? null : (
        <WallMesh key={w.id} wall={w} walls={walls} room={room} cx={cx} cy={cy} color={layers.colorOf('walls')} alpha={layers.alpha('walls')} />
      ))}

      {/* Wall name labels on top edge */}
      <Suspense fallback={null}>
        {layers.show('walls') && walls.map(w => hiddenWallIds.has(w.id) ? null : (
          <WallLabel key={`lbl_${w.id}`} wall={w} room={room} cx={cx} cy={cy} />
        ))}
      </Suspense>

      {/* Cabinets */}
      {cabinets.map(cab => {
        const wall = walls.find(w => w.id === cab.wall_id)
        if (!wall || (cab.wall_id != null && hiddenWallIds.has(cab.wall_id))) return null
        return (
          <CabinetMesh
            key={cab.id}
            cab={cab} wall={wall} cx={cx} cy={cy} room={room}
            selected={selectedId === cab.id}
            // F4 Benchtop mode: cabinets can't be picked (clicks fall to the tops).
            // Measure tool: clicks pick faces, not cabinets.
            onSelect={() => { if (!pickBenchtops && !measuring) onSelectCabinet(cab.id) }}
            onContextMenu={(x, y) => { if (!pickBenchtops && !measuring) onCabContextMenu(cab.id, x, y) }}
            rp={resolvedParts.get(cab.id)}
            materialColours={materialColours}
            ebByMatId={ebByMatId}
            layers={layers}
            partOverrides={details?.posById.get(cab.id)}
            shapeOverrides={details?.shapesById.get(cab.id)}
            handMarkers={handMarkersByCab.get(cab.id)}
          />
        )
      })}

      {/* Benchtops — hidden with their anchor wall, like cabinets */}
      {bt && layers.show('benchtops') && bt.benchtops.map(b => (
        b.wall_id && hiddenWallIds.has(b.wall_id) ? null : (
          <BenchtopMesh key={b.id} bt={b} info={bt.info(b)} profiles={bt.profiles}
            selected={bt.selectedId === b.id} onSelect={pickBenchtops ? () => bt.onSelect(b.id) : undefined}
            color={layers.color('benchtops', '#e7e5e4')} alpha={layers.alpha('benchtops')} />
        )
      ))}

      {measuring && <Measure3D />}
    </>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

/** Benchtop inputs for the 3D view (Phase 3b). */
export interface Bt3DProps {
  benchtops: BenchtopInstance[]
  info: (bt: BenchtopInstance) => BtElevInfo
  profiles: Record<string, BenchtopEdgeProfile>
  selectedId: string | null
  onSelect: (id: string) => void
}

type MenuState     = { x: number; y: number; cabId: string }
type WallMenuState = { x: number; y: number }

export default function Room3DScene({ walls, cabinets, room, selectedId, onSelectCabinet, onDeselect, onEditCabinet, onDeleteCabinet, onReplaceCabinet, resolvedParts, materialColours, ebByMatId, cameraStateRef, resetSignal = 0, layers, bt, pickBenchtops = false, measuring = false }: {
  walls: Wall[]
  cabinets: CabinetInstance[]
  room: Room
  selectedId: string | null
  onSelectCabinet: (id: string) => void
  onDeselect: () => void
  onEditCabinet: (id: string) => void
  onDeleteCabinet: (id: string) => void
  onReplaceCabinet?: (id: string) => void
  resolvedParts: Map<string, ResolvedCabinet>
  materialColours?: Record<string, MatColEntry>
  ebByMatId?: EbByMatId
  cameraStateRef?: React.MutableRefObject<Camera3DState | null>
  resetSignal?: number
  layers: LayerView
  bt?: Bt3DProps
  /** F4 Benchtop mode: only benchtops pick; cabinets ignore clicks. */
  pickBenchtops?: boolean
  /** Measure tool on: clicks pick faces to measure between; right-click clears. */
  measuring?: boolean
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
        if (measuring) return              // right-click clears the measurement (Measure3D)
        if (!hitCabRef.current) {
          setMenu(null)
          setWallMenu({ x: e.clientX, y: e.clientY })
          onDeselect()
        }
        hitCabRef.current = false
      }}
    >
      <Canvas gl={{ antialias: true }} dpr={[1, 2]} style={{ background: layers.background ?? '#e8e4de' }}>
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
              layers={layers}
              bt={bt}
              pickBenchtops={pickBenchtops}
              measuring={measuring}
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
        {measuring
          ? 'Measure: hover a face · click it · click a second face · right-click clear · drag still orbits · Esc exit'
          : 'Left-drag rotate · scroll/pinch zoom · right-drag pan · right-click for options'}
      </div>

      {menu && (
        <CabContextMenu
          x={menu.x} y={menu.y}
          onEdit={() => onEditCabinet(menu.cabId)}
          onDelete={() => onDeleteCabinet(menu.cabId)}
          onReplace={onReplaceCabinet && !cabinets.find(c => c.id === menu.cabId)?.is_kick_assembly
            ? () => onReplaceCabinet(menu.cabId) : undefined}
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
