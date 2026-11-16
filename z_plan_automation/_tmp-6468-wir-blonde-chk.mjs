import puppeteer from 'puppeteer-core'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const R = 'dfa682a3-020b-4704-8661-3dbbd6cdf224'
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 240000 }); await page.waitForFunction(() => window.__canvasApi, { timeout: 240000 }); await sleep(4000)
  const out = await page.evaluate(async labels => {
    const res = {}
    for (const l of labels) {
      const r = await window.__canvasApi.getResolved(l)
      const walk = (o, d = 0) => { if (!o || typeof o !== 'object' || d > 3) return null; for (const [k, v] of Object.entries(o)) { if (Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object' && ('dz' in v[0] || 'thickness' in v[0])) return [k, v]; } for (const v of Object.values(o)) { const x = walk(v, d + 1); if (x) return x } return null }
      const top = r ? Object.keys(r) : null
      const all = [...(r?.case_parts??[]),...(r?.internal_parts??[]),...(r?.custom_parts??[])]
      const f = ['x', all]
      if (l==='TC-17') res.mirror = r.custom_parts
      res[l] = { parts: f?.[1]?.map(p => `${p.part_key ?? p.key ?? p.name}:${Math.round(p.dx*10)/10}x${Math.round(p.dy*10)/10}x${p.dz ?? p.thickness} ${String(p.material_name ?? p.material_id ?? '').slice(0, 30)}`) }
    }
    return res
  }, ['TC-17'])
  console.log(JSON.stringify(out, null, 1))
} finally { await browser.close() }
