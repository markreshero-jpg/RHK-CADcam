import puppeteer from 'puppeteer-core'
const [svg, png] = process.argv.slice(2)
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', defaultViewport: { width: 1400, height: 1100 } })
const p = await b.newPage(); await p.goto('file:///' + svg); await p.screenshot({ path: png, fullPage: true }); await b.close()
