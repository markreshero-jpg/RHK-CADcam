'use client'

import { useState } from 'react'
import type { CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import type { FaceGridInput, FaceZoneInput } from '@/src/lib/resolver/types'

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
  isBase: boolean,
): GridDisplay {
  const TOEH = 150, REVT = 4, REVB = 0, REVL = 1, REVR = 1, GAPR = 2, GAPC = 2

  const faceW = cabDX - REVL - REVR
  const faceH = cabDY - (isBase ? TOEH : 0) - REVT - REVB
  const faceX0 = REVL
  const faceY0 = (isBase ? TOEH : 0) + REVB

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

// ── Component ──────────────────────────────────────────────────────────────────

export default function FaceGridEditor({
  cabinet,
  rp,
  onUpdate,
}: {
  cabinet: CabinetInstance
  rp?: ResolvedCabinet
  onUpdate: (id: string, u: Partial<CabinetInstance>) => Promise<void>
}) {
  const [grid, setGrid] = useState<FaceGridInput>(() =>
    (cabinet.face_grid as FaceGridInput | null) ?? DEFAULT_GRID
  )

  const isBase = cabinet.assembly_class === 'base' || cabinet.assembly_class === 'base_corner'
  const d = computeDisplay(grid, cabinet.dx, cabinet.dy, isBase)

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

  function toggleHinge(rowIdx: number, colIdx: number) {
    save({
      ...grid,
      zones: grid.zones.map(z =>
        z.row_index === rowIdx && z.col_index === colIdx
          ? { ...z, hinge_side: z.hinge_side === 'left' ? 'right' : 'left' }
          : z
      ),
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
        <span className="text-gray-600 text-[10px] hidden sm:inline">click zone to cycle type · click hinge bar to flip side</span>
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
        <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
          <svg
            viewBox={`0 0 ${vw} ${vh}`}
            style={{ maxWidth: '100%', maxHeight: '100%' }}
          >
            {/* Width dim above */}
            <text x={ox + cabDX / 2} y={PT / 2}
              textAnchor="middle" dominantBaseline="central"
              fontSize={14} fill="#6b7280" fontFamily="system-ui,sans-serif"
            >{cabDX}mm</text>

            {/* Cabinet bg */}
            <rect x={ox} y={oy} width={cabDX} height={cabDY} fill="#0a111e" />

            {/* Toekick shading */}
            {isBase && (
              <rect x={ox} y={svgY(0) - 150} width={cabDX} height={150}
                fill="#06090f" stroke="#1e293b" strokeWidth={0.5} />
            )}

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
              const hingeX  = gz.hinge_side === 'left' ? zx : zx + colW
              const labelFs = Math.max(8, Math.min(20, rowH * 0.14, colW * 0.12))

              // Flip arrow on opposite side from hinge
              const arrowX  = gz.hinge_side === 'left' ? zx + colW - 4 : zx + 4
              const arrowAnchor = gz.hinge_side === 'left' ? 'end' : 'start'

              return (
                <g
                  key={`${gz.row_index}-${gz.col_index}`}
                  onClick={() => cycleZone(gz.row_index, gz.col_index)}
                  style={{ cursor: 'pointer' }}
                >
                  <rect x={zx} y={zy} width={colW} height={rowH}
                    fill={s.fill} stroke={s.stroke} strokeWidth={1} />

                  <text
                    x={zx + colW / 2} y={zy + rowH / 2}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={labelFs} fill={s.stroke}
                    fontFamily="system-ui,sans-serif"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >{s.label}</text>

                  {/* Hinge bar — click to flip */}
                  {gz.face_type === 'door' && (
                    <line
                      x1={hingeX} y1={zy} x2={hingeX} y2={zy + rowH}
                      stroke={s.stroke} strokeWidth={3} strokeOpacity={0.7}
                      style={{ cursor: 'pointer' }}
                      onClick={e => { e.stopPropagation(); toggleHinge(gz.row_index, gz.col_index) }}
                    />
                  )}

                  {/* Flip arrow hint */}
                  {gz.face_type === 'door' && rowH > 50 && colW > 60 && (
                    <text
                      x={arrowX} y={zy + 13}
                      textAnchor={arrowAnchor} dominantBaseline="central"
                      fontSize={Math.min(11, rowH * 0.09)} fill={s.stroke} fillOpacity={0.45}
                      fontFamily="system-ui,sans-serif"
                      style={{ cursor: 'pointer', userSelect: 'none', pointerEvents: 'auto' }}
                      onClick={e => { e.stopPropagation(); toggleHinge(gz.row_index, gz.col_index) }}
                    >{gz.hinge_side === 'left' ? '→' : '←'}</text>
                  )}
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
