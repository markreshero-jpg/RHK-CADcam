// Per-cabinet shop sheet — one full page (front + side + 3D + cut list + hardware + overrides).
// Front/side reuse the EXACT modal geometry helpers (elevRect/sideRect/… from
// cabinetEditSvgHelpers) so they align perfectly with CabinetEditModal, rendered
// here in B&W (faces opaque, internals lighter grey). The 3D box shows a snapshot
// PNG of the modal's real Cabinet3DView when provided, else a vector axonometric.
// One SVG in page mm (viewBox = paper), so it previews 1:1 and exports in one
// svg2pdf call per page.
'use client'
import type { Wall, CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet, SlideProduct, SlideScheduleEntry } from '@/src/lib/resolver/types'
import type { CabinetCustomPart, PartPosOverrides } from './canvasDB'
import { findSlide } from '@/src/lib/resolver/resolveDrawerStack'
import { computeElevSeams } from '@/src/lib/cabinetSeams'
import {
  elevRect, tkElevRect, zoneElevRect, intElevRect, dbElevRect, slideElevRect,
  sideRect, tkSideRect, intSideRect, zoneSideRect, dbSideRect, slideSideRect,
  caseBox, tkBox3, intBox3, zoneBox3, dbBox3, slideBox3, type Box3,
  doorProfileSvg,
} from './cabinetEditSvgHelpers'

export interface CabinetSheetLayers { internals: boolean; dims: boolean; threeD: boolean }

// Effective hardware schedules for the room (resolved room→project→shop default).
export interface HardwareCfg {
  slideProducts: SlideProduct[]
  slideEntries:  SlideScheduleEntry[]
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
  spreader_vertical: 'Spreader (V)', spreader_horizontal: 'Spreader (H)',
}
const INT_LABELS: Record<string, string> = {
  adj_shelf: 'Adj Shelf', fixed_shelf: 'Fixed Shelf', divider: 'Divider',
  inner_drawer_bottom: 'Drawer Bottom', inner_drawer_back: 'Drawer Back',
  inner_drawer_side: 'Drawer Side', inner_drawer_front: 'Drawer Front',
  pull_out_bottom: 'Pull-out Bottom', pull_out_side: 'Pull-out Side', pull_out_back: 'Pull-out Back',
  accessory: 'Accessory',
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

type Row = { desc: string; w: number; l: number; t: number; mat: string; qty: number }
type HwRow = { item: string; qty: number; note: string }
type OvP = { X: number; Y: number; Z: number }

export default function CabinetSheetSVG({
  cab, rp, wall, projectName, roomName, materialNames, paperKey, svgRef, show,
  partOverrides, customParts, hardware, jointNames,
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
}) {
  const paper = PAPER[paperKey] ?? PAPER.A3L
  const PW = paper.w, PH = paper.h
  const { dx, dy, dz } = cab
  const isBase = cab.assembly_class === 'base' || cab.assembly_class === 'base_corner'

  const ov = (id: string) => partOverrides?.[id]
  function applyOv<T extends OvP>(p: T, id: string): T {
    const o = ov(id); return o ? { ...p, X: p.X + o.ox, Y: p.Y + o.oy, Z: p.Z + o.oz } : p
  }

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
  const isoBox   = { x: M, y: contentTop + rowH + vGap, w: leftW, h: rowH }
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
    const els: React.ReactNode[] = []
    els.push(<rect key="ob" {...R(0, dy, dx, dy)} fill="white" stroke={INK} strokeWidth={OUT} />)
    if (rp) {
      rp.case_parts.filter(p => p.part_key !== 'back').forEach((p, i) => {
        const r = elevRect({ ...applyOv(p, `case_${p.part_key}`), part_key: p.part_key })
        els.push(<rect key={`c${i}`} {...R(r.ex, r.ey, r.ew, r.eh)} fill="none" stroke={CASE_STROKE} strokeWidth={PART} />)
      })
      rp.toekick_parts.forEach((p, i) => {
        const spreader = p.part_key === 'spreader_vertical' || p.part_key === 'spreader_horizontal'
        const r = tkElevRect(applyOv(p, `tk_${p.part_key}_${p.sort_order}`))
        els.push(<rect key={`t${i}`} {...R(r.ex, r.ey, r.ew, r.eh)} fill="none" stroke={spreader ? INK3 : INK2} strokeWidth={PART} strokeDasharray={spreader ? `${1 * 1} 0.7` : undefined} />)
      })
      // Opaque faces
      rp.face_zones.filter(z => z.face_type !== 'open').forEach((z, i) => {
        const r = zoneElevRect(applyOv(z, `zone_${z.row_index}_${z.col_index}`))
        const rc = R(r.ex, r.ey, r.ew, r.eh)
        els.push(<rect key={`f${i}`} {...rc} fill={FACE_FILL} stroke={INK} strokeWidth={PART} />)
        if (z.hinge_side === 'left') els.push(<line key={`fh${i}`} x1={rc.x} y1={rc.y} x2={rc.x} y2={rc.y + rc.height} stroke={INK} strokeWidth={OUT} />)
        if (z.hinge_side === 'right') els.push(<line key={`fh${i}`} x1={rc.x + rc.width} y1={rc.y} x2={rc.x + rc.width} y2={rc.y + rc.height} stroke={INK} strokeWidth={OUT} />)
        const fp = doorProfileSvg(z, { x: rc.x, y: rc.y, w: rc.width, h: rc.height }, INK, THIN, 0.9)
        if (fp) els.push(<g key={`fp${i}`}>{fp}</g>)
      })
      // Internals (lighter grey, on top so visible through faces)
      if (show.internals) {
        rp.internal_parts.forEach((p, i) => {
          const r = intElevRect(applyOv(p, `int_${p.part_type}_${p.sort_order}`))
          els.push(<rect key={`i${i}`} {...R(r.ex, r.ey, r.ew, r.eh)} fill={INT_FILL} fillOpacity={0.6} stroke={INT_STROKE} strokeWidth={THIN} strokeDasharray={DASH} />)
        })
        ;(rp.drawer_stacks ?? []).forEach((stk, si) => {
          stk.box_parts.forEach((p, j) => { const r = dbElevRect(p); els.push(<rect key={`db${si}_${j}`} {...R(r.ex, r.ey, r.ew, r.eh)} fill={INT_FILL} fillOpacity={0.6} stroke={INT_STROKE} strokeWidth={THIN} strokeDasharray={DASH} />) })
          stk.slides.forEach((sl, j) => { const r = slideElevRect(sl); els.push(<rect key={`sl${si}_${j}`} {...R(r.ex, r.ey, r.ew, r.eh)} fill="none" stroke={INT_STROKE} strokeWidth={THIN} strokeDasharray={DASH} />) })
        })
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
    if (show.dims) {
      const yb = ty + dy * s + 4
      els.push(...dim(tx, yb, tx + dx * s, yb, `${Math.round(dx)}`, 'below', 'fw'))
      const xl = tx - 4.5
      els.push(...dim(xl, ty, xl, ty + dy * s, `${Math.round(dy)}`, 'left', 'fh'))
    }
    return els
  }

  // ── SIDE (modal sideRect geometry, B&W) ───────────────────────────────────
  function side() {
    const { s, tx, ty } = place(sideBox, dz, dy, 6, 5, show.dims ? 8 : 4, show.dims ? 9 : 4)
    const S = (sz: number, cyTop: number, w: number, h: number) => ({ x: tx + sz * s, y: ty + (dy - cyTop) * s, width: w * s, height: h * s })
    const els: React.ReactNode[] = []
    els.push(<rect key="ob" {...S(0, dy, dz, dy)} fill="white" stroke={INK} strokeWidth={OUT} />)
    if (rp) {
      rp.case_parts.forEach((p, i) => {
        const r = sideRect(applyOv(p, `case_${p.part_key}`)); if (!r) return
        els.push(<rect key={`c${i}`} {...S(r.sz, r.cy_top, r.sw, r.sh)} fill="none" stroke={CASE_STROKE} strokeWidth={PART} />)
      })
      rp.toekick_parts.forEach((p, i) => {
        const spreader = p.part_key === 'spreader_vertical' || p.part_key === 'spreader_horizontal'
        const r = tkSideRect(applyOv(p, `tk_${p.part_key}_${p.sort_order}`))
        els.push(<rect key={`t${i}`} {...S(r.sz, r.cy_top, r.sw, r.sh)} fill="none" stroke={spreader ? INK3 : INK2} strokeWidth={PART} strokeDasharray={spreader ? '1 0.7' : undefined} />)
      })
      rp.face_zones.filter(z => z.face_type !== 'open').forEach((z, i) => {
        const r = zoneSideRect(applyOv(z, `zone_${z.row_index}_${z.col_index}`))
        els.push(<rect key={`f${i}`} {...S(r.sz, r.cy_top, r.sw, r.sh)} fill={FACE_FILL} stroke={INK} strokeWidth={PART} />)
      })
      if (show.internals) {
        rp.internal_parts.forEach((p, i) => {
          const r = intSideRect(applyOv(p, `int_${p.part_type}_${p.sort_order}`))
          els.push(<rect key={`i${i}`} {...S(r.sz, r.cy_top, r.sw, r.sh)} fill={INT_FILL} fillOpacity={0.6} stroke={INT_STROKE} strokeWidth={THIN} strokeDasharray={DASH} />)
        })
        ;(rp.drawer_stacks ?? []).forEach((stk, si) => {
          stk.box_parts.forEach((p, j) => { const r = dbSideRect(p); els.push(<rect key={`db${si}_${j}`} {...S(r.sz, r.cy_top, r.sw, r.sh)} fill={INT_FILL} fillOpacity={0.6} stroke={INT_STROKE} strokeWidth={THIN} strokeDasharray={DASH} />) })
          stk.slides.forEach((sl, j) => { const r = slideSideRect(sl); els.push(<rect key={`sl${si}_${j}`} {...S(r.sz, r.cy_top, r.sw, r.sh)} fill="none" stroke={INT_STROKE} strokeWidth={THIN} strokeDasharray={DASH} />) })
        })
      }
    }
    if (show.dims) {
      const yb = ty + dy * s + 4
      els.push(...dim(tx, yb, tx + dz * s, yb, `${Math.round(dz)}`, 'below', 'sd'))
      const xl = tx - 4.5
      els.push(...dim(xl, ty, xl, ty + dy * s, `${Math.round(dy)}`, 'left', 'sh'))
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
    type Ext = { b: Box3; z: number; faceFill: string }
    const ext: Ext[] = []
    rp.case_parts.forEach(p => { const b = caseBox(applyOv(p, `case_${p.part_key}`)); ext.push({ b, z: b.z + b.d / 2, faceFill: 'white' }) })
    rp.toekick_parts.filter(p => p.part_key.startsWith('kick')).forEach(p => { const b = tkBox3(applyOv(p, `tk_${p.part_key}_${p.sort_order}`)); ext.push({ b, z: b.z + b.d / 2, faceFill: 'white' }) })
    rp.face_zones.filter(z => z.face_type !== 'open').forEach(z => { const b = zoneBox3(applyOv(z, `zone_${z.row_index}_${z.col_index}`)); ext.push({ b, z: b.z + b.d / 2, faceFill: FACE_FILL }) })
    ext.sort((a, b) => a.z - b.z)
    ext.forEach((e, i) => {
      const fc = faces(e.b)
      els.push(<polygon key={`xt${i}`} points={fc.top} fill={PANEL_T} stroke={INK2} strokeWidth={PART} />)
      els.push(<polygon key={`xr${i}`} points={fc.right} fill={PANEL_R} stroke={INK2} strokeWidth={PART} />)
      els.push(<polygon key={`xf${i}`} points={fc.front} fill={e.faceFill} stroke={INK} strokeWidth={PART} />)
    })
    // Internals — dashed, drawn on top so they show through the opaque shell
    if (show.internals) {
      const intl: Box3[] = []
      rp.internal_parts.forEach(p => intl.push(intBox3(applyOv(p, `int_${p.part_type}_${p.sort_order}`))))
      ;(rp.drawer_stacks ?? []).forEach(stk => { stk.box_parts.forEach(p => intl.push(dbBox3(p))); stk.slides.forEach(sl => intl.push(slideBox3(sl))) })
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
  function cutRows(): Row[] {
    if (!rp) return []
    const map = new Map<string, Row>()
    const add = (desc: string, p: { DX: number; DY: number; DZ: number; material_id: string }) => {
      const mat = materialNames[p.material_id] ?? p.material_id ?? '—'
      const w = Math.round(p.DY), l = Math.round(p.DX), t = Math.round(p.DZ)
      const key = `${desc}|${w}|${l}|${t}|${mat}`
      const ex = map.get(key); if (ex) ex.qty++; else map.set(key, { desc, w, l, t, mat, qty: 1 })
    }
    rp.case_parts.forEach(p => add(CASE_LABELS[p.part_key] ?? p.part_key, p))
    rp.toekick_parts.filter(p => p.part_key.startsWith('kick')).forEach(p => add(TK_LABELS[p.part_key] ?? p.part_key, p))
    rp.internal_parts.forEach(p => add(INT_LABELS[p.part_type] ?? p.part_type, p))
    rp.face_zones.filter(z => z.face_type !== 'open').forEach(z => add(FACE_LABELS[z.face_type] ?? z.face_type, z))
    ;(rp.drawer_stacks ?? []).forEach(stk => stk.box_parts.forEach(p => add(INT_LABELS[p.part_type as string] ?? p.part_type, p)))
    return [...map.values()].sort((a, b) => a.desc.localeCompare(b.desc))
  }
  function cutList() {
    const rows = cutRows()
    const els: React.ReactNode[] = []
    const padc = 2.5
    const xQ = cutBox.x + cutBox.w - padc, xT = xQ - 11, xL = xT - 16, xW = xL - 16
    const xPart = cutBox.x + padc, xMat = cutBox.x + cutBox.w * 0.40
    const trunc = (str: string, n: number) => str.length > n ? str.slice(0, n - 1) + '…' : str
    els.push(<text key="ct" x={xPart} y={cutBox.y + 4} fontSize={3.2} fontWeight="bold" fill={INK} fontFamily={font}>CUT LIST</text>)
    const headY = cutBox.y + 9, fsH = 2.4
    const hdr = (k: string, x: number, t: string, a: 'start' | 'end') => <text key={k} x={x} y={headY} textAnchor={a} fontSize={fsH} fontWeight="bold" fill={INK2} fontFamily={font}>{t}</text>
    els.push(hdr('hp', xPart, 'Part', 'start'), hdr('hm', xMat, 'Material', 'start'), hdr('hw', xW, 'W', 'end'), hdr('hl', xL, 'L', 'end'), hdr('hk', xT, 'Thk', 'end'), hdr('hq', xQ, 'Qty', 'end'))
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
      els.push(<text key={`p${i}`} x={xPart} y={y} fontSize={fs} fill={INK} fontFamily={font}>{trunc(row.desc, 20)}</text>)
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
    const drawerZones = rp.face_zones.filter(z => z.face_type === 'drawer_face')
    const out: HwRow[] = []
    // Drawer runners — chosen from the slide schedule per drawer, aggregated by model
    if (drawerZones.length) {
      if (hardware && (hardware.slideProducts.length || hardware.slideEntries.length)) {
        const avail = dz - 40   // ≈ internal depth minus slide setback
        const byKey = new Map<string, { name: string; nl: number; qty: number }>()
        for (const z of drawerZones) {
          const slide = findSlide(avail, z.DY, hardware.slideProducts, hardware.slideEntries)   // DY = opening height
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
        out.push({ item: hardware?.hingeName ?? 'Door hinge', qty: hinges.length, note: doorNote })
        const plateQty = hinges.filter(h => h.hinge_plate_id).length
        if (plateQty) out.push({ item: 'Hinge plate', qty: plateQty, note: '' })
      } else {
        const hingeCount = (h: number) => h <= 900 ? 2 : h <= 1500 ? 3 : h <= 2000 ? 4 : 5
        const qty = doors.reduce((sum, d) => sum + hingeCount(d.DX), 0)
        out.push({ item: hardware?.hingeName ?? 'Door hinge', qty, note: doorNote })
      }
    }
    // Handles — model from handle schedule, one per door + drawer
    const handleQty = doors.length + drawerZones.length
    if (handleQty) out.push({ item: hardware?.handleName ?? 'Handle', qty: handleQty, note: '' })
    if (isBase && cab.toe_type === 'leg') out.push({ item: 'Adjustable leg', qty: 4, note: '' })
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
    // Joint overrides (seam label + assigned joint name / suppressed)
    const cj = (cab.carcase_joints ?? {}) as Record<string, string | null>
    if (Object.keys(cj).length) {
      const labelByKey: Record<string, string> = {}
      if (rp) for (const sm of computeElevSeams(rp)) labelByKey[sm.key] = sm.label
      for (const [key, val] of Object.entries(cj)) {
        const lbl = labelByKey[key] ?? key.replace(/[:_]/g, ' ')
        rows.push(`${lbl}: ${val === null ? 'Suppressed' : (jointNames?.[val] ?? 'Assigned')}`)
      }
    }
    // Custom parts
    for (const cp of customParts ?? []) rows.push(`+ ${cp.name ?? 'Custom part'} ${Math.round(Number(cp.dy))}×${Math.round(Number(cp.dx))}`)
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
        {Math.round(dx)} W × {Math.round(dy)} H × {Math.round(dz)} D
      </text>
      <text x={PW - M} y={M + 12} textAnchor="end" fontSize={3} fill={INK2}>{projectName}   ·   {dateStr}</text>
      <line x1={M} y1={M + headerH} x2={PW - M} y2={M + headerH} stroke={INK} strokeWidth={0.4} />

      {frame(frontBox)}{caption(frontBox, 'FRONT')}{front()}
      {frame(sideBox)}{caption(sideBox, 'SIDE')}{side()}
      {show.threeD && <>{frame(isoBox)}{caption(isoBox, '3D')}{iso()}</>}

      {cutList()}
      {hardwareTable()}
      {overrides()}
    </svg>
  )
}
