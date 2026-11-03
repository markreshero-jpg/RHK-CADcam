import puppeteer from 'puppeteer-core'
const R = process.env.ROOM, KICK = process.env.KICK
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 300)))
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) console.log('CONSOLE', m.type(), m.text().slice(0, 300)) })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  console.log(await page.evaluate(k => window.__canvasApi.kickSplit(k), KICK)); await sleep(2500)
  const click = async t => { const ok = await page.evaluate(t => { const b = [...document.querySelectorAll('button')].find(b => b.innerText.trim().startsWith(t)); if (b) b.click(); return !!b }, t); console.log('click', t, ok); await sleep(800) }
  const dump = () => page.evaluate(() => [...document.querySelectorAll('input')].map(i => i.value).join(' | ') + ' || ' + (document.body.innerText.match(/Face:[^\n]*/)?.[0] ?? ''))
  console.log('open:', await dump())
  await click('Set seams'); await click('none'); console.log('none:', await dump())
  await click('fit'); console.log('fit:', await dump())
  console.log('lit:', await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.className.includes('bg-blue-600')).map(b => b.textContent).join(' | ')))
  const reqs = []; page.on('request', r => { if (r.url().includes('supabase')) reqs.push([Date.now(), r.method(), r.url().split('/rest/v1/')[1]?.split('?')[0] ?? r.url().slice(0, 60)]) })
  const t0 = Date.now(); await click('Save')
  for (let i = 0; i < 60; i++) { if (!(await page.evaluate(() => document.body.innerText.includes('Kick split')))) break; await sleep(1000) }
  console.log('modal closed after', Date.now() - t0, 'ms; still open?', await page.evaluate(() => document.body.innerText.includes('Kick split')))
  console.log(reqs.length, 'requests'); const by = {}; for (const [, m, u] of reqs) by[m + ' ' + u] = (by[m + ' ' + u] ?? 0) + 1; console.log(JSON.stringify(by)); console.log('last at', reqs.length ? reqs[reqs.length - 1][0] - t0 : 0)
  console.log('saving label?', await page.evaluate(() => document.body.innerText.includes('Saving')))
} finally { await browser.close() }
