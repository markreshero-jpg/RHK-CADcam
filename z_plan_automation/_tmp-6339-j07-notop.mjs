// RHK6339 J07 (Mark 2026-11-12): WC-01 Top Type none (the WC-02 33 top sits on it); with the resolver fix the
// centre division + gables run from the bench to the WC-02 top. Re-resolve WC-01 + TC-02 (no bottom).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '3bd26e44-cc9a-4c6f-bbae-a4fa0d59aeef'
console.log((await sb.from('cabinet_instances').update({ top_type: 'none' }).eq('room_id', R).eq('label', 'WC-01')).error?.message ?? 'top none')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => d.dismiss())
try {
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = async (fn, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message); await sleep(3000); return r }
  for (const [l, dz] of [['WC-01', 305], ['TC-02', 286]]) {
    await api('updateCabinet', l, { dz })
    const rp = await api('getResolved', l)
    console.log(l, 'case', JSON.stringify(rp?.case_parts?.map(p => [p.part_key, p.Y, p.DX, p.DY, p.DZ])))
    console.log(l, 'int', JSON.stringify(rp?.internal_parts?.map(p => [p.part_type, p.X, p.Y, p.DX, p.DY, p.DZ])))
  }
  for (const ci of await api('getIssues')) for (const e of [...ci.errors, ...ci.warnings]) console.log('  !', ci.label, e.code, e.message)
} finally { await browser.close() }
