// A room's CAD as a picture for the model (z_ai_helper Q9). Loads one view's CAD rows
// (plan, or one wall's elevation), draws them with cadSvg and turns that into a PNG with
// sharp. Run inside withSupabaseRead().

import { supabase } from '@/src/lib/supabase'
import { cadSvg, cadText, sketchCount, type CadRow, type CadWall } from '../cadImage'

export interface CadPictureResult {
  /** base64 PNG, or null when the view has no CAD. */
  png: string | null
  /** What the picture shows + the typed text / dims, as words. */
  text: string
}

type Ann = CadRow & { view: string; wall_id: string | null; cabinet_id: string | null }

/** Which views of the room have CAD, e.g. "plan: 111 items (111 sketch strokes); Wall 2 elevation: 4 items". */
export async function cadViews(roomId: string): Promise<string> {
  const [{ data: anns }, { data: walls }] = await Promise.all([
    supabase.from('room_annotations').select('kind, geom, view, wall_id, cabinet_id').eq('room_id', roomId),
    supabase.from('walls').select('id, name').eq('room_id', roomId),
  ])
  const rows = (anns ?? []) as Ann[]
  if (!rows.length) return 'No CAD in this room.'
  const wallName = new Map(((walls ?? []) as { id: string; name: string }[]).map(w => [w.id, w.name]))
  const groups = new Map<string, Ann[]>()
  for (const r of rows) {
    if (r.view === 'cabinet_sheet') continue
    const k = r.view === 'plan' ? 'plan' : `${wallName.get(r.wall_id ?? '') ?? 'unknown wall'} elevation`
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  return [...groups].map(([k, g]) => {
    const sk = sketchCount(g)
    return `${k}: ${g.length} item${g.length === 1 ? '' : 's'}${sk ? ` (${sk} hand-sketched stroke${sk === 1 ? '' : 's'})` : ''}`
  }).join('; ') || 'No plan / elevation CAD in this room.'
}

/** Draw one view: 'plan', or an elevation by wall name. */
export async function loadCadPicture(roomId: string, view: { view: 'plan' } | { view: 'elevation'; wall: string }): Promise<CadPictureResult> {
  const { data: walls, error: wErr } = await supabase.from('walls').select('id, name, pos_x, pos_y, angle, length, thickness').eq('room_id', roomId)
  if (wErr) throw new Error(`walls: ${wErr.message}`)
  const wallRows = (walls ?? []) as (CadWall & { id: string })[]
  let q = supabase.from('room_annotations').select('kind, geom, text, style, view, wall_id, cabinet_id').eq('room_id', roomId).order('sort_order').order('created_at')
  let title = 'Plan'
  if (view.view === 'plan') q = q.eq('view', 'plan')
  else {
    const w = wallRows.find(x => x.name.toLowerCase() === view.wall.trim().toLowerCase())
    if (!w) return { png: null, text: `No wall "${view.wall}" in this room. Walls: ${wallRows.map(x => x.name).join(', ') || 'none'}.` }
    q = q.eq('view', 'elevation').eq('wall_id', w.id)
    title = `${w.name} elevation`
  }
  const { data, error } = await q
  if (error) throw new Error(`room_annotations: ${error.message}`)
  const rows = (data ?? []) as Ann[]
  const pic = cadSvg(rows, view.view === 'plan' ? { walls: wallRows, title } : { flipY: true, title })
  if (!pic) return { png: null, text: `No CAD on the ${title.toLowerCase()}. ${await cadViews(roomId)}` }
  const sharp = (await import('sharp')).default   // loaded only when a picture is made
  const png = (await sharp(Buffer.from(pic.svg)).png({ compressionLevel: 9 }).toBuffer()).toString('base64')
  const typed = cadText(rows)
  const sk = sketchCount(rows)
  return {
    png,
    text: [
      `${title}: ${pic.items} CAD item${pic.items === 1 ? '' : 's'}${sk ? `, ${sk} of them hand-sketched strokes (Sketch tool) — read the handwriting, numbers and shapes from the picture` : ''}.`,
      'The grey grid is labelled in mm' + (view.view === 'plan' ? ' (room coordinates; the room\'s walls are the faint grey bands)' : ' (x along the wall from its start, y height off the floor)') + '. Sketches are rarely to scale — trust the written numbers over the grid.',
      ...(typed.length ? ['Typed CAD (exact):', ...typed] : []),
    ].join('\n'),
  }
}
