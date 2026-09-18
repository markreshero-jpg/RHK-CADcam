'use client'

// ============================================================
// Part Editor — per-part Overrides panel (right sidebar tab).
// The same override machinery as the cabinet Overrides tab,
// filtered to the one part being edited and compacted for the
// sidebar: size (DY/DX/DZ, CV convention) + position + rotation fields, and the
// part's shape — revision history with restore-any (live: the
// centre 3D/ortho views update as revisions are restored),
// stale flag, remove. Shape mutations flow through the same
// shared helpers as the cabinet tab (applyShapeSizeSync /
// clearShapeWrittenSlots via the host's callbacks), so
// behaviour is identical wherever an override is touched.
// ============================================================

import { Fragment, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { extForAxes, type PartMeta } from '@/src/components/three/PartViewer'
import type { CabinetCustomPart, PartPosOverrides, ShapeOverride, ShapeRevisionEntry } from '../canvasDB'
import { dbListShapeRevisions, dbSavePartPosOverride, dbDeletePartPosOverride, dbUpdateCustomPart } from '../canvasDB'
import { shapeToSvgPath } from '@/src/lib/shapePath'
import CalcInput from '@/src/components/CalcInput'
import { fmtMm } from '@/src/lib/format'
import FormulaInput from '@/src/components/FormulaInput'
import type { FormulaScope } from '@/src/lib/formula'
import {
  dbLoadPartExpressions, dbSavePartExpressions, setPartExpression,
  type PartExpressions, type PartSizeSlot,
} from '@/src/lib/formula/partExpressions'

type OvEntry = PartPosOverrides[string]

// Mini outline thumbnail so revisions with identical bounding boxes are still
// tellable apart at a glance.
function ShapeThumb({ entry }: { entry: ShapeRevisionEntry }) {
  const b = entry.meta?.bounds
  const w = Math.max(1, b?.maxX ?? 100), h = Math.max(1, b?.maxY ?? 100)
  const pad = Math.max(w, h) * 0.06
  return (
    <svg width={30} height={30} viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`}
      preserveAspectRatio="xMidYMid meet" className="flex-none">
      <path d={shapeToSvgPath(entry.segments)} fill="rgba(56,189,248,0.15)"
        stroke="#7dd3fc" strokeWidth={Math.max(w, h) / 24} strokeLinejoin="round" />
    </svg>
  )
}

export default function PartOverridesPanel({
  width, cabinetId, part, partBase, partOverrides, onOverridesChange, customParts, setCustomParts,
  shapeOv, onEditShape, onRestoreRevision, onRemoveShape, previewRevision, onPreviewRevision,
  formulaScope,
}: {
  width:     number
  cabinetId: string
  part:      PartMeta
  partBase?: { dy: number; dx: number; dz: number }
  partOverrides?:     PartPosOverrides
  onOverridesChange?: (o: PartPosOverrides) => void
  /** Evaluation scope for size formulas (cab.h - 100 …); null while resolving. */
  formulaScope?:      FormulaScope | null
  customParts?:       CabinetCustomPart[]
  setCustomParts?:    Dispatch<SetStateAction<CabinetCustomPart[]>>
  shapeOv:            ShapeOverride | null
  onEditShape:        () => void
  onRestoreRevision:  (revision: number) => void
  onRemoveShape:      () => void
  // Browse-without-committing: clicking a history row previews that revision
  // live in the centre views; only the Restore button writes anything.
  previewRevision?:   number | null
  onPreviewRevision:  (r: ShapeRevisionEntry | null) => void
}) {
  const isCustom = part.id.startsWith('custom_')
  const cp = isCustom ? customParts?.find(p => `custom_${p.id}` === part.id) : undefined
  const canEdit = !!partOverrides && !!onOverridesChange
  const ov: OvEntry = partOverrides?.[part.id] ?? { ox: 0, oy: 0, oz: 0 }
  const hasEntry = !!partOverrides?.[part.id]

  // Same write semantics as the cabinet tab's OverrideRow.
  function setEntry(next: OvEntry) {
    if (!canEdit) return
    onOverridesChange!({ ...partOverrides!, [part.id]: next })
    dbSavePartPosOverride(cabinetId, part.id, next, partOverrides!).catch(console.error)
  }
  const setF   = (k: keyof OvEntry, v: number) => setEntry({ ...ov, [k]: v })
  const clearF = (k: keyof OvEntry) => { const n = { ...ov }; delete n[k]; setEntry(n) }

  // Per-part size formulas (standard parts only). Loaded once per mount; the
  // formula source lives in cabinet_instances.part_expressions, the computed
  // value is cached into the sw/sh/sd override slot (setF) so every consumer
  // keeps reading plain numbers. Re-evaluated on resolve by applyPartExpressions.
  const [exprs, setExprs] = useState<PartExpressions | null>(null)
  useEffect(() => {
    if (isCustom) return
    let live = true
    dbLoadPartExpressions(cabinetId)
      .then(e => { if (live) setExprs(e) })
      .catch(e => console.error('[part expressions load]', e))
    return () => { live = false }
  }, [cabinetId, isCustom])

  function saveExpr(slot: PartSizeSlot, formula: string | null) {
    const next = setPartExpression(exprs ?? {}, part.id, slot, formula)
    setExprs(next)
    dbSavePartExpressions(cabinetId, next).catch(console.error)
  }

  function removeEntry() {
    if (!canEdit || !hasEntry) return
    const { [part.id]: _removed, ...updated } = partOverrides!
    onOverridesChange!(updated)
    dbDeletePartPosOverride(cabinetId, part.id, partOverrides!).catch(console.error)
    // Formulas drive the size slots — removing the overrides clears them too.
    if (exprs?.[part.id]) {
      const { [part.id]: _e, ...restE } = exprs
      setExprs(restE)
      dbSavePartExpressions(cabinetId, restE).catch(console.error)
    }
  }

  // Full revision history, loaded on demand. Closing it drops any live preview.
  const [revs, setRevs] = useState<ShapeRevisionEntry[] | null>(null)
  async function toggleHistory() {
    if (revs) { setRevs(null); onPreviewRevision(null); return }
    setRevs(await dbListShapeRevisions(cabinetId, part.id))
  }
  // Keep an open list current: a committed Restore appends a new head, so
  // refresh to include it (and re-mark "current").
  const headRev = shapeOv?.revision
  useEffect(() => {
    if (revs === null || headRev == null) return
    let live = true
    dbListShapeRevisions(cabinetId, part.id).then(r => { if (live) setRevs(r) })
    return () => { live = false }
  }, [headRev]) // eslint-disable-line react-hooks/exhaustive-deps

  // Stale check — same rule as the cabinet tab (unordered in-plane pair vs
  // meta.baseAtSave, 0.5mm tolerance), sourced from partBase / the custom row.
  const savedBase = shapeOv?.meta?.baseAtSave
  const curBase: [number, number] | undefined = isCustom
    ? (cp ? [Number(cp.dy), Number(cp.dx)] : undefined)
    : (partBase ? [partBase.dy, partBase.dx] : undefined)
  const stale = !!(savedBase && curBase && (() => {
    const a = [...curBase].sort((x, y) => x - y)
    const b = [savedBase.w, savedBase.h].sort((x, y) => x - y)
    return Math.abs(a[0] - b[0]) > 0.5 || Math.abs(a[1] - b[1]) > 0.5
  })())

  const inputCls = 'w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs font-mono text-right text-white focus:outline-none focus:border-blue-500'
  const hasSize = ov.sw != null || ov.sh != null || ov.sd != null
  const head = (label: string, accent?: boolean) => (
    <div className={`text-[9px] uppercase tracking-wider mb-1 ${accent ? 'text-orange-400' : 'text-gray-600'}`}>{label}</div>
  )
  const sizeField = (label: string, k: PartSizeSlot, baseVal?: number) => (
    <div className="flex items-start gap-1 mb-1">
      <span className="text-[10px] text-gray-600 w-5 mt-1.5">{label}</span>
      <FormulaInput
        formula={exprs?.[part.id]?.[k] ?? null}
        value={ov[k] ?? null}
        scope={formulaScope ?? null}
        decimals={1}
        className={`${inputCls.replace('w-16 ', '')} w-full`}
        placeholder={baseVal != null ? fmtMm(baseVal) : '—'}
        onLiteral={v => { if (exprs?.[part.id]?.[k]) saveExpr(k, null); setF(k, v) }}
        onFormula={(src, v) => { saveExpr(k, src); setF(k, v) }}
        onClear={() => { if (exprs?.[part.id]?.[k]) saveExpr(k, null); clearF(k) }}
      />
      <span className="text-[10px] text-gray-600 mt-1.5">mm</span>
    </div>
  )
  const offField = (label: string, k: keyof OvEntry, unit: string) => (
    <div className="flex items-center gap-1 mb-1">
      <span className="text-[10px] text-gray-600 w-5">{label}</span>
      <CalcInput value={(ov[k] as number | undefined) ?? 0} decimals={1} className={inputCls}
        onCommit={v => setF(k, v)} />
      <span className="text-[10px] text-gray-600">{unit}</span>
    </div>
  )
  const cpField = (label: string, k: 'x' | 'y' | 'z') => (
    <div className="flex items-center gap-1 mb-1">
      <span className="text-[10px] text-gray-600 w-5">{label}</span>
      <CalcInput value={cp![k]} decimals={1} className={inputCls}
        onCommit={v => {
          setCustomParts?.(prev => prev.map(p => (p.id === cp!.id ? { ...p, [k]: v } : p)))
          dbUpdateCustomPart(cp!.id, { [k]: v }).catch(console.error)
        }} />
      <span className="text-[10px] text-gray-600">mm</span>
    </div>
  )
  const btn = 'text-[11px] px-2 py-1 rounded border border-gray-700 text-gray-300 hover:bg-gray-700 transition-colors'
  const bnd = shapeOv?.meta?.bounds

  return (
    <div style={{ width }} className="flex-none bg-gray-900 border-l border-gray-800 overflow-y-auto">
      {/* ── Size / position / rotation ────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Part Overrides</span>
        {hasEntry && (
          <button onClick={removeEntry} title="Remove all position/size overrides for this part"
            className="text-gray-600 hover:text-red-400 text-sm leading-none transition-colors">✕</button>
        )}
      </div>
      <div className="px-3 py-3 border-b border-gray-800">
        {isCustom ? (
          cp ? (
            <>
              {head('Position (cabinet mm)')}
              {cpField('X', 'x')}
              {cpField('Y', 'y')}
              {cpField('Z', 'z')}
              <p className="text-[10px] text-gray-600 mt-2">
                Custom part — dims live on the part itself (3D inspector); a shape save sets them to the drawn bounding box.
              </p>
            </>
          ) : (
            <p className="text-xs text-gray-600">Custom part data not available here.</p>
          )
        ) : canEdit ? (
          <>
            {/* CV standard-part reading: DY = length (grain) / DX = width / DZ =
                thickness for every part, mapped to the sw/sh/sd box slots that
                the optimiser + shape sync share. */}
            {head('Size override (DY/DX/DZ)', hasSize)}
            {(['DY', 'DX', 'DZ'] as const).map(axis => {
              const e = extForAxes(part.panelKind, part.dxIsWidth)[axis]
              return <Fragment key={axis}>{sizeField(axis, `s${e}` as PartSizeSlot, partBase?.[axis.toLowerCase() as 'dy' | 'dx' | 'dz'])}</Fragment>
            })}
            <div className="border-t border-gray-800/60 my-2" />
            {head('Position offset')}
            {offField('X', 'ox', 'mm')}
            {offField('Y', 'oy', 'mm')}
            {offField('Z', 'oz', 'mm')}
            <div className="border-t border-gray-800/60 my-2" />
            {head('Rotation')}
            {offField('AX', 'oax', '°')}
            {offField('AY', 'oay', '°')}
            {offField('AZ', 'oaz', '°')}
          </>
        ) : (
          <p className="text-xs text-gray-600">Override editing needs the cabinet editor context.</p>
        )}
      </div>

      {/* ── Shape ─────────────────────────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full flex-none bg-sky-400" />
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Part Shape</span>
      </div>
      <div className="px-3 py-3">
        {shapeOv ? (
          <div className="space-y-2">
            <div className="text-[11px] font-mono text-sky-300 leading-relaxed">
              {shapeOv.segments.length} segment{shapeOv.segments.length !== 1 ? 's' : ''}
              {bnd ? ` · ${fmtMm(bnd.maxX)} × ${fmtMm(bnd.maxY)} mm` : ''}
              <br />
              r{shapeOv.revision}{(shapeOv.revisions ?? 1) > 1 ? ` of ${shapeOv.revisions}` : ''}
              {` · ${new Date(shapeOv.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
            </div>
            {stale && (
              <div className="text-[10px] text-amber-400">
                ⚠ part size changed since this shape was drawn — re-edit the shape
              </div>
            )}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button onClick={onEditShape} className={btn}>⬠ Edit</button>
              {(shapeOv.revisions ?? 1) > 1 && (
                <button onClick={() => void toggleHistory()} className={`${btn} ${revs ? 'bg-gray-700' : ''}`}>↺ History</button>
              )}
              <button onClick={onRemoveShape} className={`${btn} hover:border-red-700 hover:text-red-300`}>✕ Remove</button>
            </div>
            {revs && (
              <div className="border border-gray-700 rounded max-h-56 overflow-y-auto divide-y divide-gray-800/60">
                {revs.map(r => {
                  const isHead = r.revision === shapeOv.revision
                  const isPreview = previewRevision === r.revision
                  const b = r.meta?.bounds
                  return (
                    <div key={r.revision}
                      onClick={() => onPreviewRevision(isHead || isPreview ? null : r)}
                      title={isHead ? 'Current shape' : isPreview ? 'Click to stop previewing' : 'Click to preview live — nothing is saved'}
                      className={`flex items-center gap-2 px-2 py-1.5 text-[11px] transition-colors cursor-pointer ${
                        isPreview ? 'bg-sky-900/40' : isHead ? 'bg-gray-800/40' : 'hover:bg-gray-800'
                      }`}>
                      <ShapeThumb entry={r} />
                      <div className="flex-1 min-w-0 leading-tight">
                        <div className={isHead ? 'text-sky-300' : 'text-gray-200'}>
                          <span className="font-mono">r{r.revision}</span>
                          {isHead && <span className="text-[9px] uppercase tracking-wider ml-1.5">current</span>}
                          {isPreview && <span className="text-[9px] uppercase tracking-wider ml-1.5 text-sky-300">previewing</span>}
                        </div>
                        <div className="text-gray-500 text-[10px]">
                          {b ? `${fmtMm(b.maxX)}×${fmtMm(b.maxY)} · ` : ''}{r.segments.length} seg · {new Date(r.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                        </div>
                      </div>
                      {isPreview && !isHead && (
                        <button onClick={e => { e.stopPropagation(); onRestoreRevision(r.revision) }}
                          className="flex-none text-[10px] px-1.5 py-0.5 rounded border border-sky-700 text-sky-300 hover:bg-sky-900/50 transition-colors">
                          Restore
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <p className="text-[10px] text-gray-600">
              Click a revision to preview it live in the views — nothing is saved until you press Restore
              (which appends it as a new head; history is never lost).
            </p>
          </div>
        ) : (
          <p className="text-xs text-gray-600">
            No shape drawn — this part is a plain rectangle. Use <span className="text-gray-400">⬠ Edit Shape</span> to draw one.
          </p>
        )}
      </div>
    </div>
  )
}
