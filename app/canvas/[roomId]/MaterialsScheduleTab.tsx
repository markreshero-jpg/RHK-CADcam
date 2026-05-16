'use client'

import { Fragment, useEffect, useState } from 'react'
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
type MatMap = Record<string, string>  // `${cls}|${role}` or `tk|${role}` → material_id

interface Props {
  mode: 'job' | 'room'
  projectId: string
  roomId?: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MaterialsScheduleTab({ mode, projectId, roomId }: Props) {
  const [loading, setLoading] = useState(true)
  const [allMats, setAllMats]     = useState<MatRecord[]>([])
  const [shopMap, setShopMap]     = useState<MatMap>({})
  const [shopTk,  setShopTk]      = useState<MatMap>({})
  const [jobMap,  setJobMap]       = useState<MatMap>({})
  const [jobTk,   setJobTk]        = useState<MatMap>({})
  const [roomMap, setRoomMap]      = useState<MatMap>({})
  const [roomTk,  setRoomTk]       = useState<MatMap>({})

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)

      const [mR, smR, stR, jmR, jtR, rmR, rtR] = await Promise.all([
        supabase.from('materials').select('id, name, dz').eq('active', true).order('name'),
        supabase.from('shop_material_defaults').select('assembly_class, material_role, material_id'),
        supabase.from('shop_toekick_materials').select('part_role, material_id'),
        supabase.from('job_materials').select('assembly_class, material_role, material_id').eq('project_id', projectId),
        supabase.from('job_toekick_materials').select('part_role, material_id').eq('project_id', projectId),
        mode === 'room' && roomId
          ? supabase.from('room_materials').select('assembly_class, material_role, material_id').eq('room_id', roomId)
          : Promise.resolve({ data: [] as { assembly_class: string; material_role: string; material_id: string }[] }),
        mode === 'room' && roomId
          ? supabase.from('room_toekick_materials').select('part_role, material_id').eq('room_id', roomId)
          : Promise.resolve({ data: [] as { part_role: string; material_id: string }[] }),
      ])

      if (cancelled) return

      const toMain = (rows: { assembly_class: string; material_role: string; material_id: string }[]): MatMap => {
        const m: MatMap = {}
        for (const r of rows) m[`${r.assembly_class}|${r.material_role}`] = r.material_id
        return m
      }
      const toTk = (rows: { part_role: string; material_id: string }[]): MatMap => {
        const m: MatMap = {}
        for (const r of rows) m[r.part_role] = r.material_id
        return m
      }

      setAllMats(mR.data ?? [])
      setShopMap(toMain(smR.data ?? []))
      setShopTk(toTk(stR.data ?? []))
      setJobMap(toMain(jmR.data ?? []))
      setJobTk(toTk(jtR.data ?? []))
      setRoomMap(toMain((rmR as { data: { assembly_class: string; material_role: string; material_id: string }[] }).data ?? []))
      setRoomTk(toTk((rtR as { data: { part_role: string; material_id: string }[] }).data ?? []))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [mode, projectId, roomId])

  // ── Derived values ─────────────────────────────────────────────────────────

  function currentMain(cls: string, role: string): string {
    const k = `${cls}|${role}`
    return mode === 'room' ? (roomMap[k] ?? '') : (jobMap[k] ?? '')
  }

  function inheritedMain(cls: string, role: string): string {
    const k = `${cls}|${role}`
    return mode === 'room' ? (jobMap[k] ?? shopMap[k] ?? '') : (shopMap[k] ?? '')
  }

  function currentTk(role: string): string {
    return mode === 'room' ? (roomTk[role] ?? '') : (jobTk[role] ?? '')
  }

  function inheritedTk(role: string): string {
    return mode === 'room' ? (jobTk[role] ?? shopTk[role] ?? '') : (shopTk[role] ?? '')
  }

  function matName(id: string) {
    return allMats.find(m => m.id === id)?.name ?? id.slice(0, 8)
  }

  // ── Save helpers ──────────────────────────────────────────────────────────

  async function saveMain(cls: AsmClass, role: string, matId: string) {
    if (mode === 'room' && roomId) {
      const k = `${cls}|${role}`
      if (matId) {
        await supabase.from('room_materials').upsert(
          { room_id: roomId, assembly_class: cls, material_role: role, material_id: matId },
          { onConflict: 'room_id,assembly_class,material_role' }
        )
        setRoomMap(p => ({ ...p, [k]: matId }))
      } else {
        await supabase.from('room_materials').delete().eq('room_id', roomId).eq('assembly_class', cls).eq('material_role', role)
        setRoomMap(p => { const n = { ...p }; delete n[k]; return n })
      }
    } else {
      const k = `${cls}|${role}`
      if (matId) {
        await supabase.from('job_materials').upsert(
          { project_id: projectId, assembly_class: cls, material_role: role, material_id: matId },
          { onConflict: 'project_id,assembly_class,material_role' }
        )
        setJobMap(p => ({ ...p, [k]: matId }))
      } else {
        await supabase.from('job_materials').delete().eq('project_id', projectId).eq('assembly_class', cls).eq('material_role', role)
        setJobMap(p => { const n = { ...p }; delete n[k]; return n })
      }
    }
  }

  async function saveTk(role: string, matId: string) {
    if (mode === 'room' && roomId) {
      if (matId) {
        await supabase.from('room_toekick_materials').upsert(
          { room_id: roomId, part_role: role, material_id: matId },
          { onConflict: 'room_id,part_role' }
        )
        setRoomTk(p => ({ ...p, [role]: matId }))
      } else {
        await supabase.from('room_toekick_materials').delete().eq('room_id', roomId).eq('part_role', role)
        setRoomTk(p => { const n = { ...p }; delete n[role]; return n })
      }
    } else {
      if (matId) {
        await supabase.from('job_toekick_materials').upsert(
          { project_id: projectId, part_role: role, material_id: matId },
          { onConflict: 'project_id,part_role' }
        )
        setJobTk(p => ({ ...p, [role]: matId }))
      } else {
        await supabase.from('job_toekick_materials').delete().eq('project_id', projectId).eq('part_role', role)
        setJobTk(p => { const n = { ...p }; delete n[role]; return n })
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <p className="text-xs text-gray-500 py-6 text-center">Loading…</p>

  const inheritLabel = mode === 'room' ? 'job' : 'shop'

  function selCls(overriding: boolean) {
    return `w-full bg-gray-800 border rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500 ${
      overriding ? 'border-blue-700 text-blue-300' : 'border-gray-700 text-white'
    }`
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-500">
        Blue = overriding {inheritLabel} value. Select the blank option to clear an override.
      </p>

      {/* Main grid */}
      <div className="grid grid-cols-[150px_1fr_1fr_1fr] gap-px bg-gray-700/50 rounded overflow-hidden border border-gray-700 text-xs">

        {/* Header row */}
        <div className="bg-gray-800 px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Role</div>
        {CLASSES.map(c => (
          <div key={c} className="bg-gray-800 px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide capitalize">{c}</div>
        ))}

        {/* Role rows */}
        {MAIN_ROLES.map(role => (
          <Fragment key={role.key}>
            <div className="bg-gray-900 px-2 py-2 flex flex-col justify-center">
              <span className="text-gray-300 font-medium text-xs">{role.label}</span>
              <span className="text-[9px] text-gray-600 mt-0.5">{role.desc}</span>
            </div>
            {CLASSES.map(cls => {
              const cur = currentMain(cls, role.key)
              const inh = inheritedMain(cls, role.key)
              return (
                <div key={cls} className="bg-gray-900 px-2 py-2">
                  <select
                    value={cur}
                    onChange={e => saveMain(cls, role.key, e.target.value)}
                    className={selCls(!!cur)}
                  >
                    <option value="">
                      {inh ? matName(inh) : `— no ${inheritLabel} default —`}
                    </option>
                    {allMats.map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.dz}mm)</option>
                    ))}
                  </select>
                </div>
              )
            })}
          </Fragment>
        ))}
      </div>

      {/* Toe kick */}
      <div>
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Toe Kick</p>
        <div className="border border-gray-700 rounded overflow-hidden divide-y divide-gray-700/60">
          {TK_ROLES.map(role => {
            const cur = currentTk(role.key)
            const inh = inheritedTk(role.key)
            return (
              <div key={role.key} className="flex items-center gap-3 px-3 py-2 bg-gray-900">
                <div className="w-36 shrink-0">
                  <p className={`text-xs font-medium ${cur ? 'text-blue-300' : 'text-gray-300'}`}>{role.label}</p>
                  <p className="text-[9px] text-gray-600">{role.desc}</p>
                </div>
                <select
                  value={cur}
                  onChange={e => saveTk(role.key, e.target.value)}
                  className={`flex-1 ${selCls(!!cur)}`}
                >
                  <option value="">
                    {inh ? matName(inh) : `— no ${inheritLabel} default —`}
                  </option>
                  {allMats.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.dz}mm)</option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      </div>

      <p className="text-[10px] text-gray-600">Changes save immediately.</p>
    </div>
  )
}
