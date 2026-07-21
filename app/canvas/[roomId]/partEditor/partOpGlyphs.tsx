'use client'

// ============================================================
// Part Editor — operation marker glyphs (spec §5.5).
// One glyph map, used in BOTH the SVG ortho views and the 3D
// scene. Geometry is computed in part-local FACE coords (origin
// bottom-left; x → DX/u right, y → DY/v up); each view maps it
// into its own space. All current data are face drills.
// ============================================================

import { Edges } from '@react-three/drei'
import type { PartOp } from '../CabinetRoutesPanel'

export type FaceGlyph = {
  circles: { cx: number; cy: number; r: number }[]
  rects:   { x: number; y: number; w: number; h: number }[]
  slots:   { x1: number; y1: number; x2: number; y2: number; w: number }[]
}

export function opFaceGlyph(op: PartOp, u: number, v: number): FaceGlyph {
  const g: FaceGlyph = { circles: [], rects: [], slots: [] }
  const px = op.pos_x ?? 0, py = op.pos_y ?? 0

  if (op.operation_type === 'drill') {
    const r = Math.max((op.diameter ?? 5) / 2, 0.5)
    const count = Math.max(1, op.repeat_count ?? 1)
    const step  = op.repeat_spacing ?? 0
    const along = op.repeat_axis === 'along'   // 'along' = u, else step up v
    for (let i = 0; i < count; i++) {
      g.circles.push({ cx: px + (along ? step * i : 0), cy: py + (along ? 0 : step * i), r })
    }
  } else if (op.operation_type === 'groove') {
    const len = op.length ?? 0, w = Math.max(op.width ?? 4, 0.5)
    g.slots.push({ x1: px, y1: py, x2: px + len, y2: py, w })
  } else {
    // Area op (pocket / outline / square_off / profile / route).
    if (op.size_dx != null && op.size_dy != null) {
      g.rects.push({ x: px - op.size_dx / 2, y: py - op.size_dy / 2, w: op.size_dx, h: op.size_dy })
    } else if (op.offset_left_mm != null || op.offset_right_mm != null || op.offset_top_mm != null || op.offset_bottom_mm != null) {
      const l = op.offset_left_mm ?? 0, rt = op.offset_right_mm ?? 0, t = op.offset_top_mm ?? 0, b = op.offset_bottom_mm ?? 0
      g.rects.push({ x: l, y: b, w: Math.max(0, u - l - rt), h: Math.max(0, v - t - b) })
    } else {
      g.circles.push({ cx: px, cy: py, r: 3 })   // positionless fallback dot
    }
  }
  return g
}

// Swap a glyph's in-plane axes (x↔y, w↔h) so a part whose part-local DX is its
// HEIGHT (doors, backs, horizontal panels) displays UPRIGHT — width across the
// screen, height up. The stored op data (pos_x/pos_y) is unchanged; only the
// display frame rotates. Parts whose height already runs up-screen (panelKind
// 'side') are drawn without a swap.
export function swapGlyph(g: FaceGlyph): FaceGlyph {
  return {
    circles: g.circles.map(c => ({ cx: c.cy, cy: c.cx, r: c.r })),
    rects:   g.rects.map(r => ({ x: r.y, y: r.x, w: r.h, h: r.w })),
    slots:   g.slots.map(s => ({ x1: s.y1, y1: s.x1, x2: s.y2, y2: s.x2, w: s.w })),
  }
}

// Mirror a glyph horizontally about the part-local u axis (pos_x → pu − pos_x).
// A right-hand part (e.g. the right gable) is the mirror image of its left-hand
// twin, but the editor flattens both with the SAME footprint frame — so the
// right one must be flipped in the DX/u direction to read interior-face-up, or
// its drilling and edge banding land on the opposite edge. Applied BEFORE swap
// (mirror only ever applies to un-swapped 'side' parts, so the order is moot).
export function mirrorGlyphX(g: FaceGlyph, pu: number): FaceGlyph {
  return {
    circles: g.circles.map(c => ({ cx: pu - c.cx, cy: c.cy, r: c.r })),
    rects:   g.rects.map(r => ({ x: pu - r.x - r.w, y: r.y, w: r.w, h: r.h })),
    slots:   g.slots.map(s => ({ x1: pu - s.x1, y1: s.y1, x2: pu - s.x2, y2: s.y2, w: s.w })),
  }
}

// Colour priority: validation error/warn (spec §6.2) → selection → generated/hand.
export function glyphColours(op: PartOp, selected: boolean, level?: 'error' | 'warn') {
  if (level === 'error')        return { stroke: '#ef4444', fill: 'rgba(239,68,68,0.22)' }
  if (level === 'warn')         return { stroke: '#f59e0b', fill: 'rgba(245,158,11,0.20)' }
  if (selected)                 return { stroke: '#c4b5fd', fill: 'rgba(196,181,253,0.28)' }
  if (op.parameters?.generated) return { stroke: '#38bdf8', fill: 'rgba(56,189,248,0.16)' }
  return { stroke: '#34d399', fill: 'rgba(52,211,153,0.16)' }
}

// Which physical face an op sits on. `face_back` → the machined / interior side
// (−n, where hinge cups & fixings drill); everything else (face_front, edge, unset)
// → the decorative front (+n). This is the single source of truth the editor uses
// to place & ghost ops per face — see Phase A of the front/back work.
export const opFaceSide = (op: PartOp): 'front' | 'back' =>
  op.plane_kind === 'face_back' ? 'back' : 'front'

// SVG marker layer for the FRONT (face) view, drawn in the display frame: glyphs
// are computed in part-local (pu × pv), swapped upright when `swap`, then flipped
// for SVG's top-down y (screen vertical extent = sh). `activeFace` is the face the
// editor is currently working on; ops on the OTHER face are ghosted (faint, not
// interactive) so you see them through the panel without editing them by accident.
export function OpMarkersSVG({ ops, pu, pv, swap, mirror, activeFace, selectedId, onSelect, interactive, levels, onStartDrag }: {
  ops: PartOp[]; pu: number; pv: number; swap: boolean; mirror?: boolean; activeFace?: 'front' | 'back'; selectedId: string | null
  onSelect: (id: string) => void; interactive: boolean
  levels: Record<string, 'error' | 'warn' | undefined>
  onStartDrag?: (op: PartOp, e: React.PointerEvent) => void
}) {
  const sh = swap ? pu : pv   // screen vertical extent (y-flip reference)
  return (
    <g>
      {ops.map(op => {
        let g = opFaceGlyph(op, pu, pv)
        if (mirror) g = mirrorGlyphX(g, pu)
        if (swap) g = swapGlyph(g)
        const sel = op.id === selectedId
        const ghost = !!activeFace && opFaceSide(op) !== activeFace
        const c = glyphColours(op, sel, levels[op.id])
        const strokeW = sel ? 2 : 1.25
        // Generated (slave / auto) rows are locked — not draggable (§8). Off-face
        // (ghosted) ops are never interactive; you toggle to their face to edit.
        const draggable = interactive && !ghost && !!onStartDrag && !op.parameters?.generated
        const act = interactive && !ghost
        return (
          <g key={op.id}
            opacity={ghost ? 0.28 : 1}
            style={{ cursor: draggable ? 'grab' : act ? 'pointer' : 'default', pointerEvents: act ? 'auto' : 'none' }}
            strokeDasharray={ghost ? '3 2' : undefined}
            onPointerDown={draggable ? (e => onStartDrag!(op, e)) : undefined}
            onClick={act ? (e => { e.stopPropagation(); onSelect(op.id) }) : undefined}>
            {g.circles.map((cir, i) => (
              <circle key={`c${i}`} cx={cir.cx} cy={sh - cir.cy} r={cir.r}
                fill={c.fill} stroke={c.stroke} strokeWidth={strokeW} vectorEffect="non-scaling-stroke" />
            ))}
            {g.rects.map((r, i) => (
              <rect key={`r${i}`} x={r.x} y={sh - r.y - r.h} width={r.w} height={r.h}
                fill={c.fill} stroke={c.stroke} strokeWidth={strokeW} vectorEffect="non-scaling-stroke" />
            ))}
            {g.slots.map((s, i) => (
              <line key={`s${i}`} x1={s.x1} y1={sh - s.y1} x2={s.x2} y2={sh - s.y2}
                stroke={c.stroke} strokeWidth={s.w} strokeLinecap="round" opacity={0.7} />
            ))}
          </g>
        )
      })}
    </g>
  )
}

const opDepth = (op: PartOp) => Math.max(op.depth ?? op.size_dz ?? 2, 0.5)

// Where an op sits along the part-local normal (n-axis: back face at 0, front
// face at n). Z0 always references the surface of the face the op is on
// (face_front → z = n, face_back → z = 0); pos_z is the start offset BELOW that
// surface and the cut runs `depth` further inward. Mirrors partOpProject's
// cabinet-space placement so the editor and the cabinet views agree.
//   front op: cuts toward 0 → span [n − pos_z − depth, n − pos_z], surface at hi
//   back  op: cuts toward n → span [pos_z, pos_z + depth],         surface at lo
function opDepthSpan(op: PartOp, n: number): { lo: number; hi: number; surface: number; depth: number } {
  const depth = opDepth(op)
  const start = Math.max(op.pos_z ?? 0, 0)
  const back = opFaceSide(op) === 'back'
  const surface = back ? start : n - start          // near the active face
  const floor   = back ? start + depth : n - start - depth
  const lo = Math.min(surface, floor), hi = Math.max(surface, floor)
  return { lo, hi, surface, depth }
}

// Depth-projection marker layer for the TOP and SIDE ortho views. Each op's
// face footprint is collapsed onto the view's in-plane axis and extruded to
// its cutting depth from the front face, in the same glyph colours as the
// front view so an op reads consistently across views.
//   top  (sw × n): x = across-screen footprint; front face at the BOTTOM
//                  edge (part seen from above, front toward the viewer).
//   side (n × sh): y = up-screen footprint; front face at the LEFT (x = 0)
//                  (part seen from its right edge).
// Like opFaceGlyph, every op is treated as a front-face cut — edge-plane
// bores (plane_kind 'edge') don't yet project their true direction.
export function OpMarkersDepthSVG({ ops, pu, pv, n, swap, mirror, activeFace, view, selectedId, onSelect, interactive, levels }: {
  ops: PartOp[]; pu: number; pv: number; n: number; swap: boolean; mirror?: boolean; activeFace?: 'front' | 'back'
  view: 'top' | 'side'; selectedId: string | null
  onSelect: (id: string) => void; interactive: boolean
  levels: Record<string, 'error' | 'warn' | undefined>
}) {
  const sh = swap ? pu : pv
  return (
    <g>
      {ops.map(op => {
        let g = opFaceGlyph(op, pu, pv)
        if (mirror) g = mirrorGlyphX(g, pu)
        if (swap) g = swapGlyph(g)
        // Depth span honours pos_z (Z0 = the active face surface); the cut may sit
        // below the surface rather than opening it. Top view: n-coord maps straight
        // to SVG y (front face at y = n, bottom). Side view: x = n − z (front at x = 0,
        // left).
        const span = opDepthSpan(op, n)
        const zLo = Math.max(span.lo, 0), zHi = Math.min(span.hi, n)
        const q = Math.max(zHi - zLo, 0)
        const back = opFaceSide(op) === 'back'
        const ghost = !!activeFace && (back ? 'back' : 'front') !== activeFace
        const sel = op.id === selectedId
        const c = glyphColours(op, sel, levels[op.id])
        const strokeW = sel ? 2 : 1.25
        // Collapse each glyph primitive to its extent along the view's in-plane axis.
        const spans: [number, number][] = []
        for (const cir of g.circles) spans.push(view === 'top' ? [cir.cx - cir.r, cir.cx + cir.r] : [cir.cy - cir.r, cir.cy + cir.r])
        for (const r of g.rects)     spans.push(view === 'top' ? [r.x, r.x + r.w] : [r.y, r.y + r.h])
        for (const s of g.slots)     spans.push(view === 'top'
          ? [Math.min(s.x1, s.x2) - s.w / 2, Math.max(s.x1, s.x2) + s.w / 2]
          : [Math.min(s.y1, s.y2) - s.w / 2, Math.max(s.y1, s.y2) + s.w / 2])
        return (
          <g key={op.id}
            opacity={ghost ? 0.28 : 1}
            style={{ cursor: interactive && !ghost ? 'pointer' : 'default', pointerEvents: interactive && !ghost ? 'auto' : 'none' }}
            onClick={interactive && !ghost ? (e => { e.stopPropagation(); onSelect(op.id) }) : undefined}>
            {spans.map(([a0, a1], i) => {
              if (!(a1 - a0 > 0.05) || !(q > 0.05)) return null
              // Top view: y = n-coord (front face at y = n, bottom). Side view:
              // x = n − z (front face at x = 0, left). Both use the pos_z-aware span.
              return view === 'top'
                ? <rect key={i} x={a0} y={zLo} width={a1 - a0} height={q}
                    fill={c.fill} stroke={c.stroke} strokeWidth={strokeW} vectorEffect="non-scaling-stroke" />
                : <rect key={i} x={n - zHi} y={sh - a1} width={q} height={a1 - a0}
                    fill={c.fill} stroke={c.stroke} strokeWidth={strokeW} vectorEffect="non-scaling-stroke" />
            })}
          </g>
        )
      })}
    </g>
  )
}

// The recess volume each area op removes from the panel, as CSG subtraction boxes
// (cabinet-space, in the Part's box frame). Cut from the front face z = n down by
// the op's real depth, opened a hair (0.8mm) above the surface so it breaches
// cleanly. Fed to <Part subtractions=…> so pockets are genuine recesses in the
// panel material — real depth, real walls — rather than a flat overlay on top.
export function buildOpSubtractions(ops: PartOp[], pu: number, pv: number, n: number, swap: boolean, mirror?: boolean):
  { center: [number, number, number]; size: [number, number, number] }[] {
  const out: { center: [number, number, number]; size: [number, number, number] }[] = []
  for (const op of ops) {
    let g = opFaceGlyph(op, pu, pv)
    if (mirror) g = mirrorGlyphX(g, pu)
    if (swap) g = swapGlyph(g)
    for (const r of g.rects) {
      // Skip degenerate boxes — a zero/negative-size subtraction makes @react-three/csg
      // (three-bvh-csg) throw or lose the WebGL context, which an in-progress or
      // offset-defined op can easily produce.
      if (!(r.w > 0.1) || !(r.h > 0.1)) continue
      // Recess spans the pos_z-aware depth range (Z0 = the active face surface). When
      // the op opens the surface (pos_z ≈ 0) overrun it a hair so the cut breaches
      // cleanly; a pos_z > 0 pocket stays buried (no surface breach), as it should.
      const { lo, hi } = opDepthSpan(op, n)
      const back = opFaceSide(op) === 'back'
      const breach = (op.pos_z ?? 0) <= 0.01 ? 0.8 : 0
      const zA = back ? lo - breach : lo
      const zB = back ? hi : hi + breach
      out.push({ center: [r.x + r.w / 2, r.y + r.h / 2, (zA + zB) / 2], size: [r.w, r.h, zB - zA] })
    }
  }
  return out
}

// Highlight colour for a selected / flagged op (else null → blend with the panel).
function highlightColour(selected: boolean, level?: 'error' | 'warn'): string | null {
  if (level === 'error') return '#ef4444'
  if (level === 'warn')  return '#f59e0b'
  if (selected)          return '#c4b5fd'
  return null
}

// 3D marker layer. Area-op recesses are cut into the panel itself (buildOpSubtractions
// → Part.subtractions), so here we only:
//   • draw drill holes as thin discs, flush on the face, and
//   • tint an op when it is selected / flagged; an unselected op shows no colour —
//     it reads as bare panel material, distinguished only by the faint edge outline
//     the Part's CSG mesh already draws around every recess.
// Every op keeps an (invisible when un-tinted) click target so 3D selection works.
export function OpMarkers3D({ ops, pu, pv, n, swap, mirror, activeFace, selectedId, onSelect, levels, panelColor = '#c9ccd4' }: {
  ops: PartOp[]; pu: number; pv: number; n: number; swap: boolean; mirror?: boolean; activeFace?: 'front' | 'back'; selectedId: string | null; onSelect: (id: string) => void
  levels: Record<string, 'error' | 'warn' | undefined>
  panelColor?: string
}) {
  return (
    <group>
      {ops.flatMap(op => {
        let g = opFaceGlyph(op, pu, pv)
        if (mirror) g = mirrorGlyphX(g, pu)
        if (swap) g = swapGlyph(g)
        const hl = highlightColour(op.id === selectedId, levels[op.id])
        // Placement honours pos_z (Z0 = the active face surface). Off-active-face ops
        // are ghosted (translucent, not clickable).
        const span = opDepthSpan(op, n)
        const back = opFaceSide(op) === 'back'
        const ghost = !!activeFace && (back ? 'back' : 'front') !== activeFace
        // Drill disc sits at the hole's start (the pos_z depth), a hair proud so it reads.
        const zDisc = back ? span.surface - 0.4 : span.surface + 0.4
        const click = ghost ? undefined : (e: { stopPropagation: () => void }) => { e.stopPropagation(); onSelect(op.id) }
        return [
          // Drill hole — a thin disc sitting flush on the face. Panel-coloured unless
          // highlighted; a faint black rim (Edges) marks the circle so it's legible.
          ...g.circles.map((cir, i) => (
            <mesh key={`${op.id}-c${i}`} position={[cir.cx, cir.cy, zDisc]} rotation={[Math.PI / 2, 0, 0]}
              onClick={click}>
              <cylinderGeometry args={[cir.r, cir.r, 0.8, 28]} />
              <meshStandardMaterial color={hl ?? panelColor} roughness={0.7} metalness={0.05} transparent={ghost} opacity={ghost ? 0.3 : 1} />
              <Edges threshold={20} color="#1e293b" linewidth={1} />
            </mesh>
          )),
          // Area op — the recess is already CSG-cut into the panel. This box is the
          // click target (transparent, opacity 0, when un-highlighted) and a colour
          // tint over the recess when the op is selected / flagged.
          ...g.rects.map((r, i) => {
            const depth = span.depth
            const zRect = (span.lo + span.hi) / 2
            return (
              <mesh key={`${op.id}-r${i}`} position={[r.x + r.w / 2, r.y + r.h / 2, zRect]} renderOrder={20}
                onClick={click}>
                <boxGeometry args={[r.w, r.h, depth]} />
                <meshBasicMaterial color={hl ?? '#000000'} transparent opacity={hl ? (ghost ? 0.14 : 0.32) : 0} depthWrite={false} depthTest={false} />
              </mesh>
            )
          }),
        ]
      })}
    </group>
  )
}
