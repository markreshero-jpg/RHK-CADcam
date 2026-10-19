'use client'

// ============================================================
// Auto-build benchtops (F4 → Auto-build tops…, BENCHTOP-SPEC
// Phase 8). A click-through: general answers (overhangs, gap
// bridging, corner joint) → each top (build it?, front / end
// overhangs, waterfall ends) → each corner (Mitre / Butt, which runs through)
// → review → Build. The plan drawing updates live; "Build now"
// skips the click-through from any page. Enter = next / build,
// Esc = cancel.
// ============================================================

import { useState, useEffect, useMemo } from 'react'
import type { Wall, CabinetInstance, BenchtopInstance, BenchtopSegment, RoomFixture, BenchtopEdgeProfile } from '@/src/lib/types'
import { centroid, wallEnd } from '@/src/lib/geometry'
import { cabinetCorners } from '@/src/lib/canvasSnap'
import { outlinePath, outlinePoints, btSegments } from '@/src/lib/benchtopGeometry'
import {
  planAutoBuild, type AutoBuildSettings, type TopOverride, type EndKind, type AutoTop, type AutoCorner,
} from '@/src/lib/benchtopAutoBuild'
import type { JoinChoice } from '@/src/lib/benchtopJoinTops'

const END_TEXT: Record<EndKind, string> = {
  open: 'open end', wall: 'against a wall', corner: 'corner joint', tee: 'butts into another top',
  tall: 'against a tall cabinet', appliance: 'against an appliance',
}

type Page = { k: 'settings' } | { k: 'top'; i: number } | { k: 'corner'; i: number } | { k: 'review' }

export default function BenchtopAutoBuildDialog({
  walls, cabinets, fixtures, benchtops, cabIds, defaultFront, profiles, defaultProfileId, thickness, onBuild, onCancel,
}: {
  walls: Wall[]
  cabinets: CabinetInstance[]
  fixtures: RoomFixture[]
  benchtops: BenchtopInstance[]
  /** Selected cabinets to build over; empty = the whole room. */
  cabIds: string[]
  /** Front overhang from the handle schedule (40 handles / 25 finger pulls). */
  defaultFront: number
  /** Edge profile library (waterfall + exposed-edge picks). */
  profiles: BenchtopEdgeProfile[]
  /** The build method's default edge profile — its category picks the waterfall profile. */
  defaultProfileId: string | null
  /** Top thickness (a waterfall leg's too) — how far a waterfall end runs past the cabinets. */
  thickness: number
  onBuild: (tops: BenchtopSegment[][]) => void
  onCancel: () => void
}) {
  const wfProfiles = profiles.filter(p => p.active !== false && p.generates === 'waterfall')
  const edgeProfiles = profiles.filter(p => p.active !== false && p.generates !== 'waterfall')
  const cat = profiles.find(p => p.id === defaultProfileId)?.category
  const [s, setS] = useState<AutoBuildSettings>({
    frontOverhang: defaultFront, endOverhang: 0, bridgeGap: 650, corner: 'mitre', islandBackOverhang: 0, skipCovered: true,
    waterfall: 'none', waterfallJoin: 'mitre', waterfallOverhang: thickness, edgeProfileId: null,
    waterfallProfileId: (wfProfiles.find(p => p.category === cat) ?? wfProfiles[0])?.id ?? null,
  })
  const [ov, setOv] = useState<Record<string, TopOverride>>({})
  const [picks, setPicks] = useState<Record<string, JoinChoice | undefined>>({})
  const [page, setPage] = useState<Page>({ k: 'settings' })

  const r = useMemo(
    () => planAutoBuild({ walls, cabinets, fixtures, benchtops, cabIds }, s, ov, picks),
    [walls, cabinets, fixtures, benchtops, cabIds, s, ov, picks],
  )
  const building = r.tops.filter(t => !t.skip && t.segs.length >= 3)
  const num = (key: string) => r.tops.findIndex(t => t.key === key) + 1
  const name = (key: string) => `Top ${num(key)}`

  // Page order: settings → tops → corners → review.
  const pages: Page[] = useMemo(() => [
    { k: 'settings' },
    ...r.tops.map((_, i) => ({ k: 'top' as const, i })),
    ...r.corners.map((_, i) => ({ k: 'corner' as const, i })),
    { k: 'review' },
  ], [r.tops, r.corners])
  const at = Math.max(0, pages.findIndex(p => p.k === page.k && (!('i' in p) || ('i' in page && p.i === page.i))))
  const cur = pages[at] ?? pages[0]
  const last = at === pages.length - 1
  const build = () => { if (building.length) onBuild(building.map(t => t.segs)) }
  const next = () => (last ? build() : setPage(pages[at + 1]))
  const back = () => setPage(pages[Math.max(0, at - 1)])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); next() }
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onCancel() }
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  })

  const curTop: AutoTop | null = cur.k === 'top' ? r.tops[cur.i] ?? null : null
  const curCorner: AutoCorner | null = cur.k === 'corner' ? r.corners[cur.i] ?? null : null
  const hot = new Set(curTop ? [curTop.key] : curCorner ? [curCorner.a, curCorner.b] : r.tops.map(t => t.key))
  const setTop = (key: string, o: TopOverride) => setOv(m => ({ ...m, [key]: { ...m[key], ...o } }))

  // Drawing frame: the tops (else the walls), padded.
  const cx = centroid(walls)
  const framePts = r.tops.length ? r.tops.flatMap(t => outlinePoints(t.segs, 4)) : walls.flatMap(w => [{ x: w.pos_x, y: w.pos_y }, wallEnd(w)])
  const xs = framePts.map(p => p.x), ys = framePts.map(p => p.y)
  const minX = Math.min(...xs, 0), minY = Math.min(...ys, 0)
  const w = Math.max(...xs, 1) - minX, h = Math.max(...ys, 1) - minY
  const pad = Math.max(w, h) * 0.06 + 150
  const vb = `${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`
  const fs = Math.max(w, h) / 26

  const selectCls = 'bg-surface-3 border border-edge rounded px-2 py-1 text-ink outline-none focus:border-accent max-w-[14rem]'
  const chip = (on: boolean) =>
    `px-2.5 py-1 text-xs rounded-lg border transition-colors ${on ? 'bg-accent border-accent text-white' : 'bg-surface-3 border-edge text-ink-muted hover:text-ink'}`
  const numField = (label: string, value: number | undefined, placeholder: number | undefined, set: (v: number | undefined) => void, hint?: string) => (
    <label className="flex items-center gap-2 text-xs text-ink-muted">
      <span className="w-40 shrink-0">{label}</span>
      <input
        type="number" value={value ?? ''} placeholder={placeholder != null ? String(placeholder) : ''}
        onChange={e => set(e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)))}
        className="w-20 bg-surface-3 border border-edge rounded px-2 py-1 text-ink text-right outline-none focus:border-accent"
      />
      <span>mm</span>
      {hint && <span className="text-ink-subtle">{hint}</span>}
    </label>
  )
  const choiceLabel = (c: JoinChoice, k: AutoCorner) =>
    c === 'butt_a' ? `Butt — ${name(k.a)} runs through` : c === 'butt_b' ? `Butt — ${name(k.b)} runs through` : c === 'mitre' ? 'Mitre' : 'Butt'

  const title = cur.k === 'settings' ? 'Auto-build benchtops'
    : cur.k === 'top' ? `${name(r.tops[cur.i]?.key ?? '')} of ${r.tops.length}`
      : cur.k === 'corner' ? `Corner ${cur.i + 1} of ${r.corners.length}` : 'Ready to build'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onPointerDown={onCancel}>
      <div className="bg-surface border border-edge-strong rounded-xl shadow-2xl w-[34rem] max-w-full p-5 flex flex-col gap-4"
        onPointerDown={e => e.stopPropagation()}>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="text-[11px] text-ink-subtle">step {at + 1} of {pages.length}</p>
        </div>

        <svg viewBox={vb} className="w-full h-60 bg-surface-2 rounded-lg border border-edge">
          {walls.map(wl => {
            const e = wallEnd(wl)
            return <line key={wl.id} x1={wl.pos_x} y1={wl.pos_y} x2={e.x} y2={e.y} stroke="#6b7280"
              strokeWidth={wl.wall_type === 'island' ? 1 : 4} strokeDasharray={wl.wall_type === 'island' ? '6 4' : undefined} vectorEffect="non-scaling-stroke" />
          })}
          {cabinets.filter(c => !c.is_kick_assembly).map(c => {
            const wl = walls.find(x => x.id === c.wall_id)
            if (!wl) return null
            const pts = cabinetCorners(c, wl, cx)
            return <polygon key={c.id} points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill="none"
              stroke={c.assembly_class.startsWith('tall') ? '#9ca3af' : '#4b5563'} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          })}
          {benchtops.map(b => (
            <path key={b.id} d={outlinePath(btSegments(b))} fill="rgba(107,114,128,0.15)" stroke="#6b7280" strokeDasharray="4 3"
              strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {r.tops.map(t => {
            const on = hot.has(t.key)
            return (
              <path key={t.key} d={outlinePath(t.segs)}
                fill={t.skip ? 'none' : on ? 'rgba(20,184,166,0.30)' : 'rgba(20,184,166,0.10)'}
                stroke={t.skip ? '#6b7280' : on ? '#14b8a6' : '#0f766e'} strokeDasharray={t.skip ? '6 4' : undefined}
                strokeWidth={on ? 2 : 1} vectorEffect="non-scaling-stroke" />
            )
          })}
          {r.tops.flatMap(t => t.skip ? [] : t.segs.filter(q => q.edge?.wall).map((q, n) => (
            <path key={`w${t.key}-${n}`} d={`M ${q.p0.x} ${q.p0.y} L ${q.p1.x} ${q.p1.y}`} stroke="#9ca3af" strokeWidth={2}
              strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
          )))}
          {r.tops.flatMap(t => t.skip ? [] : t.segs.filter(q => q.edge?.joint).map((q, n) => (
            <path key={`j${t.key}-${n}`} d={`M ${q.p0.x} ${q.p0.y} L ${q.p1.x} ${q.p1.y}`} stroke="#ef4444" strokeWidth={3}
              vectorEffect="non-scaling-stroke" />
          )))}
          {r.tops.flatMap(t => t.skip ? [] : t.segs.filter(q => q.edge?.waterfall_join && q.edge.profile_id === s.waterfallProfileId).map((q, n) => (
            <path key={`f${t.key}-${n}`} d={`M ${q.p0.x} ${q.p0.y} L ${q.p1.x} ${q.p1.y}`} stroke="#c084fc" strokeWidth={5}
              vectorEffect="non-scaling-stroke" />
          )))}
          {r.tops.map(t => {
            const pts = outlinePoints(t.segs, 4)
            const c = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 })
            return (
              <text key={`l${t.key}`} x={c.x} y={c.y} fontSize={fs} fill={hot.has(t.key) ? '#5eead4' : '#6b7280'} fontWeight={600}
                textAnchor="middle" dominantBaseline="middle" stroke="#111827" strokeWidth={fs * 0.12} paintOrder="stroke">
                {num(t.key)}
              </text>
            )
          })}
        </svg>

        {cur.k === 'settings' && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-ink-muted">
              One top per run of base cabinets — {cabIds.length ? `over the ${cabIds.length} selected cabinet${cabIds.length === 1 ? '' : 's'}` : 'over every base cabinet in this room'}.
              Corners become joints between separate tops. You can check each top and corner next.
            </p>
            {numField('Front overhang', s.frontOverhang, undefined, v => setS({ ...s, frontOverhang: v ?? 0 }), 'from the carcase front')}
            {numField('Open end overhang', s.endOverhang, undefined, v => setS({ ...s, endOverhang: v ?? 0 }), 'ends not against anything')}
            {numField('Bridge gaps up to', s.bridgeGap, undefined, v => setS({ ...s, bridgeGap: v ?? 0 }), 'e.g. freestanding D/W')}
            {numField('Island back overhang', s.islandBackOverhang, undefined, v => setS({ ...s, islandBackOverhang: v ?? 0 }), 'one-sided islands')}
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <span className="w-40 shrink-0">Corner joints</span>
              <button className={chip(s.corner === 'mitre')} onClick={() => setS({ ...s, corner: 'mitre' })}>Mitre</button>
              <button className={chip(s.corner === 'butt')} onClick={() => setS({ ...s, corner: 'butt' })}>Butt — longer top runs through</button>
            </div>
            {s.waterfallProfileId ? (<>
              <div className="flex items-center gap-2 text-xs text-ink-muted">
                <span className="w-40 shrink-0">Waterfall ends</span>
                <button className={chip(s.waterfall === 'none')} onClick={() => setS({ ...s, waterfall: 'none' })}>None</button>
                <button className={chip(s.waterfall === 'island')} onClick={() => setS({ ...s, waterfall: 'island' })}>Island / peninsula ends</button>
                <button className={chip(s.waterfall === 'open')} onClick={() => setS({ ...s, waterfall: 'open' })}>Every open end</button>
              </div>
              {s.waterfall !== 'none' && (<>
                <div className="flex items-center gap-2 text-xs text-ink-muted">
                  <span className="w-40 shrink-0">Waterfall joint</span>
                  <button className={chip(s.waterfallJoin === 'mitre')} onClick={() => setS({ ...s, waterfallJoin: 'mitre' })}>Mitre</button>
                  <button className={chip(s.waterfallJoin === 'butt')} onClick={() => setS({ ...s, waterfallJoin: 'butt' })}>Butt — top sits on the leg</button>
                </div>
                {wfProfiles.length > 1 && (
                  <label className="flex items-center gap-2 text-xs text-ink-muted">
                    <span className="w-40 shrink-0">Waterfall profile</span>
                    <select value={s.waterfallProfileId} onChange={e => setS({ ...s, waterfallProfileId: e.target.value })} className={selectCls}>
                      {wfProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                )}
                {numField('Waterfall end overhang', s.waterfallOverhang, undefined, v => setS({ ...s, waterfallOverhang: v ?? 0 }), 'the leg thickness')}
              </>)}
            </>) : (
              <p className="text-xs text-ink-subtle">No waterfall edge profile in the library — add one in Settings → Benchtop Builder → Edge Profiles for waterfall ends.</p>
            )}
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              <span className="w-40 shrink-0">Edge profile</span>
              <select value={s.edgeProfileId ?? ''} onChange={e => setS({ ...s, edgeProfileId: e.target.value || null })} className={selectCls}>
                <option value="">Build method default</option>
                {edgeProfiles.map(p => <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}
              </select>
              <span className="text-ink-subtle">exposed edges</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              <input type="checkbox" checked={s.skipCovered} onChange={e => setS({ ...s, skipCovered: e.target.checked })} />
              Skip cabinets that already have a top
            </label>
          </div>
        )}

        {curTop && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-ink-muted">
              {curTop.wallName}{curTop.island ? ' (island)' : ''} · {curTop.length} × {curTop.depth} · {curTop.cabIds.length} cabinet{curTop.cabIds.length === 1 ? '' : 's'}
            </p>
            <label className="flex items-center gap-2 text-xs text-ink">
              <input type="checkbox" checked={!curTop.skip} onChange={e => setTop(curTop.key, { skip: !e.target.checked })} />
              Build this top
            </label>
            {!curTop.skip && (<>
              {numField('Front overhang', ov[curTop.key]?.front, s.frontOverhang, v => setTop(curTop.key, { front: v }))}
              {(['left', 'right'] as const).map((side, e) => curTop.ends[e] === 'open'
                ? (
                  <div key={side} className="flex items-center gap-3">
                    {numField(`${side === 'left' ? 'Left' : 'Right'} end overhang`, ov[curTop.key]?.[side],
                      curTop.waterfall[e] ? s.waterfallOverhang : s.endOverhang, v => setTop(curTop.key, { [side]: v }))}
                    {s.waterfallProfileId && (
                      <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                        <input type="checkbox" checked={curTop.waterfall[e]}
                          onChange={ev => setTop(curTop.key, { [`${side}Waterfall`]: ev.target.checked })} />
                        Waterfall
                      </label>
                    )}
                  </div>
                )
                : (
                  <div key={side} className="flex items-center gap-2 text-xs text-ink-muted">
                    <span className="w-40 shrink-0">{side === 'left' ? 'Left' : 'Right'} end</span>
                    <span className="text-ink-subtle">{END_TEXT[curTop.ends[e]]} — no overhang</span>
                  </div>
                ))}
            </>)}
          </div>
        )}

        {curCorner && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-ink-muted">
              {name(curCorner.a)} ↔ {name(curCorner.b)}{curCorner.kind === 'T' ? ' · one top runs into the side of the other' : ''}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {curCorner.choices.map(c => (
                <button key={c} className={chip(curCorner.choice === c)}
                  onClick={() => setPicks(p => ({ ...p, [curCorner.key]: c }))}>
                  {choiceLabel(c, curCorner)}
                </button>
              ))}
            </div>
          </div>
        )}

        {cur.k === 'review' && (
          <div className="flex flex-col gap-1 text-xs text-ink-muted">
            {building.length
              ? <p>{building.length} top{building.length === 1 ? '' : 's'}, {r.corners.length} corner joint{r.corners.length === 1 ? '' : 's'}. Each is a separate benchtop — edit shape, edges and tape as usual afterwards.</p>
              : <p>Nothing to build.</p>}
            {building.map(t => (
              <p key={t.key} className="text-ink-subtle">
                {name(t.key)} — {t.wallName} · {t.length} × {t.depth}
                {t.waterfall.some(Boolean) ? ` · waterfall ${t.waterfall[0] && t.waterfall[1] ? 'both ends' : t.waterfall[0] ? 'left end' : 'right end'}` : ''}
              </p>
            ))}
          </div>
        )}

        {r.warnings.map(m => <p key={m} className="text-xs text-amber-400">{m}</p>)}

        <div className="flex gap-2 justify-end items-center">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded-lg bg-surface-3 text-ink-muted hover:text-ink mr-auto">Cancel</button>
          {at > 0 && <button onClick={back} className="px-3 py-1.5 text-xs rounded-lg bg-surface-3 text-ink-muted hover:text-ink">← Back</button>}
          {!last && (
            <button onClick={build} disabled={!building.length}
              className="px-3 py-1.5 text-xs rounded-lg bg-surface-3 text-ink-muted hover:text-ink disabled:opacity-40">
              Build now
            </button>
          )}
          <button onClick={next} disabled={last && !building.length}
            className="px-3 py-1.5 text-xs rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-40 disabled:cursor-not-allowed">
            {last ? `Build ${building.length} top${building.length === 1 ? '' : 's'} ↵` : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  )
}
