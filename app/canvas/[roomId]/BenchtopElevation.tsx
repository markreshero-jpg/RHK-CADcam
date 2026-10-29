'use client'

// ============================================================
// Benchtops on a wall elevation (benchtop Phase 3b, spec P-h).
// A top shows on its anchor elevation, on every wall face its
// edges sit against, and on both sides of an island anchor
// (benchtopAnchor.btShowsOn). Elevation x = distance along the
// wall face (same as cabT); y = roomH − height.
//
// Drawn: a band from underside to top over the top's extent;
// a divider wherever the front face steps (an L's return leg
// reads as its own short band); the build-up line for built-up
// methods; waterfall legs down to the floor with the mitre;
// join seams on the front face; profile codes under the front
// edges; mitred aprons as one face down to the apron drop. Gated by layer items benchtops / benchtop_edges /
// benchtop_joins.
// ============================================================

import { Fragment } from 'react'
import { useLineScale } from '@/src/lib/usePhone'
import type { BenchtopInstance, BenchtopEdgeProfile, Wall } from '@/src/lib/types'
import type { LayerView } from '@/src/lib/displayLayers/resolve'
import type { Pt } from '@/src/lib/geometry'
import {
  btSegments, outlinePoints, outwardNormal, segSamples, segMid, effectiveProfileId, waterfallJoin, waterfallBuildUp,
} from '@/src/lib/benchtopGeometry'
import { wallFrame, alongOf, offOf, wallContacts, btShowsOn, type WallSide } from '@/src/lib/benchtopAnchor'
import type { BtThickness } from './useBenchtopCatalog'
import { roundMm } from '@/src/lib/format'
import { PRINT_INK, MIN_PEN, pen } from '@/src/lib/shopDrawings/pens'

export interface BtElevInfo {
  /** Top-surface height above the floor = underside (base height) + thickness (P-g). */
  topZ: number
  thick: BtThickness
  defaultProfileId: string | null
}

const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y

/** Each top shown on this wall side as its band in elevation svg coords (x along the
 *  face, back side mirrored; y = roomH − height) — the CAD snap targets (z_CAD_tool A6b). */
export function btElevBands(benchtops: BenchtopInstance[], walls: Wall[], wall: Wall, side: WallSide, roomCx: Pt, roomH: number,
  info: (bt: BenchtopInstance) => BtElevInfo): { t0: number; t1: number; yTop: number; yBot: number }[] {
  const f0 = wallFrame(wall, side, roomCx)
  const f = side === 'back'
    ? { ...f0, o: { x: f0.o.x + f0.d.x * f0.len, y: f0.o.y + f0.d.y * f0.len }, d: { x: -f0.d.x, y: -f0.d.y } }
    : f0
  return benchtops.flatMap(bt => {
    const segs = btSegments(bt)
    if (segs.length < 3 || !btShowsOn(bt, wallContacts(segs, walls, roomCx), wall, side)) return []
    const ts = outlinePoints(segs).map(p => alongOf(f, p))
    const { topZ, thick } = info(bt)
    const yTop = roomH - topZ
    return [{ t0: Math.min(...ts), t1: Math.max(...ts), yTop, yBot: yTop + thick.total }]
  })
}

export default function BenchtopElevation({
  benchtops, walls, wall, side, roomCx, roomH, zoom, layers, selectedId, info, profiles, onSelect, interactive, print,
}: {
  /** Shop drawings (z_shop_drawings): black ink, white fill, pen-table widths at 1:P; no labels / picking. */
  print?: { P: number }
  benchtops: BenchtopInstance[]
  walls: Wall[]
  wall: Wall
  side: WallSide
  roomCx: Pt
  roomH: number
  zoom: number
  layers: LayerView
  selectedId: string | null
  info: (bt: BenchtopInstance) => BtElevInfo
  profiles: Record<string, BenchtopEdgeProfile>
  onSelect: (id: string) => void
  /** F4 Benchtop mode: tops pick. Otherwise click-through so cabinets own clicks. */
  interactive: boolean
}) {
  const lineScale = useLineScale()
  if (!layers.show('benchtops')) return null
  // The back side is viewed from outside the room, so the wall runs right-to-left:
  // measure along from the wall's far end (matches ElevationSVG's mirrored x).
  const f0 = wallFrame(wall, side, roomCx)
  const f = side === 'back'
    ? { ...f0, o: { x: f0.o.x + f0.d.x * f0.len, y: f0.o.y + f0.d.y * f0.len }, d: { x: -f0.d.x, y: -f0.d.y } }
    : f0
  const z = zoom
  const lz = z / lineScale   // strokes only — finer on phones
  const lp = layers.props('benchtops', z)
  const stroke = print ? PRINT_INK : layers.color('benchtops', '#14b8a6')
  // Stroke widths: screen px on the canvas, pen-table paper mm in print.
  const bandW = (sel: boolean) => print ? Math.max(layers.w('benchtops', pen('front', print.P)), MIN_PEN * print.P) : layers.w('benchtops', sel ? 2 : 1.25) / lz
  const thinW = (px: number) => print ? pen('thin', print.P) : px / lz
  const showEdges = layers.show('benchtop_edges')
  const showJoins = layers.show('benchtop_joins')

  const shown = benchtops.filter(bt => {
    const segs = btSegments(bt)
    return segs.length >= 3 && btShowsOn(bt, wallContacts(segs, walls, roomCx), wall, side)
  })

  return (
    <g style={{ pointerEvents: interactive ? undefined : 'none' }}>
      {shown.map((bt, k) => {
        const segs = btSegments(bt)
        const { topZ, thick, defaultProfileId } = info(bt)
        const ts = outlinePoints(segs).map(p => alongOf(f, p))
        const t0 = Math.min(...ts), t1 = Math.max(...ts)
        const yTop = roomH - topZ, yBot = yTop + thick.total
        const isSel = bt.id === selectedId
        const fill = print ? 'white' : layers.lineDrawing ? 'none' : layers.color('benchtops', '#134e4a')
        const fillOp = print ? 1 : layers.lineDrawing ? 0 : lp.fillOpacity

        // Front faces = exposed or not, edges whose outward normal faces the viewer.
        const fronts = segs.map((s, i) => ({ s, i, n: outwardNormal(segs, i) }))
          .filter(e => dot(e.n, f.n) > 0.5)
        const steps = new Set<number>()
        for (const e of fronts) {
          for (const p of [e.s.p0, e.s.p1]) {
            const t = Math.round(alongOf(f, p))
            if (t > t0 + 1 && t < t1 - 1) steps.add(t)
          }
        }

        const profileOf = (i: number) => {
          const s = segs[i]
          if (s.edge?.wall) return undefined
          const pid = effectiveProfileId(s, defaultProfileId)
          return pid ? profiles[pid] : undefined
        }

        // Waterfall legs: the edge's strip, a top-thickness deep, under that edge.
        // join: mitre = leg to the top surface, 45° at the corner; butt = the top
        // sits on the leg (leg stops at the underside).
        const legs = segs.map((s, i) => ({ s, i })).filter(({ i }) => profileOf(i)?.generates === 'waterfall')
          .map(({ s, i }) => {
            const n = outwardNormal(segs, i)
            const inset = (p: Pt) => ({ x: p.x - n.x * thick.total, y: p.y - n.y * thick.total })
            const lts = [s.p0, s.p1, inset(s.p1), inset(s.p0)].map(p => alongOf(f, p))
            const m = segMid(s)
            const outer = alongOf(f, m), inner = alongOf(f, inset(m))
            const endOn = Math.abs(dot(n, f.d)) > 0.7
            // Built-up end facing the viewer (waterfallBuildUp): the face piece reads
            // the apron's drop wide, 45° up into the apron.
            const bu = waterfallBuildUp(segs, i, profiles, defaultProfileId, thick.total)
            const faces = (j: number) => dot(outwardNormal(segs, (j + segs.length) % segs.length), f.n) > 0.5
            const D = !endOn ? 0 : bu.start && faces(i - 1) ? bu.start : bu.end && faces(i + 1) ? bu.end : 0
            return {
              i, a: Math.min(...lts), b: Math.max(...lts), endOn, outer, inner, D,
              innerD: outer + Math.sign(inner - outer) * D,
              join: waterfallJoin(s),
              // An end-on leg at the band's end shares the band's end line.
              atEnd: endOn && (Math.abs(outer - t0) < 1 ? 'left' as const : Math.abs(outer - t1) < 1 ? 'right' as const : null),
            }
          })
        const mitreAt = (side: 'left' | 'right') => legs.find(l => l.atEnd === side && l.join === 'mitre')
        const mL = mitreAt('left'), mR = mitreAt('right')

        // Mitred aprons: the edge reads as one face from the top surface down to
        // apron_drop_mm (the mitre is the top arris, so no line at the slab's
        // underside). Edges facing away are hidden behind the top. When the aprons
        // cover the whole span the band itself is drawn that deep.
        const aprons = segs.map((s, i) => ({ s, i, prof: profileOf(i) }))
          .filter(({ prof }) => prof?.generates === 'apron' && Number(prof.apron_drop_mm) > thick.total)
          .filter(({ i }) => dot(outwardNormal(segs, i), f.n) > -0.3)
          .map(({ s, i, prof }) => {
            const n = outwardNormal(segs, i)
            const pts = segSamples(s, 16).concat([s.p1])
            const ats = pts.flatMap(p => [p, { x: p.x - n.x * thick.total, y: p.y - n.y * thick.total }]).map(p => alongOf(f, p))
            return { i, a: Math.min(...ats), b: Math.max(...ats), yLow: yTop + Number(prof!.apron_drop_mm) }
          })
        // An apron end over a built-up face piece starts on the 45° (outer + T at the
        // underside, outer + D at the apron's bottom).
        const apronPts = (ap: typeof aprons[number]) => {
          const end = (t: number) => legs.find(l => l.D && Math.abs(l.outer - t) < 1)
          const L = end(ap.a), R = end(ap.b)
          const tip = (l: typeof legs[number], k: number) => l.outer + Math.sign(l.inner - l.outer) * k
          return [
            [L ? tip(L, thick.total) : ap.a, yBot], [R ? tip(R, thick.total) : ap.b, yBot],
            [R ? tip(R, R.D) : ap.b, ap.yLow], [L ? tip(L, L.D) : ap.a, ap.yLow],
          ]
        }
        const apronCovers = (() => {
          if (!aprons.length || mL || mR || legs.some(l => l.D)) return false
          let reach = t0
          for (const a of [...aprons].sort((p, q) => p.a - q.a)) { if (a.a > reach + 1) return false; reach = Math.max(reach, a.b) }
          return reach >= t1 - 1
        })()
        const yBand = apronCovers ? Math.min(...aprons.map(a => a.yLow)) : yBot
        const yEdge = Math.max(yBot, ...aprons.map(a => a.yLow))   // lowest drawn edge (profile codes go under it)

        // Band outline: a mitred end-on leg takes the triangle under the 45° joint.
        const bandPts = [
          [t0, yTop], [t1, yTop],
          ...(mR ? [[mR.inner, yBot]] : [[t1, yBand]]),
          ...(mL ? [[mL.inner, yBot]] : [[t0, yBand]]),
        ].map(q => q.join(',')).join(' ')
        const legPts = (l: typeof legs[number]) => {
          if (l.D) return [[l.outer, yTop], [l.outer, roomH], [l.innerD, roomH], [l.innerD, yTop + l.D]]
          if (l.endOn && l.join === 'mitre') {
            // outer face to the top surface, 45° back to the underside
            return [[l.outer, yTop], [l.outer, roomH], [l.inner, roomH], [l.inner, yBot]]
          }
          const top = l.join === 'mitre' ? yTop : yBot   // face-on mitre runs to the top edge
          return [[l.a, top], [l.b, top], [l.b, roomH], [l.a, roomH]]
        }
        const legEl = (l: typeof legs[number]) => (
          <polygon key={`wf${l.i}`} points={legPts(l).map(q => q.join(',')).join(' ')}
            fill={fill} fillOpacity={print ? 1 : 0.85 * fillOp}
            stroke={isSel ? '#f59e0b' : stroke} strokeWidth={print ? bandW(false) : 1 / lz} opacity={lp.opacity}
            strokeDasharray={lp.strokeDasharray}
            style={{ cursor: 'pointer' }}
            onClick={e => { e.stopPropagation(); onSelect(bt.id) }}>
            <title>{`Waterfall — ${l.join === 'mitre' ? 'mitred' : 'butt (top sits on the leg)'}${l.D ? ` · built up ${l.D}` : ''}`}</title>
          </polygon>
        )
        // Face-on mitred legs cover the band (the joint is the top edge itself).
        const faceMitre = (l: typeof legs[number]) => !l.endOn && l.join === 'mitre'

        return (
          <Fragment key={bt.id}>
            {/* Waterfall legs under / beside the band (face-on mitres go over it) */}
            {legs.filter(l => !faceMitre(l)).map(legEl)}

            {/* Top band — its ends follow any mitred end-on legs */}
            <polygon points={bandPts}
              fill={fill} fillOpacity={fillOp}
              stroke={isSel ? '#f59e0b' : stroke}
              strokeWidth={bandW(isSel)}
              strokeDasharray={lp.strokeDasharray} opacity={lp.opacity}
              style={{ cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); onSelect(bt.id) }}>
              <title>{`${bt.label ?? 'Benchtop'} · top ${roundMm(topZ)} · ${thick.total} thick`}</title>
            </polygon>
            {legs.filter(faceMitre).map(legEl)}

            {/* Apron strips under the band (when they don't cover the whole span) */}
            {!apronCovers && aprons.map(a => (
              <polygon key={`ap${a.i}`} points={apronPts(a).map(q => q.join(',')).join(' ')}
                fill={fill} fillOpacity={fillOp}
                stroke={isSel ? '#f59e0b' : stroke} strokeWidth={bandW(false)}
                strokeDasharray={lp.strokeDasharray} opacity={lp.opacity}
                style={{ cursor: 'pointer' }}
                onClick={e => { e.stopPropagation(); onSelect(bt.id) }}>
                <title>Mitred apron</title>
              </polygon>
            ))}

            {/* Hit area: a top is only 20–40 mm tall (a few px zoomed out), so pick
                over at least 16 screen px centred on the band. */}
            {!print && (() => {
              const h = Math.max(thick.total, 16 / z)
              return (
                <rect x={t0} y={yTop + thick.total / 2 - h / 2} width={t1 - t0} height={h}
                  fill="transparent" style={{ cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); onSelect(bt.id) }}>
                  <title>{`${bt.label ?? 'Benchtop'} · top ${roundMm(topZ)} · ${thick.total} thick`}</title>
                </rect>
              )
            })()}

            <g style={{ pointerEvents: 'none' }} opacity={lp.opacity}>
              {/* Front-face steps (return legs end-on read as their own band) */}
              {[...steps].map(t => (
                <line key={`st${t}`} x1={t} y1={yTop} x2={t} y2={yBot} stroke={stroke} strokeWidth={thinW(0.75)} />
              ))}

              {/* Build-up: worktop over strips / rails */}
              {thick.buildUp && thick.total > thick.top && (
                <line x1={t0} y1={yTop + thick.top} x2={t1} y2={yTop + thick.top}
                  stroke={stroke} strokeWidth={thinW(0.5)} strokeDasharray={`${4 / z} ${2 / z}`} />
              )}


              {/* Join seams where they meet the front face */}
              {showJoins && (bt.joins ?? []).map((j, k) => {
                const p = offOf(f, j.p0) >= offOf(f, j.p1) ? j.p0 : j.p1
                const t = alongOf(f, p)
                const col = print ? PRINT_INK : layers.color('benchtop_joins', '#ef4444')
                return (
                  <g key={`j${k}`} opacity={layers.op('benchtop_joins')}>
                    <line x1={t} y1={yTop} x2={t} y2={yBot} stroke={col}
                      strokeWidth={print ? pen('thin', print.P) : layers.w('benchtop_joins', 1.25) / lz} strokeDasharray={`${3 / z} ${2 / z}`} />
                    {!print && <text x={t} y={yTop - 4 / z} textAnchor="middle" fontSize={8 / z} fill={col}>
                      {j.type === 'mitre' ? 'M' : 'B'}
                    </text>}
                  </g>
                )
              })}

              {/* Profile codes under the front edges */}
              {showEdges && !print && fronts.map(({ s, i }) => {
                const prof = profileOf(i)
                if (!prof) return null
                const ets = segSamples(s, 8).concat([s.p1]).map(p => alongOf(f, p))
                const mid = (Math.min(...ets) + Math.max(...ets)) / 2
                return (
                  <text key={`pc${i}`} x={mid} y={yEdge + 10 / z} textAnchor="middle"
                    fontSize={layers.w('benchtop_edges', 8) / z} fontWeight={600}
                    fill={layers.color('benchtop_edges', '#5eead4')} opacity={layers.op('benchtop_edges')}>
                    {prof.code ?? prof.name}{prof.generates === 'waterfall' ? (waterfallJoin(s) === 'mitre' ? ' ▼M' : ' ▼B') : ''}
                  </text>
                )
              })}

              {/* Label above the band — stacked when tops share a span (not in print) */}
              {!print && <text x={(t0 + t1) / 2} y={yTop - (14 + 11 * k) / z} textAnchor="middle"
                fontSize={9 / z} fill={isSel ? '#fcd34d' : '#5eead4'} style={{ userSelect: 'none' }}>
                {bt.label ?? 'Benchtop'} · {roundMm(topZ)}
              </text>}
            </g>
          </Fragment>
        )
      })}
    </g>
  )
}
