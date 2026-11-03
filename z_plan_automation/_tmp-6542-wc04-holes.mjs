import puppeteer from 'puppeteer-core'
const R = 'a81555f3-22f3-4efd-947b-4e083bf49c94'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  const rp = await page.evaluate(() => window.__canvasApi.getResolved('WC-04'))
  console.log('case', JSON.stringify(rp.case_parts.map(p => [p.part_key, p.X, p.Y, p.Z, p.DX, p.DY, p.DZ])))
  for (const s of rp.seam_joints) if (/back/.test(s.seam_key)) console.log(s.seam_key, s.joint_type_name, JSON.stringify(s).slice(0, 1500))
} finally { await browser.close() }
