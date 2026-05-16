'use client'

import { Suspense, useMemo, useEffect, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Edges } from '@react-three/drei'
import { Shape, ExtrudeGeometry, Vector3 } from 'three'
import type { Wall, CabinetInstance, Room } from '@/src/lib/types'
import type {
  ResolvedCabinet, ResolvedCasePart, ResolvedToekickPart,
  ResolvedInternalPart, ResolvedFaceZone,
} from '@/src/lib/resolver/types'
import {
  wallDir, wallInwardNormal, centroid, wallEnd, lineIntersect, dist,
} from '@/src/lib/geometry'
import type { Pt } from '@/src/lib/geometry'

const TO_RAD = Math.PI / 180
const FOV    = 40

// ── Helpers ───────────────────────────────────────────────────────────────────

function cabFloorY(cab: CabinetInstance, room: Room): number {
  if (cab.assembly_class === 'wall' || cab.assembly_class === 'wall_corner')
    return (room.wall_cabinet_top ?? 2100) - cab.dy
  return 0
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

function isSide(k: string) { return k === 'left_side' || k === 'right_side' }

function caseBox(p: ResolvedCasePart, dy: number): Box {
  if (isSide(p.part_key))
    return { x: p.X, y: p.Y, z: p.Z, w: p.DZ, h: p.DY, d: p.DX }
  if (p.part_key === 'back')
    return { x: p.X, y: p.Y + p.DZ, z: p.Z, w: p.DY, h: dy - p.Y - p.DZ, d: p.DZ }
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

// Single part mesh (no pointer events — click captured by whole-cabinet overlay)
function Part({ b, color, edgeColor }: { b: Box; color: string; edgeColor: string }) {
  return (
    <mesh position={[b.x + b.w / 2, b.y + b.h / 2, b.z + b.d / 2]}>
      <boxGeometry args={[b.w, b.h, b.d]} />
      <meshStandardMaterial color={color} roughness={0.7} metalness={0.05} />
      <Edges threshold={10} color={edgeColor} />
    </mesh>
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

function CabinetMesh({ cab, wall, cx, cy, room, selected, onSelect, onContextMenu, rp }: {
  cab: CabinetInstance
  wall: Wall
  cx: number; cy: number
  room: Room
  selected: boolean
  onSelect: () => void
  onContextMenu: (x: number, y: number) => void
  rp?: ResolvedCabinet
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
  return (
    <group position={[cab.pos_x, floorY, cab.pos_y]} rotation={[0, rotY, 0]}>
      <group scale={[1, 1, scaleZ]}>

        {/* ── Carcass ── */}
        {rp.case_parts.map((p, i) => (
          <Part key={`c${i}`}
            b={caseBox(p, cab.dy)}
            color={selected ? SEL : '#ddd3bb'}
            edgeColor={selected ? SELE : '#b8a98e'}
          />
        ))}

        {/* ── Toe kick ── */}
        {rp.toekick_parts.map((p, i) => (
          <Part key={`t${i}`}
            b={tkBox(p)}
            color={selected ? SEL : '#78716c'}
            edgeColor={selected ? SELE : '#57534e'}
          />
        ))}

        {/* ── Shelves / internal ── */}
        {rp.internal_parts.map((p, i) => (
          <Part key={`s${i}`}
            b={intBox(p)}
            color={selected ? SEL : '#e8dece'}
            edgeColor={selected ? SELE : '#c4b49c'}
          />
        ))}

        {/* ── Face zones ── */}
        {rp.face_zones.filter(z => z.face_type !== 'open').map((z, i) => (
          <Part key={`f${i}`}
            b={zoneBox(z)}
            color={selected ? SEL : (z.face_type === 'drawer_face' ? '#e2d9c8' : '#f0ebe0')}
            edgeColor={selected ? SELE : '#b8a98e'}
          />
        ))}

        {/* Transparent click-capture overlay for the whole cabinet bounding box */}
        <mesh
          position={[cab.dx / 2, cab.dy / 2, cab.dz / 2]}
          onClick={e => { e.stopPropagation(); onSelect() }}
          onContextMenu={e => { e.stopPropagation(); onContextMenu(e.nativeEvent.clientX, e.nativeEvent.clientY) }}
        >
          <boxGeometry args={[cab.dx, cab.dy, cab.dz]} />
          <meshStandardMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

      </group>
    </group>
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
// Scroll direction is reversed (scroll down = zoom in) matching the rest of the app.
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

      // Reversed scroll: deltaY > 0 (scroll down) = zoom in
      const zoomIn = e.deltaY > 0

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

// ── Room scene ────────────────────────────────────────────────────────────────

function RoomScene({ walls, cabinets, room, selectedId, onSelectCabinet, onCabContextMenu, resolvedParts }: {
  walls: Wall[]
  cabinets: CabinetInstance[]
  room: Room
  selectedId: string | null
  onSelectCabinet: (id: string) => void
  onCabContextMenu: (cabId: string, x: number, y: number) => void
  resolvedParts: Map<string, ResolvedCabinet>
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

  return (
    <>
      <PerspectiveCamera
        makeDefault fov={FOV}
        position={[midX + camDist * 0.55, camDist * 0.65, midZ + camDist * 0.85]}
        near={10} far={500000}
      />
      <OrbitControls
        ref={controlsRef}
        target={[midX, roomH * 0.3, midZ]}
        minDistance={span * 0.1}
        maxDistance={span * 8}
        enablePan enableDamping={false}
        enableZoom={false}
      />
      <CustomZoom controlsRef={controlsRef} />

      <ambientLight intensity={1.8} />
      <directionalLight position={[midX + span, roomH * 2, midZ + span * 0.8]} intensity={1.6} />
      <directionalLight position={[midX - span * 0.4, roomH * 0.5, midZ - span * 0.5]} intensity={0.6} color="#e8f0ff" />

      {/* Floor */}
      <mesh position={[midX, 0, midZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[spanX + 1500, spanZ + 1500]} />
        <meshStandardMaterial color="#c8b89a" roughness={0.9} />
      </mesh>

      {/* Walls */}
      {walls.map(w => (
        <WallMesh key={w.id} wall={w} walls={walls} room={room} cx={cx} cy={cy} />
      ))}

      {/* Cabinets */}
      {cabinets.map(cab => {
        const wall = walls.find(w => w.id === cab.wall_id)
        if (!wall) return null
        return (
          <CabinetMesh
            key={cab.id}
            cab={cab} wall={wall} cx={cx} cy={cy} room={room}
            selected={selectedId === cab.id}
            onSelect={() => onSelectCabinet(cab.id)}
            onContextMenu={(x, y) => onCabContextMenu(cab.id, x, y)}
            rp={resolvedParts.get(cab.id)}
          />
        )
      })}
    </>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

type MenuState = { x: number; y: number; cabId: string }

export default function Room3DScene({ walls, cabinets, room, selectedId, onSelectCabinet, onEditCabinet, onDeleteCabinet, resolvedParts }: {
  walls: Wall[]
  cabinets: CabinetInstance[]
  room: Room
  selectedId: string | null
  onSelectCabinet: (id: string) => void
  onEditCabinet: (id: string) => void
  onDeleteCabinet: (id: string) => void
  resolvedParts: Map<string, ResolvedCabinet>
}) {
  const [menu, setMenu] = useState<MenuState | null>(null)

  return (
    <div className="flex-1 relative" onContextMenu={e => e.preventDefault()}>
      <Canvas gl={{ antialias: true }} dpr={[1, 2]} style={{ background: '#e8e4de' }}>
        <Suspense fallback={null}>
          {walls.length > 0 && (
            <RoomScene
              walls={walls} cabinets={cabinets} room={room}
              selectedId={selectedId} onSelectCabinet={onSelectCabinet}
              onCabContextMenu={(cabId, x, y) => setMenu({ cabId, x, y })}
              resolvedParts={resolvedParts}
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
        Left-drag rotate · scroll zoom · right-drag pan · right-click cabinet for options
      </div>

      {menu && (
        <CabContextMenu
          x={menu.x} y={menu.y}
          onEdit={() => onEditCabinet(menu.cabId)}
          onDelete={() => onDeleteCabinet(menu.cabId)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
