'use client'

// Settings › AI helper (z_ai_helper AI5): the shop's rules the AI follows on every
// job (shop_settings.ai_rules — admins edit, sent with every AI message), and what
// the AI has cost (ai_messages: this month against the cap, by job, by person, by model).

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/src/lib/supabase'

/** Monthly spend cap on the API key (set in the Anthropic Console; decision 6). */
const CAP_USD = 50

interface CostRow { project_id: string; user_id: string; model: string | null; cost_usd: number; created_at: string }

const money = (v: number) => v < 1 ? `${(v * 100).toFixed(1)}¢` : `$${v.toFixed(2)}`
const modelName = (m: string | null) => !m ? '?' : m.includes('haiku') ? 'Haiku (everyday)' : m.includes('sonnet') ? 'Sonnet (Try harder)' : m.includes('opus') ? 'Opus (drawing)' : m

function monthStart(offset: number) {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() + offset)
  return d
}

export default function AiHelperSettings() {
  const [rulesId, setRulesId] = useState<string | null>(null)
  const [rules, setRules] = useState('')
  const [saved, setSaved] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const [month, setMonth] = useState(0)   // 0 = this month, -1 = last…
  const [rows, setRows] = useState<CostRow[] | null>(null)
  const [jobs, setJobs] = useState<Map<string, string>>(new Map())
  const [people, setPeople] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    void supabase.from('shop_settings').select('id, ai_rules').limit(1).maybeSingle().then(({ data }) => {
      const r = data as { id: string; ai_rules: string | null } | null
      setRulesId(r?.id ?? null); setRules(r?.ai_rules ?? ''); setSaved(r?.ai_rules ?? '')
    })
    void supabase.rpc('admin_list_users').then(({ data }) =>
      setPeople(new Map(((data ?? []) as { id: string; email: string }[]).map(u => [u.id, u.email]))))
  }, [])

  useEffect(() => {
    setRows(null)
    const from = monthStart(month), to = monthStart(month + 1)
    void supabase.from('ai_messages').select('project_id, user_id, model, cost_usd, created_at')
      .eq('role', 'assistant').gte('created_at', from.toISOString()).lt('created_at', to.toISOString())
      .then(async ({ data }) => {
        const list = ((data ?? []) as CostRow[]).map(r => ({ ...r, cost_usd: Number(r.cost_usd) }))
        setRows(list)
        const ids = [...new Set(list.map(r => r.project_id))]
        if (ids.length) {
          const { data: ps } = await supabase.from('projects').select('id, name').in('id', ids)
          setJobs(new Map(((ps ?? []) as { id: string; name: string }[]).map(p => [p.id, p.name])))
        }
      })
  }, [month])

  async function saveRules() {
    if (!rulesId) return
    setSaving(true); setMsg(null)
    const { error } = await supabase.from('shop_settings').update({ ai_rules: rules.trim() || null }).eq('id', rulesId)
    setSaving(false)
    if (error) setMsg(`Not saved: ${error.message}`)
    else { setSaved(rules); setMsg('Saved — the AI uses these from its next message.') }
  }

  const sums = useMemo(() => {
    const by = (key: (r: CostRow) => string) => {
      const m = new Map<string, { n: number; usd: number }>()
      for (const r of rows ?? []) { const k = key(r); const e = m.get(k) ?? { n: 0, usd: 0 }; e.n++; e.usd += r.cost_usd; m.set(k, e) }
      return [...m].sort((a, b) => b[1].usd - a[1].usd)
    }
    const total = (rows ?? []).reduce((a, r) => a + r.cost_usd, 0)
    return { total, jobs: by(r => r.project_id), people: by(r => r.user_id), models: by(r => r.model ?? '?') }
  }, [rows])

  const label = monthStart(month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const pct = Math.min(100, (sums.total / CAP_USD) * 100)
  const tokens = Math.round(rules.length / 4)

  const table = (title: string, list: [string, { n: number; usd: number }][], name: (k: string) => string) => (
    <div className="flex-1 min-w-[220px]">
      <p className="text-xs font-medium text-gray-400 mb-1">{title}</p>
      {list.length === 0 ? <p className="text-xs text-gray-600">—</p> : (
        <table className="w-full text-xs">
          <tbody>
            {list.map(([k, v]) => (
              <tr key={k} className="border-b border-gray-800">
                <td className="py-1 pr-2 text-gray-300 truncate max-w-[220px]">{name(k)}</td>
                <td className="py-1 pr-2 text-gray-500 text-right">{v.n}</td>
                <td className="py-1 text-gray-200 text-right">{money(v.usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8 max-w-4xl">
      <section>
        <h2 className="text-sm font-semibold text-gray-100">Shop rules</h2>
        <p className="text-xs text-gray-500 mt-1 mb-2">
          The AI follows these on every job — in the chat and when it draws from a plan. Write them the way you&apos;d tell a new
          cabinetmaker, one per line. A job&apos;s own notes (Job properties → Notes for the AI) win for that job.
        </p>
        <textarea value={rules} onChange={e => setRules(e.target.value)} rows={16} spellCheck
          className="w-full rounded bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-100 font-mono leading-relaxed focus:outline-none focus:border-blue-500" />
        <div className="flex items-center gap-3 mt-2">
          <button onClick={() => void saveRules()} disabled={saving || rules === saved || !rulesId}
            className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs hover:bg-blue-500 disabled:opacity-40">{saving ? 'Saving…' : 'Save rules'}</button>
          {rules !== saved && <button onClick={() => setRules(saved)} className="text-xs text-gray-400 hover:text-gray-200">Undo changes</button>}
          <span className={`text-[11px] ${tokens > 1500 ? 'text-amber-400' : 'text-gray-600'}`}>
            ≈ {tokens} tokens, sent with every message{tokens > 1500 ? ' — long rules cost more and can muddle the AI; trim if you can' : ''}
          </span>
          {msg && <span className="text-xs text-gray-300">{msg}</span>}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-100">AI cost</h2>
          <div className="ml-auto flex items-center gap-1 text-xs">
            <button onClick={() => setMonth(m => m - 1)} className="px-2 py-0.5 rounded border border-gray-700 text-gray-300 hover:bg-gray-800">‹</button>
            <span className="w-32 text-center text-gray-300">{label}</span>
            <button onClick={() => setMonth(m => Math.min(0, m + 1))} disabled={month >= 0}
              className="px-2 py-0.5 rounded border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-30">›</button>
          </div>
        </div>
        {rows === null ? <p className="text-xs text-gray-500 mt-3">Loading…</p> : (
          <>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-2xl font-semibold text-gray-100">{money(sums.total)}</span>
              <span className="text-xs text-gray-500">{rows.length} answer{rows.length === 1 ? '' : 's'} · cap ${CAP_USD}/month</span>
            </div>
            <div className="mt-2 h-2 rounded bg-gray-800 overflow-hidden">
              <div className={`h-full ${pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[11px] text-gray-600 mt-1">
              The cap itself is set on the API key in the Anthropic Console; when it&apos;s reached the AI stops answering until next month.
            </p>
            <div className="flex flex-wrap gap-6 mt-4">
              {table('By job', sums.jobs, k => jobs.get(k) ?? 'a deleted job')}
              {table('By person', sums.people, k => people.get(k) ?? 'someone')}
              {table('By model', sums.models, modelName)}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
