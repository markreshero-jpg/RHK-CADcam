// RHK6592: re-resolve + relink fixtures in a room, print fixtures + issues.  node _tmp-6592-rr.mjs <roomId> <steps.json>
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
const [roomId, stepsPath] = process.argv.slice(2)
const steps = JSON.parse(fs.readFileSync(stepsPath, 'utf8'))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage()
  page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  const open = async () => { await page.goto(`http://localhost:3001/canvas/${roomId}`, { waitUntil: 'networkidle2', timeout: 60000 }); await page.waitForFunction('!!window.__canvasApi'); await sleep(1500) }
  await open()
  const api = (fn, args) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, args])
  for (const [fn, args] of steps) { try { console.log(fn, JSON.stringify(args), JSON.stringify(await api(fn, args))) } catch (e) { console.log(fn, 'FAILED', e.message.split('\n')[0]) } await sleep(600) }
  const st = await api('getState', [])
  for (const f of st.fixtures) await api('updateFixture', [f.id, { x: f.x, y: f.y }]).catch(e => console.log('fixture', e.message))
  await sleep(1000); await open()
  console.log(JSON.stringify((await api('getState', [])).fixtures.map(f => ({ n: f.name ?? f.kind, x: f.x, y: f.y, w: f.width, cab: f.cabinet, clash: f.clash }))))
  for (const c of await api('getIssues', [])) if (c.errors.length || c.warnings.length) console.log(c.label, JSON.stringify([...c.errors, ...c.warnings].map(e => e.code + ' ' + e.message)))
  console.log('issues done')
} finally { await browser.close() }
