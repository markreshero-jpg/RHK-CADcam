// RHK6468 Kitchen rev 1 post: re-link sinks / taps / windows through the app, issues, shots.
import puppeteer from 'puppeteer-core'
const R = '58bac32f-cdca-4a86-a1a4-c29af7ef9430'
const OUT = process.argv[2]
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], defaultViewport: { width: 1800, height: 1100 }, protocolTimeout: 900000 })
const click = (page, t) => page.evaluate(t => { const b = [...document.querySelectorAll('button')].filter(e => e.textContent.trim() === t && e.offsetParent); b[0]?.click(); return b.length }, t)
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 120000 }); await sleep(5000)
  const api = async (fn, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message); await sleep(1200); return r }
  const st = await api('getState')
  for (const f of st.fixtures) await api('updateFixture', f.id, { x: Number(f.x), y: Number(f.y) })
  const st2 = await api('getState')
  for (const f of st2.fixtures) console.log('fixture', f.name, JSON.stringify({ cab: f.cabinet, clash: f.clash }))
  if (process.argv[3] === 'issues') for (const ci of await api('getIssues')) for (const e of [...ci.errors, ...ci.warnings]) console.log('  !', ci.label, e.code, e.message)
  await page.reload({ waitUntil: 'networkidle2' }); await page.waitForFunction(() => window.__canvasApi, { timeout: 120000 }); await sleep(5000)
  await click(page, 'Plan'); await sleep(4000); await page.screenshot({ path: OUT + 'plan.png' })
  await click(page, 'Elevation'); await sleep(4000)
  for (const w of ['Wall 2', 'Wall 3', 'Wall 7', 'Wall 8']) {
    await page.evaluate(t => { const b = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.trim() === t && e.offsetParent); b[0]?.click() }, w)
    await sleep(4000); await page.screenshot({ path: OUT + w.replace(' ', '') + '.png' })
  }
  await click(page, '3D'); await sleep(8000); await click(page, 'Reset view'); await sleep(5000); await page.screenshot({ path: OUT + '3d.png' })
} finally { await browser.close() }
