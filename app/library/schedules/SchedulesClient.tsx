'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/src/lib/supabase'

// ─── Role config ──────────────────────────────────────────────────────────────

const MAIN_ROLES = [
  { key: 'interior',         label: 'Interior',         desc: 'Carcass panels (sides, top, bottom)' },
  { key: 'exposed_interior', label: 'Exposed Interior',  desc: 'Visible end panels' },
  { key: 'door_face',        label: 'Door Face',         desc: 'Doors & drawer faces' },
  { key: 'shelf',            label: 'Shelf',             desc: 'Adjustable & fixed shelves' },
  { key: 'end_panel',        label: 'End Panel',         desc: 'Decorative end panels' },
]

const TK_ROLES = [
  { key: 'face',     label: 'Toe Kick Face',     desc: 'Visible front face' },
  { key: 'interior', label: 'Toe Kick Interior', desc: 'Structural ladder / leg members' },
]

const CLASSES = ['base', 'wall', 'tall'] as const
type AsmClass = typeof CLASSES[number]

// ─── Types ────────────────────────────────────────────────────────────────────

interface MatRecord { id: string; name: string; dz: number }
type MatMap = Record<string, string>

interface Props {
  allMaterials: MatRecord[]
  shopMains:    { assembly_class: string; material_role: string; material_id: string }[]
  shopTk:       { part_role: string; material_id: string }[]
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SchedulesClient({ allMaterials, shopMains, shopTk: shopTkInit }: Props) {
  const [mainMap, setMainMap] = useState<MatMap>(() => {
    const m: MatMap = {}
    for (const r of shopMains) m[`${r.assembly_class}|${r.material_role}`] = r.material_id
    return m
  })

  const [tkMap, setTkMap] = useState<MatMap>(() => {
    const m: MatMap = {}
    for (const r of shopTkInit) m[r.part_role] = r.material_id
    return m
  })

  async function saveMain(cls: AsmClass, role: string, matId: string) {
    if (!matId) return
    const { error } = await supabase.from('shop_material_defaults').upsert(
      { assembly_class: cls, material_role: role, material_id: matId },
      { onConflict: 'assembly_class,material_role' }
    )
    if (!error) setMainMap(p => ({ ...p, [`${cls}|${role}`]: matId }))
    else console.error('shop_material_defaults upsert error:', error)
  }

  async function saveTk(role: string, matId: string) {
    if (!matId) return
    const { error } = await supabase.from('shop_toekick_materials').upsert(
      { part_role: role, material_id: matId },
      { onConflict: 'part_role' }
    )
    if (!error) setTkMap(p => ({ ...p, [role]: matId }))
    else console.error('shop_toekick_materials upsert error:', error)
  }

  function matName(id: string) {
    const m = allMaterials.find(m => m.id === id)
    return m ? `${m.name} (${m.dz}mm)` : '—'
  }

  const sel = `w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500`

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex-none border-b border-gray-800 px-6 py-3 flex items-center gap-3">
        <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">← Projects</Link>
        <span className="text-gray-700">|</span>
        <Link href="/library/materials" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">Materials Library</Link>
        <span className="text-gray-700">|</span>
        <span className="text-sm font-semibold text-white">Shop Defaults</span>
        <span className="text-xs text-gray-600 ml-1">· Applied to all new jobs unless overridden</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6 max-w-4xl">

        {/* Main materials grid */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Cabinet Materials</h2>
          <div className="grid grid-cols-[180px_1fr_1fr_1fr] gap-px bg-gray-700/50 rounded overflow-hidden border border-gray-700 text-xs">

            {/* Header */}
            <div className="bg-gray-800 px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Role</div>
            {CLASSES.map(c => (
              <div key={c} className="bg-gray-800 px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide capitalize">{c}</div>
            ))}

            {/* Rows */}
            {MAIN_ROLES.map(role => (
              <Fragment key={role.key}>
                <div className="bg-gray-900 px-3 py-2.5 flex flex-col justify-center border-t border-gray-800/50">
                  <span className="text-gray-200 font-medium">{role.label}</span>
                  <span className="text-[9px] text-gray-600 mt-0.5">{role.desc}</span>
                </div>
                {CLASSES.map(cls => {
                  const val = mainMap[`${cls}|${role.key}`] ?? ''
                  return (
                    <div key={cls} className="bg-gray-900 px-2 py-2 border-t border-gray-800/50">
                      <select
                        value={val}
                        onChange={e => saveMain(cls, role.key, e.target.value)}
                        className={sel}
                      >
                        {!val && <option value="">— not set —</option>}
                        {allMaterials.map(m => (
                          <option key={m.id} value={m.id}>{m.name} ({m.dz}mm)</option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>

        {/* Toe kick */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Toe Kick Materials</h2>
          <div className="border border-gray-700 rounded overflow-hidden divide-y divide-gray-700/60">
            {TK_ROLES.map(role => {
              const val = tkMap[role.key] ?? ''
              return (
                <div key={role.key} className="flex items-center gap-4 px-4 py-3 bg-gray-900">
                  <div className="w-44 shrink-0">
                    <p className="text-xs font-medium text-gray-200">{role.label}</p>
                    <p className="text-[9px] text-gray-600">{role.desc}</p>
                  </div>
                  <select
                    value={val}
                    onChange={e => saveTk(role.key, e.target.value)}
                    className={`flex-1 max-w-xs ${sel}`}
                  >
                    {!val && <option value="">— not set —</option>}
                    {allMaterials.map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.dz}mm)</option>
                    ))}
                  </select>
                  {val && (
                    <span className="text-xs text-gray-500 ml-2">{matName(val)}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <p className="text-xs text-gray-600">
          Changes save immediately. These are the shop-wide defaults used when no job or room override is set.
        </p>
      </div>
    </div>
  )
}
