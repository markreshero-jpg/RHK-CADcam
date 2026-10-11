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
// edges. Gated by layer items benchtops / benchtop_edges /
// benchtop_joins.
// ============================================================

import { Fragment } from 'react'
import type { BenchtopInstance, BenchtopEdgeProfile, Wall } from '@/src/lib/types'
import type { LayerView } from '@/src/lib/displayLayers/resolve'
import type { Pt } from '@/src/lib/geometry'
import {
  btSegments, outlinePoints, outwardNormal, segSamples, segMid, effectiveProfileId, waterfallJoin,
} from '@/src/lib/benchtopGeometry'
import { wallFrame, alongOf, offOf, wallContacts, btShowsOn, type WallSide } from '@/src/lib/benchtopAnchor'
import type { BtThickness } from './useBenchtopCatalog'

export interface BtElevInfo {
  /** Top-surface height above the floor = underside (base height) + thickness (P-g). */
  topZ: number
  thick: BtThickness
  defaultProfileId: string | null
}

const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y

export default function BenchtopElevation({
  benchtops, walls, wall, side, roomCx, roomH, zoom, layers, selectedId, info, profiles, onSelect, interactive,
}: {
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
  if (!layers.show('benchtops')) return null
  const f = wallFrame(wall, side, roomCx)
  const z = zoom
  const lp = layers.props('benchtops', z)
  const stroke = layers.color('benchtops', '#14b8a6')
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
        const fill = layers.lineDrawing ? 'none' : layers.color('benchtops', '#134e4a')

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
            return {
              i, a: Math.min(...lts), b: Math.max(...lts), endOn, outer, inner,
              join: waterfallJoin(s),
              // An end-on leg at the band's end shares the band's end line.
              atEnd: endOn && (Math.abs(outer - t0) < 1 ? 'left' as const : Math.abs(outer - t1) < 1 ? 'right' as const : null),
            }
          })
        const mitreAt = (side: 'left' | 'right') => legs.find(l => l.atEnd === side && l.join === 'mitre')
        const mL = mitreAt('left'), mR = mitreAt('right')
        // Band outline: a mitred end-on leg takes the triangle under the 45° joint.
        const bandPts = [
          [t0, yTop], [t1, yTop],
          ...(mR ? [[mR.inner, yBot]] : [[t1, yBot]]),
          ...(mL ? [[mL.inner, yBot]] : [[t0, yBot]]),
        ].map(q => q.join(',')).join(' ')
        const legPts = (l: typeof legs[number]) => {
          if (l.endOn && l.join === 'mitre') {
            // outer face to the top surface, 45° back to the underside
            return [[l.outer, yTop], [l.outer, roomH], [l.inner, roomH], [l.inner, yBot]]
          }
          const top = l.join === 'mitre' ? yTop : yBot   // face-on mitre runs to the top edge
          return [[l.a, top], [l.b, top], [l.b, roomH], [l.a, roomH]]
        }
        const legEl = (l: typeof legs[number]) => (
          <polygon key={`wf${l.i}`} points={legPts(l).map(q => q.join(',')).join(' ')}
            fill={fill} fillOpacity={layers.lineDrawing ? 0 : 0.85 * lp.fillOpacity}
            stroke={isSel ? '#f59e0b' : stroke} strokeWidth={1 / z} opacity={lp.opacity}
            strokeDasharray={lp.strokeDasharray}
            style={{ cursor: 'pointer' }}
            onClick={e => { e.stopPropagation(); onSelect(bt.id) }}>
            <title>{`Waterfall — ${l.join === 'mitre' ? 'mitred' : 'butt (top sits on the leg)'}`}</title>
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
              fill={fill} fillOpacity={layers.lineDrawing ? 0 : lp.fillOpacity}
              stroke={isSel ? '#f59e0b' : stroke}
              strokeWidth={layers.w('benchtops', isSel ? 2 : 1.25) / z}
              strokeDasharray={lp.strokeDasharray} opacity={lp.opacity}
              style={{ cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); onSelect(bt.id) }}>
              <title>{`${bt.label ?? 'Benchtop'} · top ${Math.round(topZ)} · ${thick.total} thick`}</title>
            </polygon>
            {legs.filter(faceMitre).map(legEl)}

            {/* Hit area: a top is only 20–40 mm tall (a few px zoomed out), so pick
                over at least 16 screen px centred on the band. */}
            {(() => {
              const h = Math.max(thick.total, 16 / z)
              return (
                <rect x={t0} y={yTop + thick.total / 2 - h / 2} width={t1 - t0} height={h}
                  fill="transparent" style={{ cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); onSelect(bt.id) }}>
                  <title>{`${bt.label ?? 'Benchtop'} · top ${Math.round(topZ)} · ${thick.total} thick`}</title>
                </rect>
              )
            })()}

            <g style={{ pointerEvents: 'none' }} opacity={lp.opacity}>
              {/* Front-face steps (return legs end-on read as their own band) */}
              {[...steps].map(t => (
                <line key={`st${t}`} x1={t} y1={yTop} x2={t} y2={yBot} stroke={stroke} strokeWidth={0.75 / z} />
              ))}

              {/* Build-up: worktop over strips / rails */}
              {thick.buildUp && thick.total > thick.top && (
                <line x1={t0} y1={yTop + thick.top} x2={t1} y2={yTop + thick.top}
                  stroke={stroke} strokeWidth={0.5 / z} strokeDasharray={`${4 / z} ${2 / z}`} />
              )}


              {/* Join seams where they meet the front face */}
              {showJoins && (bt.joins ?? []).map((j, k) => {
                const p = offOf(f, j.p0) >= offOf(f, j.p1) ? j.p0 : j.p1
                const t = alongOf(f, p)
                const col = layers.color('benchtop_joins', '#ef4444')
                return (
                  <g key={`j${k}`} opacity={layers.op('benchtop_joins')}>
                    <line x1={t} y1={yTop} x2={t} y2={yBot} stroke={col}
                      strokeWidth={layers.w('benchtop_joins', 1.25) / z} strokeDasharray={`${3 / z} ${2 / z}`} />
                    <text x={t} y={yTop - 4 / z} textAnchor="middle" fontSize={8 / z} fill={col}>
                      {j.type === 'mitre' ? 'M' : 'B'}
                    </text>
                  </g>
                )
              })}

              {/* Profile codes under the front edges */}
              {showEdges && fronts.map(({ s, i }) => {
                const prof = profileOf(i)
                if (!prof) return null
                const ets = segSamples(s, 8).concat([s.p1]).map(p => alongOf(f, p))
                const mid = (Math.min(...ets) + Math.max(...ets)) / 2
                return (
                  <text key={`pc${i}`} x={mid} y={yBot + 10 / z} textAnchor="middle"
                    fontSize={layers.w('benchtop_edges', 8) / z} fontWeight={600}
                    fill={layers.color('benchtop_edges', '#5eead4')} opacity={layers.op('benchtop_edges')}>
                    {prof.code ?? prof.name}{prof.generates === 'waterfall' ? (waterfallJoin(s) === 'mitre' ? ' ▼M' : ' ▼B') : ''}
                  </text>
                )
              })}

              {/* Label above the band — stacked when tops share a span */}
              <text x={(t0 + t1) / 2} y={yTop - (14 + 11 * k) / z} textAnchor="middle"
                fontSize={9 / z} fill={isSel ? '#fcd34d' : '#5eead4'} style={{ userSelect: 'none' }}>
                {bt.label ?? 'Benchtop'} · {Math.round(topZ)}
              </text>
            </g>
          </Fragment>
        )
      })}
    </g>
  )
}
