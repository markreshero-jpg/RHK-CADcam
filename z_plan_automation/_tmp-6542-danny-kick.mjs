import puppeteer from 'puppeteer-core'
const R = '830e087b-d817-4843-b766-5fbdd8ee6c4a', sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  await page.evaluate(() => window.__canvasApi.updateCabinet('KICK 1', { dz: 580 })); await sleep(2500)
  const rp = await page.evaluate(() => window.__canvasApi.getResolved('KICK 1'))
  console.log(JSON.stringify((rp.toekick_parts ?? rp.case_parts ?? []).map(p => [p.part_key ?? p.part_type, p.DX, p.DY, p.DZ, p.material_id?.slice(0, 8)])))
} finally { await browser.close() }
