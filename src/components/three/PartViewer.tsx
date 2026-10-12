'use client'

// ── Shared 3D Part Viewer ──────────────────────────────────────────────────────
// Provides reusable primitives for all builder preview panels:
//   Box, PanelKind, PartMeta, MatColSpec, MatColMap, EbSpec  (types)
//   panelFaceColors, edgeStrips, unpackMatCol, fitCamDist     (geometry helpers)
//   Part, PartPropertiesPanel, PreviewCanvas                  (components)

import { Suspense, useState, useEffect, useMemo, useRef, createContext, useContext } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, OrthographicCamera, Edges, Line } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'
import { getUserPrefs } from '@/src/lib/userPrefs'
import { fmtMm, roundMm } from '@/src/lib/format'
import { evalCalc } from '@/src/lib/calc'
import type { ShapePt } from '@/src/lib/shapePath'
import { wheelZoomFactor } from '@/src/lib/wheelZoom'

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

// ── Shaped parts (Shape Editor overrides) ──────────────────────────────────────
// A part's drawn outline, sampled (shapePath.sampleShapeOutline), in the shape
// frame: mm, x across [0..across-dim], y DOWN from the part's visual top,
// authored face-front in the Part Editor. `mirror` = right-hand side twins
// (case_right_side): the outline was authored on the mirrored display frame.
export type PartShape = { pts: ShapePt[]; mirror?: boolean }

// Extruded silhouette in box-local coords ([0..w]×[0..h]×[0..d] off the box
// origin corner — mount inside the Part group at position [0,0,0]). The 2D
// profile plane + extrusion axis per panel kind follow the SAME frame
// conventions as edgeStrips above (that placement is the display-frame ground
// truth the Part Editor was verified against):
//   face       — profile XY (across, up),      extrude +Z (thickness)
//   side       — display-x → Z (left = back),  extrude X; mirror flips Z
//   horizontal — display-top → +Z (front),     extrude Y
export function buildShapedGeometry(shape: PartShape, b: Box, kind: PanelKind): THREE.ExtrudeGeometry {
  const up    = kind === 'horizontal' ? b.d : b.h
  const thick = kind === 'side' ? b.w : kind === 'horizontal' ? b.h : b.d
  const s = new THREE.Shape()
  shape.pts.forEach((p, i) => { if (i === 0) s.moveTo(p.x, up - p.y); else s.lineTo(p.x, up - p.y) })
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false })
  if (kind === 'side') {
    if (shape.mirror) { g.rotateY(Math.PI / 2);  g.translate(0, 0, b.d) }
    else              { g.rotateY(-Math.PI / 2); g.translate(b.w, 0, 0) }
  } else if (kind === 'horizontal') {
    g.rotateX(Math.PI / 2); g.translate(0, b.h, 0)
  }
  return g
}

// ── Camera ─────────────────────────────────────────────────────────────────────

const FOV = 32

export function fitCamDist(dx: number, dy: number, dz: number) {
  const halfDiag = Math.sqrt((dx / 2) ** 2 + (dy / 2) ** 2 + (dz / 2) ** 2)
  return (halfDiag / Math.tan((FOV / 2) * (Math.PI / 180))) * 1.3
}

// ── Part mesh ──────────────────────────────────────────────────────────────────

// true = parts carry no pointer handlers (not raycast, no hover / select). The
// room 3D view sets this so one overlay per cabinet owns click + right-click.
export const PassivePartsContext = createContext(false)

// Material alpha for everything drawn inside (1 = opaque). The room 3D view wraps
// each part in <PartAlpha> so a layer set's "ghost" style / opacity shows through
// (z_display_layers spec, Phase 3c). Models (hinges, runners) read it too.
export const PartAlphaContext = createContext(1)
export function PartAlpha({ a, children }: { a: number; children: React.ReactNode }) {
  return <PartAlphaContext.Provider value={a}>{children}</PartAlphaContext.Provider>
}
/** Wire-mode part colours. The cabinet editor's dark background uses the
 *  defaults; the room 3D (light background) provides darker edges. */
export const WireColorContext = createContext({ fill: '#9ca3af', edge: '#94a3b8' })
/** Props every see-through material needs (transparent panels must not occlude). */
export function alphaMat(a: number) {
  return a >= 1 ? {} : { transparent: true, opacity: a, depthWrite: false }
}

export function Part({
  b, faceColors, edgeLineColor, meta, selected, highlighted, onSelect, dragRef, ebSpec,
  contextMenuSelect = false,
  wire = false,
  rotation,
  onPartContextMenu,
  subtractions,
  hoverHighlight = true,
  shape,
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
  // Cabinet-space pocket volumes to CSG-subtract (real recesses). `cylinder`
  // entries cut a round hole (diameter = size[0], axis along the box d/z —
  // through-drills). When present the panel renders as a single material colour
  // — CSG can't keep the 6 per-face colours (three-bvh-csg collapses them),
  // which is an accepted trade-off.
  subtractions?:      { center: [number, number, number]; size: [number, number, number]; cylinder?: boolean }[]
  // When false, the panel shows no hover edge highlight (used by the Part Editor,
  // where the single part is the whole scene and the orange hover line is noise).
  hoverHighlight?:    boolean
  // Shape Editor override: sampled outline → the panel renders as an extruded
  // silhouette instead of a box. Edge-band tape strips are suppressed on shaped
  // parts (rectangle-based tape would float over cut-away regions).
  shape?:             PartShape | null
}) {
  const [hovered, setHovered] = useState(false)
  const passive = useContext(PassivePartsContext)
  const alpha   = useContext(PartAlphaContext)
  const wireCol = useContext(WireColorContext)
  const am      = alphaMat(alpha)
  // Edges widths are in CSS pixels, so on a scaled display 1 renders as 1.5–2
  // physical pixels; 1/dpr keeps the resting outline an exact 1-device-px hairline.
  const hairline = 1 / useThree(s => s.viewport.dpr)

  // Extruded silhouette for shaped parts. Keyed on the dims, not the b object
  // (callers rebuild b every render); pts identity is stable via the callers'
  // shape cache, so re-tessellation only happens on a real change.
  const shapeGeom = useMemo(
    () => (shape && shape.pts.length > 2 ? buildShapedGeometry(shape, b, meta.panelKind) : null),
    [shape, b.w, b.h, b.d, meta.panelKind],  // eslint-disable-line react-hooks/exhaustive-deps
  )
  useEffect(() => () => { shapeGeom?.dispose() }, [shapeGeom])

  // Edge-band tape shrinks the panel core; the tape strips render separately.
  // Computed before the wire early-return because the CSG memo below needs it.
  const tapeT = ebSpec ? Math.max(0, ebSpec.thick) : 0
  const strips = ebSpec && !shapeGeom ? edgeStrips(b, meta.edge, meta.panelKind, tapeT) : []
  const core = ebSpec && !shapeGeom ? edgeCoreBox(b, meta.edge, meta.panelKind, tapeT) : b

  // Pocket ops → geometry computed imperatively with three-bvh-csg and handed to
  // the mesh as a plain `geometry` prop. The former reactive <Geometry> tree
  // (@react-three/csg) re-ran the CSG in a no-deps layout effect on every render
  // and swapped the attached geometry's attributes in place — an attach-ordering
  // race under r3f v9 that intermittently left the mesh drawing an orphaned empty
  // geometry (part invisible in solid mode, stale in wire). Frame convention
  // matches the mesh placement below: shaped base = corner-origin, box base =
  // centred on the core box.
  const csgGeom = useMemo(() => {
    if (!subtractions || subtractions.length === 0) return null
    const scratch: THREE.BufferGeometry[] = []
    const baseGeo = shapeGeom ?? new THREE.BoxGeometry(core.w, core.h, core.d)
    if (!shapeGeom) scratch.push(baseGeo)
    const ev = new Evaluator()
    ev.useGroups = false   // single material — matches the CSG branch's render
    let brush = new Brush(baseGeo)
    brush.updateMatrixWorld()
    let cut = false
    for (const s of subtractions) {
      // Degenerate boxes make three-bvh-csg throw or emit garbage — skip them.
      if (!(s.size[0] > 0.05 && s.size[1] > 0.05 && s.size[2] > 0.05)) continue
      const subGeo = s.cylinder
        ? new THREE.CylinderGeometry(s.size[0] / 2, s.size[0] / 2, s.size[2], 28).rotateX(Math.PI / 2)
        : new THREE.BoxGeometry(s.size[0], s.size[1], s.size[2])
      scratch.push(subGeo)
      const sub = new Brush(subGeo)
      sub.position.set(
        s.center[0] - (shapeGeom ? b.x : core.x + core.w / 2),
        s.center[1] - (shapeGeom ? b.y : core.y + core.h / 2),
        s.center[2] - (shapeGeom ? b.z : core.z + core.d / 2),
      )
      sub.updateMatrixWorld()
      const next = ev.evaluate(brush, sub, SUBTRACTION)
      if (cut) scratch.push(brush.geometry)   // intermediate result, superseded
      brush = next
      cut = true
    }
    const result = cut ? brush.geometry : null
    for (const g of scratch) if (g !== result) g.dispose()
    // A cut that consumed the whole panel (bad op data) → fall back to the uncut
    // panel rather than rendering nothing.
    if (result && (result.attributes.position?.count ?? 0) === 0) { result.dispose(); return null }
    return result
  }, [subtractions, shapeGeom, b.x, b.y, b.z, core.x, core.y, core.z, core.w, core.h, core.d])
  useEffect(() => () => { csgGeom?.dispose() }, [csgGeom])

  // Rotation pivots about the part's reference point (origin corner b.x/b.y/b.z):
  // the group sits at that corner and carries the rotation, while children are
  // positioned relative to it. With no rotation this is identical to placing the
  // mesh at the box centre. (Shaped geometry is built corner-origin, so its mesh
  // sits at [0,0,0] inside the group instead of the centred box.)
  // The mesh is keyed by which render branch is active (wire / CSG / shaped /
  // plain box). The branches attach materials to different slots (material vs
  // material-0..N), and r3f cannot re-route `attach` on a live material when a
  // branch flip reuses it — the old slot is left as a null hole and the mesh
  // stops drawing (only its Edges remain, reading as stuck-in-wire). Keying
  // remounts the mesh so each branch builds its materials fresh. Branch flips
  // happen at runtime: pocket ops (subtractions) load async, and wire toggles.
  // The alpha suffix remounts the mesh when a layer set turns transparency on or
  // off: three keeps the compiled program when `transparent` flips on a live
  // material, so the panel would keep rendering opaque.
  const meshKey = (wire ? 'wire' : csgGeom ? 'csg' : shapeGeom ? 'shaped' : 'box') + (alpha < 1 ? '-t' : '')

  if (wire) {
    const ownGeom = csgGeom ?? shapeGeom
    return (
      <group position={[b.x, b.y, b.z]} rotation={rotation}>
        <mesh
          key={meshKey}
          position={shapeGeom ? [0, 0, 0]
                  : csgGeom  ? [core.x - b.x + core.w / 2, core.y - b.y + core.h / 2, core.z - b.z + core.d / 2]
                  :            [b.w / 2, b.h / 2, b.d / 2]}
          geometry={ownGeom ?? undefined}
        >
          {!ownGeom && <boxGeometry args={[b.w, b.h, b.d]} />}
          <meshStandardMaterial color={wireCol.fill} transparent opacity={0.08} depthWrite={false} />
          <Edges threshold={10} color={wireCol.edge} linewidth={1} />
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
  const lineWidth = selected || highlighted ? 1.5 : hov ? 2.5 : hairline

  return (
    <group position={[b.x, b.y, b.z]} rotation={rotation}>
      <mesh
        key={meshKey}
        position={shapeGeom ? [0, 0, 0] : [core.x - b.x + core.w / 2, core.y - b.y + core.h / 2, core.z - b.z + core.d / 2]}
        geometry={csgGeom ?? shapeGeom ?? undefined}
        onPointerDown={passive ? undefined : () => { dragRef.current = false }}
        onPointerMove={passive ? undefined : (e) => { if (e.buttons) dragRef.current = true }}
        onClick={passive || contextMenuSelect ? undefined : (e) => { e.stopPropagation(); if (!dragRef.current) onSelect(selected ? null : meta) }}
        onContextMenu={!passive && (contextMenuSelect || onPartContextMenu) ? (e) => {
          e.stopPropagation()
          if (contextMenuSelect) onSelect(meta)
          if (onPartContextMenu) {
            const ne = e.nativeEvent as MouseEvent
            onPartContextMenu(meta, ne.clientX, ne.clientY)
          }
        } : undefined}
        onPointerOver={passive ? undefined : (e) => { e.stopPropagation(); setHovered(true) }}
        onPointerOut={passive ? undefined : () => setHovered(false)}
      >
        {csgGeom ? (
          // Real recesses cut into the panel (csgGeom above). Single material —
          // the CSG output collapses the 6 per-face colours, an accepted trade-off.
          <>
            <meshStandardMaterial color={mats[0]} roughness={0.7} metalness={0.05} {...am} />
            <Edges threshold={10} color={edgeLine} linewidth={lineWidth} transparent opacity={alpha} />
          </>
        ) : shapeGeom ? (
          // ExtrudeGeometry material groups: 0 = the two caps (faces), 1 = the
          // extruded side walls. faceColors is ordered by BOX face direction
          // (+X,−X,+Y,−Y,+Z,−Z), so where the face colour lives depends on the
          // panel kind: side → ±X (mirror twins carry face on −X = slot 1),
          // horizontal → ±Y, face → ±Z. Walls take an edge slot for the kind.
          (() => {
            const kind = meta.panelKind
            const cap  = kind === 'side' ? mats[shape?.mirror ? 1 : 0] : kind === 'horizontal' ? mats[2] : mats[4]
            const wall = kind === 'side' ? mats[2] : mats[0]
            return (
              <>
                <meshStandardMaterial attach="material-0" color={cap}  roughness={0.7} metalness={0.05} {...am} />
                <meshStandardMaterial attach="material-1" color={wall} roughness={0.7} metalness={0.05} {...am} />
                <Edges threshold={10} color={edgeLine} linewidth={lineWidth} transparent opacity={alpha} />
              </>
            )
          })()
        ) : (
          <>
            <boxGeometry args={[core.w, core.h, core.d]} />
            {mats.map((c, i) => (
              <meshStandardMaterial key={i} attach={`material-${i}`} color={c} roughness={0.7} metalness={0.05} {...am} />
            ))}
            <Edges threshold={10} color={edgeLine} linewidth={lineWidth} transparent opacity={alpha} />
          </>
        )}
      </mesh>
      {strips.map((s, i) => (
        <mesh key={`${i}${alpha < 1 ? '-t' : ''}`} position={[s.pos[0] - b.x, s.pos[1] - b.y, s.pos[2] - b.z]}>
          <boxGeometry args={s.args} />
          <meshStandardMaterial color={ebSpec!.color} roughness={0.35} metalness={0.0} {...am} />
          {/* Faint black outline so the tape reads as a separate strip on the panel
              (not in the room 3D view — passive parts — where it reads too bold) */}
          {!passive && <Edges threshold={10} color="#1a1a1a" linewidth={hairline} />}
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

// Which resolver axis each display-box extent (w/h/d) corresponds to. Mirrors
// the *Box() world mappings: side → w=DZ,h=DY,d=DX; horizontal → w=DY,h=DZ,d=DX;
// face → depends on whether the part resolves upright (front zones + front-
// standing customs: DX=width) or not (carcase back: DX=height). The panel
// inverts this so every part reads in the CV standard-part convention —
// Length (DY, with the grain) / Width (DX) / Thickness (DZ) — no matter how
// it is orientated in the cabinet. (Toekick horizontal spreaders are the one
// part whose box maps w=DX — a rare edge case not worth special-casing here.)
type RawAxis = 'DX' | 'DY' | 'DZ'
function dimAxes(kind: PanelKind, dxIsWidth?: boolean): { w: RawAxis; h: RawAxis; d: RawAxis } {
  if (kind === 'side')       return { w: 'DZ', h: 'DY', d: 'DX' }
  if (kind === 'horizontal') return { w: 'DY', h: 'DZ', d: 'DX' }
  return dxIsWidth ? { w: 'DX', h: 'DY', d: 'DZ' } : { w: 'DY', h: 'DX', d: 'DZ' }
}
// Inverse: which box extent holds each raw axis. Exported so the Part Editor
// and Overrides sidebar can present the same CV reading (DY/DX/DZ rows).
export type { RawAxis }
export function extForAxes(kind: PanelKind, dxIsWidth?: boolean): Record<RawAxis, 'w' | 'h' | 'd'> {
  const ax = dimAxes(kind, dxIsWidth)
  const inv = {} as Record<RawAxis, 'w' | 'h' | 'd'>
  for (const e of ['w', 'h', 'd'] as const) inv[ax[e]] = e
  return inv
}

export function PartPropertiesPanel({
  part, onClose, onEdgeChange, onSizeChange, actions, jointControls, ebThickness,
  className = 'absolute top-3 right-3 w-56',
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
  // Outer positioning/sizing only — pass e.g. 'relative w-full' to dock the
  // panel in a sidebar instead of floating it over the canvas.
  className?: string
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
  // CV standard-part reading: Length (DY, grain) / Width (DX) / Thickness (DZ)
  // for every part regardless of orientation — a gable reads DY 720 × DX 560.
  const ext = extForAxes(part.panelKind, part.dxIsWidth)
  const row = (label: string, axis: RawAxis) => {
    const e = ext[axis]
    return (<>
      <span className="text-gray-500 self-center">{label} <span className="text-gray-600 text-[10px]">({axis})</span></span>
      {onSizeChange
        ? <span className="text-right"><SizeField value={part[e]} onCommit={v => onSizeChange(e, v)} /> <span className="text-gray-600 text-[10px]">mm</span></span>
        : <span className="text-gray-200 text-right font-mono">{fmtMm(disp[e])} mm</span>}
    </>)
  }
  return (
    <div className={`${className} bg-gray-900/95 border border-gray-700 rounded-lg shadow-xl pointer-events-auto select-none`} onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-gray-700">
        <span className="text-sm font-semibold text-white">{part.label}</span>
        <button onClick={onClose} className="text-gray-500 hover:text-white text-base leading-none ml-2" aria-label="Close">✕</button>
      </div>
      <div className="px-3 py-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pb-0.5">
          Size{onSizeChange ? <span className="text-gray-700 normal-case tracking-normal"> · editable</span> : null}
          {showCut ? <span className="text-amber-500/80 normal-case tracking-normal"> · cut (banding deducted)</span> : null}
        </span>
        {row('Length', 'DY')}
        {row('Width', 'DX')}
        {row('Thickness', 'DZ')}
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

// OrbitControls uses one zoomSpeed for both the wheel and touch pinch. The
// invertScroll pref makes baseSpeed negative, which must only flip the wheel —
// pinch direction is physical. Capture listeners run before OrbitControls' own,
// so each gesture sees the right speed without replacing its dolly/clamp logic.
function ZoomSpeedSync({ controlsRef, baseSpeed }: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>
  baseSpeed: number
}) {
  const { gl } = useThree()
  useEffect(() => {
    const canvas = gl.domElement
    const onWheel = (e: WheelEvent) => {
      const controls = controlsRef.current
      if (!controls) return
      // Windows sends Shift+wheel as a horizontal scroll (deltaY 0), which
      // three-stdlib ignores. Swallow it and replay it vertically.
      if (e.deltaY === 0 && e.shiftKey && e.deltaX !== 0) {
        e.preventDefault()
        e.stopImmediatePropagation()
        canvas.dispatchEvent(new WheelEvent('wheel', {
          deltaY: e.deltaX, deltaMode: e.deltaMode, shiftKey: true, ctrlKey: e.ctrlKey,
          clientX: e.clientX, clientY: e.clientY, bubbles: true, cancelable: true,
        }))
        return
      }
      // three-stdlib dollies a fixed 0.95^zoomSpeed per wheel event; scale the step
      // by this event's share of the shared wheel rate (incl. Ctrl = fast, Shift =
      // fine) so smooth-scroll mice and touchpads zoom like the 2D views.
      const step = Math.abs(Math.log(wheelZoomFactor(e))) / -Math.log(0.95)
      controls.zoomSpeed = baseSpeed * step
    }
    const onPointerDown = (e: PointerEvent) => {
      const controls = controlsRef.current
      if (controls && e.pointerType === 'touch') controls.zoomSpeed = Math.abs(baseSpeed)
    }
    canvas.addEventListener('wheel', onWheel, { capture: true, passive: false })
    // Also on move: a re-render mid-pinch re-applies the (negative) zoomSpeed prop.
    canvas.addEventListener('pointerdown', onPointerDown, { capture: true })
    canvas.addEventListener('pointermove', onPointerDown, { capture: true })
    return () => {
      canvas.removeEventListener('wheel', onWheel, { capture: true })
      canvas.removeEventListener('pointerdown', onPointerDown, { capture: true })
      canvas.removeEventListener('pointermove', onPointerDown, { capture: true })
    }
  }, [baseSpeed, controlsRef, gl])
  return null
}

export function PreviewCanvas({
  dx, dy, dz,
  bgColor = '#111827',
  enablePan = false,
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
  const zoomSpeed = (getUserPrefs().invertScroll ? -1 : 1)
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
        <ZoomSpeedSync key={`zoom-${legacy ? 'legacy' : view}`}controlsRef={controlsRef} baseSpeed={zoomSpeed} />
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
