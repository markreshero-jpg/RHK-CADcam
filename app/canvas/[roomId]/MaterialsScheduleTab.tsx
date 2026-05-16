'use client'

import { Fragment, useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase'

// ── Schedule type config ──────────────────────────────────────────────────────

const SCHED_TYPES = [
  { key: 'assembly',        label: 'Assembly',             table: 'assembly_schedules',       col: 'assembly_schedule_id'        },
  { key: 'toekick',         label: 'Toe Kick',             table: 'toekick_schedules',         col: 'toekick_schedule_id'         },
  { key: 'front',           label: 'Door & Drawer Fronts', table: 'front_schedules',           col: 'front_schedule_id'           },
  { key: 'drawerbox',       label: 'Drawer Box',           table: 'drawerbox_schedules',       col: 'drawerbox_schedule_id'       },
  { key: 'inner_drawerbox', label: 'Inner Drawer Box',     table: 'inner_drawerbox_schedules', col: 'inner_drawerbox_schedule_id' },
  { key: 'hinge',           label: 'Hinges',               table: 'hinge_schedules',           col: 'hinge_schedule_id'           },
  { key: 'slide',           label: 'Slides',               table: 'slide_schedules',           col: 'slide_schedule_id'           },
  { key: 'handle',          label: 'Handles',              table: 'handle_schedules',          col: 'handle_schedule_id'          },
  { key: 'benchtop',        label: 'Benchtops',            table: 'benchtop_schedules',        col: 'benchtop_schedule_id'        },
] as const

type SchedKey = typeof SCHED_TYPES[number]['key']

const ALL_SCHED_COLS = SCHED_TYPES.map(t => t.col).join(', ')

// ── Per-role override config ──────────────────────────────────────────────────

const ASM_ROLES = [
  { key: 'interior',         label: 'Interior',        desc: 'Carcass panels' },
  { key: 'exposed_interior', label: 'Exposed Interior', desc: 'End panels' },
  { key: 'door_face',        label: 'Door Face',        desc: 'Doors & drawer faces' },
  { key: 'shelf',            label: 'Shelf',            desc: 'Shelves' },
  { key: 'end_panel',        label: 'End Panel',        desc: 'Decorative ends' },
]

const TK_ROLES = [
  { key: 'face',     label: 'Face',     desc: 'Visible front face' },
  { key: 'interior', label: 'Interior', desc: 'Structural members' },
]

const CLASSES = ['base', 'wall', 'tall'] as const
type AsmClass = typeof CLASSES[number]

// ── Types ─────────────────────────────────────────────────────────────────────

interface Schedule { id: string; name: string; is_default: boolean }
type MatMap = Record<string, string>
type SchedMap = Partial<Record<SchedKey, string | null>>
type SchedListMap = Partial<Record<SchedKey, Schedule[]>>

interface Props {
  mode: 'job' | 'room'
  projectId: string
  roomId?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MaterialsScheduleTab({ mode, projectId, roomId }: Props) {
  const [loading,   setLoading]   = useState(true)
  const [allMats,   setAllMats]   = useState<{ id: string; name: string; dz: number }[]>([])
  const [schedLists, setSchedLists] = useState<SchedListMap>({})
  const [ownIds,    setOwnIds]    = useState<SchedMap>({})
  const [parentIds, setParentIds] = useState<SchedMap>({})
  const [matOvr,    setMatOvr]    = useState<MatMap>({})   // `${cls}|${role}` → mat_id
  const [tkOvr,     setTkOvr]     = useState<MatMap>({})   // role → mat_id
  const [schedMat,  setSchedMat]  = useState<MatMap>({})   // `${cls}|${role}` → mat_id (from schedules)
  const [schedTk,   setSchedTk]   = useState<MatMap>({})   // role → mat_id (from toekick schedule)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)

      // Load all 9 schedule lists + own row + parent row + overrides + materials catalog in parallel
      const [listsResults, ownRes, parentRes, matOvrRes, tkOvrRes, matsRes] = await Promise.all([
        Promise.all(SCHED_TYPES.map(st => supabase.from(st.table).select('id, name, is_default').order('name'))),
        mode === 'room' && roomId
          ? supabase.from('rooms').select(ALL_SCHED_COLS).eq('id', roomId).single()
          : supabase.from('projects').select(ALL_SCHED_COLS).eq('id', projectId).single(),
        mode === 'room'
          ? supabase.from('projects').select(ALL_SCHED_COLS).eq('id', projectId).single()
          : Promise.resolve({ data: null }),
        mode === 'room' && roomId
          ? supabase.from('room_materials').select('assembly_class, material_role, material_id').eq('room_id', roomId)
          : supabase.from('job_materials').select('assembly_class, material_role, material_id').eq('project_id', projectId),
        mode === 'room' && roomId
          ? supabase.from('room_toekick_materials').select('part_role, material_id').eq('room_id', roomId)
          : supabase.from('job_toekick_materials').select('part_role, material_id').eq('project_id', projectId),
        supabase.from('materials').select('id, name, dz').eq('active', true).order('name'),
      ])

      if (cancelled) return

      // Build schedule lists map
      const lists: SchedListMap = {}
      SCHED_TYPES.forEach((st, i) => { lists[st.key] = (listsResults[i].data ?? []) as Schedule[] })
      setSchedLists(lists)

      // Build own IDs map
      const own: SchedMap = {}
      const ownData = ownRes.data as Record<string, string | null> | null
      SCHED_TYPES.forEach(st => { own[st.key] = ownData?.[st.col] ?? null })
      setOwnIds(own)

      // Build parent IDs map (project row for room mode, shop defaults for job mode)
      const parent: SchedMap = {}
      const parentData = parentRes.data as Record<string, string | null> | null
      if (mode === 'room' && parentData) {
        SCHED_TYPES.forEach(st => { parent[st.key] = parentData[st.col] ?? null })
      } else {
        // job mode: parent = shop default schedule (is_default=true)
        SCHED_TYPES.forEach(st => {
          parent[st.key] = (lists[st.key] ?? []).find(s => s.is_default)?.id ?? null
        })
      }
      setParentIds(parent)

      // Build per-role override maps
      const mo: MatMap = {}
      for (const r of (matOvrRes.data ?? []) as { assembly_class: string; material_role: string; material_id: string }[]) {
        mo[`${r.assembly_class}|${r.material_role}`] = r.material_id
      }
      setMatOvr(mo)

      const to: MatMap = {}
      for (const r of (tkOvrRes.data ?? []) as { part_role: string; material_id: string }[]) {
        to[r.part_role] = r.material_id
      }
      setTkOvr(to)

      setAllMats(matsRes.data ?? [])

      // Load schedule rows for effective assembly, toekick, front schedules
      const effAsm   = own.assembly   ?? parent.assembly   ?? null
      const effTk    = own.toekick    ?? parent.toekick    ?? null
      const effFront = own.front      ?? parent.front      ?? null
      await loadScheduleRows(effAsm, effTk, effFront, cancelled)

      if (!cancelled) setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [mode, projectId, roomId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadScheduleRows(
    asmId: string | null,
    tkId: string | null,
    frontId: string | null,
    cancelled = false,
  ) {
    const [asmRows, tkRows, frontRows] = await Promise.all([
      asmId   ? supabase.from('assembly_schedule_rows').select('assembly_class, material_role, material_id').eq('schedule_id', asmId)   : Promise.resolve({ data: [] }),
      tkId    ? supabase.from('toekick_schedule_rows').select('part_role, material_id').eq('schedule_id', tkId)                         : Promise.resolve({ data: [] }),
      frontId ? supabase.from('front_schedule_rows').select('assembly_class, material_id').eq('schedule_id', frontId)                   : Promise.resolve({ data: [] }),
    ])
    if (cancelled) return

    const sm: MatMap = {}
    for (const r of (asmRows.data ?? []) as { assembly_class: string; material_role: string; material_id: string }[]) {
      sm[`${r.assembly_class}|${r.material_role}`] = r.material_id
    }
    for (const r of (frontRows.data ?? []) as { assembly_class: string; material_id: string }[]) {
      sm[`${r.assembly_class}|door_face`] = r.material_id
    }
    setSchedMat(sm)

    const st: MatMap = {}
    for (const r of (tkRows.data ?? []) as { part_role: string; material_id: string }[]) {
      st[r.part_role] = r.material_id
    }
    setSchedTk(st)
  }

  // ── Save schedule assignment ───────────────────────────────────────────────

  async function saveScheduleId(key: SchedKey, schedId: string | null) {
    const st    = SCHED_TYPES.find(t => t.key === key)!
    const table = mode === 'room' && roomId ? 'rooms'   : 'projects'
    const rowId = mode === 'room' && roomId ? roomId    : projectId
    await supabase.from(table).update({ [st.col]: schedId }).eq('id', rowId)
    const newOwn = { ...ownIds, [key]: schedId }
    setOwnIds(newOwn)

    if (key === 'assembly' || key === 'toekick' || key === 'front') {
      const effAsm   = (key === 'assembly' ? schedId : ownIds.assembly)   ?? parentIds.assembly   ?? null
      const effTk    = (key === 'toekick'  ? schedId : ownIds.toekick)    ?? parentIds.toekick    ?? null
      const effFront = (key === 'front'    ? schedId : ownIds.front)      ?? parentIds.front      ?? null
      await loadScheduleRows(effAsm, effTk, effFront)
    }
  }

  // ── Save per-role overrides ───────────────────────────────────────────────

  async function saveMatOverride(cls: AsmClass, role: string, matId: string) {
    const k = `${cls}|${role}`
    if (mode === 'room' && roomId) {
      if (matId) {
        await supabase.from('room_materials').upsert(
          { room_id: roomId, assembly_class: cls, material_role: role, material_id: matId },
          { onConflict: 'room_id,assembly_class,material_role' }
        )
        setMatOvr(p => ({ ...p, [k]: matId }))
      } else {
        await supabase.from('room_materials').delete().eq('room_id', roomId).eq('assembly_class', cls).eq('material_role', role)
        setMatOvr(p => { const n = { ...p }; delete n[k]; return n })
      }
    } else {
      if (matId) {
        await supabase.from('job_materials').upsert(
          { project_id: projectId, assembly_class: cls, material_role: role, material_id: matId },
          { onConflict: 'project_id,assembly_class,material_role' }
        )
        setMatOvr(p => ({ ...p, [k]: matId }))
      } else {
        await supabase.from('job_materials').delete().eq('project_id', projectId).eq('assembly_class', cls).eq('material_role', role)
        setMatOvr(p => { const n = { ...p }; delete n[k]; return n })
      }
    }
  }

  async function saveTkOverride(role: string, matId: string) {
    if (mode === 'room' && roomId) {
      if (matId) {
        await supabase.from('room_toekick_materials').upsert(
          { room_id: roomId, part_role: role, material_id: matId },
          { onConflict: 'room_id,part_role' }
        )
        setTkOvr(p => ({ ...p, [role]: matId }))
      } else {
        await supabase.from('room_toekick_materials').delete().eq('room_id', roomId).eq('part_role', role)
        setTkOvr(p => { const n = { ...p }; delete n[role]; return n })
      }
    } else {
      if (matId) {
        await supabase.from('job_toekick_materials').upsert(
          { project_id: projectId, part_role: role, material_id: matId },
          { onConflict: 'project_id,part_role' }
        )
        setTkOvr(p => ({ ...p, [role]: matId }))
      } else {
        await supabase.from('job_toekick_materials').delete().eq('project_id', projectId).eq('part_role', role)
        setTkOvr(p => { const n = { ...p }; delete n[role]; return n })
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function matName(id: string) {
    const m = allMats.find(m => m.id === id)
    return m ? `${m.name} (${m.dz}mm)` : id.slice(0, 8)
  }

  function inheritedSchedName(key: SchedKey): string {
    const list = schedLists[key] ?? []
    if (mode === 'room') {
      const projId = parentIds[key]
      if (projId) return list.find(s => s.id === projId)?.name ?? 'job default'
      const def = list.find(s => s.is_default)
      return def ? `${def.name} (shop)` : 'shop default'
    } else {
      const def = list.find(s => s.is_default)
      return def ? def.name : 'none'
    }
  }

  function selCls(active: boolean) {
    return `w-full bg-gray-800 border rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500 ${
      active ? 'border-blue-700 text-blue-300' : 'border-gray-700 text-white'
    }`
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <p className="text-xs text-gray-500 py-8 text-center">Loading…</p>

  const inheritLabel = mode === 'room' ? 'job' : 'shop'

  return (
    <div className="space-y-6">

      {/* ── Section 1: Schedule Assignments ─────────────────────────────── */}
      <div>
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Schedule Assignments
        </p>
        <p className="text-[10px] text-gray-600 mb-3">
          Blue = overriding {inheritLabel} assignment. Select blank to clear and inherit.
        </p>
        <div className="border border-gray-700 rounded overflow-hidden divide-y divide-gray-700/60">
          {SCHED_TYPES.map(st => {
            const cur  = ownIds[st.key] ?? ''
            const list = schedLists[st.key] ?? []
            return (
              <div key={st.key} className="flex items-center gap-3 px-4 py-2.5 bg-gray-900">
                <span className={`w-44 shrink-0 text-xs font-medium ${cur ? 'text-blue-300' : 'text-gray-400'}`}>
                  {st.label}
                </span>
                <select
                  value={cur}
                  onChange={e => saveScheduleId(st.key, e.target.value || null)}
                  className={`flex-1 max-w-xs ${selCls(!!cur)}`}
                >
                  <option value="">← {inheritLabel}: {inheritedSchedName(st.key)}</option>
                  {list.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.is_default ? ' (shop default)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Section 2: Per-Role Overrides ──────────────────────────────── */}
      <div>
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Per-Role Overrides
        </p>
        <p className="text-[10px] text-gray-600 mb-3">
          Override individual material roles on top of the assigned schedule.
          Blue = active override. Select blank to remove override and use schedule value.
        </p>

        {/* Assembly + door_face roles × class grid */}
        <div className="grid grid-cols-[140px_1fr_1fr_1fr] gap-px bg-gray-700/50 rounded overflow-hidden border border-gray-700 text-xs mb-4">
          <div className="bg-gray-800 px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Role</div>
          {CLASSES.map(c => (
            <div key={c} className="bg-gray-800 px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide capitalize">{c}</div>
          ))}
          {ASM_ROLES.map(role => (
            <Fragment key={role.key}>
              <div className="bg-gray-900 px-2 py-2 flex flex-col justify-center">
                <span className="text-gray-300 font-medium text-xs">{role.label}</span>
                <span className="text-[9px] text-gray-600 mt-0.5">{role.desc}</span>
              </div>
              {CLASSES.map(cls => {
                const k   = `${cls}|${role.key}`
                const cur = matOvr[k] ?? ''
                const inh = schedMat[k] ?? ''
                return (
                  <div key={cls} className="bg-gray-900 px-2 py-2">
                    <select
                      value={cur}
                      onChange={e => saveMatOverride(cls, role.key, e.target.value)}
                      className={selCls(!!cur)}
                    >
                      <option value="">
                        {inh ? matName(inh) : `— no schedule value —`}
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

        {/* Toe kick overrides */}
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Toe Kick</p>
        <div className="border border-gray-700 rounded overflow-hidden divide-y divide-gray-700/60">
          {TK_ROLES.map(role => {
            const cur = tkOvr[role.key] ?? ''
            const inh = schedTk[role.key] ?? ''
            return (
              <div key={role.key} className="flex items-center gap-3 px-3 py-2 bg-gray-900">
                <div className="w-36 shrink-0">
                  <p className={`text-xs font-medium ${cur ? 'text-blue-300' : 'text-gray-300'}`}>{role.label}</p>
                  <p className="text-[9px] text-gray-600">{role.desc}</p>
                </div>
                <select
                  value={cur}
                  onChange={e => saveTkOverride(role.key, e.target.value)}
                  className={`flex-1 max-w-xs ${selCls(!!cur)}`}
                >
                  <option value="">
                    {inh ? matName(inh) : `— no schedule value —`}
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
