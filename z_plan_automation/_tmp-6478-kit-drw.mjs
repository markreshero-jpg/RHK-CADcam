// RHK6478 Kitchen: dump Wall 2 drawer bases' fronts / rails / boxes.
import puppeteer from 'puppeteer-core'
const R = 'dd6c9440-6664-4e87-8ea9-4d88b7a9b1b6'
const labels = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = async (fn, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a])
  const st = await api('getState')
  for (const l of labels) {
    const c = st.cabinets.find(c => c.label === l); console.log('\n', l, c?.def ?? c?.definition, c?.wall, 'dy', c?.dy, 'dz', c?.dz)
    const r = await api('getResolved', l)
    console.log(" rails", JSON.stringify((r?.case_parts ?? []).filter(p => String(p.part_key).startsWith("fprail")).map(p => ({k:p.part_key,X:p.X,Y:p.Y,Z:p.Z,DX:p.DX,DY:p.DY,DZ:p.DZ,rot:p.rotation??p.orientation}))))
    console.log(" zones", JSON.stringify((r?.face_zones ?? []).map(z => [z.row_index, z.zone_type, z.Y, z.DY, z.finger_gap, z.Z])))
    console.log(' faces', JSON.stringify((r?.face_parts ?? r?.faces ?? []).map(f => [f.part_key ?? f.zone_type, f.Y, f.DY])))
    for (const s of r?.drawer_stacks ?? []) console.log(' box', JSON.stringify({ row: s.face_zone_row, Y: s.box_Y, h: s.box_height, Z: s.box_Z, d: s.box_depth, parts: (s.box_parts || []).map(p => [p.part_key ?? p.part_type, p.Y, p.DY, p.DX, p.Z, p.DZ]), sl: (s.slides || []).map(x => [x.side, x.Y, x.DY, x.Z, x.DX, x.box_height, x.model_url ? 1 : 0]) }))
    console.log(' keys', Object.keys(r ?? {}).join(','))
  }
  console.log('issues', JSON.stringify((await api('getIssues')).filter(i => i.errors.length || i.warnings.length)))
} finally { await browser.close() }
