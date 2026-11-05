'use client'

// ============================================================
// Shared label print panel — optimiser Stage 7 part labels and the Hardware
// Pick List cut stickers (z_takeoff T5). Left: label size + printer + offset
// (remembered per browser, one setting for both), the caller's own sections,
// then Print / Download PDF. Right: the PDF preview, printed from its iframe.
// The printer itself is picked in the browser's print dialog — a web page
// can't choose one.
// ============================================================

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { jsPDF as JsPDF } from 'jspdf'
import {
  LABEL_SIZES, DEFAULT_LABEL_SETTINGS, LABEL_SETTINGS_KEY, loadLabelSettings, a4Grid, type LabelSettings,
} from '@/src/lib/optimiser/labels'
import { pickSaveFile, saveBlob } from '@/src/lib/saveAs'

export const labelSel = 'bg-surface-2 border border-edge-strong rounded px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-accent'
const num = 'w-20 bg-surface-2 border border-edge-strong rounded px-2 py-1 text-sm text-ink focus:outline-none focus:border-accent'

/** The remembered label settings; `update` saves them for the next print. */
export function useLabelSettings(): [LabelSettings, (patch: Partial<LabelSettings>) => void] {
  const [st, setSt] = useState<LabelSettings>(DEFAULT_LABEL_SETTINGS)
  useEffect(() => { setSt(loadLabelSettings()) }, [])
  const update = (patch: Partial<LabelSettings>) => setSt(prev => {
    const next = { ...prev, ...patch }
    try { localStorage.setItem(LABEL_SETTINGS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    return next
  })
  return [st, update]
}

/** "3, 7-9" → {3,7,8,9}; blank → null (all). */
export function parseNumberList(s: string): Set<number> | null {
  const out = new Set<number>()
  for (const bit of s.split(/[\s,]+/).filter(Boolean)) {
    const m = bit.match(/^(\d+)(?:-(\d+))?$/)
    if (!m) continue
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i)
  }
  return out.size ? out : null
}

/** Toggle chip used for "which labels" picks (sheets, rooms). */
export function PickChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick}
      className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${on ? 'border-accent bg-accent/10 text-ink' : 'border-edge-strong text-ink-subtle hover:bg-surface-2'}`}>
      {children}
    </button>
  )
}

export function LabelPrintPanel<T>({
  items, st, update, makePdf, fileName, noun = 'label', loading, error: outerError, emptyText, children,
}: {
  items: T[]                 // the picked labels, in print order
  st: LabelSettings
  update: (patch: Partial<LabelSettings>) => void
  makePdf: (items: T[], st: LabelSettings) => Promise<JsPDF>   // keep it stable (module function)
  fileName: string           // Download PDF suggested name
  noun?: string              // "label" / "sticker"
  loading?: boolean
  error?: string | null
  emptyText?: string
  children?: ReactNode       // the caller's sections (content, which labels)
}) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)

  // Rebuild the preview PDF whenever the pick or the settings change.
  useEffect(() => {
    if (!items.length) { setPdfUrl(null); return }
    let dead = false, url: string | null = null
    setError(null)
    makePdf(items, st).then(doc => {
      if (dead) return
      url = URL.createObjectURL(doc.output('blob'))
      setPdfUrl(url)
    }).catch(e => { if (!dead) setError(e instanceof Error ? e.message : String(e)) })
    return () => { dead = true; if (url) URL.revokeObjectURL(url) }
  }, [items, st, makePdf])   // makePdf: a module function, stable

  const print = () => {
    const w = frameRef.current?.contentWindow
    if (w) { w.focus(); w.print() }
  }
  const downloadPdf = async () => {
    if (!pdfUrl) return
    // Save As (asks first, on the click), else a plain download.
    const target = await pickSaveFile(fileName)
    if (target === null) return
    await saveBlob(await (await fetch(pdfUrl)).blob(), fileName, target)
  }

  const grid = st.printer === 'a4' ? a4Grid(st.w, st.h) : null
  const err = outerError ?? error
  const plural = (n: number) => `${n} ${noun}${n === 1 ? '' : 's'}`

  return (
    <div className="h-full flex overflow-hidden">
      {/* Settings */}
      <div className="flex-none w-[340px] border-r border-edge overflow-y-auto px-6 py-4 space-y-5">
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-ink">Label size</h3>
          <select className={`${labelSel} w-full`} value={st.sizeId}
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
          <p className="text-[11px] text-ink-subtle">The layout is designed at 102 × 48 and scales to fit. Same setting as the optimiser&apos;s part labels.</p>
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

        {children}

        <div className="flex items-center gap-2 pt-1">
          <button onClick={print} disabled={!pdfUrl}
            className="px-4 py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
            Print {plural(items.length)}
          </button>
          <button onClick={() => void downloadPdf()} disabled={!pdfUrl}
            className="px-3 py-1.5 text-xs rounded-lg border border-edge-strong text-ink-muted hover:bg-surface-2 disabled:opacity-50 transition-colors">Download PDF</button>
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
      </div>

      {/* Preview */}
      <div className="flex-1 overflow-hidden bg-surface-2">
        {pdfUrl
          ? <iframe ref={frameRef} src={pdfUrl} title={`${noun}s preview`} className="w-full h-full border-0" />
          : <p className="text-xs text-ink-subtle text-center py-12">{loading ? `Building ${noun}s…` : (emptyText ?? `No ${noun}s picked.`)}</p>}
      </div>
    </div>
  )
}
