'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import { fmtMm } from '@/src/lib/format'

// Read-only "Material" block for the part panels (cabinet edit modal 3D + ortho
// docked panels): board, colour + code, face/back/edge swatches, thickness,
// grain, finish and the edge band. A part's materialId is usually a colour row
// (materials.parent_id = its board — z_material_colours MC1), so the board's
// own name is looked up too.

type MatRow = {
  id: string; name: string; brand: string | null; finish: string | null; dz: number | null
  has_grain: boolean | null; grain_direction: string | null
  parent_id: string | null; colour_name: string | null; colour_code: string | null
  face_colour: string | null; back_colour: string | null; edge_colour: string | null
}
type MatInfo = { mat: MatRow; board: MatRow | null }

const COLS = 'id,name,brand,finish,dz,has_grain,grain_direction,parent_id,colour_name,colour_code,face_colour,back_colour,edge_colour'
// One fetch per material per session, shared across panels.
const cache = new Map<string, Promise<MatInfo | null>>()

function loadMat(id: string): Promise<MatInfo | null> {
  let p = cache.get(id)
  if (!p) {
    p = (async () => {
      const { data } = await supabase.from('materials').select(COLS).eq('id', id).maybeSingle()
      const mat = data as MatRow | null
      if (!mat) return null
      let board: MatRow | null = null
      if (mat.parent_id) {
        const { data: b } = await supabase.from('materials').select(COLS).eq('id', mat.parent_id).maybeSingle()
        board = b as MatRow | null
      }
      return { mat, board }
    })()
    p.catch(() => cache.delete(id))
    cache.set(id, p)
  }
  return p
}

function Swatch({ c, title }: { c: string | null | undefined; title: string }) {
  if (!c) return null
  return <span title={`${title} ${c}`} className="inline-block w-3 h-3 rounded-sm border border-gray-600 align-middle" style={{ background: c }} />
}

export function PartMaterialInfo({ materialId, eb }: {
  materialId?: string
  /** The part's edge band (from ebByMatId), when known. */
  eb?: { thickness: number; color: string | null }
}) {
  const [info, setInfo] = useState<{ id: string; v: MatInfo | null } | null>(null)
  useEffect(() => {
    if (!materialId) return
    let live = true
    loadMat(materialId).then(v => { if (live) setInfo({ id: materialId, v }) })
    return () => { live = false }
  }, [materialId])

  const head = <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pt-2 pb-0.5">Material</span>
  if (!materialId) return <>{head}<span className="col-span-2 text-gray-500">No material</span></>
  const cur = info?.id === materialId ? info.v : undefined
  if (cur === undefined) return <>{head}<span className="col-span-2 text-gray-500">Loading…</span></>
  if (cur === null) return <>{head}<span className="col-span-2 text-gray-500">Material not found</span></>

  const { mat, board } = cur
  const boardName = board?.name ?? mat.name
  const colour = mat.colour_name
  const grain = mat.has_grain ? `Yes${mat.grain_direction ? ` · ${mat.grain_direction}` : ''}` : 'No'
  const row = (k: string, v: React.ReactNode) => (<>
    <span className="text-gray-500">{k}</span>
    <span className="text-gray-200 text-right min-w-0 break-words">{v}</span>
  </>)

  return (<>
    {head}
    {row('Board', boardName)}
    {colour && row('Colour', <>{colour}{mat.colour_code ? <span className="text-gray-500"> ({mat.colour_code})</span> : null}</>)}
    {(mat.face_colour || mat.back_colour || mat.edge_colour) && row('Swatch',
      <span className="inline-flex gap-1 items-center">
        <Swatch c={mat.face_colour} title="Face" />
        <Swatch c={mat.back_colour} title="Back" />
        <Swatch c={mat.edge_colour} title="Edge" />
      </span>)}
    {mat.dz != null && row('Thickness', <span className="font-mono">{fmtMm(mat.dz)} mm</span>)}
    {row('Grain', grain)}
    {mat.finish && row('Finish', mat.finish)}
    {mat.brand && row('Brand', mat.brand)}
    {eb && row('Edge band', <span className="inline-flex gap-1 items-center justify-end">
      <span className="font-mono">{fmtMm(eb.thickness)} mm</span>
      <Swatch c={eb.color ?? mat.edge_colour ?? mat.face_colour} title="Tape" />
    </span>)}
  </>)
}
