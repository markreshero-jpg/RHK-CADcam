// New plan-view shop drawing — parallel to PlanDrawingSVG.
// Layered & toggleable (labels / dimensions / door swings / drawers / hatch / title block).
// Reproduces the in-canvas plan view: 3-line dimension chain (wall-cab / base /
// overall) + perpendicular depth dims, plus door-swing arcs & drawer indicators.
// All sizes are in physical mm × scale = model mm, so the viewBox stays in model
// mm and the drawing prints at the correct physical size at 1:scale.
'use client'
import type { ReactNode, RefObject } from 'react'
import type { Wall, CabinetInstance } from '@/src/lib/types'
import {
  toRad, wallEnd, wallDir, wallInwardNormal, wallMitrePolygon,
  cabinetPolygon, cabinetCenterPt, centroid, cabWallPerp, cabWallSide, cabT,
} from '@/src/lib/geometry'

export interface PlanViewLayers {
  labels:     boolean
  wallNames:  boolean
  dimensions: boolean
  doorSwings: boolean
  drawers:    boolean
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
  walls, cabinets, svgRef, scale = 20, show, projectName, roomName, paperKey,
}: {
  walls:       Wall[]
  cabinets:    CabinetInstance[]
  svgRef:      RefObject<SVGSVGElement | null>
  scale?:      number
  show:        PlanViewLayers
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

  // ── Content bounds (includes wall thickness corners) ──────────────────────
  const pts = walls.flatMap(w => {
    const e = wallEnd(w)
    if (w.wall_type === 'island') return [{ x: w.pos_x, y: w.pos_y }, e]
    const inward = wallInwardNormal(w, cx.x, cx.y)
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
  const chainClearDepth = Math.max(0, ...cabinets
    .filter(c => {
      const w = c.wall_id ? wallById.get(c.wall_id) : undefined
      if (!w) return false
      return w.wall_type === 'island' || cabWallSide(c, w) === 'back'
    })
    .map(c => c.dz))
  const basePad  = 4 * P
  const dimExtra = show.dimensions ? maxThick + chainClearDepth + ROW_OVERALL + dimFS * 2 + tickH : 0
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
  function dimLine(wall: Wall, out: { x: number; y: number }, rowDist: number, segs: Seg[], key: string) {
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
      <g key={key} pointerEvents="none">
        <line x1={p0.x} y1={p0.y} x2={pL.x} y2={pL.y} stroke={INK} strokeWidth={dimSW} />
        {boundaries.map((t, i) => {
          const p = pt(t)
          return (
            <line key={i}
              x1={p.x - out.x * tickH} y1={p.y - out.y * tickH}
              x2={p.x + out.x * tickH} y2={p.y + out.y * tickH}
              stroke={INK} strokeWidth={dimSW}
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
  function depthDim(wall: Wall, inward: { x: number; y: number }, tPos: number, dz: number, sign: 1 | -1, key: string, backOffset = 0) {
    const wd = wallDir(wall)
    const offX = wd.x * sign * 5 * P, offY = wd.y * sign * 5 * P
    const sx = wall.pos_x + tPos * wd.x + offX + inward.x * backOffset
    const sy = wall.pos_y + tPos * wd.y + offY + inward.y * backOffset
    const ex = sx + inward.x * dz, ey = sy + inward.y * dz
    const midX = (sx + ex) / 2, midY = (sy + ey) / 2
    const rawAngle = Math.atan2(inward.y, inward.x) * 180 / Math.PI
    const textAngle = Math.abs(rawAngle) > 90 ? rawAngle + 180 : rawAngle
    const padX = dimFS * 1.7, padY = dimFS * 0.7
    return (
      <g key={key} pointerEvents="none">
        <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={INK} strokeWidth={dimSW} />
        <line x1={sx - wd.x * tickH} y1={sy - wd.y * tickH} x2={sx + wd.x * tickH} y2={sy + wd.y * tickH} stroke={INK} strokeWidth={dimSW} />
        <line x1={ex - wd.x * tickH} y1={ey - wd.y * tickH} x2={ex + wd.x * tickH} y2={ey + wd.y * tickH} stroke={INK} strokeWidth={dimSW} />
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
        const poly = wallMitrePolygon(w, walls, cx.x, cx.y)
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
        const inward = wallInwardNormal(w, cx.x, cx.y)
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

      {/* ── Cabinets (always on) + labels (toggle) ── */}
      {cabinets.map(cab => {
        const wall = walls.find(w => w.id === cab.wall_id)
        if (!wall) return null
        const basePerp = wallInwardNormal(wall, cx.x, cx.y)
        const perp     = cabWallPerp(cab, wall, basePerp)
        const poly     = cabinetPolygon(cab, wall, perp)
        const center   = cabinetCenterPt(cab, wall, perp)
        const wd       = wallDir(wall)
        const inset    = Math.min(20, cab.dx * 0.08, cab.dz * 0.08)
        const innerOk  = inset > 1 && cab.dx > inset * 2 && cab.dz > inset * 2
        const ix = cab.pos_x + inset * wd.x + inset * perp.x
        const iy = cab.pos_y + inset * wd.y + inset * perp.y
        const iw = cab.dx - inset * 2
        const id = cab.dz - inset * 2
        const innerPoly = innerOk
          ? `${ix},${iy} ${ix + iw * wd.x},${iy + iw * wd.y} ${ix + iw * wd.x + id * perp.x},${iy + iw * wd.y + id * perp.y} ${ix + id * perp.x},${iy + id * perp.y}`
          : null
        return (
          <g key={cab.id}>
            <polygon points={poly} fill={cabinetTypeFill(cab)} stroke={INK2} strokeWidth={sw * 0.7} />
            {innerPoly && <polygon points={innerPoly} fill="none" stroke={CARCASE_LINE} strokeWidth={sw * 0.35} />}
            {show.labels && cab.label && (
              <text
                x={center.x} y={center.y}
                textAnchor="middle" dominantBaseline="central"
                fontSize={fontSize} fill={INK}
                fontFamily="Arial, Helvetica, sans-serif"
              >
                {cab.label}
              </text>
            )}
          </g>
        )
      })}

      {/* ── Door swings + drawer indicators (toggles) ── */}
      {(show.doorSwings || show.drawers) && cabinets.flatMap(cab => {
        if (!cab.has_face) return []
        const wall = walls.find(w => w.id === cab.wall_id)
        if (!wall) return []
        const perp = cabWallPerp(cab, wall, wallInwardNormal(wall, cx.x, cx.y))
        const wd = wallDir(wall)
        const frontLeft = { x: cab.pos_x + cab.dz * perp.x, y: cab.pos_y + cab.dz * perp.y }

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
        if (show.doorSwings) {
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
                fill="none" stroke={INK3} strokeWidth={swingSW}
                strokeDasharray={`${1.2 * P} ${0.8 * P}`} style={{ pointerEvents: 'none' }} />)
            } else {
              const endX = colRight.x + r * (c15 * (-wd.x) + s15 * perp.x)
              const endY = colRight.y + r * (c15 * (-wd.y) + s15 * perp.y)
              nodes.push(<path key={`swing-${cab.id}-${col}`}
                d={`M ${colRight.x} ${colRight.y} L ${colLeft.x} ${colLeft.y} A ${r} ${r} 0 0 ${rightSweep} ${endX} ${endY} Z`}
                fill="none" stroke={INK3} strokeWidth={swingSW}
                strokeDasharray={`${1.2 * P} ${0.8 * P}`} style={{ pointerEvents: 'none' }} />)
            }
          }
        }

        // Drawer indicators — one dashed line per drawer, stepped out from the front
        if (show.drawers) {
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
                stroke={INK3} strokeWidth={drawSW}
                strokeDasharray={`${1.5 * P} ${0.8 * P}`} strokeLinecap="round"
                style={{ pointerEvents: 'none' }} />)
            }
          }
        }

        return nodes
      })}

      {/* ── Dimension chains (toggle) — wall-cab / base / overall + depth ── */}
      {show.dimensions && walls.map(w => {
        const inward = wallInwardNormal(w, cx.x, cx.y)
        const out = { x: -inward.x, y: -inward.y }
        const allBase = cabinets.filter(c => c.wall_id === w.id && (c.assembly_class === 'base' || c.assembly_class === 'base_corner'))
        const allWall = cabinets.filter(c => c.wall_id === w.id && (c.assembly_class === 'wall' || c.assembly_class === 'wall_corner'))
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
              {wallCabs.length > 0 && dimLine(w, chainDir, depthOffset + ROW_WALLCAB, wallCabSegs, `wc-${key}`)}
              {baseCabs.length > 0 && dimLine(w, chainDir, depthOffset + ROW_BASE, baseSegs, `bc-${key}`)}
              {dimLine(w, chainDir, depthOffset + ROW_OVERALL, overallSeg, `ov-${key}`)}
              {baseDz > 0 && (
                <>
                  {depthDim(w, depthDir, 0,        baseDz, -1, `dd0-${key}`, backOffset)}
                  {depthDim(w, depthDir, w.length, baseDz,  1, `dd1-${key}`, backOffset)}
                </>
              )}
              {showWallDepthSeparate && (
                <>
                  {depthDim(w, depthDir, 0,        wallDz, -1, `wdd0-${key}`, backOffset)}
                  {depthDim(w, depthDir, w.length, wallDz,  1, `wdd1-${key}`, backOffset)}
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
