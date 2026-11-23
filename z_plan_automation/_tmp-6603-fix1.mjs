// RHK6603: slider carriers -> one face-on 842 x 2000 Designer White panel each; WIR robe backs split at the
// division (1604 wide > 1211 sheet); window-wall kicks joined. Then re-resolve + issues.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const WIR = '3cd247df-de60-4167-a83a-680c91385d6f', SL = 'ef57e666-fd85-4f5c-b7c5-b6befd8af7f5', DW = '57675a0e-5d4f-4577-8f24-212f0888f166'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const sl = chk('sl', await sb.from('cabinet_instances').select('id,label').eq('room_id', SL).order('label'))
for (const [i, c] of sl.entries()) {
  const ap = chk('ap', await sb.from('cabinet_custom_parts').select('id').eq('cabinet_instance_id', c.id))
  chk('upd', await sb.from('cabinet_custom_parts').update({ name: `Sliding door ${i + 1} of 6 (842 x 2000)`, expressions: {}, orientation: 'front', dx: 842, dy: 2000, dz: 16.5, x: 0, y: 0, z: 0, material_id: DW, material_override_id: DW, edge_top: true, edge_bottom: true, edge_left: true, edge_right: true }).eq('id', ap[0].id))
}
const tc = chk('tc', await sb.from('cabinet_instances').select('id,label,dx').eq('room_id', WIR).in('label', ['TC-01', 'TC-02', 'TC-03']))
for (const c of tc) chk('split', await sb.from('cabinet_instances').update({ split: { at: [], back_x: [c.dx / 2] } }).eq('id', c.id))

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000 }, protocolTimeout: 300000 })
try {
  for (const [R, job] of [[SL, 'sl'], [WIR, 'wir']]) {
    const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
    await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(5000)
    const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(90000).then(() => 'TIMEOUT')]); await sleep(1500); return r }
    if (job === 'sl') for (const c of sl) console.log(c.label, JSON.stringify(await api('updateCabinet', c.label, { dx: 842, dz: 17 })).slice(0, 120))
    else {
      for (const l of ['TC-01', 'TC-02', 'TC-03']) console.log(l, JSON.stringify(await api('updateCabinet', l, { dy: 1933 })).slice(0, 120))
      console.log('joinKicks', JSON.stringify(await api('joinKicks', 'BC-02')).slice(0, 300))
    }
    console.log('issues', JSON.stringify(await api('getIssues')).slice(0, 1500))
    await page.close()
  }
} finally { await browser.close() }
process.exit(0)
