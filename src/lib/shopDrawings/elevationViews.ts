// Which elevations the print reports draw (Elevation Views + the shop drawings package).
// Every standard wall's face, in wall order; then islands. A wall's back side is
// added when cabinets stand on it (back-face runs, islands' far side). Keys: the
// face keeps the bare wall id (stored ticks still match), the back is `<id>:back`.

import { cabWallSide } from '../geometry'
import type { CabinetInstance, Wall } from '../types'

export type ElevSide = 'face' | 'back'
export interface ElevView { key: string; wall: Wall; side: ElevSide; name: string }

export function elevationViews(walls: Wall[], cabinets: Pick<CabinetInstance, 'wall_id' | 'rotation'>[]): ElevView[] {
  const has = (w: Wall, side: ElevSide) => cabinets.some(c => c.wall_id === w.id && cabWallSide(c as CabinetInstance, w) === side)
  const order = (a: Wall, b: Wall) => a.sort_order - b.sort_order
  const out: ElevView[] = []
  const add = (w: Wall, side: ElevSide) =>
    out.push({ key: side === 'face' ? w.id : `${w.id}:back`, wall: w, side, name: side === 'face' ? w.name : `${w.name} — back` })
  for (const w of walls.filter(w => w.wall_type === 'standard').sort(order)) {
    add(w, 'face')
    if (has(w, 'back')) add(w, 'back')
  }
  for (const w of walls.filter(w => w.wall_type === 'island').sort(order)) {
    // An empty island still gets its face sheet, so it doesn't silently vanish from the package.
    if (has(w, 'face') || !has(w, 'back')) add(w, 'face')
    if (has(w, 'back')) add(w, 'back')
  }
  return out
}
