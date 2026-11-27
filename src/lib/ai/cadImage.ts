// CAD → picture for the AI helper (z_ai_helper Q9, Mark 2026-11-28: "can we get the ai
// model to be able to read cad, even my site sketches that I put on the canvas").
//
// Site sketches are freehand strokes — the numbers are handwriting, not text — so the
// model has to SEE them. This draws one view's CAD (plan, or one wall's elevation) as an
// SVG with a labelled mm grid and the room's walls faint behind, for sharp → PNG on the
// server. Typed text and dims are also listed as words (cadText) so nothing typed is
// left to the eye. Pure — no DB.

import {
  arcSample, boxCorners, circleSample, cloudPath, dimLayout, dimText, isSpecialDim, sampleBulged,
  specialDimPoints, specialDimText, type AnnotationGeom, type ArcGeom, type BoxGeom, type CircleGeom,
  type CloudGeom, type DimGeom, type LineGeom, type Pt, type TextGeom,
} from '../annotations/geometry'

export interface CadRow {
  kind: string
  geom: AnnotationGeom | Record<string, unknown>
  text: string | null
  style?: { color?: string; size?: number } | null
}
/** A wall in the plan frame: start, angle (deg), length, thickness. */
export interface CadWall { name: string; pos_x: number; pos_y: number; angle: number; length: number; thickness?: number | null }

const PX = 1600          // longest side of the picture
const PAD = 70           // px margin round the drawing (grid labels sit in it)

/** Every point a row covers (for the bounds), in its frame. */
function rowPoints(r: CadRow): Pt[] {
  const g = r.geom as Record<string, unknown>
  switch (r.kind) {
    case 'line': { const l = g as unknown as LineGeom; return sampleBulged(l.pts ?? [], l.bulges, !!l.closed) }
    case 'cloud': return (g as unknown as CloudGeom).pts ?? []
    case 'rect': case 'ellipse': return boxCorners(g as unknown as BoxGeom)
    case 'circle': return circleSample(g as unknown as CircleGeom, 16)
    case 'arc': return arcSample(g as unknown as ArcGeom, 16)
    case 'dim': return isSpecialDim(g) ? specialDimPoints(g) : [(g as unknown as DimGeom).p1, (g as unknown as DimGeom).p2]
    case 'text': { const t = g as unknown as TextGeom; return [t.at, ...(t.leader ?? [])] }
    default: return []
  }
}

const wallEnds = (w: CadWall): [Pt, Pt] => {
  const a = (w.angle * Math.PI) / 180
  return [{ x: w.pos_x, y: w.pos_y }, { x: w.pos_x + Math.cos(a) * w.length, y: w.pos_y + Math.sin(a) * w.length }]
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const n1 = (n: number) => Math.round(n * 10) / 10

/** A grid step giving ~4–12 lines across the bigger side. */
function gridStep(span: number): number {
  for (const s of [100, 200, 250, 500, 1000, 2000, 5000]) if (span / s <= 12) return s
  return 10000
}

export interface CadPicture { svg: string; width: number; height: number; items: number; scale: number }

/**
 * Draw `rows` (one view's CAD, in its frame) as an SVG. flipY for an elevation (z up).
 * `walls` (plan only) are drawn faint grey with their names. Null when there's nothing to draw.
 */
export function cadSvg(rows: CadRow[], opts: { flipY?: boolean; walls?: CadWall[]; title?: string } = {}): CadPicture | null {
  const pts = [...rows.flatMap(rowPoints), ...(opts.walls ?? []).flatMap(wallEnds)].filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.y))
  if (!pts.length) return null
  let x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x))
  let y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y))
  if (x1 - x0 < 200) { x0 -= 100; x1 += 100 }
  if (y1 - y0 < 200) { y0 -= 100; y1 += 100 }
  const span = Math.max(x1 - x0, y1 - y0)
  const s = (PX - 2 * PAD) / span
  const W = Math.round((x1 - x0) * s + 2 * PAD), H = Math.round((y1 - y0) * s + 2 * PAD)
  const flip = !!opts.flipY
  const X = (x: number) => n1(PAD + (x - x0) * s)
  const Y = (y: number) => n1(flip ? PAD + (y1 - y) * s : PAD + (y - y0) * s)
  const path = (p: Pt[], closed = false) => p.length ? `M${p.map(q => `${X(q.x)} ${Y(q.y)}`).join(' L')}${closed ? ' Z' : ''}` : ''

  const out: string[] = []
  // Grid, labelled in frame mm (plan: room mm; elevation: along the wall / height off the floor).
  const step = gridStep(span)
  const grid: string[] = [], labels: string[] = []
  for (let gx = Math.ceil(x0 / step) * step; gx <= x1; gx += step) {
    grid.push(`M${X(gx)} ${PAD - 10} V${H - PAD + 10}`)
    labels.push(`<text x="${X(gx)}" y="${PAD - 16}" text-anchor="middle">${gx}</text>`)
  }
  for (let gy = Math.ceil(y0 / step) * step; gy <= y1; gy += step) {
    grid.push(`M${PAD - 10} ${Y(gy)} H${W - PAD + 10}`)
    labels.push(`<text x="${PAD - 14}" y="${Y(gy) + 4}" text-anchor="end">${gy}</text>`)
  }
  out.push(`<path d="${grid.join(' ')}" stroke="#d8dee8" stroke-width="1" fill="none"/>`)
  out.push(`<g font-family="Arial" font-size="13" fill="#8a94a6">${labels.join('')}</g>`)
  out.push(`<text x="${W - 12}" y="${H - 12}" text-anchor="end" font-family="Arial" font-size="13" fill="#8a94a6">grid ${step} mm${flip ? ' · x along the wall, y height off the floor' : ' · plan, room mm'}</text>`)
  if (opts.title) out.push(`<text x="12" y="22" font-family="Arial" font-size="16" font-weight="bold" fill="#334">${esc(opts.title)}</text>`)

  // Walls (plan context): faint thick band + name.
  for (const w of opts.walls ?? []) {
    const [a, b] = wallEnds(w)
    out.push(`<path d="${path([a, b])}" stroke="#b9c2cf" stroke-width="${Math.max(3, n1((w.thickness ?? 90) * s))}" stroke-linecap="square" fill="none"/>`)
    out.push(`<text x="${n1((X(a.x) + X(b.x)) / 2)}" y="${n1((Y(a.y) + Y(b.y)) / 2) - 8}" text-anchor="middle" font-family="Arial" font-size="13" fill="#7a8494">${esc(w.name)}</text>`)
  }

  // The CAD, all in near-black so faint pen colours still read.
  const ink = (c?: string) => (!c || /^#?(fff|ffffff)$/i.test(c) ? '#111' : c)
  let items = 0
  for (const r of rows) {
    const g = r.geom as Record<string, unknown>
    const col = ink(r.style?.color)
    const stroke = `stroke="${col}" stroke-width="2.2" fill="none" stroke-linejoin="round" stroke-linecap="round"`
    let el = ''
    if (r.kind === 'line') { const l = g as unknown as LineGeom; el = `<path d="${path(sampleBulged(l.pts ?? [], l.bulges, !!l.closed), !!l.closed)}" ${stroke}/>` }
    else if (r.kind === 'rect') el = `<path d="${path(boxCorners(g as unknown as BoxGeom), true)}" ${stroke}/>`
    else if (r.kind === 'ellipse') {
      const c = boxCorners(g as unknown as BoxGeom)
      const cx = (c[0].x + c[2].x) / 2, cy = (c[0].y + c[2].y) / 2
      const rx = Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y) / 2, ry = Math.hypot(c[3].x - c[0].x, c[3].y - c[0].y) / 2
      el = `<ellipse cx="${X(cx)}" cy="${Y(cy)}" rx="${n1(rx * s)}" ry="${n1(ry * s)}" ${stroke}/>`
    }
    else if (r.kind === 'circle') el = `<path d="${path(circleSample(g as unknown as CircleGeom, 48), true)}" ${stroke}/>`
    else if (r.kind === 'arc') el = `<path d="${path(arcSample(g as unknown as ArcGeom, 32))}" ${stroke}/>`
    else if (r.kind === 'cloud') {
      const c = g as unknown as CloudGeom
      el = `<path d="${cloudPath((c.pts ?? []).map(p => ({ x: X(p.x), y: Y(p.y) })), 10)}" stroke="#c0392b" stroke-width="2" fill="none"/>`
    }
    else if (r.kind === 'dim') {
      if (isSpecialDim(g)) {
        const sp = specialDimPoints(g)
        el = `<path d="${path(sp)}" stroke="#1f6feb" stroke-width="1.5" fill="none"/><text x="${X(sp[sp.length - 1].x)}" y="${Y(sp[sp.length - 1].y)}" font-family="Arial" font-size="15" fill="#1f6feb">${esc(specialDimText(g, r.text))}</text>`
      } else {
        const d = g as unknown as DimGeom
        const L = dimLayout(d)
        const v = d.axis === 'x' ? Math.abs(d.p2.x - d.p1.x) : d.axis === 'y' ? Math.abs(d.p2.y - d.p1.y) : Math.hypot(d.p2.x - d.p1.x, d.p2.y - d.p1.y)
        const mid = { x: (L.d1.x + L.d2.x) / 2, y: (L.d1.y + L.d2.y) / 2 }
        el = `<path d="${path([d.p1, L.d1])} ${path([d.p2, L.d2])} ${path([L.d1, L.d2])}" stroke="#1f6feb" stroke-width="1.5" fill="none"/>`
          + `<text x="${X(mid.x)}" y="${Y(mid.y) - 5}" text-anchor="middle" font-family="Arial" font-size="15" font-weight="bold" fill="#1f6feb">${esc(dimText(v, r.text))}</text>`
      }
    }
    else if (r.kind === 'text' && r.text) {
      const t = g as unknown as TextGeom
      const lines = r.text.split('\n')
      el = (t.leader?.length ? `<path d="${path([t.at, ...t.leader])}" stroke="${col}" stroke-width="1.2" fill="none"/>` : '')
        + `<text x="${X(t.at.x)}" y="${Y(t.at.y) + 15}" font-family="Arial" font-size="16" fill="${col}">${lines.map((l, i) => `<tspan x="${X(t.at.x)}" dy="${i ? 19 : 0}">${esc(l)}</tspan>`).join('')}</text>`
    }
    if (el) { out.push(el); items++ }
  }
  if (!items) return null
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/>${out.join('')}</svg>`,
    width: W, height: H, items, scale: s,
  }
}

/** Typed CAD as words: text items and dimension values, with where they are. */
export function cadText(rows: CadRow[]): string[] {
  const out: string[] = []
  for (const r of rows) {
    const g = r.geom as Record<string, unknown>
    if (r.kind === 'text' && r.text?.trim()) {
      const t = g as unknown as TextGeom
      out.push(`text at (${Math.round(t.at.x)}, ${Math.round(t.at.y)}): "${r.text.trim().replace(/\s*\n\s*/g, ' / ')}"`)
    } else if (r.kind === 'dim') {
      if (isSpecialDim(g)) { out.push(`dim ${specialDimText(g, r.text)}`); continue }
      const d = g as unknown as DimGeom
      const v = d.axis === 'x' ? Math.abs(d.p2.x - d.p1.x) : d.axis === 'y' ? Math.abs(d.p2.y - d.p1.y) : Math.hypot(d.p2.x - d.p1.x, d.p2.y - d.p1.y)
      out.push(`dim ${dimText(v, r.text)} from (${Math.round(d.p1.x)}, ${Math.round(d.p1.y)}) to (${Math.round(d.p2.x)}, ${Math.round(d.p2.y)})${r.text ? ` (text typed over the measured ${Math.round(v)})` : ''}`)
    }
  }
  return out
}

/** Freehand strokes (Sketch tool) in the rows — the part only the picture can show. */
export const sketchCount = (rows: CadRow[]) => rows.filter(r => r.kind === 'line' && (r.geom as LineGeom).freehand).length
