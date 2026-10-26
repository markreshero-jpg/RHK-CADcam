'use client'
// Job Reports → "One PDF" (Mark, 2026-10-26): every room's pages go into one
// document instead of one file per room. The batch queue (useBatchDownload) runs
// the rooms one at a time; while a combined run is on, each report asks
// reportDoc() for its document (the shared one, a new page started at its paper
// size) and saveReport() is a no-op, then ReportsModal saves the lot once.
import { jsPDF } from 'jspdf'

let combined: { doc: jsPDF | null } | null = null

export function startCombined() { combined = { doc: null } }

/** Save the combined document (if any room added pages) and end the run. */
export function finishCombined(filename: string) {
  const doc = combined?.doc
  combined = null
  doc?.save(filename)
}

/** End the run without saving (stopped part-way). */
export function cancelCombined() { combined = null }

/** The document a report draws into: its own, or the shared one with a fresh page. */
export function reportDoc(w: number, h: number): jsPDF {
  const orientation = w >= h ? 'landscape' : 'portrait'
  if (!combined) return new jsPDF({ unit: 'mm', format: [w, h], orientation })
  if (!combined.doc) combined.doc = new jsPDF({ unit: 'mm', format: [w, h], orientation })
  else combined.doc.addPage([w, h], orientation)
  return combined.doc
}

/** Download a report's own document; the shared one waits for finishCombined. */
export function saveReport(doc: jsPDF, filename: string) {
  if (combined && combined.doc === doc) return
  doc.save(filename)
}
