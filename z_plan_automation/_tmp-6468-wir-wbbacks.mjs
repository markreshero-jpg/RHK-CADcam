// RHK6468 WIR (Mark 2026-11-25): open drawer banks BC-01/02/03/08 backs -> Whiteboard 16.5 (material_overrides.back),
// the rest of the box stays exposed Blonde Oak 18. Then re-resolve.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const R = 'dfa682a3-020b-4704-8661-3dbbd6cdf224'
const LABELS = ['BC-01', 'BC-02', 'BC-03', 'BC-08']
const wbs = chk('wb', await sb.from('materials').select('id,name').ilike('name', 'Whiteboard 16.5mm%'))
console.log('whiteboard rows', JSON.stringify(wbs))
if (wbs.length !== 1) throw new Error('expected one Whiteboard 16.5mm row')
const WB = wbs[0].id
const DRY = process.argv.includes('--dry')
const DZ = {}
for (const l of LABELS) {
  const c = chk(l, await sb.from('cabinet_instances').select('id,dx,dy,dz,material_overrides,exposed_interior').eq('room_id', R).eq('label', l).single())
  console.log(l, JSON.stringify(c)); DZ[l] = c.dz
  if (!DRY) chk(l + 'u', await sb.from('cabinet_instances').update({ material_overrides: { ...(c.material_overrides ?? {}), back: WB } }).eq('id', c.id))
}
if (DRY) process.exit(0)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 240000 }); await page.waitForFunction(() => window.__canvasApi, { timeout: 240000 }); await sleep(4000)
  const out = await page.evaluate(async ([LABELS, DZ]) => {
    const o = {}
    for (const l of LABELS) {
      o[l] = { upd: await window.__canvasApi.updateCabinet(l, { dz: DZ[l] }) }
      const r = await window.__canvasApi.getResolved(l)
      o[l].parts = r.case_parts.map(p => `${p.name ?? p.part_type ?? p.key ?? p.role}: ${Math.round(p.dx * 10) / 10} x ${Math.round(p.dy * 10) / 10} x ${p.dz} mat ${String(p.material_id).slice(0, 8)}`)
    }
    return o
  }, [LABELS, DZ])
  console.log(JSON.stringify(out, null, 1))
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); for (const ci of issues) if (LABELS.includes(ci.label)) for (const e of [...ci.errors, ...ci.warnings]) console.log(`  ${ci.label} ${e.code}: ${e.message}`)
  await sleep(3000)
} finally { await browser.close() }
