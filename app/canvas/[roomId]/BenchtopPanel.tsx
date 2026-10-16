'use client'

import PanelDeleteButton, { PanelCloseButton } from './PanelDeleteButton'
import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import CalcInput from '@/src/components/CalcInput'
import { BenchtopInstance, BenchtopBuildMethod, BenchtopEdgeProfile, BenchtopJoinType, Wall } from '@/src/lib/types'
import type { BtPosition, WallSide, BtOverhang, StretchEnd } from '@/src/lib/benchtopAnchor'
import type { BtThickness, BtTape, BtTapeContext } from './useBenchtopCatalog'
import { tapeTotals } from '@/src/lib/benchtopEdgeband'
import { btSegments, segLength, effectiveProfileId, outlineBounds, outlinePoints, signedArea } from '@/src/lib/benchtopGeometry'
import { resolveBenchtopFromDB, loadResolvedParts } from '@/src/lib/benchtop-resolver/resolveBenchtopFromDB'
import type { ResolvedBenchtopPart } from '@/src/lib/benchtop-resolver/types'

interface BenchtopSchedule { id: string; name: string }

const ROLE_LABELS: Record<string, string> = {
  worktop_panel:         'Worktop Panel',
  buildup_rail:          'Build-Up Rail',
  buildup_cross_member:  'Cross Member',
  subtop:                'Subtop',
  drop_front_fascia:     'Drop Front',
  side_fascia:           'Side Fascia',
  back_fascia:           'Back Fascia',
  stone_slab:            'Stone Slab',
}

export default function BenchtopPanel({
  benchtop, onUpdate, onDelete, onClose,
  filletRadius, setFilletRadius,
  onMirrorH, onMirrorV, onOffset, onRotate,
  onDeleteCutout, onDrawCutoutRect, onDrawCutoutCircle,
  profiles, method, onEditShape, onDrawJoin, onDeleteJoin, onSetJoinType,
  walls, position, baseHeight, thickness, onSetPosition, onReanchor, onMove,
  wallLength, overhang, onStretch,
  tapes, tapeCtx, onEditEdges, edgesChanged, onResolved,
}: {
  benchtop: BenchtopInstance
  onUpdate: (id: string, u: Partial<BenchtopInstance>) => Promise<void>
  onDelete: (id: string) => void
  /** Header ✕ — closes (deselects). Omitted → no ✕. */
  onClose?: () => void
  filletRadius: number
  setFilletRadius: (r: number) => void
  onMirrorH: (id: string) => void
  onMirrorV: (id: string) => void
  onOffset: (id: string, amount: number) => void
  onRotate: (id: string, angleDeg: number) => void
  onDeleteCutout: (id: string, i: number) => void
  onDrawCutoutRect: () => void
  onDrawCutoutCircle: () => void
  // Phase 3 — edge finishes + join lines
  profiles: BenchtopEdgeProfile[]
  method: BenchtopBuildMethod | null      // effective method (benchtop → room → job → default)
  onEditShape: (id: string) => void
  onDrawJoin: () => void
  onDeleteJoin: (id: string, i: number) => void
  onSetJoinType: (id: string, i: number, type: BenchtopJoinType) => void
  // Phase 3b — wall anchor + position (P-e / P-f) and height (P-g)
  walls: Wall[]
  position: BtPosition | null              // measured against the anchor wall face
  baseHeight: number                        // base-height cascade (job → room)
  thickness: BtThickness
  onSetPosition: (id: string, target: { along?: number; off?: number }) => void
  onReanchor: (id: string, wallId: string, side: WallSide) => void
  onMove: () => void
  // Editable sizes / ends (same idea as the cabinet wall-position block)
  wallLength: number | null                 // anchor wall length
  overhang: BtOverhang | null               // past the base cabinets under the top
  onStretch: (id: string, end: StretchEnd, delta: number) => void
  // Phase 7 — edge tape
  tapes: BtTape[]
  tapeCtx: BtTapeContext
  onEditEdges: (id: string) => void
  /** Edges were edited since these parts were resolved. */
  edgesChanged: boolean
  onResolved: () => void
}) {
  // Which end a typed length change moves (remembered while the panel is open).
  const [growEnd, setGrowEnd] = useState<'left' | 'right' | 'both'>('right')
  const [label, setLabel] = useState(benchtop.label ?? '')
  const [methods, setMethods] = useState<BenchtopBuildMethod[]>([])
  const [schedules, setSchedules] = useState<BenchtopSchedule[]>([])
  const [parts, setParts] = useState<ResolvedBenchtopPart[]>([])
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [offsetAmt, setOffsetAmt] = useState(0)
  const [rotateAmt, setRotateAmt] = useState(0)

  useEffect(() => {
    setLabel(benchtop.label ?? '')
  }, [benchtop.id, benchtop.label])

  useEffect(() => {
    void supabase.from('benchtop_build_methods').select('*').eq('active', true).order('name')
      .then(({ data }) => setMethods((data ?? []) as BenchtopBuildMethod[]))
    void supabase.from('benchtop_schedules').select('id, name').order('name')
      .then(({ data }) => setSchedules((data ?? []) as BenchtopSchedule[]))
    // Load any previously resolved parts
    void loadResolvedParts(benchtop.id).then(setParts)
  }, [benchtop.id])

  async function handleResolve() {
    if (btSegments(benchtop).length < 3) {
      setResolveError('Benchtop must have at least 3 vertices before resolving.')
      return
    }
    setResolving(true)
    setResolveError(null)
    try {
      const result = await resolveBenchtopFromDB(benchtop.id)
      if (result === null) {
        setResolveError('Could not resolve — make sure a Build Method is assigned (at benchtop, room, or job level).')
      } else {
        setParts(result)
        onResolved()
      }
    } finally {
      setResolving(false)
    }
  }

  const inp = 'w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500'
  const lbl = 'text-[10px] text-gray-500 uppercase tracking-wider mb-0.5 block'

  const segs = btSegments(benchtop)
  const n = segs.length
  const defaultProfileId = method?.default_edge_profile_id ?? null
  const profileById = Object.fromEntries(profiles.map(p => [p.id, p]))
  const defaultProfile = defaultProfileId ? profileById[defaultProfileId] : undefined
  // Lineal metres per profile over exposed edges — what the order / quote uses.
  const lineal = new Map<string, number>()
  for (const s of segs) {
    const pid = effectiveProfileId(s, defaultProfileId)
    if (pid) lineal.set(pid, (lineal.get(pid) ?? 0) + segLength(s))
  }
  const joins = benchtop.joins ?? []

  return (
    <div className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-300">Benchtop</p>
          <p className="text-[10px] text-gray-500">{n} vertices</p>
        </div>
        {onClose && <PanelCloseButton onClose={onClose} />}
      </div>

      <div className="p-4 space-y-3">

        {/* Size — editable. Length / depth are measured along the anchor wall
            (plan bbox if unanchored). A length change grows / shrinks the end
            picked under it; depth always moves the front edge (back stays on the
            wall). Thickness comes from the build method; area is net of cutouts. */}
        {(() => {
          const bb = outlineBounds(segs)
          const length = position?.length ?? (bb ? bb.maxX - bb.minX : 0)
          const depth = position?.depth ?? (bb ? bb.maxY - bb.minY : 0)
          const sitsAt = benchtop.height_mm ?? baseHeight
          const area = Math.abs(signedArea(outlinePoints(segs)))
            - (benchtop.cutout_polygons ?? []).reduce((a, c) => a + Math.abs(signedArea(c)), 0)
          const canSize = !!position
          const setSitsAt = (v: number) => void onUpdate(benchtop.id, { height_mm: v === baseHeight ? null : v })
          const field = (k: string, value: number, onCommit: ((v: number) => void) | null, title: string, extra = '') => (
            <div title={title}>
              <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">{k}</div>
              {onCommit
                ? <CalcInput value={Math.round(value)} decimals={0} onCommit={onCommit} className={inp + ' text-right ' + extra} />
                : <div className="bg-gray-800/60 rounded px-2 py-1 text-xs text-gray-300 text-right tabular-nums">{value}</div>}
            </div>
          )
          return (
            <div className="space-y-1.5">
              <label className={lbl}>Size (mm)</label>
              <div className="grid grid-cols-3 gap-1">
                {field('Length', length, canSize ? v => { if (v >= 50) onStretch(benchtop.id, growEnd, v - length) } : null,
                  'Overall length along the wall. The end picked below moves.')}
                {field('Depth', depth, canSize ? v => { if (v >= 50) onStretch(benchtop.id, 'front', v - depth) } : null,
                  'Overall depth off the wall. The front edge moves; the back stays on the wall.')}
                {field('Thick', thickness.total, null, 'From the build method' + (thickness.buildUp ? ` (${thickness.top} top + ${thickness.total - thickness.top} build-up)` : ''))}
              </div>
              {canSize && (
                <div className="flex items-center gap-1 text-[10px]">
                  <span className="text-gray-500">Length grows from</span>
                  {([['left', '◀ Left'], ['both', 'Both'], ['right', 'Right ▶']] as const).map(([k, t]) => (
                    <button key={k} onClick={() => setGrowEnd(k)}
                      className={`px-1.5 py-0.5 rounded ${growEnd === k ? 'bg-teal-800 text-teal-100' : 'text-gray-400 hover:bg-gray-800'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-3 gap-1">
                {field('Sits at', sitsAt, setSitsAt, 'Underside — sits on the base cabinets. Default = the job / room base cabinet height.',
                  benchtop.height_mm != null ? 'border-amber-600' : '')}
                {field('Top at', sitsAt + thickness.total, v => setSitsAt(v - thickness.total), 'Finished top surface height')}
                {field('Area m²', Number((area / 1e6).toFixed(2)), null, 'Net area (cutouts removed)')}
              </div>
              {benchtop.height_mm != null && (
                <button onClick={() => void onUpdate(benchtop.id, { height_mm: null })} className="text-[10px] text-amber-400 hover:text-amber-300">
                  ↺ sit on base cabinets ({baseHeight})
                </button>
              )}
              {n > 4 && <p className="text-[10px] text-gray-600">Shaped top — sizes are the overall extent; a length / depth change moves every corner past the halfway line. Edge lengths are under Edges.</p>}
            </div>
          )
        })()}

        {/* Label */}
        <div>
          <label className={lbl}>Label</label>
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            onBlur={() => { if (label !== (benchtop.label ?? '')) void onUpdate(benchtop.id, { label: label || null }) }}
            className={inp}
          />
        </div>

        {/* Build Method */}
        <div>
          <label className={lbl}>Build Method</label>
          <select
            value={benchtop.benchtop_build_method_id ?? ''}
            onChange={e => void onUpdate(benchtop.id, { benchtop_build_method_id: e.target.value || null })}
            className={inp}
          >
            <option value="">(inherit from job / room)</option>
            {methods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>

        {/* Schedule */}
        <div>
          <label className={lbl}>Material Schedule</label>
          <select
            value={benchtop.benchtop_schedule_id ?? ''}
            onChange={e => void onUpdate(benchtop.id, { benchtop_schedule_id: e.target.value || null })}
            className={inp}
          >
            <option value="">(inherit from job / room)</option>
            {schedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* ── Position (Phase 3b) — tops never drag on the plan; move them here ── */}
        <div className="border-t border-gray-800 pt-3 space-y-2">
          <p className={lbl}>Position</p>
          <div>
            <label className={lbl}>Anchored to</label>
            <select
              value={benchtop.wall_id ? `${benchtop.wall_id}|${benchtop.wall_side}` : ''}
              onChange={e => {
                const [wid, side] = e.target.value.split('|') as [string, WallSide]
                if (wid) onReanchor(benchtop.id, wid, side)
              }}
              className={inp}
              title="The wall elevation this top belongs to. Picking a wall it isn't on carries it there.">
              {!benchtop.wall_id && <option value="">(not anchored)</option>}
              {walls.flatMap(w => (['face', 'back'] as const).map(side => (
                <option key={`${w.id}|${side}`} value={`${w.id}|${side}`}>
                  {w.name} — {side === 'face' ? 'Face' : 'Back'}
                </option>
              )))}
            </select>
          </div>
          {position && wallLength != null && (
            <div className="grid grid-cols-3 gap-1">
              {([
                ['From left end', position.along, (v: number) => onSetPosition(benchtop.id, { along: v }), 'Left end of the wall to the left end of the top — moves the top'],
                ['From right end', wallLength - position.along - position.length, (v: number) => onSetPosition(benchtop.id, { along: wallLength - v - position.length }), 'Right end of the top to the right end of the wall — moves the top'],
                ['Off wall', position.off, (v: number) => onSetPosition(benchtop.id, { off: v }), 'Wall face to the back of the top — moves the top'],
              ] as const).map(([k, v, commit, title]) => (
                <div key={k} title={title}>
                  <div className="text-[9px] text-gray-500 mb-0.5">{k}</div>
                  <CalcInput value={Math.round(v)} decimals={0} onCommit={commit} className={inp + ' text-right'} />
                </div>
              ))}
            </div>
          )}
          {position && (overhang ? (
            <div>
              <div className="text-[9px] text-gray-500 mb-0.5" title="How far the top runs past the base cabinets under it. Editing one moves only that edge.">
                Overhang past cabinets
              </div>
              <div className="grid grid-cols-3 gap-1">
                {([['Left', 'left', overhang.left], ['Right', 'right', overhang.right], ['Front', 'front', overhang.front]] as const).map(([k, end, v]) => (
                  <div key={k}>
                    <div className="text-[9px] text-gray-500 mb-0.5">{k}</div>
                    <CalcInput value={Math.round(v)} decimals={0}
                      onCommit={nv => onStretch(benchtop.id, end, nv - v)}
                      className={`${inp} text-right ${v < 0 ? 'text-red-400' : ''}`} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-gray-600">No base cabinets under this top on its anchor wall.</p>
          ))}
          <button onClick={onMove}
            className="w-full px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-white"
            title="Pick a base point, then the point to move it to (snaps). Esc cancels.">
            Move…
          </button>
        </div>

        {/* ── Edges: a summary here; editing is the Edit edges mode (Phase 7b) ── */}
        {(() => {
          const wallN = segs.filter(s => s.edge?.wall).length
          const jointN = segs.filter(s => s.edge?.joint).length
          const tapeMm = tapeCtx.applies
            ? tapeTotals(segs, s => { const pid = effectiveProfileId(s, defaultProfileId); return pid ? profileById[pid] : undefined }, tapeCtx.defaultTape,
              (benchtop.height_mm ?? baseHeight) + thickness.total)
            : null
          const tapeById = new Map(tapes.map(t => [t.id, t]))
          return (
            <div className="border-t border-gray-800 pt-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <p className={lbl}>Edges</p>
                <span className="text-[10px] text-gray-500">{method ? method.name : 'no method'}</span>
              </div>
              <div className="text-[10px] text-gray-400 space-y-0.5">
                <div>{n - wallN - jointN} exposed · {wallN} wall{jointN ? ` · ${jointN} joint${jointN > 1 ? "s" : ""}` : ""}{defaultProfile ? ` · default ${defaultProfile.code ?? defaultProfile.name}` : ''}</div>
                {lineal.size > 0 && (
                  <div>{[...lineal.entries()].map(([pid, mm]) => `${profileById[pid]?.code ?? profileById[pid]?.name ?? '?'} ${(mm / 1000).toFixed(2)} lm`).join(' · ')}</div>
                )}
                {tapeMm && (
                  <div>Tape: {tapeMm.size ? [...tapeMm.entries()].map(([id, mm]) => `${tapeById.get(id)?.name ?? '?'} ${(mm / 1000).toFixed(2)} m`).join(' · ') : 'none'}</div>
                )}
              </div>
              <div className="flex gap-1">
                <button onClick={() => onEditEdges(benchtop.id)}
                  className="flex-1 px-3 py-1.5 rounded text-xs font-medium bg-blue-700 hover:bg-blue-600 text-white"
                  title="Paint edge profiles, walls and edge tape on the plan (also: right-click the top)">
                  Edit edges…
                </button>
                <button onClick={() => onEditShape(benchtop.id)}
                  className="px-2 py-1.5 rounded text-xs bg-gray-700 hover:bg-gray-600 text-white" title="The full-screen Shape Editor">
                  Shape Editor…
                </button>
              </div>
            </div>
          )
        })()}

        {/* ── Join lines (P-b) ── */}
        <div className="border-t border-gray-800 pt-3 space-y-2">
          <p className={lbl}>Joins</p>
          <button onClick={onDrawJoin}
            className="w-full px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-white">
            + Add join line
          </button>
          {joins.length === 0 && <p className="text-[10px] text-gray-600">One piece — no joins</p>}
          {joins.map((j, i) => (
            <div key={i} className="flex items-center gap-1 bg-gray-800 rounded px-2 py-1 text-[10px]">
              <span className="text-gray-400 flex-1">Join {i + 1} · {Math.round(Math.hypot(j.p1.x - j.p0.x, j.p1.y - j.p0.y))}</span>
              {(['butt', 'mitre'] as const).map(t => (
                <button key={t} onClick={() => onSetJoinType(benchtop.id, i, t)}
                  className={`px-1.5 rounded ${j.type === t ? 'bg-red-900 text-red-200' : 'text-gray-500 hover:text-gray-300'}`}>
                  {t === 'butt' ? 'Butt' : 'Mitre'}
                </button>
              ))}
              <button onClick={() => onDeleteJoin(benchtop.id, i)} className="text-red-500 hover:text-red-400 ml-1">✕</button>
            </div>
          ))}
        </div>

        {/* ── Transform ── */}
        <div className="border-t border-gray-800 pt-3 space-y-2">
          <p className={lbl}>Transform</p>

          {/* Rotate */}
          <div>
            <label className={lbl}>Rotate (°)</label>
            <div className="flex gap-1">
              <CalcInput value={rotateAmt} onCommit={setRotateAmt}
                className={inp + ' flex-1'} placeholder="0" />
              <button onClick={() => { onRotate(benchtop.id, rotateAmt); setRotateAmt(0) }}
                className="px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-white">
                Apply
              </button>
            </div>
            <div className="flex gap-1 mt-1">
              {[45, 90, -90, 180].map(a => (
                <button key={a} onClick={() => onRotate(benchtop.id, a)}
                  className="flex-1 px-1 py-0.5 rounded text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300">
                  {a > 0 ? `+${a}°` : `${a}°`}
                </button>
              ))}
            </div>
          </div>

          {/* Mirror */}
          <div>
            <label className={lbl}>Mirror</label>
            <div className="flex gap-1">
              <button onClick={() => onMirrorH(benchtop.id)}
                className="flex-1 px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-white">
                ↔ Horizontal
              </button>
              <button onClick={() => onMirrorV(benchtop.id)}
                className="flex-1 px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-white">
                ↕ Vertical
              </button>
            </div>
          </div>

          {/* Offset */}
          <div>
            <label className={lbl}>Offset shape (mm)</label>
            <div className="flex gap-1">
              <CalcInput value={offsetAmt} onCommit={setOffsetAmt}
                className={inp + ' flex-1'} placeholder="0" />
              <button onClick={() => { if (offsetAmt !== 0) { onOffset(benchtop.id, offsetAmt); setOffsetAmt(0) } }}
                className="px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-white">
                Apply
              </button>
            </div>
            <p className="text-[10px] text-gray-600">+ expands · − shrinks</p>
          </div>

          {/* Fillet radius */}
          <div>
            <label className={lbl}>Corner radius (mm)</label>
            <div className="flex gap-1">
              <CalcInput value={filletRadius} min={1} max={500}
                onCommit={setFilletRadius}
                className={inp + ' flex-1'} />
              <span className="text-[10px] text-gray-500 self-center pr-1">used by<br/>Round/Chamfer</span>
            </div>
          </div>
        </div>

        {/* ── Cutouts ── */}
        <div className="border-t border-gray-800 pt-3 space-y-2">
          <p className={lbl}>Cutouts</p>
          <div className="flex gap-1">
            <button onClick={onDrawCutoutRect}
              className="flex-1 px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-white">
              + Rect
            </button>
            <button onClick={onDrawCutoutCircle}
              className="flex-1 px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-white">
              + Circle
            </button>
          </div>
          {(benchtop.cutout_polygons ?? []).length === 0 && (
            <p className="text-[10px] text-gray-600">No cutouts</p>
          )}
          {(benchtop.cutout_polygons ?? []).map((cut, i) => (
            <div key={i} className="flex items-center justify-between bg-gray-800 rounded px-2 py-1 text-[10px]">
              <span className="text-gray-400">Cutout {i + 1} · {cut.length} pts</span>
              <button onClick={() => onDeleteCutout(benchtop.id, i)}
                className="text-red-500 hover:text-red-400 ml-2">✕</button>
            </div>
          ))}
        </div>

        {/* Notes */}
        <div className="border-t border-gray-800 pt-3">
          <label className={lbl}>Notes</label>
          <textarea
            defaultValue={benchtop.notes ?? ''}
            onBlur={e => void onUpdate(benchtop.id, { notes: e.target.value || null })}
            rows={2}
            className={inp + ' resize-none'}
          />
        </div>

        {/* ── Resolver ── */}
        <div className="border-t border-gray-800 pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className={lbl}>Parts List</p>
            {parts.length > 0 && (
              <span className="text-[10px] text-teal-500">{parts.length} parts</span>
            )}
          </div>
          <button
            onClick={handleResolve}
            disabled={resolving}
            className="w-full px-3 py-1.5 rounded text-xs font-medium bg-teal-700 hover:bg-teal-600 text-white disabled:opacity-50 transition-colors"
          >
            {resolving ? 'Resolving…' : 'Resolve Parts'}
          </button>
          {edgesChanged && parts.length > 0 && !resolving && (
            <p className="text-[10px] text-amber-400">Edges changed — Resolve Parts to update the cut list.</p>
          )}
          {resolveError && (
            <p className="text-[10px] text-red-400">{resolveError}</p>
          )}

          {parts.length > 0 && (
            <div className="space-y-1 pt-1">
              {parts.map((p, i) => (
                <div key={i} className="bg-gray-800 rounded px-2 py-1.5 text-[10px]">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium text-gray-300 truncate">{p.label}</span>
                    {p.supply_item && <span className="text-amber-400 shrink-0" title="Supplied by others — order item, not cut in-house">supply</span>}
                    {p.quantity > 1 && <span className="text-teal-500 shrink-0">×{p.quantity}</span>}
                  </div>
                  <div className="text-gray-500 mt-0.5">
                    {p.length_mm} × {p.width_mm} × {p.thickness_mm} mm
                    {p.outline && <span className="ml-1 text-sky-400" title="Shaped piece — cut to its outline; the size is the overall extent">shaped</span>}
                    {p.edgebands && Object.keys(p.edgebands.sides).length > 0 && (
                      <span className="ml-1 text-amber-300" title="Edges taped on the cut list">taped {Object.keys(p.edgebands.sides).length}</span>
                    )}
                  </div>
                  {p.meta && (p.meta.area_m2 != null || (p.meta.cutouts?.length ?? 0) > 0) && (
                    <div className="text-gray-600">
                      {p.meta.area_m2 != null && <>{p.meta.area_m2} m²</>}
                      {Object.entries(p.meta.profiles ?? {}).map(([code, mm]) => <span key={code}> · {code} {(mm / 1000).toFixed(2)} lm</span>)}
                      {(p.meta.cutouts?.length ?? 0) > 0 && <> · {p.meta.cutouts!.length} cutout{p.meta.cutouts!.length > 1 ? 's' : ''}</>}
                      {(p.meta.joins?.length ?? 0) > 0 && <> · {p.meta.joins!.map(j => j.type).join(', ')} join</>}
                    </div>
                  )}
                  {(p.material_name ?? p.benchtop_material_name) && (
                    <div className="text-gray-600 truncate">
                      {p.material_name ?? p.benchtop_material_name}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
      <PanelDeleteButton label="Delete benchtop" onDelete={() => onDelete(benchtop.id)} />
    </div>
  )
}
