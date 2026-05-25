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
  cabinetPolygon, cabinetCenterPt, centroid, cabWallPerp, cabT,
} from '@/src/lib/geometry'

export interface PlanViewLayers {
  labels:     boolean
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
  const sw       = 0.4 * P    // wall stroke
  const fontSize = 3.5 * P    // cabinet label

  const dimSW = 0.25 * P      // dimension line stroke
  const dimFS = 2.6 * P       // dimension text
  const tickH = 1.4 * P       // dimension tick half-length
  // Chain row offsets from outer wall face (innermost → outermost, like canvas 25/50/75)
  const ROW_WALLCAB = 6 * P
  const ROW_BASE    = 12 * P
  const ROW_OVERALL = 18 * P

  const swingSW = 0.2 * P     // door swing arc
  const drawSW  = 0.2 * P     // drawer indicator line

  // ── Title block dimensions ────────────────────────────────────────────────
  const tbRowH = 4.6 * P
  const tbPad  = 2 * P
  const tbRows = 5
  const tbH    = tbRowH * tbRows + tbPad * 2
  const tbW    = 66 * P

  // ── ViewBox padding — extend for dims / title block when shown ────────────
  const maxThick = Math.max(0, ...walls.filter(w => w.wall_type !== 'island').map(w => w.thickness))
  const basePad  = 8 * P
  const dimExtra = show.dimensions ? maxThick + ROW_OVERALL + dimFS * 2 + tickH : 0
  const padL = basePad + dimExtra
  const padR = basePad + dimExtra
  const padT = basePad + dimExtra
  const padB = basePad + dimExtra + (show.titleBlock ? tbH + 4 * P : 0)

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
        <line x1={p0.x} y1={p0.y} x2={pL.x} y2={pL.y} stroke="#111" strokeWidth={dimSW} />
        {boundaries.map((t, i) => {
          const p = pt(t)
          return (
            <line key={i}
              x1={p.x - out.x * tickH} y1={p.y - out.y * tickH}
              x2={p.x + out.x * tickH} y2={p.y + out.y * tickH}
              stroke="#111" strokeWidth={dimSW}
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
                fontSize={dimFS} fill="#111" fontFamily="Arial, Helvetica, sans-serif">
                {seg.label}
              </text>
            </g>
          )
        })}
      </g>
    )
  }

  // ── Perpendicular depth dimension at a wall end ───────────────────────────
  function depthDim(wall: Wall, inward: { x: number; y: number }, tPos: number, dz: number, sign: 1 | -1, key: string) {
    const wd = wallDir(wall)
    const offX = wd.x * sign * 5 * P, offY = wd.y * sign * 5 * P
    const sx = wall.pos_x + tPos * wd.x + offX
    const sy = wall.pos_y + tPos * wd.y + offY
    const ex = sx + inward.x * dz, ey = sy + inward.y * dz
    const midX = (sx + ex) / 2, midY = (sy + ey) / 2
    const rawAngle = Math.atan2(inward.y, inward.x) * 180 / Math.PI
    const textAngle = Math.abs(rawAngle) > 90 ? rawAngle + 180 : rawAngle
    const padX = dimFS * 1.7, padY = dimFS * 0.7
    return (
      <g key={key} pointerEvents="none">
        <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="#111" strokeWidth={dimSW} />
        <line x1={sx - wd.x * tickH} y1={sy - wd.y * tickH} x2={sx + wd.x * tickH} y2={sy + wd.y * tickH} stroke="#111" strokeWidth={dimSW} />
        <line x1={ex - wd.x * tickH} y1={ey - wd.y * tickH} x2={ex + wd.x * tickH} y2={ey + wd.y * tickH} stroke="#111" strokeWidth={dimSW} />
        <g transform={`rotate(${textAngle}, ${midX}, ${midY})`}>
          <rect x={midX - padX} y={midY - padY} width={padX * 2} height={padY * 2} fill="white" />
          <text x={midX} y={midY} textAnchor="middle" dominantBaseline="middle"
            fontSize={dimFS} fill="#111" fontFamily="Arial, Helvetica, sans-serif">
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
      style={{ width: '100%', height: 'auto', background: 'white', display: 'block' }}
    >
      {/* ── Walls (always on) — hatch fill toggles ── */}
      {walls.map(w => {
        if (w.wall_type === 'island') {
          const e = wallEnd(w)
          return (
            <line key={w.id}
              x1={w.pos_x} y1={w.pos_y} x2={e.x} y2={e.y}
              stroke="#111" strokeWidth={sw * 4} strokeLinecap="round"
            />
          )
        }
        const poly = wallMitrePolygon(w, walls, cx.x, cx.y)
        if (!poly) return null
        return (
          <polygon key={w.id}
            points={poly}
            fill={show.hatch ? '#d8d8d8' : 'white'}
            stroke="#111" strokeWidth={sw} strokeLinejoin="miter"
          />
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
        return (
          <g key={cab.id}>
            <polygon points={poly} fill="#f6f6f6" stroke="#333" strokeWidth={sw * 0.6} />
            {show.labels && cab.label && (
              <text
                x={center.x} y={center.y}
                textAnchor="middle" dominantBaseline="central"
                fontSize={fontSize} fill="#111"
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
                fill="none" stroke="#555" strokeWidth={swingSW}
                strokeDasharray={`${1.2 * P} ${0.8 * P}`} style={{ pointerEvents: 'none' }} />)
            } else {
              const endX = colRight.x + r * (c15 * (-wd.x) + s15 * perp.x)
              const endY = colRight.y + r * (c15 * (-wd.y) + s15 * perp.y)
              nodes.push(<path key={`swing-${cab.id}-${col}`}
                d={`M ${colRight.x} ${colRight.y} L ${colLeft.x} ${colLeft.y} A ${r} ${r} 0 0 ${rightSweep} ${endX} ${endY} Z`}
                fill="none" stroke="#555" strokeWidth={swingSW}
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
              const perpOff    = (i + 1) * 3 * P
              const widthInset = (i + 1) * 6 * P
              nodes.push(<line key={`drawer-${cab.id}-${col}-${rowIndices[i]}`}
                x1={colLeft.x  + perpOff * perp.x + widthInset * wd.x}
                y1={colLeft.y  + perpOff * perp.y + widthInset * wd.y}
                x2={colRight.x + perpOff * perp.x - widthInset * wd.x}
                y2={colRight.y + perpOff * perp.y - widthInset * wd.y}
                stroke="#555" strokeWidth={drawSW}
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
        const baseCabs = cabinets.filter(c => c.wall_id === w.id && (c.assembly_class === 'base' || c.assembly_class === 'base_corner'))
        const wallCabs = cabinets.filter(c => c.wall_id === w.id && (c.assembly_class === 'wall' || c.assembly_class === 'wall_corner'))
        const baseSegs    = computeChain(baseCabs, w)
        const wallCabSegs = computeChain(wallCabs, w)
        const overallSeg: Seg[] = [{ from: 0, to: w.length, label: Math.round(w.length) }]
        const baseDz = baseCabs.length > 0 ? Math.max(...baseCabs.map(c => c.dz)) : 0
        const wallDz = wallCabs.length > 0 ? Math.max(...wallCabs.map(c => c.dz)) : 0
        const showWallDepthSeparate = wallDz > 0 && Math.abs(wallDz - baseDz) > 5
        return (
          <g key={`dim-${w.id}`}>
            {wallCabs.length > 0 && dimLine(w, out, ROW_WALLCAB, wallCabSegs, `wc-${w.id}`)}
            {baseCabs.length > 0 && dimLine(w, out, ROW_BASE, baseSegs, `bc-${w.id}`)}
            {dimLine(w, out, ROW_OVERALL, overallSeg, `ov-${w.id}`)}
            {baseDz > 0 && (
              <>
                {depthDim(w, inward, 0,        baseDz, -1, `dd0-${w.id}`)}
                {depthDim(w, inward, w.length, baseDz,  1, `dd1-${w.id}`)}
              </>
            )}
            {showWallDepthSeparate && (
              <>
                {depthDim(w, inward, 0,        wallDz, -1, `wdd0-${w.id}`)}
                {depthDim(w, inward, w.length, wallDz,  1, `wdd1-${w.id}`)}
              </>
            )}
          </g>
        )
      })}

      {/* ── Title block (toggle) ── */}
      {show.titleBlock && (
        <g fontFamily="Arial, Helvetica, sans-serif" fill="#111">
          <rect x={tbX} y={tbY} width={tbW} height={tbH} fill="white" stroke="#111" strokeWidth={sw} />
          <line
            x1={tbX} y1={tbY + tbPad + tbRowH} x2={tbX + tbW} y2={tbY + tbPad + tbRowH}
            stroke="#111" strokeWidth={sw * 0.6}
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
