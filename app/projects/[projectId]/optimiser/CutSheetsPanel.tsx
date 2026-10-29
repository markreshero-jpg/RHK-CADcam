'use client'

// ============================================================
// Stage 7 — Cut sheets (src/lib/optimiser/cutSheets.ts): one A4 page per
// nested sheet showing its cut pattern, plus a parts list. Part numbers
// restart on each sheet, matching the labels.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { useOptiStore } from '@/src/lib/optimiser/store'
import { loadSheetDrills, nestedParts } from '@/src/lib/optimiser/sheetDrills'
import { cutSheetsPdf } from '@/src/lib/optimiser/cutSheets'
import { runCode } from '@/src/lib/optimiser/savedRuns'

const STORE_KEY = 'rhk.optimiser.cutSheetSettings'

export default function CutSheetsPanel() {
  const snap = useOptiStore(s => s.snapshot)!
  const nestResult = useOptiStore(s => s.nestResult)
  const partIndex = useOptiStore(s => s.partIndex)
  const profileId = useOptiStore(s => s.profileId)
  const savedRun = useOptiStore(s => s.savedRun)
  const savedDrills = savedRun && savedRun.nest === nestResult ? savedRun.drillsBySheet : null
  const deductEb = snap.profiles.find(p => p.id === profileId)?.deduct_edgeband === true

  const [opts, setOpts] = useState({ holes: true, partsList: true })
  useEffect(() => {
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) setOpts(o => ({ ...o, ...JSON.parse(raw) })) } catch { /* ignore */ }
  }, [])
  const update = (patch: Partial<typeof opts>) => setOpts(prev => {
    const next = { ...prev, ...patch }
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    return next
  })

  const [drills, setDrills] = useState<Map<number, { x: number; y: number; diameter: number }[]> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sheetsOn, setSheetsOn] = useState<Set<number> | null>(null)   // null = all
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!nestResult?.sheets.length) return
    if (savedDrills) { setDrills(savedDrills); return }   // holes as machined
    let dead = false
    loadSheetDrills(nestedParts(snap.parts, partIndex), nestResult.sheets, { sync: true, deductEdgeband: deductEb })
      .then(r => { if (!dead) setDrills(r.bySheet) })
      .catch(e => { if (!dead) setError(e instanceof Error ? e.message : String(e)) })
    return () => { dead = true }
  }, [nestResult, partIndex, snap, deductEb, savedDrills])

  const scope = useMemo(() => {
    const rooms = [...new Set(nestedParts(snap.parts, partIndex).map(p => p.room_name).filter(Boolean))]
    return rooms.length ? rooms.join(', ') : 'All rooms'
  }, [snap, partIndex])

  useEffect(() => {
    if (!nestResult?.sheets.length || !drills) return
    if (sheetsOn && !sheetsOn.size) { setPdfUrl(null); return }
    let dead = false, url: string | null = null
    const matName = (id: string | null) => (id ? snap.materials.find(m => m.id === id)?.name : null) ?? ''
    cutSheetsPdf({
      nest: nestResult, partByUid: new Map(snap.parts.map(p => [p.uid, p])), drillsBySheet: drills, deductEb,
      jobNumber: snap.jobNumber, projectName: snap.projectName, scope, materialName: matName,
      fileNames: savedDrills ? nestResult.sheets.map(s => savedRun!.files.find(f => f.sheetIndex === s.index)?.fileName) : undefined,
      runCode: savedDrills && savedRun!.runNo != null ? runCode(snap.jobNumber, savedRun!.runNo) : null,
    }, { sheets: sheetsOn, holes: opts.holes, partsList: opts.partsList }).then(doc => {
      if (dead) return
      url = URL.createObjectURL(doc.output('blob'))
      setPdfUrl(url)
    }).catch(e => setError(e instanceof Error ? e.message : String(e)))
    return () => { dead = true; if (url) URL.revokeObjectURL(url) }
  }, [nestResult, drills, snap, deductEb, scope, sheetsOn, opts, savedDrills, savedRun])

  if (!nestResult?.sheets.length) {
    return <p className="text-xs text-ink-subtle text-center py-12">Nothing nested — run Stage 4 first.</p>
  }

  const sheetNos = nestResult.sheets.map((s, i) => ({ n: i + 1, parts: s.placements.length, eff: Math.round(s.efficiency * 100) }))
  const toggleSheet = (n: number) => setSheetsOn(prev => {
    const next = new Set(prev ?? sheetNos.map(s => s.n))
    if (next.has(n)) next.delete(n); else next.add(n)
    return next.size === sheetNos.length ? null : next
  })
  const print = () => { const w = frameRef.current?.contentWindow; if (w) { w.focus(); w.print() } }
  const downloadPdf = () => {
    if (!pdfUrl) return
    const a = document.createElement('a')
    a.href = pdfUrl; a.download = `${snap.jobNumber ?? 'job'} cut sheets.pdf`; a.click()
  }
  const count = sheetsOn ? sheetsOn.size : sheetNos.length

  return (
    <div className="h-full flex overflow-hidden">
      <div className="flex-none w-[340px] border-r border-edge overflow-y-auto px-6 py-4 space-y-5">
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-ink">Sheets</h3>
          <div className="flex flex-wrap gap-1.5">
            {sheetNos.map(s => {
              const on = !sheetsOn || sheetsOn.has(s.n)
              return (
                <button key={s.n} onClick={() => toggleSheet(s.n)}
                  className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${on ? 'border-accent bg-accent/10 text-ink' : 'border-edge-strong text-ink-subtle hover:bg-surface-2'}`}>
                  Sheet {s.n} <span className="text-ink-subtle">({s.parts} · {s.eff}%)</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-ink">Show</h3>
          <label className="flex items-center gap-2 text-xs text-ink-muted cursor-pointer">
            <input type="checkbox" checked={opts.holes} onChange={e => update({ holes: e.target.checked })} /> Drilling (red circles)
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-muted cursor-pointer">
            <input type="checkbox" checked={opts.partsList} onChange={e => update({ partsList: e.target.checked })} /> Parts list at the end
          </label>
          <p className="text-[11px] text-ink-subtle">
            One A4 landscape page per sheet: each part&apos;s cut outline, its number (restarting at 1 on each sheet, like the labels), cabinet, part and cut size. Grain-match blocks are boxed in their colour.
          </p>
        </section>

        <div className="flex items-center gap-2 pt-1">
          <button onClick={print} disabled={!pdfUrl}
            className="px-4 py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
            Print {count} sheet{count === 1 ? '' : 's'}
          </button>
          <button onClick={downloadPdf} disabled={!pdfUrl}
            className="px-3 py-1.5 text-xs rounded-lg border border-edge-strong text-ink-muted hover:bg-surface-2 disabled:opacity-50 transition-colors">Download PDF</button>
        </div>
        {!drills && !error && <p className="text-xs text-ink-subtle">Reading holes…</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      <div className="flex-1 overflow-hidden bg-surface-2">
        {pdfUrl
          ? <iframe ref={frameRef} src={pdfUrl} title="Cut sheets preview" className="w-full h-full border-0" />
          : <p className="text-xs text-ink-subtle text-center py-12">{drills ? 'No sheets picked.' : 'Building cut sheets…'}</p>}
      </div>
    </div>
  )
}
