// RHK6595 rev 5: oven fixture onto BC-11's raised oven shelf; print all resolver errors/warnings.
import puppeteer from 'puppeteer-core'
const R = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb', OVEN = 'f407f777-600c-46b7-b7ac-d110e7dbb7f1'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(5000)
  const rp = await page.evaluate(() => window.__canvasApi.getResolved('BC-11'))
  for (const p of rp.internal_parts ?? []) console.log('int', p.part_key ?? p.part_type, 'Y', p.Y, 'DY', p.DY, 'DZ', p.DZ)
  console.log('stacks', JSON.stringify(rp.drawer_stacks?.map(d => ({ Y: d.box_Y, n: d.boxes?.length })) ?? Object.keys(rp)))
  const sh = (rp.internal_parts ?? []).find(p => /fixed_shelf/.test(p.part_key ?? p.part_type))
  if (sh && process.argv[2] === 'set') {
    const top = sh.Y + (sh.DZ ?? 16.5)
    await page.evaluate(([id, z]) => window.__canvasApi.updateFixture(id, { z }), [OVEN, 100 + top]); await sleep(3000)
    console.log('oven z ->', 100 + top, JSON.stringify((await page.evaluate(() => window.__canvasApi.getState())).fixtures.find(f => f.id === 'f407f777-600c-46b7-b7ac-d110e7dbb7f1')))
  }
  for (const i of await page.evaluate(() => window.__canvasApi.getIssues())) if (i.errors.length || i.warnings.length) console.log('ISSUE', i.label, JSON.stringify([...i.errors, ...i.warnings].map(e => e.code + ': ' + e.message)))
} finally { await browser.close() }
