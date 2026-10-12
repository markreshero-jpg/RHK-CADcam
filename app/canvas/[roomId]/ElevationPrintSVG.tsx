// New elevation shop drawing — one wall, B&W, print-oriented.
// Mirrors the canvas ElevationSVG geometry (the version trusted on screen):
//   X = cabT(cab, wall) along the wall; height-from-floor → y = roomH - h;
//   wall cabs hang from wallCabTop - dy; resolved parts drawn via *ElevRect().
// What's drawn follows a display layer set (z_display_layers spec, Phase 3c):
// show / hide, line style, weight, opacity and "line drawing". Colours and
// background are ignored — prints stay black ink on white. With style solid,
// internals keep the report's own fine dash. Return walls + title block are
// report page toggles, not layer items.
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
import type { LayerView } from '@/src/lib/displayLayers/resolve'
import { casePartItem, faceZoneItem, internalPartItem, kickPartItem } from '@/src/lib/displayLayers/registry'
import { customPartItem } from '@/src/lib/displayLayers/customPartKinds'
import { elevationShowsCabinet } from '@/src/lib/displayLayers/cabinetShown'
import { customExtents } from '@/src/lib/customPartBox'

/** Report-only page extras (not drawing layers). */
export interface ElevationPageOptions {
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
  return { ex: z.X, ey: z.Y + z.DY, ew: z.DX, eh: z.DY }   // face: DX=width, DY=height
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

// soffit_height (wall and room) = depth from top; wall_cabinet_top = height from floor.
function wallCabTopFor(w: Wall | null, room: Room): number {
  const soffit = w?.soffit_height ?? room.soffit_height
  if (soffit != null) return (w?.height ?? room.room_dy ?? 2400) - soffit
  return room.wall_cabinet_top ?? 2100
}
function cabBottomZ(cab: CabinetInstance, room: Room, elevWall: Wall | null): number {
  if (cab.assembly_class === 'wall' || cab.assembly_class === 'wall_corner')
    return wallCabTopFor(elevWall, room) - cab.dy
  return cab.pos_z ?? 0   // floor units sit at pos_z (raised when kick-detached)
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
  wall, walls, cabinets, room, resolvedParts, svgRef, scale = 20, layers, show, projectName, roomName, paperKey,
}: {
  wall:          Wall
  walls:         Wall[]
  cabinets:      CabinetInstance[]
  room:          Room
  resolvedParts?: Map<string, ResolvedCabinet>
  svgRef:        (el: SVGSVGElement | null) => void
  scale?:        number
  layers:        LayerView
  show:          ElevationPageOptions
  projectName:   string
  roomName:      string
  paperKey:      string
}) {
  const P = scale
  const roomH = wall.height ?? room.room_dy ?? 2400
  // Only cabinets the layer set draws — they also drive the dimension chains.
  const wallCabs = cabinets.filter(c => c.wall_id === wall.id && cabWallSide(c, wall) === 'face'
    && elevationShowsCabinet(c, layers, resolvedParts?.get(c.id)))
  // Layer props at a "zoom" that makes the layer dash pattern 1.6 / 0.8 paper mm.
  const lp = (id: string) => layers.props(id, 5 / P)
  const lineDrawing = layers.lineDrawing

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
  function hChain(segs: Seg[], chainY: number, key: string, item: string) {
    if (segs.length === 0) return null
    const boundaries = Array.from(new Set(segs.flatMap(s => [s.from, s.to])))
    const padX = dimFs * 1.7, padY = dimFs * 0.7
    const lineW = layers.w(item, thinSW)
    return (
      <g key={key} pointerEvents="none" opacity={layers.op(item)}>
        <line x1={0} y1={chainY} x2={wall.length} y2={chainY} stroke={INK} strokeWidth={lineW} strokeDasharray={lp(item).strokeDasharray} />
        {boundaries.map((x, i) => (
          <line key={i} x1={x} y1={chainY - tk} x2={x} y2={chainY + tk} stroke={INK} strokeWidth={lineW} />
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
    const faceFill = lineDrawing ? 'none' : FACE_SHADE
    // Internal / hardware outline: layer style, else the report's fine dash.
    const fineRect = (key: string, item: string, r: { ex: number; ey: number; ew: number; eh: number }) => {
      const { x, y, w, h } = toSVG(r.ex, r.ey, r.ew, r.eh)
      const pp = lp(item)
      return <rect key={key} x={x} y={y} width={w} height={h} fill="none" stroke={INK3} opacity={pp.opacity}
        strokeWidth={layers.w(item, dashSW)} strokeDasharray={pp.strokeDasharray ?? dash} />
    }
    const labelFsL = layers.w('cabinet_labels', labelFs)
    const sizeFs = layers.w('cabinet_sizes', labelFs * 0.7)
    const hasLabel = layers.show('cabinet_labels')

    return (
      <g key={cab.id} pointerEvents="none">
        {/* Cabinet outer box */}
        {layers.show('carcass_outline') && (() => {
          const pp = lp('carcass_outline')
          return <rect x={rx} y={ry} width={cab.dx} height={cab.dy} fill={lineDrawing ? 'none' : 'white'} fillOpacity={pp.fillOpacity}
            opacity={pp.opacity} stroke={INK} strokeWidth={layers.w('carcass_outline', boxSW)} strokeDasharray={pp.strokeDasharray} />
        })()}

        {rp ? (
          <>
            {/* Case panels (skip back) */}
            {rp.case_parts.filter(p => p.part_key !== 'back').map((p, i) => {
              const it = casePartItem(p.part_key)
              if (!layers.show(it)) return null
              const { ex, ey, ew, eh } = caseElevRect(p)
              const { x, y, w, h } = toSVG(ex, ey, ew, eh)
              const pp = lp(it)
              return <rect key={`cp-${i}`} x={x} y={y} width={w} height={h} fill="none" stroke={INK2} opacity={pp.opacity}
                strokeWidth={layers.w(it, partSW)} strokeDasharray={pp.strokeDasharray} />
            })}

            {/* Toe kick parts */}
            {rp.toekick_parts.map((p, i) => {
              const it = kickPartItem(p.part_key)
              if (!layers.show(it)) return null
              const { ex, ey, ew, eh } = tkElevRect(p)
              const { x, y, w, h } = toSVG(ex, ey, ew, eh)
              const pp = lp(it)
              return <rect key={`tk-${i}`} x={x} y={y} width={w} height={h} fill="none" stroke={INK2} opacity={pp.opacity}
                strokeWidth={layers.w(it, partSW)} strokeDasharray={pp.strokeDasharray} />
            })}

            {/* Added parts (applied panels / fillers / other) */}
            {(rp.custom_parts ?? []).map((p, i) => {
              const it = customPartItem(p)
              if (!p.show_in_room || !layers.show(it)) return null
              const { ex, ey } = customExtents(p.orientation, Number(p.dx), Number(p.dy), Number(p.dz))
              if (ex <= 0 || ey <= 0) return null
              const { x, y, w, h } = toSVG(p.x, p.y + ey, ex, ey)
              const pp = lp(it)
              return <rect key={`cu-${i}`} x={x} y={y} width={w} height={h} fill={faceFill} fillOpacity={pp.fillOpacity}
                stroke={INK} opacity={pp.opacity} strokeWidth={layers.w(it, partSW)} strokeDasharray={pp.strokeDasharray} />
            })}

            {/* Faces (doors / drawers / panels) — shaded so they read against open shelves.
                Drawn BEFORE internals so the shade doesn't paint over shelves/drawer boxes. */}
            {rp.face_zones.map((fz, i) => {
              const it = faceZoneItem(fz.face_type)
              if (!it || !layers.show(it)) return null
              const { ex, ey, ew, eh } = zoneElevRect(fz)
              const { x, y, w, h } = toSVG(ex, ey, ew, eh)
              const pp = lp(it)
              const fsw = layers.w(it, partSW)
              const hinge = fz.hinge_side === 'left'
                ? <line x1={x} y1={y} x2={x} y2={y + h} stroke={INK} strokeWidth={layers.w(it, boxSW)} />
                : fz.hinge_side === 'right'
                ? <line x1={x + w} y1={y} x2={x + w} y2={y + h} stroke={INK} strokeWidth={layers.w(it, boxSW)} />
                : null
              const chP = lp('door_chevrons')
              const chevron = layers.show('door_chevrons') && fz.face_type === 'door' && fz.hinge_side
                ? <polyline
                    points={fz.hinge_side === 'left'
                      ? `${x},${y} ${x + w},${y + h / 2} ${x},${y + h}`
                      : `${x + w},${y} ${x},${y + h / 2} ${x + w},${y + h}`}
                    fill="none" stroke={INK2} strokeWidth={layers.w('door_chevrons', thinSW)} opacity={chP.opacity}
                    strokeDasharray={chP.strokeDasharray ?? `${1.5 * P} ${0.8 * P}`} />
                : null
              const lblFs = layers.w('drawer_labels', dimFs * 0.9)
              const drawerLbl = layers.show('drawer_labels') && fz.face_type === 'drawer_face' && h > lblFs * 1.7
                ? <text x={x + w / 2} y={y + h - lblFs * 0.6} textAnchor="middle" dominantBaseline="auto" opacity={layers.op('drawer_labels')}
                    fontSize={lblFs} fill={INK2} fontFamily="Arial, Helvetica, sans-serif">drawer</text>
                : null
              return (
                <g key={`fz-${i}`}>
                  <g opacity={pp.opacity}>
                    <rect x={x} y={y} width={w} height={h} fill={faceFill} fillOpacity={pp.fillOpacity}
                      stroke={INK} strokeWidth={fsw} strokeDasharray={pp.strokeDasharray} />
                    {hinge}
                    {doorProfileSvg(fz, { x, y, w, h }, INK, thinSW, 0.9)}
                  </g>
                  {chevron}{drawerLbl}
                </g>
              )
            })}

            {/* Hinge cup + plate bore positions */}
            {layers.show('hinges') && (rp.hinge_instances ?? []).map((h, hi) => (
              <g key={`hg-${hi}`} opacity={layers.op('hinges')}>
                {[...h.cup_drills, ...h.plate_drills].map((dr, j) => {
                  const c = toSVG(dr.x, dr.y, 0, 0)
                  return <circle key={j} cx={c.x} cy={c.y} r={Math.max(dr.radius, 0.5)} fill="none" stroke={INK2}
                    strokeWidth={layers.w('hinges', thinSW)} strokeDasharray={lp('hinges').strokeDasharray} />
                })}
              </g>
            ))}

            {/* Drawer-box fixing bores into the back of each drawer front */}
            {layers.show('drawer_front_drilling') && (
              <g opacity={layers.op('drawer_front_drilling')}>
                {[
                  ...rp.drawer_stacks.flatMap(ds => ds.slides),
                  ...(layers.show('inner_drawers') ? rp.internal_slides ?? [] : []),
                ].flatMap((s, si) => s.drills.filter(dr => dr.surface === 'drawer_front').map((dr, j) => {
                  const c = toSVG(dr.x, dr.y, 0, 0)
                  return <circle key={`dfd-${si}-${j}`} cx={c.x} cy={c.y} r={Math.max(dr.radius, 0.5)} fill="none" stroke={INK2}
                    strokeWidth={layers.w('drawer_front_drilling', thinSW)} strokeDasharray={lp('drawer_front_drilling').strokeDasharray} />
                }))}
              </g>
            )}

            {/* Internals — shelves / dividers / accessories / inner drawers + pull-outs */}
            {rp.internal_parts.map((p, i) => {
              const it = internalPartItem(p.part_type)
              return layers.show(it) ? fineRect(`ip-${i}`, it, shelfElevRect(p)) : null
            })}
            {layers.show('inner_drawer_runners') && (rp.internal_slides ?? []).map((s, i) =>
              fineRect(`is-${i}`, 'inner_drawer_runners', slideElevRect(s)))}

            {/* Drawer boxes + runners (drawer_stacks) */}
            {rp.drawer_stacks.flatMap((ds: ResolvedDrawerStack, i: number) => [
              ...(layers.show('drawer_boxes') ? ds.box_parts.map((p: ResolvedDrawerBoxPart, j: number) =>
                fineRect(`db-${i}-${j}`, 'drawer_boxes', drawerBoxPartElevRect(p))) : []),
              ...(layers.show('drawer_runners') ? ds.slides.map((s: ResolvedDrawerSlide, j: number) =>
                fineRect(`sl-${i}-${j}`, 'drawer_runners', slideElevRect(s))) : []),
            ])}
          </>
        ) : (
          // Fallback when cabinet is not resolved — box + toekick + face inset
          <>
            {tkH > 0 && layers.show('kick_faces') && (
              <rect x={rx} y={ry + cab.dy - tkH} width={cab.dx} height={tkH} fill="none" opacity={lp('kick_faces').opacity}
                stroke={INK2} strokeWidth={layers.w('kick_faces', partSW)} strokeDasharray={`${1 * P} ${0.7 * P}`} />
            )}
            {layers.any('doors', 'drawer_fronts') && cab.has_face && (() => {
              const fw = cab.dx - FACE_INS * 2, fh = cab.dy - tkH - FACE_INS * 2
              if (fw <= 0 || fh <= 0) return null
              const it = layers.show('doors') ? 'doors' : 'drawer_fronts'
              const pp = lp(it)
              return <rect x={rx + FACE_INS} y={ry + FACE_INS} width={fw} height={fh} fill={faceFill} fillOpacity={pp.fillOpacity}
                opacity={pp.opacity} stroke={INK} strokeWidth={layers.w(it, partSW)} strokeDasharray={pp.strokeDasharray} />
            })()}
          </>
        )}

        {/* Cabinet name + size */}
        {hasLabel && (
          <text x={rx + cab.dx / 2} y={ry + cab.dy / 2}
            textAnchor="middle" dominantBaseline="middle" opacity={layers.op('cabinet_labels')}
            fontSize={labelFsL} fontWeight="600" fill={INK} fontFamily="Arial, Helvetica, sans-serif">
            {cab.label ?? '—'}
          </text>
        )}
        {layers.show('cabinet_sizes') && (
          <text x={rx + cab.dx / 2} y={ry + cab.dy / 2 + (hasLabel ? labelFsL * 0.55 + sizeFs * 0.6 : 0)}
            textAnchor="middle" dominantBaseline="middle" opacity={layers.op('cabinet_sizes')}
            fontSize={sizeFs} fill={INK2} fontFamily="Arial, Helvetica, sans-serif">
            {Math.round(cab.dx)}×{Math.round(cab.dy)}
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
    const soffitDrop = wall.soffit_height ?? room.soffit_height
    const soffitH = soffitDrop != null ? (wall.height ?? roomH) - soffitDrop : null
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
    const lineW = layers.w('dim_elev_height', thinSW)
    return (
      <g pointerEvents="none" opacity={layers.op('dim_elev_height')}>
        <line x1={heightChainX} y1={0} x2={heightChainX} y2={roomH} stroke={INK} strokeWidth={lineW} strokeDasharray={lp('dim_elev_height').strokeDasharray} />
        {boundaries.map((y, i) => (
          <line key={i} x1={heightChainX - tk} y1={y} x2={heightChainX + tk} y2={y} stroke={INK} strokeWidth={lineW} />
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

      {/* Dimensions (layer items; the overall wall length goes with the floor chain) */}
      <>
          {layers.show('dim_elev_wall_chain') && overheadCabs.length > 0 && hChain(computeElevChain(overheadCabs, wall), overheadChainY, 'oh', 'dim_elev_wall_chain')}
          {layers.show('dim_elev_floor_chain') && floorCabs.length > 0 && hChain(computeElevChain(floorCabs, wall), floorChainY, 'fl', 'dim_elev_floor_chain')}
          {layers.show('dim_elev_height') && heightChain()}
          {/* Overall wall length */}
          {layers.show('dim_elev_floor_chain') && (() => {
            const mx = wall.length / 2, padX = dimFs * 1.8, padY = dimFs * 0.7
            const lineW = layers.w('dim_elev_floor_chain', thinSW)
            return (
              <g pointerEvents="none" opacity={layers.op('dim_elev_floor_chain')}>
                <line x1={0} y1={overallY} x2={wall.length} y2={overallY} stroke={INK} strokeWidth={lineW} />
                <line x1={0} y1={overallY - tk * 1.3} x2={0} y2={overallY + tk * 1.3} stroke={INK} strokeWidth={lineW} />
                <line x1={wall.length} y1={overallY - tk * 1.3} x2={wall.length} y2={overallY + tk * 1.3} stroke={INK} strokeWidth={lineW} />
                <rect x={mx - padX} y={overallY - padY} width={padX * 2} height={padY * 2} fill="white" />
                <text x={mx} y={overallY} textAnchor="middle" dominantBaseline="middle"
                  fontSize={dimFs * 1.1} fontWeight="bold" fill={INK} fontFamily="Arial, Helvetica, sans-serif">
                  {Math.round(wall.length)}
                </text>
              </g>
            )
          })()}
      </>

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
