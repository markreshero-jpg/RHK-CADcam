'use client'

// ============================================================
// VJ line layout fields — Qty / Spacing / Edge gap / Direction.
// One component for every level of the cascade (job → room →
// cabinet → door). Blank = inherit; the placeholder shows what
// the level above gives (or "profile" = the door profile's own).
// Rules (doorProfile.vjLinePositions / mergeVjLayout):
//   spacing only  → as many full boards as fit, centred
//   qty only      → qty lines, equal boards
//   qty + spacing → qty lines at that spacing, centred
// qty + spacing inherit as a pair; edge gap / direction key by key.
// ============================================================

import type { VjLayout } from '@/src/lib/resolver/types'

const inp = 'bg-surface-2 border border-edge-strong rounded px-2 py-1 text-xs text-ink focus:outline-none focus:border-accent w-full'
const lbl = 'text-[10px] text-ink-subtle uppercase tracking-wide mb-1 block'

/** Drops blank keys; null when nothing is set (store null, not {}). */
export function cleanVjLayout(v: VjLayout | null | undefined): VjLayout | null {
  if (!v) return null
  const out: VjLayout = {}
  if (typeof v.qty === 'number' && v.qty > 0) out.qty = Math.round(v.qty)
  if (typeof v.spacing === 'number' && v.spacing > 0) out.spacing = v.spacing
  if (typeof v.edge_gap === 'number' && v.edge_gap >= 0) out.edge_gap = v.edge_gap
  if (v.direction === 'vertical' || v.direction === 'horizontal') out.direction = v.direction
  return Object.keys(out).length ? out : null
}

export default function VjLayoutFields({ value, inherited, onChange, compact }: {
  value: VjLayout | null | undefined
  /** What the level above resolves to — shown as placeholders. */
  inherited?: VjLayout | null
  onChange: (next: VjLayout | null) => void
  compact?: boolean
}) {
  const v = value ?? {}
  const set = (patch: Partial<VjLayout>) => onChange(cleanVjLayout({ ...v, ...patch }))
  const num = (raw: string) => { const n = parseFloat(raw); return Number.isFinite(n) ? n : null }
  // Pair rule: a level that sets qty or spacing supplies both, so the other one's
  // placeholder only shows the inherited value when this level sets neither.
  const ownPair = v.qty != null || v.spacing != null
  const ph = (k: keyof VjLayout) => {
    if ((k === 'qty' || k === 'spacing') && ownPair) return '—'
    const iv = inherited?.[k]
    return iv != null ? String(iv) : 'profile'
  }
  return (
    <div className="space-y-2">
      <div className={`grid ${compact ? 'grid-cols-2' : 'grid-cols-4'} gap-2`}>
        <div>
          <label className={lbl}>VJ qty</label>
          <input type="number" min={1} step={1} className={inp} placeholder={ph('qty')} defaultValue={v.qty ?? ''} key={`q${v.qty ?? ''}`}
            onBlur={e => { const n = num(e.target.value); if (n !== (v.qty ?? null)) set({ qty: n }) }} />
        </div>
        <div>
          <label className={lbl}>Spacing</label>
          <input type="number" min={1} step="any" className={inp} placeholder={ph('spacing')} defaultValue={v.spacing ?? ''} key={`s${v.spacing ?? ''}`}
            onBlur={e => { const n = num(e.target.value); if (n !== (v.spacing ?? null)) set({ spacing: n }) }} />
        </div>
        <div>
          <label className={lbl}>Edge gap</label>
          <input type="number" min={0} step="any" className={inp} placeholder={ph('edge_gap')} defaultValue={v.edge_gap ?? ''} key={`g${v.edge_gap ?? ''}`}
            onBlur={e => { const n = num(e.target.value); if (n !== (v.edge_gap ?? null)) set({ edge_gap: n }) }} />
        </div>
        <div>
          <label className={lbl}>Direction</label>
          <select className={inp} value={v.direction ?? ''} onChange={e => set({ direction: (e.target.value || null) as VjLayout['direction'] })}>
            <option value="">{inherited?.direction ? `— ${inherited.direction} —` : '— profile —'}</option>
            <option value="vertical">vertical</option>
            <option value="horizontal">horizontal</option>
          </select>
        </div>
      </div>
      <p className="text-[10px] text-ink-subtle leading-snug">
        Spacing only = as many boards as fit, centred. Qty only = equal boards. Both = that many lines at that spacing, centred.
        Blank = inherit. Only affects VJ doors.
      </p>
    </div>
  )
}
