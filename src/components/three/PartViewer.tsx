'use client'

// ── Shared 3D Part Viewer ──────────────────────────────────────────────────────
// Provides reusable primitives for all builder preview panels:
//   Box, PanelKind, PartMeta, MatColSpec, MatColMap, EbSpec  (types)
//   panelFaceColors, edgeStrips, unpackMatCol, fitCamDist     (geometry helpers)
//   Part, PartPropertiesPanel, PreviewCanvas                  (components)

import { Suspense, useState, useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, OrthographicCamera, Edges, Line } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Geometry, Base, Subtraction } from '@react-three/csg'
import { getUserPrefs } from '@/src/lib/userPrefs'
import { fmtMm, roundMm } from '@/src/lib/format'
import { evalCalc } from '@/src/lib/calc'

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
  comment?:  string
  // Material the part is cut from — lets downstream views (e.g. the Part Editor)
  // resolve its edge-band spec from ebByMatId. Optional: not every meta sets it.
  materialId?: string
  // Cabinet-space position & rotation (optional — only set when viewing resolved parts)
  x?:  number
  y?:  number
  z?:  number
  ax?: number
  ay?: number
  az?: number
  // Front faces (door / drawer front / false panel) resolve with DX = width and
  // DY = height, i.e. already upright. The Part Editor reads this to lay the part
  // out without the height→DX display swap it applies to other non-side panels.
  // Ignored by 3D rendering — purely an editor hint.
  dxIsWidth?: boolean
}

export type MatColSpec = { face?: string; back?: string; edge?: string }
export type MatColMap  = Record<string, string | MatColSpec>
export type EbSpec     = { thick: number; color: string }

// ── Colour helpers ─────────────────────────────────────────────────────────────

export function unpackMatCol(spec: string | MatColSpec | undefined, fallback: string) {
  if (!spec) return { face: fallback, back: fallback, edge: fallback }
  if (typeof spec === 'string') return { face: spec, back: spec, edge: spec }
  const face = spec.face ?? fallback
  // Preserve the material's configured core/edge colour. Edgebanded edges are
  // separate strip meshes with their own EbSpec colour, so replacing this with
  // the face colour makes unbanded edges turn white and hides which edges have
  // tape applied. Fall back to the face only when no edge colour is configured.
  return { face, back: spec.back ?? fallback, edge: spec.edge ?? face }
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

// Stored boxes are the FINISHED overall size, including edge tape. The board core
// is therefore inset by one tape thickness on every banded edge and the strips
// occupy that inset space. Removing a band grows the core back to the finished
// outline without changing the part's overall dimensions.
export function edgeCoreBox(b: Box, edge: PartEdge, kind: PanelKind, t: number): Box {
  const lt = edge.left ? t : 0, rt = edge.right ? t : 0
  const bt = edge.bottom ? t : 0, tt = edge.top ? t : 0
  if (kind === 'side') return {
    ...b, y: b.y + bt, z: b.z + lt,
    h: Math.max(0, b.h - bt - tt), d: Math.max(0, b.d - lt - rt),
  }
  if (kind === 'face') return {
    ...b, x: b.x + lt, y: b.y + bt,
    w: Math.max(0, b.w - lt - rt), h: Math.max(0, b.h - bt - tt),
  }
  return {
    ...b, x: b.x + lt, z: b.z + bt,
    w: Math.max(0, b.w - lt - rt), d: Math.max(0, b.d - bt - tt),
  }
}

export function edgeStrips(
  b: Box,
  edge: PartEdge,
  kind: PanelKind,
  t: number,
): Array<{ pos: [number, number, number]; args: [number, number, number] }> {
  const out: Array<{ pos: [number, number, number]; args: [number, number, number] }> = []
  const bt = edge.bottom ? t : 0, tt = edge.top ? t : 0
  if (kind === 'side') {
    // w=thin(DZ), h=tall(DY), d=deep(DX); left=back(−Z), right=front(+Z)
    if (edge.top)    out.push({ pos: [b.x+b.w/2, b.y+b.h-t/2, b.z+b.d/2], args: [b.w, t, b.d] })
    if (edge.bottom) out.push({ pos: [b.x+b.w/2, b.y+t/2,     b.z+b.d/2], args: [b.w, t, b.d] })
    if (edge.left)   out.push({ pos: [b.x+b.w/2, b.y+bt+(b.h-bt-tt)/2, b.z+t/2],     args: [b.w, Math.max(0, b.h-bt-tt), t] })
    if (edge.right)  out.push({ pos: [b.x+b.w/2, b.y+bt+(b.h-bt-tt)/2, b.z+b.d-t/2], args: [b.w, Math.max(0, b.h-bt-tt), t] })
  } else if (kind === 'face') {
    // w=wide(DY), h=tall(DX), d=thin(DZ)
    if (edge.top)    out.push({ pos: [b.x+b.w/2, b.y+b.h-t/2, b.z+b.d/2], args: [b.w, t, b.d] })
    if (edge.bottom) out.push({ pos: [b.x+b.w/2, b.y+t/2,     b.z+b.d/2], args: [b.w, t, b.d] })
    if (edge.left)   out.push({ pos: [b.x+t/2,     b.y+bt+(b.h-bt-tt)/2, b.z+b.d/2], args: [t, Math.max(0, b.h-bt-tt), b.d] })
    if (edge.right)  out.push({ pos: [b.x+b.w-t/2, b.y+bt+(b.h-bt-tt)/2, b.z+b.d/2], args: [t, Math.max(0, b.h-bt-tt), b.d] })
  } else {
    // horizontal: w=wide(DY), h=thin(DZ), d=deep(DX); top=front(+Z), bottom=back(−Z)
    if (edge.top)    out.push({ pos: [b.x+b.w/2, b.y+b.h/2, b.z+b.d-t/2], args: [b.w, b.h, t] })
    if (edge.bottom) out.push({ pos: [b.x+b.w/2, b.y+b.h/2, b.z+t/2],     args: [b.w, b.h, t] })
    if (edge.left)   out.push({ pos: [b.x+t/2,     b.y+b.h/2, b.z+bt+(b.d-bt-tt)/2], args: [t, b.h, Math.max(0, b.d-bt-tt)] })
    if (edge.right)  out.push({ pos: [b.x+b.w-t/2, b.y+b.h/2, b.z+bt+(b.d-bt-tt)/2], args: [t, b.h, Math.max(0, b.d-bt-tt)] })
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
  rotation,
  onPartContextMenu,
  subtractions,
  hoverHighlight = true,
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
  rotation?:          [number, number, number]
  onPartContextMenu?: (meta: PartMeta, clientX: number, clientY: number) => void
  // Cabinet-space pocket boxes to CSG-subtract (real recesses). When present the
  // panel renders as a single material colour — CSG can't keep the 6 per-face
  // colours (three-bvh-csg collapses them), which is an accepted trade-off.
  subtractions?:      { center: [number, number, number]; size: [number, number, number] }[]
  // When false, the panel shows no hover edge highlight (used by the Part Editor,
  // where the single part is the whole scene and the orange hover line is noise).
  hoverHighlight?:    boolean
}) {
  const [hovered, setHovered] = useState(false)

  // Rotation pivots about the part's reference point (origin corner b.x/b.y/b.z):
  // the group sits at that corner and carries the rotation, while children are
  // positioned relative to it. With no rotation this is identical to placing the
  // mesh at the box centre.
  if (wire) {
    return (
      <group position={[b.x, b.y, b.z]} rotation={rotation}>
        <mesh position={[b.w / 2, b.h / 2, b.d / 2]}>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial color="#9ca3af" transparent opacity={0.08} depthWrite={false} />
          <Edges threshold={10} color="#94a3b8" linewidth={1} />
        </mesh>
      </group>
    )
  }

  const SEL = '#f59e0b', HL = '#7dd3fc'
  const mats: [string, string, string, string, string, string] =
    selected    ? [SEL, SEL, SEL, SEL, SEL, SEL] :
    highlighted ? [HL,  HL,  HL,  HL,  HL,  HL]  :
    faceColors

  const hov = hoverHighlight && hovered
  const edgeLine = selected    ? '#92400e'
                 : highlighted ? '#0284c7'
                 : hov         ? '#ff6200'
                 : edgeLineColor
  const lineWidth = selected || highlighted ? 1.5 : hov ? 2.5 : 1

  const tapeT = ebSpec ? Math.max(0, ebSpec.thick) : 0
  const strips = ebSpec ? edgeStrips(b, meta.edge, meta.panelKind, tapeT) : []
  const core = ebSpec ? edgeCoreBox(b, meta.edge, meta.panelKind, tapeT) : b

  return (
    <group position={[b.x, b.y, b.z]} rotation={rotation}>
      <mesh
        position={[core.x - b.x + core.w / 2, core.y - b.y + core.h / 2, core.z - b.z + core.d / 2]}
        onPointerDown={() => { dragRef.current = false }}
        onPointerMove={(e) => { if (e.buttons) dragRef.current = true }}
        onClick={contextMenuSelect ? undefined : (e) => { e.stopPropagation(); if (!dragRef.current) onSelect(selected ? null : meta) }}
        onContextMenu={(contextMenuSelect || onPartContextMenu) ? (e) => {
          e.stopPropagation()
          if (contextMenuSelect) onSelect(meta)
          if (onPartContextMenu) {
            const ne = e.nativeEvent as MouseEvent
            onPartContextMenu(meta, ne.clientX, ne.clientY)
          }
        } : undefined}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
        onPointerOut={() => setHovered(false)}
      >
        {subtractions && subtractions.length > 0 ? (
          // Real recesses cut into the panel. Single material (CSG can't keep the
          // 6 face colours); the mesh sits at the box centre, so localise each
          // pocket by the box centre in cabinet space.
          <>
            <Geometry>
              <Base>
                <boxGeometry args={[core.w, core.h, core.d]} />
              </Base>
              {subtractions.map((s, i) => (
                <Subtraction key={i} position={[s.center[0] - (core.x + core.w / 2), s.center[1] - (core.y + core.h / 2), s.center[2] - (core.z + core.d / 2)]}>
                  <boxGeometry args={s.size} />
                </Subtraction>
              ))}
            </Geometry>
            <meshStandardMaterial color={mats[0]} roughness={0.7} metalness={0.05} />
            <Edges threshold={10} color={edgeLine} linewidth={lineWidth} />
          </>
        ) : (
          <>
            <boxGeometry args={[core.w, core.h, core.d]} />
            {mats.map((c, i) => (
              <meshStandardMaterial key={i} attach={`material-${i}`} color={c} roughness={0.7} metalness={0.05} />
            ))}
            <Edges threshold={10} color={edgeLine} linewidth={lineWidth} />
          </>
        )}
      </mesh>
      {strips.map((s, i) => (
        <mesh key={i} position={[s.pos[0] - b.x, s.pos[1] - b.y, s.pos[2] - b.z]}>
          <boxGeometry args={s.args} />
          <meshStandardMaterial color={ebSpec!.color} roughness={0.35} metalness={0.0} />
          {/* Faint black outline so the tape reads as a separate strip on the panel */}
          <Edges threshold={10} color="#1a1a1a" linewidth={1} />
        </mesh>
      ))}
    </group>
  )
}

// ── Properties panel overlay ───────────────────────────────────────────────────

// One editable size cell — accepts a number or a calc ("100+100" → 200);
// commits on Enter / blur, reverts on Escape or invalid input.
function SizeField({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(roundMm(value)))
  useEffect(() => { setDraft(String(roundMm(value))) }, [value])
  function commit() {
    const v = evalCalc(draft)
    if (v != null && v > 0 && Math.abs(v - value) > 1e-6) onCommit(v)
    else setDraft(String(roundMm(value)))
  }
  return (
    <input
      type="text" inputMode="decimal" value={draft}
      onChange={e => setDraft(e.target.value)}
      onFocus={e => e.target.select()}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(String(roundMm(value))); e.currentTarget.blur() } }}
      className="w-16 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-right font-mono text-gray-100 focus:outline-none focus:border-blue-500"
    />
  )
}

// Which resolver axis each displayed dimension (w/h/d) corresponds to, so the
// panel can annotate Width/Height/Depth with DX/DY/DZ. Mirrors the *Box() world
// mappings: side → w=DZ,h=DY,d=DX; horizontal → w=DY,h=DZ,d=DX; face → depends on
// whether the part resolves upright (front zones: DX=width) or not (carcase back:
// DX=height). Thickness is always DZ. (Toekick horizontal spreaders are the one
// part whose box maps w=DX — a rare edge case not worth special-casing here.)
function dimAxes(kind: PanelKind, dxIsWidth?: boolean): { w: string; h: string; d: string } {
  if (kind === 'side')       return { w: 'DZ', h: 'DY', d: 'DX' }
  if (kind === 'horizontal') return { w: 'DY', h: 'DZ', d: 'DX' }
  return dxIsWidth ? { w: 'DX', h: 'DY', d: 'DZ' } : { w: 'DY', h: 'DX', d: 'DZ' }
}

export function PartPropertiesPanel({
  part, onClose, onEdgeChange, onSizeChange, actions, jointControls, ebThickness,
}: {
  part: PartMeta
  onClose: () => void
  onEdgeChange?: (edge: PartEdge) => void
  onSizeChange?: (dim: 'w' | 'h' | 'd', value: number) => void
  actions?: React.ReactNode
  jointControls?: React.ReactNode
  // Tape thickness (mm) of this part's edgeband, when known — enables the
  // "include edge banding in overall part size" user pref (off = show cut size).
  ebThickness?: number
}) {
  // Stored dims are the FINISHED size (incl. banding). With the pref off, show
  // the CUT (board) size instead: tape deducted per banded edge along the axes
  // that edge shrinks (per panelKind, matching edgeStrips). Editable sizes
  // (onSizeChange) always operate on the stored finished dims, so the cut
  // display is suppressed there to avoid committing deducted values.
  const showCut = !!ebThickness && !onSizeChange && !getUserPrefs().includeBandingInPartSize
    && (part.edge.top || part.edge.bottom || part.edge.left || part.edge.right)
  let disp = { w: part.w, h: part.h, d: part.d }
  if (showCut) {
    const t = ebThickness!
    const tb = (part.edge.top ? t : 0) + (part.edge.bottom ? t : 0)
    const lr = (part.edge.left ? t : 0) + (part.edge.right ? t : 0)
    disp = part.panelKind === 'side'
      ? { w: part.w, h: part.h - tb, d: part.d - lr }
      : part.panelKind === 'face'
      ? { w: part.w - lr, h: part.h - tb, d: part.d }
      : { w: part.w - lr, h: part.h, d: part.d - tb }   // horizontal
  }
  const ax = dimAxes(part.panelKind, part.dxIsWidth)
  return (
    <div className="absolute top-3 right-3 w-56 bg-gray-900/95 border border-gray-700 rounded-lg shadow-xl pointer-events-auto select-none" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-gray-700">
        <span className="text-sm font-semibold text-white">{part.label}</span>
        <button onClick={onClose} className="text-gray-500 hover:text-white text-base leading-none ml-2" aria-label="Close">✕</button>
      </div>
      <div className="px-3 py-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pb-0.5">
          Size{onSizeChange ? <span className="text-gray-700 normal-case tracking-normal"> · editable</span> : null}
          {showCut ? <span className="text-amber-500/80 normal-case tracking-normal"> · cut (banding deducted)</span> : null}
        </span>
        <span className="text-gray-500 self-center">Width <span className="text-gray-600 text-[10px]">({ax.w})</span></span>
        {onSizeChange
          ? <span className="text-right"><SizeField value={part.w} onCommit={v => onSizeChange('w', v)} /> <span className="text-gray-600 text-[10px]">mm</span></span>
          : <span className="text-gray-200 text-right font-mono">{fmtMm(disp.w)} mm</span>}
        <span className="text-gray-500 self-center">Height <span className="text-gray-600 text-[10px]">({ax.h})</span></span>
        {onSizeChange
          ? <span className="text-right"><SizeField value={part.h} onCommit={v => onSizeChange('h', v)} /> <span className="text-gray-600 text-[10px]">mm</span></span>
          : <span className="text-gray-200 text-right font-mono">{fmtMm(disp.h)} mm</span>}
        <span className="text-gray-500 self-center">Depth <span className="text-gray-600 text-[10px]">({ax.d})</span></span>
        {onSizeChange
          ? <span className="text-right"><SizeField value={part.d} onCommit={v => onSizeChange('d', v)} /> <span className="text-gray-600 text-[10px]">mm</span></span>
          : <span className="text-gray-200 text-right font-mono">{fmtMm(disp.d)} mm</span>}
        {/* Thickness is always DZ; on a face part Depth already IS DZ, so skip the
            duplicate row and only show it when Depth is a different axis. */}
        {ax.d !== 'DZ' && <>
          <span className="text-gray-500">Thickness <span className="text-gray-600 text-[10px]">(DZ)</span></span>
          <span className="text-gray-200 text-right font-mono">{fmtMm(part.thickness)} mm</span>
        </>}
        {(part.x != null || part.y != null || part.z != null) && (
          <>
            <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pt-2 pb-0.5">Position</span>
            <span className="text-gray-500">X</span>
            <span className="text-gray-200 text-right font-mono">{fmtMm(part.x ?? 0)} mm</span>
            <span className="text-gray-500">Y</span>
            <span className="text-gray-200 text-right font-mono">{fmtMm(part.y ?? 0)} mm</span>
            <span className="text-gray-500">Z</span>
            <span className="text-gray-200 text-right font-mono">{fmtMm(part.z ?? 0)} mm</span>
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
        {jointControls && (
          <>
            <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pt-2 pb-0.5">Edge joints (drilling)</span>
            <span className="col-span-2">{jointControls}</span>
          </>
        )}
        {part.detail && (
          <>
            <span className="text-gray-500">Info</span>
            <span className="text-gray-200 text-right">{part.detail}</span>
          </>
        )}
        {part.comment && (
          <>
            <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pt-2 pb-0.5">Comment</span>
            <span className="text-amber-300 col-span-2 text-[11px] leading-snug whitespace-pre-wrap">{part.comment}</span>
          </>
        )}
      </div>
      {actions && (
        <div className="border-t border-gray-700 px-3 py-2">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-500">Actions</span>
          <div className="mt-1.5 flex flex-col gap-1">
            {actions}
          </div>
        </div>
      )}
    </div>
  )
}

// ── View modes (3D + orthographic) ──────────────────────────────────────────────
// The scene is centred on the origin by callers (geometry translated by
// −extent/2), and OrbitControls targets [0,0,0]. So each ortho camera simply
// looks down one axis toward the origin. NET NEW for the Part Editor (ortho
// Top/Front/Side); the legacy perspective path is unchanged.

export type ViewMode = '3d' | 'top' | 'front' | 'side'

export const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: '3d',    label: '3D'    },
  { id: 'top',   label: 'Top'   },
  { id: 'front', label: 'Front' },
  { id: 'side',  label: 'Side'  },
]

// Orthographic camera that fits the dx×dy×dz bounding box for the chosen view.
// drei derives the frustum from the canvas pixel size, so fit = pixels / world.
function OrthoCam({ view, dx, dy, dz }: { view: Exclude<ViewMode, '3d'>; dx: number; dy: number; dz: number }) {
  const size = useThree(s => s.size)
  const far  = Math.max(dx, dy, dz) * 10 + 1000
  // position (along the view axis), screen up-vector, and the two in-plane world extents.
  let position: [number, number, number]
  let up: [number, number, number] = [0, 1, 0]
  let worldW: number, worldH: number
  if (view === 'top') {            // look down −Y; screen = X(width) × Z(depth), front of part at bottom
    position = [0, far * 0.5, 0]; up = [0, 0, -1]; worldW = dx; worldH = dz
  } else if (view === 'front') {   // look along −Z; screen = X(width) × Y(height)
    position = [0, 0, far * 0.5]; worldW = dx; worldH = dy
  } else {                         // 'side' — look along −X; screen = Z(depth) × Y(height)
    position = [far * 0.5, 0, 0]; worldW = dz; worldH = dy
  }
  const zoom = Math.min(size.width / Math.max(worldW, 1), size.height / Math.max(worldH, 1)) * 0.85
  return <OrthographicCamera makeDefault position={position} up={up} zoom={zoom} near={0.1} far={far * 2} />
}

function SceneCamera({ view, dx, dy, dz }: { view: ViewMode; dx: number; dy: number; dz: number }) {
  if (view === '3d') {
    const camDist = fitCamDist(dx, dy, dz)
    return (
      <PerspectiveCamera
        makeDefault
        fov={FOV}
        position={[camDist * 0.5, camDist * 0.35, camDist * 0.8]}
        near={1}
        far={camDist * 10}
      />
    )
  }
  return <OrthoCam view={view} dx={dx} dy={dy} dz={dz} />
}

// A mm grid in the plane of the current ortho view, pushed to the far side of the
// part so it doesn't z-fight. gridHelper sits in the XZ plane by default.
function ViewGrid({ view, dx, dy, dz, cell }: { view: Exclude<ViewMode, '3d'>; dx: number; dy: number; dz: number; cell: number }) {
  const span = view === 'top' ? Math.max(dx, dz) : view === 'front' ? Math.max(dx, dy) : Math.max(dz, dy)
  const div  = Math.max(2, Math.round(span / Math.max(cell, 1)))
  const helper = <gridHelper args={[div * cell, div, '#3b4252', '#272b36']} />
  if (view === 'top')   return <group position={[0, -dy / 2, 0]}>{helper}</group>
  if (view === 'front') return <group position={[0, 0, -dz / 2]} rotation={[Math.PI / 2, 0, 0]}>{helper}</group>
  return <group position={[-dx / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>{helper}</group>   // side
}

// Measure tool: renders a clickable snap sphere at every snap point, highlights
// the two picked points, and draws a line between them. The numeric distance is
// shown in the DOM toolbar (see PreviewCanvas), not in-scene.
function MeasureLayer({
  points, picked, onPick, snapR,
}: {
  points: [number, number, number][]
  picked: [number, number, number][]
  onPick: (p: [number, number, number]) => void
  snapR: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  return (
    <group>
      {points.map((p, i) => (
        <mesh
          key={i}
          position={p}
          onClick={(e) => { e.stopPropagation(); onPick(p) }}
          onPointerOver={(e) => { e.stopPropagation(); setHover(i) }}
          onPointerOut={() => setHover(h => (h === i ? null : h))}
        >
          <sphereGeometry args={[hover === i ? snapR * 1.6 : snapR, 12, 12]} />
          <meshBasicMaterial color={hover === i ? '#67e8f9' : '#22d3ee'} transparent opacity={0.55} depthTest={false} />
        </mesh>
      ))}
      {picked.map((p, i) => (
        <mesh key={`pk${i}`} position={p} renderOrder={2}>
          <sphereGeometry args={[snapR * 1.4, 16, 16]} />
          <meshBasicMaterial color="#f59e0b" depthTest={false} />
        </mesh>
      ))}
      {picked.length === 2 && (
        <Line points={picked} color="#f59e0b" lineWidth={2} depthTest={false} renderOrder={2} />
      )}
    </group>
  )
}

// Default measure snap points when the caller supplies none: the 8 bounding-box
// corners, 6 face centres, and the centroid — all in the origin-centred frame.
function defaultSnapPoints(dx: number, dy: number, dz: number): [number, number, number][] {
  const xs = [-dx / 2, 0, dx / 2], ys = [-dy / 2, 0, dy / 2], zs = [-dz / 2, 0, dz / 2]
  const out: [number, number, number][] = []
  for (const x of xs) for (const y of ys) for (const z of zs) {
    // keep corners, face centres and centroid (i.e. at most one zero per... ) — take all 27 grid nodes;
    // it's a small fixed set and gives corners + edge mids + face centres + centre for free.
    out.push([x, y, z])
  }
  return out
}

// ── PreviewCanvas ──────────────────────────────────────────────────────────────
// Standard Canvas + camera + lighting + OrbitControls.
// Pass scene geometry as children; overlays (panels, tooltips) via overlay prop.

function ModifierZoomSpeed({ controlsRef, baseSpeed }: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>
  baseSpeed: number
}) {
  const { gl } = useThree()
  useEffect(() => {
    const canvas = gl.domElement
    // Capture runs before OrbitControls' own wheel listener, letting that handler
    // use the appropriate speed without replacing its distance clamping/dolly logic.
    const onWheel = (e: WheelEvent) => {
      const controls = controlsRef.current
      if (!controls) return
      controls.zoomSpeed = baseSpeed * (e.shiftKey ? 0.03 / 0.12 : e.ctrlKey ? 0.40 / 0.12 : 1)
    }
    canvas.addEventListener('wheel', onWheel, { capture: true, passive: true })
    return () => canvas.removeEventListener('wheel', onWheel, { capture: true })
  }, [baseSpeed, controlsRef, gl])
  return null
}

export function PreviewCanvas({
  dx, dy, dz,
  bgColor = '#111827',
  enablePan = false,
  zoomSpeedMultiplier = 1,
  modifierZoom = false,
  onDeselect,
  onContextMenu,
  overlay,
  hint,
  children,
  // ── M2 additions — all opt-in; defaults keep the legacy perspective behaviour ──
  viewModes = false,                 // show the 3D/Top/Front/Side selector + ortho cameras
  initialView = '3d',
  grid = true,                       // mm grid in ortho views (only when viewModes)
  gridCell = 50,                     // mm per minor grid cell
  measure = false,                   // enable the measure tool toggle (only when viewModes)
  snapPoints,                        // world-space snap targets; default = derived bbox nodes
}: {
  dx:             number
  dy:             number
  dz:             number
  bgColor?:       string
  enablePan?:     boolean
  zoomSpeedMultiplier?: number
  modifierZoom?:  boolean
  onDeselect?:    () => void
  onContextMenu?: (e: React.MouseEvent) => void
  overlay?:       React.ReactNode
  hint?:          string
  children?:      React.ReactNode
  viewModes?:     boolean
  initialView?:   ViewMode
  grid?:          boolean
  gridCell?:      number
  measure?:       boolean
  snapPoints?:    [number, number, number][]
}) {
  const maxDim  = Math.max(dx, dy, dz)
  const camDist = fitCamDist(dx, dy, dz)
  const zoomSpeed = (getUserPrefs().invertScroll ? -1 : 1) * zoomSpeedMultiplier
  const controlsRef = useRef<OrbitControlsImpl>(null)

  // View + measure state (only meaningful when viewModes is on).
  const [view, setView] = useState<ViewMode>(initialView)
  const [measuring, setMeasuring] = useState(false)
  const [picked, setPicked] = useState<[number, number, number][]>([])

  const snaps = useMemo<[number, number, number][]>(
    () => snapPoints ?? defaultSnapPoints(dx, dy, dz),
    [snapPoints, dx, dy, dz],
  )
  const dist = picked.length === 2
    ? Math.hypot(picked[0][0] - picked[1][0], picked[0][1] - picked[1][1], picked[0][2] - picked[1][2])
    : null
  const onPick = (p: [number, number, number]) =>
    setPicked(prev => (prev.length >= 2 ? [p] : [...prev, p]))

  const legacy = !viewModes
  const enableRotate = legacy || view === '3d'
  const showGrid = viewModes && grid && view !== '3d'
  const showMeasure = viewModes && measure && measuring
  // Ortho needs pan to be useful; the selector also implies a CAD-style viewer.
  const panEnabled = legacy ? enablePan : (enablePan || view !== '3d')

  const hintText = hint ?? (
    legacy || view === '3d'
      ? `Left-drag rotate · scroll zoom${panEnabled ? ' · right-drag pan' : ''} · click part to inspect · click empty to deselect`
      : `${VIEW_MODES.find(v => v.id === view)?.label} view · scroll zoom · drag pan`
  )

  return (
    <div className="w-full h-full relative">
      <Canvas
        gl={{ antialias: true, preserveDrawingBuffer: false }}
        dpr={[1, 2]}
        style={{ width: '100%', height: '100%', background: bgColor }}
        onPointerMissed={onDeselect}
        onContextMenu={onContextMenu ?? (e => { e.preventDefault(); onDeselect?.() })}
      >
        {legacy ? (
          <PerspectiveCamera
            makeDefault
            fov={FOV}
            position={[camDist * 0.5, camDist * 0.35, camDist * 0.8]}
            near={1}
            far={camDist * 10}
          />
        ) : (
          <SceneCamera view={view} dx={dx} dy={dy} dz={dz} />
        )}
        {/* Keyed by view so the controls rebind to the freshly-made-default camera on switch. */}
        <OrbitControls
          ref={controlsRef}
          key={legacy ? 'legacy' : view}
          target={[0, 0, 0]}
          minDistance={maxDim * 0.4}
          maxDistance={maxDim * 6}
          enablePan={panEnabled}
          enableRotate={enableRotate}
          enableDamping={false}
          zoomSpeed={zoomSpeed}
        />
        {modifierZoom && <ModifierZoomSpeed controlsRef={controlsRef} baseSpeed={zoomSpeed} />}
        <ambientLight intensity={1.8} />
        <directionalLight position={[dx * 1.5, dy * 2, dz * 2]} intensity={1.6} />
        <directionalLight position={[-dx, dy * 0.5, -dz * 0.5]} intensity={0.6} color="#e8f0ff" />
        {showGrid && <ViewGrid view={view as Exclude<ViewMode, '3d'>} dx={dx} dy={dy} dz={dz} cell={gridCell} />}
        <Suspense fallback={null}>
          {children}
        </Suspense>
        {showMeasure && <MeasureLayer points={snaps} picked={picked} onPick={onPick} snapR={Math.max(maxDim * 0.012, 1.5)} />}
      </Canvas>

      {viewModes && (
        <div className="absolute top-2 left-2 flex items-center gap-2 select-none">
          <div className="flex rounded-md overflow-hidden border border-gray-700 bg-gray-900/90">
            {VIEW_MODES.map(v => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  view === v.id ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          {measure && (
            <button
              onClick={() => { setMeasuring(m => !m); setPicked([]) }}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                measuring
                  ? 'bg-cyan-600 border-cyan-500 text-white'
                  : 'bg-gray-900/90 border-gray-700 text-gray-300 hover:bg-gray-700'
              }`}
              title="Measure: click two snap points"
            >
              📏 Measure
            </button>
          )}
          {measuring && (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-gray-900/90 border border-gray-700 text-[11px]">
              <span className="text-gray-400">
                {dist != null ? <span className="text-cyan-300 font-mono">{fmtMm(dist)} mm</span>
                  : <span className="text-gray-500">{picked.length === 1 ? 'pick 2nd point…' : 'pick 1st point…'}</span>}
              </span>
              {picked.length > 0 && (
                <button onClick={() => setPicked([])} className="text-gray-500 hover:text-white" aria-label="Clear measurement">✕</button>
              )}
            </div>
          )}
        </div>
      )}

      {overlay}
      <div className="absolute bottom-2 left-3 text-[10px] text-gray-600 pointer-events-none select-none">
        {hintText}
      </div>
    </div>
  )
}
