// Kick face auto (= the cabinet's front colour): drop RHK6478's hand-set job kick face, re-resolve Buffet + Laundry kicks, report.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
console.log('job face removed', (await sb.from('job_toekick_materials').delete().eq('project_id', 'fa0884a2-abd1-4370-adfa-a30044e88ef2').eq('part_role', 'face')).error?.message ?? 'ok')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  for (const R of ['0df13af4-8a6f-438f-a10d-6a9b4754aa97', 'fc12bc7d-53ee-46ee-a302-3411f5129bcc']) {
    await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
    const st = await page.evaluate(() => window.__canvasApi.getState())
    for (const c of st.cabinets.filter(c => /KICK|BC-0[1-6]|TC-0[1-9]/.test(c.label))) {
      await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [c.label, c.dz]); await sleep(700)
      const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), c.label)
      const k = [...(rp.toekick_parts ?? []), ...rp.case_parts].filter(p => /kick_front_face|^face/.test(p.part_key ?? ''))
      if (k.length) console.log(c.label, JSON.stringify(k.map(p => [p.part_key, p.material_id?.slice(0, 8), p.DZ])))
    }
  }
} finally { await browser.close() }
