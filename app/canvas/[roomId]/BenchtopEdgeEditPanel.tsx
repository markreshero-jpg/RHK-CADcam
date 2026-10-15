'use client'
// Edit edges panel (benchtop Phase 7b). Mark (2026-10-14): right-click a top →
// Edit edges, so the normal side bar stays short. Two tabs that work the same
// way — pick a chip, then click edges (here on the drawing or on the plan):
//   Profiles  edge profiles (ARR, waterfall, apron…) + Wall; Butt / Mitre for
//             a clicked waterfall edge
//   Tape      edge tape (in-house board tops only)
// Clicking an edge that already has the picked chip takes it back off; Alt-click
// or the ↺ dot = back to the default. Default drawn faded, hand-set solid.
// Enter / ✓ saves (one canvas undo step), Esc cancels, Ctrl+Z undoes inside.
// Built to be reused for cabinet parts later (same look and feel).

import { useMemo, useState } from 'react'
import type { BenchtopInstance, BenchtopSegment, BenchtopEdgeProfile } from '@/src/lib/types'
import { segPoint, outwardNormal, segLength, edgeProfileColor, effectiveProfileId, waterfallJoin } from '@/src/lib/benchtopGeometry'
import { tapeable, edgeTape, tapeOverridden, tapeTotals, setTapes, setProfiles, tapeColour } from '@/src/lib/benchtopEdgeband'
import { btLocal, type BtShapeEdit, type BtEdgeEdit } from './canvasTypes'
import type { BtTape, BtTapeContext } from './useBenchtopCatalog'

type Segs = BenchtopSegment[]
const W = 256, PAD = 22, PADX = 30
const btn = 'px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-40'

export default function BenchtopEdgeEditPanel({
  benchtop, edit, frame, profiles, defaultProfileId, tapes, tapeCtx, legHeight, edgeThickness,
  onPaint, onApply, onUi, onHover, onSave, onCancel, onUndo,
}: {
  benchtop: BenchtopInstance
  edit: BtEdgeEdit
  frame: BtShapeEdit['frame']
  profiles: BenchtopEdgeProfile[]
  defaultProfileId: string | null
  tapes: BtTape[]
  tapeCtx: BtTapeContext
  /** Waterfall leg length — its upright edges count in the tape totals. */
  legHeight: number
  /** Finished edge thickness — a narrower tape gets a warning. */
  edgeThickness: number
  onPaint: (i: number, reset: boolean) => void
  onApply: (fn: (segs: Segs) => Segs) => void
  onUi: (patch: Partial<Pick<BtEdgeEdit, 'tab' | 'profilePaint' | 'tapePaint' | 'sel'>>) => void
  onHover: (i: number | null) => void
  onSave: () => void
  onCancel: () => void
  onUndo: () => void
}) {
  const { segs, tab, sel } = edit
  const profileById = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles])
  const tapeById = useMemo(() => new Map(tapes.map(t => [t.id, t])), [tapes])
  const tapeIds = useMemo(() => tapes.map(t => t.id), [tapes])
  const profileOf = (s: BenchtopSegment) => { const id = effectiveProfileId(s, defaultProfileId); return id ? profileById.get(id) : undefined }
  const [hover, setHover] = useState<number | null>(null)
  const hov = (i: number | null) => { setHover(i); onHover(i) }

  const exposed = segs.map((_, i) => i).filter(i => !segs[i].edge?.wall && !segs[i].edge?.joint)
  const isFront = (i: number) => { const n = outwardNormal(segs, i); return n.x * frame.n.x + n.y * frame.n.y > 0.7 }
  const quick = (label: string, title: string, fn: () => void, disabled = false) => (
    <button key={label} onClick={fn} disabled={disabled} title={title}
      className="px-1.5 py-0.5 rounded text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-40">{label}</button>
  )

  // ── Per-tab look of each edge ──
  const curTape = segs.map(s => (tapeCtx.applies ? edgeTape(s, profileOf(s), tapeCtx.defaultTape) : null))
  const canTape = segs.map(s => tapeCtx.applies && tapeable(s, profileOf(s)))
  const look = (i: number): { col: string; width: number; faded: boolean; dashed: boolean; set: boolean; label: string; clickable: boolean } => {
    const s = segs[i]
    const wall = !!s.edge?.wall
    // A joint with another top (Phase 7c): shown, never painted.
    if (s.edge?.joint) return { col: '#ef4444', width: 2, faded: false, dashed: true, set: false, label: s.edge.joint === 'mitre' ? 'joint M' : 'joint B', clickable: false }
    if (tab === 'profile') {
      const prof = profileOf(s)
      const label = wall ? 'wall' : prof ? (prof.code ?? prof.name) + (prof.generates === 'waterfall' ? (waterfallJoin(s) === 'mitre' ? ' ▼M' : ' ▼B') : '') : String(i + 1)
      if (wall) return { col: '#6b7280', width: 2, faded: false, dashed: true, set: false, label, clickable: true }
      return { col: prof ? edgeProfileColor(prof) : '#6b7280', width: prof ? 5 : 1.5, faded: !s.edge?.profile_id, dashed: false, set: !!s.edge?.profile_id, label, clickable: true }
    }
    const t = curTape[i]
    if (wall) return { col: '#4b5563', width: 2, faded: false, dashed: true, set: false, label: String(i + 1), clickable: false }
    if (!canTape[i]) return { col: '#a855f7', width: 1.5, faded: false, dashed: false, set: false, label: 'WF', clickable: false }
    return { col: t ? tapeColour(t, tapeIds) : '#6b7280', width: t ? 5 : 1.5, faded: !tapeOverridden(s), dashed: false, set: tapeOverridden(s), label: String(i + 1), clickable: true }
  }

  // ── Drawing: the top in its wall frame (back at the top), fitted to W ──
  const local = segs.map(s => (s.type === 'line' ? [0, 1] : Array.from({ length: 13 }, (_, k) => k / 12)).map(t => btLocal(frame, segPoint(s, t))))
  const all = local.flat()
  const minX = Math.min(...all.map(p => p.x)), maxX = Math.max(...all.map(p => p.x))
  const minY = Math.min(...all.map(p => p.y)), maxY = Math.max(...all.map(p => p.y))
  const k = Math.min((W - 2 * PADX) / Math.max(1, maxX - minX), 110 / Math.max(1, maxY - minY))
  const H = Math.round((maxY - minY) * k + 2 * PAD)
  const ox = (W - (maxX - minX) * k) / 2
  const px = (p: { x: number; y: number }) => ({ x: ox + (p.x - minX) * k, y: PAD + (p.y - minY) * k })
  const pathOf = (i: number) => local[i].map(px).map((p, j) => `${j ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const ln = (v: { x: number; y: number }) => ({ x: v.x * frame.d.x + v.y * frame.d.y, y: v.x * frame.n.x + v.y * frame.n.y })

  const showDrawing = tab === 'profile' || tapeCtx.applies

  return (
    <div className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-gray-800">
        <p className="text-xs font-medium text-amber-300">Edit edges — {benchtop.label ?? 'Benchtop'}</p>
        <p className="text-[10px] text-gray-500">{segs.length} edges · {exposed.length} exposed</p>
        <div className="flex gap-1.5 mt-2">
          <button onClick={onSave} className="flex-1 px-2 py-1 rounded text-xs bg-teal-600 hover:bg-teal-500 text-white" title="Enter">✓ Done</button>
          <button onClick={onCancel} className={btn} title="Esc — discard the changes">Cancel</button>
          <button onClick={onUndo} disabled={!edit.history.length} className={btn} title="Ctrl+Z — undo the last change in this edit">↶</button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Tabs */}
        <div className="flex rounded overflow-hidden border border-gray-700 text-xs">
          {([['profile', 'Profiles'], ['tape', 'Tape']] as const).map(([t, label]) => (
            <button key={t} onClick={() => onUi({ tab: t })}
              className={`flex-1 py-1 ${tab === t ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>{label}</button>
          ))}
        </div>

        {showDrawing ? (
          <svg width={W} height={H} className="block bg-gray-950 rounded border border-gray-800" onMouseLeave={() => hov(null)}>
            {segs.map((s, i) => {
              const L = look(i)
              const mid = px(btLocal(frame, segPoint(s, 0.5)))
              const nl = ln(outwardNormal(segs, i))
              return (
                <g key={i} onMouseEnter={() => hov(i)} onClick={e => { if (L.clickable) onPaint(i, e.altKey) }}
                  style={{ cursor: L.clickable ? 'pointer' : 'not-allowed' }}>
                  {(hover === i || sel === i) && L.clickable && (
                    <path d={pathOf(i)} fill="none" stroke="#ffffff" strokeOpacity={hover === i ? 0.35 : 0.18} strokeWidth={11} strokeLinecap="round" />
                  )}
                  <path d={pathOf(i)} fill="none" stroke={L.col} strokeWidth={L.width} strokeOpacity={L.faded && L.width > 2 ? 0.55 : 1}
                    strokeDasharray={L.dashed ? '4 3' : undefined} strokeLinecap="round" />
                  <path d={pathOf(i)} fill="none" stroke="transparent" strokeWidth={16} />
                  {/* kept inside the drawing (a left / right edge's label would be cut off) */}
                  <text x={Math.max(L.label.length * 2.4 + 2, Math.min(W - L.label.length * 2.4 - 2, mid.x + nl.x * 12))} y={mid.y + nl.y * 12 + 3} textAnchor="middle" fontSize={8}
                    fill={hover === i ? '#e5e7eb' : '#6b7280'} style={{ pointerEvents: 'none', userSelect: 'none' }}>
                    {L.label}
                  </text>
                  {L.set && (
                    <g onClick={e => { e.stopPropagation(); onPaint(i, true) }} style={{ cursor: 'pointer' }}>
                      <title>Set by hand — click to go back to the default</title>
                      <circle cx={mid.x - nl.x * 9} cy={mid.y - nl.y * 9} r={5.5} fill="#111827" stroke={L.col} strokeWidth={1} />
                      <text x={mid.x - nl.x * 9} y={mid.y - nl.y * 9 + 2.5} textAnchor="middle" fontSize={7} fill={L.col}>↺</text>
                    </g>
                  )}
                </g>
              )
            })}
          </svg>
        ) : (
          <p className="text-[10px] text-gray-500">Stone / supplied top — no edge tape. Tape applies to tops made in-house from board.</p>
        )}

        {tab === 'profile' ? (
          <ProfileTab segs={segs} edit={edit} profiles={profiles} profileById={profileById} defaultProfileId={defaultProfileId}
            profileOf={profileOf} exposed={exposed} isFront={isFront} quick={quick} onApply={onApply} onUi={onUi} />
        ) : tapeCtx.applies ? (
          <TapeTab segs={segs} edit={edit} tapes={tapes} tapeById={tapeById} tapeIds={tapeIds} tapeCtx={tapeCtx}
            profileOf={profileOf} canTape={canTape} curTape={curTape} isFront={isFront} quick={quick}
            legHeight={legHeight} edgeThickness={edgeThickness} onApply={onApply} onUi={onUi} />
        ) : null}

        <p className="text-[10px] text-gray-600 leading-snug">
          Pick a chip, then click edges — here or on the plan. Click again to take it off · Alt-click / ↺ = back to the default.
          Back is at the top · dashed = wall · faded = default.
        </p>
      </div>
    </div>
  )
}

type Quick = (label: string, title: string, fn: () => void, disabled?: boolean) => React.ReactNode
type Ui = (patch: Partial<Pick<BtEdgeEdit, 'tab' | 'profilePaint' | 'tapePaint' | 'sel'>>) => void
const chipCls = (on: boolean) =>
  `flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${on ? 'border-amber-500 bg-gray-800 text-white' : 'border-gray-700 text-gray-400 hover:text-gray-200'}`

function ProfileTab({ segs, edit, profiles, profileById, defaultProfileId, profileOf, exposed, isFront, quick, onApply, onUi }: {
  segs: Segs; edit: BtEdgeEdit; profiles: BenchtopEdgeProfile[]; profileById: Map<string, BenchtopEdgeProfile>
  defaultProfileId: string | null; profileOf: (s: BenchtopSegment) => BenchtopEdgeProfile | undefined
  exposed: number[]; isFront: (i: number) => boolean; quick: Quick; onApply: (fn: (s: Segs) => Segs) => void; onUi: Ui
}) {
  const paint = edit.profilePaint
  const def = defaultProfileId ? profileById.get(defaultProfileId) : undefined
  // Chips: Default, Wall, the profiles on this top, the one picked.
  const used = [...new Set([...(paint && paint !== 'wall' ? [paint] : []), ...segs.map(s => s.edge?.profile_id).filter((x): x is string => !!x)])]
  const lineal = new Map<string, number>()
  for (const s of segs) { const p = profileOf(s); if (p && !s.edge?.wall) lineal.set(p.id, (lineal.get(p.id) ?? 0) + segLength(s)) }
  const selSeg = edit.sel != null ? segs[edit.sel] : undefined
  const selProf = selSeg && !selSeg.edge?.wall ? profileOf(selSeg) : undefined

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        <button onClick={() => onUi({ profilePaint: '' })} className={chipCls(paint === '')} title="The build method's default profile">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: edgeProfileColor(def) }} />
          Default{def ? ` (${def.code ?? def.name})` : ''}
        </button>
        <button onClick={() => onUi({ profilePaint: 'wall' })} className={chipCls(paint === 'wall')} title="Against a wall — no profile, no tape">
          <span className="w-2.5 h-0.5 shrink-0 border-t border-dashed border-gray-400" />Wall
        </button>
        {used.map(id => {
          const p = profileById.get(id)
          return (
            <button key={id} onClick={() => onUi({ profilePaint: id })} className={chipCls(paint === id)}>
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: edgeProfileColor(p) }} />
              <span className="truncate max-w-[9rem]">{p ? (p.code ? `${p.code} — ${p.name}` : p.name) : 'Unknown'}</span>
            </button>
          )
        })}
        <select value="" onChange={e => { if (e.target.value) onUi({ profilePaint: e.target.value }) }}
          className="bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-300 max-w-[7rem]" title="Add a profile to paint with">
          <option value="">+ Profile…</option>
          {(['stone', 'board', 'postform'] as const).map(cat => (
            <optgroup key={cat} label={cat}>
              {profiles.filter(p => p.active && p.category === cat).map(p => <option key={p.id} value={p.id}>{p.code ? `${p.code} — ` : ''}{p.name}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-1 items-center">
        <span className="text-[10px] text-gray-500 mr-0.5">Quick</span>
        {quick('All', 'Every exposed edge gets the picked profile', () => onApply(s => setProfiles(s, exposed, paint)), paint === 'wall')}
        {quick('Front', 'Only the front edges (facing away from the wall)', () => onApply(s => setProfiles(s, exposed.filter(isFront), paint)), paint === 'wall')}
        {quick('Default', 'Every exposed edge back to the method default', () => onApply(s => setProfiles(s, exposed, '')))}
      </div>

      {selProf?.generates === 'waterfall' && (
        <div className="flex items-center gap-1 text-[10px] border border-purple-800/60 rounded p-1.5">
          <span className="text-purple-300 flex-1">Edge {edit.sel! + 1} waterfall leg</span>
          {(['butt', 'mitre'] as const).map(t => (
            <button key={t} onClick={() => onApply(s => s.map((x, i) => (i === edit.sel ? { ...x, edge: { ...x.edge, waterfall_join: t } } : x)))}
              title={t === 'mitre' ? 'Leg runs to the top surface, 45° corner' : 'The top sits on the leg'}
              className={`px-1.5 py-0.5 rounded ${waterfallJoin(selSeg!) === t ? 'bg-purple-800 text-purple-100' : 'text-gray-400 hover:bg-gray-800'}`}>
              {t === 'butt' ? 'Butt' : 'Mitre'}
            </button>
          ))}
        </div>
      )}

      {lineal.size > 0 && (
        <div className="text-[10px] space-y-0.5">
          {[...lineal.entries()].map(([id, mm]) => {
            const p = profileById.get(id)
            return (
              <div key={id} className="flex justify-between text-gray-400">
                <span className="flex items-center gap-1 truncate">
                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: edgeProfileColor(p) }} />
                  {p ? p.name : 'Unknown profile'}{p?.generates === 'waterfall' ? ' (waterfall)' : p?.generates === 'apron' ? ' (apron)' : ''}
                </span>
                <span className="text-gray-300 shrink-0 ml-2">{(mm / 1000).toFixed(2)} lm</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TapeTab({ segs, edit, tapes, tapeById, tapeIds, tapeCtx, profileOf, canTape, curTape, isFront, quick, legHeight, edgeThickness, onApply, onUi }: {
  segs: Segs; edit: BtEdgeEdit; tapes: BtTape[]; tapeById: Map<string, BtTape>; tapeIds: string[]; tapeCtx: BtTapeContext
  profileOf: (s: BenchtopSegment) => BenchtopEdgeProfile | undefined; canTape: boolean[]; curTape: (string | null)[]
  isFront: (i: number) => boolean; quick: Quick; legHeight: number; edgeThickness: number
  onApply: (fn: (s: Segs) => Segs) => void; onUi: Ui
}) {
  const paint = edit.tapePaint   // seeded at start: the default tape, or the first one in use
  const chipIds = [...new Set([...(paint ? [paint] : []), ...curTape.filter((t): t is string => !!t)])]
  const totals = tapeTotals(segs, profileOf, tapeCtx.defaultTape, legHeight)
  const taps = segs.map((_, i) => i).filter(i => canTape[i])
  const def = tapeCtx.defaultTape

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {chipIds.map(id => {
          const t = tapeById.get(id)
          return (
            <button key={id} onClick={() => onUi({ tapePaint: id })} className={chipCls(paint === id)}
              title={paint === id ? 'Painting with this tape — click edges' : 'Pick this tape, then click edges'}>
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: tapeColour(id, tapeIds) }} />
              <span className="truncate max-w-[9rem]">{t ? t.name : 'Unknown tape'}</span>
              {t && <span className="text-gray-500">{t.thickness}mm</span>}
            </button>
          )
        })}
        <select value="" onChange={e => { if (e.target.value) onUi({ tapePaint: e.target.value }) }}
          className="bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-300 max-w-[7rem]" title="Add a tape to paint with">
          <option value="">+ Tape…</option>
          {tapes.map(t => <option key={t.id} value={t.id}>{t.name} ({t.thickness}mm)</option>)}
        </select>
      </div>

      <div className="flex flex-wrap gap-1 items-center">
        <span className="text-[10px] text-gray-500 mr-0.5">Quick</span>
        {quick('All', 'Tape every exposed edge with the picked tape', () => onApply(s => setTapes(s, taps, paint, def)), !paint)}
        {quick('Front', 'Tape only the front edges (facing away from the wall)', () =>
          onApply(s => setTapes(setTapes(s, taps.filter(isFront), paint, def), taps.filter(i => !isFront(i)), null, def)), !paint)}
        {quick('None', 'Take tape off every edge', () => onApply(s => setTapes(s, taps, null, def)))}
        {quick('Default', 'Back to the schedule tape on every edge', () => onApply(s => setTapes(s, taps, undefined, def)))}
      </div>

      {totals.size > 0 ? (
        <div className="text-[10px] space-y-0.5">
          {[...totals.entries()].map(([id, mm]) => {
            const t = tapeById.get(id)
            const narrow = t?.width != null && t.width < edgeThickness
            return (
              <div key={id}>
                <div className="flex justify-between text-gray-400">
                  <span className="flex items-center gap-1 truncate">
                    <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: tapeColour(id, tapeIds) }} />
                    {t?.name ?? 'Unknown tape'}
                  </span>
                  <span className="text-gray-300 shrink-0 ml-2">{(mm / 1000).toFixed(2)} m</span>
                </div>
                {narrow && <p className="text-amber-400">⚠ {t!.width}mm wide — the edge is {Math.round(edgeThickness)}mm</p>}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-[10px] text-gray-600">No edges taped.{!def && ' The schedule has no tape for this top — pick one with + Tape.'}</p>
      )}
    </div>
  )
}
