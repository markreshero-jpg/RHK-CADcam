'use client'

// ============================================================
// Stage 7 — Labels & Cut Sheets. Two tabs: part labels (Cabinet Vision
// layout, src/lib/optimiser/labels.ts) and the cut sheets report (CutSheetsPanel).
// One label per nested part, numbered sheet-major like the sheet prints.
// Label size + printer mode are remembered per browser. The printer itself
// is picked in the browser's print dialog — a web page can't choose one.
// ============================================================

import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import CutSheetsPanel from './CutSheetsPanel'
import { useOptiStore } from '@/src/lib/optimiser/store'
import { loadSheetDrills, nestedParts } from '@/src/lib/optimiser/sheetDrills'
import { loadLabelLookups, buildAllLabels, labelsPdf, sheetNumbers, HAND_CUT_KEY, type LabelData } from '@/src/lib/optimiser/labels'
import { LabelPrintPanel, PickChip, labelSel as sel, parseNumberList as parseParts, useLabelSettings } from '@/src/components/labels/LabelPrintPanel'

const TAB_KEY = 'rhk.optimiser.stage7Tab'

export default function Stage7Labels() {
  const [tab, setTab] = useState<'labels' | 'sheets'>('labels')
  useEffect(() => { try { if (localStorage.getItem(TAB_KEY) === 'sheets') setTab('sheets') } catch { /* ignore */ } }, [])
  const pick = (t: 'labels' | 'sheets') => { setTab(t); try { localStorage.setItem(TAB_KEY, t) } catch { /* ignore */ } }
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-none flex gap-1 px-6 pt-2 border-b border-edge">
        {([['labels', 'Labels'], ['sheets', 'Cut sheets']] as const).map(([t, txt]) => (
          <button key={t} onClick={() => pick(t)}
            className={`px-3 py-1.5 text-xs border-b-2 -mb-px transition-colors ${tab === t ? 'border-accent text-ink' : 'border-transparent text-ink-subtle hover:text-ink-muted'}`}>
            {txt}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === 'labels' ? <LabelsPanel /> : <CutSheetsPanel />}
      </div>
    </div>
  )
}

function LabelsPanel() {
  const snap = useOptiStore(s => s.snapshot)!
  const nestResult = useOptiStore(s => s.nestResult)
  const partIndex = useOptiStore(s => s.partIndex)
  const profileId = useOptiStore(s => s.profileId)
  // Holes as machined when this layout's G-code was made (Stage 6 / a reopened run).
  const savedRun = useOptiStore(s => s.savedRun)
  const savedDrills = savedRun && savedRun.nest === nestResult ? savedRun.drillsBySheet : null
  const runNo = savedRun && savedRun.nest === nestResult ? savedRun.runNo : null
  const deductEb = snap.profiles.find(p => p.id === profileId)?.deduct_edgeband === true

  const [st, update] = useLabelSettings()

  const [labels, setLabels] = useState<{ cut: LabelData[]; finished: LabelData[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sheetsOn, setSheetsOn] = useState<Set<number> | null>(null)   // null = all
  const [partsText, setPartsText] = useState('')

  // Label data: holes (drilling already synced by the nest) + the names the
  // snapshot doesn't carry. Built for cut and finished sizes once per nest.
  useEffect(() => {
    if (!nestResult?.sheets.length && !nestResult?.unplaced?.length) return
    let dead = false
    setLoading(true); setError(null)
    ;(async () => {
      const parts = nestedParts(snap.parts, partIndex)
      const bySheet = savedDrills ?? (await loadSheetDrills(parts, nestResult.sheets, { sync: true, deductEdgeband: deductEb })).bySheet
      const matName = (id: string | null) => id ? snap.materials.find(m => m.id === id)?.name ?? null : null
      const look = await loadLabelLookups(supabase, parts, snap.projectName, matName)
      const byUid = new Map(snap.parts.map(p => [p.uid, p]))
      if (!dead) setLabels({
        cut: buildAllLabels(nestResult, byUid, bySheet, deductEb, look, 'cut', runNo),
        finished: buildAllLabels(nestResult, byUid, bySheet, deductEb, look, 'finished', runNo),
      })
    })().catch(e => { if (!dead) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!dead) setLoading(false) })
    return () => { dead = true }
  }, [nestResult, partIndex, snap, deductEb, savedDrills, runNo])

  const picked = useMemo(() => {
    const list = labels ? labels[st.dims] : []
    const parts = parseParts(partsText)
    return list.filter(l => (!sheetsOn || sheetsOn.has(l.sheetKey)) && (!parts || parts.has(l.partNo)))
  }, [labels, st.dims, sheetsOn, partsText])

  if (!nestResult?.sheets.length && !nestResult?.unplaced?.length) {
    return <p className="text-xs text-ink-subtle text-center py-12">Nothing nested — run Stage 4 first.</p>
  }

  const nums = sheetNumbers(nestResult.sheets)
  const matName = (id: string | null) => (id ? snap.materials.find(m => m.id === id)?.name : null) ?? 'No material'
  const sheetNos = nestResult.sheets.map((s, i) => ({ n: i + 1, no: nums.get(s.index)!.no as number | string, mat: matName(s.materialId), parts: s.placements.length }))
  // Parts too big for any sheet: hand-cut labels, picked like a sheet.
  if (nestResult.unplaced?.length) sheetNos.push({ n: HAND_CUT_KEY, no: 'Hand cut', mat: 'Too big for a sheet — cut by hand', parts: nestResult.unplaced.length })
  const toggleSheet = (n: number) => setSheetsOn(prev => {
    const next = new Set(prev ?? sheetNos.map(s => s.n))
    if (next.has(n)) next.delete(n); else next.add(n)
    return next.size === sheetNos.length ? null : next
  })

  return (
    <LabelPrintPanel items={picked} st={st} update={update} makePdf={labelsPdf}
      fileName={`${snap.jobNumber ?? 'job'} labels ${st.w}x${st.h}.pdf`} loading={loading} error={error}>
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-ink">Content</h3>
          {([['cut', 'Cut size (less edging)'], ['finished', 'Finished size']] as const).map(([v, txt]) => (
            <label key={v} className="flex items-center gap-2 text-xs text-ink-muted cursor-pointer">
              <input type="radio" checked={st.dims === v} onChange={() => update({ dims: v })} /> {txt}
            </label>
          ))}
          <label className="flex items-center gap-2 text-xs text-ink-muted cursor-pointer">
            <input type="checkbox" checked={st.picture} onChange={e => update({ picture: e.target.checked })} /> Part picture (edging + holes)
          </label>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-ink">Which labels</h3>
          <div className="flex flex-wrap gap-1.5">
            {sheetNos.map((s, i) => {
              const on = !sheetsOn || sheetsOn.has(s.n)
              return (
                <Fragment key={s.n}>
                  {(i === 0 || sheetNos[i - 1].mat !== s.mat) && <span className="w-full text-[10px] text-ink-subtle mt-1">{s.mat}</span>}
                  <PickChip on={on} onClick={() => toggleSheet(s.n)}>
                    {typeof s.no === 'number' ? `Sheet ${s.no}` : s.no} <span className="text-ink-subtle">({s.parts})</span>
                  </PickChip>
                </Fragment>
              )
            })}
          </div>
          <input className={`${sel} w-full`} placeholder="Part numbers on those sheets, e.g. 3, 7-9 (blank = all)" value={partsText} onChange={e => setPartsText(e.target.value)} />
        </section>

        {loading && <p className="text-xs text-ink-subtle">Reading holes and names…</p>}
    </LabelPrintPanel>
  )
}
