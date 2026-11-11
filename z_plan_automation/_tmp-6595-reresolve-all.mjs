// RHK6595: re-resolve every cabinet in Kitchen + Loose Parts before nesting (persisted parts are what the nest reads),
// then print resolver issues. Also reports the pending checks: WC-01 WF, WC-02/14 709.5, WC-10 grid + bottom holes.
import puppeteer from 'puppeteer-core'
const ROOMS = { Kitchen: 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb', 'Loose Parts': 'e01106df-71c7-4db4-9165-3bfc69daa21e' }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  for (const [name, R] of Object.entries(ROOMS)) {
    const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
    await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 300000 })
    await page.waitForFunction('!!window.__canvasApi', { timeout: 300000 }); await sleep(6000)
    const cabs = (await page.evaluate(() => window.__canvasApi.getState())).cabinets
    console.log(`== ${name}: ${cabs.length} cabinets`)
    for (const c of cabs) {
      await page.evaluate(([l, dy]) => window.__canvasApi.updateCabinet(l, { dy }), [c.label, c.dy]); await sleep(1800)
    }
    await sleep(3000)
    for (const i of await page.evaluate(() => window.__canvasApi.getIssues())) if (i.errors.length || i.warnings.length) console.log('ISSUE', i.label, JSON.stringify([...i.errors, ...i.warnings].map(e => e.code + ': ' + e.message)))
    if (name === 'Kitchen') {
      for (const l of ['WC-01', 'WC-02', 'WC-14']) {
        const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
        const s = (await page.evaluate(() => window.__canvasApi.getState())).cabinets.find(x => x.label === l)
        console.log(l, 'off', s.offset, 'dx', s.dx, 'zones', JSON.stringify((rp.face_zones ?? []).map(z => [z.face_type, z.DX, z.DY])),
          'custom', JSON.stringify((rp.custom_parts ?? []).map(p => [p.name, p.orientation, p.z, p.dx, p.dy, p.dz, p.material_id?.slice(0, 8)])))
      }
      const w10 = await page.evaluate(() => window.__canvasApi.getResolved('WC-10'))
      console.log('WC-10 internal', JSON.stringify((w10.internal_parts ?? []).map(p => [p.part_type ?? p.part_key, p.DX ?? p.dx, p.DY ?? p.dy])))
      for (const s of w10.seam_joints ?? []) if (/divider_\d+:(bottom|top)/.test(s.seam_key)) console.log('WC-10', s.seam_key, s.joint_type_name, JSON.stringify(s.ops.map(o => [o.qty, o.offset_z_mm, o.spacing_mm, o.expressions?.spacing_mm])))
    }
    await page.close()
  }
} finally { await browser.close() }
