'use client'
// Job Reports → "One PDF" (Mark, 2026-10-26): every room's pages go into one
// document instead of one file per room. The batch queue (useBatchDownload) runs
// the rooms one at a time; while a combined run is on, each report asks
// reportDoc() for its document (the shared one, a new page started at its paper
// size) and saveReport() is a no-op, then ReportsModal saves the lot once.
//
// Save As (Mark, 2026-11-01): a Download click first asks where to save
// (armSave / armSaveFolder — the dialog must open on the click itself, before the
// PDF is built), and the save writes there. One picked file is used once; a
// picked folder takes every file of a batch run until disarmSave().
//
// Print (Mark, 2026-11-02): armPrint() instead of armSave — the same PDF is built,
// then sent to the browser's print dialog (hidden iframe) instead of saved.
import { jsPDF } from 'jspdf'
import { pickSaveFile, pickSaveFolder, saveBlob, type SaveTarget } from '@/src/lib/saveAs'
import { useTutorial } from '@/src/lib/tutorial/store'

let combined: { doc: jsPDF | null } | null = null
let armed: SaveTarget | 'print' | undefined

/** Ask where to save `name`; false = the user cancelled, so don't build it. */
export async function armSave(name: string): Promise<boolean> {
  const t = await pickSaveFile(name)
  if (t === null) return false
  armed = t
  return true
}

/** Ask for a folder for a batch run's files; false = cancelled. */
export async function armSaveFolder(): Promise<boolean> {
  const t = await pickSaveFolder()
  if (t === null) return false
  armed = t
  return true
}

/** Print the next report (or the combined run) instead of saving it. */
export function armPrint() {
  armed = 'print'
  useTutorial.getState().emit('report_print')   // tutorial report_print_presets
}

/** Open a PDF in the browser's print dialog; a new tab if the frame can't print. */
function printBlob(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  frame.src = url
  frame.onload = () => {
    try { frame.contentWindow?.focus(); frame.contentWindow?.print() } catch { window.open(url, '_blank') }
  }
  document.body.appendChild(frame)
  // The print dialog holds the frame open; drop it well after.
  setTimeout(() => { frame.remove(); URL.revokeObjectURL(url) }, 10 * 60_000)
}

/** Forget the picked file / folder (a batch run ended or was stopped). */
export function disarmSave() { armed = undefined }

function save(doc: jsPDF, filename: string) {
  const t = armed
  if (t === 'print') { armed = undefined; printBlob(doc.output('blob')); return }
  if (t && 'file' in t) armed = undefined   // a picked file takes one save
  void saveBlob(doc.output('blob'), filename, t)
}

export function startCombined() { combined = { doc: null } }

/** Save the combined document (if any room added pages) and end the run. */
export function finishCombined(filename: string) {
  const doc = combined?.doc
  combined = null
  if (doc) save(doc, filename)
  armed = undefined
}

/** End the run without saving (stopped part-way). */
export function cancelCombined() { combined = null; armed = undefined }

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
  save(doc, filename)
}
