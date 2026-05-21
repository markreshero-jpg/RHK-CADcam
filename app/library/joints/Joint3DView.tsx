'use client'

import { useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'

// ── Scene constants (mm, R3F units = mm) ──────────────────────────────────────
// Part A (shelf-like): horizontal panel, right end at X=0, top face at Y=0.
// Part B (side-like):  vertical panel,  left face at X=0, bottom at Y=0.
// Joint reference point = (0, 0, 0).

const THICK  = 18
const FOV    = 32

// Colours
const COL_A      = '#374151'  // Part A panel
const COL_B      = '#1e3a5f'  // Part B panel
const COL_EDGE   = '#4b5563'
const COL_OP_A   = '#f59e0b'  // operations on Part A (amber)
const COL_OP_B   = '#60a5fa'  // operations on Part B (blue)
const COL_BG     = '#111827'

type MachineOp  = 'drill' | 'route' | 'pocket' | 'saw'
type TargetPart = 'part_a' | 'part_b'
type FaceType   = 'normal' | 'end' | 'top' | 'bottom'
type DrillAxis  = 'x-' | 'x+' | 'y-' | 'y+'

export interface JointOp3D {
  id:                string
  operation_order:   number
  target_part:       TargetPart
  machine_operation: MachineOp
  face:              FaceType
  tool_diameter_mm:  number
  depth_mm:          number
  offset_x_mm:       number
  offset_y_mm:       number
  offset_z_mm:       number
}

// Returns the 3D entry point and drill axis for an operation based on its face.
// Part A: horizontal shelf, right end at X=0, top face at Y=0.
// Part B: vertical side,  left face at X=0, bottom at Y=-slaveDy.
// Offset interpretation:
//   X-drill faces (normal/end): offset_y=Y on face, offset_z=from front; offset_x=X inset
//   Y-drill faces (top/bottom): offset_x=X position, offset_z=from front; offset_y unused
function opPlacement(
  op: JointOp3D,
  t: number, masterW: number, masterDx: number,
  slaveL: number, slaveDy: number, depth: number,
): { x: number; y: number; z: number; axis: DrillAxis } {
  const oz = depth / 2 - op.offset_z_mm
  if (op.target_part === 'part_a') {
    switch (op.face) {
      case 'end':    return { x: -(masterW - masterDx),  y: -op.offset_y_mm, z: oz, axis: 'x+' }
      case 'top':    return { x: -op.offset_x_mm,        y: 0,               z: oz, axis: 'y-' }
      case 'bottom': return { x: -op.offset_x_mm,        y: -t,              z: oz, axis: 'y+' }
      default:       return { x: -op.offset_x_mm,        y: -op.offset_y_mm, z: oz, axis: 'x-' }
    }
  } else {
    switch (op.face) {
      case 'end':    return { x: t,              y: -op.offset_y_mm,  z: oz, axis: 'x-' }
      case 'top':    return { x: op.offset_x_mm, y: slaveL - slaveDy, z: oz, axis: 'y-' }
      case 'bottom': return { x: op.offset_x_mm, y: -slaveDy,         z: oz, axis: 'y+' }
      default:       return { x: op.offset_x_mm, y: -op.offset_y_mm,  z: oz, axis: 'x+' }
    }
  }
}

// ── Panel mesh ────────────────────────────────────────────────────────────────

function Panel({ cx, cy, cz, w, h, d, color, wire }: {
  cx: number; cy: number; cz: number
  w: number;  h: number;  d: number
  color: string
  wire?: boolean
}) {
  const geo = new THREE.BoxGeometry(w, h, d)
  return (
    <group position={[cx, cy, cz]}>
      <mesh>
        <primitive object={geo} attach="geometry" />
        <meshStandardMaterial
          color={color}
          roughness={0.6}
          metalness={wire ? 0.0 : 0.0}
          transparent={wire}
          opacity={wire ? 0.12 : 1}
          depthWrite={!wire}
          side={wire ? THREE.DoubleSide : THREE.FrontSide}
        />
      </mesh>
      {wire && (
        <lineSegments>
          <edgesGeometry args={[geo]} />
          <lineBasicMaterial color={color} />
        </lineSegments>
      )}
    </group>
  )
}

// ── Operation marker ──────────────────────────────────────────────────────────
// Shows as a red crosshair + depth cylinder indicating the operation entry point and direction.

function CrosshairLines({ size, color }: { size: number; color: string }) {
  const mat = new THREE.LineBasicMaterial({ color })
  const axes: [THREE.Vector3, THREE.Vector3][] = [
    [new THREE.Vector3(-size, 0, 0), new THREE.Vector3(size, 0, 0)],
    [new THREE.Vector3(0, -size, 0), new THREE.Vector3(0, size, 0)],
    [new THREE.Vector3(0, 0, -size), new THREE.Vector3(0, 0, size)],
  ]
  return (
    <>
      {axes.map(([a, b], i) => {
        const geo = new THREE.BufferGeometry().setFromPoints([a, b])
        return <primitive key={i} object={new THREE.Line(geo, mat)} />
      })}
    </>
  )
}

function OpMarker({ x, y, z, radius, depthLen, axis, color }: {
  x: number; y: number; z: number
  radius: number; depthLen: number
  axis: DrillAxis
  color: string
}) {
  const cylLen  = Math.max(2, depthLen)
  const cylQuat = new THREE.Quaternion()
  let dx = 0, dy = 0

  if (axis === 'x-' || axis === 'x+') {
    cylQuat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
    dx = axis === 'x-' ? -(cylLen / 2) : (cylLen / 2)
  } else {
    // Y axis — Three.js CylinderGeometry is already Y-aligned, no rotation needed
    dy = axis === 'y-' ? -(cylLen / 2) : (cylLen / 2)
  }

  return (
    <group position={[x, y, z]}>
      <CrosshairLines size={radius * 2} color="#ef4444" />
      <mesh position={[dx, dy, 0]} quaternion={cylQuat}>
        <cylinderGeometry args={[radius * 0.55, radius * 0.55, cylLen, 10]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.1} transparent opacity={0.55} />
      </mesh>
    </group>
  )
}

// ── Main 3D canvas ────────────────────────────────────────────────────────────

const DEG = Math.PI / 180

export default function Joint3DView({ ops, thickness, wire = false,
  masterW = 120, masterDx = 0,
  slaveL = 250,  slaveDy = 18,
  depth = 50,
  selOpId = null,
  jointRx = 0, jointRy = 0, jointRz = 0,
}: {
  ops:       JointOp3D[]
  thickness: number
  wire?:     boolean
  masterW?:  number
  masterDx?: number
  slaveL?:   number
  slaveDy?:  number
  depth?:    number
  selOpId?:  string | null
  jointRx?:  number
  jointRy?:  number
  jointRz?:  number
}) {
  const t = thickness

  // Part A: extends from X=-(masterW-masterDx) to X=+masterDx, Y=-t to Y=0
  const partACX = masterDx - masterW / 2
  const partACY = -t / 2

  // Part B: extends from Y=-slaveDy to Y=(slaveL-slaveDy), X=0 to X=t
  const partBCX = t / 2
  const partBCY = slaveL / 2 - slaveDy

  // Camera: frame both parts
  const sceneCX = partACX
  const sceneCY = partBCY
  const diag    = Math.sqrt(masterW ** 2 + slaveL ** 2 + depth ** 2)
  const camD    = (diag / Math.tan((FOV / 2) * (Math.PI / 180))) * 0.65

  const dragRef = useRef(false)

  return (
    <Canvas
      gl={{ antialias: true }}
      dpr={[1, 2]}
      style={{ width: '100%', height: '100%', background: COL_BG }}
      shadows
    >
      <PerspectiveCamera
        makeDefault fov={FOV}
        position={[sceneCX + camD * 0.4, sceneCY + camD * 0.35, camD * 0.85]}
        near={1} far={4000}
      />
      <OrbitControls
        target={[sceneCX, sceneCY * 0.5, 0]}
        enablePan={true}
        onStart={() => { dragRef.current = true }}
      />

      {/* Lighting */}
      <ambientLight intensity={0.65} />
      <directionalLight position={[200, 300, 200]} intensity={1.1} castShadow />
      <directionalLight position={[-150, 100, -100]} intensity={0.35} />

      {/* Joint assembly — rotatable as a unit */}
      <group rotation={[jointRx * DEG, jointRy * DEG, jointRz * DEG]}>
        {/* Part A — horizontal shelf */}
        <Panel cx={partACX} cy={partACY} cz={0} w={masterW} h={t} d={depth} color={COL_A} wire={wire} />

        {/* Part B — vertical side */}
        <Panel cx={partBCX} cy={partBCY} cz={0} w={t} h={slaveL} d={depth} color={COL_B} wire={wire} />

        {/* Joint zone — flat outline rectangle at the joint reference plane (X=0) */}
        <group position={[0, -t / 2, 0]}>
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(0.1, t, depth)]} />
            <lineBasicMaterial color="#34d399" opacity={0.65} transparent />
          </lineSegments>
        </group>

        {/* Operation markers */}
        {ops.map((op, i) => {
          const sel   = op.id === selOpId
          const r     = Math.max(1.5, op.tool_diameter_mm / 2) * (sel ? 1.45 : 1)
          const color = op.target_part === 'part_a'
            ? (sel ? '#fcd34d' : COL_OP_A)
            : (sel ? '#93c5fd' : COL_OP_B)
          const { x, y, z, axis } = opPlacement(op, t, masterW, masterDx, slaveL, slaveDy, depth)
          return (
            <OpMarker key={i} x={x} y={y} z={z}
              radius={r} depthLen={Math.max(2, op.depth_mm)}
              axis={axis} color={color} />
          )
        })}
      </group>

      {/* Ground shadow plane */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -(t + slaveDy) - 4, 0]}>
        <planeGeometry args={[1000, 1000]} />
        <shadowMaterial opacity={0.15} />
      </mesh>
    </Canvas>
  )
}
