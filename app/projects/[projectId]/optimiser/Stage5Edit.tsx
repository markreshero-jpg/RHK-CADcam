'use client'

// ============================================================
// Stage 5 — Manual editing canvas (spec §5.7).
// Interactive raw-SVG sheet: drag parts (snap to nearest valid,
// kerf/pad/margin/grain aware), select, cut/copy/paste, delete,
// move-to-sheet, unplaced pool, sheet navigator + management,
// live efficiency, full undo/redo. No react-konva, no localStorage.
// ============================================================

import { useEffect, useRef, useState } from 'react'
import { useOptiStore } from '@/src/lib/optimiser/store'
import { findNearestValid, findBestPlacement, usableBounds } from '@/src/lib/optimiser/edit'
import type { NestedSheet } from '@/src/lib/optimiser/nest'

const MAX_W = 860, MAX_H = 470

export default function Stage5Edit() {
  const nestResult = useOptiStore(s => s.nestResult)
  const currentSheet = useOptiStore(s => s.currentSheet)
  const selectedUid = useOptiStore(s => s.selectedUid)
  const clipboard = useOptiStore(s => s.clipboard)
  const editError = useOptiStore(s => s.editError)
  const setCurrentSheet = useOptiStore(s => s.setCurrentSheet)
  const selectPlacement = useOptiStore(s => s.selectPlacement)
  const setEditError = useOptiStore(s => s.setEditError)
  const movePartWithin = useOptiStore(s => s.movePartWithin)
  const removeToUnplaced = useOptiStore(s => s.removeToUnplaced)
  const placeFromUnplaced = useOptiStore(s => s.placeFromUnplaced)
  const relocatePart = useOptiStore(s => s.relocatePart)
  const rotatePart = useOptiStore(s => s.rotatePart)
  const copyToClipboard = useOptiStore(s => s.copyToClipboard)
  const cutToClipboard = useOptiStore(s => s.cutToClipboard)
  const pasteClipboard = useOptiStore(s => s.pasteClipboard)
  const deleteSheet = useOptiStore(s => s.deleteSheet)
  const addSheet = useOptiStore(s => s.addSheet)
  const resizeSheet = useOptiStore(s => s.resizeSheet)
  const undo = useOptiStore(s => s.undo)
  const redo = useOptiStore(s => s.redo)
  const snap = useOptiStore(s => s.snapshot)

  const [ctxMenu, setCtxMenu] = useState<{ uid: string; x: number; y: number } | null>(null)
  const [collapsedMat, setCollapsedMat] = useState<Record<string, boolean>>({})

  // Keyboard shortcuts (read live state via getState to avoid stale closures).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return
      const st = useOptiStore.getState()
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); st.undo() }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); st.redo() }
      else if (mod && e.key.toLowerCase() === 'c') { if (st.selectedUid) { e.preventDefault(); st.copyToClipboard(st.selectedUid) } }
      else if (mod && e.key.toLowerCase() === 'x') { if (st.selectedUid) { e.preventDefault(); st.cutToClipboard(st.selectedUid) } }
      else if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); st.pasteClipboard(st.currentSheet) }
      else if (e.key === 'Delete' || e.key === 'Backspace') { if (st.selectedUid) { e.preventDefault(); st.removeToUnplaced(st.selectedUid) } }
      else if (e.key === 'Escape') { st.selectPlacement(null); setCtxMenu(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!nestResult || nestResult.sheets.length === 0) {
    return <div className="h-full flex items-center justify-center text-xs text-ink-subtle">Run nesting in Stage 4 first, or add a blank sheet below.</div>
  }

  const sheet = nestResult.sheets.find(s => s.index === currentSheet) ?? nestResult.sheets[0]
  const unplaced = nestResult.unplaced

  // Details of the selected part for the inspector panel.
  const selectedInfo = (() => {
    if (!selectedUid) return null
    for (const s of nestResult.sheets) {
      const idx = s.placements.findIndex(pl => pl.uid === selectedUid)
      if (idx >= 0) {
        const pl = s.placements[idx]
        const part = snap?.parts.find(p => p.uid === pl.baseUid) ?? null
        return { pl, part, sheetIndex: s.index, num: idx + 1 }
      }
    }
    return null
  })()
  const matName = (id: string | null) => id ? (snap?.materials.find(m => m.id === id)?.name ?? '—') : '—'
  const matLabel = (s: NestedSheet) => `${s.materialId ? matName(s.materialId) : 'No material'} ${s.thickness}mm`

  // Sheets grouped by material+thickness for the left list.
  const sheetGroups = (() => {
    const m = new Map<string, { key: string; label: string; sheets: NestedSheet[] }>()
    for (const s of nestResult.sheets) {
      const key = `${s.materialId ?? 'none'}__${s.thickness}`
      const g = m.get(key) ?? { key, label: matLabel(s), sheets: [] }
      g.sheets.push(s); m.set(key, g)
    }
    return [...m.values()]
  })()

  return (
    <div className="h-full flex overflow-hidden" onClick={() => setCtxMenu(null)}>
      {/* Left: sheets summary grouped by material */}
      <div className="flex-none w-56 border-r border-edge flex flex-col overflow-hidden">
        <div className="flex-none px-3 py-2 border-b border-edge flex items-center justify-between">
          <span className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wider">Sheets ({nestResult.sheets.length})</span>
          <AddSheetButton onAdd={addSheet} />
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {sheetGroups.map(g => {
            const collapsed = collapsedMat[g.key]
            const avgEff = g.sheets.reduce((a, s) => a + s.efficiency, 0) / g.sheets.length
            const parts = g.sheets.reduce((a, s) => a + s.placements.length, 0)
            return (
              <div key={g.key} className="mb-0.5">
                <button onClick={() => setCollapsedMat(c => ({ ...c, [g.key]: !collapsed }))}
                  className="w-full px-3 py-1.5 hover:bg-surface-2 transition-colors">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-semibold text-ink truncate">{g.label}</span>
                    <span className="text-ink-subtle shrink-0 text-[11px]">{collapsed ? '▸' : '▾'}</span>
                  </div>
                  <div className="text-[10px] text-ink-subtle text-left font-mono">
                    {g.sheets.length} sheet{g.sheets.length === 1 ? '' : 's'} · {(avgEff * 100).toFixed(0)}% avg · {parts} parts
                  </div>
                </button>
                {!collapsed && g.sheets.map(s => (
                  <button key={s.index} onClick={() => setCurrentSheet(s.index)}
                    className={`w-full text-left pl-5 pr-3 py-1.5 flex items-center justify-between gap-2 text-[11px] transition-colors ${s.index === sheet.index ? 'bg-accent/15 text-accent-ink' : 'text-ink-muted hover:bg-surface-2'}`}>
                    <span className="truncate">Sheet {s.index + 1}{s.stock.isOffcut ? ' (offcut)' : ''}</span>
                    <span className="font-mono text-ink-subtle shrink-0">{(s.efficiency * 100).toFixed(0)}% · {s.placements.length}</span>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* Main canvas + unplaced pool */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex-none px-6 py-2 flex items-center gap-2 border-b border-edge text-xs">
          <button onClick={undo} className="px-2 py-1 rounded border border-edge-strong text-ink-muted hover:bg-surface-2 transition-colors">↶ Undo</button>
          <button onClick={redo} className="px-2 py-1 rounded border border-edge-strong text-ink-muted hover:bg-surface-2 transition-colors">↷ Redo</button>
          <span className="mx-1 text-ink-subtle">|</span>
          <button disabled={!selectedUid} onClick={() => selectedUid && copyToClipboard(selectedUid)} className="px-2 py-1 rounded border border-edge-strong text-ink-muted hover:bg-surface-2 disabled:opacity-40 transition-colors">Copy</button>
          <button disabled={!selectedUid} onClick={() => selectedUid && cutToClipboard(selectedUid)} className="px-2 py-1 rounded border border-edge-strong text-ink-muted hover:bg-surface-2 disabled:opacity-40 transition-colors">Cut</button>
          <button disabled={!clipboard.length} onClick={() => pasteClipboard(sheet.index)} className="px-2 py-1 rounded border border-edge-strong text-ink-muted hover:bg-surface-2 disabled:opacity-40 transition-colors">Paste{clipboard.length ? ` (${clipboard.length})` : ''}</button>
          <button disabled={!selectedUid} onClick={() => selectedUid && removeToUnplaced(selectedUid)} className="px-2 py-1 rounded border border-edge-strong text-ink-muted hover:bg-red-900/30 hover:text-red-300 disabled:opacity-40 transition-colors">Delete</button>
          <span className="ml-auto text-ink-subtle">Sheet {sheet.index + 1} · {(sheet.efficiency * 100).toFixed(1)}%{sheet.stock.isOffcut ? ' · offcut' : ''}</span>
        </div>

        {editError && (
          <div className="flex-none px-6 py-1.5 bg-amber-900/20 text-amber-400 text-[11px] flex items-center justify-between">
            <span>{editError}</span>
            <button onClick={() => setEditError(null)} className="hover:text-amber-200">✕</button>
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 overflow-auto grid place-items-center p-6 bg-canvas">
          <div className="flex flex-col items-center gap-2">
            <div className="text-lg font-semibold text-ink">
              Sheet {sheet.index + 1}
              <span className="text-ink-subtle text-sm font-normal"> of {nestResult.sheets.length} · {matLabel(sheet)} · {sheet.stock.w}×{sheet.stock.h}mm{sheet.stock.isOffcut ? ' · offcut' : ''}</span>
            </div>
            <InteractiveSheet
              sheet={sheet}
              selectedUid={selectedUid}
              onSelect={selectPlacement}
              onMove={(uid, x, y) => movePartWithin(uid, x, y)}
              onContext={(uid, x, y) => { selectPlacement(uid); setCtxMenu({ uid, x, y }) }}
            />
          </div>
        </div>

        {/* Unplaced pool */}
        <div className="flex-none h-28 border-t border-edge px-6 py-2 overflow-y-auto">
          <p className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wider mb-1.5">
            Unplaced ({unplaced.length}) — click to place on sheet {sheet.index + 1}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unplaced.length === 0 && <span className="text-[11px] text-ink-subtle">All parts placed.</span>}
            {unplaced.map(p => (
              <button key={p.uid}
                onClick={() => {
                  const gap = useOptiStore.getState().settings.kerf + useOptiStore.getState().settings.pad
                  const pos = findBestPlacement(sheet, p.w, p.h, gap)
                  if (pos) placeFromUnplaced(p.uid, sheet.index, pos.x, pos.y)
                  else setEditError('No room on this sheet for this part.')
                }}
                className="px-2 py-1 rounded border border-edge-strong text-[11px] text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors"
                title={`${Math.round(p.w)}×${Math.round(p.h)}mm`}>
                {p.label} <span className="text-ink-subtle font-mono">{Math.round(p.w)}×{Math.round(p.h)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sheet navigator */}
      <div className="flex-none w-64 border-l border-edge flex flex-col overflow-hidden">
        {/* Selected part inspector */}
        <div className="flex-none border-b border-edge px-3 py-2.5">
          <p className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wider mb-1.5">Selected part</p>
          {!selectedInfo ? (
            <p className="text-[11px] text-ink-subtle">Click a part on the sheet to inspect it.</p>
          ) : (
            <div className="space-y-1 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="inline-grid place-items-center w-5 h-5 rounded bg-accent/20 text-accent-ink font-mono font-semibold">{selectedInfo.num}</span>
                <span className="text-ink font-medium truncate">{selectedInfo.part?.label ?? selectedInfo.pl.label}</span>
              </div>
              <InfoRow label="Cabinet" value={selectedInfo.part?.cabinet_label ?? '—'} />
              <InfoRow label="Room" value={selectedInfo.part ? `${selectedInfo.part.job_number ? selectedInfo.part.job_number + ' · ' : ''}${selectedInfo.part.room_name}` : '—'} />
              <InfoRow label="Width (DX)" value={`${Math.round(selectedInfo.pl.w)} mm`} />
              <InfoRow label="Height (DY)" value={`${Math.round(selectedInfo.pl.h)} mm`} />
              <InfoRow label="Thk (DZ)" value={selectedInfo.part ? `${selectedInfo.part.thickness} mm` : '—'} />
              <InfoRow label="Material" value={matName(selectedInfo.part?.material_id ?? null)} />
              <InfoRow label="On sheet" value={`${selectedInfo.sheetIndex + 1}${selectedInfo.pl.rotated ? ' · rotated 90°' : ''}`} />
              {selectedInfo.part?.comment && <InfoRow label="Comment" value={selectedInfo.part.comment} />}

              {/* Actions */}
              <div className="flex items-center gap-1.5 pt-2">
                <button onClick={() => rotatePart(selectedInfo.pl.uid)}
                  className="px-2 py-1 rounded border border-edge-strong text-ink-muted hover:bg-surface-2 transition-colors">⟳ Rotate</button>
                <button onClick={() => removeToUnplaced(selectedInfo.pl.uid)}
                  className="px-2 py-1 rounded border border-edge-strong text-ink-muted hover:bg-red-900/30 hover:text-red-300 transition-colors">Delete</button>
              </div>
              <div className="pt-1">
                <select value="" onChange={e => {
                  const target = Number(e.target.value)
                  if (Number.isNaN(target)) return
                  const st = useOptiStore.getState()
                  const gap = st.settings.kerf + st.settings.pad
                  const sh = st.nestResult?.sheets.find(s => s.index === target)
                  if (!sh) return
                  const pos = findBestPlacement(sh, selectedInfo.pl.w, selectedInfo.pl.h, gap)
                  if (pos) relocatePart(selectedInfo.pl.uid, target, pos.x, pos.y)
                  else setEditError('No room on that sheet for this part.')
                }}
                  className="w-full bg-surface-2 border border-edge-strong rounded px-2 py-1 text-[11px] text-ink-muted focus:outline-none focus:border-accent">
                  <option value="">Move to sheet…</option>
                  {nestResult.sheets.filter(s => s.index !== selectedInfo.sheetIndex).map(s => (
                    <option key={s.index} value={s.index}>Sheet {s.index + 1}{s.stock.isOffcut ? ' (offcut)' : ''}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
        <div className="flex-1" />
        <SheetManagePanel sheet={sheet} onDelete={() => deleteSheet(sheet.index)} onResize={(w, h) => resizeSheet(sheet.index, w, h)} />
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div className="fixed z-50 w-40 bg-surface border border-edge-strong rounded-lg shadow-xl py-1" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={e => e.stopPropagation()}>
          <CtxItem label="Rotate 90°" onClick={() => { rotatePart(ctxMenu.uid); setCtxMenu(null) }} />
          <CtxItem label="Copy" onClick={() => { copyToClipboard(ctxMenu.uid); setCtxMenu(null) }} />
          <CtxItem label="Cut" onClick={() => { cutToClipboard(ctxMenu.uid); setCtxMenu(null) }} />
          <CtxItem label="Delete from run" onClick={() => { removeToUnplaced(ctxMenu.uid); setCtxMenu(null) }} danger />
          <div className="border-t border-edge my-1" />
          <p className="px-3 py-1 text-[10px] text-ink-subtle uppercase tracking-wider">Move to sheet</p>
          <div className="max-h-40 overflow-y-auto">
            {nestResult.sheets.filter(s => s.index !== sheet.index).map(s => (
              <CtxItem key={s.index} label={`Sheet ${s.index + 1}`} onClick={() => {
                const st = useOptiStore.getState()
                const gap = st.settings.kerf + st.settings.pad
                const part = st.partIndex[ctxMenu.uid]
                const target = st.nestResult?.sheets.find(x => x.index === s.index)
                if (part && target) {
                  const p = findBestPlacement(target, part.w, part.h, gap)
                  if (p) relocatePart(ctxMenu.uid, s.index, p.x, p.y)
                  else setEditError('No room on that sheet for this part.')
                }
                setCtxMenu(null)
              }} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Interactive sheet (pointer drag with live snap preview) ────────────────────────
function InteractiveSheet({ sheet, selectedUid, onSelect, onMove, onContext }: {
  sheet: NestedSheet
  selectedUid: string | null
  onSelect: (uid: string | null) => void
  onMove: (uid: string, x: number, y: number) => void
  onContext: (uid: string, clientX: number, clientY: number) => void
}) {
  const { w: W, h: H } = sheet.stock
  const scale = Math.min(MAX_W / W, MAX_H / H)
  const pxW = W * scale, pxH = H * scale
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<{ uid: string; offX: number; offY: number; gx: number; gy: number } | null>(null)

  // client → sheet mm (bottom-left origin)
  function toMm(clientX: number, clientY: number) {
    const r = svgRef.current!.getBoundingClientRect()
    return { mx: (clientX - r.left) / scale, my: H - (clientY - r.top) / scale }
  }

  function onPointerDown(e: React.PointerEvent, uid: string) {
    e.stopPropagation()
    onSelect(uid)
    const p = sheet.placements.find(p => p.uid === uid)!
    const { mx, my } = toMm(e.clientX, e.clientY)
    setDrag({ uid, offX: mx - p.x, offY: my - p.y, gx: p.x, gy: p.y })
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return
    const { mx, my } = toMm(e.clientX, e.clientY)
    const part = sheet.placements.find(p => p.uid === drag.uid)!
    const gap = useOptiStore.getState().settings.kerf + useOptiStore.getState().settings.pad
    const pos = findNearestValid(sheet, drag.uid, part.w, part.h, mx - drag.offX, my - drag.offY, gap)
    if (pos) setDrag({ ...drag, gx: pos.x, gy: pos.y })
  }
  function onPointerUp() {
    if (drag) { onMove(drag.uid, drag.gx, drag.gy); setDrag(null) }
  }

  const fy = (y: number, h: number) => (H - y - h) * scale

  return (
    <svg ref={svgRef} width={pxW} height={pxH} viewBox={`0 0 ${pxW} ${pxH}`}
      onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
      onClick={() => onSelect(null)} className="shadow-lg">
      <rect x={0} y={0} width={pxW} height={pxH} fill="#0f172a" stroke="#475569" strokeWidth={1} />
      {(() => { const u = usableBounds(sheet.stock); return (
        <rect x={u.x0 * scale} y={(H - u.y1) * scale} width={(u.x1 - u.x0) * scale} height={(u.y1 - u.y0) * scale}
          fill="none" stroke="#334155" strokeWidth={1} strokeDasharray="3 3" />
      ) })()}
      {sheet.placements.map((p, idx) => {
        const isDrag = drag?.uid === p.uid
        const x = isDrag ? drag!.gx : p.x
        const y = isDrag ? drag!.gy : p.y
        const on = selectedUid === p.uid
        const num = idx + 1   // per-sheet part number
        return (
          <g key={p.uid}
            onPointerDown={e => onPointerDown(e, p.uid)}
            onClick={e => e.stopPropagation()}
            onContextMenu={e => { e.preventDefault(); onContext(p.uid, e.clientX, e.clientY) }}
            style={{ cursor: 'move' }}>
            <rect x={x * scale} y={fy(y, p.h)} width={p.w * scale} height={p.h * scale}
              fill={on ? '#2563eb' : '#1e3a5f'} fillOpacity={on ? 0.6 : 0.42}
              stroke={on ? '#60a5fa' : '#3b82f6'} strokeWidth={on ? 1.8 : 0.9} />
            {(() => {
              const wpx = p.w * scale, hpx = p.h * scale
              const cx = (x + p.w / 2) * scale
              const cyc = fy(y, p.h) + hpx / 2
              const vertical = hpx > wpx                 // taller than wide → run text along the height
              const longPx = Math.max(wpx, hpx), shortPx = Math.min(wpx, hpx)
              const showNum = shortPx > 11 && longPx > 16
              const showLabel = shortPx > 22 && longPx > 46
              const numFont = Math.min(13, Math.max(8, shortPx / 2.2))
              const labelFont = Math.min(9, Math.max(6, shortPx / 4))
              const maxChars = Math.max(3, Math.floor(longPx / (labelFont * 0.62)))
              const label = p.label.length > maxChars ? p.label.slice(0, maxChars - 1) + '…' : p.label
              return (
                <g style={{ pointerEvents: 'none' }} transform={vertical ? `rotate(-90 ${cx} ${cyc})` : undefined}>
                  {showNum && (
                    <text x={cx} y={cyc + (showLabel ? -5 : 0)} textAnchor="middle" dominantBaseline="middle"
                      fill="#e2e8f0" fontSize={numFont} fontWeight={600} fontFamily="monospace">
                      {num}
                    </text>
                  )}
                  {showLabel && (
                    <text x={cx} y={cyc + 8} textAnchor="middle" dominantBaseline="middle"
                      fill="#94a3b8" fontSize={labelFont} fontFamily="monospace">
                      {label}
                    </text>
                  )}
                </g>
              )
            })()}
          </g>
        )
      })}
    </svg>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-ink-subtle shrink-0">{label}</span>
      <span className="text-ink-muted text-right truncate" title={value}>{value}</span>
    </div>
  )
}


function AddSheetButton({ onAdd }: { onAdd: (stock: { w: number; h: number; trimTop: number; trimBottom: number; trimLeft: number; trimRight: number; isOffcut: boolean; label: string | null }, materialId: string | null, thickness: number) => void }) {
  // Adds a blank standard-ish sheet for the first selected material group.
  const groups = useOptiStore(s => s.stock)
  function add() {
    const firstKey = Object.keys(groups)[0]
    const g = firstKey ? groups[firstKey] : null
    const [matId, thick] = firstKey ? firstKey.split('__') : ['none', '18']
    onAdd(g ? { ...g.standard, label: 'Blank' } : { w: 2400, h: 1200, trimTop: 0, trimBottom: 0, trimLeft: 0, trimRight: 0, isOffcut: false, label: 'Blank' },
      matId === 'none' ? null : matId, Number(thick))
  }
  return <button onClick={add} className="text-[11px] px-1.5 py-0.5 rounded border border-edge-strong text-ink-muted hover:bg-surface-2 transition-colors">+ Sheet</button>
}

function SheetManagePanel({ sheet, onDelete, onResize }: { sheet: NestedSheet; onDelete: () => void; onResize: (w: number, h: number) => void }) {
  return (
    <div className="flex-none border-t border-edge p-3 space-y-2">
      <p className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wider">Sheet {sheet.index + 1}</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] text-ink-subtle">W
          <input type="number" defaultValue={sheet.stock.w} key={`w${sheet.index}${sheet.stock.w}`}
            onBlur={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onResize(v, sheet.stock.h) }}
            className="w-full bg-surface-2 border border-edge-strong rounded px-1.5 py-0.5 text-xs text-ink font-mono mt-0.5 focus:outline-none focus:border-accent" />
        </label>
        <label className="text-[10px] text-ink-subtle">H
          <input type="number" defaultValue={sheet.stock.h} key={`h${sheet.index}${sheet.stock.h}`}
            onBlur={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onResize(sheet.stock.w, v) }}
            className="w-full bg-surface-2 border border-edge-strong rounded px-1.5 py-0.5 text-xs text-ink font-mono mt-0.5 focus:outline-none focus:border-accent" />
        </label>
      </div>
      <button onClick={() => { if (confirm('Delete this sheet? Its parts return to the unplaced pool.')) onDelete() }}
        className="w-full text-[11px] px-2 py-1 rounded border border-edge-strong text-ink-muted hover:bg-red-900/30 hover:text-red-300 transition-colors">
        Delete sheet
      </button>
    </div>
  )
}

function CtxItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${danger ? 'text-red-400 hover:bg-red-900/30' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'}`}>
      {label}
    </button>
  )
}
