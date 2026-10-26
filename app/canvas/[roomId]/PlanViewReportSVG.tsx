// New plan-view shop drawing — parallel to PlanDrawingSVG.
// What's drawn follows a display layer set (z_display_layers spec, Phase 3c):
// show / hide, line style, weight and opacity. Colours and background are
// ignored — prints stay black ink on white. Page extras (wall names, hatch,
// title block) are report toggles, not layer items.
// Reproduces the in-canvas plan view: 3-line dimension chain (wall-cab / base /
// overall) + perpendicular depth dims, plus door-swing arcs & drawer indicators.
// All sizes are in physical mm × scale = model mm, so the viewBox stays in model
// mm and the drawing prints at the correct physical size at 1:scale.
'use client'
import type { ReactNode, RefObject } from 'react'
import type { Wall, CabinetInstance, RoomFixture, RoomAnnotation, BenchtopInstance } from '@/src/lib/types'
import { btSegments, outlinePath, outlinePoints } from '@/src/lib/benchtopGeometry'
import { benchtopWallSpans, type BenchtopSpan } from '@/src/lib/benchtopDims'
import { openingSpans, fixtureChainSpans, fixtureLayer, type FixtureChainSpan } from '@/src/lib/fixtureGeometry'
import { OpeningSymbol, FixturesPlanPrint } from './FixturesPlan'
import AnnotationLayer from './AnnotationLayer'
import { IDENTITY_FRAME, annotLayerItem, annotationFramePoints } from '@/src/lib/annotations/geometry'
import { resolveStyle } from '@/src/lib/annotations/style'
import { isSpecBlock } from '@/src/lib/annotations/blocks'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import {
  toRad, wallEnd, wallDir, wallInwardNormal, wallMitrePolygon, wallPieces,
  cabinetPolygon, cabinetCornerPts, centroid, cabWallPerp, cabWallSide, cabT,
  cabinetToPlan, cabinetPlanFrame,
} from '@/src/lib/geometry'
import type { LayerView } from '@/src/lib/displayLayers/resolve'
import { casePartItem, kickPartItem, drawerBoxPartItem } from '@/src/lib/displayLayers/registry'
import { customPartItem } from '@/src/lib/displayLayers/customPartKinds'
import { planShowsCabinet } from '@/src/lib/displayLayers/cabinetShown'
import { caseBox, casePlanCorners, isSide, tkPlanBox, tkPlanCorners } from '@/src/lib/jointDrilling'
import { isShapedPanelKey } from '@/src/lib/cabinetShape/partKeys'
import { PRINT_INK, pen, atLeastMin } from '@/src/lib/shopDrawings/pens'
import { dbBox, slideBox } from '@/src/lib/drawerHardwareBoxes'
import { binOutlines } from '@/src/lib/binGeometry'
import { customExtents } from '@/src/lib/customPartBox'
import { returnWallThickness } from '@/src/lib/wallJoints'
import { shapedFrontMarks, sweepFlag, drawerLineOffset, benchReach, type LocalPt } from '@/src/lib/cabinetShape/planSwings'
import { roundMm } from '@/src/lib/format'
import { DimLabel, dimLabelFits, dimLabelSides, wallRowName } from './dimLabel'

/** Report-only page extras (not drawing layers). */
export interface PlanViewPageOptions {
  wallNames:  boolean
  hatch:      boolean
  /** Page-level (ShopTitleBlock, drawn by the report export) — not drawn in this SVG. */
  titleBlock: boolean
  /** z_CAD_tool decision 6: print annotations in their own colours (off = black). */
  annotColours: boolean
}

type Seg = { from: number; to: number; label: number }

// Mirror of WallDimensionChain.computeChain — cabinet widths + gaps along a wall.
// `extra` = other items in the row (appliances), as along-wall { t, dx }.
function computeChain(cabs: CabinetInstance[], wall: Wall, extra: { t: number; dx: number }[] = []): Seg[] {
  const sorted = [...cabs.map(c => ({ t: cabT(c, wall), dx: c.dx })), ...extra].sort((a, b) => a.t - b.t)
  const segs: Seg[] = []
  let cursor = 0
  for (const { t, dx } of sorted) {
    if (t > cursor + 0.5) segs.push({ from: cursor, to: t, label: roundMm(t - cursor) })
    segs.push({ from: t, to: t + dx, label: roundMm(dx) })
    cursor = t + dx
  }
  if (cursor < wall.length - 0.5) segs.push({ from: cursor, to: wall.length, label: roundMm(wall.length - cursor) })
  return segs
}

function cabinetTypeFill(cab: CabinetInstance): string {
  switch (cab.assembly_class) {
    case 'wall':
    case 'wall_corner':
      return '#ededed'
    case 'tall':
    case 'tall_corner':
      return '#e3e3e3'
    default:
      return '#f7f7f7'
  }
}

export default function PlanViewReportSVG({
  walls, cabinets, resolvedParts, svgRef, scale = 20, layers, show, fixtures = [], annotations = [], benchtops = [], hideSpecBlocks = false,
}: {
  walls:       Wall[]
  /** Placed fixtures — doors / windows (z_fixtures P5) split the walls and draw their symbol. */
  fixtures?:   RoomFixture[]
  /** CAD annotations (z_CAD_tool), plan rows — drawn on top, paper-mm sized at this scale. */
  annotations?: RoomAnnotation[]
  /** Benchtops (z_benchtop_builder) — outline, cutouts and join lines. */
  benchtops?:  BenchtopInstance[]
  cabinets:    CabinetInstance[]
  resolvedParts?: Map<string, ResolvedCabinet>
  svgRef:      RefObject<SVGSVGElement | null>
  scale?:      number
  layers:      LayerView
  show:        PlanViewPageOptions
  /** Shop drawings: spec blocks went to their own sheet — leave them off and out of the fit. */
  hideSpecBlocks?: boolean
}) {
  if (walls.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm py-12">
        No walls in this room.
      </div>
    )
  }

  const cx = centroid(walls)
  const P  = scale   // 1 physical mm in model mm
  // Layer props at a "zoom" that makes the layer dash pattern 1.6 / 0.8 paper mm.
  const lp = (id: string) => layers.props(id, 5 / P)
  const dimIds = ['dim_wall_chain', 'dim_base_chain', 'dim_benchtop', 'dim_wall_overall', 'dim_openings'] as const
  const showDims = layers.any(...dimIds)
  // Dimension chains measure only cabinets the layer set draws.
  const chainCabs = cabinets.filter(c => !c.rule_overrides?.UNDER_PANEL && planShowsCabinet(c, layers, resolvedParts?.get(c.id)))   // an under panel lies under its run
  const showOpenings = layers.show('fixture_openings')
  const openings = showOpenings ? fixtures.filter(f => f.category === 'opening' && f.wall_id) : []
  const openingsByWall = openingSpans(openings, walls, cx)
  // Free-standing appliances take their place in the base / wall-cabinet rows.
  const chainFixtures = fixtures.filter(f => layers.show(fixtureLayer(f.category)))

  // ── Content bounds (includes wall thickness corners) ──────────────────────
  const pts = walls.flatMap(w => {
    const e = wallEnd(w)
    if (w.wall_type === 'island') return [{ x: w.pos_x, y: w.pos_y }, e]
    const inward = wallInwardNormal(w, cx)
    const t = w.thickness
    return [
      { x: w.pos_x, y: w.pos_y },
      { x: w.pos_x - inward.x * t, y: w.pos_y - inward.y * t },
      e,
      { x: e.x - inward.x * t, y: e.y - inward.y * t },
    ]
  })
  // Annotations may sit outside the walls (notes off to the side) — fit them too.
  // Spec blocks are kept apart: the full size (with them) decides whether they move
  // to their own sheet, so it must not change when they're hidden.
  const specPts: { x: number; y: number }[] = []
  for (const a of annotations) {
    if (!layers.show(annotLayerItem(a.kind))) continue
    const into = isSpecBlock(a) ? specPts : pts
    into.push(...annotationFramePoints(a.kind, a.geom, a.text, resolveStyle(a.kind, a.style).size, P))
  }
  const drawnAnnots = hideSpecBlocks ? annotations.filter(a => !isSpecBlock(a)) : annotations
  // Benchtops overhang their cabinets (islands especially) — fit them too.
  if (layers.show('benchtops')) for (const bt of benchtops) pts.push(...outlinePoints(btSegments(bt), 4))
  // Cabinets past the wall faces (islands, back-side runs).
  for (const c of cabinets) {
    const w = walls.find(x => x.id === c.wall_id)
    if (w && planShowsCabinet(c, layers, resolvedParts?.get(c.id))) pts.push(...cabinetCornerPts(c, w, cabWallPerp(c, w, wallInwardNormal(w, cx))))
  }
  // Fixtures (own frame: translate + rotate); a door's swing reaches its width past the jambs.
  for (const f of fixtures) {
    if (f.category === 'opening' ? !(showOpenings && f.wall_id) : !layers.show(fixtureLayer(f.category))) continue
    const door = f.category === 'opening' && (f.kind ?? '').toLowerCase().includes('door') && !(f.kind ?? '').toLowerCase().includes('sliding')
    const y0 = door && (f.swing ?? 'in') !== 'in' ? -f.width : 0
    const y1 = door && (f.swing ?? 'in') === 'in' ? f.depth + f.width : f.depth
    const a = toRad(f.rotation), ca = Math.cos(a), sa = Math.sin(a)
    for (const [lx, ly] of [[0, y0], [f.width, y0], [f.width, y1], [0, y1]]) pts.push({ x: f.x + lx * ca - ly * sa, y: f.y + lx * sa + ly * ca })
  }

  // ── Scale-aware sizes (physical mm × scale = model mm) ─────────────────────
  // Pens (z_shop_drawings S2): paper-mm widths from the shared pen table, all black.
  const sw       = pen('heavy', P)   // wall stroke
  const fontSize = 3.5 * P    // cabinet label

  const dimSW = pen('thin', P)  // dimension line stroke
  const dimFS = 2.6 * P       // dimension text
  const tickH = 1.1 * P       // dimension tick half-length
  // Chain row offsets from outer wall face (innermost → outermost, like canvas 25/50/75)
  const ROW_WALLCAB = 4 * P
  const ROW_BASE    = 8 * P
  const ROW_OVERALL = 12 * P
  const ROW_OPEN_STEP = 4 * P   // doors / windows row sits where the overall was; the overall steps out
  const ROW_BH_STEP   = 4 * P   // bulkhead row (z_bulkhead) sits next to the overheads; rows past it step out
  const ROW_TOP_STEP  = 4 * P   // benchtop row sits just outside the base row; rows past it step out

  const swingSW = pen('thin', P)  // door swing arc
  const drawSW  = pen('thin', P)  // drawer indicator line
  const INK = PRINT_INK
  const CASE_FILL = '#bdbdbd'   // vertical case parts (fill only)
  // Layer-weighted line width, never below the minimum pen.
  const lw = (id: string, base: number) => atLeastMin(layers.w(id, base), P)
  const HATCH_ID = 'plan-report-wall-hatch'
  // Drawer lines start past any benchtop over the front, so the top's edge doesn't cover them.
  const topRings = layers.show('benchtops') ? benchtops.map(bt => outlinePoints(btSegments(bt), 4)) : []

  const topsByWall = new Map(walls.map(w => [w.id, layers.show('dim_benchtop') ? benchtopWallSpans(benchtops, w, wallInwardNormal(w, cx)) : []]))
  // Off-line labels sit up to ~2.15 fs from their line (DimLabel); fit a little past that.
  const labelReach = dimFS * 2.3
  const dimPts: { x: number; y: number }[] = []   // filled by dimLine / depthDim as the body builds

  // ── One dimension-chain line (main line + boundary ticks + segment labels) ─
  function dimLine(wall: Wall, out: { x: number; y: number }, rowDist: number, segs: Seg[], key: string, item: string, name?: string) {
    const lineW = lw(item, dimSW), dash = lp(item).strokeDasharray
    const wd = wallDir(wall)
    const thick = wall.wall_type === 'island' ? 0 : wall.thickness
    const textAngle = Math.cos(toRad(wall.angle)) < -0.001 ? wall.angle + 180 : wall.angle
    const pt = (t: number) => ({
      x: wall.pos_x + t * wd.x + out.x * (thick + rowDist),
      y: wall.pos_y + t * wd.y + out.y * (thick + rowDist),
    })
    const boundaries = Array.from(new Set([0, ...segs.flatMap(s => [s.from, s.to])]))
    const p0 = pt(0), pL = pt(wall.length)
    const sides = dimLabelSides(segs.map(s => ({ label: s.label, span: s.to - s.from })), dimFS)
    // Fit: the row both sides of the line, past each end for a short end segment's
    // label, and back to the row name's far end.
    const nameReach = name && layers.show('dim_row_labels')
      ? returnWallThickness(wall, walls, 'start') + dimFS * 0.6 + name.length * dimFS * 0.85 * 0.6 : 0
    for (const t of [-Math.max(nameReach, dimFS * 2), wall.length + dimFS * 2]) {
      const p = pt(t)
      for (const s of [-1, 1]) dimPts.push({ x: p.x + out.x * labelReach * s, y: p.y + out.y * labelReach * s })
    }
    return (
      <g key={key} pointerEvents="none" opacity={layers.op(item)}>
        <line x1={p0.x} y1={p0.y} x2={pL.x} y2={pL.y} stroke={INK} strokeWidth={lineW} strokeDasharray={dash} />
        {boundaries.map((t, i) => {
          const p = pt(t)
          return (
            <line key={i}
              x1={p.x - out.x * tickH} y1={p.y - out.y * tickH}
              x2={p.x + out.x * tickH} y2={p.y + out.y * tickH}
              stroke={INK} strokeWidth={lineW}
            />
          )
        })}
        {segs.map((seg, i) => {
          const mid = (seg.from + seg.to) / 2
          const p = pt(mid)
          return (
            <g key={`t${i}`} transform={`rotate(${textAngle}, ${p.x}, ${p.y})`}>
              <DimLabel x={p.x} y={p.y} label={seg.label} fs={dimFS} col={INK} bg="white" side={sides[i]}
                padY={0.7} fontFamily="Arial, Helvetica, sans-serif" />
            </g>
          )
        })}
        {/* Row name (`dim_row_labels`) past the wall start — see WallDimensionChain. */}
        {name && layers.show('dim_row_labels') && (() => {
          const p = pt(-(returnWallThickness(wall, walls, 'start') + dimFS * 0.6))
          const flipped = textAngle !== wall.angle
          return (
            <text x={p.x} y={p.y} transform={`rotate(${textAngle}, ${p.x}, ${p.y})`} textAnchor={flipped ? 'start' : 'end'}
              dominantBaseline="middle" fontSize={dimFS * 0.85} fill={INK}
              fontFamily="Arial, Helvetica, sans-serif">{name}</text>
          )
        })()}
      </g>
    )
  }

  // ── Perpendicular depth dimension at a wall end ───────────────────────────
  // Runs from the cabinet's back face to its front. backOffset shifts the start off
  // the wall line to the cabinet back (0 for front cabinets; wall thickness for
  // back-side cabinets, whose back sits on the outer face).
  function depthDim(wall: Wall, inward: { x: number; y: number }, tPos: number, dz: number, sign: 1 | -1, key: string, item: string, backOffset = 0) {
    const lineW = lw(item, dimSW)
    const wd = wallDir(wall)
    // Clear the return wall joined at this end before the paper-space gap.
    const off = returnWallThickness(wall, walls, tPos === 0 ? 'start' : 'end') + 5 * P
    const offX = wd.x * sign * off, offY = wd.y * sign * off
    const sx = wall.pos_x + tPos * wd.x + offX + inward.x * backOffset
    const sy = wall.pos_y + tPos * wd.y + offY + inward.y * backOffset
    const ex = sx + inward.x * dz, ey = sy + inward.y * dz
    const midX = (sx + ex) / 2, midY = (sy + ey) / 2
    const rawAngle = Math.atan2(inward.y, inward.x) * 180 / Math.PI
    const textAngle = Math.abs(rawAngle) > 90 ? rawAngle + 180 : rawAngle
    for (const p of [{ x: sx, y: sy }, { x: ex, y: ey }]) for (const s of [-1, 1]) dimPts.push({ x: p.x + wd.x * labelReach * s, y: p.y + wd.y * labelReach * s })
    return (
      <g key={key} pointerEvents="none" opacity={layers.op(item)}>
        <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={INK} strokeWidth={lineW} strokeDasharray={lp(item).strokeDasharray} />
        <line x1={sx - wd.x * tickH} y1={sy - wd.y * tickH} x2={sx + wd.x * tickH} y2={sy + wd.y * tickH} stroke={INK} strokeWidth={lineW} />
        <line x1={ex - wd.x * tickH} y1={ey - wd.y * tickH} x2={ex + wd.x * tickH} y2={ey + wd.y * tickH} stroke={INK} strokeWidth={lineW} />
        <g transform={`rotate(${textAngle}, ${midX}, ${midY})`}>
          <DimLabel x={midX} y={midY} label={roundMm(dz)} fs={dimFS} col={INK} bg="white" padY={0.7}
            side={dimLabelFits(roundMm(dz), dz, dimFS) ? 0 : 1} fontFamily="Arial, Helvetica, sans-serif" />
        </g>
      </g>
    )
  }

  // Built before the viewBox: dimLine / depthDim record where each dimension reaches.
  const body = (
    <>
      <defs>
        <pattern id={HATCH_ID} patternUnits="userSpaceOnUse" width={6 * P} height={6 * P} patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={6 * P} stroke={INK} strokeWidth={pen('fine', P)} />
        </pattern>
      </defs>
      {/* ── Walls (always on) — hatch fill toggles ── */}
      {walls.map(w => {
        if (w.wall_type === 'island') {
          if (!layers.show('island_line')) return null
          const e = wallEnd(w)
          return (
            <line key={w.id}
              x1={w.pos_x} y1={w.pos_y} x2={e.x} y2={e.y}
              stroke={INK} strokeWidth={lw('island_line', sw)} strokeLinecap="round"
            />
          )
        }
        const spans = openingsByWall.get(w.id)
        const polys = spans?.length
          ? wallPieces(w, walls, cx, spans).map(pts => pts.map(p => `${p.x},${p.y}`).join(' '))
          : [wallMitrePolygon(w, walls, cx)]
        return polys.filter(Boolean).map((poly, i) => (
          <polygon key={`${w.id}_${i}`}
            points={poly}
            fill={show.hatch ? `url(#${HATCH_ID})` : 'white'}
            stroke={INK} strokeWidth={sw} strokeLinejoin="miter"
          />
        ))
      })}

      {/* ── Doors / windows (z_fixtures P5) ── */}
      {showOpenings && openings.map(f => (
        <g key={f.id} transform={`translate(${f.x},${f.y}) rotate(${f.rotation})`}>
          <OpeningSymbol f={f} z={4 / P} color={INK} lw={sw} />
        </g>
      ))}

      {/* ── Wall names (toggle) — centred over each wall, capped at thickness ── */}
      {/* Matches the 3D room view WallLabel: wall midpoint shifted out by ½ thickness. */}
      {show.wallNames && walls.map(w => {
        if (w.wall_type === 'island' || !w.name) return null
        const inward = wallInwardNormal(w, cx)
        const e = wallEnd(w)
        const mx = (w.pos_x + e.x) / 2 - inward.x * w.thickness / 2
        const my = (w.pos_y + e.y) / 2 - inward.y * w.thickness / 2
        const fs = Math.min(w.thickness * 0.7, 5 * P)   // never larger than the wall band
        if (fs < 1) return null
        const textAngle = Math.cos(toRad(w.angle)) < -0.001 ? w.angle + 180 : w.angle
        return (
          <text key={`wn-${w.id}`}
            x={mx} y={my}
            transform={`rotate(${textAngle}, ${mx}, ${my})`}
            textAnchor="middle" dominantBaseline="central"
            fontSize={fs} fill={INK} fontFamily="Arial, Helvetica, sans-serif"
            style={{ pointerEvents: 'none' }}
          >
            {w.name}
          </text>
        )
      })}

      {/* ── Cabinets — parts per layer set; kick assemblies (under) first ── */}
      {[...cabinets].sort((a, b) => (a.is_kick_assembly ? 0 : 1) - (b.is_kick_assembly ? 0 : 1)).map(cab => {
        const wall = walls.find(w => w.id === cab.wall_id)
        if (!wall) return null
        const rp       = resolvedParts?.get(cab.id)
        if (!planShowsCabinet(cab, layers, rp)) return null
        // Shaped cabinets (z_cabinet_shape): the carcass and kick (4b) follow the
        // footprint; drawer hardware is still hidden.
        const shaped   = !!cab.footprint?.segments?.length
        const rpParts  = shaped ? undefined : rp
        const basePerp = wallInwardNormal(wall, cx)
        const perp     = cabWallPerp(cab, wall, basePerp)
        const poly     = cabinetPolygon(cab, wall, perp)
        // Cabinet frame → plan (turned, never mirrored, on left-handed walls).
        const toPlanC  = cabinetToPlan(cab, wall, perp)
        const at = (lx: number, lz: number) => { const q = toPlanC(lx, lz); return `${q.x},${q.y}` }
        const boxPoly = (b: { x: number; z: number; w: number; d: number }) =>
          `${at(b.x, b.z)} ${at(b.x + b.w, b.z)} ${at(b.x + b.w, b.z + b.d)} ${at(b.x, b.z + b.d)}`
        const inset    = Math.min(20, cab.dx * 0.08, cab.dz * 0.08)
        const innerPoly = !rp && !shaped && inset > 1 && cab.dx > inset * 2 && cab.dz > inset * 2
          ? boxPoly({ x: inset, z: inset, w: cab.dx - inset * 2, d: cab.dz - inset * 2 })
          : null
        const outline = !cab.is_kick_assembly && layers.show('carcass_outline')
        const carcP = lp('carcass_outline')
        // Kick assemblies label just behind their kick face, clear of member labels.
        const kickFace = cab.is_kick_assembly ? rp?.toekick_parts.find(p => p.part_key === 'kick_front_face') : undefined
        const labelPt = kickFace ? (() => {
          const b = tkPlanBox(kickFace)
          const lx = b.x + b.w / 2, lz = Math.max(0, b.z - 150)
          return toPlanC(lx, lz)
        })() : null
        const labelFs = layers.w('cabinet_labels', fontSize)
        // Shop drawings: the name sits just inside the cabinet's front edge (Mark, 2026-10-21) —
        // name only, no size text — so it stays clear of sinks / hobs in the middle of the top.
        // Moved on the canvas (label_offsets.plan): centre + offset in the cabinet's frame.
        const lo = cab.label_offsets?.plan
        const labelAt = lo ? toPlanC(cab.dx / 2 + lo.x, cab.dz / 2 + lo.y) : labelPt ?? toPlanC(cab.dx / 2, Math.max(cab.dz / 2, cab.dz - labelFs * 0.9))
        const hasLabel = layers.show('cabinet_labels') && !!cab.label
        return (
          <g key={cab.id}>
            {outline && (
              <g opacity={carcP.opacity}>
                <polygon points={poly} fill={cabinetTypeFill(cab)} fillOpacity={carcP.fillOpacity}
                  stroke={INK} strokeWidth={lw('carcass_outline', pen('medium', P))} strokeDasharray={carcP.strokeDasharray} />
                {innerPoly && <polygon points={innerPoly} fill="none" stroke={INK} strokeWidth={lw('carcass_outline', pen('thin', P))} />}
              </g>
            )}
            {(rp?.case_parts ?? []).map((p, i) => {
              const it = casePartItem(p.part_key)
              const b = caseBox(p)
              if (!layers.show(it) || b.w <= 0 || b.d <= 0) return null
              const pp = lp(it)
              const vertical = isSide(p.part_key) || p.part_key === 'back' || isShapedPanelKey(p.part_key) || !!p.upright || !!p.wrap
              const pts = casePlanCorners(p).map(q => at(q.x, q.z)).join(' ')
              return <polygon key={`cp-${i}`} points={pts} opacity={pp.opacity}
                fill={vertical ? CASE_FILL : 'none'} fillOpacity={vertical ? pp.fillOpacity : 0}
                stroke={INK} strokeWidth={lw(it, pen('thin', P))} strokeDasharray={pp.strokeDasharray} />
            })}
            {(rp?.toekick_parts ?? []).map((p, i) => {
              const it = kickPartItem(p.part_key)
              const b = tkPlanBox(p)
              if (!layers.show(it) || b.w <= 0 || b.d <= 0) return null
              const pp = lp(it)
              return <polygon key={`tk-${i}`} points={tkPlanCorners(p).map(q => at(q.x, q.z)).join(' ')} opacity={pp.opacity} fill="none"
                stroke={INK} strokeWidth={lw(it, pen('thin', P))} strokeDasharray={pp.strokeDasharray} />
            })}
            {layers.show('bins') && (rpParts?.drawer_stacks ?? []).flatMap((ds, si) => ds.drawer_type !== 'bin' ? [] : binOutlines(ds, 'top').map((o, i) => {
              const pp = lp('bins')   // pull-out bin (z_bin_cabinet): top outline instead of its rails
              return <polygon key={`bin-${si}-${i}`} points={o.pts.map(([x, z]) => at(x, z)).join(' ')} opacity={pp.opacity} fill="none"
                stroke={INK} strokeWidth={lw('bins', pen('thin', P))} strokeDasharray={pp.strokeDasharray} />
            }))}
            {(rpParts?.drawer_stacks ?? []).flatMap((ds, si) => ds.drawer_type === 'bin' ? [] : ds.box_parts.map((p, i) => {
              const it = drawerBoxPartItem(p.part_type)
              const b = dbBox(p), pp = lp(it)
              if (!layers.show(it) || b.w <= 0 || b.d <= 0) return null
              return <polygon key={`db-${si}-${i}`} points={boxPoly(b)} opacity={pp.opacity} fill="none"
                stroke={INK} strokeWidth={lw(it, pen('thin', P))} strokeDasharray={pp.strokeDasharray} />
            }))}
            {layers.show('drawer_runners') && (rpParts?.drawer_stacks ?? []).flatMap((ds, si) => ds.drawer_type === 'bin' ? [] : ds.slides.map((s, i) => {
              const b = slideBox(s), pp = lp('drawer_runners')
              if (b.w <= 0 || b.d <= 0) return null
              return <polygon key={`sl-${si}-${i}`} points={boxPoly(b)} opacity={pp.opacity} fill="none"
                stroke={INK} strokeWidth={lw('drawer_runners', pen('thin', P))} strokeDasharray={pp.strokeDasharray} />
            }))}
            {(rp?.custom_parts ?? []).map((p, i) => {
              const it = customPartItem(p)
              if (!p.show_in_room || !layers.show(it)) return null
              const { ex, ez } = customExtents(p.orientation, Number(p.dx), Number(p.dy), Number(p.dz))
              if (ex <= 0 || ez <= 0) return null
              const pp = lp(it)
              return <polygon key={`cu-${i}`} points={boxPoly({ x: p.x, z: p.z, w: ex, d: ez })} opacity={pp.opacity}
                fill="#d4d4d4" fillOpacity={pp.fillOpacity} stroke={INK}
                strokeWidth={lw(it, pen('front', P))} strokeDasharray={pp.strokeDasharray} />
            })}
            {layers.show('internal_outline') && cab.has_internal && cab.dx > 40 && cab.dz > 40 && (
              <polygon points={boxPoly({ x: 20, z: 20, w: cab.dx - 40, d: cab.dz - 40 })} opacity={lp('internal_outline').opacity}
                fill="none" stroke={INK} strokeWidth={lw('internal_outline', pen('thin', P))}
                strokeDasharray={lp('internal_outline').strokeDasharray ?? `${1 * P} ${0.8 * P}`} />
            )}
            {hasLabel && (
              <text
                x={labelAt.x} y={labelAt.y}
                textAnchor="middle" dominantBaseline="central"
                fontSize={labelFs} fill={INK} opacity={layers.op('cabinet_labels')}
                fontFamily="Arial, Helvetica, sans-serif"
              >
                {cab.label}
              </text>
            )}
          </g>
        )
      })}

      {/* ── Door swings + drawer indicators ── */}
      {layers.any('door_swings', 'drawer_lines') && cabinets.flatMap(cab => {
        if (!cab.has_face) return []
        const wall = walls.find(w => w.id === cab.wall_id)
        if (!wall) return []
        const perp = cabWallPerp(cab, wall, wallInwardNormal(wall, cx))
        // Cabinet frame: column 0 / hinge 'left' sit on the cabinet's own left —
        // turned on left-handed walls (back side), never mirrored.
        const { o: fo, x: wd } = cabinetPlanFrame(cab, wall, perp)
        const frontLeft = { x: fo.x + cab.dz * perp.x, y: fo.y + cab.dz * perp.y }

        // Shaped cabinets (z_cabinet_shape 3c): swings + drawer lines from the
        // resolved zones on every facet.
        if (cab.footprint?.segments?.length) {
          const rpS = resolvedParts?.get(cab.id)
          if (!rpS) return []
          const toP = (p: LocalPt) => ({ x: fo.x + p.x * wd.x + p.z * perp.x, y: fo.y + p.x * wd.y + p.z * perp.y })
          const vec = (v: LocalPt) => ({ x: v.x * wd.x + v.z * perp.x, y: v.x * wd.y + v.z * perp.y })
          const marks = shapedFrontMarks(rpS.face_zones)
          const out: ReactNode[] = []
          if (layers.show('door_swings')) {
            const swP = lp('door_swings'), swW = lw('door_swings', swingSW)
            const swDash = swP.strokeDasharray ?? `${1.2 * P} ${0.8 * P}`
            for (const s of marks.swings) {
              const h = toP(s.hinge), f = toP(s.free), e = toP(s.end)
              out.push(<path key={`swing-${cab.id}-${s.key}`}
                d={`M ${h.x} ${h.y} L ${f.x} ${f.y} A ${s.r} ${s.r} 0 0 ${sweepFlag(h, f, e)} ${e.x} ${e.y} Z`}
                fill="none" stroke={INK} strokeWidth={swW} opacity={swP.opacity}
                strokeDasharray={swDash} style={{ pointerEvents: 'none' }} />)
            }
          }
          if (layers.show('drawer_lines')) {
            const drP = lp('drawer_lines')
            for (const d of marks.drawers) {
              const o = vec(d.out), al = vec(d.along)
              const a = toP(d.a), b = toP(d.b)
              const { off, ins } = drawerLineOffset(d.step, Math.hypot(d.b.x - d.a.x, d.b.z - d.a.z), benchReach(topRings, a, b, o))
              out.push(<line key={`drawer-${cab.id}-${d.key}`}
                x1={a.x + off * o.x + ins * al.x} y1={a.y + off * o.y + ins * al.y}
                x2={b.x + off * o.x - ins * al.x} y2={b.y + off * o.y - ins * al.y}
                stroke={INK} strokeWidth={lw('drawer_lines', drawSW)} opacity={drP.opacity}
                strokeDasharray={drP.strokeDasharray ?? `${2 * P} ${1 * P}`} strokeLinecap="butt"
                style={{ pointerEvents: 'none' }} />)
            }
          }
          return out
        }

        type FgZone = { col_index: number; row_index: number; face_type: string; hinge_side?: string }
        type FgCol  = { col_index: number }
        const fg = cab.face_grid as { cols?: FgCol[]; zones?: FgZone[] } | null

        // Match resolver default when face_grid is null: 2 cols, left+right hinge doors
        const cols  = fg?.cols  ?? [{ col_index: 0 }, { col_index: 1 }]
        const zones: FgZone[] = fg?.zones ?? [
          { row_index: 0, col_index: 0, face_type: 'door', hinge_side: 'left'  },
          { row_index: 0, col_index: 1, face_type: 'door', hinge_side: 'right' },
        ]
        const nCols = cols.length
        const colW  = cab.dx / nCols
        const nodes: ReactNode[] = []

        // Door swing arcs — one per column (rows irrelevant in plan)
        const swP = lp('door_swings'), swW = lw('door_swings', swingSW)
        const swDash = swP.strokeDasharray ?? `${1.2 * P} ${0.8 * P}`
        if (layers.show('door_swings')) {
          const baseCross  = wd.x * perp.y - wd.y * perp.x
          const leftSweep  = baseCross > 0 ? 1 : 0
          const rightSweep = 1 - leftSweep
          const seenDoor = new Set<number>()
          for (const z of zones) {
            if (z.face_type !== 'door' || seenDoor.has(z.col_index)) continue
            seenDoor.add(z.col_index)
            const col = z.col_index
            const hinge = (z.hinge_side ?? 'left') as 'left' | 'right'
            const colLeft  = { x: frontLeft.x + col * colW * wd.x, y: frontLeft.y + col * colW * wd.y }
            const colRight = { x: colLeft.x + colW * wd.x, y: colLeft.y + colW * wd.y }
            const r = colW
            const θ = 15 * Math.PI / 180
            const c15 = Math.cos(θ), s15 = Math.sin(θ)
            if (hinge === 'left') {
              const endX = colLeft.x + r * (c15 * wd.x + s15 * perp.x)
              const endY = colLeft.y + r * (c15 * wd.y + s15 * perp.y)
              nodes.push(<path key={`swing-${cab.id}-${col}`}
                d={`M ${colLeft.x} ${colLeft.y} L ${colRight.x} ${colRight.y} A ${r} ${r} 0 0 ${leftSweep} ${endX} ${endY} Z`}
                fill="none" stroke={INK} strokeWidth={swW} opacity={swP.opacity}
                strokeDasharray={swDash} style={{ pointerEvents: 'none' }} />)
            } else {
              const endX = colRight.x + r * (c15 * (-wd.x) + s15 * perp.x)
              const endY = colRight.y + r * (c15 * (-wd.y) + s15 * perp.y)
              nodes.push(<path key={`swing-${cab.id}-${col}`}
                d={`M ${colRight.x} ${colRight.y} L ${colLeft.x} ${colLeft.y} A ${r} ${r} 0 0 ${rightSweep} ${endX} ${endY} Z`}
                fill="none" stroke={INK} strokeWidth={swW} opacity={swP.opacity}
                strokeDasharray={swDash} style={{ pointerEvents: 'none' }} />)
            }
          }
        }

        // Drawer indicators — one dashed line per drawer, stepped out from the front
        if (layers.show('drawer_lines')) {
          const drP = lp('drawer_lines')
          const colRowsSeen = new Map<number, number[]>()
          for (const z of zones) {
            if (z.face_type !== 'drawer_face') continue
            if (!colRowsSeen.has(z.col_index)) colRowsSeen.set(z.col_index, [])
            const rows = colRowsSeen.get(z.col_index)!
            if (!rows.includes(z.row_index)) rows.push(z.row_index)
          }
          for (const [col, rowIndices] of colRowsSeen) {
            rowIndices.sort((a, b) => a - b)
            const colLeft  = { x: frontLeft.x + col * colW * wd.x, y: frontLeft.y + col * colW * wd.y }
            const colRight = { x: colLeft.x + colW * wd.x, y: colLeft.y + colW * wd.y }
            const clear = benchReach(topRings, colLeft, colRight, perp)   // start past the benchtop front
            for (let i = 0; i < rowIndices.length; i++) {
              const { off: perpOff, ins: widthInset } = drawerLineOffset(i + 1, colW, clear)
              nodes.push(<line key={`drawer-${cab.id}-${col}-${rowIndices[i]}`}
                x1={colLeft.x  + perpOff * perp.x + widthInset * wd.x}
                y1={colLeft.y  + perpOff * perp.y + widthInset * wd.y}
                x2={colRight.x + perpOff * perp.x - widthInset * wd.x}
                y2={colRight.y + perpOff * perp.y - widthInset * wd.y}
                stroke={INK} strokeWidth={lw('drawer_lines', drawSW)} opacity={drP.opacity}
                strokeDasharray={drP.strokeDasharray ?? `${2 * P} ${1 * P}`} strokeLinecap="butt"
                style={{ pointerEvents: 'none' }} />)
            }
          }
        }

        return nodes
      })}

      {/* ── Benchtops — outline over the cabinets (sink / hob cutouts as holes), join lines dashed ── */}
      {layers.show('benchtops') && benchtops.map(bt => {
        const segs = btSegments(bt)
        if (segs.length < 2) return null
        const btP = lp('benchtops')
        return (
          <g key={`bt-${bt.id}`} opacity={btP.opacity}>
            <path d={outlinePath(segs, bt.cutout_polygons ?? [])} fillRule="evenodd" fill="none"
              stroke={INK} strokeWidth={lw('benchtops', pen('front', P))} strokeLinejoin="miter" strokeDasharray={btP.strokeDasharray} />
            {layers.show('benchtop_joins') && (bt.joins ?? []).map((j, i) => (
              <line key={i} x1={j.p0.x} y1={j.p0.y} x2={j.p1.x} y2={j.p1.y} opacity={layers.op('benchtop_joins')}
                stroke={INK} strokeWidth={lw('benchtop_joins', pen('thin', P))} strokeDasharray={`${1.5 * P} ${0.8 * P}`} />
            ))}
          </g>
        )
      })}

      {/* ── Fixtures & appliances (sinks, hobs, taps, appliances …) — over the benchtops ── */}
      <FixturesPlanPrint fixtures={fixtures} layers={layers} P={P} />

      {/* ── Dimension chains — wall-cab / base / overall + depth (layer items) ── */}
      {showDims && walls.map(w => {
        const inward = wallInwardNormal(w, cx)
        const out = { x: -inward.x, y: -inward.y }
        const allBase = chainCabs.filter(c => c.wall_id === w.id && (c.assembly_class === 'base' || c.assembly_class === 'base_corner'))
        const allWall = chainCabs.filter(c => c.wall_id === w.id && (c.assembly_class === 'wall' || c.assembly_class === 'wall_corner' || c.assembly_class === 'tall' || c.assembly_class === 'tall_corner'))
        const sideDepth = (cabs: CabinetInstance[]) => cabs.length ? Math.max(...cabs.map(c => c.dz)) : 0

        // One side's width chain (pushed out by depthOffset) + depth dims.
        const renderSide = (
          key: string,
          chainDir: { x: number; y: number },
          depthDir: { x: number; y: number },
          baseCabs: CabinetInstance[],
          wallCabs: CabinetInstance[],
          depthOffset: number,
          backOffset = 0,
          withOpenings = false,
          fx: FixtureChainSpan[] = [],
          tops: BenchtopSpan[] = [],
        ) => {
          const baseFx = fx.filter(s => s.row === 'floor'), wallFx = fx.filter(s => s.row === 'wall')
          // Doors / windows row (z_fixtures P5): wall start → jambs → wall end.
          const spans = withOpenings && layers.show('dim_openings') ? openingsByWall.get(w.id) ?? [] : []
          const openSegs: Seg[] = []
          let cur = 0
          for (const s of spans) {
            if (s.t0 > cur + 0.5) openSegs.push({ from: cur, to: s.t0, label: roundMm(s.t0 - cur) })
            openSegs.push({ from: s.t0, to: s.t1, label: roundMm(s.t1 - s.t0) })
            cur = s.t1
          }
          if (spans.length && cur < w.length - 0.5) openSegs.push({ from: cur, to: w.length, label: roundMm(w.length - cur) })
          // Bulkheads overlap the overheads below them — own row, same layer item.
          // Floating shelves (z_floating_shelf) share the outer row.
          const ohCabs = wallCabs.filter(c => !c.bulkhead && !c.float_shelf), bhCabs = wallCabs.filter(c => !!c.bulkhead || !!c.float_shelf)
          const showBh = layers.show('dim_wall_chain') && bhCabs.length > 0
          const bh = showBh ? ROW_BH_STEP : 0
          // Benchtop row just outside the base row: wall start → each top → wall end.
          const topSegs: Seg[] = []
          let tc = 0
          for (const s of tops) {
            if (s.t0 > tc + 0.5) topSegs.push({ from: tc, to: s.t0, label: roundMm(s.t0 - tc) })
            topSegs.push({ from: s.t0, to: s.t1, label: roundMm(s.t1 - s.t0) })
            tc = s.t1
          }
          if (tops.length && tc < w.length - 0.5) topSegs.push({ from: tc, to: w.length, label: roundMm(w.length - tc) })
          const ts = topSegs.length ? ROW_TOP_STEP : 0
          const rowOverall = ROW_OVERALL + bh + ts + (openSegs.length ? ROW_OPEN_STEP : 0)
          const baseSegs    = computeChain(baseCabs, w, baseFx)
          const wallCabSegs = computeChain(ohCabs, w, wallFx)
          const overallSeg: Seg[] = [{ from: 0, to: w.length, label: roundMm(w.length) }]
          // Depths at the wall ends: the benchtop (not the base carcass) and the overheads.
          const wallDz = wallCabs.length > 0 ? Math.max(...wallCabs.map(c => c.dz)) : 0
          return (
            <g key={key}>
              {layers.show('dim_wall_chain') && (ohCabs.length > 0 || wallFx.length > 0) && dimLine(w, chainDir, depthOffset + ROW_WALLCAB, wallCabSegs, `wc-${key}`, 'dim_wall_chain', wallRowName(ohCabs, wallFx.length > 0))}
              {showBh && dimLine(w, chainDir, depthOffset + ROW_WALLCAB + ROW_BH_STEP, computeChain(bhCabs, w), `bh-${key}`, 'dim_wall_chain', 'BULKHEAD')}
              {layers.show('dim_base_chain') && (baseCabs.length > 0 || baseFx.length > 0) && dimLine(w, chainDir, depthOffset + ROW_BASE + bh, baseSegs, `bc-${key}`, 'dim_base_chain', 'BASE')}
              {topSegs.length > 0 && dimLine(w, chainDir, depthOffset + ROW_BASE + bh + ROW_TOP_STEP, topSegs, `bt-${key}`, 'dim_benchtop', 'BENCHTOP')}
              {openSegs.length > 0 && dimLine(w, chainDir, depthOffset + ROW_OVERALL + bh + ts, openSegs, `op-${key}`, 'dim_openings', 'OPENINGS')}
              {layers.show('dim_wall_overall') && dimLine(w, chainDir, depthOffset + rowOverall, overallSeg, `ov-${key}`, 'dim_wall_overall', 'WALL')}
              {topSegs.length > 0 && (
                <>
                  {depthDim(w, depthDir, 0,        tops[0].depth,               -1, `dd0-${key}`, 'dim_benchtop', tops[0].from)}
                  {depthDim(w, depthDir, w.length, tops[tops.length - 1].depth,  1, `dd1-${key}`, 'dim_benchtop', tops[tops.length - 1].from)}
                </>
              )}
              {layers.show('dim_wall_chain') && wallDz > 0 && (
                <>
                  {depthDim(w, depthDir, 0,        wallDz, -1, `wdd0-${key}`, 'dim_wall_chain', backOffset)}
                  {depthDim(w, depthDir, w.length, wallDz,  1, `wdd1-${key}`, 'dim_wall_chain', backOffset)}
                </>
              )}
            </g>
          )
        }

        // Split cabinets by which wall face they sit on (back-side cabinets sit on
        // the outer face — see wallAnchorPoint).
        const inBase  = allBase.filter(c => cabWallSide(c, w) === 'face')
        const outBase = allBase.filter(c => cabWallSide(c, w) === 'back')
        const inWall  = allWall.filter(c => cabWallSide(c, w) === 'face')
        const outWall = allWall.filter(c => cabWallSide(c, w) === 'back')
        const fxSpans = fixtureChainSpans(chainFixtures, w, cx)
        const inFx = fxSpans.filter(s => s.side === 'face'), outFx = fxSpans.filter(s => s.side === 'back')
        const hasIn  = inBase.length > 0 || inWall.length > 0 || inFx.length > 0
        const hasOut = outBase.length > 0 || outWall.length > 0 || outFx.length > 0
        const wTops = topsByWall.get(w.id) ?? []
        const inTops = wTops.filter(s => s.side === 'face'), outTops = wTops.filter(s => s.side === 'back')

        // Perimeter wall with cabinets only on the room side (the common case): keep
        // the historic single chain on the empty outward side, depth dims inward.
        if (w.wall_type !== 'island' && !hasOut) {
          return <g key={`dim-${w.id}`}>{renderSide(`m-${w.id}`, out, inward, allBase, allWall, 0, 0, true, inFx, inTops)}</g>
        }

        // Island, or a perimeter wall with back-side cabinets: dimension each occupied
        // face on its own side, beyond that side's deepest cabinet. Back-side cabinets
        // sit on the outer face, so their depth dims start a wall thickness out.
        const outBackOffset = w.wall_type === 'island' ? 0 : w.thickness
        return (
          <g key={`dim-${w.id}`}>
            {hasIn && renderSide(`in-${w.id}`, inward, inward, inBase, inWall, sideDepth([...inBase, ...inWall]), 0, false, inFx, inTops)}
            {(hasOut || !hasIn) && renderSide(`out-${w.id}`, out, out, outBase, outWall, sideDepth([...outBase, ...outWall]), outBackOffset, true, outFx, outTops)}
          </g>
        )
      })}

      {/* ── CAD annotations (z_CAD_tool) — black unless "Annotation colours" is ticked ── */}
      <AnnotationLayer annotations={drawnAnnots} frame={IDENTITY_FRAME} paper={P} layers={layers} printColours={show.annotColours} />
    </>
  )

  // ── ViewBox — fitted to what's drawn (not a worst-case border on every side), so
  // the sheet centres the real drawing (z_shop_drawings, Mark 2026-10-25).
  const pad = 4 * P
  const extent = (xs: { x: number; y: number }[]) => {
    const x = Math.min(...xs.map(p => p.x)) - pad, y = Math.min(...xs.map(p => p.y)) - pad
    return { x, y, w: Math.max(...xs.map(p => p.x)) + pad - x, h: Math.max(...xs.map(p => p.y)) + pad - y }
  }
  const full = extent([...pts, ...dimPts, ...specPts])
  const { x: vbX, y: vbY, w: vbW, h: vbH } = hideSpecBlocks ? extent([...pts, ...dimPts]) : full

  return (
    <svg
      ref={svgRef}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      xmlns="http://www.w3.org/2000/svg"
      data-vb-w={vbW} data-vb-h={vbH} data-full-w={full.w} data-full-h={full.h}
      fontFamily="Arial, Helvetica, sans-serif"
      shapeRendering="geometricPrecision"
      textRendering="geometricPrecision"
      style={{ width: '100%', height: 'auto', background: 'white', display: 'block' }}
    >
      {body}
    </svg>
  )
}
