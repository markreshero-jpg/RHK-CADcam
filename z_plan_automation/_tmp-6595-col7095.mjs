// RHK6595: finish the WC-01 WF change - column WC-02 / WC-14 dx 711 -> 709.5 (pos_x already 2752, offset 18).
import puppeteer from 'puppeteer-core'
const R = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 300000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 300000 }); await sleep(6000)
  for (const l of ['WC-02', 'WC-14']) {
    await page.evaluate(l => window.__canvasApi.updateCabinet(l, { dx: 709.5, offset: 18 }), l); await sleep(3000)
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    const s = (await page.evaluate(() => window.__canvasApi.getState())).cabinets.find(x => x.label === l)
    console.log(l, 'off', s.offset, 'dx', s.dx, 'zones', JSON.stringify((rp.face_zones ?? []).map(z => [z.face_type, z.DX, z.DY])), 'err', JSON.stringify([...(rp.errors ?? []), ...(rp.warnings ?? [])].map(e => e.code)))
  }
  const st = (await page.evaluate(() => window.__canvasApi.getState())).cabinets
  for (const l of ['WC-01', 'WC-02', 'WC-14', 'WC-03', 'WC-04']) { const c = st.find(x => x.label === l); console.log(l, c.offset, c.dx, '->', +(c.offset + c.dx).toFixed(2)) }
} finally { await browser.close() }
