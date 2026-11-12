// RHK6339 J07 (Mark 2026-11-12): WC-01 + TC-02 "no bottom" done NATIVELY - Bottom Type = none (bottom_type column),
// replacing the first-draw workaround (case_bottom hidden in all views + BOTTOM_BACK_JOIN butts_into_back).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const R = '3bd26e44-cc9a-4c6f-bbae-a4fa0d59aeef'
const cabs = chk('c', await sb.from('cabinet_instances').select('id,label,bottom_type,part_hide_views,rule_overrides,dz').eq('room_id', R).in('label', ['WC-01', 'TC-02']))
for (const c of cabs) {
  const phv = { ...(c.part_hide_views ?? {}) }; delete phv.case_bottom
  const ro = { ...(c.rule_overrides ?? {}) }; delete ro.BOTTOM_BACK_JOIN
  console.log(c.label, 'before', c.bottom_type, JSON.stringify(c.part_hide_views), JSON.stringify(c.rule_overrides))
  chk('upd', await sb.from('cabinet_instances').update({ bottom_type: 'none', part_hide_views: phv, rule_overrides: ro }).eq('id', c.id))
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => d.dismiss())
try {
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = async (fn, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message); await sleep(2500); return r }
  for (const c of cabs) {
    await api('updateCabinet', c.label, { dz: Number(c.dz) })
    const rp = await api('getResolved', c.label)
    console.log(c.label, JSON.stringify(rp?.case_parts?.map(p => [p.part_key, p.DX, p.DY, p.DZ])))
  }
  for (const ci of await api('getIssues')) for (const e of [...ci.errors, ...ci.warnings]) console.log('  !', ci.label, e.code, e.message)
} finally { await browser.close() }
