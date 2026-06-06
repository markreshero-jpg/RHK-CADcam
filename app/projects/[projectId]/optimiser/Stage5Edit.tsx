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
  const copyToClipboard = useOptiStore(s => s.copyToClipboard)
  const cutToClipboard = useOptiStore(s => s.cutToClipboard)
  const pasteClipboard = useOptiStore(s => s.pasteClipboard)
  const deleteSheet = useOptiStore(s => s.deleteSheet)
  const addSheet = useOptiStore(s => s.addSheet)
  const resizeSheet = useOptiStore(s => s.resizeSheet)
  const undo = useOptiStore(s => s.undo)
  const redo = useOptiStore(s => s.redo)

  const [ctxMenu, setCtxMenu] = useState<{ uid: string; x: number; y: number } | null>(null)

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

  return (
    <div className="h-full flex overflow-hidden" onClick={() => setCtxMenu(null)}>
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
          <InteractiveSheet
            sheet={sheet}
            selectedUid={selectedUid}
            onSelect={selectPlacement}
            onMove={(uid, x, y) => movePartWithin(uid, x, y)}
            onContext={(uid, x, y) => { selectPlacement(uid); setCtxMenu({ uid, x, y }) }}
          />
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
      <div className="flex-none w-56 border-l border-edge flex flex-col overflow-hidden">
        <div className="flex-none px-3 py-2 border-b border-edge flex items-center justify-between">
          <span className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wider">Sheets ({nestResult.sheets.length})</span>
          <AddSheetButton onAdd={addSheet} />
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {nestResult.sheets.map(s => (
            <button key={s.index} onClick={() => setCurrentSheet(s.index)}
              className={`w-full text-left rounded-lg border p-2 transition-colors ${s.index === sheet.index ? 'border-accent bg-accent/10' : 'border-edge-strong hover:bg-surface-2'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-ink">Sheet {s.index + 1}{s.stock.isOffcut ? ' (offcut)' : ''}</span>
                <span className="text-[10px] font-mono text-ink-subtle">{(s.efficiency * 100).toFixed(0)}%</span>
              </div>
              <ThumbSheet sheet={s} />
            </button>
          ))}
        </div>
        <SheetManagePanel sheet={sheet} onDelete={() => deleteSheet(sheet.index)} onResize={(w, h) => resizeSheet(sheet.index, w, h)} />
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div className="fixed z-50 w-40 bg-surface border border-edge-strong rounded-lg shadow-xl py-1" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={e => e.stopPropagation()}>
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
      {sheet.placements.map(p => {
        const isDrag = drag?.uid === p.uid
        const x = isDrag ? drag!.gx : p.x
        const y = isDrag ? drag!.gy : p.y
        const on = selectedUid === p.uid
        return (
          <g key={p.uid}
            onPointerDown={e => onPointerDown(e, p.uid)}
            onContextMenu={e => { e.preventDefault(); onContext(p.uid, e.clientX, e.clientY) }}
            style={{ cursor: 'move' }}>
            <rect x={x * scale} y={fy(y, p.h)} width={p.w * scale} height={p.h * scale}
              fill={on ? '#2563eb' : '#1e3a5f'} fillOpacity={on ? 0.6 : 0.42}
              stroke={on ? '#60a5fa' : '#3b82f6'} strokeWidth={on ? 1.8 : 0.9} />
            {p.w * scale > 30 && p.h * scale > 12 && (
              <text x={(x + p.w / 2) * scale} y={fy(y, p.h) + (p.h * scale) / 2} textAnchor="middle" dominantBaseline="middle"
                fill="#cbd5e1" fontSize={Math.min(11, Math.max(7, p.h * scale / 4))} fontFamily="monospace" style={{ pointerEvents: 'none' }}>
                {p.label.length > 16 ? p.label.slice(0, 15) + '…' : p.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function ThumbSheet({ sheet }: { sheet: NestedSheet }) {
  const { w: W, h: H } = sheet.stock
  const tw = 200, scale = tw / W, th = H * scale
  return (
    <svg width="100%" viewBox={`0 0 ${tw} ${th}`} className="block">
      <rect x={0} y={0} width={tw} height={th} fill="#0f172a" stroke="#475569" strokeWidth={0.5} />
      {sheet.placements.map(p => (
        <rect key={p.uid} x={p.x * scale} y={(H - p.y - p.h) * scale} width={p.w * scale} height={p.h * scale}
          fill="#1e3a5f" fillOpacity={0.5} stroke="#3b82f6" strokeWidth={0.4} />
      ))}
    </svg>
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
