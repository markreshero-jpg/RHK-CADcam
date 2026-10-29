'use client'

// ============================================================
// Stage 7 — Labels & Cut Sheets. Two tabs: part labels (Cabinet Vision
// layout, src/lib/optimiser/labels.ts) and the cut sheets report (CutSheetsPanel).
// One label per nested part, numbered sheet-major like the sheet prints.
// Label size + printer mode are remembered per browser. The printer itself
// is picked in the browser's print dialog — a web page can't choose one.
// ============================================================

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import CutSheetsPanel from './CutSheetsPanel'
import { useOptiStore } from '@/src/lib/optimiser/store'
import { loadSheetDrills, nestedParts } from '@/src/lib/optimiser/sheetDrills'
import {
  LABEL_SIZES, DEFAULT_LABEL_SETTINGS, loadLabelLookups, buildAllLabels, labelsPdf, a4Grid, sheetNumbers,
  type LabelSettings, type LabelData,
} from '@/src/lib/optimiser/labels'

const STORE_KEY = 'rhk.optimiser.labelSettings'
const sel = 'bg-surface-2 border border-edge-strong rounded px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-accent'
const num = 'w-20 bg-surface-2 border border-edge-strong rounded px-2 py-1 text-sm text-ink focus:outline-none focus:border-accent'

function loadSettings(): LabelSettings {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) return { ...DEFAULT_LABEL_SETTINGS, ...JSON.parse(raw) }
  } catch { /* private window / blocked storage */ }
  return DEFAULT_LABEL_SETTINGS
}

/** "3, 7-9" → {3,7,8,9}; blank → null (all). */
function parseParts(s: string): Set<number> | null {
  const out = new Set<number>()
  for (const bit of s.split(/[\s,]+/).filter(Boolean)) {
    const m = bit.match(/^(\d+)(?:-(\d+))?$/)
    if (!m) continue
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i)
  }
  return out.size ? out : null
}

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

  const [st, setSt] = useState<LabelSettings>(DEFAULT_LABEL_SETTINGS)
  useEffect(() => { setSt(loadSettings()) }, [])
  const update = (patch: Partial<LabelSettings>) => setSt(prev => {
    const next = { ...prev, ...patch }
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    return next
  })

  const [labels, setLabels] = useState<{ cut: LabelData[]; finished: LabelData[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sheetsOn, setSheetsOn] = useState<Set<number> | null>(null)   // null = all
  const [partsText, setPartsText] = useState('')
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)

  // Label data: holes (drilling already synced by the nest) + the names the
  // snapshot doesn't carry. Built for cut and finished sizes once per nest.
  useEffect(() => {
    if (!nestResult?.sheets.length) return
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

  // Rebuild the preview PDF whenever the pick or the settings change.
  useEffect(() => {
    if (!picked.length) { setPdfUrl(null); return }
    let dead = false, url: string | null = null
    labelsPdf(picked, st).then(doc => {
      if (dead) return
      url = URL.createObjectURL(doc.output('blob'))
      setPdfUrl(url)
    }).catch(e => setError(e instanceof Error ? e.message : String(e)))
    return () => { dead = true; if (url) URL.revokeObjectURL(url) }
  }, [picked, st])

  const print = () => {
    const w = frameRef.current?.contentWindow
    if (w) { w.focus(); w.print() }
  }
  const downloadPdf = () => {
    if (!pdfUrl) return
    const a = document.createElement('a')
    a.href = pdfUrl
    a.download = `${snap.jobNumber ?? 'job'} labels ${st.w}x${st.h}.pdf`
    a.click()
  }

  if (!nestResult?.sheets.length) {
    return <p className="text-xs text-ink-subtle text-center py-12">Nothing nested — run Stage 4 first.</p>
  }

  const nums = sheetNumbers(nestResult.sheets)
  const matName = (id: string | null) => (id ? snap.materials.find(m => m.id === id)?.name : null) ?? 'No material'
  const sheetNos = nestResult.sheets.map((s, i) => ({ n: i + 1, no: nums.get(s.index)!.no, mat: matName(s.materialId), parts: s.placements.length }))
  const grid = st.printer === 'a4' ? a4Grid(st.w, st.h) : null
  const toggleSheet = (n: number) => setSheetsOn(prev => {
    const next = new Set(prev ?? sheetNos.map(s => s.n))
    if (next.has(n)) next.delete(n); else next.add(n)
    return next.size === sheetNos.length ? null : next
  })

  return (
    <div className="h-full flex overflow-hidden">
      {/* Settings */}
      <div className="flex-none w-[340px] border-r border-edge overflow-y-auto px-6 py-4 space-y-5">
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-ink">Label size</h3>
          <select className={`${sel} w-full`} value={st.sizeId}
            onChange={e => {
              const s = LABEL_SIZES.find(x => x.id === e.target.value)!
              update(s.id === 'custom' ? { sizeId: 'custom' } : { sizeId: s.id, w: s.w, h: s.h })
            }}>
            {LABEL_SIZES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {st.sizeId === 'custom' && (
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <input type="number" min={20} max={300} className={num} value={st.w} onChange={e => update({ w: Math.max(20, Number(e.target.value) || 0) })} />
              ×
              <input type="number" min={15} max={300} className={num} value={st.h} onChange={e => update({ h: Math.max(15, Number(e.target.value) || 0) })} />
              mm (W × H)
            </div>
          )}
          <p className="text-[11px] text-ink-subtle">The layout is designed at 102 × 48 and scales to fit.</p>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-ink">Printer</h3>
          {([['roll', 'Label printer — one label per page'], ['a4', 'A4 sheet — labels tiled']] as const).map(([v, txt]) => (
            <label key={v} className="flex items-center gap-2 text-xs text-ink-muted cursor-pointer">
              <input type="radio" checked={st.printer === v} onChange={() => update({ printer: v })} /> {txt}
            </label>
          ))}
          {grid && <p className="text-[11px] text-ink-subtle">{grid.cols} × {grid.rows} = {grid.cols * grid.rows} labels per A4 page, with cut guides.</p>}
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            Offset
            <input type="number" step={0.5} className={num} value={st.offsetX} onChange={e => update({ offsetX: Number(e.target.value) || 0 })} title="Right (mm)" />
            <input type="number" step={0.5} className={num} value={st.offsetY} onChange={e => update({ offsetY: Number(e.target.value) || 0 })} title="Down (mm)" />
            mm
          </div>
          <p className="text-[11px] text-ink-subtle">
            Pick the label printer in the print dialog, with the paper size set to the label size and the scale at 100% / Actual size.
            Use the offset (right, down) if the print sits off the label.
          </p>
        </section>

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
                  <button onClick={() => toggleSheet(s.n)}
                    className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${on ? 'border-accent bg-accent/10 text-ink' : 'border-edge-strong text-ink-subtle hover:bg-surface-2'}`}>
                    Sheet {s.no} <span className="text-ink-subtle">({s.parts})</span>
                  </button>
                </Fragment>
              )
            })}
          </div>
          <input className={`${sel} w-full`} placeholder="Part numbers on those sheets, e.g. 3, 7-9 (blank = all)" value={partsText} onChange={e => setPartsText(e.target.value)} />
        </section>

        <div className="flex items-center gap-2 pt-1">
          <button onClick={print} disabled={!pdfUrl}
            className="px-4 py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
            Print {picked.length} label{picked.length === 1 ? '' : 's'}
          </button>
          <button onClick={downloadPdf} disabled={!pdfUrl}
            className="px-3 py-1.5 text-xs rounded-lg border border-edge-strong text-ink-muted hover:bg-surface-2 disabled:opacity-50 transition-colors">Download PDF</button>
        </div>
        {loading && <p className="text-xs text-ink-subtle">Reading holes and names…</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      {/* Preview */}
      <div className="flex-1 overflow-hidden bg-surface-2">
        {pdfUrl
          ? <iframe ref={frameRef} src={pdfUrl} title="Labels preview" className="w-full h-full border-0" />
          : <p className="text-xs text-ink-subtle text-center py-12">{loading ? 'Building labels…' : 'No labels picked.'}</p>}
      </div>
    </div>
  )
}
