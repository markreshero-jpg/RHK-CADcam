'use client'

// ── HingeCountRulesEditor ─────────────────────────────────────────────────────
// Shop-level lookup that drives auto-calculation of how many hinges a door needs
// by its height. The resolver walks active rules ascending by max_height_mm and
// uses the hinge_count of the first rule whose bound covers the door height.

import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { HingeCountRule } from '@/src/lib/types'
import CalcInput from '@/src/components/CalcInput'

type Rule = Pick<HingeCountRule,
  'id' | 'max_height_mm' | 'hinge_count' | 'top_inset_mm' | 'bottom_inset_mm' | 'sort_order' | 'active'>

export default function HingeCountRulesEditor({ embedded }: { embedded?: boolean }) {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase.from('hinge_count_rules')
      .select('id, max_height_mm, hinge_count, top_inset_mm, bottom_inset_mm, sort_order, active')
      .order('max_height_mm', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error.message)
        setRules((data ?? []) as Rule[])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  async function patch(id: string, p: Partial<Rule>) {
    setRules(prev => prev.map(r => r.id === id ? { ...r, ...p } : r))
    const { error } = await supabase.from('hinge_count_rules').update(p).eq('id', id)
    if (error) setError(error.message)
  }

  async function addRule() {
    const lastMax = rules.length ? Math.max(...rules.map(r => r.max_height_mm)) : 600
    const payload = {
      max_height_mm: lastMax + 600,
      hinge_count: (rules.length ? Math.max(...rules.map(r => r.hinge_count)) : 1) + 1,
      top_inset_mm: 100,
      bottom_inset_mm: 100,
      sort_order: (rules.length ? Math.max(...rules.map(r => r.sort_order)) : 0) + 10,
      active: true,
    }
    const { data, error } = await supabase.from('hinge_count_rules').insert(payload).select().single()
    if (error) { setError(error.message); return }
    setRules(prev => [...prev, data as Rule].sort((a, b) => a.max_height_mm - b.max_height_mm))
  }

  async function deleteRule(id: string) {
    const { error } = await supabase.from('hinge_count_rules').delete().eq('id', id)
    if (error) { setError(error.message); return }
    setRules(prev => prev.filter(r => r.id !== id))
  }

  const wrap = embedded ? 'flex-1 overflow-y-auto px-8 py-6 max-w-3xl' : 'p-6 max-w-3xl'

  return (
    <div className={wrap}>
      {!embedded && <h2 className="text-sm font-semibold text-ink mb-4">Hinge Count Rules</h2>}

      <p className="text-xs text-ink-subtle mb-4 max-w-xl leading-relaxed">
        Door height → number of hinges. The resolver picks the first rule (lowest <code className="text-ink-muted">max height</code>)
        whose bound covers the door, then spaces the hinges using the top &amp; bottom insets with equalised middles.
      </p>

      {error && <div className="text-xs text-red-400 mb-3">{error}</div>}

      <div className="border border-edge-strong rounded-lg overflow-hidden">
        <div className="flex items-center bg-surface-2/60 border-b border-edge-strong text-[9px] text-ink-subtle uppercase tracking-wide">
          <div className="px-3 py-2" style={{ width: 130 }}>Max height mm</div>
          <div className="px-3 py-2" style={{ width: 100 }}>Hinges</div>
          <div className="px-3 py-2" style={{ width: 120 }}>Top inset mm</div>
          <div className="px-3 py-2" style={{ width: 120 }}>Bottom inset mm</div>
          <div className="px-3 py-2" style={{ width: 80 }}>Active</div>
          <div className="px-3 py-2 flex-1 text-right">{loading ? 'loading…' : `${rules.length} rules`}</div>
        </div>

        {rules.map(r => (
          <div key={r.id} className="flex items-center border-b border-edge/60 last:border-b-0 hover:bg-surface-2/30">
            <Num value={r.max_height_mm} onCommit={v => patch(r.id, { max_height_mm: v })} w={130} />
            <Num value={r.hinge_count}   onCommit={v => patch(r.id, { hinge_count: Math.max(1, Math.round(v)) })} w={100} />
            <Num value={r.top_inset_mm}  onCommit={v => patch(r.id, { top_inset_mm: v })} w={120} />
            <Num value={r.bottom_inset_mm} onCommit={v => patch(r.id, { bottom_inset_mm: v })} w={120} />
            <div className="px-3 py-2" style={{ width: 80 }}>
              <input type="checkbox" checked={r.active} onChange={e => patch(r.id, { active: e.target.checked })} className="accent-blue-500" />
            </div>
            <div className="px-3 py-2 flex-1 text-right">
              <button onClick={() => deleteRule(r.id)} className="text-ink-subtle hover:text-red-400 text-xs">Delete</button>
            </div>
          </div>
        ))}

        {!loading && rules.length === 0 && (
          <div className="px-3 py-6 text-xs text-ink-subtle">No rules yet. Add one below.</div>
        )}
      </div>

      <button onClick={addRule} className="mt-3 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs rounded">
        + Add rule
      </button>
    </div>
  )
}

function Num({ value, onCommit, w }: { value: number; onCommit: (v: number) => void; w: number }) {
  // CalcInput is uncontrolled-on-blur and mirrors `value` when not focused, so it
  // needs no prop-sync effect and also accepts arithmetic (e.g. 900+300).
  return (
    <div className="px-3 py-2" style={{ width: w }}>
      <CalcInput
        value={value}
        onCommit={onCommit}
        className="w-full bg-transparent border-b border-edge-strong px-0.5 py-0.5 text-xs text-ink text-right tabular-nums focus:outline-none focus:border-accent"
      />
    </div>
  )
}
