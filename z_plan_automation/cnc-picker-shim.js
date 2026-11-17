// Paste into the optimiser tab (claude-in-chrome javascript_tool) before Stage 7 Download all /
// Download PDF. Replaces the File System Access pickers with fakes that POST every file to
// cnc-receiver.mjs (127.0.0.1:8765), keeping the folder structure the app writes.
// Re-run after any tab reload.
(() => {
  const PORT = 8765
  const post = async (name, blob) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/save?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob })
    if (!r.ok) throw new Error(`receiver ${r.status}: ${await r.text()}`)
  }
  const writable = (name) => {
    const parts = []
    return {
      write: async (d) => { parts.push(d && d.type === 'write' ? d.data : d) },
      close: async () => post(name, new Blob(parts)),
      abort: async () => {},
    }
  }
  const fileHandle = (name) => ({ kind: 'file', name: name.split('/').pop(), createWritable: async () => writable(name) })
  const dirHandle = (prefix) => ({
    kind: 'directory', name: prefix.split('/').filter(Boolean).pop() || 'out',
    getDirectoryHandle: async (n) => dirHandle(`${prefix}${n}/`),
    getFileHandle: async (n) => fileHandle(`${prefix}${n}`),
    queryPermission: async () => 'granted', requestPermission: async () => 'granted',
    values: async function* () {}, entries: async function* () {}, keys: async function* () {},
  })
  window.showDirectoryPicker = async () => dirHandle('')
  window.showSaveFilePicker = async (opts) => fileHandle((opts && opts.suggestedName) || 'download.pdf')
  window.__cncShim = true
  return 'picker shim installed'
})()
