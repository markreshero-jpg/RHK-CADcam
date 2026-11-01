'use client'
// Save As (Mark, 2026-11-01): Download opens the system's save dialog so a file
// can go anywhere, not just Downloads. Uses the File System Access API (Chrome /
// Edge). The dialog only opens straight from a click (user activation), so callers
// ask BEFORE building a slow PDF, then write to the picked file / folder.
// Browsers without the API (Safari, Firefox, iPhone) and headless automation
// (navigator.webdriver) keep the plain browser download.

/** Where a Download click said to save: one file, or a folder for several. */
export type SaveTarget = { file: FileSystemFileHandle } | { dir: FileSystemDirectoryHandle }

type PickerWindow = Window & {
  showSaveFilePicker?: (o: { suggestedName?: string; id?: string; types?: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle>
  showDirectoryPicker?: (o: { id?: string; mode?: 'readwrite' }) => Promise<FileSystemDirectoryHandle>
}
type WritableHandle = FileSystemFileHandle & { createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }

/** The dialog id: Chrome reopens it in the folder last used for it. */
const PICKER_ID = 'rhk-downloads'

function picker(): PickerWindow | null {
  if (typeof window === 'undefined' || navigator.webdriver) return null
  const w = window as PickerWindow
  return w.showSaveFilePicker ? w : null
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

/**
 * Ask where to save one file. undefined = no dialog here (plain download);
 * null = the user cancelled (don't save at all).
 */
export async function pickSaveFile(name: string): Promise<SaveTarget | null | undefined> {
  const w = picker()
  if (!w) return undefined
  const ext = name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
  const types = ext === 'pdf' ? [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }] : undefined
  try {
    return { file: await w.showSaveFilePicker!({ suggestedName: name, id: PICKER_ID, types }) }
  } catch (e) {
    if (isAbort(e)) return null
    console.warn('[saveAs] save dialog failed, using a plain download', e)
    return undefined
  }
}

/** Ask for a folder to save several files into (same undefined / null meaning). */
export async function pickSaveFolder(): Promise<SaveTarget | null | undefined> {
  const w = picker()
  if (!w?.showDirectoryPicker) return undefined
  try {
    return { dir: await w.showDirectoryPicker({ id: PICKER_ID, mode: 'readwrite' }) }
  } catch (e) {
    if (isAbort(e)) return null
    console.warn('[saveAs] folder dialog failed, using plain downloads', e)
    return undefined
  }
}

function plainDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Write blob to the picked file / into the picked folder, else a plain download. */
export async function saveBlob(blob: Blob, name: string, target?: SaveTarget) {
  try {
    const handle = !target ? null
      : 'file' in target ? target.file
      : await target.dir.getFileHandle(name, { create: true })
    if (handle) {
      const out = await (handle as WritableHandle).createWritable()
      await out.write(blob)
      await out.close()
      return
    }
  } catch (e) {
    console.warn('[saveAs] writing the picked file failed, using a plain download', e)
  }
  plainDownload(blob, name)
}

/** One-click Save As for a file that's ready now (asks, then writes). */
export async function saveBlobAs(blob: Blob, name: string) {
  const t = await pickSaveFile(name)
  if (t === null) return
  await saveBlob(blob, name, t)
}
