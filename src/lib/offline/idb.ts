// The device's offline database (z_offline/OFFLINE-SPEC.md). One IndexedDB, `rhk-offline`:
//   outbox — changes waiting to be sent (step 1)
//   rooms  — the last copy of each room opened on this device (step 2)

const DB_NAME = 'rhk-offline'
const VERSION = 2
export type StoreName = 'outbox' | 'rooms'

let dbPromise: Promise<IDBDatabase | null> | null = null

export function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB_NAME, VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'key' })
        if (!db.objectStoreNames.contains('rooms')) db.createObjectStore('rooms', { keyPath: 'roomId' })
      }
      req.onsuccess = () => {
        // Another tab upgrading the database: let it, and reopen next time.
        req.result.onversionchange = () => { req.result.close(); dbPromise = null }
        resolve(req.result)
      }
      req.onerror = () => { console.error('[offline] IndexedDB open failed', req.error); resolve(null) }
      req.onblocked = () => resolve(null)
    } catch (e) { console.error('[offline] IndexedDB unavailable', e); resolve(null) }
  })
  return dbPromise
}

export async function idbPut(store: StoreName, value: unknown): Promise<boolean> {
  const db = await openDb(); if (!db) return false
  return new Promise(res => {
    try {
      const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value)
      tx.oncomplete = () => res(true); tx.onerror = () => { console.error('[offline] save failed', store, tx.error); res(false) }
    } catch (e) { console.error('[offline] save failed', store, e); res(false) }
  })
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  const db = await openDb(); if (!db) return
  await new Promise<void>(res => {
    try {
      const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key)
      tx.oncomplete = () => res(); tx.onerror = () => res()
    } catch { res() }
  })
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await openDb(); if (!db) return undefined
  return new Promise(res => {
    try {
      const req = db.transaction(store, 'readonly').objectStore(store).get(key)
      req.onsuccess = () => res(req.result as T | undefined); req.onerror = () => res(undefined)
    } catch { res(undefined) }
  })
}

export async function idbAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb(); if (!db) return []
  return new Promise(res => {
    try {
      const req = db.transaction(store, 'readonly').objectStore(store).getAll()
      req.onsuccess = () => res((req.result ?? []) as T[]); req.onerror = () => res([])
    } catch { res([]) }
  })
}

export async function idbClear(store: StoreName): Promise<void> {
  const db = await openDb(); if (!db) return
  await new Promise<void>(res => {
    try {
      const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).clear()
      tx.oncomplete = () => res(); tx.onerror = () => res()
    } catch { res() }
  })
}
