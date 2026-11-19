// Plan label declutter: names printed on top of each other (WUP under panel over a WC
// etc.) — the non-under-panel name steps back toward the wall, inside its cabinet.
// Saved as label_offsets.plan (same as dragging the name). Hand-moved names untouched.
// Usage: node z_plan_automation/declutter-plan-labels.mjs <roomId> [--scale 20] [--dry]
import puppeteer from 'puppeteer-core'
const [roomId] = process.argv.slice(2).filter(a => !a.startsWith('--'))
const scaleArg = process.argv.indexOf('--scale'), scale = scaleArg > 0 ? Number(process.argv[scaleArg + 1]) : 20
const dryRun = process.argv.includes('--dry')
if (!roomId) throw new Error('room id needed')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${roomId}`, { waitUntil: 'networkidle2', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi?.declutterPlanLabels', { timeout: 120000 }); await sleep(3000)
  const moves = await page.evaluate(o => window.__canvasApi.declutterPlanLabels(o), { scale, dryRun })
  for (const m of moves) console.log(m.label.padEnd(10), 'over', m.with.join(', ').padEnd(16), `-> ${m.off.y} from centre`, m.clear ? '' : '(still touching - no room)')
  console.log(moves.length ? `${moves.length} name(s) ${dryRun ? 'would move' : 'moved'}` : 'no overlapping names')
  if (!dryRun) await sleep(3000)
} finally { await browser.close() }
