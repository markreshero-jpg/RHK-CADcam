'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import { DoorStylePreview, useDoorStylePreviews } from '@/src/components/DoorStylePreview'

// Shared "Doors" tab for Job and Room properties — same layout at both levels so
// the cascade reads the same way. Job: default style + per-class style/colour.
// Room: the same fields, each blank = inherit the job (see loadCabinetInput §12
// for the matching resolver cascade).

export type DoorClassKey = 'base' | 'wall' | 'tall'

export type DoorClassRow = {
  key: DoorClassKey
  style: string; setStyle: (v: string) => void
  colour: string; setColour: (v: string) => void
}

// What a room inherits from its job (room mode only).
export type DoorJobInherit = {
  defaultStyle: string | null
  classStyle:   Record<DoorClassKey, string | null>
  classColour:  Record<DoorClassKey, string | null>
}

type StyleItem = { id: string; name: string; door_material_schedule_id: string | null; default_material_id: string | null }
type ColourItem = {
  id: string; schedule_id: string; colour_name: string; colour_code: string | null
  material_id: string | null
  material: { name: string; dz: number } | null   // linked board (what the parts cut from)
}

const LABELS: Record<DoorClassKey, string> = { base: 'Base', wall: 'Wall', tall: 'Tall' }

const selectCls = (overridden: boolean) =>
  `flex-1 bg-gray-800 border rounded px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500 ${
    overridden ? 'border-blue-700 text-blue-300' : 'border-gray-700 text-white'}`

export default function DoorStandardsPanel({ mode, defaultStyle, setDefaultStyle, rows, inherit }: {
  mode: 'job' | 'room'
  defaultStyle: string
  setDefaultStyle: (v: string) => void
  rows: DoorClassRow[]
  inherit?: DoorJobInherit   // required in room mode
}) {
  const [styles, setStyles]   = useState<StyleItem[]>([])
  const [colours, setColours] = useState<ColourItem[]>([])
  const [loading, setLoading] = useState(true)
  const previews = useDoorStylePreviews()
  const isRoom = mode === 'room'

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('door_styles').select('id,name,door_material_schedule_id,default_material_id').eq('is_active', true).order('sort_order').order('name'),
      supabase.from('door_schedule_materials').select('id,schedule_id,colour_name,colour_code,material_id,material:materials(name,dz)').eq('is_active', true).order('sort_order').order('colour_name'),
    ]).then(([sR, cR]) => {
      if (cancelled) return
      setStyles((sR.data ?? []) as StyleItem[])
      setColours((cR.data ?? []) as unknown as ColourItem[])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const styleName  = (id: string | null) => (id ? styles.find(s => s.id === id)?.name : null) ?? null
  const styleById  = (id: string | null) => (id ? styles.find(s => s.id === id) : undefined)
  const colourById = (id: string | null) => (id ? colours.find(c => c.id === id) : undefined) ?? null
  const coloursFor = (styleId: string | null) => {
    const sched = styleById(styleId)?.door_material_schedule_id
    return sched ? colours.filter(c => c.schedule_id === sched) : []
  }
  const colourLabel = (c: ColourItem) => `${c.colour_name}${c.colour_code ? ` (${c.colour_code})` : ''}`

  if (loading) return <p className="text-xs text-gray-500">Loading styles…</p>

  // The style the default picker falls back to when blank.
  const inheritedDefault = isRoom ? inherit?.defaultStyle ?? null : null
  const effDefault = defaultStyle || inheritedDefault

  return (
    <div className="space-y-5">
      {isRoom && (
        <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg text-xs">
          <span className="text-gray-400">Blank = inherit the job</span>
          <span className="text-gray-600 ml-auto">Blue = room override</span>
        </div>
      )}

      <section>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Default Door Style</p>
        <p className="text-xs text-gray-500 mb-3">
          {isRoom
            ? 'Overrides the job’s door style for every door in this room. Each cabinet class below inherits it unless overridden.'
            : 'The job’s parent style. Each cabinet class below inherits it unless overridden. Rooms and individual door zones can still override.'}
          {' '}Manage styles in the Doors Library.
        </p>
        <div className="flex items-start gap-4">
          <div className="flex-1 flex items-center gap-4">
            <span className="w-24 shrink-0 text-xs font-medium text-gray-300">Door Style</span>
            <select value={defaultStyle} onChange={e => setDefaultStyle(e.target.value)} className={selectCls(isRoom && !!defaultStyle)}>
              <option value="">{isRoom ? `— job (${styleName(inheritedDefault) ?? 'none'}) —` : '— none —'}</option>
              {styles.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {(() => {
            const pv = previews.forStyle(effDefault || null)
            return pv ? <DoorStylePreview {...pv} className="h-28" /> : null
          })()}
        </div>
      </section>

      <section>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Per Cabinet Class</p>
        <p className="text-xs text-gray-500 mb-3">
          Override the style and/or colour for Base, Wall and Tall (e.g. Polytec on base &amp; wall,
          Shaker or raw MDF on tall). Leave a field blank to inherit.
        </p>
        <div className="space-y-4">
          {rows.map(row => {
            // Inherited style when the class style is blank.
            const jobClassStyle = isRoom ? (inherit?.classStyle[row.key] || inherit?.defaultStyle || null) : null
            const inheritedStyle = isRoom ? (defaultStyle || jobClassStyle) : (defaultStyle || null)
            const effStyle = row.style || inheritedStyle
            // Inherited colour when the class colour is blank. A room keeps the
            // job's class colour only while it keeps the job's style.
            const roomStyle = isRoom ? (row.style || defaultStyle || null) : null
            const jobColour = isRoom && (!roomStyle || roomStyle === jobClassStyle) ? inherit?.classColour[row.key] ?? null : null
            const styleDefaultColour = styleById(effStyle)?.default_material_id ?? null
            const inheritedColour = jobColour ?? styleDefaultColour
            const effColour = colourById(row.colour || inheritedColour)
            const colourOpts = coloursFor(effStyle)
            const hasRange = !!styleById(effStyle)?.door_material_schedule_id
            const effName = styleName(effStyle) ?? '—'
            const preview = previews.forStyle(effStyle, row.colour || inheritedColour || null)

            const styleBlank = isRoom
              ? `— ${defaultStyle ? 'room default' : 'job'} (${styleName(inheritedStyle) ?? 'none'}) —`
              : `— job default (${styleName(inheritedStyle) ?? 'none'}) —`
            const inhColour = colourById(inheritedColour)
            const colourBlank = jobColour
              ? `— job (${inhColour ? colourLabel(inhColour) : 'colour'}) —`
              : `— style default${inhColour ? ` (${colourLabel(inhColour)})` : ''} —`

            return (
              <div key={row.key} className="border border-gray-800 rounded-lg p-3 flex gap-3">
                {preview && (
                  <div className="shrink-0 self-center">
                    <DoorStylePreview {...preview} className="h-24" />
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-4">
                    <span className="w-10 shrink-0 text-xs font-semibold text-gray-200">{LABELS[row.key]}</span>
                    <select value={row.style} onChange={e => row.setStyle(e.target.value)} className={selectCls(isRoom && !!row.style)}>
                      <option value="">{styleBlank}</option>
                      {styles.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-4 pl-14">
                    {!effStyle ? (
                      <span className="text-[11px] text-gray-500">Choose a door style first.</span>
                    ) : colourOpts.length === 0 ? (
                      <span className="text-[11px] text-gray-500">
                        {hasRange ? 'No colours in this style’s colour range.' : 'No colour range on this style (paint on site).'}
                      </span>
                    ) : (
                      <select value={row.colour} onChange={e => row.setColour(e.target.value)} className={selectCls(isRoom && !!row.colour)}>
                        <option value="">{colourBlank}</option>
                        {colourOpts.map(c => <option key={c.id} value={c.id}>{colourLabel(c)}</option>)}
                      </select>
                    )}
                  </div>
                  {/* Resolved outcome — what these fronts will actually cut from */}
                  {effStyle && (
                    <div className="pl-14">
                      {effColour?.material ? (
                        <p className="text-[11px] text-gray-400">
                          → {effName} · {effColour.colour_name} · cuts from{' '}
                          <span className="text-gray-200">{effColour.material.name} ({effColour.material.dz}mm)</span>
                        </p>
                      ) : effColour ? (
                        <p className="text-[11px] text-amber-400">
                          ⚠ &ldquo;{effColour.colour_name}&rdquo; isn&apos;t linked to a board — fronts will cut from the
                          carcass door material. Link it in the Doors Library.
                        </p>
                      ) : hasRange ? (
                        <p className="text-[11px] text-amber-400">
                          ⚠ No colour selected and the style has no default — fronts will cut from the carcass door material.
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
