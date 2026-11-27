'use client'

// Settings › AI helper › "Can't do yet" (z_ai_helper Q7): everything the chat was asked
// and couldn't do (ai_gaps, logged by its report_gap tool), grouped by the missing
// feature, most asked first — the build list. Built / Ignore close a whole group.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/src/lib/supabase'

interface Gap { id: string; project_id: string; request: string; missing: string; status: 'open' | 'built' | 'ignored'; created_at: string }

const day = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })

export default function AiGapsList() {
  const [gaps, setGaps] = useState<Gap[] | null>(null)
  const [jobs, setJobs] = useState<Map<string, string>>(new Map())
  const [show, setShow] = useState<'open' | 'closed'>('open')
  const [open, setOpen] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    const { data, error } = await supabase.from('ai_gaps').select('id, project_id, request, missing, status, created_at').order('created_at', { ascending: false }).limit(1000)
    if (error) { setErr(error.message); return }
    const rows = (data ?? []) as Gap[]
    setGaps(rows)
    const ids = [...new Set(rows.map(g => g.project_id))]
    if (ids.length) {
      const { data: ps } = await supabase.from('projects').select('id, name').in('id', ids)
      setJobs(new Map(((ps ?? []) as { id: string; name: string }[]).map(p => [p.id, p.name])))
    }
  }
  useEffect(() => { void load() }, [])

  const groups = useMemo(() => {
    const want = (g: Gap) => show === 'open' ? g.status === 'open' : g.status !== 'open'
    const by = new Map<string, Gap[]>()
    for (const g of (gaps ?? []).filter(want)) by.set(g.missing, [...(by.get(g.missing) ?? []), g])
    return [...by].sort((a, b) => b[1].length - a[1].length || b[1][0].created_at.localeCompare(a[1][0].created_at))
  }, [gaps, show])

  async function setStatus(missing: string, status: Gap['status']) {
    setErr(null)
    const from = show === 'open' ? ['open'] : ['built', 'ignored']
    const { error } = await supabase.from('ai_gaps').update({ status }).eq('missing', missing).in('status', from)
    if (error) setErr(error.message); else void load()
  }

  const openCount = (gaps ?? []).filter(g => g.status === 'open').length

  return (
    <section>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-100">Can&apos;t do yet</h2>
        <span className="text-xs text-gray-500">{openCount} open</span>
        <div className="ml-auto flex items-center gap-1 text-xs">
          {(['open', 'closed'] as const).map(s => (
            <button key={s} onClick={() => setShow(s)}
              className={`px-2 py-0.5 rounded border ${show === s ? 'border-blue-500 text-blue-200' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}>
              {s === 'open' ? 'Open' : 'Built / ignored'}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-1 mb-2">
        Everything people asked the AI for that it couldn&apos;t do, grouped by what&apos;s missing, most asked first. This is the build list —
        mark a group Built once the AI can do it.
      </p>
      {err && <p className="text-xs text-red-400 mb-2">{err}</p>}
      {gaps === null ? <p className="text-xs text-gray-500">Loading…</p> : !groups.length ? (
        <p className="text-xs text-gray-500">{show === 'open' ? 'Nothing logged yet.' : 'None closed yet.'}</p>
      ) : (
        <div className="divide-y divide-gray-800 border border-gray-800 rounded">
          {groups.map(([missing, list]) => (
            <div key={missing} className="px-3 py-2">
              <div className="flex items-center gap-3">
                <button onClick={() => setOpen(open === missing ? null : missing)} className="flex items-center gap-2 text-left flex-1 min-w-0">
                  <span className="text-gray-500 text-xs w-3">{open === missing ? '▾' : '▸'}</span>
                  <span className="text-sm text-gray-100">{missing}</span>
                  <span className="text-xs text-gray-500">×{list.length} · last {day(list[0].created_at)}</span>
                  {show === 'closed' && <span className="text-[11px] text-gray-500">{list[0].status}</span>}
                </button>
                {show === 'open' ? (
                  <>
                    <button onClick={() => void setStatus(missing, 'built')} className="text-xs text-emerald-400 hover:text-emerald-300">Built</button>
                    <button onClick={() => void setStatus(missing, 'ignored')} className="text-xs text-gray-400 hover:text-gray-200">Ignore</button>
                  </>
                ) : (
                  <button onClick={() => void setStatus(missing, 'open')} className="text-xs text-gray-400 hover:text-gray-200">Reopen</button>
                )}
              </div>
              {open === missing ? (
                <ul className="mt-1.5 ml-5 space-y-0.5">
                  {list.map(g => (
                    <li key={g.id} className="text-xs text-gray-300">
                      “{g.request}” <span className="text-gray-600">— {jobs.get(g.project_id) ?? 'a deleted job'}, {day(g.created_at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-0.5 ml-5 text-xs text-gray-500 truncate">“{list[0].request}”</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
