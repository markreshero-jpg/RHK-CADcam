'use client'

// Live CAD field values (z_CAD_tool phase C) for the open room: names come from the
// room's settings first, then the job's; materials and runner lengths from the
// resolved cabinets. Feeds fillFields() on the plan canvas and the Plan View report.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { Project, Room, RoomFixture } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { type CadFieldValues, fixtureSpecFields } from '@/src/lib/annotations/blocks'
import { carcassSpec, type CarcassSpecCab } from '@/src/lib/annotations/carcassSpec'

type Row = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))]

interface Names {
  fronts: string
  handles: string; hinges: string; runnersName: string; drawerSystem: string
  benchtop: string
  materials: Map<string, string>
  bins: Map<string, string>   // bin product id → brand + name (z_bin_cabinet)
}

export function useCadFields({ project, room, resolvedParts, fixtures, cabinets }: {
  project:       Project | null
  room:          Room
  resolvedParts: Map<string, ResolvedCabinet>
  fixtures:      RoomFixture[]
  /** The room's cabinets — labels + exposed interior / overrides for {carcass}. */
  cabinets:      CarcassSpecCab[]
}): CadFieldValues {
  const [names, setNames] = useState<Names | null>(null)

  // Material ids used by the resolved parts — their names are loaded with the rest.
  const matIds = useMemo(() => {
    const ids = new Set<string>()
    for (const r of resolvedParts.values()) {
      for (const p of r.case_parts) if (p.material_id) ids.add(p.material_id)
      for (const p of r.custom_parts ?? []) if (p.material_id) ids.add(p.material_id)
      for (const s of r.drawer_stacks) for (const p of s.box_parts) if (p.material_id) ids.add(p.material_id)
    }
    return [...ids].sort()
  }, [resolvedParts])
  const matKey = matIds.join(',')
  // Bin products behind the room's bin fronts (a bin "slide" is the bin itself).
  const binIds = useMemo(() => uniq([...resolvedParts.values()].flatMap(r =>
    r.drawer_stacks.filter(s => s.drawer_type === 'bin').map(s => s.slides[0]?.slide_id))).sort(), [resolvedParts])
  const binKey = binIds.join(',')

  useEffect(() => {
    let dead = false
    const r = room as unknown as Row, j = (project ?? {}) as unknown as Row
    const pick = (k: string) => str(r[k]) ?? str(j[k])
    void (async () => {
      const classes = ['base', 'wall', 'tall'] as const
      const styleIds = classes.map(c => pick(`${c}_door_style_id`) ?? pick('door_style_override_id') ?? str(j.default_door_style_id))
      const colourIds = classes.map(c => pick(`${c}_door_colour_id`))
      const btSched = pick('benchtop_schedule_id')
      const [styles, colours, handle, hinge, slide, dbm, mats, btRows, btOver, bins] = await Promise.all([
        supabase.from('door_styles').select('id,name').in('id', uniq(styleIds)),
        supabase.from('door_schedule_materials').select('id,colour_name').in('id', uniq(colourIds)),
        pick('handle_schedule_id') ? supabase.from('handle_schedules').select('name').eq('id', pick('handle_schedule_id')!).maybeSingle() : Promise.resolve({ data: null }),
        pick('hinge_schedule_id') ? supabase.from('hinge_schedules').select('name').eq('id', pick('hinge_schedule_id')!).maybeSingle() : Promise.resolve({ data: null }),
        pick('slide_schedule_id') ? supabase.from('slide_schedules').select('name').eq('id', pick('slide_schedule_id')!).maybeSingle() : Promise.resolve({ data: null }),
        str(j.drawer_box_method_id) ? supabase.from('drawer_box_methods').select('name').eq('id', str(j.drawer_box_method_id)!).maybeSingle() : Promise.resolve({ data: null }),
        matIds.length ? supabase.from('materials').select('id,name').in('id', matIds) : Promise.resolve({ data: [] }),
        btSched ? supabase.from('benchtop_schedule_rows').select('part_role,benchtop_materials(name,color)').eq('schedule_id', btSched) : Promise.resolve({ data: [] }),
        supabase.from('room_benchtop_materials').select('part_role,benchtop_materials(name,color)').eq('room_id', room.id),
        binIds.length ? supabase.from('hardware_slides').select('id,name,brand').in('id', binIds) : Promise.resolve({ data: [] }),
      ])
      if (dead) return
      const styleName = new Map(((styles.data ?? []) as Row[]).map(s => [s.id as string, s.name as string]))
      const colourName = new Map(((colours.data ?? []) as Row[]).map(c => [c.id as string, c.colour_name as string]))
      const front = classes.map((_, i) => [styleName.get(styleIds[i] ?? ''), colourName.get(colourIds[i] ?? '')].filter(Boolean).join(' - '))
      const frontsUniq = uniq(front)
      const fronts = frontsUniq.length <= 1 ? (frontsUniq[0] ?? '')
        : classes.map((c, i) => front[i] && `${c[0].toUpperCase()}${c.slice(1)}: ${front[i]}`).filter(Boolean).join('\n')
      // Benchtop: a room override row wins over the schedule's rows.
      const btName = (rows: Row[]) => uniq(rows.map(x => {
        const m = x.benchtop_materials as Row | null
        return m ? [str(m.name), str(m.color)].filter(Boolean).join(' - ') : null
      }))
      const over = btName((btOver.data ?? []) as Row[])
      setNames({
        fronts,
        handles: str((handle.data as Row | null)?.name) ?? '',
        hinges: str((hinge.data as Row | null)?.name) ?? '',
        runnersName: str((slide.data as Row | null)?.name) ?? '',
        drawerSystem: str((dbm.data as Row | null)?.name) ?? '',
        benchtop: (over.length ? over : btName((btRows.data ?? []) as Row[])).join(', '),
        materials: new Map(((mats.data ?? []) as Row[]).map(m => [m.id as string, m.name as string])),
        bins: new Map(((bins.data ?? []) as Row[]).map(b => {
          const name = str(b.name) ?? '', brand = str(b.brand)
          return [b.id as string, brand && !name.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${name}` : name]
        })),
      })
    })()
    return () => { dead = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, room, matKey, binKey])

  return useMemo(() => {
    const mat = (id: string | null | undefined) => (id && names?.materials.get(id)) || null
    const panels: string[] = [], box: string[] = []
    const lengths = new Set<number>()
    const binCount = new Map<string, number>()
    for (const r of resolvedParts.values()) {
      for (const p of r.custom_parts ?? []) panels.push(mat(p.material_id) ?? '')
      for (const s of r.drawer_stacks) {
        // A bin's "slide" is the bin frame — listed under {bins}, never as a runner length.
        if (s.drawer_type === 'bin') {
          const name = names?.bins.get(s.slides[0]?.slide_id ?? '') ?? 'Pull-out bin'
          binCount.set(name, (binCount.get(name) ?? 0) + 1)
          continue
        }
        for (const p of s.box_parts) box.push(mat(p.material_id) ?? '')
        for (const sl of s.slides) if (sl.nominal_length) lengths.add(Math.round(sl.nominal_length))
      }
    }
    // Boxes only, internal + external (with the odd cabinets named) — carcassSpec.ts.
    const carcass = carcassSpec(cabinets, resolvedParts, id => mat(id))
    const runnerLens = [...lengths].sort((a, b) => a - b).map(n => `${n}mm`).join(' / ')
    const bins = [...binCount].map(([n, c]) => (c > 1 ? `${c} x ${n}` : n)).join('\n')
    const jobNo = project?.job_number ?? '', client = project?.client_name ?? ''
    const sinks = fixtures.filter(f => f.category === 'sink')
    return {
      job: [jobNo, client].filter(Boolean).join(' ') || (project?.name ?? ''),
      job_number: jobNo, client, room: room.name,
      date: new Date().toLocaleDateString('en-AU'),
      benchtop: names?.benchtop ?? '',
      fronts: names?.fronts ?? '',
      panels: uniq(panels).join(', '),
      handles: names?.handles ?? '',
      carcass: carcass.text,
      carcass_internal: carcass.internal,
      carcass_external: carcass.external,
      drawer_box: [names?.drawerSystem, uniq(box).join(', ')].filter(Boolean).join(' - '),
      runners: [names?.runnersName, runnerLens].filter(Boolean).join(' '),
      hinges: names?.hinges ?? '',
      basins: uniq(sinks.map(f => `${f.name} ${Math.round(f.width)} x ${Math.round(f.depth)} x ${Math.round(f.height)}`)).join('\n'),
      ...fixtureSpecFields(fixtures),
      bins,
    }
  }, [names, resolvedParts, fixtures, project, room.name, cabinets])
}
