// RHK6542 Danny's Robe rev3 (Mark 2026-11-03): AV flap inset flush with the inner drawer fronts
// (1098 wide like them, front face 576.5, 460.5-656.5 = 196 front with 25 gaps), AV shelf set back 20
// at the front (part size override sd 543.5) so the flap sits in front of it; shoe shelf = Dragon Pro
// 500x80 system box (back + bottom + steel sides) so its front / back drilling is the runner's own.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '830e087b-d817-4843-b766-5fbdd8ee6c4a'
const row = async l => chk(l, await sb.from('cabinet_instances').select('*').eq('room_id', R).eq('label', l).single())
const upd = async (l, patch) => chk('upd ' + l, await sb.from('cabinet_instances').update(patch).eq('room_id', R).eq('label', l))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DUMP = process.env.DUMP === '1'
if (!DUMP) {
  const c = await row('TC-03')
  await upd('TC-03', {
    rule_overrides: { ...(c.rule_overrides ?? {}), REVL: 18.5, REVR: 18.5, REVENDL: 18.5, REVENDR: 18.5 },
    face_grid: { ...c.face_grid,
      rows: c.face_grid.rows.map(r => r.row_index === 0 ? { ...r, height: 458.5, height_locked: true } : r.row_index === 1 ? { ...r, height: 196, height_locked: true } : r),
      zones: c.face_grid.zones.map(z => z.row_index === 1 ? { ...z, face_ins: 3.5 } : z) } })
  const s = await row('TC-02'); const t = s.internal_grid.tree
  t.fittings = t.fittings.map(f => f.type === 'inner_drawer' ? { type: 'inner_drawer', drawer_type: 'system', slide_product_id: f.slide_product_id, y_locked: true, y_position: 64 } : f)
  const hide = Object.fromEntries(Object.entries(s.part_hide_views ?? {}).filter(([k]) => !k.startsWith('int_inner_drawer_')))
  await upd('TC-02', { internal_grid: { ...s.internal_grid, tree: t }, part_hide_views: hide })
}
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  const api = (fn, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a])
  if (!DUMP) { for (const l of ['TC-02', 'TC-03']) { await api('updateCabinet', l, { dz: 580 }); await sleep(2500) } }
  const r3 = await api('getResolved', 'TC-03')
  const av = r3.internal_parts.find(p => p.part_type === 'fixed_shelf' && Math.abs(p.Y - 460.5) < 1)
  console.log('AV shelf', av && [`int_fixed_shelf_${av.sort_order}`, av.Z, av.DX])
  if (!DUMP && av) {
    const c = await row('TC-03')
    await upd('TC-03', { part_pos_overrides: { ...(c.part_pos_overrides ?? {}), [`int_fixed_shelf_${av.sort_order}`]: { ox: 0, oy: 0, oz: 0, sd: av.DX - 20 } } })
  }
  console.log('zones', JSON.stringify(r3.face_zones.map(z => [z.face_type, 'X', z.X, 'W', z.DX, 'Y', z.Y, z.Y + z.DY, 'Z', z.Z, z.DZ])))
  console.log('inner fronts', JSON.stringify(r3.internal_parts.filter(p => p.part_type === 'inner_drawer_front').map(p => ['X', p.X, 'W', p.DY, 'Y', p.Y, p.Y + p.DX, 'Z', p.Z, p.DZ])))
  console.log('keys', Object.keys(r3).join(' '))
  console.log('hinge_instances', JSON.stringify((r3.hinge_instances ?? []).map(h => Object.fromEntries(Object.entries(h).filter(([k, v]) => typeof v !== 'object' || v === null)))).slice(0, 1500)); console.log('target', JSON.stringify((r3.hinge_instances ?? []).map(h => h.mount_target ?? h.target)))
  console.log('pos ov', JSON.stringify((await row('TC-03')).part_pos_overrides))
  console.log('hinges', JSON.stringify((r3.hinges ?? r3.resolved_hinges ?? []).map(h => [h.hinge_edge ?? h.edge, h.cup_x ?? h.X, h.cup_y ?? h.Y, h.mount_target?.part_key ?? h.target?.part_key ?? h.target])))
  for (const l of ['TC-02', 'TC-04']) {
    const rp = await api('getResolved', l)
    const s = rp.internal_slides.filter(x => x.side === 'left')[l === 'TC-04' ? 'slice' : 'slice'](0, 1)
    console.log(l, 'parts', JSON.stringify(rp.internal_parts.filter(p => p.part_type.startsWith('inner')).slice(0, 4).map(p => [p.part_type, 'Y', p.Y, 'Z', p.Z, p.DX, p.DY, p.DZ])))
    for (const x of s) { console.log(l, 'drill0', JSON.stringify(x.drills[0])); console.log(l, 'slide Y', x.Y, 'h', x.box_height, 'drills', JSON.stringify(x.drills.map(d => Object.fromEntries(Object.entries(d).filter(([k, v]) => typeof v !== 'object' || v === null).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 10) / 10 : v]))))) }
  }
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('errors', issues.reduce((a, c) => a + c.errors.length, 0), 'issues', n)
} finally { await browser.close() }
