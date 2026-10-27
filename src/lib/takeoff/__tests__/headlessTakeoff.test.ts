// ============================================================
// Headless takeoff run — the Takeoff / Pick List rollups on a real job, no browser.
// Skipped unless TAKEOFF_RUN is set, so `npm test` never touches the DB.
//
//   TAKEOFF_RUN='{"project":"<id>"}' TAKEOFF_OUT=out.txt npx vitest run src/lib/takeoff/__tests__/headlessTakeoff.test.ts --silent=false
//
// Signs in as the automation account from .env.local; prints the per-room
// counts, sheets and hardware to TAKEOFF_OUT (default takeoff-run.txt).
// ============================================================

import { describe, it, vi } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'

vi.mock('@/src/lib/supabase', async () => {
  const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { error } = await supabase.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
  if (error) throw error
  return { supabase }
})

const CFG: { project: string } | null = process.env.TAKEOFF_RUN ? JSON.parse(process.env.TAKEOFF_RUN) : null

describe.skipIf(!CFG)('headless takeoff', () => {
  it('rolls up the job', async () => {
    const { supabase } = await import('@/src/lib/supabase')
    const { loadProjectParts } = await import('../../optimiser/loadClient')
    const { dbLoadResolvedParts } = await import('@/app/canvas/[roomId]/canvasDB')
    const { filterRemovedParts } = await import('../../resolver/filterHidden')
    const { buildHardware, countKinds } = await import('../hardware')
    const { nestRoomsAndJob } = await import('../roomSheets')
    type HP = import('../hardware').HardwareProducts
    const t0 = Date.now()
    const out: string[] = []
    const log = (...a: unknown[]) => out.push(a.join(' '))
    const lap = (m: string) => log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)

    const { data: rooms } = await supabase.from('rooms').select('id,name').eq('project_id', CFG!.project).order('sort_order')
    const roomIds = (rooms ?? []).map(r => r.id as string)
    const { data: cabs } = await supabase.from('cabinet_instances').select('id,room_id,label,assembly_class,is_kick_assembly,bulkhead,float_shelf,cabinet_definition_id').in('room_id', roomIds)
    const defIds = [...new Set((cabs ?? []).map(c => c.cabinet_definition_id).filter(Boolean))]
    const { data: defs } = await supabase.from('cabinet_definitions').select('id,name').in('id', defIds)
    const code = new Map((defs ?? []).map(d => [d.id, d.name]))
    const raw = await dbLoadResolvedParts((cabs ?? []).map(c => c.id))
    const resolved = new Map([...raw].map(([k, v]) => [k, filterRemovedParts(v)]))
    lap(`${cabs?.length} cabinets, ${resolved.size} resolved`)

    const q = async (t: string, cols: string) => new Map((((await supabase.from(t).select(cols)).data ?? []) as unknown as Record<string, string>[]).map(r => [r.id, { name: r.name, brand: r.brand, code: r.supplier_code }]))
    const P: HP = {
      hinges: await q('hardware_hinges', 'id,name,brand,supplier_code'), plates: await q('hardware_hinge_plates', 'id,name,brand,supplier_code'),
      slides: await q('hardware_slides', 'id,name,brand'), handles: await q('hardware_handles', 'id,name,brand'), accessories: await q('hardware_accessories', 'id,name,brand,supplier_code'),
    }
    const hw = buildHardware(roomIds, cabs as never, resolved, P)

    const norm = await loadProjectParts(CFG!.project)
    const [matR, machR, profR, toolR] = await Promise.all([
      supabase.from('materials').select('id,name,dz,sheet_dx,sheet_dy,has_grain,grain_direction,trim_top,trim_bottom,trim_left,trim_right,pad,cnc_tool_id,feed_rate_pct').eq('active', true),
      supabase.from('cnc_machines').select('id,is_default').eq('active', true),
      supabase.from('cnc_machine_profiles').select('id,cnc_machine_id,name,is_default,nest_pad,tool_entry_offset,margin_use_tool_dia,margin_use_entry_offset,deduct_edgeband'),
      supabase.from('cnc_tools').select('id,diameter').eq('active', true),
    ])
    const machine = (machR.data ?? []).find(m => m.is_default) ?? machR.data?.[0]
    const prof = (profR.data ?? []).find(p => p.cnc_machine_id === machine?.id && p.is_default) ?? (profR.data ?? []).find(p => p.cnc_machine_id === machine?.id)
    lap(`${norm.parts.length} parts loaded`)
    const sheets = nestRoomsAndJob({ ...norm, materials: matR.data as never, profiles: profR.data as never, tools: toolR.data as never, profileId: prof?.id ?? null }, roomIds)
    lap('nested')

    for (const [i, r] of (rooms ?? []).entries()) {
      const kinds = countKinds((cabs ?? []).filter(c => c.room_id === r.id) as never, c => code.get((cabs ?? []).find(x => x.id === c.id)?.cabinet_definition_id) ?? null)
      log(`\n== ${r.name}`)
      log(kinds.map(k => `${k.kind} ${k.count} (${k.codes.map(c => `${c.code}×${c.count}`).join(' ')})`).join('\n'))
      log('finger pulls', JSON.stringify(hw.rooms[i].fingerPulls))
      log(sheets.rooms[i].lines.map(l => `  ${l.material} ${l.thickness}: ${l.sheets} sh (${l.sheetEquiv.toFixed(2)} eq, ${Math.round(l.efficiency * 100)}%)`).join('\n'))
      log(hw.rooms[i].lines.map(l => `  [${l.group}] ${l.qty} ${l.unit} ${l.name} — ${l.cabinets.map(c => c.label).join(',')}`).join('\n'))
    }
    log('\n== JOB nested together')
    log(sheets.job.map(l => `  ${l.material} ${l.thickness}: ${l.sheets}`).join('\n'))
    writeFileSync(process.env.TAKEOFF_OUT ?? 'takeoff-run.txt', out.join('\n'))
  }, 600000)
})
