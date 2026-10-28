// Named CAD layers (z_cad_layers/CAD-LAYERS-SPEC.md). The shop keeps one standard list
// (cad_layers); each job copies it the first time it opens (job_cad_layers) and keeps
// its own after that. On/off, colour (ByLayer) and print are for the whole job.
// An item's cad_layer_id null = the job's General (default) layer.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CadLayer, RoomAnnotation } from '../types'
import { BYLAYER_KEYS } from './style'

const LAYER_COLS = 'id, project_id, shop_layer_id, name, color, visible, print, is_default, sort_order'

/** Job rows to insert for shop layers the job doesn't have yet (Add from shop list, and
 *  the first-open copy). A copied default only stays the default if the job has none. */
export function jobRowsFromShop(projectId: string, shop: CadLayer[], job: CadLayer[]): Omit<CadLayer, 'id'>[] {
  const have = new Set(job.map(l => l.shop_layer_id).filter(Boolean))
  const jobHasDefault = job.some(l => l.is_default)
  let order = job.reduce((m, l) => Math.max(m, l.sort_order + 1), 0)
  return [...shop].sort((a, b) => a.sort_order - b.sort_order)
    .filter(s => !have.has(s.id))
    .map(s => ({
      project_id: projectId, shop_layer_id: s.id, name: s.name, color: s.color,
      visible: s.visible, print: s.print, is_default: s.is_default && !jobHasDefault,
      sort_order: order++,
    }))
}

/** The job's layers, copying the shop list the first time (decision 1). Safe to race:
 *  (project_id, shop_layer_id) is unique, so a second copy is ignored. */
export async function ensureJobCadLayers(supabase: SupabaseClient, projectId: string): Promise<CadLayer[]> {
  const load = async () => {
    const { data } = await supabase.from('job_cad_layers').select(LAYER_COLS).eq('project_id', projectId).order('sort_order')
    return (data ?? []) as CadLayer[]
  }
  const job = await load()
  if (job.length) return job
  const { data: shop } = await supabase.from('cad_layers').select(LAYER_COLS.replace('project_id, shop_layer_id, ', '')).order('sort_order')
  const rows = jobRowsFromShop(projectId, (shop ?? []) as unknown as CadLayer[], [])
  if (!rows.length) rows.push({ project_id: projectId, shop_layer_id: null, name: 'General', color: '#dc2626',
    visible: true, print: true, is_default: true, sort_order: 0 })
  const { error } = await supabase.from('job_cad_layers').upsert(rows, { onConflict: 'project_id,shop_layer_id', ignoreDuplicates: true })
  if (error) console.error('[cadLayers] copy shop list', error)
  return load()
}

/** What the renderer, selection and reports ask about an item's layer. */
export interface CadLayerView {
  layerOf(a: Pick<RoomAnnotation, 'cad_layer_id'>): CadLayer | null
  /** Layer is on (canvas + reports). */
  show(a: Pick<RoomAnnotation, 'cad_layer_id'>): boolean
  /** Layer is on and prints (reports). */
  printable(a: Pick<RoomAnnotation, 'cad_layer_id'>): boolean
  /** ByLayer colour, or undefined (no layers loaded → the built-in default). */
  color(a: Pick<RoomAnnotation, 'cad_layer_id'>): string | undefined
}

export function cadLayerView(layers: CadLayer[]): CadLayerView {
  const byId = new Map(layers.map(l => [l.id, l]))
  const general = layers.find(l => l.is_default) ?? null
  // An id that's gone (deleted while another tab had it) falls back to General.
  const layerOf = (a: Pick<RoomAnnotation, 'cad_layer_id'>) => (a.cad_layer_id && byId.get(a.cad_layer_id)) || general
  return {
    layerOf,
    show:      a => layerOf(a)?.visible ?? true,
    printable: a => { const l = layerOf(a); return l ? l.visible && l.print : true },
    color:     a => layerOf(a)?.color,
  }
}

/** No layers loaded: everything shows and prints, built-in colours. */
export const ALL_CAD_LAYERS: CadLayerView = cadLayerView([])

/** Layers in list order, General first. */
export function sortCadLayers(layers: CadLayer[]): CadLayer[] {
  return [...layers].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.sort_order - b.sort_order)
}

/** Reports (decisions 2 + 5): only items on layers that are on and print, with their
 *  ByLayer colours written into the style so every report renderer draws them as-is.
 *  Read-only copies: never save these back. */
export function annotationsForPrint(annots: RoomAnnotation[], v: CadLayerView): RoomAnnotation[] {
  return annots.filter(a => v.printable(a)).map(a => {
    const c = v.color(a)
    if (!c) return a
    const style = { ...a.style }
    for (const k of BYLAYER_KEYS) if (style[k] == null) style[k] = c
    return { ...a, style }
  })
}
