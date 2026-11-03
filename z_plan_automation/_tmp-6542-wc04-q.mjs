import puppeteer from 'puppeteer-core'
const R = 'a81555f3-22f3-4efd-947b-4e083bf49c94'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), process.argv[2] ?? 'WC-04')
  console.log('keys', Object.keys(rp).join(','))
  const back = rp.case_parts.find(p => p.part_key === 'back')
  console.log('back', JSON.stringify(back).slice(0, 1500))
  const s = JSON.stringify(rp)
  for (const k of Object.keys(rp)) if (Array.isArray(rp[k]) && JSON.stringify(rp[k]).includes('back')) console.log('mentions back:', k, JSON.stringify(rp[k]).slice(0, 600))
  console.log('seams', JSON.stringify(rp.seam_joints.map(s => [s.seam_key, s.joint_type_name, s.ops?.length])))
  console.log('internal', JSON.stringify((rp.internal_parts ?? []).map(p => [p.part_type, p.X, p.Y, p.Z, p.DX, p.DY, p.DZ])))
} finally { await browser.close() }
