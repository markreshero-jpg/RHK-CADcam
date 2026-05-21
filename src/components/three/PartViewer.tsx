'use client'

// ── Shared 3D Part Viewer ──────────────────────────────────────────────────────
// Provides reusable primitives for all builder preview panels:
//   Box, PanelKind, PartMeta, MatColSpec, MatColMap, EbSpec  (types)
//   panelFaceColors, edgeStrips, unpackMatCol, fitCamDist     (geometry helpers)
//   Part, PartPropertiesPanel, PreviewCanvas                  (components)

import { Suspense, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Edges } from '@react-three/drei'

// ── Types ──────────────────────────────────────────────────────────────────────

export type Box       = { x: number; y: number; z: number; w: number; h: number; d: number }
export type PanelKind = 'side' | 'horizontal' | 'face'
export type PartEdge  = { top: boolean; bottom: boolean; left: boolean; right: boolean }

export interface PartMeta {
  id:        string
  label:     string
  w:         number
  h:         number
  d:         number
  thickness: number
  edge:      PartEdge
  panelKind: PanelKind
  detail?:   string
  // Cabinet-space position & rotation (optional — only set when viewing resolved parts)
  x?:  number
  y?:  number
  z?:  number
  ax?: number
  ay?: number
  az?: number
}

export type MatColSpec = { face?: string; back?: string; edge?: string }
export type MatColMap  = Record<string, string | MatColSpec>
export type EbSpec     = { thick: number; color: string }

// ── Colour helpers ─────────────────────────────────────────────────────────────

export function unpackMatCol(spec: string | MatColSpec | undefined, fallback: string) {
  if (!spec) return { face: fallback, back: fallback, edge: fallback }
  if (typeof spec === 'string') return { face: spec, back: spec, edge: spec }
  return { face: spec.face ?? fallback, back: spec.back ?? fallback, edge: spec.edge ?? fallback }
}

// BoxGeometry face order: +X(0) -X(1) +Y(2) -Y(3) +Z(4) -Z(5)
// left_side / db_left_side: interior (face) is the +X face.
// right_side / db_right_side: interior is the -X face.
export function panelFaceColors(
  kind: PanelKind,
  partKey: string,
  face: string, back: string, edge: string,
): [string, string, string, string, string, string] {
  if (kind === 'side') {
    const isLeft = partKey === 'left_side' || partKey === 'db_left_side'
    return isLeft
      ? [face, back, edge, edge, edge, edge]
      : [back, face, edge, edge, edge, edge]
  }
  if (kind === 'horizontal') return [edge, edge, face, back, edge, edge]
  // 'face' kind: +Z = interior/visible face, -Z = back/wall face
  return [edge, edge, edge, edge, face, back]
}

// ── Edge strip geometry ────────────────────────────────────────────────────────

export function edgeStrips(
  b: Box,
  edge: PartEdge,
  kind: PanelKind,
  t: number,
): Array<{ pos: [number, number, number]; args: [number, number, number] }> {
  const out: Array<{ pos: [number, number, number]; args: [number, number, number] }> = []
  if (kind === 'side') {
    // w=thin(DZ), h=tall(DY), d=deep(DX)
    if (edge.top)    out.push({ pos: [b.x+b.w/2, b.y+b.h-t/2, b.z+b.d/2],   args: [b.w, t, b.d] })
    if (edge.bottom) out.push({ pos: [b.x+b.w/2, b.y+t/2,     b.z+b.d/2],   args: [b.w, t, b.d] })
    if (edge.left)   out.push({ pos: [b.x+b.w/2, b.y+b.h/2,   b.z+t/2],     args: [b.w, b.h, t] })
    if (edge.right)  out.push({ pos: [b.x+b.w/2, b.y+b.h/2,   b.z+b.d-t/2], args: [b.w, b.h, t] })
  } else if (kind === 'face') {
    // w=wide(DY), h=tall(DX), d=thin(DZ)
    if (edge.top)    out.push({ pos: [b.x+b.w/2,   b.y+b.h-t/2, b.z+b.d/2], args: [b.w, t, b.d] })
    if (edge.bottom) out.push({ pos: [b.x+b.w/2,   b.y+t/2,     b.z+b.d/2], args: [b.w, t, b.d] })
    if (edge.left)   out.push({ pos: [b.x+t/2,     b.y+b.h/2,   b.z+b.d/2], args: [t, b.h, b.d] })
    if (edge.right)  out.push({ pos: [b.x+b.w-t/2, b.y+b.h/2,   b.z+b.d/2], args: [t, b.h, b.d] })
  } else {
    // horizontal: w=wide(DY), h=thin(DZ), d=deep(DX)
    if (edge.top)    out.push({ pos: [b.x+b.w/2, b.y+b.h/2, b.z+b.d-t/2],   args: [b.w, b.h, t] })
    if (edge.bottom) out.push({ pos: [b.x+b.w/2, b.y+b.h/2, b.z+t/2],       args: [b.w, b.h, t] })
    if (edge.left)   out.push({ pos: [b.x+t/2,     b.y+b.h/2, b.z+b.d/2],   args: [t, b.h, b.d] })
    if (edge.right)  out.push({ pos: [b.x+b.w-t/2, b.y+b.h/2, b.z+b.d/2],   args: [t, b.h, b.d] })
  }
  return out
}

// ── Camera ─────────────────────────────────────────────────────────────────────

const FOV = 32

export function fitCamDist(dx: number, dy: number, dz: number) {
  const halfDiag = Math.sqrt((dx / 2) ** 2 + (dy / 2) ** 2 + (dz / 2) ** 2)
  return (halfDiag / Math.tan((FOV / 2) * (Math.PI / 180))) * 1.3
}

// ── Part mesh ──────────────────────────────────────────────────────────────────

export function Part({
  b, faceColors, edgeLineColor, meta, selected, highlighted, onSelect, dragRef, ebSpec,
  contextMenuSelect = false,
  wire = false,
}: {
  b:                  Box
  faceColors:         [string, string, string, string, string, string]
  edgeLineColor:      string
  meta:               PartMeta
  selected:           boolean
  highlighted:        boolean
  onSelect:           (meta: PartMeta | null) => void
  dragRef:            React.MutableRefObject<boolean>
  ebSpec?:            EbSpec
  contextMenuSelect?: boolean
  wire?:              boolean
}) {
  const [hovered, setHovered] = useState(false)

  if (wire) {
    return (
      <mesh position={[b.x + b.w / 2, b.y + b.h / 2, b.z + b.d / 2]}>
        <boxGeometry args={[b.w, b.h, b.d]} />
        <meshStandardMaterial color="#9ca3af" transparent opacity={0.08} depthWrite={false} />
        <Edges threshold={10} color="#94a3b8" linewidth={1} />
      </mesh>
    )
  }

  const SEL = '#f59e0b', HL = '#7dd3fc'
  const mats: [string, string, string, string, string, string] =
    selected    ? [SEL, SEL, SEL, SEL, SEL, SEL] :
    highlighted ? [HL,  HL,  HL,  HL,  HL,  HL]  :
    faceColors

  const edgeLine = selected    ? '#92400e'
                 : highlighted ? '#0284c7'
                 : hovered     ? '#ff6200'
                 : edgeLineColor
  const lineWidth = selected || highlighted ? 1.5 : hovered ? 2.5 : 1

  const strips = ebSpec && !selected && !highlighted
    ? edgeStrips(b, meta.edge, meta.panelKind, Math.max(1, ebSpec.thick))
    : []

  return (
    <>
      <mesh
        position={[b.x + b.w / 2, b.y + b.h / 2, b.z + b.d / 2]}
        onPointerDown={() => { dragRef.current = false }}
        onPointerMove={(e) => { if (e.buttons) dragRef.current = true }}
        onClick={contextMenuSelect ? undefined : (e) => { e.stopPropagation(); if (!dragRef.current) onSelect(selected ? null : meta) }}
        onContextMenu={contextMenuSelect ? (e) => { e.stopPropagation(); onSelect(meta) } : undefined}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[b.w, b.h, b.d]} />
        {mats.map((c, i) => (
          <meshStandardMaterial key={i} attach={`material-${i}`} color={c} roughness={0.7} metalness={0.05} />
        ))}
        <Edges threshold={10} color={edgeLine} linewidth={lineWidth} />
      </mesh>
      {strips.map((s, i) => (
        <mesh key={i} position={s.pos}>
          <boxGeometry args={s.args} />
          <meshStandardMaterial
            color={ebSpec!.color}
            roughness={0.35}
            metalness={0.0}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      ))}
    </>
  )
}

// ── Properties panel overlay ───────────────────────────────────────────────────

export function PartPropertiesPanel({
  part, onClose, onEdgeChange,
}: {
  part: PartMeta
  onClose: () => void
  onEdgeChange?: (edge: PartEdge) => void
}) {
  return (
    <div className="absolute top-3 right-3 w-56 bg-gray-900/95 border border-gray-700 rounded-lg shadow-xl pointer-events-auto select-none">
      <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-gray-700">
        <span className="text-sm font-semibold text-white">{part.label}</span>
        <button onClick={onClose} className="text-gray-500 hover:text-white text-base leading-none ml-2" aria-label="Close">✕</button>
      </div>
      <div className="px-3 py-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pb-0.5">Size</span>
        <span className="text-gray-500">Width</span>
        <span className="text-gray-200 text-right font-mono">{Math.round(part.w)} mm</span>
        <span className="text-gray-500">Height</span>
        <span className="text-gray-200 text-right font-mono">{Math.round(part.h)} mm</span>
        <span className="text-gray-500">Depth</span>
        <span className="text-gray-200 text-right font-mono">{Math.round(part.d)} mm</span>
        <span className="text-gray-500">Thickness</span>
        <span className="text-gray-200 text-right font-mono">{Math.round(part.thickness)} mm</span>
        {(part.x != null || part.y != null || part.z != null) && (
          <>
            <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pt-2 pb-0.5">Position</span>
            <span className="text-gray-500">X</span>
            <span className="text-gray-200 text-right font-mono">{Math.round(part.x ?? 0)} mm</span>
            <span className="text-gray-500">Y</span>
            <span className="text-gray-200 text-right font-mono">{Math.round(part.y ?? 0)} mm</span>
            <span className="text-gray-500">Z</span>
            <span className="text-gray-200 text-right font-mono">{Math.round(part.z ?? 0)} mm</span>
          </>
        )}
        {(part.ax != null || part.ay != null || part.az != null) && (
          (part.ax !== 0 || part.ay !== 0 || part.az !== 0) && <>
            <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pt-2 pb-0.5">Rotation</span>
            {part.ax !== 0 && <><span className="text-gray-500">AX</span><span className="text-gray-200 text-right font-mono">{part.ax}°</span></>}
            {part.ay !== 0 && <><span className="text-gray-500">AY</span><span className="text-gray-200 text-right font-mono">{part.ay}°</span></>}
            {part.az !== 0 && <><span className="text-gray-500">AZ</span><span className="text-gray-200 text-right font-mono">{part.az}°</span></>}
          </>
        )}
        <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pt-2 pb-0.5">Edge band</span>
        <span className="col-span-2">
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            {(['top', 'bottom', 'left', 'right'] as const).map(e => (
              <label key={e} className="flex items-center gap-1.5 cursor-pointer text-gray-400 hover:text-gray-200">
                <input
                  type="checkbox"
                  checked={part.edge[e]}
                  onChange={() => onEdgeChange?.({ ...part.edge, [e]: !part.edge[e] })}
                  disabled={!onEdgeChange}
                  className="accent-orange-500 cursor-pointer w-3 h-3"
                />
                <span className="text-[10px] capitalize">{e === 'bottom' ? 'bot' : e}</span>
              </label>
            ))}
          </div>
        </span>
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

// ── PreviewCanvas ──────────────────────────────────────────────────────────────
// Standard Canvas + camera + lighting + OrbitControls.
// Pass scene geometry as children; overlays (panels, tooltips) via overlay prop.

export function PreviewCanvas({
  dx, dy, dz,
  bgColor = '#111827',
  enablePan = false,
  onDeselect,
  onContextMenu,
  overlay,
  hint,
  children,
}: {
  dx:             number
  dy:             number
  dz:             number
  bgColor?:       string
  enablePan?:     boolean
  onDeselect?:    () => void
  onContextMenu?: (e: React.MouseEvent) => void
  overlay?:       React.ReactNode
  hint?:          string
  children?:      React.ReactNode
}) {
  const maxDim  = Math.max(dx, dy, dz)
  const camDist = fitCamDist(dx, dy, dz)

  return (
    <div className="w-full h-full relative">
      <Canvas
        gl={{ antialias: true, preserveDrawingBuffer: false }}
        dpr={[1, 2]}
        style={{ width: '100%', height: '100%', background: bgColor }}
        onPointerMissed={onDeselect}
        onContextMenu={onContextMenu ?? (e => { e.preventDefault(); onDeselect?.() })}
      >
        <PerspectiveCamera
          makeDefault
          fov={FOV}
          position={[camDist * 0.5, camDist * 0.35, camDist * 0.8]}
          near={1}
          far={camDist * 10}
        />
        <OrbitControls
          target={[0, 0, 0]}
          minDistance={maxDim * 0.4}
          maxDistance={maxDim * 6}
          enablePan={enablePan}
          enableDamping={false}
        />
        <ambientLight intensity={1.8} />
        <directionalLight position={[dx * 1.5, dy * 2, dz * 2]} intensity={1.6} />
        <directionalLight position={[-dx, dy * 0.5, -dz * 0.5]} intensity={0.6} color="#e8f0ff" />
        <Suspense fallback={null}>
          {children}
        </Suspense>
      </Canvas>
      {overlay}
      <div className="absolute bottom-2 left-3 text-[10px] text-gray-600 pointer-events-none select-none">
        {hint ?? `Left-drag rotate · scroll zoom${enablePan ? ' · right-drag pan' : ''} · click part to inspect · click empty to deselect`}
      </div>
    </div>
  )
}
