// Per-cabinet shop sheet — one full page (front + side + 3D + cut list + hardware + overrides).
// Front/side reuse the EXACT modal geometry helpers (elevRect/sideRect/… from
// cabinetEditSvgHelpers) so they align perfectly with CabinetEditModal, rendered
// here in B&W (faces opaque, internals lighter grey). The 3D box shows a snapshot
// PNG of the modal's real Cabinet3DView when provided, else a vector axonometric.
// One SVG in page mm (viewBox = paper), so it previews 1:1 and exports in one
// svg2pdf call per page.
// True shapes (src/lib/partSolids): a part with a shape (Shape Editor, resolver
// outline, bevel, sharknose) or a turn draws its projected outline — the real
// outline where the view sees it face-on, else its silhouette. The PLAN view draws
// every part that way; the 3D view draws those parts as extruded prisms.
'use client'
import type { Wall, CabinetInstance } from '@/src/lib/types'
import { frontViewHardware, dbBox } from '@/src/lib/drawerHardwareBoxes'
import type { ResolvedCabinet, ResolvedCasePart, SlideProduct, SlideScheduleEntry, SeamJointAssign } from '@/src/lib/resolver/types'
import { seamAssignJoint, seamAssignRows } from '@/src/lib/resolver/types'
import type { CabinetCustomPart, PartPosOverrides } from './canvasDB'
import { findSlide } from '@/src/lib/resolver/resolveDrawerStack'
import { computeElevSeams } from '@/src/lib/cabinetSeams'
import {
  elevRect, tkElevRect, zoneElevRect, intElevRect, dbElevRect, slideElevRect,
  sideRect, tkSideRect, intSideRect, zoneSideRect, dbSideRect, slideSideRect,
  caseBox, tkBox3, intBox3, zoneBox3, dbBox3, slideBox3, type Box3,
  doorProfileSvg, isSidePanel,
} from './cabinetEditSvgHelpers'
import { zonePartId, dbPartId, shapedPartLabel, isShapedPanelKey } from '@/src/lib/cabinetShape/partKeys'
import { buildPartSolids, prismOutline, type PartSolid, type SolidRole, type Prism, type V3, type View2D } from '@/src/lib/partSolids'
import type { ShapeSegmentLike } from '@/src/lib/shapePath'
import { zoneBlank, zoneBevelNote, caseBevelNote, tkBevelNote } from '@/src/lib/jointDrilling'
import { binOutlines, binShape } from '@/src/lib/binGeometry'
import { roundMm } from '@/src/lib/format'
import { cutListDims, cabinetLookups, shapeMark, type CutListDims, type CutListPart, type CutListTable } from '@/src/lib/optimiser/cutListDims'
import type { ShapeRow } from '@/src/lib/optimiser/shapes'
import { normaliseSplit, splitCaseParts, splitBaseKey, cutBaseKeys, splitPieceSuffix } from '@/src/lib/cabinetSplit'

export interface CabinetSheetLayers { internals: boolean; dims: boolean; threeD: boolean }

// Effective hardware schedules for the room (resolved room→project→shop default).
export interface HardwareCfg {
  slideProducts: SlideProduct[]
  slideEntries:  SlideScheduleEntry[]
  binNames?:     Record<string, string>   // bin product id → name (z_bin_cabinet)
  hingeName:     string | null
  handleName:    string | null
}

// Mirrors OverridesView.partIdLabel so the sheet's override labels match the modal.
function partIdLabel(id: string): string {
  if (id.startsWith('case_')) return CASE_LABELS[id.slice(5)] ?? id.slice(5).replace(/_/g, ' ')
  if (id.startsWith('tk_'))   { const r = id.slice(3), c = r.lastIndexOf('_'); return TK_LABELS[r.slice(0, c)] ?? r.slice(0, c).replace(/_/g, ' ') }
  if (id.startsWith('int_'))  { const r = id.slice(4), c = r.lastIndexOf('_'); return `${INT_LABELS[r.slice(0, c)] ?? r.slice(0, c).replace(/_/g, ' ')} ${parseInt(r.slice(c + 1)) + 1}` }
  if (id.startsWith('zone_')) { const [r, c] = id.slice(5).split('_').map(Number); return `Face R${r + 1}C${c + 1}` }
  if (id.startsWith('db_'))   { const p = id.slice(3).split('_'); return `Drawer Box R${Number(p[0]) + 1}C${Number(p[1]) + 1}` }
  if (id.startsWith('slide_')){ const p = id.slice(6).split('_'); return `Slide (${p[2]}) R${Number(p[0]) + 1}C${Number(p[1]) + 1}` }
  return id
}

const PAPER: Record<string, { w: number; h: number }> = {
  A4L: { w: 297, h: 210 }, A3L: { w: 420, h: 297 }, A2L: { w: 594, h: 420 }, A1L: { w: 841, h: 594 },
}

const CASE_LABELS: Record<string, string> = {
  left_side: 'Left Side', right_side: 'Right Side', bottom: 'Bottom', back: 'Back',
  full_top: 'Top', front_rail: 'Front Rail', back_rail: 'Back Rail',
}
const TK_LABELS: Record<string, string> = {
  kick_front_face: 'Toe Kick Front', kick_sub_front: 'Sub Front', kick_back: 'Toe Kick Back',
  spreader_vertical: 'Spreader (V)', spreader_horizontal: 'Spreader (H)', kick_return: 'Kick Return',
}
const INT_LABELS: Record<string, string> = {
  adj_shelf: 'Adj Shelf', fixed_shelf: 'Fixed Shelf', divider: 'Divider',
  inner_drawer_bottom: 'Drawer Bottom', inner_drawer_back: 'Drawer Back',
  inner_drawer_side: 'Drawer Side', inner_drawer_front: 'Drawer Front',
  pull_out_bottom: 'Pull-out Bottom', pull_out_side: 'Pull-out Side', pull_out_back: 'Pull-out Back',
  accessory: 'Accessory',
  rail_support: 'Rail support',
}
const FACE_LABELS: Record<string, string> = { door: 'Door', drawer_face: 'Drawer Face', false_panel: 'False Panel' }
const CLASS_LABELS: Record<string, string> = {
  base: 'Base Cabinet', wall: 'Wall Cabinet', tall: 'Tall Cabinet',
  base_corner: 'Base Corner', wall_corner: 'Wall Corner', tall_corner: 'Tall Corner',
}

const INK = '#111', INK2 = '#555', INK3 = '#999'
const CASE_STROKE = '#555'
const FACE_FILL = '#d6d6d6'          // opaque face panel
const INT_FILL = '#efefef', INT_STROKE = '#9a9a9a'   // lighter grey internals
const PANEL_T = '#f0f0f0', PANEL_R = '#e8e8e8'
const DASH = '1 0.7'

type Row = { desc: string; l: number; w: number; t: number; mat: string; qty: number }
// One part as the cut list lists it: effective size + shape (optimiser O1 / O2 rules, O6).
type Listed = { desc: string; dims: CutListDims; mat: string }
type HwRow = { item: string; qty: number; note: string }
type OvP = { X: number; Y: number; Z: number }

export default function CabinetSheetSVG({
  cab, rp: rpRaw, wall, projectName, roomName, materialNames, paperKey, svgRef, show,
  partOverrides, customParts, hardware, jointNames, shapeRows,
}: {
  cab: CabinetInstance
  rp?: ResolvedCabinet
  wall: Wall | null
  projectName: string
  roomName: string
  materialNames: Record<string, string>
  paperKey: string
  svgRef: (el: SVGSVGElement | null) => void
  show: CabinetSheetLayers
  partOverrides?: PartPosOverrides
  customParts?: CabinetCustomPart[]
  hardware?: HardwareCfg
  jointNames?: Record<string, string>
  /** part_shape_overrides rows for this cabinet (any revision order). */
  shapeRows?: ShapeRow[]
}) {
  // Turned facet hardware (z_cabinet_shape 3b) flattened to cabinet X/Y for the elevation.
  const rp = rpRaw && frontViewHardware(rpRaw)
  const paper = PAPER[paperKey] ?? PAPER.A3L
  const PW = paper.w, PH = paper.h
  const { dx, dy, dz } = cab
  const isBase = cab.assembly_class === 'base' || cab.assembly_class === 'base_corner'

  const ov = (id: string) => partOverrides?.[id]
  function applyOv<T extends OvP>(p: T, id: string): T {
    const o = ov(id); return o ? { ...p, X: p.X + o.ox, Y: p.Y + o.oy, Z: p.Z + o.oz } : p
  }

  // ── True shapes: every part as the cabinet 3D view builds it ──────────────
  const shapeOvs: Record<string, { segments: ShapeSegmentLike[] }> = {}
  {
    const rev: Record<string, number> = {}
    for (const r of shapeRows ?? []) if (!(r.part_key in rev) || r.revision > rev[r.part_key]) { rev[r.part_key] = r.revision; shapeOvs[r.part_key] = { segments: r.segments } }
  }
  const solidById = rp ? buildPartSolids(rp, partOverrides, shapeOvs) : new Map<string, PartSolid>()
  const solids = [...solidById.values()]
  type Solid = PartSolid
  type Role = SolidRole
  /** The part's solid when its rect isn't its true shape (shaped or turned). */
  const special = (id: string) => { const s = solidById.get(id); return s?.special ? s : undefined }
  type ToPage = (u: number, v: number) => [number, number]
  const outlineD = (o: { outer: { x: number; y: number }[]; holes: { x: number; y: number }[][] }, m: ToPage) =>
    [o.outer, ...o.holes].filter(l => l.length > 2)
      .map(l => 'M' + l.map(q => { const [x, y] = m(q.x, q.y); return `${x.toFixed(2)} ${y.toFixed(2)}` }).join('L') + 'Z').join('')
  const shapeEl = (key: string, sol: Solid, view: View2D, m: ToPage, props: React.SVGProps<SVGPathElement>) =>
    <path key={key} d={outlineD(prismOutline(sol.prism, view), m)} fillRule="evenodd" {...props} />

  // ── Page layout (mm) ──────────────────────────────────────────────────────
  const M = 11, headerH = 17
  const contentTop = M + headerH + 3
  const contentH = (PH - M) - contentTop
  const colGap = 6
  const leftW = (PW - 2 * M - colGap) * 0.56
  const rightX = M + leftW + colGap
  const rightW = PW - M - rightX
  const vGap = 6
  const rowH = (contentH - vGap) / 2
  const halfGap = 6
  const viewW = (leftW - halfGap) / 2
  const frontBox = { x: M, y: contentTop, w: viewW, h: rowH }
  const sideBox  = { x: M + viewW + halfGap, y: contentTop, w: viewW, h: rowH }
  const planBox  = { x: M, y: contentTop + rowH + vGap, w: viewW, h: rowH }
  const isoBox   = { x: M + viewW + halfGap, y: contentTop + rowH + vGap, w: viewW, h: rowH }
  // Right column: cut list (top) + hardware + overrides
  const hwH = 34, ovH = 30, gap = 4
  const cutBox = { x: rightX, y: contentTop, w: rightW, h: contentH - hwH - ovH - gap * 2 }
  const hwBox  = { x: rightX, y: contentTop + cutBox.h + gap, w: rightW, h: hwH }
  const ovBox  = { x: rightX, y: hwBox.y + hwH + gap, w: rightW, h: ovH }

  const OUT = 0.4, PART = 0.22, THIN = 0.16, DIMS = 0.16
  const font = 'Arial, Helvetica, sans-serif'

  function place(box: { x: number; y: number; w: number; h: number }, cw: number, ch: number,
                 pt = 5.5, pr = 4, pb = 4, pl = 4) {
    const aw = box.w - pl - pr, ah = box.h - pt - pb
    const s = cw > 0 && ch > 0 ? Math.min(aw / cw, ah / ch) : 0
    return { s, tx: box.x + pl + (aw - cw * s) / 2, ty: box.y + pt + (ah - ch * s) / 2 }
  }
  const caption = (box: { x: number; y: number; w: number; h: number }, t: string) => (
    <text x={box.x + 2} y={box.y + 3.4} fontSize={3} fontWeight="bold" fill={INK2} fontFamily={font}>{t}</text>
  )
  const frame = (box: { x: number; y: number; w: number; h: number }) => (
    <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="none" stroke="#ddd" strokeWidth={THIN} />
  )
  function dim(x1: number, y1: number, x2: number, y2: number, label: string, side: 'below' | 'left', key: string) {
    const els: React.ReactNode[] = []
    els.push(<line key={`${key}l`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeWidth={DIMS} />)
    ;[[x1, y1], [x2, y2]].forEach(([tx, tyy], i) => els.push(<line key={`${key}t${i}`} x1={tx - 1} y1={tyy - 1} x2={tx + 1} y2={tyy + 1} stroke={INK} strokeWidth={DIMS} />))
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
    if (side === 'below') els.push(<text key={`${key}x`} x={mx} y={my + 3} textAnchor="middle" fontSize={2.5} fill={INK} fontFamily={font}>{label}</text>)
    else els.push(<text key={`${key}x`} x={mx - 1.5} y={my} textAnchor="middle" fontSize={2.5} fill={INK} fontFamily={font} transform={`rotate(-90 ${mx - 1.5} ${my})`}>{label}</text>)
    return els
  }

  // ── FRONT (modal elevRect geometry, B&W) ──────────────────────────────────
  function front() {
    const { s, tx, ty } = place(frontBox, dx, dy, 6, 5, show.dims ? 8 : 4, show.dims ? 9 : 4)
    const R = (ex: number, ey: number, ew: number, eh: number) => ({ x: tx + ex * s, y: ty + (dy - ey) * s, width: ew * s, height: eh * s })
    const FM: ToPage = (u, v) => [tx + u * s, ty + (dy - v) * s]
    const els: React.ReactNode[] = []
    els.push(<rect key="ob" {...R(0, dy, dx, dy)} fill="white" stroke={INK} strokeWidth={OUT} />)
    if (rp) {
      rp.case_parts.filter(p => p.part_key !== 'back').forEach((p, i) => {
        const sp = special(`case_${p.part_key}`)
        if (sp) { els.push(shapeEl(`c${i}`, sp, 'front', FM, { fill: 'none', stroke: CASE_STROKE, strokeWidth: PART })); return }
        const r = elevRect({ ...applyOv(p, `case_${p.part_key}`), part_key: p.part_key })
        els.push(<rect key={`c${i}`} {...R(r.ex, r.ey, r.ew, r.eh)} fill="none" stroke={CASE_STROKE} strokeWidth={PART} />)
      })
      rp.toekick_parts.forEach((p, i) => {
        const spreader = p.part_key === 'spreader_vertical' || p.part_key === 'spreader_horizontal'
        const sp = special(`tk_${p.part_key}_${p.sort_order}`)
        if (sp) { els.push(shapeEl(`t${i}`, sp, 'front', FM, { fill: 'none', stroke: spreader ? INK3 : INK2, strokeWidth: PART, strokeDasharray: spreader ? DASH : undefined })); return }
        const r = tkElevRect(applyOv(p, `tk_${p.part_key}_${p.sort_order}`))
        els.push(<rect key={`t${i}`} {...R(r.ex, r.ey, r.ew, r.eh)} fill="none" stroke={spreader ? INK3 : INK2} strokeWidth={PART} strokeDasharray={spreader ? `${1 * 1} 0.7` : undefined} />)
      })
      // Opaque faces
      rp.face_zones.filter(z => z.face_type !== 'open').forEach((z, i) => {
        const r = zoneElevRect(applyOv(z, zonePartId(z)))
        const rc = R(r.ex, r.ey, r.ew, r.eh)
        const sp = special(zonePartId(z))
        els.push(sp ? shapeEl(`f${i}`, sp, 'front', FM, { fill: FACE_FILL, stroke: INK, strokeWidth: PART })
          : <rect key={`f${i}`} {...rc} fill={FACE_FILL} stroke={INK} strokeWidth={PART} />)
        if (z.hinge_side === 'left') els.push(<line key={`fh${i}`} x1={rc.x} y1={rc.y} x2={rc.x} y2={rc.y + rc.height} stroke={INK} strokeWidth={OUT} />)
        if (z.hinge_side === 'right') els.push(<line key={`fh${i}`} x1={rc.x + rc.width} y1={rc.y} x2={rc.x + rc.width} y2={rc.y + rc.height} stroke={INK} strokeWidth={OUT} />)
        const fp = !sp?.shaped && doorProfileSvg(z, { x: rc.x, y: rc.y, w: rc.width, h: rc.height }, INK, THIN, 0.9)
        if (fp) els.push(<g key={`fp${i}`}>{fp}</g>)
      })
      // Internals (lighter grey, on top so visible through faces)
      if (show.internals) {
        rp.internal_parts.forEach((p, i) => {
          const sp = special(`int_${p.part_type}_${p.sort_order}`)
          if (sp) { els.push(shapeEl(`i${i}`, sp, 'front', FM, { fill: INT_FILL, fillOpacity: 0.6, stroke: INT_STROKE, strokeWidth: THIN, strokeDasharray: DASH })); return }
          const r = intElevRect(applyOv(p, `int_${p.part_type}_${p.sort_order}`))
          els.push(<rect key={`i${i}`} {...R(r.ex, r.ey, r.ew, r.eh)} fill={INT_FILL} fillOpacity={0.6} stroke={INT_STROKE} strokeWidth={THIN} strokeDasharray={DASH} />)
        })
        ;(rp.drawer_stacks ?? []).forEach((stk, si) => {
          stk.box_parts.forEach((p, j) => { const sp = special(dbPartId(stk, p.part_type)); if (sp) { els.push(shapeEl(`db${si}_${j}`, sp, 'front', FM, { fill: INT_FILL, fillOpacity: 0.6, stroke: INT_STROKE, strokeWidth: THIN, strokeDasharray: DASH })); return }; const r = dbElevRect(p); els.push(<rect key={`db${si}_${j}`} {...R(r.ex, r.ey, r.ew, r.eh)} fill={INT_FILL} fillOpacity={0.6} stroke={INT_STROKE} strokeWidth={THIN} strokeDasharray={DASH} />) })
          if (stk.drawer_type === 'bin') { els.push(...binOutlines(stk, 'front').map((o, j) => <polygon key={`binf${si}_${j}`} points={o.pts.map(([h, y]) => `${tx + h * s},${ty + (dy - y) * s}`).join(' ')} fill="none" stroke={INT_STROKE} strokeWidth={THIN} strokeDasharray={DASH} />)); return }   // z_bin_cabinet: bin outline, not rails
          stk.slides.forEach((sl, j) => { const r = slideElevRect(sl); els.push(<rect key={`sl${si}_${j}`} {...R(r.ex, r.ey, r.ew, r.eh)} fill="none" stroke={INT_STROKE} strokeWidth={THIN} strokeDasharray={DASH} />) })
        })
        // A shaped back sits behind everything: its true outline, dashed.
        const back = solidById.get('case_back')
        if (back?.shaped) els.push(shapeEl('bk', back, 'front', FM, { fill: 'none', stroke: INT_STROKE, strokeWidth: THIN, strokeDasharray: DASH }))
        // Hinge cup + plate bore positions (front projection).
        ;(rp.hinge_instances ?? []).forEach((h, hi) => {
          [...h.cup_drills, ...h.plate_drills].forEach((dr, j) => {
            els.push(<circle key={`hg${hi}_${j}`} cx={tx + dr.x * s} cy={ty + (dy - dr.y) * s} r={Math.max(dr.radius * s, 0.4)} fill="none" stroke={INK2} strokeWidth={THIN} />)
          })
        })
      }
    } else if (cab.has_face) {
      const ins = 15, fw = dx - ins * 2, fh = dy - ins * 2
      if (fw > 0 && fh > 0) els.push(<rect key="ff" {...R(ins, dy - ins, fw, fh)} fill={FACE_FILL} stroke={INK} strokeWidth={PART} />)
    }
    // Height split (z_cabinet_split): where the sides and back are cut, with the height.
    ;(normaliseSplit(cab.split)?.at ?? []).forEach((h, i) => {
      const y = ty + (dy - h) * s
      els.push(<line key={`sp${i}`} x1={tx - 3} y1={y} x2={tx + dx * s + 3} y2={y} stroke={INK} strokeWidth={PART} strokeDasharray={DASH} />)
      els.push(<text key={`spt${i}`} x={tx + dx * s + 4} y={y + 1} fontSize={2.5} fill={INK} fontFamily={font}>SPLIT {roundMm(h)}</text>)
    })
    if (show.dims) {
      const yb = ty + dy * s + 4
      els.push(...dim(tx, yb, tx + dx * s, yb, `${roundMm(dx)}`, 'below', 'fw'))
      const xl = tx - 4.5
      els.push(...dim(xl, ty, xl, ty + dy * s, `${roundMm(dy)}`, 'left', 'fh'))
    }
    return els
  }

  // ── SIDE (modal sideRect geometry, B&W) ───────────────────────────────────
  function side() {
    const { s, tx, ty } = place(sideBox, dz, dy, 6, 5, show.dims ? 8 : 4, show.dims ? 9 : 4)
    const S = (sz: number, cyTop: number, w: number, h: number) => ({ x: tx + sz * s, y: ty + (dy - cyTop) * s, width: w * s, height: h * s })
    const SM: ToPage = (u, v) => [tx + u * s, ty + (dy - v) * s]
    const els: React.ReactNode[] = []
    els.push(<rect key="ob" {...S(0, dy, dz, dy)} fill="white" stroke={INK} strokeWidth={OUT} />)
    if (rp) {
      rp.case_parts.forEach((p, i) => {
        const sp = special(`case_${p.part_key}`)
        if (sp) { els.push(shapeEl(`c${i}`, sp, 'side', SM, { fill: 'none', stroke: CASE_STROKE, strokeWidth: PART })); return }
        const r = sideRect(applyOv(p, `case_${p.part_key}`)); if (!r) return
        els.push(<rect key={`c${i}`} {...S(r.sz, r.cy_top, r.sw, r.sh)} fill="none" stroke={CASE_STROKE} strokeWidth={PART} />)
      })
      rp.toekick_parts.forEach((p, i) => {
        const spreader = p.part_key === 'spreader_vertical' || p.part_key === 'spreader_horizontal'
        const sp = special(`tk_${p.part_key}_${p.sort_order}`)
        if (sp) { els.push(shapeEl(`t${i}`, sp, 'side', SM, { fill: 'none', stroke: spreader ? INK3 : INK2, strokeWidth: PART, strokeDasharray: spreader ? DASH : undefined })); return }
        const r = tkSideRect(applyOv(p, `tk_${p.part_key}_${p.sort_order}`))
        els.push(<rect key={`t${i}`} {...S(r.sz, r.cy_top, r.sw, r.sh)} fill="none" stroke={spreader ? INK3 : INK2} strokeWidth={PART} strokeDasharray={spreader ? '1 0.7' : undefined} />)
      })
      rp.face_zones.filter(z => z.face_type !== 'open').forEach((z, i) => {
        const sp = special(zonePartId(z))
        if (sp) { els.push(shapeEl(`f${i}`, sp, 'side', SM, { fill: FACE_FILL, stroke: INK, strokeWidth: PART })); return }
        const r = zoneSideRect(applyOv(z, zonePartId(z)))
        els.push(<rect key={`f${i}`} {...S(r.sz, r.cy_top, r.sw, r.sh)} fill={FACE_FILL} stroke={INK} strokeWidth={PART} />)
      })
      if (show.internals) {
        rp.internal_parts.forEach((p, i) => {
          const sp = special(`int_${p.part_type}_${p.sort_order}`)
          if (sp) { els.push(shapeEl(`i${i}`, sp, 'side', SM, { fill: INT_FILL, fillOpacity: 0.6, stroke: INT_STROKE, strokeWidth: THIN, strokeDasharray: DASH })); return }
          const r = intSideRect(applyOv(p, `int_${p.part_type}_${p.sort_order}`))
          els.push(<rect key={`i${i}`} {...S(r.sz, r.cy_top, r.sw, r.sh)} fill={INT_FILL} fillOpacity={0.6} stroke={INT_STROKE} strokeWidth={THIN} strokeDasharray={DASH} />)
        })
        ;(rp.drawer_stacks ?? []).forEach((stk, si) => {
          stk.box_parts.forEach((p, j) => { const sp = special(dbPartId(stk, p.part_type)); if (sp) { els.push(shapeEl(`db${si}_${j}`, sp, 'side', SM, { fill: INT_FILL, fillOpacity: 0.6, stroke: INT_STROKE, strokeWidth: THIN, strokeDasharray: DASH })); return }; const r = dbSideRect(p); els.push(<rect key={`db${si}_${j}`} {...S(r.sz, r.cy_top, r.sw, r.sh)} fill={INT_FILL} fillOpacity={0.6} stroke={INT_STROKE} strokeWidth={THIN} strokeDasharray={DASH} />) })
          if (stk.drawer_type === 'bin') { els.push(...binOutlines(stk, 'side').map((o, j) => <polygon key={`bins${si}_${j}`} points={o.pts.map(([h, y]) => `${tx + h * s},${ty + (dy - y) * s}`).join(' ')} fill="none" stroke={INT_STROKE} strokeWidth={THIN} strokeDasharray={DASH} />)); return }
          stk.slides.forEach((sl, j) => { const r = slideSideRect(sl); els.push(<rect key={`sl${si}_${j}`} {...S(r.sz, r.cy_top, r.sw, r.sh)} fill="none" stroke={INT_STROKE} strokeWidth={THIN} strokeDasharray={DASH} />) })
        })
      }
    }
    if (show.dims) {
      const yb = ty + dy * s + 4
      els.push(...dim(tx, yb, tx + dz * s, yb, `${roundMm(dz)}`, 'below', 'sd'))
      const xl = tx - 4.5
      els.push(...dim(xl, ty, xl, ty + dy * s, `${roundMm(dy)}`, 'left', 'sh'))
    }
    return els
  }

  // ── PLAN (from above, front of the cabinet down the page) ─────────────────
  // Every part's true outline seen from above, line-drawn like the front view:
  // carcase / kick lines, grey fronts, internals dashed (no fill — shelves stack).
  function plan() {
    const shown = solids.filter(sol => show.internals || (sol.role !== 'int' && sol.role !== 'db'))
    const outs = shown.map(sol => ({ sol, o: prismOutline(sol.prism, 'plan') }))
    let x0 = 0, z0 = 0, x1 = dx, z1 = dz
    for (const { o } of outs) for (const q of o.outer) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.y); z1 = Math.max(z1, q.y) }
    const { s, tx, ty } = place(planBox, x1 - x0, z1 - z0, 6, 5, show.dims ? 8 : 4, show.dims ? 9 : 4)
    const PM: ToPage = (u, v) => [tx + (u - x0) * s, ty + (v - z0) * s]
    const [fx, fy] = PM(0, 0)
    const els: React.ReactNode[] = []
    els.push(<rect key="ob" x={fx} y={fy} width={dx * s} height={dz * s} fill="white" stroke={INK} strokeWidth={OUT} />)
    const style: Record<Role, React.SVGProps<SVGPathElement>> = {
      case:     { fill: 'none', stroke: CASE_STROKE, strokeWidth: PART },
      kick:     { fill: 'none', stroke: INK2, strokeWidth: PART },
      spreader: { fill: 'none', stroke: INK3, strokeWidth: PART, strokeDasharray: DASH },
      face:     { fill: FACE_FILL, stroke: INK, strokeWidth: PART },
      int:      { fill: 'none', stroke: INT_STROKE, strokeWidth: THIN, strokeDasharray: DASH },
      db:       { fill: 'none', stroke: INT_STROKE, strokeWidth: THIN, strokeDasharray: DASH },
    }
    // Internals last so they show through, as on the front view.
    const order: Role[] = ['case', 'kick', 'spreader', 'face', 'int', 'db']
    for (const role of order) outs.filter(x => x.sol.role === role).forEach(({ o }, i) =>
      els.push(<path key={`p${role}${i}`} d={outlineD(o, PM)} fillRule="evenodd" {...style[role]} />))
    if (show.dims) {
      const yb = ty + (z1 - z0) * s + 4
      els.push(...dim(fx, yb, fx + dx * s, yb, `${roundMm(dx)}`, 'below', 'pw'))
      const xl = tx - 4.5
      els.push(...dim(xl, fy, xl, fy + dz * s, `${roundMm(dz)}`, 'left', 'pd'))
    }
    return els
  }

  // ── 3D line view (oblique) — every part as a projected box. External parts
  //    opaque & painter-sorted back→front; internals dashed on top (show through).
  function iso() {
    const f = 0.5, cos = 0.866, sin = 0.5
    const dxz = dz * f * cos, dyz = dz * f * sin
    const { s, tx, ty } = place(isoBox, dx + dxz, dy + dyz, 6, 8, 6, 6)
    // cabinet coords: +X right, +Y up, +Z front (origin back-bottom-left)
    const P = (cx: number, cy: number, cz: number) => {
      const zf = dz - cz
      return `${tx + (cx + zf * f * cos) * s},${ty + ((dy - cy) - zf * f * sin + dyz) * s}`
    }
    // A shaped / turned part as its extruded prism: visible faces filled far→near
    // (shaded by which way they face, like the box faces), then the visible
    // outline — cap edges, silhouettes and creases (not every facet of a curve).
    const VIEW: V3 = [f * cos, f * sin, 1]   // toward the viewer: front, right, up
    const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
    const crossV = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
    const shade = (n: V3, faceFill: string) => {
      const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2])
      return ax >= ay && ax >= az ? PANEL_R : ay >= az ? PANEL_T : faceFill
    }
    const loopD = (l: V3[]) => 'M' + l.map(v => P(...v)).join('L') + 'Z'
    function prismIso(key: string, pr: Prism, faceFill: string, dashed: boolean): React.ReactNode[] {
      const L = pr.outer, n = L.length, E = pr.ext
      if (n < 3) return []
      const N: V3 = [0, 0, 0]   // Newell normal: the loop runs CCW about it
      for (let i = 0; i < n; i++) {
        const a = L[i], b = L[(i + 1) % n]
        N[0] += (a[1] - b[1]) * (a[2] + b[2]); N[1] += (a[2] - b[2]) * (a[0] + b[0]); N[2] += (a[0] - b[0]) * (a[1] + b[1])
      }
      const cap0N: V3 = dot(N, E) > 0 ? [-N[0], -N[1], -N[2]] : N   // outward at the outer loop's cap
      const cap0Vis = dot(cap0N, VIEW) > 0
      const L1 = L.map(v => add(v, E))
      const qN = L.map((a, i) => { const b = L[(i + 1) % n]; return crossV([b[0] - a[0], b[1] - a[1], b[2] - a[2]], N) })
      const vis = qN.map(q => dot(q, VIEW) > 1e-9)
      const els: React.ReactNode[] = []
      if (!dashed) {
        const order = L.map((_, i) => i).filter(i => vis[i])
          .sort((i, j) => dot(add(L[i], L1[(i + 1) % n]), VIEW) - dot(add(L[j], L1[(j + 1) % n]), VIEW))
        for (const i of order) {
          const j = (i + 1) % n, fill = shade(qN[i], faceFill)
          els.push(<polygon key={`${key}q${i}`} points={[L[i], L[j], L1[j], L1[i]].map(v => P(...v)).join(' ')} fill={fill} stroke={fill} strokeWidth={THIN * 0.5} />)
        }
        const cap = cap0Vis ? L : L1
        const holes = cap0Vis ? pr.holes : pr.holes.map(h => h.map(v => add(v, E)))
        els.push(<path key={`${key}c`} d={[cap, ...holes].map(loopD).join('')} fillRule="evenodd" fill={shade(cap0N, faceFill)} stroke="none" />)
      }
      const segs: string[] = []
      const seg = (a: V3, b: V3) => segs.push(`M${P(...a)}L${P(...b)}`)
      const COS_CREASE = Math.cos(20 * Math.PI / 180)
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, h = (i - 1 + n) % n
        if (vis[i] || cap0Vis) seg(L[i], L[j])
        if (vis[i] || !cap0Vis) seg(L1[i], L1[j])
        const crease = vis[i] && vis[h] && dot(qN[h], qN[i]) < COS_CREASE * Math.hypot(...qN[h]) * Math.hypot(...qN[i])
        if (vis[i] !== vis[h] || crease) seg(L[i], L1[i])
      }
      for (const hl of pr.holes) {
        const l = cap0Vis ? hl : hl.map(v => add(v, E))
        l.forEach((v, i) => seg(v, l[(i + 1) % l.length]))
      }
      els.push(<path key={`${key}l`} d={segs.join('')} fill="none" strokeLinejoin="round"
        stroke={dashed ? INT_STROKE : faceFill === FACE_FILL ? INK : INK2} strokeWidth={dashed ? THIN : PART} strokeDasharray={dashed ? DASH : undefined} />)
      return els
    }
    const faces = (b: Box3) => {
      const { x, y, z, w, h, d } = b
      return {
        top:   `${P(x, y + h, z)} ${P(x + w, y + h, z)} ${P(x + w, y + h, z + d)} ${P(x, y + h, z + d)}`,
        right: `${P(x + w, y, z)} ${P(x + w, y + h, z)} ${P(x + w, y + h, z + d)} ${P(x + w, y, z + d)}`,
        front: `${P(x, y, z + d)} ${P(x + w, y, z + d)} ${P(x + w, y + h, z + d)} ${P(x, y + h, z + d)}`,
      }
    }
    const els: React.ReactNode[] = []
    if (!rp) {
      const fc = faces({ x: 0, y: 0, z: 0, w: dx, h: dy, d: dz })
      els.push(<polygon key="t" points={fc.top} fill={PANEL_T} stroke={INK2} strokeWidth={PART} />)
      els.push(<polygon key="r" points={fc.right} fill={PANEL_R} stroke={INK2} strokeWidth={PART} />)
      els.push(<polygon key="f" points={fc.front} fill="white" stroke={INK} strokeWidth={OUT} />)
      return els
    }
    // External (opaque) parts, painter-sorted back→front by centroid Z
    type Ext = { b: Box3; z: number; faceFill: string; sp?: Solid }
    const ext: Ext[] = []
    rp.case_parts.forEach(p => { const b = caseBox(applyOv(p, `case_${p.part_key}`)); ext.push({ b, z: b.z + b.d / 2, faceFill: 'white', sp: special(`case_${p.part_key}`) }) })
    rp.toekick_parts.filter(p => p.part_key.startsWith('kick')).forEach(p => { const b = tkBox3(applyOv(p, `tk_${p.part_key}_${p.sort_order}`)); ext.push({ b, z: b.z + b.d / 2, faceFill: 'white', sp: special(`tk_${p.part_key}_${p.sort_order}`) }) })
    rp.face_zones.filter(z => z.face_type !== 'open').forEach(z => { const b = zoneBox3(applyOv(z, zonePartId(z))); ext.push({ b, z: b.z + b.d / 2, faceFill: FACE_FILL, sp: special(zonePartId(z)) }) })
    // Viewer looks from front, right and above: a part clear of another to its left,
    // below or behind is drawn first. Depth centre alone ties an open box's bottom
    // with its gables (same Z span) and painted the bottom over the right gable.
    const E = 0.5
    const behind = (a: Box3, b: Box3) => a.x + a.w <= b.x + E || a.y + a.h <= b.y + E || a.z + a.d <= b.z + E
    const before = (a: Ext, b: Ext) => behind(a.b, b.b) && !behind(b.b, a.b)
    {
      const left = ext.slice().sort((a, b) => a.z - b.z), sorted: Ext[] = []
      while (left.length) {
        const k = left.findIndex(a => !left.some(b => b !== a && before(b, a)))
        sorted.push(...left.splice(k < 0 ? 0 : k, 1))
      }
      ext.splice(0, ext.length, ...sorted)
    }
    ext.forEach((e, i) => {
      if (e.sp) { els.push(...prismIso(`xp${i}`, e.sp.prism, e.faceFill, false)); return }
      const fc = faces(e.b)
      els.push(<polygon key={`xt${i}`} points={fc.top} fill={PANEL_T} stroke={INK2} strokeWidth={PART} />)
      els.push(<polygon key={`xr${i}`} points={fc.right} fill={PANEL_R} stroke={INK2} strokeWidth={PART} />)
      els.push(<polygon key={`xf${i}`} points={fc.front} fill={e.faceFill} stroke={INK} strokeWidth={PART} />)
    })
    // Internals — dashed, drawn on top so they show through the opaque shell
    if (show.internals) {
      const intl: Box3[] = []
      rp.internal_parts.forEach((p, i) => {
        const sp = special(`int_${p.part_type}_${p.sort_order}`)
        if (sp) els.push(...prismIso(`ip${i}`, sp.prism, INT_FILL, true))
        else intl.push(intBox3(applyOv(p, `int_${p.part_type}_${p.sort_order}`)))
      })
      ;(rp.drawer_stacks ?? []).forEach((stk, si) => {
        stk.box_parts.forEach((p, j) => {
          const sp = special(dbPartId(stk, p.part_type))
          if (sp) els.push(...prismIso(`dp${si}_${j}`, sp.prism, INT_FILL, true))
          else intl.push(dbBox3(p))
        })
        // A bin draws as its parts (tapered bodies as their top footprint), not its rails.
        if (stk.drawer_type === 'bin') binShape(stk).forEach(p => intl.push(p.shape === 'box'
          ? { x: p.x, y: p.y, z: p.z, w: p.w, h: p.h, d: p.d }
          : { x: p.cx - p.top[0] / 2, y: p.y0, z: p.cz - p.top[1] / 2, w: p.top[0], h: p.y1 - p.y0, d: p.top[1] }))
        else stk.slides.forEach(sl => intl.push(slideBox3(sl)))
      })
      intl.forEach((b, i) => {
        const fc = faces(b)
        els.push(<polygon key={`it${i}`} points={fc.top} fill="none" stroke={INT_STROKE} strokeWidth={THIN} strokeDasharray={DASH} />)
        els.push(<polygon key={`ir${i}`} points={fc.right} fill="none" stroke={INT_STROKE} strokeWidth={THIN} strokeDasharray={DASH} />)
        els.push(<polygon key={`if${i}`} points={fc.front} fill="none" stroke={INT_STROKE} strokeWidth={THIN} strokeDasharray={DASH} />)
      })
    }
    return els
  }

  // ── Cut list ──────────────────────────────────────────────────────────────
  // Sizes are the optimiser's (src/lib/optimiser/cutListDims — O6): hand / shape
  // resizes folded in, shaped parts marked ⬠. L = DY (grain), W = DX, T = DZ.
  const lookups = cabinetLookups(cab.id, partOverrides, shapeRows)
  function listedParts(): Listed[] {
    if (!rp) return []
    const out: Listed[] = []
    const add = (desc: string, table: CutListTable, p: CutListPart & { material_id: string }, ref?: Parameters<typeof cutListDims>[5]) => {
      const dims = cutListDims(table, p, cab.id, lookups.sizeOv, lookups.shapes, ref)
      out.push({ desc, dims, mat: materialNames[p.material_id] ?? p.material_id ?? '—' })
    }
    // Angled panel ends (z_cabinet_shape 4a): listed at the blank, bevel noted.
    // Height split (z_cabinet_split): the sides / back listed as their cut pieces,
    // each sized as the part it came from.
    const pieces = splitCaseParts(rp.case_parts, rp.split_at)
    const cutBases = cutBaseKeys(pieces.map(p => p.part_key))
    pieces.forEach(p => {
      const base = splitBaseKey(p.part_key) as typeof p.part_key
      const piece = splitPieceSuffix(p.part_key, cutBases)
      const label = (CASE_LABELS[base] ?? shapedPartLabel(base) ?? base) + piece
      add(caseBevelNote(p) ? `${label} ${caseBevelNote(p)}` : label, 'case_parts', { ...p, part_key: base })
    })
    rp.toekick_parts.filter(p => p.part_key.startsWith('kick')).forEach(p => {
      const label = TK_LABELS[p.part_key] ?? p.part_key
      add(tkBevelNote(p) ? `${label} ${tkBevelNote(p)}` : label, 'toekick_parts', p)
    })
    rp.internal_parts.forEach(p => add(INT_LABELS[p.part_type] ?? p.part_type, 'internal_parts', p))
    // Sharknose fronts carry the saw note (z_handles D3): edge + blade tilt.
    rp.face_zones.filter(z => z.face_type !== 'open').forEach(z => {
      const bv = z.handle?.bevel
      const label = FACE_LABELS[z.face_type] ?? z.face_type
      const desc = bv ? `${label} SN ${z.handle!.grip_edge === 'top' ? 'T' : 'B'}${Math.round(bv.angle_deg)}°` : label
      add(desc, 'face_zones', z, z)
    })
    ;(rp.drawer_stacks ?? []).forEach(stk => stk.box_parts.forEach(p => add(INT_LABELS[p.part_type as string] ?? p.part_type, 'drawer_box_parts', p, stk)))
    return out
  }
  const listed = listedParts()
  function cutRows(): Row[] {
    const map = new Map<string, Row>()
    for (const { desc: d0, dims, mat } of listed) {
      let desc = d0, DX = dims.DX
      // Mitred facet fronts (z_cabinet_shape 3c): cut at the front-face width, bevel noted.
      const zone = dims.partId.startsWith('zone_') ? rp!.face_zones.find(z => zonePartId(z) === dims.partId) : undefined
      const mitre = zone ? zoneBevelNote(zone) : null
      if (zone && mitre) { desc = `${desc} ${mitre}`; DX = zoneBlank({ ...zone, DX: dims.DX, DZ: dims.DZ }).width }
      const mark = shapeMark(dims)
      if (mark) desc = `${desc} ${mark}`
      const l = Math.round(dims.DY), w = Math.round(DX), t = Math.round(dims.DZ)
      const key = `${desc}|${l}|${w}|${t}|${mat}`
      const ex = map.get(key); if (ex) ex.qty++; else map.set(key, { desc, l, w, t, mat, qty: 1 })
    }
    return [...map.values()].sort((a, b) => a.desc.localeCompare(b.desc))
  }
  function cutList() {
    const rows = cutRows()
    const els: React.ReactNode[] = []
    const padc = 2.5
    const xQ = cutBox.x + cutBox.w - padc, xT = xQ - 11, xW = xT - 16, xL = xW - 16
    const xPart = cutBox.x + padc, xMat = cutBox.x + cutBox.w * 0.40
    const trunc = (str: string, n: number) => str.length > n ? str.slice(0, n - 1) + '…' : str
    els.push(<text key="ct" x={xPart} y={cutBox.y + 4} fontSize={3.2} fontWeight="bold" fill={INK} fontFamily={font}>CUT LIST</text>)
    const headY = cutBox.y + 9, fsH = 2.4
    const hdr = (k: string, x: number, t: string, a: 'start' | 'end') => <text key={k} x={x} y={headY} textAnchor={a} fontSize={fsH} fontWeight="bold" fill={INK2} fontFamily={font}>{t}</text>
    els.push(hdr('hp', xPart, 'Part', 'start'), hdr('hm', xMat, 'Material', 'start'), hdr('hl', xL, 'L', 'end'), hdr('hw', xW, 'W', 'end'), hdr('hk', xT, 'Thk', 'end'), hdr('hq', xQ, 'Qty', 'end'))
    els.push(<line key="hln" x1={cutBox.x} y1={headY + 1.5} x2={cutBox.x + cutBox.w} y2={headY + 1.5} stroke={INK2} strokeWidth={THIN} />)
    if (rows.length === 0) {
      els.push(<text key="e" x={xPart} y={headY + 7} fontSize={2.6} fill={INK3} fontFamily={font}>{rp ? 'No parts.' : 'Cabinet not resolved — open it to generate parts.'}</text>)
      return els
    }
    const top = headY + 4, avail = cutBox.y + cutBox.h - top - 1
    const rh = Math.max(3, Math.min(5, avail / rows.length)), fs = Math.min(2.6, rh * 0.62)
    rows.forEach((row, i) => {
      const y = top + rh * i + rh * 0.7
      if (i % 2 === 1) els.push(<rect key={`zb${i}`} x={cutBox.x} y={top + rh * i} width={cutBox.w} height={rh} fill="#f5f5f5" />)
      els.push(<text key={`p${i}`} x={xPart} y={y} fontSize={fs} fill={INK} fontFamily={font}>{trunc(row.desc, 24)}</text>)
      els.push(<text key={`m${i}`} x={xMat} y={y} fontSize={fs} fill={INK2} fontFamily={font}>{trunc(row.mat, 13)}</text>)
      els.push(<text key={`w${i}`} x={xW} y={y} textAnchor="end" fontSize={fs} fill={INK} fontFamily={font}>{row.w}</text>)
      els.push(<text key={`l${i}`} x={xL} y={y} textAnchor="end" fontSize={fs} fill={INK} fontFamily={font}>{row.l}</text>)
      els.push(<text key={`k${i}`} x={xT} y={y} textAnchor="end" fontSize={fs} fill={INK} fontFamily={font}>{row.t}</text>)
      els.push(<text key={`q${i}`} x={xQ} y={y} textAnchor="end" fontSize={fs} fontWeight="bold" fill={INK} fontFamily={font}>{row.qty}</text>)
    })
    return els
  }

  // ── Hardware (from the room's slide / hinge / handle schedules) ────────────
  function hwRows(): HwRow[] {
    if (!rp) return []
    const doors = rp.face_zones.filter(z => z.face_type === 'door')
    // Bin fronts (z_bin_cabinet) carry their own runners — listed as the bin
    // the resolver picked, never as a drawer runner pair.
    const binStacks = (rp.drawer_stacks ?? []).filter(st => st.drawer_type === 'bin')
    const isBinZone = (z: { row_index: number; col_index: number; facet?: string }) =>
      binStacks.some(st => st.face_zone_row === z.row_index && st.face_zone_col === z.col_index && (st.facet ?? null) === (z.facet ?? null))
    // The front's type lives on the cabinet's face grid (resolved zones don't carry it).
    const gridZones = ((cab.face_grid as { zones?: { row_index: number; col_index: number; drawer_type_config?: { type?: string } }[] } | null)?.zones) ?? []
    const binCfg = (z: { row_index: number; col_index: number; facet?: string }) => !z.facet &&
      gridZones.some(g => g.row_index === z.row_index && g.col_index === z.col_index && g.drawer_type_config?.type === 'bin')
    const binZoneCount = rp.face_zones.filter(z => z.face_type === 'drawer_face' && (binCfg(z) || isBinZone(z))).length
    const drawerZones = rp.face_zones.filter(z => z.face_type === 'drawer_face' && !isBinZone(z) && !binCfg(z))
    const out: HwRow[] = []
    if (binStacks.length || binZoneCount) {
      const byBin = new Map<string, { name: string; h: number; qty: number }>()
      for (const st of binStacks) {
        const id = st.slides[0]?.slide_id ?? ''
        const name = hardware?.binNames?.[id] ?? 'Pull-out bin'
        const e = byBin.get(id); if (e) e.qty++; else byBin.set(id, { name, h: st.box_height, qty: 1 })
      }
      for (const v of byBin.values()) out.push({ item: v.name, qty: v.qty, note: `${Math.round(v.h)} high · runners incl.` })
      const unplaced = binZoneCount - binStacks.length
      if (unplaced > 0) out.push({ item: 'Pull-out bin — none fits', qty: unplaced, note: 'see cabinet warnings' })
    }
    // Drawer runners — the runner the resolver gave each drawer (honours a
    // per-drawer runner choice); else chosen from the slide schedule. Aggregated by model.
    if (drawerZones.length) {
      if (hardware && (hardware.slideProducts.length || hardware.slideEntries.length)) {
        const avail = dz - 40   // ≈ internal depth minus slide setback
        const byKey = new Map<string, { name: string; nl: number; qty: number }>()
        const stackOf = (z: (typeof drawerZones)[number]) => (rp.drawer_stacks ?? []).find(st =>
          st.drawer_type !== 'bin' && st.face_zone_row === z.row_index && st.face_zone_col === z.col_index && (st.facet ?? null) === (z.facet ?? null))
        for (const z of drawerZones) {
          const sid = stackOf(z)?.slides[0]?.slide_id
          const slide = (sid ? hardware.slideProducts.find(s => s.id === sid) : undefined)
            ?? findSlide(avail, z.DY, hardware.slideProducts, hardware.slideEntries)   // DY = opening height
          const name = slide?.name ?? 'Drawer runner'
          const nl = slide?.nominal_length ?? 0
          const k = `${name}|${nl}`
          const e = byKey.get(k); if (e) e.qty++; else byKey.set(k, { name, nl, qty: 1 })
        }
        for (const v of byKey.values()) out.push({ item: `${v.name} (pair)`, qty: v.qty, note: v.nl ? `${v.nl}mm` : '' })
      } else {
        out.push({ item: 'Drawer runner (pair)', qty: drawerZones.length, note: '' })
      }
    }
    // Door hinges — use resolved hinge_instances when present (exact), else an
    // estimate by door height. Plates listed separately when assigned.
    if (doors.length) {
      const hinges = rp.hinge_instances ?? []
      const doorNote = `${doors.length} ${doors.length === 1 ? 'door' : 'doors'}`
      if (hinges.length) {
        // Shaped cabinets (z_cabinet_shape decision 10): doors hung on an
        // off-square panel need an angled hinge — listed per angle, flagged when
        // the library has none.
        const square = hinges.filter(h => !h.mount_angle_deg)
        // Pie-corner pairs (L2) bring their own hinges — listed by name.
        const byName = new Map<string, number>()
        for (const h of square) {
          const name = (h.pie ? h.hinge_name : undefined) ?? hardware?.hingeName ?? 'Door hinge'
          byName.set(name, (byName.get(name) ?? 0) + 1)
        }
        for (const [name, qty] of byName) out.push({ item: name, qty, note: doorNote })
        const byAngle = new Map<number, { qty: number; missing: boolean }>()
        for (const h of hinges) {
          if (!h.mount_angle_deg) continue
          const e = byAngle.get(h.mount_angle_deg) ?? { qty: 0, missing: false }
          e.qty++; e.missing ||= h.angle_matched === false
          byAngle.set(h.mount_angle_deg, e)
        }
        for (const [a, e] of byAngle) out.push({
          item: `${a > 0 ? '+' : ''}${a}° angled hinge`, qty: e.qty,
          note: e.missing ? 'NOT IN LIBRARY — order' : '',
        })
        const plateQty = hinges.filter(h => h.hinge_plate_id).length
        if (plateQty) out.push({ item: 'Hinge plate', qty: plateQty, note: '' })
      } else {
        const hingeCount = (h: number) => h <= 900 ? 2 : h <= 1500 ? 3 : h <= 2000 ? 4 : 5
        const qty = doors.reduce((sum, d) => sum + hingeCount(d.DX), 0)
        out.push({ item: hardware?.hingeName ?? 'Door hinge', qty, note: doorNote })
      }
    }
    // Handles — the resolved grip on each door / drawer front, grouped by model
    // (z_handles H1). Zones resolved before handles existed (handle undefined)
    // fall back to the schedule's name; null = deliberately no handle.
    const byHandle = new Map<string, number>()
    for (const z of [...doors, ...drawerZones]) {
      if (z.handle === null) continue
      if (z.handle?.grip_kind === 'sharknose') continue   // sawn into the front — no hardware
      if (z.handle?.grip_kind === 'linear') continue      // a board strip (lh: part, D17) — on the cut list, not hardware
      const name = z.handle?.name ?? hardware?.handleName ?? 'Handle'
      byHandle.set(name, (byHandle.get(name) ?? 0) + 1)
    }
    for (const [name, qty] of byHandle) out.push({ item: name, qty, note: '' })
    if (isBase && cab.toe_type === 'leg') out.push({ item: 'Adjustable leg', qty: 4, note: '' })
    // Angled panel-to-panel joints: no CNC holes, fixed by hand (HAND_FIX_JOINT).
    for (const w of rp.warnings ?? []) {
      if (w.code !== 'HAND_FIX_JOINT') continue
      out.push({ item: `Hand-fix joint ${/(\d+)°/.exec(w.message)?.[1] ?? ''}°`, qty: 1, note: w.message.split(' meet at ')[0] })
    }
    return out
  }
  function tableHeader(box: { x: number; y: number; w: number; h: number }, title: string, cols: [string, number, 'start' | 'end'][]) {
    const els: React.ReactNode[] = []
    els.push(<text key={`${title}t`} x={box.x + 2.5} y={box.y + 4} fontSize={3.2} fontWeight="bold" fill={INK} fontFamily={font}>{title}</text>)
    const headY = box.y + 9
    cols.forEach(([t, x, a], i) => els.push(<text key={`${title}h${i}`} x={x} y={headY} textAnchor={a} fontSize={2.4} fontWeight="bold" fill={INK2} fontFamily={font}>{t}</text>))
    els.push(<line key={`${title}ln`} x1={box.x} y1={headY + 1.5} x2={box.x + box.w} y2={headY + 1.5} stroke={INK2} strokeWidth={THIN} />)
    return { els, top: headY + 4 }
  }
  function hardwareTable() {
    const rows = hwRows()
    const xItem = hwBox.x + 2.5, xNote = hwBox.x + hwBox.w * 0.52, xQ = hwBox.x + hwBox.w - 2.5
    const { els, top } = tableHeader(hwBox, 'HARDWARE', [['Item', xItem, 'start'], ['Note', xNote, 'start'], ['Qty', xQ, 'end']])
    if (rows.length === 0) { els.push(<text key="he" x={xItem} y={top + 3} fontSize={2.6} fill={INK3} fontFamily={font}>None.</text>); return els }
    const rh = 4.6
    rows.forEach((row, i) => {
      const y = top + rh * i + rh * 0.7
      if (i % 2 === 1) els.push(<rect key={`hzb${i}`} x={hwBox.x} y={top + rh * i} width={hwBox.w} height={rh} fill="#f5f5f5" />)
      els.push(<text key={`hi${i}`} x={xItem} y={y} fontSize={2.6} fill={INK} fontFamily={font}>{row.item}</text>)
      els.push(<text key={`hn${i}`} x={xNote} y={y} fontSize={2.6} fill={INK2} fontFamily={font}>{row.note}</text>)
      els.push(<text key={`hq${i}`} x={xQ} y={y} textAnchor="end" fontSize={2.6} fontWeight="bold" fill={INK} fontFamily={font}>{row.qty}</text>)
    })
    return els
  }

  // ── Overrides — mirrors the modal's Overrides tab (same DB data) ──────────
  function overrideRows(): string[] {
    const rows: string[] = []
    // Position offsets
    for (const [id, o] of Object.entries(partOverrides ?? {})) {
      const seg: string[] = []
      if (o.ox) seg.push(`x${o.ox > 0 ? '+' : ''}${o.ox}`)
      if (o.oy) seg.push(`y${o.oy > 0 ? '+' : ''}${o.oy}`)
      if (o.oz) seg.push(`z${o.oz > 0 ? '+' : ''}${o.oz}`)
      if (o.oax || o.oay || o.oaz) seg.push(`rot ${o.oax || 0}/${o.oay || 0}/${o.oaz || 0}°`)
      if (seg.length) rows.push(`${partIdLabel(id)}: ${seg.join(' ')}`)
    }
    // Size overrides (hand resize or a shape's bbox) and drawn shapes — the same
    // effective sizes the cut list shows (O6).
    const fmt = (v: number) => String(roundMm(v))
    for (const { desc, dims } of listed) {
      const seg: string[] = []
      if (dims.base) {
        if (Math.abs(dims.base.DY - dims.DY) > 1e-6) seg.push(`L ${fmt(dims.base.DY)}→${fmt(dims.DY)}`)
        if (Math.abs(dims.base.DX - dims.DX) > 1e-6) seg.push(`W ${fmt(dims.base.DX)}→${fmt(dims.DX)}`)
        if (Math.abs(dims.base.DZ - dims.DZ) > 1e-6) seg.push(`T ${fmt(dims.base.DZ)}→${fmt(dims.DZ)}`)
      }
      if (dims.shape?.source === 'drawn') seg.push(dims.shape.stale ? 'shape STALE — re-edit' : `shape r${dims.shape.revision}`)
      if (seg.length) rows.push(`${desc}: ${seg.join(' ')}`)
    }
    // Joint overrides (seam label + assigned joint name / suppressed / rows)
    const cj = (cab.carcase_joints ?? {}) as Record<string, SeamJointAssign>
    if (Object.keys(cj).length) {
      const labelByKey: Record<string, string> = {}
      if (rp) for (const sm of computeElevSeams(rp)) labelByKey[sm.key] = sm.label
      for (const [key, val] of Object.entries(cj)) {
        const lbl = labelByKey[key] ?? key.replace(/[:_]/g, ' ')
        const joint = seamAssignJoint(val)
        const jr = seamAssignRows(val)
        const desc = joint === null ? 'Suppressed'
          : `${joint ? (jointNames?.[joint] ?? 'Assigned') : 'Method joint'}${jr ? ` · ${jr} rows` : ''}`
        rows.push(`${lbl}: ${desc}`)
      }
    }
    // Custom parts
    for (const cp of customParts ?? []) rows.push(`+ ${cp.name ?? 'Custom part'} ${Math.round(Number(cp.dy))}×${Math.round(Number(cp.dx))}`)   // L × W
    return rows
  }
  function overrides() {
    const rows = overrideRows()
    const xItem = ovBox.x + 2.5
    const { els, top } = tableHeader(ovBox, 'OVERRIDES', [['Item', xItem, 'start']])
    if (rows.length === 0) { els.push(<text key="oe" x={xItem} y={top + 3} fontSize={2.6} fill={INK3} fontFamily={font}>None — standard build.</text>); return els }
    const rh = 4, fs = 2.5
    const maxRows = Math.floor((ovBox.y + ovBox.h - top) / rh)
    rows.slice(0, maxRows).forEach((row, i) => {
      const y = top + rh * i + rh * 0.7
      els.push(<text key={`o${i}`} x={xItem} y={y} fontSize={fs} fill={INK} fontFamily={font}>{row.length > 46 ? row.slice(0, 45) + '…' : row}</text>)
    })
    if (rows.length > maxRows) els.push(<text key="omore" x={ovBox.x + ovBox.w - 2.5} y={ovBox.y + ovBox.h - 1} textAnchor="end" fontSize={2.3} fill={INK3} fontFamily={font}>+{rows.length - maxRows} more</text>)
    return els
  }

  // ── Header ────────────────────────────────────────────────────────────────
  const classLabel = CLASS_LABELS[cab.assembly_class] ?? cab.assembly_class
  const loc = [roomName, wall?.name].filter(Boolean).join('  ·  ')
  const d = new Date()
  const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`

  return (
    <svg ref={svgRef} viewBox={`0 0 ${PW} ${PH}`} xmlns="http://www.w3.org/2000/svg"
      data-vb-w={PW} data-vb-h={PH}
      style={{ width: '100%', height: 'auto', background: 'white', display: 'block' }} fontFamily={font}>
      <rect x={M * 0.5} y={M * 0.5} width={PW - M} height={PH - M} fill="white" stroke={INK} strokeWidth={0.3} />

      <text x={M} y={M + 6} fontSize={6.5} fontWeight="bold" fill={INK}>{cab.label ?? '—'}</text>
      <text x={M} y={M + 12} fontSize={3.4} fill={INK2}>{classLabel}{loc ? `   ·   ${loc}` : ''}</text>
      <text x={PW - M} y={M + 6} textAnchor="end" fontSize={5} fontWeight="bold" fill={INK}>
        {roundMm(dx)} W × {roundMm(dy)} H × {roundMm(dz)} D
      </text>
      <text x={PW - M} y={M + 12} textAnchor="end" fontSize={3} fill={INK2}>{projectName}   ·   {dateStr}</text>
      <line x1={M} y1={M + headerH} x2={PW - M} y2={M + headerH} stroke={INK} strokeWidth={0.4} />

      {frame(frontBox)}{caption(frontBox, 'FRONT')}{front()}
      {frame(sideBox)}{caption(sideBox, 'SIDE')}{side()}
      {frame(planBox)}{caption(planBox, 'PLAN')}{plan()}
      {show.threeD && <>{frame(isoBox)}{caption(isoBox, '3D')}{iso()}</>}

      {cutList()}
      {hardwareTable()}
      {overrides()}
    </svg>
  )
}
