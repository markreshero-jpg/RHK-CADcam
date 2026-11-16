// RHK6468 WIR rev 4 geometry (see _tmp-6468-wir-blonde.mjs): 18 fronts / panels.
import puppeteer from 'puppeteer-core'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const R = 'dfa682a3-020b-4704-8661-3dbbd6cdf224'
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 240000 }); await page.waitForFunction(() => window.__canvasApi, { timeout: 240000 }); await sleep(4000)
  const api = async (m, ...a) => { const r = await page.evaluate((m, a) => window.__canvasApi[m](...a), m, a); await sleep(1500); if (m === 'updateCabinet') console.log(m, JSON.stringify(a), JSON.stringify(r)?.slice(0, 120)); return r }
  const ups = [
    ['TC-01', { dx: 18 }],
    ['BC-01', { offset: 18, dx: 870, dy: 262, pos_z: 120 }], ['WC-01', { offset: 18, dx: 870, dy: 18, pos_z: 382 }],
    ['BC-02', { dy: 1012, pos_z: 120 }], ['WC-02', { dy: 18, pos_z: 1132 }],
    ['BC-04', { offset: 18, dx: 1570 }],
    ['WC-10', { offset: 530, dx: 938, dz: 530 }],
  ]
  for (const l of ['TC-03', 'TC-04', 'TC-05', 'BC-04', 'BC-05', 'BC-06', 'WC-05', 'WC-06', 'WC-07', 'TC-06', 'TC-07', 'BC-07', 'WC-08', 'TC-08', 'TC-09', 'TC-10', 'BC-09', 'BC-10', 'WC-11'])
    ups.push([l, { dz: 530 }])
  for (const l of ['TC-02', 'BC-03', 'WC-04', 'BC-08', 'WC-09', 'TC-11', 'TC-16', 'TC-17', 'WC-12']) ups.push([l, { dz: 'same' }])
  const st0 = await api('getState')
  for (const [l, u] of ups) {
    if (u.dz === 'same') u.dz = st0.cabinets.find(c => c.label === l).dz
    await api('updateCabinet', l, u)
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
  for (const l of ['TC-01', 'BC-03', 'TC-02', 'TC-03', 'TC-17', 'WC-01']) {
    const r = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    const parts = r?.parts ?? r?.resolved?.parts ?? []
    console.log(l, JSON.stringify(parts.slice(0, 40).map(p => `${p.part_key ?? p.key}:${p.dx}x${p.dy}x${p.dz}`)).slice(0, 900))
  }
  const st = await api('getState'); console.log(JSON.stringify(st.cabinets.map(c => `${c.label}@${c.offset}:${c.dx}x${c.dy}x${c.dz}`)))
} finally { await browser.close() }
