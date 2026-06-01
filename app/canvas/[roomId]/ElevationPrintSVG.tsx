// New elevation shop drawing — one wall, B&W, print-oriented.
// Mirrors the canvas ElevationSVG geometry (the version trusted on screen):
//   X = cabT(cab, wall) along the wall; height-from-floor → y = roomH - h;
//   wall cabs hang from wallCabTop - dy; resolved parts drawn via *ElevRect().
// All sizes are physical mm × scale = model mm, so the viewBox stays in model
// mm and the drawing prints at true 1:scale.
'use client'
import type { Room, Wall, CabinetInstance } from '@/src/lib/types'
import { cabT, wallEnd, dist, cabWallSide } from '@/src/lib/geometry'
import type {
  ResolvedCabinet, ResolvedCasePart, ResolvedToekickPart, ResolvedFaceZone,
  ResolvedInternalPart, ResolvedDrawerStack, ResolvedDrawerBoxPart, ResolvedDrawerSlide,
} from '@/src/lib/resolver/types'
import { doorProfileSvg } from './cabinetEditSvgHelpers'

export interface ElevationLayers {
  faces:       boolean
  shelves:     boolean
  drawerBoxes: boolean
  toekick:     boolean
  doorSwings:  boolean
  drawers:     boolean
  dimensions:  boolean
  labels:      boolean
  returnWalls: boolean
  titleBlock:  boolean
}

// ── Resolved-part → elevation rect (copied from canvas ElevationSVG) ──────────
function caseElevRect(p: ResolvedCasePart) {
  if (p.part_key === 'left_side' || p.part_key === 'right_side')
    return { ex: p.X, ey: p.Y + p.DY, ew: p.DZ, eh: p.DY }
  return { ex: p.X, ey: p.Y + p.DZ, ew: p.DY, eh: p.DZ }
}
function tkElevRect(p: ResolvedToekickPart) {
  if (p.part_key === 'spreader_horizontal')
    return { ex: p.X, ey: p.Y + p.DY, ew: p.DX, eh: p.DY }
  return { ex: p.X, ey: p.Y + p.DX, ew: p.DY, eh: p.DX }
}
function zoneElevRect(z: ResolvedFaceZone) {
  return { ex: z.X, ey: z.Y + z.DX, ew: z.DY, eh: z.DX }
}
function shelfElevRect(p: ResolvedInternalPart) {
  switch (p.part_type) {
    case 'inner_drawer_front':
    case 'inner_drawer_back':
    case 'pull_out_back':
      return { ex: p.X, ey: p.Y + p.DX, ew: p.DY, eh: p.DX }
    case 'inner_drawer_side':
    case 'pull_out_side':
      return { ex: p.X, ey: p.Y + p.DY, ew: p.DZ, eh: p.DY }
    case 'inner_drawer_bottom':
    case 'pull_out_bottom':
      return { ex: p.X, ey: p.Y + p.DZ, ew: p.DY, eh: p.DZ }
    case 'divider':
      // Divider edge-on: DZ = thickness (X), DY = height (Y)
      return { ex: p.X, ey: p.Y + p.DY, ew: p.DZ, eh: p.DY }
    default:
      return { ex: p.X, ey: p.Y + p.DZ, ew: p.DY, eh: p.DZ }
  }
}
function drawerBoxPartElevRect(p: ResolvedDrawerBoxPart) {
  switch (p.part_type) {
    case 'db_front':
    case 'db_back':       return { ex: p.X, ey: p.Y + p.DX, ew: p.DY, eh: p.DX }
    case 'db_left_side':
    case 'db_right_side':  return { ex: p.X, ey: p.Y + p.DY, ew: p.DZ, eh: p.DY }
    case 'db_bottom':      return { ex: p.X, ey: p.Y + p.DZ, ew: p.DY, eh: p.DZ }
  }
}
function slideElevRect(s: ResolvedDrawerSlide) {
  return { ex: s.X, ey: s.Y + s.DY, ew: s.DZ, eh: s.DY }
}

// wall.soffit_height = depth from top; room values = height from floor.
function wallCabTopFor(w: Wall | null, room: Room): number {
  if (w?.soffit_height != null) return (w.height ?? room.room_dy ?? 2400) - w.soffit_height
  return room.soffit_height ?? room.wall_cabinet_top ?? 2100
}
function cabBottomZ(cab: CabinetInstance, room: Room, elevWall: Wall | null): number {
  if (cab.assembly_class === 'wall' || cab.assembly_class === 'wall_corner')
    return wallCabTopFor(elevWall, room) - cab.dy
  return 0
}

type Seg = { from: number; to: number; label: number }
function computeElevChain(cabs: CabinetInstance[], wall: Wall): Seg[] {
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

const INK  = '#111'
const INK2 = '#555'
const INK3 = '#999'
const FACE_SHADE = '#ededed'   // light shade so faced zones read differently from open shelves

export default function ElevationPrintSVG({
  wall, walls, cabinets, room, resolvedParts, svgRef, scale = 20, show, projectName, roomName, paperKey,
}: {
  wall:          Wall
  walls:         Wall[]
  cabinets:      CabinetInstance[]
  room:          Room
  resolvedParts?: Map<string, ResolvedCabinet>
  svgRef:        (el: SVGSVGElement | null) => void
  scale?:        number
  show:          ElevationLayers
  projectName:   string
  roomName:      string
  paperKey:      string
}) {
  const P = scale
  const roomH = wall.height ?? room.room_dy ?? 2400
  const wallCabs = cabinets.filter(c => c.wall_id === wall.id && cabWallSide(c, wall) === 'face')

  // height-from-floor → svg y (y=0 ceiling, y=roomH floor)
  const FACE_INS = 15

  // ── Sizes (physical mm × scale) ───────────────────────────────────────────
  const partSW = 0.3 * P
  const boxSW  = 0.45 * P
  const thinSW = 0.2 * P
  const labelFs = 3 * P
  const dimFs  = 2.4 * P
  const tk     = 1.4 * P
  const dashSW = 0.22 * P                  // thin internals (shelves / drawer boxes)
  const dash   = `${0.9 * P} ${0.7 * P}`   // clean dash pattern

  // Chain / annotation positions
  const overheadChainY = -7 * P
  const floorChainY    = roomH + 6 * P
  const overallY       = roomH + 13 * P
  const heightChainX   = -13 * P
  const titleY         = -12 * P

  // ── Title block ───────────────────────────────────────────────────────────
  const tbRowH = 4.6 * P, tbPad = 2 * P, tbRows = 5
  const tbH = tbRowH * tbRows + tbPad * 2
  const tbW = 66 * P

  // ── ViewBox padding ───────────────────────────────────────────────────────
  const padL = 20 * P
  const padR = 11 * P
  const padT = 16 * P
  const padB = 18 * P + (show.titleBlock ? tbH + 4 * P : 0)
  const vbX = -padL
  const vbY = -padT
  const vbW = wall.length + padL + padR
  const vbH = roomH + padT + padB

  const tbX = vbX + 1 * P
  const tbY = vbY + vbH - tbH - 1 * P

  const paperLabel = `${paperKey.replace(/L$/, '')} Landscape`
  const d = new Date()
  const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`

  // ── Horizontal dimension chain (top or bottom) ────────────────────────────
  function hChain(segs: Seg[], chainY: number, key: string) {
    if (segs.length === 0) return null
    const boundaries = Array.from(new Set(segs.flatMap(s => [s.from, s.to])))
    const padX = dimFs * 1.7, padY = dimFs * 0.7
    return (
      <g key={key} pointerEvents="none">
        <line x1={0} y1={chainY} x2={wall.length} y2={chainY} stroke={INK} strokeWidth={thinSW} />
        {boundaries.map((x, i) => (
          <line key={i} x1={x} y1={chainY - tk} x2={x} y2={chainY + tk} stroke={INK} strokeWidth={thinSW} />
        ))}
        {segs.map((seg, i) => {
          const mx = (seg.from + seg.to) / 2
          if (seg.to - seg.from < dimFs * 2) return null
          return (
            <g key={`t${i}`}>
              <rect x={mx - padX} y={chainY - padY} width={padX * 2} height={padY * 2} fill="white" />
              <text x={mx} y={chainY} textAnchor="middle" dominantBaseline="middle"
                fontSize={dimFs} fill={INK} fontFamily="Arial, Helvetica, sans-serif">{seg.label}</text>
            </g>
          )
        })}
      </g>
    )
  }

  // ── Cabinet renderer ──────────────────────────────────────────────────────
  function renderCab(cab: CabinetInstance) {
    const rx = cabT(cab, wall)
    const bottomZ = cabBottomZ(cab, room, wall)
    const ry = roomH - bottomZ - cab.dy
    const isBase = cab.assembly_class === 'base' || cab.assembly_class === 'base_corner'
    const isTall = cab.assembly_class === 'tall' || cab.assembly_class === 'tall_corner'
    const rp = resolvedParts?.get(cab.id)
    const tkH = (isBase || isTall) && cab.has_toekick
      ? (rp?.toekick_parts.find(p => p.part_key === 'kick_front_face')?.DX ?? 150)
      : 0
    const toSVG = (ex: number, ey: number, ew: number, eh: number) => ({ x: rx + ex, y: ry + cab.dy - ey, w: ew, h: eh })

    return (
      <g key={cab.id} pointerEvents="none">
        {/* Cabinet outer box */}
        <rect x={rx} y={ry} width={cab.dx} height={cab.dy} fill="white" stroke={INK} strokeWidth={boxSW} />

        {rp ? (
          <>
            {/* Case panels (skip back) */}
            {rp.case_parts.filter(p => p.part_key !== 'back').map((p, i) => {
              const { ex, ey, ew, eh } = caseElevRect(p)
              const { x, y, w, h } = toSVG(ex, ey, ew, eh)
              return <rect key={`cp-${i}`} x={x} y={y} width={w} height={h} fill="none" stroke={INK2} strokeWidth={partSW} />
            })}

            {/* Toe kick — front face only (spreaders/sub/back are hidden in elevation) */}
            {show.toekick && rp.toekick_parts.filter(p => p.part_key === 'kick_front_face').map((p, i) => {
              const { ex, ey, ew, eh } = tkElevRect(p)
              const { x, y, w, h } = toSVG(ex, ey, ew, eh)
              return <rect key={`tk-${i}`} x={x} y={y} width={w} height={h} fill="none" stroke={INK2} strokeWidth={partSW} />
            })}

            {/* Faces (doors / drawers / panels) — shaded so they read against open shelves.
                Drawn BEFORE internals so the shade doesn't paint over shelves/drawer boxes. */}
            {show.faces && rp.face_zones.map((fz, i) => {
              if (fz.face_type === 'open') return null
              const { ex, ey, ew, eh } = zoneElevRect(fz)
              const { x, y, w, h } = toSVG(ex, ey, ew, eh)
              const hinge = fz.hinge_side === 'left'
                ? <line x1={x} y1={y} x2={x} y2={y + h} stroke={INK} strokeWidth={boxSW} />
                : fz.hinge_side === 'right'
                ? <line x1={x + w} y1={y} x2={x + w} y2={y + h} stroke={INK} strokeWidth={boxSW} />
                : null
              const chevron = show.doorSwings && fz.face_type === 'door' && fz.hinge_side
                ? <polyline
                    points={fz.hinge_side === 'left'
                      ? `${x},${y} ${x + w},${y + h / 2} ${x},${y + h}`
                      : `${x + w},${y} ${x},${y + h / 2} ${x + w},${y + h}`}
                    fill="none" stroke={INK2} strokeWidth={thinSW} strokeDasharray={`${1.5 * P} ${0.8 * P}`} />
                : null
              const drawerLbl = show.drawers && fz.face_type === 'drawer_face' && h > dimFs * 1.5
                ? <text x={x + w / 2} y={y + h - dimFs * 0.55} textAnchor="middle" dominantBaseline="auto"
                    fontSize={dimFs * 0.9} fill={INK2} fontFamily="Arial, Helvetica, sans-serif">drawer</text>
                : null
              return (
                <g key={`fz-${i}`}>
                  <rect x={x} y={y} width={w} height={h} fill={FACE_SHADE} stroke={INK} strokeWidth={partSW} />
                  {hinge}{chevron}{drawerLbl}
                  {doorProfileSvg(fz, { x, y, w, h }, INK, thinSW, 0.9)}
                </g>
              )
            })}

            {/* Shelves — thin clean dashed (internal parts that aren't drawer-box parts) */}
            {show.shelves && rp.internal_parts.filter(p => !p.part_type.startsWith('inner_drawer')).map((p, i) => {
              const { ex, ey, ew, eh } = shelfElevRect(p)
              const { x, y, w, h } = toSVG(ex, ey, ew, eh)
              return <rect key={`ip-${i}`} x={x} y={y} width={w} height={h} fill="none" stroke={INK3}
                strokeWidth={dashSW} strokeDasharray={dash} />
            })}

            {/* Drawer boxes — thin clean dashed. Drawer-box parts live in internal_parts
                (inner_drawer_*); drawer_stacks is a live-resolver extra (usually empty). */}
            {show.drawerBoxes && (
              <>
                {rp.internal_parts.filter(p => p.part_type.startsWith('inner_drawer')).map((p, i) => {
                  const { ex, ey, ew, eh } = shelfElevRect(p)
                  const { x, y, w, h } = toSVG(ex, ey, ew, eh)
                  return <rect key={`idb-${i}`} x={x} y={y} width={w} height={h} fill="none" stroke={INK3}
                    strokeWidth={dashSW} strokeDasharray={dash} />
                })}
                {rp.drawer_stacks.flatMap((ds: ResolvedDrawerStack, i: number) => [
                  ...ds.box_parts.map((p: ResolvedDrawerBoxPart, j: number) => {
                    const { ex, ey, ew, eh } = drawerBoxPartElevRect(p)
                    const { x, y, w, h } = toSVG(ex, ey, ew, eh)
                    return <rect key={`db-${i}-${j}`} x={x} y={y} width={w} height={h} fill="none" stroke={INK3}
                      strokeWidth={dashSW} strokeDasharray={dash} />
                  }),
                  ...ds.slides.map((s: ResolvedDrawerSlide, j: number) => {
                    const { ex, ey, ew, eh } = slideElevRect(s)
                    const { x, y, w, h } = toSVG(ex, ey, ew, eh)
                    return <rect key={`sl-${i}-${j}`} x={x} y={y} width={w} height={h} fill="none" stroke={INK3}
                      strokeWidth={dashSW} strokeDasharray={dash} />
                  }),
                ])}
              </>
            )}
          </>
        ) : (
          // Fallback when cabinet is not resolved — box + toekick + face inset
          <>
            {tkH > 0 && (
              <rect x={rx} y={ry + cab.dy - tkH} width={cab.dx} height={tkH} fill="none"
                stroke={INK2} strokeWidth={partSW} strokeDasharray={`${1 * P} ${0.7 * P}`} />
            )}
            {show.faces && cab.has_face && (() => {
              const fw = cab.dx - FACE_INS * 2, fh = cab.dy - tkH - FACE_INS * 2
              if (fw <= 0 || fh <= 0) return null
              return <rect x={rx + FACE_INS} y={ry + FACE_INS} width={fw} height={fh} fill={FACE_SHADE} stroke={INK} strokeWidth={partSW} />
            })()}
          </>
        )}

        {/* Cabinet label */}
        {show.labels && (
          <text x={rx + cab.dx / 2} y={ry + cab.dy / 2}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={labelFs} fontWeight="600" fill={INK} fontFamily="Arial, Helvetica, sans-serif">
            {cab.label ?? '—'}
          </text>
        )}
      </g>
    )
  }

  // ── Return walls (adjacent perpendicular walls at each end) ────────────────
  function returnWalls() {
    const TOL = 50
    const wS = { x: wall.pos_x, y: wall.pos_y }
    const wE = wallEnd(wall)
    let left: Wall | null = null, right: Wall | null = null
    for (const w of walls) {
      if (w.id === wall.id || w.wall_type === 'island') continue
      const s = { x: w.pos_x, y: w.pos_y }, e = wallEnd(w)
      if (!left  && (dist(s, wS) < TOL || dist(e, wS) < TOL)) left  = w
      if (!right && (dist(s, wE) < TOL || dist(e, wE) < TOL)) right = w
    }
    const render = (rw: Wall, isLeft: boolean) => {
      const t = rw.thickness
      const rwH = rw.height ?? room.room_dy ?? 2400
      const x0 = isLeft ? -t : wall.length
      const slabY = roomH - rwH
      const midX = x0 + t / 2, midY = slabY + rwH / 2
      const nLines = Math.floor(rwH / (t * 1.5)) + 2
      return (
        <g key={rw.id} pointerEvents="none">
          <rect x={x0} y={slabY} width={t} height={rwH} fill="white" stroke={INK} strokeWidth={thinSW} />
          {Array.from({ length: nLines }, (_, i) => {
            const y1 = slabY + i * t * 1.5 - t
            return <line key={i} x1={x0} y1={y1} x2={x0 + t} y2={y1 + t} stroke={INK3} strokeWidth={thinSW} />
          })}
          <text x={midX} y={midY} textAnchor="middle" dominantBaseline="middle"
            fontSize={dimFs} fill={INK} transform={`rotate(-90,${midX},${midY})`}
            fontFamily="Arial, Helvetica, sans-serif">{rw.name}</text>
        </g>
      )
    }
    return (<>{left && render(left, true)}{right && render(right, false)}</>)
  }

  // ── Reference lines (ceiling / soffit / wall-cab top) ─────────────────────
  function refs() {
    const soffitH = wall.soffit_height != null ? (wall.height ?? roomH) - wall.soffit_height : room.soffit_height ?? null
    const wcTop = room.wall_cabinet_top ?? null
    return (
      <g pointerEvents="none">
        {/* Ceiling */}
        <line x1={0} y1={0} x2={wall.length} y2={0} stroke={INK2} strokeWidth={thinSW} strokeDasharray={`${2 * P} ${1 * P}`} />
        <text x={wall.length + 1 * P} y={0} textAnchor="start" dominantBaseline="middle"
          fontSize={dimFs * 0.85} fill={INK2} fontFamily="Arial, Helvetica, sans-serif">C {Math.round(roomH)}</text>
        {soffitH != null && soffitH < roomH - 20 && (
          <>
            <line x1={0} y1={roomH - soffitH} x2={wall.length} y2={roomH - soffitH} stroke={INK3} strokeWidth={thinSW} strokeDasharray={`${1.2 * P} ${0.8 * P}`} />
            <text x={wall.length + 1 * P} y={roomH - soffitH} textAnchor="start" dominantBaseline="middle"
              fontSize={dimFs * 0.85} fill={INK3} fontFamily="Arial, Helvetica, sans-serif">S {Math.round(soffitH)}</text>
          </>
        )}
        {wcTop != null && wcTop < roomH - 20 && (
          <line x1={0} y1={roomH - wcTop} x2={wall.length} y2={roomH - wcTop} stroke={INK3} strokeWidth={thinSW} strokeDasharray={`${1 * P} ${1 * P}`} />
        )}
      </g>
    )
  }

  // ── Left height chain ─────────────────────────────────────────────────────
  function heightChain() {
    const baseCabEl = wallCabs.find(c => c.assembly_class === 'base' || c.assembly_class === 'base_corner') ?? null
    const overheadCabEl = wallCabs.find(c => c.assembly_class === 'wall' || c.assembly_class === 'wall_corner') ?? null
    const kickH = baseCabEl?.has_toekick
      ? (resolvedParts?.get(baseCabEl.id)?.toekick_parts.find(p => p.part_key === 'kick_front_face')?.DX ?? 150)
      : 0
    const baseDy = baseCabEl?.dy ?? 0
    const wallCabTop = wallCabTopFor(wall, room)
    const overheadDy = overheadCabEl?.dy ?? 0

    const segs: { fromY: number; toY: number; label: string }[] = []
    let cursorY = roomH
    if (baseDy > 0) {
      if (kickH > 0) { const kickTopY = roomH - kickH; segs.push({ fromY: kickTopY, toY: cursorY, label: `${kickH}` }); cursorY = kickTopY }
      const baseCarcTopY = roomH - baseDy
      segs.push({ fromY: baseCarcTopY, toY: cursorY, label: `${baseDy - kickH}` }); cursorY = baseCarcTopY
    }
    if (overheadDy > 0) {
      const overheadBotY = roomH - (wallCabTop - overheadDy)
      const overheadTopY = roomH - wallCabTop
      if (overheadBotY < cursorY - 0.5) segs.push({ fromY: overheadBotY, toY: cursorY, label: `${Math.round(cursorY - overheadBotY)}` })
      segs.push({ fromY: overheadTopY, toY: overheadBotY, label: `${overheadDy}` }); cursorY = overheadTopY
    }
    if (cursorY > 0.5) segs.push({ fromY: 0, toY: cursorY, label: `${Math.round(cursorY)}` })
    if (segs.length === 0) segs.push({ fromY: 0, toY: roomH, label: `${roomH}` })

    const boundaries = Array.from(new Set(segs.flatMap(s => [s.fromY, s.toY])))
    const padX = dimFs * 1.7, padY = dimFs * 0.7
    return (
      <g pointerEvents="none">
        <line x1={heightChainX} y1={0} x2={heightChainX} y2={roomH} stroke={INK} strokeWidth={thinSW} />
        {boundaries.map((y, i) => (
          <line key={i} x1={heightChainX - tk} y1={y} x2={heightChainX + tk} y2={y} stroke={INK} strokeWidth={thinSW} />
        ))}
        {segs.map((seg, i) => {
          const midY = (seg.fromY + seg.toY) / 2
          return (
            <g key={i} transform={`rotate(-90,${heightChainX},${midY})`}>
              <rect x={heightChainX - padX} y={midY - padY} width={padX * 2} height={padY * 2} fill="white" />
              <text x={heightChainX} y={midY} textAnchor="middle" dominantBaseline="middle"
                fontSize={dimFs} fill={INK} fontFamily="Arial, Helvetica, sans-serif">{seg.label}</text>
            </g>
          )
        })}
      </g>
    )
  }

  const overheadCabs = wallCabs.filter(c => c.assembly_class === 'wall' || c.assembly_class === 'wall_corner')
  const floorCabs = wallCabs.filter(c =>
    c.assembly_class === 'base' || c.assembly_class === 'base_corner' ||
    c.assembly_class === 'tall' || c.assembly_class === 'tall_corner')

  return (
    <svg
      ref={svgRef}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      xmlns="http://www.w3.org/2000/svg"
      data-vb-w={vbW} data-vb-h={vbH}
      style={{ width: '100%', height: 'auto', background: 'white', display: 'block' }}
    >
      {/* Title */}
      <text x={wall.length / 2} y={titleY} textAnchor="middle" dominantBaseline="middle"
        fontSize={labelFs * 1.2} fontWeight="bold" fill={INK} fontFamily="Arial, Helvetica, sans-serif">
        {wall.name}
      </text>

      {/* Reference lines */}
      {refs()}

      {/* Return walls */}
      {show.returnWalls && returnWalls()}

      {/* Floor (bold) */}
      <line x1={0} y1={roomH} x2={wall.length} y2={roomH} stroke={INK} strokeWidth={boxSW * 1.6} />

      {/* Cabinets */}
      {wallCabs.map(renderCab)}

      {/* Dimensions */}
      {show.dimensions && (
        <>
          {hChain(computeElevChain(overheadCabs, wall), overheadChainY, 'oh')}
          {hChain(computeElevChain(floorCabs, wall), floorChainY, 'fl')}
          {heightChain()}
          {/* Overall wall length */}
          {(() => {
            const mx = wall.length / 2, padX = dimFs * 1.8, padY = dimFs * 0.7
            return (
              <g pointerEvents="none">
                <line x1={0} y1={overallY} x2={wall.length} y2={overallY} stroke={INK} strokeWidth={thinSW} />
                <line x1={0} y1={overallY - tk * 1.3} x2={0} y2={overallY + tk * 1.3} stroke={INK} strokeWidth={thinSW} />
                <line x1={wall.length} y1={overallY - tk * 1.3} x2={wall.length} y2={overallY + tk * 1.3} stroke={INK} strokeWidth={thinSW} />
                <rect x={mx - padX} y={overallY - padY} width={padX * 2} height={padY * 2} fill="white" />
                <text x={mx} y={overallY} textAnchor="middle" dominantBaseline="middle"
                  fontSize={dimFs * 1.1} fontWeight="bold" fill={INK} fontFamily="Arial, Helvetica, sans-serif">
                  {Math.round(wall.length)}
                </text>
              </g>
            )
          })()}
        </>
      )}

      {/* Title block */}
      {show.titleBlock && (
        <g fontFamily="Arial, Helvetica, sans-serif" fill={INK}>
          <rect x={tbX} y={tbY} width={tbW} height={tbH} fill="white" stroke={INK} strokeWidth={boxSW} />
          <line x1={tbX} y1={tbY + tbPad + tbRowH} x2={tbX + tbW} y2={tbY + tbPad + tbRowH} stroke={INK} strokeWidth={boxSW * 0.6} />
          {[
            { t: projectName || 'Untitled Project', bold: true,  fs: tbRowH * 0.6 },
            { t: `Room:  ${roomName}`,              bold: false, fs: tbRowH * 0.5 },
            { t: `Wall:  ${wall.name}`,             bold: false, fs: tbRowH * 0.5 },
            { t: `Scale  1:${scale}  ·  ${paperLabel}`, bold: false, fs: tbRowH * 0.5 },
            { t: dateStr,                           bold: false, fs: tbRowH * 0.5 },
          ].map((r, i) => (
            <text key={i} x={tbX + tbPad} y={tbY + tbPad + tbRowH * (i + 0.5)}
              textAnchor="start" dominantBaseline="central" fontSize={r.fs} fontWeight={r.bold ? 'bold' : 'normal'}>
              {r.t}
            </text>
          ))}
        </g>
      )}
    </svg>
  )
}
