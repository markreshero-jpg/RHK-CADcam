// Right-click → Insert list: the library items (WEP, BFK, …) offered beside a
// cabinet. Ticked in InsertFavouritesModal; a per-user convenience, so it lives in
// localStorage like the other canvas preferences. Name + class are kept with the
// id so the menu builds without loading the library.

export interface InsertFavourite { id: string; name: string; assembly_class: string }

const LS_KEY = 'canvas.insertFavourites'

export function loadInsertFavourites(): InsertFavourite[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const v = raw ? JSON.parse(raw) : []
    return Array.isArray(v) ? v.filter(f => f && typeof f.id === 'string' && typeof f.name === 'string') : []
  } catch { return [] }
}

export function saveInsertFavourites(favs: InsertFavourite[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(favs)) } catch { /* storage blocked */ }
}

/** Corner classes insert like their straight class (a WEP fits a wall corner too). */
export const foldClass = (cls: string) => cls.replace('_corner', '')
