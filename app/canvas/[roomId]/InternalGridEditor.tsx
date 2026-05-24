'use client'

import { useState, useRef, useEffect } from 'react'
import type { CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet, AdjShelfInput, FixedShelfInput, InternalDividerInput, InternalGridInput } from '@/src/lib/resolver/types'
import { getUserPrefs } from '@/src/lib/userPrefs'

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

// ── Defaults ───────────────────────────────────────────────────────────────────

const DEFAULT_GRID: InternalGridInput = {
  adj_shelves:   [],
  fixed_shelves: [],
  dividers:      [],
}

// ── Display geometry ───────────────────────────────────────────────────────────
// Approximate — mirrors resolveInternal.ts math for instant feedback.
// Uses construction rule defaults; same simplification as FaceGridEditor.

const MAT_T   = 18   // carcass panel thickness
const SHELF_T = 18   // shelf material thickness
const ADJ_CL  = 1    // adj shelf pin clearance left
const ADJ_CR  = 1    // adj shelf pin clearance right
const DEF_TOE = 150  // default toe kick height

interface ShelfDisplay {
  idx:       number
  kind:      'adj' | 'fixed'
  yPos:      number   // cabinet Y of shelf bottom face
  xLeft:     number   // cabinet X of left edge
  width:     number
  thickness: number
}

interface DividerDisplay {
  idx:    number
  xPos:   number   // cabinet X of divider left face
  yBot:   number   // cabinet Y of divider bottom face
  height: number
}

interface OpeningCell {
  rowIdx: number
  colIdx: number
  x:      number   // cabinet X of left edge
  y:      number   // cabinet Y of bottom edge
  w:      number
  h:      number
}

function computeDisplay(
  grid: InternalGridInput,
  cabDX: number,
  cabDY: number,
  isBase: boolean,
  toeH: number,
): { shelves: ShelfDisplay[]; dividers: DividerDisplay[] } {
  const T  = MAT_T
  const TS = SHELF_T
  const TK = isBase ? toeH : 0

  const intX0 = T               // interior left X
  const intW  = cabDX - 2 * T  // interior width
  const intY0 = TK + T          // interior bottom Y
  const intH  = cabDY - TK - 2 * T  // interior height

  // ── Dividers (resolved first — equal opening formula) ─────────
  // openW = (intW - ND × T) / (ND + 1)  →  equal column widths
  const dividers: DividerDisplay[] = []
  const ND = grid.dividers.length
  if (ND > 0 && intW > 0) {
    const openW = (intW - ND * T) / (ND + 1)
    if (openW > 0) {
      // Sort by sort_order but preserve original array index for selection
      const withIdx = grid.dividers.map((d, i) => ({ d, i })).sort((a, b) => a.d.sort_order - b.d.sort_order)
      withIdx.forEach(({ d, i }, pos) => {
        const xPos = (d.x_locked && d.x_position !== undefined)
          ? intX0 + d.x_position
          : intX0 + (pos + 1) * openW + pos * T
        dividers.push({ idx: i, xPos, yBot: intY0, height: intH })
      })
      dividers.sort((a, b) => a.xPos - b.xPos)
    }
  }

  // ── Column boundaries (between sides / dividers) ───────────────
  const columns: { xLeft: number; xRight: number }[] = []
  {
    let cursor = intX0
    for (const dv of dividers) {
      if (dv.xPos > cursor + 1) columns.push({ xLeft: cursor, xRight: dv.xPos })
      cursor = dv.xPos + T
    }
    if (intX0 + intW > cursor + 1) columns.push({ xLeft: cursor, xRight: intX0 + intW })
    if (columns.length === 0) columns.push({ xLeft: intX0, xRight: intX0 + intW })
  }

  // ── Adj shelves (per column, equal-opening Y formula) ─────────
  // openH = (intH - N × TS) / (N + 1)  →  equal row heights
  const shelves: ShelfDisplay[] = []
  const N = grid.adj_shelves.length
  if (N > 0 && intH > 0) {
    const openH = (intH - N * TS) / (N + 1)
    if (openH > 0) {
      grid.adj_shelves.forEach((s, i) => {
        const yPos = (s.y_locked && s.y_position !== undefined)
          ? s.y_position
          : intY0 + (i + 1) * openH + i * TS
        for (const col of columns) {
          const width = col.xRight - col.xLeft - ADJ_CL - ADJ_CR
          if (width <= 0) continue
          shelves.push({ idx: i, kind: 'adj', yPos, xLeft: col.xLeft + ADJ_CL, width, thickness: TS })
        }
      })
    }
  }

  // ── Fixed shelves (per column, full column width) ──────────────
  grid.fixed_shelves.forEach((s, i) => {
    const yPos = (s.y_locked && s.y_position !== undefined)
      ? s.y_position
      : intY0 + (intH - TS) / 2
    for (const col of columns) {
      const width = col.xRight - col.xLeft
      if (width <= 0) continue
      shelves.push({ idx: i, kind: 'fixed', yPos, xLeft: col.xLeft, width, thickness: TS })
    }
  })

  shelves.sort((a, b) => a.yPos - b.yPos)

  return { shelves, dividers }
}

function computeOpenings(
  shelves: ShelfDisplay[],
  dividers: DividerDisplay[],
  intX0: number,
  intW: number,
  intY0: number,
  intH: number,
  matT: number,
): OpeningCell[] {
  // Row bands: vertical gaps between shelves
  const rowBands: { yBot: number; yTop: number }[] = []
  const sortedShelves = [...shelves].sort((a, b) => a.yPos - b.yPos)
  let curY = intY0
  for (const shelf of sortedShelves) {
    if (shelf.yPos > curY + 1) rowBands.push({ yBot: curY, yTop: shelf.yPos })
    curY = Math.max(curY, shelf.yPos + shelf.thickness)
  }
  if (intY0 + intH > curY + 1) rowBands.push({ yBot: curY, yTop: intY0 + intH })

  // Col bands: horizontal gaps between dividers
  const colBands: { xLeft: number; xRight: number }[] = []
  const sortedDivs = [...dividers].sort((a, b) => a.xPos - b.xPos)
  let curX = intX0
  for (const dv of sortedDivs) {
    if (dv.xPos > curX + 1) colBands.push({ xLeft: curX, xRight: dv.xPos })
    curX = Math.max(curX, dv.xPos + matT)
  }
  if (intX0 + intW > curX + 1) colBands.push({ xLeft: curX, xRight: intX0 + intW })

  const cells: OpeningCell[] = []
  rowBands.forEach((row, rowIdx) => {
    colBands.forEach((col, colIdx) => {
      cells.push({ rowIdx, colIdx, x: col.xLeft, y: row.yBot, w: col.xRight - col.xLeft, h: row.yTop - row.yBot })
    })
  })
  return cells
}

// ── Types ──────────────────────────────────────────────────────────────────────

type Selection =
  | { kind: 'adj';     idx: number }
  | { kind: 'fixed';   idx: number }
  | { kind: 'divider'; idx: number }
  | { kind: 'opening'; rowIdx: number; colIdx: number }

type ContextMenuState = {
  clientX: number
  clientY: number
  opening: OpeningCell
} | null

type PartMenuState = {
  clientX: number
  clientY: number
  kind: 'adj' | 'fixed' | 'divider'
  idx: number
} | null

// ── Component ──────────────────────────────────────────────────────────────────

export default function InternalGridEditor({
  cabinet,
  rp,
  onUpdate,
}: {
  cabinet: CabinetInstance
  rp?: ResolvedCabinet
  onUpdate: (id: string, u: Partial<CabinetInstance>) => Promise<void>
}) {
  const [grid, setGrid] = useState<InternalGridInput>(() =>
    (cabinet.internal_grid as InternalGridInput | null) ?? DEFAULT_GRID
  )
  const [selected, setSelected]       = useState<Selection | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [partMenu, setPartMenu]       = useState<PartMenuState>(null)

  // Close any open menu on Escape without letting the keydown bubble to the modal
  useEffect(() => {
    if (!contextMenu && !partMenu) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); setContextMenu(null); setPartMenu(null) }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [contextMenu, partMenu])

  const isBase = cabinet.assembly_class === 'base' || cabinet.assembly_class === 'base_corner'
  const isTall = cabinet.assembly_class === 'tall' || cabinet.assembly_class === 'tall_corner'
  const toeH = (isBase || isTall) && rp
    ? rp.toekick_parts.filter(p => p.part_key !== 'spreader_horizontal').reduce((max, p) => Math.max(max, p.DX), 0) || DEF_TOE
    : DEF_TOE

  const d = computeDisplay(grid, cabinet.dx, cabinet.dy, isBase, toeH)

  async function save(next: InternalGridInput) {
    setGrid(next)
    await onUpdate(cabinet.id, { internal_grid: next as unknown as Record<string, unknown> })
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  function addAdjShelf() {
    save({ ...grid, adj_shelves: [...grid.adj_shelves, { sort_order: grid.adj_shelves.length, y_locked: false }] })
  }

  function addFixedShelf() {
    save({ ...grid, fixed_shelves: [...grid.fixed_shelves, { sort_order: grid.fixed_shelves.length, y_locked: false }] })
  }

  function addDivider() {
    save({ ...grid, dividers: [...grid.dividers, { sort_order: grid.dividers.length, x_locked: false }] })
  }

  function addAdjShelfAt(op: OpeningCell) {
    const yPos = Math.round(op.y + op.h / 2 - SHELF_T / 2)
    save({ ...grid, adj_shelves: [...grid.adj_shelves, { sort_order: grid.adj_shelves.length, y_locked: true, y_position: yPos }] })
    setContextMenu(null)
  }

  function addFixedShelfAt(op: OpeningCell) {
    const yPos = Math.round(op.y + op.h / 2 - SHELF_T / 2)
    save({ ...grid, fixed_shelves: [...grid.fixed_shelves, { sort_order: grid.fixed_shelves.length, y_locked: true, y_position: yPos }] })
    setContextMenu(null)
  }

  function addDividerAt(op: OpeningCell) {
    const T = MAT_T
    const xPosition = Math.max(0, Math.round(op.x + op.w / 2 - T / 2 - T))
    save({ ...grid, dividers: [...grid.dividers, { sort_order: grid.dividers.length, x_locked: true, x_position: xPosition }] })
    setContextMenu(null)
  }

  function removeAdjShelf(idx: number) {
    if (selected?.kind === 'adj' && selected.idx === idx) setSelected(null)
    save({ ...grid, adj_shelves: grid.adj_shelves.filter((_, i) => i !== idx).map((s, i) => ({ ...s, sort_order: i })) })
  }

  function removeFixedShelf(idx: number) {
    if (selected?.kind === 'fixed' && selected.idx === idx) setSelected(null)
    save({ ...grid, fixed_shelves: grid.fixed_shelves.filter((_, i) => i !== idx).map((s, i) => ({ ...s, sort_order: i })) })
  }

  function removeDivider(idx: number) {
    if (selected?.kind === 'divider' && selected.idx === idx) setSelected(null)
    save({ ...grid, dividers: grid.dividers.filter((_, i) => i !== idx).map((dv, i) => ({ ...dv, sort_order: i })) })
  }

  function commitAdjY(idx: number, raw: string) {
    const v = parseFloat(raw)
    const locked = raw !== '' && !isNaN(v) && v > 0
    save({ ...grid, adj_shelves: grid.adj_shelves.map((s, i) => i !== idx ? s : { ...s, y_position: locked ? v : undefined, y_locked: locked }) })
  }

  function commitFixedY(idx: number, raw: string) {
    const v = parseFloat(raw)
    const locked = raw !== '' && !isNaN(v) && v > 0
    save({ ...grid, fixed_shelves: grid.fixed_shelves.map((s, i) => i !== idx ? s : { ...s, y_position: locked ? v : undefined, y_locked: locked }) })
  }

  function commitDivX(idx: number, raw: string) {
    const v = parseFloat(raw)
    const locked = raw !== '' && !isNaN(v) && v > 0
    save({ ...grid, dividers: grid.dividers.map((dv, i) => i !== idx ? dv : { ...dv, x_position: locked ? v : undefined, x_locked: locked }) })
  }

  function equaliseHeights() {
    save({ ...grid, adj_shelves: grid.adj_shelves.map(s => ({ ...s, y_locked: false, y_position: undefined })), fixed_shelves: grid.fixed_shelves.map(s => ({ ...s, y_locked: false, y_position: undefined })) })
  }

  function equaliseWidths() {
    save({ ...grid, dividers: grid.dividers.map(dv => ({ ...dv, x_locked: false, x_position: undefined })) })
  }

  function equaliseAll() {
    save({
      adj_shelves:   grid.adj_shelves.map(s => ({ ...s, y_locked: false, y_position: undefined })),
      fixed_shelves: grid.fixed_shelves.map(s => ({ ...s, y_locked: false, y_position: undefined })),
      dividers:      grid.dividers.map(dv => ({ ...dv, x_locked: false, x_position: undefined })),
    })
  }

  function replaceWith(kind: 'adj' | 'fixed' | 'divider', idx: number, newKind: 'adj' | 'fixed' | 'divider') {
    let adj   = [...grid.adj_shelves]
    let fixed = [...grid.fixed_shelves]
    let divs  = [...grid.dividers]
    let yPos: number | undefined, yLocked = false
    let xPos: number | undefined, xLocked = false

    if (kind === 'adj') {
      yPos = adj[idx]?.y_position; yLocked = adj[idx]?.y_locked ?? false
      adj = adj.filter((_, i) => i !== idx).map((s, i) => ({ ...s, sort_order: i }))
    } else if (kind === 'fixed') {
      yPos = fixed[idx]?.y_position; yLocked = fixed[idx]?.y_locked ?? false
      fixed = fixed.filter((_, i) => i !== idx).map((s, i) => ({ ...s, sort_order: i }))
    } else {
      xPos = divs[idx]?.x_position; xLocked = divs[idx]?.x_locked ?? false
      divs = divs.filter((_, i) => i !== idx).map((d, i) => ({ ...d, sort_order: i }))
    }

    if (newKind === 'adj')   adj   = [...adj,   { sort_order: adj.length,   y_locked: yLocked, y_position: yPos }]
    if (newKind === 'fixed') fixed = [...fixed,  { sort_order: fixed.length, y_locked: yLocked, y_position: yPos }]
    if (newKind === 'divider') divs = [...divs, { sort_order: divs.length,  x_locked: xLocked, x_position: xPos }]

    setSelected(null); setPartMenu(null)
    save({ adj_shelves: adj, fixed_shelves: fixed, dividers: divs })
  }

  const mixedShelves = grid.adj_shelves.length > 0 && grid.fixed_shelves.length > 0
  const errors   = rp?.errors   ?? []
  const warnings = rp?.warnings ?? []

  // ── SVG ────────────────────────────────────────────────────────────────────

  const cabDX = cabinet.dx
  const cabDY = cabinet.dy
  const T = MAT_T
  const PL = 12, PT = 28, PR = 50, PB = 12
  const vw = cabDX + PL + PR
  const vh = cabDY + PT + PB
  const ox = PL, oy = PT
  const { svgRef, viewBox } = useSvgZoom(vw, vh)

  function svgY(cabY: number) { return oy + (cabDY - cabY) }

  const intY0 = (isBase || isTall) ? toeH + T : T
  const intH  = cabDY - intY0 - T
  const intX0 = T
  const intW  = cabDX - 2 * T
  const tkH   = (isBase || isTall) ? toeH : 0

  const openingCells = computeOpenings(d.shelves, d.dividers, intX0, intW, intY0, intH, T)

  // Vertical opening bands for right-side dimension labels
  const allShelvesSorted = [...d.shelves].sort((a, b) => a.yPos - b.yPos)
  const dimOpenings: { yBot: number; yTop: number }[] = []
  {
    let cursor = intY0
    for (const shelf of allShelvesSorted) {
      if (shelf.yPos > cursor + 1) dimOpenings.push({ yBot: cursor, yTop: shelf.yPos })
      cursor = Math.max(cursor, shelf.yPos + shelf.thickness)
    }
    if (intY0 + intH > cursor + 1) dimOpenings.push({ yBot: cursor, yTop: intY0 + intH })
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  const inp    = 'bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-300 focus:outline-none focus:border-blue-500 w-full text-right'
  const addBtn = 'px-2 py-0.5 rounded text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors'

  const adjTopFirst = [...grid.adj_shelves.keys()].sort((a, b) => {
    const ya = d.shelves.find(s => s.kind === 'adj'   && s.idx === a)?.yPos ?? 0
    const yb = d.shelves.find(s => s.kind === 'adj'   && s.idx === b)?.yPos ?? 0
    return yb - ya
  })
  const fixedTopFirst = [...grid.fixed_shelves.keys()].sort((a, b) => {
    const ya = d.shelves.find(s => s.kind === 'fixed' && s.idx === a)?.yPos ?? 0
    const yb = d.shelves.find(s => s.kind === 'fixed' && s.idx === b)?.yPos ?? 0
    return yb - ya
  })

  const isEmpty = grid.adj_shelves.length === 0 && grid.fixed_shelves.length === 0 && grid.dividers.length === 0

  const selOpening = selected?.kind === 'opening'
    ? openingCells.find(c => c.rowIdx === selected.rowIdx && c.colIdx === selected.colIdx) ?? null
    : null

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-gray-950">

      {/* Toolbar */}
      <div className="flex-none flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 border-b border-gray-700 flex-wrap text-[11px]">
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Shelf:</span>
          <button className={addBtn} onClick={addAdjShelf}>+ Adjustable</button>
          <button className={addBtn} onClick={addFixedShelf}>+ Fixed</button>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Divider:</span>
          <button className={addBtn} onClick={addDivider}>+ Divider</button>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Equalise:</span>
          <button className={addBtn} onClick={equaliseHeights}>= Heights</button>
          <button className={addBtn} onClick={equaliseWidths}>= Widths</button>
          <button className={addBtn} onClick={equaliseAll}>= All</button>
        </div>
        {mixedShelves && (
          <span className="text-amber-400 text-[10px]">adj + fixed shelves mixed — resolver may warn</span>
        )}
        {errors.length > 0 && (
          <span className="ml-auto text-[10px] text-red-400">{errors.length} error{errors.length !== 1 ? 's' : ''}</span>
        )}
        {errors.length === 0 && warnings.length > 0 && (
          <span className="ml-auto text-[10px] text-amber-400">{warnings.length} warning{warnings.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* SVG preview */}
        <div
          className="flex-1 overflow-hidden relative"
          onClick={() => { setSelected(null); setContextMenu(null) }}
          onContextMenu={e => e.preventDefault()}
        >
          <svg ref={svgRef} viewBox={viewBox} width="100%" height="100%">

            {/* Width dimension */}
            <text x={ox + cabDX / 2} y={PT / 2}
              textAnchor="middle" dominantBaseline="central"
              fontSize={14} fill="#ffffff" fontFamily="system-ui,sans-serif"
            >{cabDX}mm</text>

            {/* Cabinet bg */}
            <rect x={ox} y={oy} width={cabDX} height={cabDY} fill="#0a111e" />

            {/* Toekick */}
            {tkH > 0 && (
              <rect x={ox} y={svgY(tkH)} width={cabDX} height={tkH}
                fill="#06090f" stroke="#1e293b" strokeWidth={0.5} />
            )}

            {/* Side panels */}
            <rect x={ox}             y={oy} width={T} height={cabDY} fill="#0f172a" stroke="#1e293b" strokeWidth={0.5} />
            <rect x={ox + cabDX - T} y={oy} width={T} height={cabDY} fill="#0f172a" stroke="#1e293b" strokeWidth={0.5} />

            {/* Top panel */}
            <rect x={ox + T} y={oy} width={cabDX - 2 * T} height={T}
              fill="#0f172a" stroke="#1e293b" strokeWidth={0.5} />

            {/* Bottom panel */}
            <rect x={ox + T} y={svgY(tkH + T)} width={cabDX - 2 * T} height={T}
              fill="#0f172a" stroke="#1e293b" strokeWidth={0.5} />

            {/* Opening cells — rendered first so shelves/dividers draw on top */}
            {openingCells.map(cell => {
              const isSel = selected?.kind === 'opening' && selected.rowIdx === cell.rowIdx && selected.colIdx === cell.colIdx
              return (
                <g key={`op-${cell.rowIdx}-${cell.colIdx}`}>
                  <rect
                    x={ox + cell.x} y={svgY(cell.y + cell.h)}
                    width={cell.w} height={cell.h}
                    fill={isSel ? 'rgba(59,130,246,0.07)' : 'transparent'}
                    stroke={isSel ? '#3b82f6' : 'none'}
                    strokeWidth={isSel ? 1 : 0}
                    style={{ cursor: 'crosshair' }}
                    onClick={e => { e.stopPropagation(); setSelected(isSel ? null : { kind: 'opening', rowIdx: cell.rowIdx, colIdx: cell.colIdx }) }}
                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ clientX: e.clientX, clientY: e.clientY, opening: cell }); setSelected({ kind: 'opening', rowIdx: cell.rowIdx, colIdx: cell.colIdx }) }}
                  />
                  {isSel && cell.w > 40 && cell.h > 20 && (
                    <text
                      x={ox + cell.x + cell.w / 2} y={svgY(cell.y + cell.h / 2)}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize={12} fill="#3b82f6" fontFamily="system-ui,sans-serif"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >{Math.round(cell.w)} × {Math.round(cell.h)}</text>
                  )}
                </g>
              )
            })}

            {/* Dividers — before shelves so shelves draw on top */}
            {d.dividers.map(dv => {
              const isSel = selected?.kind === 'divider' && selected.idx === dv.idx
              return (
                <g key={`dv-${dv.idx}`}
                  onClick={e => { e.stopPropagation(); setSelected(isSel ? null : { kind: 'divider', idx: dv.idx }) }}
                  onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setPartMenu({ clientX: e.clientX, clientY: e.clientY, kind: 'divider', idx: dv.idx }); setSelected({ kind: 'divider', idx: dv.idx }) }}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={ox + dv.xPos} y={svgY(dv.yBot + dv.height)}
                    width={T} height={Math.max(0, dv.height)}
                    fill={isSel ? '#1c1917' : '#111827'}
                    stroke={isSel ? '#a8a29e' : '#4b5563'}
                    strokeWidth={isSel ? 1.5 : 1}
                  />
                </g>
              )
            })}

            {/* Adj shelves */}
            {d.shelves.filter(s => s.kind === 'adj').map(s => {
              const isSel = selected?.kind === 'adj' && selected.idx === s.idx
              return (
                <g key={`adj-${s.idx}`}
                  onClick={e => { e.stopPropagation(); setSelected(isSel ? null : { kind: 'adj', idx: s.idx }) }}
                  onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setPartMenu({ clientX: e.clientX, clientY: e.clientY, kind: 'adj', idx: s.idx }); setSelected({ kind: 'adj', idx: s.idx }) }}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={ox + s.xLeft} y={svgY(s.yPos + s.thickness)}
                    width={s.width} height={s.thickness}
                    fill={isSel ? '#312e81' : '#1e1b4b'}
                    stroke={isSel ? '#818cf8' : '#4338ca'}
                    strokeWidth={isSel ? 1.5 : 1}
                  />
                  {s.width > 80 && s.thickness >= 10 && (
                    <text
                      x={ox + s.xLeft + s.width / 2} y={svgY(s.yPos + s.thickness / 2)}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize={Math.min(13, s.thickness * 0.72)} fill={isSel ? '#a5b4fc' : '#6366f1'}
                      fontFamily="system-ui,sans-serif"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >adj</text>
                  )}
                </g>
              )
            })}

            {/* Fixed shelves */}
            {d.shelves.filter(s => s.kind === 'fixed').map(s => {
              const isSel = selected?.kind === 'fixed' && selected.idx === s.idx
              return (
                <g key={`fix-${s.idx}`}
                  onClick={e => { e.stopPropagation(); setSelected(isSel ? null : { kind: 'fixed', idx: s.idx }) }}
                  onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setPartMenu({ clientX: e.clientX, clientY: e.clientY, kind: 'fixed', idx: s.idx }); setSelected({ kind: 'fixed', idx: s.idx }) }}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={ox + s.xLeft} y={svgY(s.yPos + s.thickness)}
                    width={s.width} height={s.thickness}
                    fill={isSel ? '#4a1d96' : '#2e1065'}
                    stroke={isSel ? '#c084fc' : '#7c3aed'}
                    strokeWidth={isSel ? 1.5 : 1}
                  />
                  {s.width > 80 && s.thickness >= 10 && (
                    <text
                      x={ox + s.xLeft + s.width / 2} y={svgY(s.yPos + s.thickness / 2)}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize={Math.min(13, s.thickness * 0.72)} fill={isSel ? '#e9d5ff' : '#a78bfa'}
                      fontFamily="system-ui,sans-serif"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >fixed</text>
                  )}
                </g>
              )
            })}

            {/* Per-section opening height labels (right side) */}
            {dimOpenings.map((op, i) => {
              const h = op.yTop - op.yBot
              if (h < 5) return null
              const midY   = svgY(op.yBot + h / 2)
              const labelX = ox + cabDX + 8
              return (
                <g key={`dim-${i}`} style={{ pointerEvents: 'none' }}>
                  <line x1={ox + cabDX + 4} y1={svgY(op.yBot)} x2={labelX + 28} y2={svgY(op.yBot)} stroke="#374151" strokeWidth={0.5} />
                  <line x1={ox + cabDX + 4} y1={svgY(op.yTop)} x2={labelX + 28} y2={svgY(op.yTop)} stroke="#374151" strokeWidth={0.5} />
                  <line x1={labelX + 28} y1={svgY(op.yBot)} x2={labelX + 28} y2={svgY(op.yTop)} stroke="#374151" strokeWidth={0.5} />
                  <text x={labelX} y={midY}
                    textAnchor="start" dominantBaseline="central"
                    fontSize={11} fill="#ffffff" fontFamily="system-ui,sans-serif"
                  >{Math.round(h)}</text>
                </g>
              )
            })}

            {/* Cabinet outline */}
            <rect x={ox} y={oy} width={cabDX} height={cabDY}
              fill="none" stroke="#6b7280" strokeWidth={1.5} />

          </svg>
        </div>

        {/* Controls panel */}
        <div className="flex-none w-48 border-l border-gray-800 overflow-y-auto p-3 flex flex-col gap-4 text-[10px]">

          {isEmpty && (
            <div className="text-gray-600 text-center py-6 space-y-1">
              <p className="text-gray-500">No internal parts</p>
              <p>Use the buttons above to add shelves or dividers.</p>
            </div>
          )}

          {/* Selected opening */}
          {selOpening && (
            <div>
              <p className="uppercase tracking-wider text-blue-400 mb-2">Opening</p>
              <p className="text-gray-500 mb-2">{Math.round(selOpening.w)} × {Math.round(selOpening.h)} mm</p>
              <div className="flex flex-col gap-1">
                <button className={addBtn + ' text-left'} onClick={() => addAdjShelfAt(selOpening)}>+ Adj shelf here</button>
                <button className={addBtn + ' text-left'} onClick={() => addFixedShelfAt(selOpening)}>+ Fixed shelf here</button>
                <button className={addBtn + ' text-left'} onClick={() => addDividerAt(selOpening)}>+ Divider here</button>
              </div>
            </div>
          )}

          {/* Adj shelves */}
          {grid.adj_shelves.length > 0 && (
            <div>
              <p className="uppercase tracking-wider text-indigo-400 mb-2">Adj Shelves</p>
              <div className="flex flex-col gap-1.5">
                {adjTopFirst.map(i => {
                  const s      = grid.adj_shelves[i]
                  const disp   = d.shelves.find(sd => sd.kind === 'adj' && sd.idx === i)
                  const approx = Math.round(disp?.yPos ?? 0)
                  const isSel  = selected?.kind === 'adj' && selected.idx === i
                  return (
                    <div
                      key={`adj-${i}-${s.y_locked}-${s.y_position ?? 'a'}`}
                      className={`flex items-center gap-1 rounded px-1 py-0.5 -mx-1 transition-colors ${isSel ? 'bg-indigo-950/60' : ''}`}
                      onClick={() => setSelected(isSel ? null : { kind: 'adj', idx: i })}
                    >
                      <span className="text-indigo-600 shrink-0 w-4 text-center font-mono">{adjTopFirst.length - adjTopFirst.indexOf(i)}</span>
                      <input
                        type="number"
                        defaultValue={s.y_locked && s.y_position != null ? s.y_position : ''}
                        placeholder={`≈${approx}`}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        onBlur={e => commitAdjY(i, e.target.value.trim())}
                        onClick={e => e.stopPropagation()}
                        className={inp}
                      />
                      <button onClick={e => { e.stopPropagation(); removeAdjShelf(i) }}
                        className="text-gray-600 hover:text-red-400 shrink-0 transition-colors" title="Remove">×</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Fixed shelves */}
          {grid.fixed_shelves.length > 0 && (
            <div>
              <p className="uppercase tracking-wider text-violet-400 mb-2">Fixed Shelves</p>
              <div className="flex flex-col gap-1.5">
                {fixedTopFirst.map(i => {
                  const s      = grid.fixed_shelves[i]
                  const disp   = d.shelves.find(sd => sd.kind === 'fixed' && sd.idx === i)
                  const approx = Math.round(disp?.yPos ?? 0)
                  const isSel  = selected?.kind === 'fixed' && selected.idx === i
                  return (
                    <div
                      key={`fix-${i}-${s.y_locked}-${s.y_position ?? 'a'}`}
                      className={`flex items-center gap-1 rounded px-1 py-0.5 -mx-1 transition-colors ${isSel ? 'bg-violet-950/60' : ''}`}
                      onClick={() => setSelected(isSel ? null : { kind: 'fixed', idx: i })}
                    >
                      <span className="text-violet-600 shrink-0 w-4 text-center font-mono">{fixedTopFirst.length - fixedTopFirst.indexOf(i)}</span>
                      <input
                        type="number"
                        defaultValue={s.y_locked && s.y_position != null ? s.y_position : ''}
                        placeholder={`≈${approx}`}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        onBlur={e => commitFixedY(i, e.target.value.trim())}
                        onClick={e => e.stopPropagation()}
                        className={inp}
                      />
                      <button onClick={e => { e.stopPropagation(); removeFixedShelf(i) }}
                        className="text-gray-600 hover:text-red-400 shrink-0 transition-colors" title="Remove">×</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Dividers */}
          {grid.dividers.length > 0 && (
            <div>
              <p className="uppercase tracking-wider text-gray-400 mb-2">Dividers</p>
              <div className="flex flex-col gap-1.5">
                {[...grid.dividers.keys()].map(i => {
                  const dv     = grid.dividers[i]
                  const disp   = d.dividers.find(dd => dd.idx === i)
                  const approx = Math.round((disp?.xPos ?? MAT_T) - MAT_T)
                  const isSel  = selected?.kind === 'divider' && selected.idx === i
                  return (
                    <div
                      key={`div-${i}-${dv.x_locked}-${dv.x_position ?? 'a'}`}
                      className={`flex items-center gap-1 rounded px-1 py-0.5 -mx-1 transition-colors ${isSel ? 'bg-gray-800/60' : ''}`}
                      onClick={() => setSelected(isSel ? null : { kind: 'divider', idx: i })}
                    >
                      <span className="text-gray-600 shrink-0 w-4 text-center font-mono">{i + 1}</span>
                      <input
                        type="number"
                        defaultValue={dv.x_locked && dv.x_position != null ? dv.x_position : ''}
                        placeholder={`≈${approx}`}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        onBlur={e => commitDivX(i, e.target.value.trim())}
                        onClick={e => e.stopPropagation()}
                        className={inp}
                      />
                      <button onClick={e => { e.stopPropagation(); removeDivider(i) }}
                        className="text-gray-600 hover:text-red-400 shrink-0 transition-colors" title="Remove">×</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {!isEmpty && (
            <p className="text-gray-600">Enter mm to lock position · clear to auto-equalise</p>
          )}

          {/* Legend */}
          {!isEmpty && (
            <div>
              <p className="uppercase tracking-wider text-gray-600 mb-1.5">Legend</p>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: '#1e1b4b', border: '1px solid #4338ca' }} />
                  <span className="text-gray-500">Adj shelf</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: '#2e1065', border: '1px solid #7c3aed' }} />
                  <span className="text-gray-500">Fixed shelf</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: '#111827', border: '1px solid #4b5563' }} />
                  <span className="text-gray-500">Divider</span>
                </div>
              </div>
            </div>
          )}

          {/* Interior dims */}
          <div className="text-gray-700 space-y-0.5 mt-auto pt-2 border-t border-gray-800">
            <p>W {Math.round(cabinet.dx - 2 * MAT_T)}mm (approx)</p>
            <p>H {Math.round(cabinet.dy - ((isBase || isTall) ? toeH : 0) - 2 * MAT_T)}mm</p>
            <p className="text-[9px] text-gray-800">Y positions from cabinet bottom</p>
          </div>

        </div>
      </div>

      {/* Part right-click menu */}
      {partMenu && (
        <>
          <div
            className="fixed inset-0 z-[100]"
            onClick={() => setPartMenu(null)}
            onContextMenu={e => { e.preventDefault(); setPartMenu(null) }}
          />
          <div
            className="fixed z-[101] bg-gray-800 border border-gray-700 rounded shadow-xl py-1 min-w-[160px] text-[11px]"
            style={{ left: partMenu.clientX, top: partMenu.clientY }}
            onClick={e => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-red-900/40 text-red-400 transition-colors"
              onClick={() => {
                if (partMenu.kind === 'adj')     removeAdjShelf(partMenu.idx)
                else if (partMenu.kind === 'fixed') removeFixedShelf(partMenu.idx)
                else                               removeDivider(partMenu.idx)
                setPartMenu(null)
              }}
            >Delete</button>
            <div className="border-t border-gray-700 mt-1 pt-1">
              <div className="px-3 py-0.5 text-gray-500">Replace with</div>
              {partMenu.kind !== 'adj' && (
                <button className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-300 transition-colors"
                  onClick={() => replaceWith(partMenu.kind, partMenu.idx, 'adj')}>Adj Shelf</button>
              )}
              {partMenu.kind !== 'fixed' && (
                <button className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-300 transition-colors"
                  onClick={() => replaceWith(partMenu.kind, partMenu.idx, 'fixed')}>Fixed Shelf</button>
              )}
              {partMenu.kind !== 'divider' && (
                <button className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-300 transition-colors"
                  onClick={() => replaceWith(partMenu.kind, partMenu.idx, 'divider')}>Divider</button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Opening context menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-[100]"
            onClick={() => setContextMenu(null)}
            onContextMenu={e => { e.preventDefault(); setContextMenu(null) }}
          />
          <div
            className="fixed z-[101] bg-gray-800 border border-gray-700 rounded shadow-xl py-1 min-w-[180px] text-[11px]"
            style={{ left: contextMenu.clientX, top: contextMenu.clientY }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-3 py-1 text-gray-500 border-b border-gray-700 mb-1">
              {Math.round(contextMenu.opening.w)} × {Math.round(contextMenu.opening.h)} mm
            </div>
            <button className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-300 transition-colors"
              onClick={() => addAdjShelfAt(contextMenu.opening)}>+ Adj shelf here</button>
            <button className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-300 transition-colors"
              onClick={() => addFixedShelfAt(contextMenu.opening)}>+ Fixed shelf here</button>
            <button className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-300 transition-colors"
              onClick={() => addDividerAt(contextMenu.opening)}>+ Divider here</button>
            <div className="border-t border-gray-700 mt-1 pt-1">
              <button className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-400 transition-colors"
                onClick={() => { equaliseHeights(); setContextMenu(null) }}
              >= Equalise heights</button>
              <button className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-400 transition-colors"
                onClick={() => { equaliseWidths(); setContextMenu(null) }}
              >= Equalise widths</button>
            </div>
          </div>
        </>
      )}

    </div>
  )
}
