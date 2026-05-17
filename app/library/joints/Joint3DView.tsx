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
const A_LEN  = 120
const B_HGT  = 90
const D      = 50   // panel depth (Z axis)
const FOV    = 32

// Colours
const COL_A      = '#374151'  // Part A panel
const COL_B      = '#1e3a5f'  // Part B panel
const COL_EDGE   = '#4b5563'
const COL_OP_A   = '#f59e0b'  // operations on Part A (amber)
const COL_OP_B   = '#60a5fa'  // operations on Part B (blue)
const COL_BG     = '#111827'

type MachineOp = 'drill' | 'route' | 'pocket' | 'saw'
type TargetPart = 'part_a' | 'part_b'

export interface JointOp3D {
  operation_order:  number
  target_part:      TargetPart
  machine_operation: MachineOp
  tool_diameter_mm: number
  depth_mm:         number
  offset_x_mm:      number
  offset_y_mm:      number
}

// ── Panel mesh ────────────────────────────────────────────────────────────────

function Panel({ cx, cy, cz, w, h, d, color }: {
  cx: number; cy: number; cz: number
  w: number;  h: number;  d: number
  color: string
}) {
  return (
    <mesh position={[cx, cy, cz]} castShadow>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.0} />
    </mesh>
  )
}

// ── Operation marker ──────────────────────────────────────────────────────────
// Shows as a sphere + depth cylinder indicating the operation entry point and direction.

function OpMarker({ x, y, z, radius, depthLen, axis, color }: {
  x: number; y: number; z: number
  radius: number; depthLen: number
  axis: 'y-' | 'x+' // y- = going into Part A from top; x+ = going into Part B from left
  color: string
}) {
  const cylLen  = Math.max(2, depthLen)
  const cylQuat = new THREE.Quaternion()
  if (axis === 'x+') {
    cylQuat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
  }
  const cylOffset = axis === 'y-'
    ? { dx: 0, dy: -(cylLen / 2), dz: 0 }
    : { dx: cylLen / 2, dy: 0,    dz: 0 }

  return (
    <group position={[x, y, z]}>
      {/* Entry point sphere */}
      <mesh>
        <sphereGeometry args={[radius, 12, 12]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.2} emissive={color} emissiveIntensity={0.25} />
      </mesh>
      {/* Depth cylinder */}
      <mesh position={[cylOffset.dx, cylOffset.dy, cylOffset.dz]} quaternion={cylQuat}>
        <cylinderGeometry args={[radius * 0.55, radius * 0.55, cylLen, 10]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.1} transparent opacity={0.55} />
      </mesh>
    </group>
  )
}

// ── Main 3D canvas ────────────────────────────────────────────────────────────

export default function Joint3DView({ ops, thickness }: {
  ops:       JointOp3D[]
  thickness: number   // panel thickness in mm (configurable)
}) {
  const t = thickness

  // Part A: horizontal shelf, right edge at X=0, top face at Y=0
  const partACX = -A_LEN / 2
  const partACY = -t / 2

  // Part B: vertical side, left face at X=0, bottom at Y=0 (touches Part A top)
  // Extends from Y=0 up to Y=B_HGT, plus downward through Part A thickness
  const partBTotalH = B_HGT + t
  const partBCX = t / 2
  const partBCY = (B_HGT - t) / 2  // = (B_HGT+t)/2 - t = B_HGT/2

  // Camera: look at the joint corner from front-right-above
  const sceneCX = (partACX)           // roughly centre of Part A
  const sceneCY = (partBCY)           // roughly centre of Part B
  const diag    = Math.sqrt((A_LEN + t) ** 2 + (B_HGT + t) ** 2 + D ** 2)
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

      {/* Part A — horizontal shelf */}
      <Panel cx={partACX} cy={partACY} cz={0} w={A_LEN} h={t} d={D} color={COL_A} />

      {/* Part B — vertical side */}
      <Panel cx={partBCX} cy={partBCY} cz={0} w={t} h={partBTotalH} d={D} color={COL_B} />

      {/* Edge outlines */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(A_LEN, t, D)]} />
        <lineBasicMaterial color={COL_EDGE} />
      </lineSegments>

      {/* Operation markers */}
      {ops.map((op, i) => {
        const r = Math.max(1.5, op.tool_diameter_mm / 2)
        const depth = Math.max(2, op.depth_mm)

        if (op.target_part === 'part_a') {
          // On Part A's top face (Y=0), coming from above (axis = y-)
          const mx = -op.offset_x_mm
          return (
            <OpMarker
              key={i}
              x={mx} y={0} z={0}
              radius={r} depthLen={depth}
              axis="y-"
              color={COL_OP_A}
            />
          )
        } else {
          // On Part B's left face (X=0), coming from left (axis = x+)
          const my = op.offset_y_mm
          return (
            <OpMarker
              key={i}
              x={0} y={my} z={0}
              radius={r} depthLen={depth}
              axis="x+"
              color={COL_OP_B}
            />
          )
        }
      })}

      {/* Ground shadow plane */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -t - 4, 0]}>
        <planeGeometry args={[1000, 1000]} />
        <shadowMaterial opacity={0.15} />
      </mesh>
    </Canvas>
  )
}
