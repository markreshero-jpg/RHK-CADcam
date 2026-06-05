'use client'

import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import type { FaceGridInput, FaceZoneInput, DrawerType } from '@/src/lib/resolver/types'
import { getUserPrefs } from '@/src/lib/userPrefs'
import { intElevRect, dbElevRect, slideElevRect } from './cabinetEditSvgHelpers'

type DoorStyleOpt = { id: string; name: string }

function useSvgZoom(initW: number, initH: number) {
  const initRef = useRef({ w: initW, h: initH })
  const vbRef   = useRef({ x: 0, y: 0, w: initW, h: initH })
  const [vb, setVb] = useState({ x: 0, y: 0, w: initW, h: initH })
  const svgRef  = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const { x, y, w, h } = vbRef.current
      const delta = getUserPrefs().invertScroll ? -e.deltaY : e.deltaY
      const factor = delta > 0 ? 1.15 : 1 / 1.15
      const vx = x + (cx / rect.width) * w
      const vy = y + (cy / rect.height) * h
      const newW = Math.max(initRef.current.w / 20, Math.min(initRef.current.w * 4, w * factor))
      const newH = h * (newW / w)
      const next = { x: vx - (cx / rect.width) * newW, y: vy - (cy / rect.height) * newH, w: newW, h: newH }
      vbRef.current = next
      setVb({ ...next })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return { svgRef, viewBox: `${vb.x} ${vb.y} ${vb.w} ${vb.h}` }
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_GRID: FaceGridInput = {
  rows:  [{ row_index: 0, height_locked: false }],
  cols:  [{ col_index: 0, width_locked: false }, { col_index: 1, width_locked: false }],
  zones: [
    { row_index: 0, col_index: 0, face_type: 'door', hinge_side: 'left' },
    { row_index: 0, col_index: 1, face_type: 'door', hinge_side: 'right' },
  ],
}

const CYCLE_TYPES: FaceZoneInput['face_type'][] = ['door', 'drawer_face', 'false_panel', 'open']

const ZONE_STYLE: Record<string, { fill: string; stroke: string; label: string }> = {
  door:        { fill: '#1e3a5f', stroke: '#3b82f6', label: 'Door' },
  drawer_face: { fill: '#3b1f5f', stroke: '#8b5cf6', label: 'Drawer' },
  false_panel: { fill: '#1f2937', stroke: '#6b7280', label: 'False' },
  open:        { fill: '#0c1220', stroke: '#334155', label: 'Open' },
}

// ── Display geometry ──────────────────────────────────────────────────────────
// Uses default rule constants for the approximation preview.
// The resolver uses the actual merged rules — this is close enough for editing.

interface GridDisplay {
  rowHeights:  number[]
  colWidths:   number[]
  rowYOffsets: number[]  // cabinet Y of each row's bottom edge (row 0 = bottom)
  colXOffsets: number[]  // cabinet X of each col's left edge
}

function computeDisplay(
  grid: FaceGridInput,
  cabDX: number,
  cabDY: number,
  hasToeKick: boolean,
  toeKickH = 150,
): GridDisplay {
  const REVT = 4, REVB = 0, REVL = 1, REVR = 1, GAPR = 2, GAPC = 2

  const faceW = cabDX - REVL - REVR
  const faceH = cabDY - (hasToeKick ? toeKickH : 0) - REVT - REVB
  const faceX0 = REVL
  const faceY0 = (hasToeKick ? toeKickH : 0) + REVB

  const nRows = grid.rows.length
  const nCols = grid.cols.length

  // Row heights — equalise unlocked rows
  const lockedH  = grid.rows.reduce((s, r) => s + (r.height_locked && r.height != null ? r.height : 0), 0)
  const unlockR  = grid.rows.filter(r => !r.height_locked || r.height == null).length
  const equalH   = unlockR > 0 ? (faceH - (nRows - 1) * GAPR - lockedH) / unlockR : 0
  const rowHeights = grid.rows.map(r =>
    r.height_locked && r.height != null ? r.height : Math.max(0, equalH))

  // Col widths — equalise unlocked cols
  const lockedW  = grid.cols.reduce((s, c) => s + (c.width_locked && c.width != null ? c.width : 0), 0)
  const unlockC  = grid.cols.filter(c => !c.width_locked || c.width == null).length
  const equalW   = unlockC > 0 ? (faceW - (nCols - 1) * (GAPC / 2) - lockedW) / unlockC : 0
  const colWidths = grid.cols.map(c =>
    c.width_locked && c.width != null ? c.width : Math.max(0, equalW))

  // Row Y offsets — row 0 is at the bottom of the face opening
  const rowYOffsets: number[] = []
  let y = faceY0
  for (let i = 0; i < nRows; i++) { rowYOffsets.push(y); y += rowHeights[i] + GAPR }

  // Col X offsets — col 0 is at the left
  const colXOffsets: number[] = []
  let x = faceX0
  for (let i = 0; i < nCols; i++) { colXOffsets.push(x); x += colWidths[i] + GAPC / 2 }

  return { rowHeights, colWidths, rowYOffsets, colXOffsets }
}

// Approximate auto hinge layout for the preview — mirrors the resolver's
// DEFAULT_RULES (resolveHinges.ts) so the face grid can show hinge positions even
// when no hinge hardware is configured yet (the resolver emits none without it).
// Returns mm from the door bottom, far→near (top-first).
function defaultHingeYs(doorH: number): number[] {
  const count = doorH <= 900 ? 2 : doorH <= 1800 ? 3 : doorH <= 2400 ? 4 : 5
  const inset = 100
  const far = doorH - inset, near = inset
  if (count <= 1) return [near].map(Math.round)
  if (count === 2) return [far, near].map(Math.round)
  if (count === 3) return [far, doorH / 2, near].map(Math.round)
  const out = [far]
  const step = (near - far) / (count - 1)
  for (let i = 1; i < count - 1; i++) out.push(far + step * i)
  out.push(near)
  return out.map(Math.round)
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function FaceGridEditor({
  cabinet,
  rp,
  showInternals,
  onUpdate,
}: {
  cabinet: CabinetInstance
  rp?: ResolvedCabinet
  showInternals?: boolean
  onUpdate: (id: string, u: Partial<CabinetInstance>) => Promise<void>
}) {
  const [grid, setGrid] = useState<FaceGridInput>(() =>
    (cabinet.face_grid as FaceGridInput | null) ?? DEFAULT_GRID
  )
  const [selectedZone, setSelectedZone] = useState<{ row: number; col: number } | null>(null)
  const [doorStyles, setDoorStyles] = useState<DoorStyleOpt[]>([])
  const [showChevrons, setShowChevrons] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase.from('door_styles').select('id, name').eq('is_active', true).order('sort_order').order('name')
      .then(({ data }) => { if (!cancelled) setDoorStyles((data ?? []) as DoorStyleOpt[]) })
    return () => { cancelled = true }
  }, [])

  const isBase = cabinet.assembly_class === 'base' || cabinet.assembly_class === 'base_corner'
  const isTall = cabinet.assembly_class === 'tall' || cabinet.assembly_class === 'tall_corner'
  const tkHeight = (isBase || isTall) && rp
    ? rp.toekick_parts.filter(p => p.part_key !== 'spreader_horizontal').reduce((max, p) => Math.max(max, p.DX), 0) || 150
    : 150
  // Both base and tall cabinets carry a toe kick — the face opening starts above
  // it, matching the resolved Elevation view. (Wall cabinets have no kick.)
  const hasToeKick = isBase || isTall
  const d = computeDisplay(grid, cabinet.dx, cabinet.dy, hasToeKick, tkHeight)

  async function save(next: FaceGridInput) {
    setGrid(next)
    await onUpdate(cabinet.id, { face_grid: next as unknown as Record<string, unknown> })
  }

  // ── Zone interactions ──────────────────────────────────────────────────────

  function cycleZone(rowIdx: number, colIdx: number) {
    const zone = grid.zones.find(z => z.row_index === rowIdx && z.col_index === colIdx)
    if (!zone) return
    const next = CYCLE_TYPES[(CYCLE_TYPES.indexOf(zone.face_type) + 1) % CYCLE_TYPES.length]
    save({
      ...grid,
      zones: grid.zones.map(z =>
        z.row_index === rowIdx && z.col_index === colIdx ? { ...z, face_type: next } : z
      ),
    })
  }

  function selectZone(rowIdx: number, colIdx: number) {
    setSelectedZone(prev =>
      prev?.row === rowIdx && prev?.col === colIdx ? null : { row: rowIdx, col: colIdx }
    )
  }

  const HINGE_ORDER: NonNullable<FaceZoneInput['hinge_side']>[] = ['left', 'right', 'top', 'bottom']

  // Click the hinge bar to cycle the hinged edge: left → right → top → bottom
  function cycleHinge(rowIdx: number, colIdx: number) {
    save({
      ...grid,
      zones: grid.zones.map(z =>
        z.row_index === rowIdx && z.col_index === colIdx
          ? { ...z, hinge_side: HINGE_ORDER[(HINGE_ORDER.indexOf(z.hinge_side ?? 'left') + 1) % HINGE_ORDER.length] }
          : z
      ),
    })
  }

  // Set the hinged edge directly (from the directional control in the side panel)
  function setHinge(rowIdx: number, colIdx: number, side: NonNullable<FaceZoneInput['hinge_side']>) {
    save({
      ...grid,
      zones: grid.zones.map(z =>
        z.row_index === rowIdx && z.col_index === colIdx ? { ...z, hinge_side: side } : z
      ),
    })
  }

  // ── Hinge positions (manual override stored in face_grid zone.hinges) ────────
  // mm from the door BOTTOM, along the hinged edge. Undefined = auto (shop rules);
  // a defined array (incl. empty) = manual.
  function zoneDoorHeight(gz: FaceZoneInput): number {
    const z = rp?.face_zones.find(z => z.row_index === gz.row_index && z.col_index === gz.col_index)
    return Math.round(z?.DX ?? d.rowHeights[gz.row_index] ?? 600)
  }
  function zoneHingeYs(gz: FaceZoneInput): number[] {
    if (Array.isArray(gz.hinges)) return [...gz.hinges].sort((a, b) => b - a)   // top-first (manual)
    const hs = (rp?.hinge_instances ?? []).filter(h => h.row_index === gz.row_index && h.col_index === gz.col_index)
    if (hs.length > 0) return hs.map(h => Math.round(h.y_position_mm)).sort((a, b) => b - a)
    // No resolved hinges (e.g. hinge hardware not configured) — show an approximate
    // auto layout so the face grid still previews hinge positions.
    return defaultHingeYs(zoneDoorHeight(gz)).sort((a, b) => b - a)
  }
  function setZoneHinges(rowIdx: number, colIdx: number, ys: number[] | null) {
    save({
      ...grid,
      zones: grid.zones.map(z => {
        if (z.row_index !== rowIdx || z.col_index !== colIdx) return z
        if (ys === null) { const next = { ...z }; delete next.hinges; return next }  // → auto
        return { ...z, hinges: [...ys].sort((a, b) => a - b) }
      }),
    })
  }
  function addHinge(gz: FaceZoneInput) {
    setZoneHinges(gz.row_index, gz.col_index, [...zoneHingeYs(gz), Math.round(zoneDoorHeight(gz) / 2)])
  }
  function moveHinge(gz: FaceZoneInput, idx: number, y: number) {
    const cur = zoneHingeYs(gz); cur[idx] = y
    setZoneHinges(gz.row_index, gz.col_index, cur)
  }
  function removeHinge(gz: FaceZoneInput, idx: number) {
    const cur = zoneHingeYs(gz); cur.splice(idx, 1)
    setZoneHinges(gz.row_index, gz.col_index, cur)  // empty array = zero hinges (still manual)
  }

  function setZoneDoorStyle(rowIdx: number, colIdx: number, styleId: string | null) {
    save({
      ...grid,
      zones: grid.zones.map(z =>
        z.row_index === rowIdx && z.col_index === colIdx ? { ...z, door_style_id: styleId } : z
      ),
    })
  }

  function setDrawerType(rowIdx: number, colIdx: number, type: DrawerType | null) {
    save({
      ...grid,
      zones: grid.zones.map(z => {
        if (z.row_index !== rowIdx || z.col_index !== colIdx) return z
        if (type === null) {
          const { drawer_type_config: _, ...rest } = z
          return rest
        }
        return { ...z, drawer_type_config: { ...z.drawer_type_config, type } }
      }),
    })
  }

  function setHeightAdjustment(rowIdx: number, colIdx: number, adj: number | null) {
    save({
      ...grid,
      zones: grid.zones.map(z => {
        if (z.row_index !== rowIdx || z.col_index !== colIdx) return z
        const cfg = z.drawer_type_config ?? { type: 'five_piece' as DrawerType }
        return { ...z, drawer_type_config: { ...cfg, height_adjustment: adj ?? undefined } }
      }),
    })
  }

  // ── Grid structure mutations ───────────────────────────────────────────────

  function defaultHinge(colIdx: number, nCols: number): 'left' | 'right' {
    return colIdx < Math.ceil(nCols / 2) ? 'left' : 'right'
  }

  function addRow(pos: 'top' | 'bottom') {
    if (pos === 'top') {
      const newIdx = grid.rows.length
      save({
        rows:  [...grid.rows, { row_index: newIdx, height_locked: false }],
        cols:  grid.cols,
        zones: [
          ...grid.zones,
          ...grid.cols.map(c => ({
            row_index: newIdx, col_index: c.col_index,
            face_type: 'door' as const,
            hinge_side: defaultHinge(c.col_index, grid.cols.length),
          })),
        ],
      })
    } else {
      save({
        rows:  [{ row_index: 0, height_locked: false }, ...grid.rows.map(r => ({ ...r, row_index: r.row_index + 1 }))],
        cols:  grid.cols,
        zones: [
          ...grid.zones.map(z => ({ ...z, row_index: z.row_index + 1 })),
          ...grid.cols.map(c => ({
            row_index: 0, col_index: c.col_index,
            face_type: 'door' as const,
            hinge_side: defaultHinge(c.col_index, grid.cols.length),
          })),
        ],
      })
    }
  }

  function removeRow(rowIdx: number) {
    if (grid.rows.length <= 1) return
    save({
      rows:  grid.rows
        .filter(r => r.row_index !== rowIdx)
        .map(r => r.row_index > rowIdx ? { ...r, row_index: r.row_index - 1 } : r),
      cols:  grid.cols,
      zones: grid.zones
        .filter(z => z.row_index !== rowIdx)
        .map(z => z.row_index > rowIdx ? { ...z, row_index: z.row_index - 1 } : z),
    })
  }

  function addCol(pos: 'left' | 'right') {
    if (pos === 'right') {
      const newIdx = grid.cols.length
      save({
        rows:  grid.rows,
        cols:  [...grid.cols, { col_index: newIdx, width_locked: false }],
        zones: [
          ...grid.zones,
          ...grid.rows.map(r => ({
            row_index: r.row_index, col_index: newIdx,
            face_type: 'door' as const, hinge_side: 'right' as const,
          })),
        ],
      })
    } else {
      save({
        rows:  grid.rows,
        cols:  [{ col_index: 0, width_locked: false }, ...grid.cols.map(c => ({ ...c, col_index: c.col_index + 1 }))],
        zones: [
          ...grid.zones.map(z => ({ ...z, col_index: z.col_index + 1 })),
          ...grid.rows.map(r => ({
            row_index: r.row_index, col_index: 0,
            face_type: 'door' as const, hinge_side: 'left' as const,
          })),
        ],
      })
    }
  }

  function removeCol(colIdx: number) {
    if (grid.cols.length <= 1) return
    save({
      rows:  grid.rows,
      cols:  grid.cols
        .filter(c => c.col_index !== colIdx)
        .map(c => c.col_index > colIdx ? { ...c, col_index: c.col_index - 1 } : c),
      zones: grid.zones
        .filter(z => z.col_index !== colIdx)
        .map(z => z.col_index > colIdx ? { ...z, col_index: z.col_index - 1 } : z),
    })
  }

  function commitRowHeight(rowIdx: number, raw: string) {
    const v = parseFloat(raw)
    const locked = raw !== '' && !isNaN(v) && v > 0
    save({
      ...grid,
      rows: grid.rows.map(r =>
        r.row_index === rowIdx
          ? { ...r, height: locked ? v : undefined, height_locked: locked }
          : r
      ),
    })
  }

  function commitColWidth(colIdx: number, raw: string) {
    const v = parseFloat(raw)
    const locked = raw !== '' && !isNaN(v) && v > 0
    save({
      ...grid,
      cols: grid.cols.map(c =>
        c.col_index === colIdx
          ? { ...c, width: locked ? v : undefined, width_locked: locked }
          : c
      ),
    })
  }

  // ── SVG ────────────────────────────────────────────────────────────────────

  const cabDX = cabinet.dx
  const cabDY = cabinet.dy
  const PL = 12, PT = 28, PR = 12, PB = 12
  const vw = cabDX + PL + PR
  const vh = cabDY + PT + PB
  const ox = PL, oy = PT
  const { svgRef, viewBox } = useSvgZoom(vw, vh)

  // Cabinet Y (bottom=0) → SVG Y (top=0)
  function svgY(cabY: number) { return oy + (cabDY - cabY) }

  const errors  = rp?.errors  ?? []
  const warnings = rp?.warnings ?? []

  const sortedRows = [...grid.rows].sort((a, b) => b.row_index - a.row_index) // visual top first
  const sortedCols = [...grid.cols].sort((a, b) => a.col_index - b.col_index)

  const inp = 'bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-300 focus:outline-none focus:border-blue-500 w-full text-right'
  const addBtn = 'px-2 py-0.5 rounded text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors'

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-gray-950">

      {/* Top bar: structural controls */}
      <div className="flex-none flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 border-b border-gray-700 flex-wrap text-[11px]">
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Row:</span>
          <button className={addBtn} onClick={() => addRow('top')}>+ Top</button>
          <button className={addBtn} onClick={() => addRow('bottom')}>+ Bottom</button>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Col:</span>
          <button className={addBtn} onClick={() => addCol('left')}>+ Left</button>
          <button className={addBtn} onClick={() => addCol('right')}>+ Right</button>
        </div>
        <span className="text-gray-600 hidden sm:inline">·</span>
        <button
          className={`${addBtn} ${showChevrons ? 'ring-1 ring-blue-500/60 text-blue-300' : ''}`}
          onClick={() => setShowChevrons(v => !v)}
          title="Show / hide door-swing chevrons"
        >Swings {showChevrons ? 'on' : 'off'}</button>
        <span className="text-gray-600 hidden sm:inline">·</span>
        <span className="text-gray-600 text-[10px] hidden sm:inline">click zone to select · double-click to cycle type · click hinge bar to cycle edge</span>
        {errors.length > 0 && (
          <span className="ml-auto text-[10px] text-red-400">{errors.length} error{errors.length !== 1 ? 's' : ''}</span>
        )}
        {errors.length === 0 && warnings.length > 0 && (
          <span className="ml-auto text-[10px] text-amber-400">{warnings.length} warning{warnings.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Main: SVG + controls panel */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* SVG */}
        <div className="flex-1 overflow-hidden relative">
          <svg
            ref={svgRef}
            viewBox={viewBox}
            width="100%" height="100%"
          >
            {/* Width dim above */}
            <text x={ox + cabDX / 2} y={PT / 2}
              textAnchor="middle" dominantBaseline="central"
              fontSize={14} fill="#ffffff" fontFamily="system-ui,sans-serif"
            >{cabDX}mm</text>

            {/* Cabinet bg */}
            <rect x={ox} y={oy} width={cabDX} height={cabDY} fill="#0a111e" />

            {/* Toekick shading */}
            {(isBase || isTall) && tkHeight > 0 && (
              <rect x={ox} y={svgY(tkHeight)} width={cabDX} height={tkHeight}
                fill="#06090f" stroke="#1e293b" strokeWidth={0.5} />
            )}

            {/* Internal parts — shelves, dividers, inner-drawer & pull-out panels.
                Uses the same elevation projection helper as the Elevation view, so
                each part_type projects correctly instead of all as flat shelves. */}
            {showInternals && rp && rp.internal_parts.map((p, i) => {
              const { ex, ey, ew, eh } = intElevRect(p)
              return (
                <rect key={`int-${i}`}
                  x={ox + ex} y={svgY(ey)} width={ew} height={eh}
                  fill="#1e1b4b" fillOpacity={0.8}
                  stroke="#4338ca" strokeWidth={0.5}
                  style={{ pointerEvents: 'none' }}
                />
              )
            })}

            {/* Drawer-box parts + their slides */}
            {showInternals && rp && rp.drawer_stacks.flatMap((stack, si) => [
              ...stack.box_parts.map((p, pi) => {
                const { ex, ey, ew, eh } = dbElevRect(p)
                return (
                  <rect key={`db-${si}-${pi}`}
                    x={ox + ex} y={svgY(ey)} width={ew} height={eh}
                    fill="#052e16" fillOpacity={0.75}
                    stroke="#22c55e" strokeWidth={0.5}
                    style={{ pointerEvents: 'none' }}
                  />
                )
              }),
              ...stack.slides.map((s, li) => {
                const { ex, ey, ew, eh } = slideElevRect(s)
                return (
                  <rect key={`sl-${si}-${li}`}
                    x={ox + ex} y={svgY(ey)} width={ew} height={eh}
                    fill="#1c1917" fillOpacity={0.75}
                    stroke="#d97706" strokeWidth={0.5}
                    strokeDasharray="3 2"
                    style={{ pointerEvents: 'none' }}
                  />
                )
              }),
            ])}

            {/* Inner-drawer / pull-out slides — these live on internal_slides and
                were previously not drawn, which is why inner drawers looked wrong. */}
            {showInternals && rp && (rp.internal_slides ?? []).map((s, li) => {
              const { ex, ey, ew, eh } = slideElevRect(s)
              return (
                <rect key={`isl-${li}`}
                  x={ox + ex} y={svgY(ey)} width={ew} height={eh}
                  fill="#1c1917" fillOpacity={0.75}
                  stroke="#d97706" strokeWidth={0.5}
                  strokeDasharray="3 2"
                  style={{ pointerEvents: 'none' }}
                />
              )
            })}

            {/* Face zones */}
            {grid.zones.map(gz => {
              const rowH = d.rowHeights[gz.row_index]
              const colW = d.colWidths[gz.col_index]
              const rowY = d.rowYOffsets[gz.row_index]
              const colX = d.colXOffsets[gz.col_index]
              if (!rowH || !colW) return null

              const zx = ox + colX
              const zy = svgY(rowY + rowH)
              const s  = ZONE_STYLE[gz.face_type]
              const hinge   = gz.hinge_side ?? 'left'
              const labelFs = Math.max(8, Math.min(20, rowH * 0.14, colW * 0.12))

              // Hinge bar sits on the hinged edge; chevron apex points to the opening edge
              const hingeBar =
                hinge === 'left'   ? { x1: zx,        y1: zy,        x2: zx,        y2: zy + rowH } :
                hinge === 'right'  ? { x1: zx + colW, y1: zy,        x2: zx + colW, y2: zy + rowH } :
                hinge === 'top'    ? { x1: zx,        y1: zy,        x2: zx + colW, y2: zy } :
                                     { x1: zx,        y1: zy + rowH, x2: zx + colW, y2: zy + rowH }
              const chevronPts =
                hinge === 'left'   ? `${zx},${zy} ${zx + colW},${zy + rowH / 2} ${zx},${zy + rowH}` :
                hinge === 'right'  ? `${zx + colW},${zy} ${zx},${zy + rowH / 2} ${zx + colW},${zy + rowH}` :
                hinge === 'top'    ? `${zx},${zy} ${zx + colW / 2},${zy + rowH} ${zx + colW},${zy}` :
                                     `${zx},${zy + rowH} ${zx + colW / 2},${zy} ${zx + colW},${zy + rowH}`

              const isSel = selectedZone?.row === gz.row_index && selectedZone?.col === gz.col_index

              return (
                <g
                  key={`${gz.row_index}-${gz.col_index}`}
                  onClick={() => selectZone(gz.row_index, gz.col_index)}
                  onDoubleClick={() => cycleZone(gz.row_index, gz.col_index)}
                  style={{ cursor: 'pointer' }}
                >
                  <rect x={zx} y={zy} width={colW} height={rowH}
                    fill={s.fill}
                    fillOpacity={showInternals ? 0.35 : 1}
                    stroke={isSel ? '#ffffff' : s.stroke}
                    strokeWidth={isSel ? 2 : 1} />

                  <text
                    x={zx + colW / 2} y={zy + rowH / 2}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={labelFs} fill={s.stroke}
                    fontFamily="system-ui,sans-serif"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >{s.label}</text>

                  {/* Door-swing chevron — dashed V; apex points to the opening edge
                      (matches the elevation canvas annotation) */}
                  {gz.face_type === 'door' && showChevrons && (
                    <polyline
                      points={chevronPts}
                      fill="none" stroke={s.stroke}
                      strokeWidth={1} strokeOpacity={0.7}
                      strokeDasharray="6 3"
                      strokeLinejoin="miter" strokeLinecap="butt"
                      style={{ pointerEvents: 'none' }}
                    />
                  )}

                  {/* Hinge bar — click to cycle the hinged edge (L→R→T→B) */}
                  {gz.face_type === 'door' && (
                    <line
                      x1={hingeBar.x1} y1={hingeBar.y1} x2={hingeBar.x2} y2={hingeBar.y2}
                      stroke={s.stroke} strokeWidth={3} strokeOpacity={0.7}
                      style={{ cursor: 'pointer' }}
                      onClick={e => { e.stopPropagation(); cycleHinge(gz.row_index, gz.col_index) }}
                    />
                  )}

                  {/* Hinge position ticks — a stub on the hinged edge per hinge */}
                  {gz.face_type === 'door' && (hinge === 'left' || hinge === 'right') &&
                    zoneHingeYs(gz).map((hy, hi) => {
                      const my = svgY(rowY + hy)
                      const ex = hinge === 'right' ? zx + colW : zx
                      const dir = hinge === 'right' ? -1 : 1
                      return <line key={`hm-${hi}`} x1={ex} y1={my} x2={ex + dir * 9} y2={my}
                        stroke="#a855f7" strokeWidth={2.5} style={{ pointerEvents: 'none' }} />
                    })}
                </g>
              )
            })}

            {/* Cabinet outline */}
            <rect x={ox} y={oy} width={cabDX} height={cabDY}
              fill="none" stroke="#6b7280" strokeWidth={1.5} />
          </svg>
        </div>

        {/* Controls panel */}
        <div className="flex-none w-44 border-l border-gray-800 overflow-y-auto p-3 flex flex-col gap-4 text-[10px]">

          {/* Rows */}
          <div>
            <p className="uppercase tracking-wider text-gray-500 mb-1.5">Rows</p>
            <div className="flex flex-col gap-1">
              {sortedRows.map(row => {
                const approx = Math.round(d.rowHeights[row.row_index] ?? 0)
                const rowLabel = `R${row.row_index}${row.row_index === grid.rows.length - 1 ? ' (top)' : row.row_index === 0 ? ' (bot)' : ''}`
                return (
                  <div key={`r-${row.row_index}-${row.height ?? 'a'}`} className="flex items-center gap-1">
                    <span className="text-gray-600 shrink-0 w-12">{rowLabel}</span>
                    <input
                      type="number"
                      defaultValue={row.height_locked && row.height != null ? row.height : ''}
                      placeholder={`≈${approx}`}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      onBlur={e => commitRowHeight(row.row_index, e.target.value.trim())}
                      className={inp}
                    />
                    <button
                      onClick={() => removeRow(row.row_index)}
                      disabled={grid.rows.length <= 1}
                      className="text-gray-600 hover:text-red-400 disabled:opacity-20 shrink-0"
                      title="Remove row"
                    >×</button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Cols */}
          <div>
            <p className="uppercase tracking-wider text-gray-500 mb-1.5">Cols</p>
            <div className="flex flex-col gap-1">
              {sortedCols.map(col => {
                const approx = Math.round(d.colWidths[col.col_index] ?? 0)
                return (
                  <div key={`c-${col.col_index}-${col.width ?? 'a'}`} className="flex items-center gap-1">
                    <span className="text-gray-600 shrink-0 w-12">C{col.col_index}</span>
                    <input
                      type="number"
                      defaultValue={col.width_locked && col.width != null ? col.width : ''}
                      placeholder={`≈${approx}`}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      onBlur={e => commitColWidth(col.col_index, e.target.value.trim())}
                      className={inp}
                    />
                    <button
                      onClick={() => removeCol(col.col_index)}
                      disabled={grid.cols.length <= 1}
                      className="text-gray-600 hover:text-red-400 disabled:opacity-20 shrink-0"
                      title="Remove column"
                    >×</button>
                  </div>
                )
              })}
            </div>
            <p className="text-gray-600 mt-1.5">Enter mm to lock, clear to auto-equalise.</p>
          </div>

          {/* Legend */}
          <div>
            <p className="uppercase tracking-wider text-gray-500 mb-1.5">Types</p>
            <div className="flex flex-col gap-1">
              {Object.entries(ZONE_STYLE).map(([type, s]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm shrink-0"
                    style={{ background: s.fill, border: `1px solid ${s.stroke}` }} />
                  <span className="text-gray-500">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Selected zone config */}
          {(() => {
            if (!selectedZone) return null
            const gz = grid.zones.find(z => z.row_index === selectedZone.row && z.col_index === selectedZone.col)
            if (!gz) return null
            const selBtnBase = 'flex-1 py-0.5 rounded text-[10px] transition-colors border'
            return (
              <div className="rounded bg-gray-800/60 border border-gray-700 p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-gray-400 font-medium">R{gz.row_index} C{gz.col_index}</p>
                  <button onClick={() => setSelectedZone(null)} className="text-gray-600 hover:text-white text-[11px] leading-none">✕</button>
                </div>

                {/* Cycle type button */}
                <div>
                  <p className="text-gray-600 mb-1">Type</p>
                  <button
                    onClick={() => cycleZone(gz.row_index, gz.col_index)}
                    className="w-full py-0.5 rounded text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors border border-gray-600"
                  >
                    {ZONE_STYLE[gz.face_type]?.label ?? gz.face_type} → cycle
                  </button>
                </div>

                {/* Hinge edge — only for door zones; buttons laid out as a cross
                    so each sits on the edge it represents */}
                {gz.face_type === 'door' && (
                  <div>
                    <p className="text-gray-600 mb-1">Hinge edge</p>
                    {(() => {
                      const cur = gz.hinge_side ?? 'left'
                      const cell = (side: NonNullable<FaceZoneInput['hinge_side']>, label: string, pos: string) => (
                        <button
                          onClick={() => setHinge(gz.row_index, gz.col_index, side)}
                          title={`Hinge ${side}`}
                          className={`${pos} w-7 h-6 rounded text-[12px] leading-none transition-colors border ${
                            cur === side
                              ? 'bg-blue-700 border-blue-500 text-white'
                              : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'
                          }`}
                        >{label}</button>
                      )
                      return (
                        <div className="grid grid-cols-3 grid-rows-3 gap-0.5 w-fit mx-auto">
                          {cell('top',    '↑', 'col-start-2 row-start-1')}
                          {cell('left',   '←', 'col-start-1 row-start-2')}
                          {cell('right',  '→', 'col-start-3 row-start-2')}
                          {cell('bottom', '↓', 'col-start-2 row-start-3')}
                        </div>
                      )
                    })()}
                  </div>
                )}

                {/* Hinges — manual positions per door (auto = shop rules) */}
                {gz.face_type === 'door' && (hinge => (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-gray-600">Hinges · {Array.isArray(gz.hinges) ? 'manual' : 'auto'}</p>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => addHinge(gz)} className="text-blue-400 hover:text-blue-300 text-[11px]">+ add</button>
                        {Array.isArray(gz.hinges) && (
                          <button onClick={() => setZoneHinges(gz.row_index, gz.col_index, null)} className="text-gray-500 hover:text-gray-300 text-[10px]">auto</button>
                        )}
                      </div>
                    </div>
                    {(hinge === 'left' || hinge === 'right') ? (
                      <div className="flex flex-col gap-1">
                        {zoneHingeYs(gz).map((y, i) => (
                          <div key={`hy-${i}-${y}`} className="flex items-center gap-1">
                            <span className="text-gray-600 shrink-0 w-3 text-[9px]">{i + 1}</span>
                            <input
                              type="number" step={5} defaultValue={y}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                              onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) moveHinge(gz, i, Math.round(v)) }}
                              className={inp}
                            />
                            <span className="text-gray-600 text-[9px] shrink-0">mm</span>
                            <button onClick={() => removeHinge(gz, i)} className="text-gray-600 hover:text-red-400 shrink-0" title="Remove hinge">×</button>
                          </div>
                        ))}
                        {zoneHingeYs(gz).length === 0 && <p className="text-gray-600 text-[10px] italic">No hinges</p>}
                        <p className="text-gray-600 mt-0.5 text-[9px]">mm from door bottom</p>
                      </div>
                    ) : (
                      <p className="text-gray-600 text-[10px] italic">Position editing is for left/right hinged doors.</p>
                    )}
                  </div>
                ))(gz.hinge_side ?? 'left')}

                {/* Door style — only for door zones */}
                {gz.face_type === 'door' && (
                  <div>
                    <p className="text-gray-600 mb-1">Door style</p>
                    <select
                      value={gz.door_style_id ?? ''}
                      onChange={e => setZoneDoorStyle(gz.row_index, gz.col_index, e.target.value || null)}
                      className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-300 focus:outline-none focus:border-blue-500 w-full"
                    >
                      <option value="">— inherit (room / job) —</option>
                      {doorStyles.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}

                {/* Drawer type selector — only for drawer_face zones */}
                {gz.face_type === 'drawer_face' && (
                  <div>
                    <p className="text-gray-600 mb-1">Drawer type</p>
                    <div className="flex gap-1">
                      {(['system', 'five_piece'] as DrawerType[]).map(dt => {
                        const active = (gz.drawer_type_config?.type ?? null) === dt
                        return (
                          <button
                            key={dt}
                            onClick={() => setDrawerType(gz.row_index, gz.col_index, active ? null : dt)}
                            className={`${selBtnBase} ${
                              active
                                ? 'bg-violet-700 border-violet-500 text-white'
                                : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'
                            }`}
                          >
                            {dt === 'system' ? 'System' : '5-Piece'}
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-gray-600 mt-1">
                      {gz.drawer_type_config?.type
                        ? `Zone: ${gz.drawer_type_config.type}`
                        : 'Using job default'}
                    </p>

                    {/* Height adjustment for five_piece */}
                    {gz.drawer_type_config?.type === 'five_piece' && (
                      <div className="mt-1.5">
                        <p className="text-gray-600 mb-0.5">Height adj (mm)</p>
                        <input
                          type="number"
                          defaultValue={gz.drawer_type_config?.height_adjustment ?? ''}
                          placeholder="25"
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                          onBlur={e => {
                            const v = parseFloat(e.target.value)
                            setHeightAdjustment(gz.row_index, gz.col_index, isNaN(v) ? null : v)
                          }}
                          className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-300 focus:outline-none focus:border-violet-500 w-full text-right"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Resolver errors */}
          {errors.length > 0 && (
            <div className="rounded bg-red-950/60 border border-red-800 p-2 space-y-0.5">
              {errors.map((e, i) => (
                <p key={i} className="text-red-300">{e.code}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
