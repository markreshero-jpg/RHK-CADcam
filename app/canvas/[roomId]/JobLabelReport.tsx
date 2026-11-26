'use client'

// ============================================================
// Job Label report — job number + job name on a label, printed in one HALF of
// the label only (~24 mm of a 102 × 48), so the other half stays blank.
// Same label size / printer / offset settings as the optimiser's part labels
// and the cut stickers (LabelPrintPanel). Mark 2026-11-26.
// ============================================================

import { useMemo, useState } from 'react'
import type { jsPDF as JsPDF } from 'jspdf'
import type { Project } from '@/src/lib/types'
import { labelPagesPdf, type LabelSettings } from '@/src/lib/optimiser/labels'
import { LabelPrintPanel, labelSel, useLabelSettings } from '@/src/components/labels/LabelPrintPanel'

export interface JobLabel {
  jobNo: string
  name: string
  half: 'top' | 'bottom'
}

const BASE_W = 102, BASE_H = 48, BAND = 24   // design units (mm at 102 × 48)

/** One label at (ox, oy): job no + name inside the chosen 24 mm half. */
function drawJobLabel(doc: JsPDF, d: JobLabel, ox: number, oy: number, W: number, H: number): void {
  const kx = W / BASE_W, ky = H / BASE_H, kf = Math.min(kx, ky)
  const y0 = d.half === 'top' ? 0 : BASE_H - BAND
  const X = (x: number) => ox + x * kx, Y = (y: number) => oy + (y0 + y) * ky
  const fs = (f: number) => doc.setFontSize(f * kf)
  const maxW = 96 * kx
  doc.setTextColor(0)

  // Job number, big.
  doc.setFont('helvetica', 'bold')
  let f = 26
  fs(f)
  while (f > 12 && doc.getTextWidth(d.jobNo) > maxW) { f -= 1; fs(f) }
  doc.text(d.jobNo, X(3), Y(10.5))

  // Job name: one line shrinking to 10 pt, else two lines at 9 pt.
  doc.setFont('helvetica', 'normal')
  f = 14
  fs(f)
  while (f > 10 && doc.getTextWidth(d.name) > maxW) { f -= 0.5; fs(f) }
  if (doc.getTextWidth(d.name) <= maxW) {
    doc.text(d.name, X(3), Y(19.5))
  } else {
    fs(9)
    const lines: string[] = doc.splitTextToSize(d.name, maxW)
    lines.slice(0, 2).forEach((ln, i) => doc.text(ln, X(3), Y(16.5 + i * 4.2)))
  }
}

function jobLabelsPdf(items: JobLabel[], st: LabelSettings): Promise<JsPDF> {
  return labelPagesPdf(items, st, (doc, d, x, y) => drawJobLabel(doc, d, x, y, st.w, st.h))
}

export default function JobLabelReport({ project }: { project: Project | null }) {
  const [st, update] = useLabelSettings()
  const [jobNo, setJobNo] = useState(project?.job_number ?? '')
  const [name, setName] = useState(project?.name ?? '')
  const [half, setHalf] = useState<'top' | 'bottom'>('top')
  const [copies, setCopies] = useState(1)

  const items = useMemo<JobLabel[]>(() => {
    if (!jobNo.trim() && !name.trim()) return []
    const one = { jobNo: jobNo.trim(), name: name.trim(), half }
    return Array.from({ length: Math.max(1, Math.min(200, copies)) }, () => one)
  }, [jobNo, name, half, copies])

  const fileBase = project?.job_number || project?.name || 'job'

  return (
    <div className="-m-4 bg-surface text-ink" style={{ height: 'calc(100% + 2rem)' }}>
      <LabelPrintPanel items={items} st={st} update={update} makePdf={jobLabelsPdf}
        fileName={`${fileBase} job label ${st.w}x${st.h}.pdf`} emptyText="Type a job number or name.">
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-ink">Label text</h3>
          <input className={`${labelSel} w-full`} value={jobNo} onChange={e => setJobNo(e.target.value)} placeholder="Job number" />
          <input className={`${labelSel} w-full`} value={name} onChange={e => setName(e.target.value)} placeholder="Job name" />
          <p className="text-[11px] text-ink-subtle">Filled from the job; edit here for this print only.</p>
        </section>
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-ink">Print in</h3>
          {(['top', 'bottom'] as const).map(h => (
            <label key={h} className="flex items-center gap-2 text-xs text-ink-muted cursor-pointer">
              <input type="radio" checked={half === h} onChange={() => setHalf(h)} />
              {h === 'top' ? 'Top half' : 'Bottom half'} <span className="text-ink-subtle">(~{Math.round(st.h / 2)} mm)</span>
            </label>
          ))}
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            Copies
            <input type="number" min={1} max={200} value={copies} onChange={e => setCopies(Math.max(1, Number(e.target.value) || 1))}
              className="w-20 bg-surface-2 border border-edge-strong rounded px-2 py-1 text-sm text-ink focus:outline-none focus:border-accent" />
          </div>
        </section>
      </LabelPrintPanel>
    </div>
  )
}
