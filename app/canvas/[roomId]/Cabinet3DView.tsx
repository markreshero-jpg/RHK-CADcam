'use client'

import { Suspense, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Edges } from '@react-three/drei'
import type { CabinetInstance } from '@/src/lib/types'
import type {
  ResolvedCabinet, ResolvedCasePart, ResolvedToekickPart,
  ResolvedInternalPart, ResolvedFaceZone,
} from '@/src/lib/resolver/types'

// ── Coordinate helpers ────────────────────────────────────────────────────────
// Cabinet origin = bottom-left-back corner (+X=right, +Y=up, +Z=front).
// Each helper returns { x,y,z (part origin), w (X extent), h (Y extent), d (Z extent) }.

function isSide(k: string) { return k === 'left_side' || k === 'right_side' }

function caseBox(p: ResolvedCasePart, cabDY: number) {
  if (isSide(p.part_key))
    return { x: p.X, y: p.Y, z: p.Z, w: p.DZ, h: p.DY, d: p.DX }
  if (p.part_key === 'back')
    return { x: p.X, y: p.Y + p.DZ, z: p.Z, w: p.DY, h: cabDY - p.Y - p.DZ, d: p.DZ }
  return { x: p.X, y: p.Y, z: p.Z, w: p.DY, h: p.DZ, d: p.DX }
}

function tkBox(p: ResolvedToekickPart) {
  return p.part_key === 'spreader_horizontal'
    ? { x: p.X, y: p.Y, z: p.Z, w: p.DX, h: p.DY, d: p.DZ }
    : { x: p.X, y: p.Y, z: p.Z, w: p.DY, h: p.DX, d: p.DZ }
}

function intBox(p: ResolvedInternalPart) {
  return { x: p.X, y: p.Y, z: p.Z, w: p.DY, h: p.DZ, d: p.DX }
}

function zoneBox(z: ResolvedFaceZone) {
  return { x: z.X, y: z.Y, z: z.Z, w: z.DY, h: z.DX, d: z.DZ }
}

type Box = { x: number; y: number; z: number; w: number; h: number; d: number }

// ── Part selection info ───────────────────────────────────────────────────────

interface PartInfo {
  id: string
  label: string
  w: number
  h: number
  d: number
  thickness: number
  material_id: string
  edge: { top: boolean; bottom: boolean; left: boolean; right: boolean }
  detail?: string
}

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

function buildCaseInfo(p: ResolvedCasePart, b: Box): PartInfo {
  return {
    id: `case_${p.part_key}`,
    label: CASE_LABELS[p.part_key] ?? p.part_key,
    w: b.w, h: b.h, d: b.d,
    thickness: p.DZ,
    material_id: p.material_id,
    edge: p.edge_band,
  }
}

function buildTkInfo(p: ResolvedToekickPart, b: Box): PartInfo {
  return {
    id: `tk_${p.part_key}_${p.sort_order}`,
    label: TK_LABELS[p.part_key] ?? p.part_key,
    w: b.w, h: b.h, d: b.d,
    thickness: p.DZ,
    material_id: p.material_id,
    edge: p.edge_band,
    detail: p.sort_order > 0 ? `#${p.sort_order}` : undefined,
  }
}

function buildIntInfo(p: ResolvedInternalPart, b: Box): PartInfo {
  return {
    id: `int_${p.part_type}_${p.sort_order}`,
    label: `${INT_LABELS[p.part_type] ?? p.part_type} ${p.sort_order + 1}`,
    w: b.w, h: b.h, d: b.d,
    thickness: p.DZ,
    material_id: p.material_id,
    edge: p.edge_band,
    detail: p.y_locked ? 'Position locked' : undefined,
  }
}

function buildZoneInfo(z: ResolvedFaceZone, b: Box): PartInfo {
  return {
    id: `zone_${z.row_index}_${z.col_index}`,
    label: FACE_LABELS[z.face_type] ?? z.face_type,
    w: b.w, h: b.h, d: b.d,
    thickness: z.DZ,
    material_id: z.material_id,
    edge: z.edge_band,
    detail: [
      `Row ${z.row_index + 1}, Col ${z.col_index + 1}`,
      z.hinge_side ? `Hinge: ${z.hinge_side}` : null,
    ].filter(Boolean).join(' · '),
  }
}

// ── Part mesh ─────────────────────────────────────────────────────────────────

function Part({
  b, color, edgeColor, info, selected, onSelect, dragRef,
}: {
  b: Box
  color: string
  edgeColor: string
  info: PartInfo
  selected: boolean
  onSelect: (info: PartInfo | null) => void
  dragRef: React.MutableRefObject<boolean>
}) {
  const [hovered, setHovered] = useState(false)

  const fill = selected ? '#f59e0b' : color
  const edge = selected ? '#92400e' : hovered ? '#f97316' : edgeColor

  return (
    <mesh
      position={[b.x + b.w / 2, b.y + b.h / 2, b.z + b.d / 2]}
      onPointerDown={() => { dragRef.current = false }}
      onPointerMove={(e) => { if (e.buttons) dragRef.current = true }}
      onClick={(e) => {
        e.stopPropagation()
        if (!dragRef.current) onSelect(selected ? null : info)
      }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
      onPointerOut={() => setHovered(false)}
    >
      <boxGeometry args={[b.w, b.h, b.d]} />
      <meshStandardMaterial color={fill} roughness={0.7} metalness={0.05} />
      <Edges threshold={10} color={edge} />
    </mesh>
  )
}

// ── Properties panel (overlay) ────────────────────────────────────────────────

function PartPropertiesPanel({ part, onClose }: { part: PartInfo; onClose: () => void }) {
  const edges = [
    part.edge.top    && 'Top',
    part.edge.bottom && 'Bottom',
    part.edge.left   && 'Left',
    part.edge.right  && 'Right',
  ].filter(Boolean) as string[]

  return (
    <div className="absolute top-3 right-3 w-56 bg-gray-900/95 border border-gray-700 rounded-lg shadow-xl pointer-events-auto select-none">
      <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-gray-700">
        <span className="text-sm font-semibold text-white">{part.label}</span>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white text-base leading-none ml-2"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="px-3 py-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <span className="text-gray-500">Width</span>
        <span className="text-gray-200 text-right">{Math.round(part.w)} mm</span>
        <span className="text-gray-500">Height</span>
        <span className="text-gray-200 text-right">{Math.round(part.h)} mm</span>
        <span className="text-gray-500">Depth</span>
        <span className="text-gray-200 text-right">{Math.round(part.d)} mm</span>
        <span className="text-gray-500">Thickness</span>
        <span className="text-gray-200 text-right">{Math.round(part.thickness)} mm</span>
        <span className="text-gray-500">Edge band</span>
        <span className="text-gray-200 text-right">{edges.length ? edges.join(' · ') : '—'}</span>
        {part.detail && (
          <>
            <span className="text-gray-500">Info</span>
            <span className="text-gray-200 text-right">{part.detail}</span>
          </>
        )}
      </div>
    </div>
  )
}

// ── Camera helpers ────────────────────────────────────────────────────────────

const FOV = 32

function fitCamDist(dx: number, dy: number, dz: number) {
  const halfDiag = Math.sqrt((dx / 2) ** 2 + (dy / 2) ** 2 + (dz / 2) ** 2)
  return (halfDiag / Math.tan((FOV / 2) * (Math.PI / 180))) * 1.3
}

// ── Cabinet scene (resolved data) ─────────────────────────────────────────────

function CabinetScene({
  cab, rp, selected, onSelect,
}: {
  cab: CabinetInstance
  rp: ResolvedCabinet
  selected: PartInfo | null
  onSelect: (info: PartInfo | null) => void
}) {
  const { dx, dy, dz } = cab
  const maxDim = Math.max(dx, dy, dz)
  const camDist = fitCamDist(dx, dy, dz)
  const dragRef = useRef(false)

  return (
    <>
      <PerspectiveCamera
        makeDefault
        fov={FOV}
        position={[camDist * 0.5, camDist * 0.35, camDist * 0.8]}
        near={1}
        far={200000}
      />
      <OrbitControls
        target={[0, 0, 0]}
        minDistance={maxDim * 0.4}
        maxDistance={maxDim * 6}
        enablePan
        enableDamping={false}
      />
      <ambientLight intensity={1.8} />
      <directionalLight position={[dx * 1.5, dy * 2, dz * 2]} intensity={1.6} />
      <directionalLight position={[-dx, dy * 0.5, -dz * 0.5]} intensity={0.6} color="#e8f0ff" />

      {/* Shift cabinet so bottom-left-back corner = (-dx/2, -dy/2, -dz/2) → centered at origin */}
      <group position={[-dx / 2, -dy / 2, -dz / 2]}>
        {rp.case_parts.map((p, i) => {
          const b = caseBox(p, dy)
          const info = buildCaseInfo(p, b)
          return (
            <Part
              key={`c${i}`}
              b={b}
              color="#ddd3bb"
              edgeColor="#b8a98e"
              info={info}
              selected={selected?.id === info.id}
              onSelect={onSelect}
              dragRef={dragRef}
            />
          )
        })}
        {rp.toekick_parts.map((p, i) => {
          const b = tkBox(p)
          const info = buildTkInfo(p, b)
          return (
            <Part
              key={`t${i}`}
              b={b}
              color="#78716c"
              edgeColor="#57534e"
              info={info}
              selected={selected?.id === info.id}
              onSelect={onSelect}
              dragRef={dragRef}
            />
          )
        })}
        {rp.internal_parts.map((p, i) => {
          const b = intBox(p)
          const info = buildIntInfo(p, b)
          return (
            <Part
              key={`s${i}`}
              b={b}
              color="#e8dece"
              edgeColor="#c4b49c"
              info={info}
              selected={selected?.id === info.id}
              onSelect={onSelect}
              dragRef={dragRef}
            />
          )
        })}
        {rp.face_zones.filter(z => z.face_type !== 'open').map((z, i) => {
          const b = zoneBox(z)
          const info = buildZoneInfo(z, b)
          const isDoor = z.face_type !== 'drawer_face'
          return (
            <Part
              key={`f${i}`}
              b={b}
              color={isDoor ? '#f0ebe0' : '#e2d9c8'}
              edgeColor="#b8a98e"
              info={info}
              selected={selected?.id === info.id}
              onSelect={onSelect}
              dragRef={dragRef}
            />
          )
        })}
      </group>
    </>
  )
}

// ── Fallback scene (no resolver data) ────────────────────────────────────────

function FallbackScene({ cab }: { cab: CabinetInstance }) {
  const { dx, dy, dz } = cab
  const maxDim = Math.max(dx, dy, dz)
  const camDist = fitCamDist(dx, dy, dz)
  return (
    <>
      <PerspectiveCamera
        makeDefault
        fov={FOV}
        position={[camDist * 0.5, camDist * 0.35, camDist * 0.8]}
        near={1}
        far={200000}
      />
      <OrbitControls
        target={[0, 0, 0]}
        minDistance={maxDim * 0.4}
        maxDistance={maxDim * 6}
        enablePan
        enableDamping={false}
      />
      <ambientLight intensity={1.8} />
      <directionalLight position={[dx, dy * 1.5, dz * 2]} intensity={1.6} />
      <mesh>
        <boxGeometry args={[dx, dy, dz]} />
        <meshStandardMaterial color="#ddd3bb" roughness={0.7} />
        <Edges threshold={10} color="#b8a98e" />
      </mesh>
    </>
  )
}

// ── Public component ─────────────────────────────────────────────────────────

export default function Cabinet3DView({ cab, rp }: { cab: CabinetInstance; rp?: ResolvedCabinet }) {
  const [selectedPart, setSelectedPart] = useState<PartInfo | null>(null)

  return (
    <div className="w-full h-full relative">
      <Canvas
        gl={{ antialias: true, preserveDrawingBuffer: false }}
        dpr={[1, 2]}
        style={{ background: '#e8e4de' }}
        onPointerMissed={() => setSelectedPart(null)}
        onContextMenu={(e) => { e.preventDefault(); setSelectedPart(null) }}
      >
        <Suspense fallback={null}>
          {rp
            ? <CabinetScene cab={cab} rp={rp} selected={selectedPart} onSelect={setSelectedPart} />
            : <FallbackScene cab={cab} />
          }
        </Suspense>
      </Canvas>

      {selectedPart && (
        <PartPropertiesPanel part={selectedPart} onClose={() => setSelectedPart(null)} />
      )}

      <div className="absolute bottom-2 left-3 text-[10px] text-gray-700 pointer-events-none select-none">
        Left-drag rotate · scroll zoom · right-drag pan · click part to inspect · click empty to deselect
      </div>
    </div>
  )
}
