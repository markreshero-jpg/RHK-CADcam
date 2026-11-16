// RHK6468 WIR rev 4: open-bay drawer banks BC-01/02/03/08 have seen gables -> exposed interior (Blonde Oak 18),
// inset front reveals = gable 18 + 2, setback stays 16 (top = 18 top + 25 finger gap).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const R = 'dfa682a3-020b-4704-8661-3dbbd6cdf224'
for (const l of ['BC-01', 'BC-02', 'BC-03', 'BC-08']) {
  const c = chk(l, await sb.from('cabinet_instances').select('id,rule_overrides').eq('room_id', R).eq('label', l).single())
  chk(l + 'u', await sb.from('cabinet_instances').update({ exposed_interior: true, rule_overrides: { ...(c.rule_overrides ?? {}), FACINS: 16, REVSL: 20, REVSR: 20, REVB: 20, REVT: 43 } }).eq('id', c.id))
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 240000 }); await page.waitForFunction(() => window.__canvasApi, { timeout: 240000 }); await sleep(4000)
  const out = await page.evaluate(async () => {
    const o = {}
    for (const l of ['BC-01', 'BC-02', 'BC-03', 'BC-08']) {
      await window.__canvasApi.updateCabinet(l, { dz: 550 })
      const r = await window.__canvasApi.getResolved(l)
      o[l] = { case: r.case_parts.map(p => `${p.part_type ?? p.key ?? p.role}:${Object.entries(p).filter(([k, v]) => typeof v === 'number').map(([k, v]) => k + '=' + Math.round(v * 10) / 10).join(' ')} ${String(p.material_id).slice(0, 8)}`).slice(0, 3),
        zones: (r.face_zones ?? []).map(z => Object.entries(z).filter(([k, v]) => typeof v === 'number').map(([k, v]) => k + '=' + Math.round(v * 10) / 10).join(' ')) }
    }
    return o
  })
  console.log(JSON.stringify(out, null, 1))
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) console.log(`  ${ci.label} ${e.code}: ${e.message}`)
} finally { await browser.close() }
