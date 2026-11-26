// RHK6548 Hard Coffee (Mark 2026-11-27): no back scribes on any cabinet - job rule SCRBK 0, cabinet overrides cleared, all rooms re-resolved.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const P = '31ed4cce-ffd3-4004-b8f1-d62f8dad6f5c'
const ROOMS = { ws: '2bed2187-0b9c-4cf3-9e3e-5d29be5538a0', fc: '09786d9b-378e-42ed-9fc7-1aed4c7b21ab', bc: 'd3c04ade-ba07-4462-a40c-2a4bd1952d31', bk: 'e8b3c950-5be5-4e4a-9117-451395e9d2a1' }
const pj = chk('pj', await sb.from('projects').select('rule_overrides').eq('id', P).single())
chk('job', await sb.from('projects').update({ rule_overrides: { ...(pj.rule_overrides ?? {}), SCRBK: 0 } }).eq('id', P))
for (const R of Object.values(ROOMS)) {
  const rm = chk('room', await sb.from('rooms').select('rule_overrides').eq('id', R).single())
  if (rm.rule_overrides && 'SCRBK' in rm.rule_overrides) { const ro = { ...rm.rule_overrides }; delete ro.SCRBK; chk('room upd', await sb.from('rooms').update({ rule_overrides: ro }).eq('id', R)) }
  for (const c of chk('cabs', await sb.from('cabinet_instances').select('id,rule_overrides').eq('room_id', R)))
    if (c.rule_overrides && 'SCRBK' in c.rule_overrides) { const ro = { ...c.rule_overrides }; delete ro.SCRBK; chk('cab upd', await sb.from('cabinet_instances').update({ rule_overrides: ro }).eq('id', c.id)) }
}
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  for (const [k, R] of Object.entries(ROOMS)) {
    const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
    await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
    const out = await page.evaluate(async () => {
      const api = window.__canvasApi, res = []
      for (const c of api.getState().cabinets) {
        const r = await api.getResolved(c.id)
        const back = (r?.parts ?? []).find(p => /back/i.test(p.part_key ?? p.name ?? '') && !/rail/i.test(p.part_key ?? p.name ?? ''))
        res.push({ label: c.label, scrbk: r?.rules?.SCRBK ?? r?.r?.SCRBK, backZ: back?.Z ?? back?.z, errors: (r?.errors ?? []).map(e => e.code), warnings: (r?.warnings ?? []).map(e => e.code) })
      }
      return res
    })
    for (const o of out) console.log(k, JSON.stringify(o))
    await page.close()
  }
} finally { await browser.close() }
process.exit(0)
