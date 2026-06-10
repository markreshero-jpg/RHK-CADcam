'use client'

// ============================================================
// Drill Block Setup  (Settings → CNC → CNC Machine Setup → machine)
// Graphical per-machine config of the physical drill block: the
// L-shaped spindle grid (12 along X / 8 along Y for the EVO49), each
// spindle individually assignable to a drill from cnc_drills. This is
// what makes gang-detection possible — the generator can only fire
// adjacent spindles that physically hold the same-diameter bit.
//
// Spindle 1 is the shared corner: it belongs to BOTH banks (X pos 1
// and Y pos 1 are one physical spindle), so assigning either updates
// both. Empty spindles are allowed and drawn in a muted outline.
// SVG only — matches the canvas/shape-editor rendering pattern.
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/src/lib/supabase'

interface DrillBlock {
  id: string
  cnc_machine_id: string
  name: string
  bank_x_count: number
  bank_y_count: number
  spacing_mm: number
  x_bank_mcode: string
  y_bank_mcode: string
  shared_corner: boolean
  head_offset_x_mm: number
  head_offset_y_mm: number
  work_offset_code: string
}
interface Spindle {
  id: string
  drill_block_id: string
  bank: 'x' | 'y'
  position: number
  bit_value: number
  drill_id: string | null
}
interface DrillItem { id: string; name: string; diameter: number | null }
interface MachineProfile { id: string; origin_corner: string; x_axis_direction: string; y_axis_direction: string }

const ORIGIN_CORNERS = ['bottom_left', 'bottom_right', 'top_left', 'top_right'] as const
const X_DIRS = ['positive_right', 'positive_left'] as const
const Y_DIRS = ['positive_up', 'positive_down'] as const

// Colour-code spindles by the diameter of the bit fitted, so gangable
// runs (same colour, adjacent) read at a glance. Stable mapping by the
// sorted set of diameters actually in the library.
const DIAMETER_COLOURS = [
  '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#a3e635', '#06b6d4',
]

const inp = 'bg-surface-2 border border-edge-strong rounded px-2 py-1 text-xs text-ink focus:outline-none focus:border-accent w-full'
const lbl = 'text-[10px] text-ink-subtle uppercase tracking-wide mb-1 block'

export default function DrillBlockSetup({ machineId }: { machineId: string }) {
  const [block, setBlock] = useState<DrillBlock | null>(null)
  const [spindles, setSpindles] = useState<Spindle[]>([])
  const [drills, setDrills] = useState<DrillItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [sel, setSel] = useState<{ bank: 'x' | 'y'; position: number } | null>(null)
  const [profile, setProfile] = useState<MachineProfile | null>(null)
  const [tableDx, setTableDx] = useState<number | null>(null)
  const [tableDy, setTableDy] = useState<number | null>(null)

  // Load inline in the effect (state updates land in async continuations after
  // the awaits, never synchronously in the effect body). The parent keys this
  // component by machine id, so a machine switch remounts it fresh.
  useEffect(() => {
    let cancelled = false
    async function load() {
      const [blkR, drillR, profR, machR] = await Promise.all([
        supabase.from('cnc_drill_blocks').select('*').eq('cnc_machine_id', machineId).eq('is_active', true).order('created_at').limit(1).maybeSingle(),
        supabase.from('cnc_drills').select('id,name,diameter').eq('is_active', true).order('diameter'),
        supabase.from('cnc_machine_profiles').select('id,origin_corner,x_axis_direction,y_axis_direction').eq('cnc_machine_id', machineId).order('is_default', { ascending: false }).order('name').limit(1).maybeSingle(),
        supabase.from('cnc_machines').select('table_dx,table_dy').eq('id', machineId).maybeSingle(),
      ])
      if (cancelled) return
      const blk = (blkR.data as DrillBlock | null) ?? null
      setBlock(blk)
      setDrills((drillR.data ?? []) as DrillItem[])
      setProfile((profR.data as MachineProfile | null) ?? null)
      setTableDx((machR.data?.table_dx as number | null) ?? null)
      setTableDy((machR.data?.table_dy as number | null) ?? null)
      if (blk) {
        const spR = await supabase.from('cnc_drill_block_spindles').select('*').eq('drill_block_id', blk.id).order('position')
        if (cancelled) return
        setSpindles((spR.data ?? []) as Spindle[])
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [machineId])

  // Diameter → colour, derived from the diameters present in the library.
  const diameterColour = useCallback((dia: number | null): string => {
    if (dia == null) return '#94a3b8'
    const uniq = [...new Set(drills.map(d => d.diameter).filter((x): x is number => x != null))].sort((a, b) => a - b)
    const i = uniq.indexOf(dia)
    return i < 0 ? '#94a3b8' : DIAMETER_COLOURS[i % DIAMETER_COLOURS.length]
  }, [drills])

  async function createBlock() {
    if (creating) return
    setCreating(true)
    const { data, error } = await supabase.from('cnc_drill_blocks')
      .insert({ cnc_machine_id: machineId, name: 'Drill Block' }).select().single()
    if (error || !data) { setCreating(false); alert(`Create failed: ${error?.message}`); return }
    const blk = data as DrillBlock
    const rows = [
      ...Array.from({ length: blk.bank_x_count }, (_, i) => ({ drill_block_id: blk.id, bank: 'x', position: i + 1, bit_value: 2 ** i })),
      ...Array.from({ length: blk.bank_y_count }, (_, i) => ({ drill_block_id: blk.id, bank: 'y', position: i + 1, bit_value: 2 ** i })),
    ]
    const { data: spData } = await supabase.from('cnc_drill_block_spindles').insert(rows).select()
    setSpindles((spData ?? []) as Spindle[])
    setBlock(blk)
    setSel(null)
    setCreating(false)
  }

  async function patchBlock(changes: Partial<DrillBlock>) {
    if (!block) return
    setBlock({ ...block, ...changes })
    const { error } = await supabase.from('cnc_drill_blocks').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', block.id)
    if (error) console.error('[cnc_drill_blocks] update', error)
  }

  async function patchProfile(changes: Partial<MachineProfile>) {
    if (!profile) return
    setProfile({ ...profile, ...changes })
    const { error } = await supabase.from('cnc_machine_profiles').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', profile.id)
    if (error) console.error('[cnc_machine_profiles] origin update', error)
  }

  // Resize a bank: insert spindle rows for new positions, delete rows beyond the new count.
  async function setBankCount(bank: 'x' | 'y', count: number) {
    if (!block || count < 1 || count > 24) return
    const col = bank === 'x' ? 'bank_x_count' : 'bank_y_count'
    const cur = spindles.filter(s => s.bank === bank)
    const have = cur.length
    if (count > have) {
      const rows = Array.from({ length: count - have }, (_, k) => {
        const position = have + k + 1
        return { drill_block_id: block.id, bank, position, bit_value: 2 ** (position - 1) }
      })
      const { data } = await supabase.from('cnc_drill_block_spindles').insert(rows).select()
      setSpindles(prev => [...prev, ...((data ?? []) as Spindle[])])
    } else if (count < have) {
      const toDrop = cur.filter(s => s.position > count).map(s => s.id)
      if (toDrop.length) await supabase.from('cnc_drill_block_spindles').delete().in('id', toDrop)
      setSpindles(prev => prev.filter(s => !(s.bank === bank && s.position > count)))
    }
    patchBlock({ [col]: count } as Partial<DrillBlock>)
  }

  // Assign (or clear) the drill on a spindle. The shared corner (pos 1) is one
  // physical spindle in two banks, so writing it updates both rows.
  async function assign(bank: 'x' | 'y', position: number, drillId: string | null) {
    if (!block) return
    const shared = block.shared_corner && position === 1
    const targetIds = spindles
      .filter(s => shared ? s.position === 1 : (s.bank === bank && s.position === position))
      .map(s => s.id)
    if (!targetIds.length) return
    setSpindles(prev => prev.map(s => targetIds.includes(s.id) ? { ...s, drill_id: drillId } : s))
    const { error } = await supabase.from('cnc_drill_block_spindles').update({ drill_id: drillId }).in('id', targetIds)
    if (error) console.error('[cnc_drill_block_spindles] assign', error)
  }

  if (loading) return <p className="text-xs text-ink-subtle py-3">Loading drill block…</p>

  if (!block) {
    return (
      <div className="py-3">
        <p className="text-xs text-ink-subtle mb-3">No drill block configured for this machine.</p>
        <button onClick={createBlock} disabled={creating}
          className="text-xs px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded transition-colors">
          {creating ? 'Creating…' : '+ Create drill block (12 × 8)'}
        </button>
      </div>
    )
  }

  const spindleAt = (bank: 'x' | 'y', position: number) =>
    spindles.find(s => s.bank === bank && s.position === position) ?? null
  const drillFor = (s: Spindle | null) => s?.drill_id ? drills.find(d => d.id === s.drill_id) ?? null : null

  // ── SVG geometry ──────────────────────────────────────────────────────────
  const R = 20, STEP = 58, M = 42
  const baseX = M, baseY = M + (block.bank_y_count - 1) * STEP    // corner = bottom-left
  const cx = (bank: 'x' | 'y', position: number) => bank === 'x' ? baseX + (position - 1) * STEP : baseX
  const cy = (bank: 'x' | 'y', position: number) => bank === 'x' ? baseY : baseY - (position - 1) * STEP
  const vbW = M * 2 + (block.bank_x_count - 1) * STEP
  const vbH = M + (block.bank_y_count - 1) * STEP + 60   // extra bottom band for labels

  const selSpindle = sel ? spindleAt(sel.bank, sel.position) : null
  const usedDiameters = [...new Set(spindles.map(s => drillFor(s)?.diameter).filter((x): x is number => x != null))].sort((a, b) => a - b)

  function spindleNode(bank: 'x' | 'y', position: number) {
    const s = spindleAt(bank, position)
    const drill = drillFor(s)
    const isSel = sel?.bank === bank && sel.position === position
    const isCorner = position === 1
    const colour = drill ? diameterColour(drill.diameter) : 'none'
    const x = cx(bank, position), y = cy(bank, position)
    return (
      <g key={`${bank}${position}`} className="cursor-pointer" onClick={() => setSel({ bank, position })}>
        {isCorner && block!.shared_corner && (
          <circle cx={x} cy={y} r={R + 4} fill="none" stroke="#6366f1" strokeWidth={1} strokeDasharray="2 2" opacity={0.6} />
        )}
        <circle cx={x} cy={y} r={R}
          fill={drill ? colour : 'transparent'} fillOpacity={drill ? 0.85 : 1}
          stroke={isSel ? '#6366f1' : drill ? colour : '#64748b'}
          strokeWidth={isSel ? 2.5 : 1.5} strokeDasharray={drill ? undefined : '3 2'} />
        <text x={x} y={y + 4} textAnchor="middle" fontSize={14} fontWeight={600}
          fill={drill ? '#0b0f17' : '#94a3b8'}>{position}</text>
        <text x={x} y={y + R + 13} textAnchor="middle" fontSize={11} fill="#94a3b8" className="font-mono">{s?.bit_value ?? 2 ** (position - 1)}</text>
      </g>
    )
  }

  return (
    <div className="py-1">
      {/* Block-level fields */}
      <div className="grid grid-cols-3 gap-x-4 gap-y-3 max-w-xl mb-4">
        <Txt label="Block name" value={block.name} onSave={v => patchBlock({ name: v || block.name })} />
        <IntF label="X bank (M88)" value={block.bank_x_count} onSave={v => setBankCount('x', v)} />
        <IntF label="Y bank (M89)" value={block.bank_y_count} onSave={v => setBankCount('y', v)} />
        <NumF label="Spacing (mm)" value={block.spacing_mm} onSave={v => patchBlock({ spacing_mm: v ?? 32 })} />
        <Txt label="X bank M-code" value={block.x_bank_mcode} onSave={v => patchBlock({ x_bank_mcode: v || 'M88' })} />
        <Txt label="Y bank M-code" value={block.y_bank_mcode} onSave={v => patchBlock({ y_bank_mcode: v || 'M89' })} />
        <NumF label="Head offset X (mm)" value={block.head_offset_x_mm} onSave={v => patchBlock({ head_offset_x_mm: v ?? 0 })} />
        <NumF label="Head offset Y (mm)" value={block.head_offset_y_mm} onSave={v => patchBlock({ head_offset_y_mm: v ?? 0 })} />
        <Txt label="Work offset" value={block.work_offset_code} onSave={v => patchBlock({ work_offset_code: v || 'G54' })} />
      </div>

      <div className="flex gap-6 flex-wrap">
        {/* SVG viewer */}
        <div className="border border-edge-strong rounded-lg bg-surface-2/40 p-2">
          <svg width={Math.min(vbW, 880)} viewBox={`0 0 ${vbW} ${vbH}`} style={{ maxWidth: '100%', height: 'auto' }}>
            {/* axis guide lines */}
            <line x1={baseX} y1={baseY} x2={cx('x', block.bank_x_count)} y2={baseY} stroke="#475569" strokeWidth={1.5} />
            <line x1={baseX} y1={baseY} x2={baseX} y2={cy('y', block.bank_y_count)} stroke="#475569" strokeWidth={1.5} />
            {/* bank labels */}
            <text x={cx('x', block.bank_x_count)} y={baseY + R + 30} textAnchor="end" fontSize={11} fill="#94a3b8">X bank · {block.x_bank_mcode} →</text>
            <text x={baseX - R - 10} y={cy('y', block.bank_y_count)} textAnchor="middle" fontSize={11} fill="#94a3b8" transform={`rotate(-90 ${baseX - R - 10} ${cy('y', block.bank_y_count)})`}>Y bank · {block.y_bank_mcode} ↑</text>
            {/* Y spindles (2..N) then X spindles (2..N), then shared corner once on top */}
            {Array.from({ length: block.bank_y_count - 1 }, (_, k) => spindleNode('y', k + 2))}
            {Array.from({ length: block.bank_x_count - 1 }, (_, k) => spindleNode('x', k + 2))}
            {spindleNode('x', 1)}
          </svg>
        </div>

        {/* Assignment panel + legend */}
        <div className="min-w-[220px] flex-1 space-y-4">
          <div>
            <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider mb-2">Spindle assignment</p>
            {!sel ? (
              <p className="text-xs text-ink-subtle">Click a spindle to assign a drill.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-ink">
                  Spindle <span className="font-mono">{sel.bank.toUpperCase()}-{sel.position}</span>
                  <span className="text-ink-subtle"> · bit {selSpindle?.bit_value ?? 2 ** (sel.position - 1)}</span>
                  {block.shared_corner && sel.position === 1 && <span className="text-accent-ink"> · shared corner</span>}
                </p>
                <select className={inp} value={selSpindle?.drill_id ?? ''}
                  onChange={e => assign(sel.bank, sel.position, e.target.value || null)}>
                  <option value="">— empty —</option>
                  {drills.map(d => <option key={d.id} value={d.id}>{d.name}{d.diameter != null ? ` · ⌀${d.diameter}` : ''}</option>)}
                </select>
              </div>
            )}
          </div>

          {usedDiameters.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider mb-2">Diameters fitted</p>
              <div className="flex flex-wrap gap-2">
                {usedDiameters.map(dia => (
                  <span key={dia} className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
                    <span className="w-3 h-3 rounded-full inline-block" style={{ background: diameterColour(dia) }} />
                    ⌀{dia}
                  </span>
                ))}
              </div>
            </div>
          )}
          {drills.length === 0 && (
            <p className="text-[11px] text-ink-subtle">No active drills in the library yet — add some under Drill Library to assign them here.</p>
          )}
        </div>
      </div>

      {/* Machine origin & axes — plan view of where X0/Y0 sits, reactive to the options */}
      <div className="border-t border-edge pt-4 mt-5">
        <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider mb-1">Machine origin &amp; axes</p>
        <p className="text-[11px] text-ink-subtle mb-3">Where the machine datum (X0 Y0) sits on the table and which way the axes run. The drill-block work offset (G54) is measured from here; the orange marker shows the block&apos;s head offset from origin.</p>
        <div className="flex gap-6 flex-wrap items-start">
          <div className="grid grid-cols-1 gap-3 w-48">
            {profile ? (<>
              <div>
                <label className={lbl}>Origin corner</label>
                <select className={inp} value={profile.origin_corner ?? 'bottom_left'} onChange={e => patchProfile({ origin_corner: e.target.value })}>
                  {ORIGIN_CORNERS.map(o => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>X axis direction</label>
                <select className={inp} value={profile.x_axis_direction ?? 'positive_right'} onChange={e => patchProfile({ x_axis_direction: e.target.value })}>
                  {X_DIRS.map(o => <option key={o} value={o}>{o.replace('positive_', '+').replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Y axis direction</label>
                <select className={inp} value={profile.y_axis_direction ?? 'positive_up'} onChange={e => patchProfile({ y_axis_direction: e.target.value })}>
                  {Y_DIRS.map(o => <option key={o} value={o}>{o.replace('positive_', '+').replace('_', ' ')}</option>)}
                </select>
              </div>
            </>) : (
              <p className="text-[11px] text-ink-subtle">No cutting profile on this machine yet — add one under CNC Machine Setup to set the origin and axes.</p>
            )}
          </div>

          {(() => {
            const ORIGIN = profile?.origin_corner ?? 'bottom_left'
            const XDIR = profile?.x_axis_direction ?? 'positive_right'
            const YDIR = profile?.y_axis_direction ?? 'positive_up'
            const tdx = tableDx && tableDx > 0 ? tableDx : 2400
            const tdy = tableDy && tableDy > 0 ? tableDy : 1200
            const PAD = 36, MAXW = 280
            const sc = (MAXW - PAD * 2) / tdx
            const tW = tdx * sc, tH = tdy * sc
            const x0 = PAD, y0 = PAD
            const ox = ORIGIN.includes('right') ? x0 + tW : x0
            const oy = ORIGIN.includes('top') ? y0 : y0 + tH
            const xv = XDIR === 'positive_left' ? -1 : 1
            const yv = YDIR === 'positive_down' ? 1 : -1
            const AL = 42
            const bx = ox + xv * (block.head_offset_x_mm || 0) * sc
            const by = oy + yv * (block.head_offset_y_mm || 0) * sc
            const arrow = (dx: number, dy: number, label: string) => {
              const ex = ox + dx * AL, ey = oy + dy * AL
              const a = 7, px = -dy, py = dx
              const pts = `${ex},${ey} ${ex - dx * a + px * a * 0.55},${ey - dy * a + py * a * 0.55} ${ex - dx * a - px * a * 0.55},${ey - dy * a - py * a * 0.55}`
              return (
                <g key={label}>
                  <line x1={ox} y1={oy} x2={ex} y2={ey} stroke="#22d3ee" strokeWidth={1.6} />
                  <polygon points={pts} fill="#22d3ee" />
                  <text x={ex + dx * 9} y={ey + dy * 9 + 3} textAnchor="middle" fontSize={10} fontWeight={600} fill="#22d3ee">{label}</text>
                </g>
              )
            }
            return (
              <div className="border border-edge-strong rounded-lg bg-surface-2/40 p-2">
                <svg width={Math.min(tW + PAD * 2, MAXW)} viewBox={`0 0 ${tW + PAD * 2} ${tH + PAD * 2}`} style={{ maxWidth: '100%', height: 'auto' }}>
                  <rect x={x0} y={y0} width={tW} height={tH} fill="none" stroke="#475569" strokeWidth={1.5} rx={2} />
                  <text x={x0 + tW / 2} y={y0 + tH / 2} textAnchor="middle" fontSize={9} fill="#64748b">machine table {tdx}×{tdy}</text>
                  <rect x={bx - 4} y={by - 4} width={8} height={8} fill="#f59e0b" stroke="#0b0f17" strokeWidth={0.5} />
                  <text x={bx} y={by - 7} textAnchor="middle" fontSize={8} fill="#f59e0b">block</text>
                  {arrow(xv, 0, 'X+')}
                  {arrow(0, yv, 'Y+')}
                  <line x1={ox - 8} y1={oy} x2={ox + 8} y2={oy} stroke="#ef4444" strokeWidth={1.5} />
                  <line x1={ox} y1={oy - 8} x2={ox} y2={oy + 8} stroke="#ef4444" strokeWidth={1.5} />
                  <circle cx={ox} cy={oy} r={3} fill="#ef4444" />
                  <text x={ox + (ORIGIN.includes('right') ? -5 : 5)} y={oy + (ORIGIN.includes('top') ? 15 : -9)} textAnchor={ORIGIN.includes('right') ? 'end' : 'start'} fontSize={10} fontWeight={700} fill="#ef4444">X0 Y0</text>
                </svg>
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

// ── Small field helpers (mirror CncMachinesClient) ─────────────────────────────
function Txt({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input className={inp} defaultValue={value} key={value} onBlur={e => { const v = e.target.value.trim(); if (v !== value) onSave(v) }} />
    </div>
  )
}
function NumF({ label, value, onSave }: { label: string; value: number | null; onSave: (v: number | null) => void }) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input type="number" step="any" className={inp} defaultValue={value ?? ''} key={String(value)}
        onBlur={e => { const raw = e.target.value.trim(); if (raw === '') return onSave(null); const n = parseFloat(raw); onSave(Number.isFinite(n) ? n : null) }} />
    </div>
  )
}
function IntF({ label, value, onSave }: { label: string; value: number; onSave: (v: number) => void }) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input type="number" step={1} className={inp} defaultValue={value} key={String(value)}
        onBlur={e => { const n = parseInt(e.target.value); if (Number.isFinite(n) && n !== value) onSave(n) }} />
    </div>
  )
}
