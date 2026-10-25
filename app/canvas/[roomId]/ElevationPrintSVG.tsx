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
import type { Room, Wall, CabinetInstance, RoomFixture, BenchtopInstance, BenchtopEdgeProfile, RoomAnnotation } from '@/src/lib/types'
import { openingOnWall, fixtureChainSpans, fixtureLayer } from '@/src/lib/fixtureGeometry'
import { OpeningElev, FixturesElevationPrint } from './FixturesElevation'
import BenchtopElevation, { type BtElevInfo } from './BenchtopElevation'
import { frontViewHardwareMap } from '@/src/lib/drawerHardwareBoxes'
import { cabT, wallEnd, dist, cabWallSide, centroid, wallCabTop, cabBottomZ } from '@/src/lib/geometry'
import { stackShelfSegs } from '@/src/lib/floatShelf'
import { PRINT_INK, pen, atLeastMin } from '@/src/lib/shopDrawings/pens'
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
import { handleShapes } from '@/src/lib/handleGeometry'
import { HandleElevSVG, HandleHolesSVG, SharknoseLinesSVG } from './HandleSVG'
import { tkBoxAABB, caseBoxAABB } from '@/src/lib/jointDrilling'
import { isShapedPanelKey } from '@/src/lib/cabinetShape/partKeys'
import { binOutlines } from '@/src/lib/binGeometry'
import { roundMm } from '@/src/lib/format'
import { DimLabel, dimLabelFits, dimLabelSides } from './dimLabel'
import AnnotationLayer from './AnnotationLayer'
import { annotLayerItem, annotationFramePoints, mapPt } from '@/src/lib/annotations/geometry'
import { resolveStyle } from '@/src/lib/annotations/style'
import { doorChevronPoints, hingeEdgeLine } from '@/src/lib/doorChevron'
import GrainSVG, { GRAIN_INK, useGrainedMaterialIds } from './GrainSVG'
import { ownedBy, elevationOwner, elevationAnnotFrame } from '@/src/lib/annotations/owner'

/** Report-only page extras (not drawing layers). */
export interface ElevationPageOptions {
  returnWalls: boolean
  /** Page-level (ShopTitleBlock, drawn by the report export) — not drawn in this SVG. */
  titleBlock:  boolean
  /** z_CAD_tool decision 6: print CAD notes in their own colours (off = black). */
  annotColours?: boolean
}

// ── Resolved-part → elevation rect (copied from canvas ElevationSVG) ──────────
function caseElevRect(p: ResolvedCasePart) {
  if (p.part_key === 'left_side' || p.part_key === 'right_side')
    return { ex: p.X, ey: p.Y + p.DY, ew: p.DZ, eh: p.DY }
  // Turned / shaped panels and the curved end face board: their front-view bounds.
  if (isShapedPanelKey(p.part_key) || p.AY || p.wrap || p.upright) {
    const b = caseBoxAABB(p)
    return { ex: b.x, ey: b.y + b.h, ew: b.w, eh: b.h }
  }
  return { ex: p.X, ey: p.Y + p.DZ, ew: p.DY, eh: p.DZ }
}
function tkElevRect(p: ResolvedToekickPart) {
  // Turned bounds: shaped cabinets turn kick boards onto their facet (4b).
  const b = tkBoxAABB(p)
  return { ex: b.x, ey: b.y + b.h, ew: b.w, eh: b.h }
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


type Seg = { from: number; to: number; label: number }
// `extra` = appliances in the row, as along-wall { t, dx }.
function computeElevChain(cabs: CabinetInstance[], wall: Wall, extra: { t: number; dx: number }[] = []): Seg[] {
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

// All print ink is black (z_shop_drawings S2); weight + dash carry the hierarchy.
const INK  = PRINT_INK
const INK2 = PRINT_INK
const INK3 = PRINT_INK
const NO_SELECT = () => {}
/** Hinge cup / plate bores and drawer-front fixing bores stay off the printed elevations. */
const PRINT_DRILLING = false
const FACE_SHADE = '#ededed'   // light shade so faced zones read differently from open shelves

export default function ElevationPrintSVG({
  wall, walls, cabinets, room, resolvedParts: resolvedPartsRaw, svgRef, scale = 20, layers, show, fixtures = [], benchHeights = [], benchtops = [], btInfo, btProfiles, annotations = [],
}: {
  /** CAD notes (z_CAD_tool A6c) — only this wall's face-side elevation notes are drawn. */
  annotations?:  RoomAnnotation[]
  /** Benchtops (z_benchtop_builder) — the canvas's band / waterfall drawing in print mode. Needs btInfo. */
  benchtops?:    BenchtopInstance[]
  btInfo?:       (bt: BenchtopInstance) => BtElevInfo
  btProfiles?:   Record<string, BenchtopEdgeProfile>
  /** Floor → bench top, floor → basin rim (dim_elev_bench, see benchDims.ts). */
  benchHeights?: number[]
  wall:          Wall
  /** Doors / windows in this wall (z_fixtures P5) — outline + symbol + a width row. */
  fixtures?:     RoomFixture[]
  walls:         Wall[]
  cabinets:      CabinetInstance[]
  room:          Room
  resolvedParts?: Map<string, ResolvedCabinet>
  svgRef:        (el: SVGSVGElement | null) => void
  scale?:        number
  layers:        LayerView
  show:          ElevationPageOptions
}) {
  // Ghost grain on grained colours (z_material_colours MC11).
  const grainedIds = useGrainedMaterialIds()
  // Turned facet hardware (z_cabinet_shape 3b) flattened to cabinet X/Y for this front view.
  const resolvedParts = frontViewHardwareMap(resolvedPartsRaw)
  const P = scale
  const roomH = wall.height ?? room.room_dy ?? 2400
  // Doors / windows in this wall, face side (z_fixtures P5).
  const openings = !layers.show('fixture_openings') ? [] : fixtures.flatMap(fx => {
    const o = openingOnWall(fx, wall, 'face', centroid(walls))
    return o ? [{ fx, t0: Math.max(0, o.t0), t1: Math.min(wall.length, o.t1), hingeT: o.hingeT, sill: Number(fx.z) || 0, h: Number(fx.height) }] : []
  }).sort((a, b) => a.t0 - b.t0)
  const openingSegs: Seg[] = []
  {
    let cur = 0
    for (const o of openings) {
      if (o.t0 > cur + 0.5) openingSegs.push({ from: cur, to: o.t0, label: roundMm(o.t0 - cur) })
      openingSegs.push({ from: Math.max(cur, o.t0), to: o.t1, label: roundMm(o.t1 - Math.max(cur, o.t0)) })
      cur = Math.max(cur, o.t1)
    }
    if (openings.length && cur < wall.length - 0.5) openingSegs.push({ from: cur, to: wall.length, label: roundMm(wall.length - cur) })
  }
  // Only cabinets the layer set draws — they also drive the dimension chains.
  const wallCabs = cabinets.filter(c => c.wall_id === wall.id && cabWallSide(c, wall) === 'face'
    && elevationShowsCabinet(c, layers, resolvedParts?.get(c.id)))
  // Layer props at a "zoom" that makes the layer dash pattern 1.6 / 0.8 paper mm.
  const lp = (id: string) => layers.props(id, 5 / P)
  const lineDrawing = layers.lineDrawing

  // height-from-floor → svg y (y=0 ceiling, y=roomH floor)
  const FACE_INS = 15

  // ── Sizes (physical mm × scale) ───────────────────────────────────────────
  // Pens: paper-mm widths from the shared pen table (z_shop_drawings S2).
  const partSW = pen('front', P)
  const boxSW  = pen('medium', P)
  const thinSW = pen('thin', P)
  // Layer-weighted line width, never below the minimum pen.
  const lw = (id: string, base: number) => atLeastMin(layers.w(id, base), P)
  const labelFs = 3 * P
  const dimFs  = 2.4 * P
  const tk     = 1.4 * P
  const dashSW = pen('thin', P)                // thin internals (shelves / drawer boxes)
  const dash   = `${0.9 * P} ${0.7 * P}`   // clean dash pattern
  // Ghost grain (layer 'grain'): faint lines + light shade on grained colours.
  const grainOn = (m: string | null | undefined) => !!m && layers.show('grain') && grainedIds.has(m)
  const grainProps = { color: layers.color('grain', GRAIN_INK), strokeWidth: layers.w('grain', thinSW * 0.5), opacity: layers.op('grain') }

  // Chain / annotation positions
  const overheadChainY = -7 * P
  const bulkheadChainY = -9.5 * P
  const openingChainY  = -3 * P
  const floorChainY    = roomH + 6 * P
  const overallY       = roomH + 13 * P
  const heightChainX   = -13 * P
  const titleY         = (wallCabs.some(c => !!c.bulkhead || !!c.float_shelf) ? -13.5 : -12) * P   // clear of the bulkhead row

  // ── ViewBox padding ───────────────────────────────────────────────────────
  const benchDimStep = 8 * P   // bench / basin height lines, outside the height chain
  const padL = 20 * P + (layers.show('dim_elev_bench') ? benchHeights.length * benchDimStep : 0)
  const padR = 11 * P
  const padT = 16 * P
  const padB = 18 * P
  // CAD notes on this wall's face (the side printed), in the canvas elevation frame.
  const notes = annotations.filter(a => ownedBy(a, elevationOwner(wall.id, 'face')) && layers.show(annotLayerItem(a.kind)))
  const noteFrame = elevationAnnotFrame(roomH)
  // Notes may sit outside the drawing (off to the side / above) — grow the viewBox to fit them.
  let x0 = -padL, y0 = -padT, x1 = wall.length + padR, y1 = roomH + padB
  for (const a of notes) for (const q of annotationFramePoints(a.kind, a.geom, a.text, resolveStyle(a.kind, a.style).size, P)) {
    const m = mapPt(noteFrame, q)
    x0 = Math.min(x0, m.x - 2 * P); x1 = Math.max(x1, m.x + 2 * P)
    y0 = Math.min(y0, m.y - 2 * P); y1 = Math.max(y1, m.y + 2 * P)
  }
  const vbX = x0
  const vbY = y0
  const vbW = x1 - x0
  const vbH = y1 - y0

  // ── Horizontal dimension chain (top or bottom) ────────────────────────────
  function hChain(segs: Seg[], chainY: number, key: string, item: string) {
    if (segs.length === 0) return null
    const boundaries = Array.from(new Set(segs.flatMap(s => [s.from, s.to])))
    const sides = dimLabelSides(segs.map(s => ({ label: s.label, span: s.to - s.from })), dimFs)
    const lineW = lw(item, thinSW)
    return (
      <g key={key} pointerEvents="none" opacity={layers.op(item)}>
        <line x1={0} y1={chainY} x2={wall.length} y2={chainY} stroke={INK} strokeWidth={lineW} strokeDasharray={lp(item).strokeDasharray} />
        {boundaries.map((x, i) => (
          <line key={i} x1={x} y1={chainY - tk} x2={x} y2={chainY + tk} stroke={INK} strokeWidth={lineW} />
        ))}
        {segs.map((seg, i) => (
          <DimLabel key={`t${i}`} x={(seg.from + seg.to) / 2} y={chainY} label={seg.label} fs={dimFs} col={INK}
            bg="white" side={sides[i]} padY={0.7} fontFamily="Arial, Helvetica, sans-serif" />
        ))}
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
        strokeWidth={lw(item, dashSW)} strokeDasharray={pp.strokeDasharray ?? dash} />
    }
    // Pull-out bin outline (z_bin_cabinet), same fine dash as the other hardware.
    const binPolys = (key: string, ds: ResolvedDrawerStack) => {
      const pp = lp('bins')
      return binOutlines(ds, 'front').map((o, j) => (
        <polygon key={`${key}-${j}`} points={o.pts.map(([px, py]) => { const p = toSVG(px, py, 0, 0); return `${p.x},${p.y}` }).join(' ')}
          fill="none" stroke={INK3} opacity={pp.opacity} strokeWidth={lw('bins', dashSW)} strokeDasharray={pp.strokeDasharray ?? dash} />
      ))
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
            opacity={pp.opacity} stroke={INK} strokeWidth={lw('carcass_outline', boxSW)} strokeDasharray={pp.strokeDasharray} />
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
                strokeWidth={lw(it, partSW)} strokeDasharray={pp.strokeDasharray} />
            })}

            {/* Toe kick parts */}
            {rp.toekick_parts.map((p, i) => {
              const it = kickPartItem(p.part_key)
              if (!layers.show(it)) return null
              const { ex, ey, ew, eh } = tkElevRect(p)
              const { x, y, w, h } = toSVG(ex, ey, ew, eh)
              const pp = lp(it)
              return <rect key={`tk-${i}`} x={x} y={y} width={w} height={h} fill="none" stroke={INK2} opacity={pp.opacity}
                strokeWidth={lw(it, partSW)} strokeDasharray={pp.strokeDasharray} />
            })}

            {/* Ghost grain on grained kick boards, along the kick. */}
            {rp.toekick_parts.map((p, i) => {
              if (!grainOn(p.material_id) || p.part_key.startsWith('spreader') || !layers.show(kickPartItem(p.part_key))) return null
              const { ex, ey, ew, eh } = tkElevRect(p)
              const { x, y, w, h } = toSVG(ex, ey, ew, eh)
              return <GrainSVG key={`tkg-${i}`} x={x} y={y} w={w} h={h} dir="h" {...grainProps} />
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
                stroke={INK} opacity={pp.opacity} strokeWidth={lw(it, partSW)} strokeDasharray={pp.strokeDasharray} />
            })}

            {/* Ghost grain on grained added parts seen face-on. */}
            {(rp.custom_parts ?? []).map((p, i) => {
              if (!p.show_in_room || !grainOn(p.material_id) || !layers.show(customPartItem(p))) return null
              const { ex, ey } = customExtents(p.orientation, Number(p.dx), Number(p.dy), Number(p.dz))
              if (ex < 30 || ey < 30) return null
              const { x, y, w, h } = toSVG(p.x, p.y + ey, ex, ey)
              return <GrainSVG key={`cug-${i}`} x={x} y={y} w={w} h={h} dir="v" {...grainProps} />
            })}

            {/* Faces (doors / drawers / panels) — shaded so they read against open shelves.
                Drawn BEFORE internals so the shade doesn't paint over shelves/drawer boxes. */}
            {rp.face_zones.map((fz, i) => {
              const it = faceZoneItem(fz.face_type)
              if (!it || !layers.show(it)) return null
              const { ex, ey, ew, eh } = zoneElevRect(fz)
              const { x, y, w, h } = toSVG(ex, ey, ew, eh)
              const pp = lp(it)
              const fsw = lw(it, partSW)
              const hinge = fz.hinge_side
                ? <line {...hingeEdgeLine(fz.hinge_side, { x, y, w, h })} stroke={INK} strokeWidth={lw(it, boxSW)} />
                : null
              const chP = lp('door_chevrons')
              const chevron = layers.show('door_chevrons') && fz.face_type === 'door' && fz.hinge_side
                ? <polyline
                    points={doorChevronPoints(fz.hinge_side, { x, y, w, h })}
                    fill="none" stroke={INK2} strokeWidth={lw('door_chevrons', thinSW)} opacity={chP.opacity}
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

            {/* Ghost grain on grained fronts, up the front. */}
            {rp.face_zones.map((fz, i) => {
              const it = faceZoneItem(fz.face_type)
              if (!it || !layers.show(it) || !grainOn(fz.material_id)) return null
              const { ex, ey, ew, eh } = zoneElevRect(fz)
              const { x, y, w, h } = toSVG(ex, ey, ew, eh)
              return <GrainSVG key={`fzg-${i}`} x={x} y={y} w={w} h={h} dir="v" {...grainProps} />
            })}

            {/* Handles (z_handles H2) — on the fronts that are drawn */}
            {layers.show('handles') && handleShapes(rp.face_zones.filter(fz => { const it = faceZoneItem(fz.face_type); return !it || layers.show(it) })).map((s, i) => (
              <HandleElevSVG key={`hd-${i}`} s={s} project={(px, py) => toSVG(px, py, 0, 0)}
                stroke={layers.color('handles', INK)} fill={lineDrawing ? 'none' : layers.color('handles', '#94a3b8')}
                strokeWidth={lw('handles', thinSW)} opacity={layers.op('handles')} />
            ))}
            {layers.show('handles') && (
              <SharknoseLinesSVG zones={rp.face_zones.filter(fz => { const it = faceZoneItem(fz.face_type); return !it || layers.show(it) })}
                project={(px, py) => toSVG(px, py, 0, 0)} stroke={layers.color('handles', INK2)}
                strokeWidth={lw('handles', thinSW)} dash={`${1.5 * P} ${0.8 * P}`} opacity={layers.op('handles')} fontSize={dimFs * 0.8} />
            )}
            {layers.show('handle_holes') && handleShapes(rp.face_zones.filter(fz => { const it = faceZoneItem(fz.face_type); return !it || layers.show(it) })).map((s, i) => (
              <HandleHolesSVG key={`hh-${i}`} s={s} project={(px, py) => toSVG(px, py, 0, 0)}
                color={layers.color('handle_holes', INK2)} strokeWidth={lw('handle_holes', thinSW)} opacity={layers.op('handle_holes')} />
            ))}

            {/* Hinge cup + plate bore positions */}
            {/* Hinge + drawer-front drilling are workshop detail, never on the shop drawings (Mark, 2026-10-21). */}
            {PRINT_DRILLING && layers.show('hinges') && (rp.hinge_instances ?? []).map((h, hi) => (
              <g key={`hg-${hi}`} opacity={layers.op('hinges')}>
                {[...h.cup_drills, ...h.plate_drills].map((dr, j) => {
                  const c = toSVG(dr.x, dr.y, 0, 0)
                  return <circle key={j} cx={c.x} cy={c.y} r={Math.max(dr.radius, 0.5)} fill="none" stroke={INK2}
                    strokeWidth={lw('hinges', thinSW)} strokeDasharray={lp('hinges').strokeDasharray} />
                })}
              </g>
            ))}

            {/* Drawer-box fixing bores into the back of each drawer front */}
            {PRINT_DRILLING && layers.show('drawer_front_drilling') && (
              <g opacity={layers.op('drawer_front_drilling')}>
                {[
                  ...rp.drawer_stacks.flatMap(ds => ds.slides),
                  ...(layers.show('inner_drawers') ? rp.internal_slides ?? [] : []),
                ].flatMap((s, si) => s.drills.filter(dr => dr.surface === 'drawer_front').map((dr, j) => {
                  const c = toSVG(dr.x, dr.y, 0, 0)
                  return <circle key={`dfd-${si}-${j}`} cx={c.x} cy={c.y} r={Math.max(dr.radius, 0.5)} fill="none" stroke={INK2}
                    strokeWidth={lw('drawer_front_drilling', thinSW)} strokeDasharray={lp('drawer_front_drilling').strokeDasharray} />
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
              ...(layers.show('drawer_runners') && ds.drawer_type !== 'bin' ? ds.slides.map((s: ResolvedDrawerSlide, j: number) =>
                fineRect(`sl-${i}-${j}`, 'drawer_runners', slideElevRect(s))) : []),
              ...(ds.drawer_type === 'bin' && layers.show('bins') ? binPolys(`bin-${i}`, ds) : []),
            ])}

            {/* Inner-drawer labels — one per inner-drawer front, like the canvas. */}
            {layers.show('inner_drawers') && layers.show('inner_drawer_labels') &&
              rp.internal_parts.filter(p => p.part_type === 'inner_drawer_front').map((p, i) => {
                const { x, y, w, h } = (({ ex, ey, ew, eh }) => toSVG(ex, ey, ew, eh))(shelfElevRect(p))
                const fs = layers.w('inner_drawer_labels', dimFs * 0.9)
                if (h < fs * 1.7 || w < fs * 5) return null
                return <text key={`idl-${i}`} x={x + w / 2} y={y + h - fs * 0.6} textAnchor="middle" dominantBaseline="auto"
                  opacity={layers.op('inner_drawer_labels')} fontSize={fs} fill={INK2} fontFamily="Arial, Helvetica, sans-serif">inner drawer</text>
              })}

            {/* Shelf labels — "adj sh" / "fix sh" at each shelf's top-left corner. */}
            {layers.show('shelf_labels') &&
              rp.internal_parts.filter(p => (p.part_type === 'adj_shelf' || p.part_type === 'fixed_shelf') && layers.show(internalPartItem(p.part_type))).map((p, i) => {
                const { x, y, w } = (({ ex, ey, ew, eh }) => toSVG(ex, ey, ew, eh))(shelfElevRect(p))
                const fs = layers.w('shelf_labels', dimFs * 0.75)
                if (w < fs * 4) return null
                return <text key={`shl-${i}`} x={x + fs * 0.4} y={y - fs * 0.25} textAnchor="start" dominantBaseline="auto"
                  opacity={layers.op('shelf_labels')} fontSize={fs} fill={INK2} fontFamily="Arial, Helvetica, sans-serif">
                  {p.part_type === 'adj_shelf' ? 'adj sh' : 'fix sh'}
                </text>
              })}
          </>
        ) : (
          // Fallback when cabinet is not resolved — box + toekick + face inset
          <>
            {tkH > 0 && layers.show('kick_faces') && (
              <rect x={rx} y={ry + cab.dy - tkH} width={cab.dx} height={tkH} fill="none" opacity={lp('kick_faces').opacity}
                stroke={INK2} strokeWidth={lw('kick_faces', partSW)} strokeDasharray={`${1 * P} ${0.7 * P}`} />
            )}
            {layers.any('doors', 'drawer_fronts') && cab.has_face && (() => {
              const fw = cab.dx - FACE_INS * 2, fh = cab.dy - tkH - FACE_INS * 2
              if (fw <= 0 || fh <= 0) return null
              const it = layers.show('doors') ? 'doors' : 'drawer_fronts'
              const pp = lp(it)
              return <rect x={rx + FACE_INS} y={ry + FACE_INS} width={fw} height={fh} fill={faceFill} fillOpacity={pp.fillOpacity}
                opacity={pp.opacity} stroke={INK} strokeWidth={lw(it, partSW)} strokeDasharray={pp.strokeDasharray} />
            })()}
          </>
        )}

        {/* Cabinet name just under the cabinet's bottom edge (Mark, 2026-10-21) — for floor
            units that's between the floor line and the floor dimension chain; size in the middle. */}
        {hasLabel && (
          <text x={rx + cab.dx / 2 + (cab.label_offsets?.elev?.x ?? 0)}
            y={cab.label_offsets?.elev ? ry + cab.dy / 2 + cab.label_offsets.elev.y : ry + cab.dy + labelFsL * 0.75}
            textAnchor="middle" dominantBaseline="middle" opacity={layers.op('cabinet_labels')}
            fontSize={labelFsL} fontWeight="bold" fill={INK} fontFamily="Arial, Helvetica, sans-serif">
            {cab.label ?? '—'}
          </text>
        )}
        {layers.show('cabinet_sizes') && (
          <text x={rx + cab.dx / 2} y={ry + cab.dy / 2}
            textAnchor="middle" dominantBaseline="middle" opacity={layers.op('cabinet_sizes')}
            fontSize={sizeFs} fill={INK2} fontFamily="Arial, Helvetica, sans-serif">
            {roundMm(cab.dx)}×{roundMm(cab.dy)}
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
    // A soffit overrides the room's wall-cab top, so that line only shows without one.
    const wcTop = soffitDrop == null ? room.wall_cabinet_top ?? null : null
    return (
      <g pointerEvents="none">
        {/* Ceiling */}
        <line x1={0} y1={0} x2={wall.length} y2={0} stroke={INK2} strokeWidth={thinSW} strokeDasharray={`${2 * P} ${1 * P}`} />
        <text x={wall.length + 1 * P} y={0} textAnchor="start" dominantBaseline="middle"
          fontSize={dimFs * 0.85} fill={INK2} fontFamily="Arial, Helvetica, sans-serif">C {roundMm(roomH)}</text>
        {soffitH != null && soffitH < roomH - 20 && (
          <>
            <line x1={0} y1={roomH - soffitH} x2={wall.length} y2={roomH - soffitH} stroke={INK3} strokeWidth={thinSW} strokeDasharray={`${1.2 * P} ${0.8 * P}`} />
            <text x={wall.length + 1 * P} y={roomH - soffitH} textAnchor="start" dominantBaseline="middle"
              fontSize={dimFs * 0.85} fill={INK3} fontFamily="Arial, Helvetica, sans-serif">S {roundMm(soffitH)}</text>
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
    const baseCabEl = wallCabs.find(c => !c.rule_overrides?.UNDER_PANEL && (c.assembly_class === 'base' || c.assembly_class === 'base_corner')) ?? null
    const overheadCabEl = wallCabs.find(c => !c.rule_overrides?.UNDER_PANEL && (c.assembly_class === 'wall' || c.assembly_class === 'wall_corner') && !c.bulkhead && !c.float_shelf) ?? null
    const bulkheadEl = wallCabs.find(c => !!c.bulkhead) ?? null
    const kickH = baseCabEl?.has_toekick
      ? (resolvedParts?.get(baseCabEl.id)?.toekick_parts.find(p => p.part_key === 'kick_front_face')?.DX ?? 150)
      : 0
    const baseDy = baseCabEl?.dy ?? 0
    const wcTopZ = wallCabTop(wall, room)
    const overheadDy = overheadCabEl?.dy ?? 0

    const segs: { fromY: number; toY: number; label: string }[] = []
    let cursorY = roomH
    if (baseDy > 0) {
      if (kickH > 0) { const kickTopY = roomH - kickH; segs.push({ fromY: kickTopY, toY: cursorY, label: `${kickH}` }); cursorY = kickTopY }
      // A raised cabinet (floating, z_floating) starts at its own bottom height.
      const lift = cabBottomZ(baseCabEl!, room, wall)
      if (lift > 0.5) { const liftY = roomH - kickH - lift; segs.push({ fromY: liftY, toY: cursorY, label: `${roundMm(lift)}` }); cursorY = liftY }
      const baseCarcTopY = roomH - lift - baseDy
      segs.push({ fromY: baseCarcTopY, toY: cursorY, label: `${baseDy - kickH}` }); cursorY = baseCarcTopY
      // Benchtop on this wall: its thickness above the carcase.
      const benchZ = benchHeights[0] ?? 0
      if (benchZ > roomH - cursorY + 0.5) { const benchY = roomH - benchZ; segs.push({ fromY: benchY, toY: cursorY, label: `${roundMm(cursorY - benchY)}` }); cursorY = benchY }
    }
    // Floating shelves (z_floating_shelf): those under the overheads first, the rest after.
    const shelfSpans = wallCabs.filter(c => !!c.float_shelf)
      .map(c => { const b = cabBottomZ(c, room, wall); return [b, b + c.dy] as [number, number] })
    cursorY = stackShelfSegs(segs, cursorY, roomH, shelfSpans, overheadDy > 0 ? wcTopZ - overheadDy : Infinity, mm => `${roundMm(mm)}`)
    if (overheadDy > 0) {
      const overheadBotY = roomH - (wcTopZ - overheadDy)
      const overheadTopY = roomH - wcTopZ
      if (overheadBotY < cursorY - 0.5) segs.push({ fromY: overheadBotY, toY: cursorY, label: `${roundMm(cursorY - overheadBotY)}` })
      segs.push({ fromY: overheadTopY, toY: overheadBotY, label: `${overheadDy}` }); cursorY = overheadTopY
      cursorY = stackShelfSegs(segs, cursorY, roomH, shelfSpans, Infinity, mm => `${roundMm(mm)}`)
    }
    // Bulkhead: hangs from the ceiling (z_bulkhead), its own segment.
    if (bulkheadEl && bulkheadEl.dy > 0) {
      const bhBotY = roomH - cabBottomZ(bulkheadEl, room, wall)
      const bhTopY = bhBotY - bulkheadEl.dy
      if (bhBotY < cursorY - 0.5) segs.push({ fromY: bhBotY, toY: cursorY, label: `${roundMm(cursorY - bhBotY)}` })
      segs.push({ fromY: bhTopY, toY: Math.min(bhBotY, cursorY), label: `${roundMm(Math.min(bhBotY, cursorY) - bhTopY)}` })
      cursorY = bhTopY
    }
    if (cursorY > 0.5) segs.push({ fromY: 0, toY: cursorY, label: `${roundMm(cursorY)}` })
    if (segs.length === 0) segs.push({ fromY: 0, toY: roomH, label: `${roomH}` })

    const boundaries = Array.from(new Set(segs.flatMap(s => [s.fromY, s.toY])))
    const sides = dimLabelSides(segs.map(s => ({ label: s.label, span: s.toY - s.fromY })), dimFs)
    const lineW = lw('dim_elev_height', thinSW)
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
              <DimLabel x={heightChainX} y={midY} label={seg.label} fs={dimFs} col={INK}
                bg="white" side={sides[i]} padY={0.7} fontFamily="Arial, Helvetica, sans-serif" />
            </g>
          )
        })}
      </g>
    )
  }

  // ── Bench + basin heights (overall from the floor, outside the height chain) ──
  function benchDims() {
    const lineW = lw('dim_elev_bench', thinSW)
    return (
      <g pointerEvents="none" opacity={layers.op('dim_elev_bench')}>
        {benchHeights.map((h, i) => {
          const x = heightChainX - (i + 1) * benchDimStep, y1 = roomH - h, midY = (roomH + y1) / 2
          return (
            <g key={i}>
              <line x1={x} y1={roomH} x2={x} y2={y1} stroke={INK} strokeWidth={lineW} />
              <line x1={x - tk} y1={roomH} x2={x + tk} y2={roomH} stroke={INK} strokeWidth={lineW} />
              <line x1={x - tk} y1={y1} x2={x + tk} y2={y1} stroke={INK} strokeWidth={lineW} />
              <g transform={`rotate(-90,${x},${midY})`}>
                <DimLabel x={x} y={midY} label={`${roundMm(h)}`} fs={dimFs} col={INK} bg="white" padY={0.7} fontFamily="Arial, Helvetica, sans-serif" />
              </g>
            </g>
          )
        })}
      </g>
    )
  }

  const overheadCabs = wallCabs.filter(c => !c.rule_overrides?.UNDER_PANEL && (c.assembly_class === 'wall' || c.assembly_class === 'wall_corner') && !c.bulkhead && !c.float_shelf)
  // Bulkheads (and floating shelves) overlap the overheads — their own row, just outside.
  const bulkheadCabs = wallCabs.filter(c => !!c.bulkhead || !!c.float_shelf)
  const floorCabs = wallCabs.filter(c => !c.rule_overrides?.UNDER_PANEL && (
    c.assembly_class === 'base' || c.assembly_class === 'base_corner' ||
    c.assembly_class === 'tall' || c.assembly_class === 'tall_corner'))
  // Free-standing appliances on this face take their place in the rows.
  const chainFx = fixtureChainSpans(fixtures.filter(f => layers.show(fixtureLayer(f.category))), wall, centroid(walls)).filter(s => s.side === 'face')
  const fxWall = chainFx.filter(s => s.row === 'wall'), fxFloor = chainFx.filter(s => s.row === 'floor')

  return (
    <svg
      ref={svgRef}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      xmlns="http://www.w3.org/2000/svg"
      data-vb-w={vbW} data-vb-h={vbH}
      fontFamily="Arial, Helvetica, sans-serif"
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

      {/* Doors / windows (z_fixtures P5) */}
      {openings.map(o => (
        <g key={o.fx.id}>
          <rect x={o.t0} y={roomH - o.sill - o.h} width={o.t1 - o.t0} height={o.h} fill="white" stroke={INK} strokeWidth={boxSW} />
          <OpeningElev kind={o.fx.kind ?? ''} x={o.t0} y={roomH - o.sill - o.h} w={o.t1 - o.t0} h={o.h} hingeT={o.hingeT} color={INK} lw={boxSW} z={10 / P} />
        </g>
      ))}

      {/* Floor (bold) */}
      <line x1={0} y1={roomH} x2={wall.length} y2={roomH} stroke={INK} strokeWidth={pen('ground', P)} />

      {/* Cabinets */}
      {wallCabs.map(renderCab)}

      {/* Benchtops on this face — over the cabinets, under the sinks / taps */}
      {btInfo && benchtops.length > 0 && (
        <BenchtopElevation benchtops={benchtops} walls={walls} wall={wall} side="face" roomCx={centroid(walls)} roomH={roomH}
          zoom={2 / P} layers={layers} selectedId={null} info={btInfo} profiles={btProfiles ?? {}}
          onSelect={NO_SELECT} interactive={false} print={{ P }} />
      )}

      {/* Fixtures & appliances facing this wall (sinks, ovens, rangehoods …) — over the cabinets */}
      <FixturesElevationPrint fixtures={fixtures} wall={wall} roomCx={centroid(walls)} roomH={roomH} layers={layers} P={P} />

      {/* Dimensions (layer items; the overall wall length goes with the floor chain) */}
      <>
          {layers.show('dim_elev_wall_chain') && (overheadCabs.length > 0 || fxWall.length > 0) && hChain(computeElevChain(overheadCabs, wall, fxWall), overheadChainY, 'oh', 'dim_elev_wall_chain')}
          {layers.show('dim_elev_wall_chain') && bulkheadCabs.length > 0 && hChain(computeElevChain(bulkheadCabs, wall), bulkheadChainY, 'bh', 'dim_elev_wall_chain')}
          {layers.show('dim_elev_floor_chain') && (floorCabs.length > 0 || fxFloor.length > 0) && hChain(computeElevChain(floorCabs, wall, fxFloor), floorChainY, 'fl', 'dim_elev_floor_chain')}
          {layers.show('dim_elev_height') && heightChain()}
          {layers.show('dim_elev_bench') && benchDims()}
          {layers.show('dim_openings') && openings.length > 0 && hChain(openingSegs, openingChainY, 'op', 'dim_openings')}
          {/* Sill + opening height at each right jamb (same as the canvas) */}
          {layers.show('dim_openings') && openings.map(o => {
            const x = o.t1 - 4 * P
            const lineW = lw('dim_openings', thinSW)
            const vDim = (key: string, zLo: number, zHi: number) => {
              const y0 = roomH - zLo, y1 = roomH - zHi, my = (y0 + y1) / 2
              return (
                <g key={key}>
                  <line x1={x} y1={y0} x2={x} y2={y1} stroke={INK} strokeWidth={lineW} />
                  <line x1={x - tk} y1={y0} x2={x + tk} y2={y0} stroke={INK} strokeWidth={lineW} />
                  <line x1={x - tk} y1={y1} x2={x + tk} y2={y1} stroke={INK} strokeWidth={lineW} />
                  <g transform={`rotate(-90,${x},${my})`}>
                    <DimLabel x={x} y={my} label={roundMm(zHi - zLo)} fs={dimFs} col={INK} bg="white" padY={0.7}
                      side={dimLabelFits(roundMm(zHi - zLo), zHi - zLo, dimFs) ? 0 : 1}
                      fontFamily="Arial, Helvetica, sans-serif" />
                  </g>
                </g>
              )
            }
            return (
              <g key={`opv${o.fx.id}`} pointerEvents="none" opacity={layers.op('dim_openings')}>
                {o.sill > 0.5 && vDim('s', 0, o.sill)}
                {vDim('h', o.sill, o.sill + o.h)}
              </g>
            )
          })}
          {/* Overall wall length */}
          {layers.show('dim_elev_floor_chain') && (() => {
            const mx = wall.length / 2, padX = dimFs * 1.8, padY = dimFs * 0.7
            const lineW = lw('dim_elev_floor_chain', thinSW)
            return (
              <g pointerEvents="none" opacity={layers.op('dim_elev_floor_chain')}>
                <line x1={0} y1={overallY} x2={wall.length} y2={overallY} stroke={INK} strokeWidth={lineW} />
                <line x1={0} y1={overallY - tk * 1.3} x2={0} y2={overallY + tk * 1.3} stroke={INK} strokeWidth={lineW} />
                <line x1={wall.length} y1={overallY - tk * 1.3} x2={wall.length} y2={overallY + tk * 1.3} stroke={INK} strokeWidth={lineW} />
                <rect x={mx - padX} y={overallY - padY} width={padX * 2} height={padY * 2} fill="white" />
                <text x={mx} y={overallY} textAnchor="middle" dominantBaseline="middle"
                  fontSize={dimFs * 1.1} fontWeight="bold" fill={INK} fontFamily="Arial, Helvetica, sans-serif">
                  {roundMm(wall.length)}
                </text>
              </g>
            )
          })()}
      </>

      {/* ── CAD notes (z_CAD_tool A6c) — black unless "Annotation colours" is ticked ── */}
      <AnnotationLayer annotations={notes} frame={noteFrame} paper={P} layers={layers} printColours={!!show.annotColours} />
    </svg>
  )
}
