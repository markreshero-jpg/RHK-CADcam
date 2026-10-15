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
import type { Wall, CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import {
  toRad, wallEnd, wallDir, wallInwardNormal, wallMitrePolygon,
  cabinetPolygon, cabinetCenterPt, centroid, cabWallPerp, cabWallSide, cabT,
  cabinetToPlan, cabinetPlanFrame,
} from '@/src/lib/geometry'
import type { LayerView } from '@/src/lib/displayLayers/resolve'
import { casePartItem, kickPartItem } from '@/src/lib/displayLayers/registry'
import { customPartItem } from '@/src/lib/displayLayers/customPartKinds'
import { planShowsCabinet } from '@/src/lib/displayLayers/cabinetShown'
import { caseBox, casePlanCorners, isSide, tkPlanBox, tkPlanCorners } from '@/src/lib/jointDrilling'
import { isShapedPanelKey } from '@/src/lib/cabinetShape/partKeys'
import { dbBox, slideBox } from '@/src/lib/drawerHardwareBoxes'
import { customExtents } from '@/src/lib/customPartBox'
import { returnWallThickness } from '@/src/lib/wallJoints'
import { shapedFrontMarks, sweepFlag, type LocalPt } from '@/src/lib/cabinetShape/planSwings'

/** Report-only page extras (not drawing layers). */
export interface PlanViewPageOptions {
  wallNames:  boolean
  hatch:      boolean
  titleBlock: boolean
}

type Seg = { from: number; to: number; label: number }

// Mirror of WallDimensionChain.computeChain — cabinet widths + gaps along a wall.
function computeChain(cabs: CabinetInstance[], wall: Wall): Seg[] {
  const sorted = [...cabs].sort((a, b) => cabT(a, wall) - cabT(b, wall))
  const segs: Seg[] = []
  let cursor = 0
  for (const cab of sorted) {
    const t = cabT(cab, wall)
    if (t > cursor + 0.5) segs.push({ from: cursor, to: t, label: Math.round(t - cursor) })
    segs.push({ from: t, to: t + cab.dx, label: Math.round(cab.dx) })
    cursor = t + cab.dx
  }
  if (cursor < wall.length - 0.5) segs.push({ from: cursor, to: wall.length, label: Math.round(wall.length - cursor) })
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
  walls, cabinets, resolvedParts, svgRef, scale = 20, layers, show, projectName, roomName, paperKey,
}: {
  walls:       Wall[]
  cabinets:    CabinetInstance[]
  resolvedParts?: Map<string, ResolvedCabinet>
  svgRef:      RefObject<SVGSVGElement | null>
  scale?:      number
  layers:      LayerView
  show:        PlanViewPageOptions
  projectName: string
  roomName:    string
  paperKey:    string   // e.g. 'A3L'
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
  const dimIds = ['dim_wall_chain', 'dim_base_chain', 'dim_wall_overall'] as const
  const showDims = layers.any(...dimIds)
  // Dimension chains measure only cabinets the layer set draws.
  const chainCabs = cabinets.filter(c => planShowsCabinet(c, layers, resolvedParts?.get(c.id)))

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
  const minX = Math.min(...pts.map(p => p.x))
  const maxX = Math.max(...pts.map(p => p.x))
  const minY = Math.min(...pts.map(p => p.y))
  const maxY = Math.max(...pts.map(p => p.y))

  // ── Scale-aware sizes (physical mm × scale = model mm) ─────────────────────
  const sw       = 0.45 * P   // wall stroke
  const fontSize = 3.5 * P    // cabinet label

  const dimSW = 0.3 * P       // dimension line stroke
  const dimFS = 2.6 * P       // dimension text
  const tickH = 1.1 * P       // dimension tick half-length
  // Chain row offsets from outer wall face (innermost → outermost, like canvas 25/50/75)
  const ROW_WALLCAB = 4 * P
  const ROW_BASE    = 8 * P
  const ROW_OVERALL = 12 * P

  const swingSW = 0.25 * P    // door swing arc
  const drawSW  = 0.25 * P    // drawer indicator line
  const INK = '#000'
  const INK2 = '#222'
  const INK3 = '#333'
  const CARCASE_LINE = '#777'
  const HATCH_ID = 'plan-report-wall-hatch'

  // ── Title block dimensions ────────────────────────────────────────────────
  const tbRowH = 4.2 * P
  const tbPad  = 1.5 * P
  const tbRows = 5
  const tbH    = tbRowH * tbRows + tbPad * 2
  const tbW    = 66 * P

  // ── ViewBox padding — extend for dims / title block when shown ────────────
  const maxThick = Math.max(0, ...walls.filter(w => w.wall_type !== 'island').map(w => w.thickness))
  // Chains stack beyond their cabinets, so the viewBox must reserve room for the
  // deepest cabinet a chain must clear: any island cabinet, plus back-side cabinets
  // on a perimeter wall (whose outer chain is pushed past them).
  const wallById = new Map(walls.map(w => [w.id, w]))
  const chainClearDepth = Math.max(0, ...chainCabs
    .filter(c => {
      const w = c.wall_id ? wallById.get(c.wall_id) : undefined
      if (!w) return false
      return w.wall_type === 'island' || cabWallSide(c, w) === 'back'
    })
    .map(c => c.dz))
  const basePad  = 4 * P
  const dimExtra = showDims ? maxThick + chainClearDepth + ROW_OVERALL + dimFS * 2 + tickH : 0
  const padL = basePad + dimExtra
  const padR = basePad + dimExtra
  const padT = basePad + dimExtra
  const padB = basePad + dimExtra + (show.titleBlock ? tbH + 2 * P : 0)

  const vbX = minX - padL
  const vbY = minY - padT
  const vbW = (maxX - minX) + padL + padR
  const vbH = (maxY - minY) + padT + padB

  // Title block anchored bottom-left of the viewBox
  const tbX = vbX + 1 * P
  const tbY = vbY + vbH - tbH - 1 * P

  const paperLabel = `${paperKey.replace(/L$/, '')} Landscape`
  const d = new Date()
  const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`

  // ── One dimension-chain line (main line + boundary ticks + segment labels) ─
  function dimLine(wall: Wall, out: { x: number; y: number }, rowDist: number, segs: Seg[], key: string, item: string) {
    const lineW = layers.w(item, dimSW), dash = lp(item).strokeDasharray
    const wd = wallDir(wall)
    const thick = wall.wall_type === 'island' ? 0 : wall.thickness
    const textAngle = Math.cos(toRad(wall.angle)) < -0.001 ? wall.angle + 180 : wall.angle
    const pt = (t: number) => ({
      x: wall.pos_x + t * wd.x + out.x * (thick + rowDist),
      y: wall.pos_y + t * wd.y + out.y * (thick + rowDist),
    })
    const boundaries = Array.from(new Set([0, ...segs.flatMap(s => [s.from, s.to])]))
    const p0 = pt(0), pL = pt(wall.length)
    const padX = dimFS * 1.7, padY = dimFS * 0.7
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
              <rect x={p.x - padX} y={p.y - padY} width={padX * 2} height={padY * 2} fill="white" />
              <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
                fontSize={dimFS} fill={INK} fontFamily="Arial, Helvetica, sans-serif">
                {seg.label}
              </text>
            </g>
          )
        })}
      </g>
    )
  }

  // ── Perpendicular depth dimension at a wall end ───────────────────────────
  // Runs from the cabinet's back face to its front. backOffset shifts the start off
  // the wall line to the cabinet back (0 for front cabinets; wall thickness for
  // back-side cabinets, whose back sits on the outer face).
  function depthDim(wall: Wall, inward: { x: number; y: number }, tPos: number, dz: number, sign: 1 | -1, key: string, item: string, backOffset = 0) {
    const lineW = layers.w(item, dimSW)
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
    const padX = dimFS * 1.7, padY = dimFS * 0.7
    return (
      <g key={key} pointerEvents="none" opacity={layers.op(item)}>
        <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={INK} strokeWidth={lineW} strokeDasharray={lp(item).strokeDasharray} />
        <line x1={sx - wd.x * tickH} y1={sy - wd.y * tickH} x2={sx + wd.x * tickH} y2={sy + wd.y * tickH} stroke={INK} strokeWidth={lineW} />
        <line x1={ex - wd.x * tickH} y1={ey - wd.y * tickH} x2={ex + wd.x * tickH} y2={ey + wd.y * tickH} stroke={INK} strokeWidth={lineW} />
        <g transform={`rotate(${textAngle}, ${midX}, ${midY})`}>
          <rect x={midX - padX} y={midY - padY} width={padX * 2} height={padY * 2} fill="white" />
          <text x={midX} y={midY} textAnchor="middle" dominantBaseline="middle"
            fontSize={dimFS} fill={INK} fontFamily="Arial, Helvetica, sans-serif">
            {Math.round(dz)}
          </text>
        </g>
      </g>
    )
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      xmlns="http://www.w3.org/2000/svg"
      data-vb-w={vbW} data-vb-h={vbH}
      shapeRendering="geometricPrecision"
      textRendering="geometricPrecision"
      style={{ width: '100%', height: 'auto', background: 'white', display: 'block' }}
    >
      <defs>
        <pattern id={HATCH_ID} patternUnits="userSpaceOnUse" width={6 * P} height={6 * P} patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={6 * P} stroke={INK3} strokeWidth={0.12 * P} />
        </pattern>
      </defs>
      {/* ── Walls (always on) — hatch fill toggles ── */}
      {walls.map(w => {
        if (w.wall_type === 'island') {
          const e = wallEnd(w)
          return (
            <line key={w.id}
              x1={w.pos_x} y1={w.pos_y} x2={e.x} y2={e.y}
              stroke={INK} strokeWidth={sw * 4} strokeLinecap="round"
            />
          )
        }
        const poly = wallMitrePolygon(w, walls, cx)
        if (!poly) return null
        return (
          <polygon key={w.id}
            points={poly}
            fill={show.hatch ? `url(#${HATCH_ID})` : 'white'}
            stroke={INK} strokeWidth={sw} strokeLinejoin="miter"
          />
        )
      })}

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
        })() : cabinetCenterPt(cab, wall, perp)
        const labelFs = layers.w('cabinet_labels', fontSize)
        const sizeFs  = layers.w('cabinet_sizes', fontSize * 0.7)
        const hasLabel = layers.show('cabinet_labels') && !!cab.label
        return (
          <g key={cab.id}>
            {outline && (
              <g opacity={carcP.opacity}>
                <polygon points={poly} fill={cabinetTypeFill(cab)} fillOpacity={carcP.fillOpacity}
                  stroke={INK2} strokeWidth={layers.w('carcass_outline', sw * 0.7)} strokeDasharray={carcP.strokeDasharray} />
                {innerPoly && <polygon points={innerPoly} fill="none" stroke={CARCASE_LINE} strokeWidth={layers.w('carcass_outline', sw * 0.35)} />}
              </g>
            )}
            {(rp?.case_parts ?? []).map((p, i) => {
              const it = casePartItem(p.part_key)
              const b = caseBox(p)
              if (!layers.show(it) || b.w <= 0 || b.d <= 0) return null
              const pp = lp(it)
              const vertical = isSide(p.part_key) || p.part_key === 'back' || isShapedPanelKey(p.part_key) || !!p.upright
              const pts = casePlanCorners(p).map(q => at(q.x, q.z)).join(' ')
              return <polygon key={`cp-${i}`} points={pts} opacity={pp.opacity}
                fill={vertical ? CARCASE_LINE : 'none'} fillOpacity={vertical ? 0.45 * pp.fillOpacity : 0}
                stroke={CARCASE_LINE} strokeWidth={layers.w(it, sw * 0.35)} strokeDasharray={pp.strokeDasharray} />
            })}
            {(rp?.toekick_parts ?? []).map((p, i) => {
              const it = kickPartItem(p.part_key)
              const b = tkPlanBox(p)
              if (!layers.show(it) || b.w <= 0 || b.d <= 0) return null
              const pp = lp(it)
              return <polygon key={`tk-${i}`} points={tkPlanCorners(p).map(q => at(q.x, q.z)).join(' ')} opacity={pp.opacity} fill="none"
                stroke={INK3} strokeWidth={layers.w(it, sw * 0.35)} strokeDasharray={pp.strokeDasharray} />
            })}
            {layers.show('drawer_boxes') && (rpParts?.drawer_stacks ?? []).flatMap((ds, si) => ds.box_parts.map((p, i) => {
              const b = dbBox(p), pp = lp('drawer_boxes')
              if (b.w <= 0 || b.d <= 0) return null
              return <polygon key={`db-${si}-${i}`} points={boxPoly(b)} opacity={pp.opacity} fill="none"
                stroke={INK3} strokeWidth={layers.w('drawer_boxes', sw * 0.3)} strokeDasharray={pp.strokeDasharray} />
            }))}
            {layers.show('drawer_runners') && (rpParts?.drawer_stacks ?? []).flatMap((ds, si) => ds.slides.map((s, i) => {
              const b = slideBox(s), pp = lp('drawer_runners')
              if (b.w <= 0 || b.d <= 0) return null
              return <polygon key={`sl-${si}-${i}`} points={boxPoly(b)} opacity={pp.opacity} fill="none"
                stroke={INK3} strokeWidth={layers.w('drawer_runners', sw * 0.3)} strokeDasharray={pp.strokeDasharray} />
            }))}
            {(rp?.custom_parts ?? []).map((p, i) => {
              const it = customPartItem(p)
              if (!p.show_in_room || !layers.show(it)) return null
              const { ex, ez } = customExtents(p.orientation, Number(p.dx), Number(p.dy), Number(p.dz))
              if (ex <= 0 || ez <= 0) return null
              const pp = lp(it)
              return <polygon key={`cu-${i}`} points={boxPoly({ x: p.x, z: p.z, w: ex, d: ez })} opacity={pp.opacity}
                fill="#d4d4d4" fillOpacity={pp.fillOpacity} stroke={INK2}
                strokeWidth={layers.w(it, sw * 0.5)} strokeDasharray={pp.strokeDasharray} />
            })}
            {layers.show('internal_outline') && cab.has_internal && cab.dx > 40 && cab.dz > 40 && (
              <polygon points={boxPoly({ x: 20, z: 20, w: cab.dx - 40, d: cab.dz - 40 })} opacity={lp('internal_outline').opacity}
                fill="none" stroke={INK3} strokeWidth={layers.w('internal_outline', sw * 0.3)}
                strokeDasharray={lp('internal_outline').strokeDasharray ?? `${1 * P} ${0.8 * P}`} />
            )}
            {hasLabel && (
              <text
                x={labelPt.x} y={labelPt.y}
                textAnchor="middle" dominantBaseline="central"
                fontSize={labelFs} fill={INK} opacity={layers.op('cabinet_labels')}
                fontFamily="Arial, Helvetica, sans-serif"
              >
                {cab.label}
              </text>
            )}
            {layers.show('cabinet_sizes') && (
              <text
                x={labelPt.x} y={labelPt.y + (hasLabel ? labelFs * 0.55 + sizeFs * 0.6 : 0)}
                textAnchor="middle" dominantBaseline="central"
                fontSize={sizeFs} fill={INK2} opacity={layers.op('cabinet_sizes')}
                fontFamily="Arial, Helvetica, sans-serif"
              >
                {Math.round(cab.dx)}×{Math.round(cab.dz)}
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
            const swP = lp('door_swings'), swW = layers.w('door_swings', swingSW)
            const swDash = swP.strokeDasharray ?? `${1.2 * P} ${0.8 * P}`
            for (const s of marks.swings) {
              const h = toP(s.hinge), f = toP(s.free), e = toP(s.end)
              out.push(<path key={`swing-${cab.id}-${s.key}`}
                d={`M ${h.x} ${h.y} L ${f.x} ${f.y} A ${s.r} ${s.r} 0 0 ${sweepFlag(h, f, e)} ${e.x} ${e.y} Z`}
                fill="none" stroke={INK3} strokeWidth={swW} opacity={swP.opacity}
                strokeDasharray={swDash} style={{ pointerEvents: 'none' }} />)
            }
          }
          if (layers.show('drawer_lines')) {
            const drP = lp('drawer_lines')
            for (const d of marks.drawers) {
              const o = vec(d.out), al = vec(d.along)
              const off = d.step * 2 * P, ins = d.step * 4 * P
              const a = toP(d.a), b = toP(d.b)
              out.push(<line key={`drawer-${cab.id}-${d.key}`}
                x1={a.x + off * o.x + ins * al.x} y1={a.y + off * o.y + ins * al.y}
                x2={b.x + off * o.x - ins * al.x} y2={b.y + off * o.y - ins * al.y}
                stroke={INK3} strokeWidth={layers.w('drawer_lines', drawSW)} opacity={drP.opacity}
                strokeDasharray={drP.strokeDasharray ?? `${1.5 * P} ${0.8 * P}`} strokeLinecap="round"
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
        const swP = lp('door_swings'), swW = layers.w('door_swings', swingSW)
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
                fill="none" stroke={INK3} strokeWidth={swW} opacity={swP.opacity}
                strokeDasharray={swDash} style={{ pointerEvents: 'none' }} />)
            } else {
              const endX = colRight.x + r * (c15 * (-wd.x) + s15 * perp.x)
              const endY = colRight.y + r * (c15 * (-wd.y) + s15 * perp.y)
              nodes.push(<path key={`swing-${cab.id}-${col}`}
                d={`M ${colRight.x} ${colRight.y} L ${colLeft.x} ${colLeft.y} A ${r} ${r} 0 0 ${rightSweep} ${endX} ${endY} Z`}
                fill="none" stroke={INK3} strokeWidth={swW} opacity={swP.opacity}
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
            for (let i = 0; i < rowIndices.length; i++) {
              const perpOff    = (i + 1) * 2 * P
              const widthInset = (i + 1) * 4 * P
              nodes.push(<line key={`drawer-${cab.id}-${col}-${rowIndices[i]}`}
                x1={colLeft.x  + perpOff * perp.x + widthInset * wd.x}
                y1={colLeft.y  + perpOff * perp.y + widthInset * wd.y}
                x2={colRight.x + perpOff * perp.x - widthInset * wd.x}
                y2={colRight.y + perpOff * perp.y - widthInset * wd.y}
                stroke={INK3} strokeWidth={layers.w('drawer_lines', drawSW)} opacity={drP.opacity}
                strokeDasharray={drP.strokeDasharray ?? `${1.5 * P} ${0.8 * P}`} strokeLinecap="round"
                style={{ pointerEvents: 'none' }} />)
            }
          }
        }

        return nodes
      })}

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
        ) => {
          const baseSegs    = computeChain(baseCabs, w)
          const wallCabSegs = computeChain(wallCabs, w)
          const overallSeg: Seg[] = [{ from: 0, to: w.length, label: Math.round(w.length) }]
          const baseDz = baseCabs.length > 0 ? Math.max(...baseCabs.map(c => c.dz)) : 0
          const wallDz = wallCabs.length > 0 ? Math.max(...wallCabs.map(c => c.dz)) : 0
          const showWallDepthSeparate = wallDz > 0 && Math.abs(wallDz - baseDz) > 5
          return (
            <g key={key}>
              {layers.show('dim_wall_chain') && wallCabs.length > 0 && dimLine(w, chainDir, depthOffset + ROW_WALLCAB, wallCabSegs, `wc-${key}`, 'dim_wall_chain')}
              {layers.show('dim_base_chain') && baseCabs.length > 0 && dimLine(w, chainDir, depthOffset + ROW_BASE, baseSegs, `bc-${key}`, 'dim_base_chain')}
              {layers.show('dim_wall_overall') && dimLine(w, chainDir, depthOffset + ROW_OVERALL, overallSeg, `ov-${key}`, 'dim_wall_overall')}
              {layers.show('dim_base_chain') && baseDz > 0 && (
                <>
                  {depthDim(w, depthDir, 0,        baseDz, -1, `dd0-${key}`, 'dim_base_chain', backOffset)}
                  {depthDim(w, depthDir, w.length, baseDz,  1, `dd1-${key}`, 'dim_base_chain', backOffset)}
                </>
              )}
              {layers.show('dim_wall_chain') && showWallDepthSeparate && (
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
        const hasIn  = inBase.length > 0 || inWall.length > 0
        const hasOut = outBase.length > 0 || outWall.length > 0

        // Perimeter wall with cabinets only on the room side (the common case): keep
        // the historic single chain on the empty outward side, depth dims inward.
        if (w.wall_type !== 'island' && !hasOut) {
          return <g key={`dim-${w.id}`}>{renderSide(`m-${w.id}`, out, inward, allBase, allWall, 0)}</g>
        }

        // Island, or a perimeter wall with back-side cabinets: dimension each occupied
        // face on its own side, beyond that side's deepest cabinet. Back-side cabinets
        // sit on the outer face, so their depth dims start a wall thickness out.
        const outBackOffset = w.wall_type === 'island' ? 0 : w.thickness
        return (
          <g key={`dim-${w.id}`}>
            {hasIn && renderSide(`in-${w.id}`, inward, inward, inBase, inWall, sideDepth([...inBase, ...inWall]))}
            {(hasOut || !hasIn) && renderSide(`out-${w.id}`, out, out, outBase, outWall, sideDepth([...outBase, ...outWall]), outBackOffset)}
          </g>
        )
      })}

      {/* ── Title block (toggle) ── */}
      {show.titleBlock && (
        <g fontFamily="Arial, Helvetica, sans-serif" fill={INK}>
          <rect x={tbX} y={tbY} width={tbW} height={tbH} fill="white" stroke={INK} strokeWidth={sw} />
          <line
            x1={tbX} y1={tbY + tbPad + tbRowH} x2={tbX + tbW} y2={tbY + tbPad + tbRowH}
            stroke={INK} strokeWidth={sw * 0.6}
          />
          {[
            { t: projectName || 'Untitled Project', bold: true,  fs: tbRowH * 0.6 },
            { t: `Room:  ${roomName}`,              bold: false, fs: tbRowH * 0.5 },
            { t: `Scale  1:${scale}`,               bold: false, fs: tbRowH * 0.5 },
            { t: `Paper  ${paperLabel}`,            bold: false, fs: tbRowH * 0.5 },
            { t: dateStr,                           bold: false, fs: tbRowH * 0.5 },
          ].map((r, i) => (
            <text key={i}
              x={tbX + tbPad} y={tbY + tbPad + tbRowH * (i + 0.5)}
              textAnchor="start" dominantBaseline="central"
              fontSize={r.fs} fontWeight={r.bold ? 'bold' : 'normal'}
            >
              {r.t}
            </text>
          ))}
        </g>
      )}
    </svg>
  )
}
