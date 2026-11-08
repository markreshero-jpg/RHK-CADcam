// ============================================================
// Plan-only check (z_ai_helper AI3): what a change WOULD do — no writes.
// Skipped unless PLAN_RUN is set. Safe on any room: planBatch only reads.
//
//   PLAN_RUN='{"room":"<room id>","ops":[{"op":"place","code":"BEPF","wall":"Island 1","back":true,"at_end":"left"}]}' \
//     npx vitest run src/lib/ai/__tests__/headlessPlan.test.ts --silent=false --reporter=verbose
//
// Prints the lines, and for each planned insert where it sits relative to its
// wall line (which side) next to the existing cabinets on that wall.
// ============================================================

import { describe, it } from 'vitest'
import { readFileSync } from 'node:fs'

interface Cfg { room: string; ops: unknown[] }
const CFG: Cfg | null = process.env.PLAN_RUN ? JSON.parse(process.env.PLAN_RUN) : null

describe.skipIf(!CFG)('plan only', () => {
  it('plans', async () => {
    const cfg = CFG!
    const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('='))
      .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
    const { createClient } = await import('@supabase/supabase-js')
    const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    const { error } = await client.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
    if (error) throw error
    const { withSupabaseRead } = await import('../server/scope')
    const { planBatch } = await import('../server/cabinetBatch')
    const { cabinetCenterPt, cabWallPerp, centroid, wallInwardNormal, wallDir } = await import('@/src/lib/geometry')
    type Op = import('../server/cabinetBatch').BatchOp
    type Cab = import('@/src/lib/types').CabinetInstance

    await withSupabaseRead(client, async () => {
      const plan = await planBatch(cfg.room, cfg.ops as Op[])
      console.log([...plan.lines, ...plan.warnings.map(w => '⚠ ' + w), ...plan.problems.map(p => '✗ ' + p)].join('\n'))
      const { walls, cabinets } = plan.state
      const ref = centroid(walls)
      // Signed distance of a cabinet's centre off its wall line (+ = the inward / face side).
      const side = (c: Cab) => {
        const w = walls.find(x => x.id === c.wall_id)!
        const ctr = cabinetCenterPt(c, w, cabWallPerp(c, w, wallInwardNormal(w, ref)))
        const d = wallDir(w), n = wallInwardNormal(w, ref)
        return { perp: Math.round((ctr.x - w.pos_x) * n.x + (ctr.y - w.pos_y) * n.y), along: Math.round((ctr.x - w.pos_x) * d.x + (ctr.y - w.pos_y) * d.y) }
      }
      for (const s of plan.steps) {
        if (s.kind !== 'insert') continue
        const c = { ...(s.row as Cab), id: 'new' }
        const s0 = side(c)
        console.log(`NEW ${s.row.label}: rot ${s.row.rotation}, centre ${s0.along} along / ${s0.perp} off the wall line`)
        for (const x of cabinets.filter(x => x.wall_id === s.row.wall_id)) {
          const sx = side(x)
          console.log(`   ${x.label}: rot ${x.rotation}, centre ${sx.along} along / ${sx.perp} off the wall line`)
        }
      }
    })
  }, 120_000)
})
