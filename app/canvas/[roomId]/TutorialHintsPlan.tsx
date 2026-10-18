'use client'

// ── Tutorial hints on the plan (z_tutorial) ───────────────────────────────────
// The current step's hints (src/lib/tutorial/lessons.ts) in room mm: a pulsing
// wall outline or a dashed target zone, each with a label. Rendered inside
// CanvasSVG's world transform, click-through, gated by the tutorial_hints layer.

import type { LayerView } from '@/src/lib/displayLayers/resolve'
import { useTutorial } from '@/src/lib/tutorial/store'
import { LESSONS, type TutorialHint } from '@/src/lib/tutorial/lessons'

const AMBER = '#f59e0b'

export default function TutorialHintsPlan({ zoom, layers }: { zoom: number; layers: LayerView }) {
  const step = useTutorial(s => s.picking ? undefined : LESSONS[s.lesson]?.steps[s.step])
  const ctx  = useTutorial(s => s.ctx)
  if (!step?.hints || !layers.show('tutorial_hints')) return null
  const hints = step.hints(ctx)
  if (!hints.length) return null

  const color = layers.color('tutorial_hints', AMBER)
  const w = layers.w('tutorial_hints', 1)
  const fs = 13 / zoom
  return (
    <g style={{ pointerEvents: 'none' }} opacity={layers.op('tutorial_hints')}>
      <style>{`@keyframes rhk-tut-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }`}</style>
      {hints.map((h, i) => <Hint key={i} h={h} zoom={zoom} color={color} w={w} fs={fs} />)}
    </g>
  )
}

function Hint({ h, zoom, color, w, fs }: { h: TutorialHint; zoom: number; color: string; w: number; fs: number }) {
  const pulse = { animation: 'rhk-tut-pulse 1.4s ease-in-out infinite' }
  if (h.kind === 'wall') {
    const mid = { x: (h.a.x + h.b.x) / 2, y: (h.a.y + h.b.y) / 2 }
    return (
      <g>
        <line x1={h.a.x} y1={h.a.y} x2={h.b.x} y2={h.b.y} stroke={color} strokeOpacity={0.35}
          strokeWidth={14 * w / zoom} strokeLinecap="round" style={pulse} />
        <line x1={h.a.x} y1={h.a.y} x2={h.b.x} y2={h.b.y} stroke={color} strokeWidth={2.5 * w / zoom} />
        <Label at={mid} text={h.label} color={color} fs={fs} zoom={zoom} />
      </g>
    )
  }
  const mid = {
    x: h.pts.reduce((s, p) => s + p.x, 0) / h.pts.length,
    y: h.pts.reduce((s, p) => s + p.y, 0) / h.pts.length,
  }
  return (
    <g>
      <polygon points={h.pts.map(p => `${p.x},${p.y}`).join(' ')} fill={color} fillOpacity={0.12}
        stroke={color} strokeWidth={2 * w / zoom} strokeDasharray={`${8 / zoom} ${5 / zoom}`} style={pulse} />
      <Label at={mid} text={h.label} color={color} fs={fs} zoom={zoom} />
    </g>
  )
}

function Label({ at, text, color, fs, zoom }: { at: { x: number; y: number }; text: string; color: string; fs: number; zoom: number }) {
  const padX = 6 / zoom, h = fs * 1.6
  const wTxt = text.length * fs * 0.56
  return (
    <g>
      <rect x={at.x - wTxt / 2 - padX} y={at.y - h / 2} width={wTxt + padX * 2} height={h}
        rx={4 / zoom} fill="#111827" fillOpacity={0.9} stroke={color} strokeWidth={1 / zoom} />
      <text x={at.x} y={at.y} fontSize={fs} fill={color} textAnchor="middle" dominantBaseline="central"
        style={{ userSelect: 'none', fontWeight: 600 }}>{text}</text>
    </g>
  )
}
