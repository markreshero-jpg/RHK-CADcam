'use client'

// ============================================================
// Phase 2 — Toolpath Simulator (spec §7).
// Full-screen overlay that REPLAYS a stored/posted G-code program
// per sheet: rapid trail, cut paths (material rendered removed
// behind the tool), drill hits, and an animated tool head whose
// cross-section comes from the tool library (toolProfile.ts).
//
// Pure replay — no re-calculation (spec §7.3). Raw SVG, no
// react-konva (spec §8.2). Geometry mirrors SheetSVG's BL-origin
// flip so toolpath XY lines up with the nested panels.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { NestedSheet } from '@/src/lib/optimiser/nest'
import type { DrillBlockConfig } from '@/src/lib/optimiser/gangDrill'
import { parseGcode, frameAtTime, fmtClock, holesOf, type ParsedProgram, type SimMove } from '@/src/lib/optimiser/gcodeParser'
import { shapeTypeFor, type ToolShape } from '@/src/lib/cnc/toolProfile'
import ToolProfilePreview from '@/src/components/ToolProfilePreview'
import SimCanvas3D from './SimCanvas3D'

export interface SimFile { sheetIndex: number; fileName: string; gcode: string }
// The output datum the G-code was posted with, so the simulator can map the
// machine coordinates BACK to the canonical internal frame it renders in
// (bottom-left origin, Y up, top-of-material Z = 0 with cuts negative).
export interface SimCoord { originCorner: string; xDir: string; yDir: string; surfaceZ: string; zUp: boolean }
interface ToolRow { tool_number: number | null; name: string | null; diameter: number | null; tool_type: string | null; cutting_length: number | null; shape_profile: { type: string; params: Record<string, number> } | null }

const SPEEDS = [1, 5, 20, 100] as const

// Invert the post-processor datum transform so the toolpath lines up with the
// nested panels again (machine X/Y/Z → internal sheet X/Y/Z).
function toInternal(prog: ParsedProgram, sheet: NestedSheet, c: SimCoord): ParsedProgram {
  const W = sheet.stock.w, H = sheet.stock.h, th = sheet.thickness
  const oX = (c.originCorner === 'top_right' || c.originCorner === 'bottom_right') ? W : 0
  const oY = (c.originCorner === 'top_left' || c.originCorner === 'top_right') ? H : 0
  const sX = c.xDir === 'positive_left' ? -1 : 1
  const sY = c.yDir === 'positive_down' ? -1 : 1
  const zOff = c.surfaceZ === 'spoilboard' ? th : 0
  const zSign = c.zUp === false ? -1 : 1
  const ix = (x: number) => sX * x + oX
  const iy = (y: number) => sY * y + oY
  const iz = (z: number) => z * zSign - zOff
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const moves = prog.moves.map(m => {
    const x0 = ix(m.x0), y0 = iy(m.y0), x1 = ix(m.x1), y1 = iy(m.y1)
    minX = Math.min(minX, x0, x1); maxX = Math.max(maxX, x0, x1)
    minY = Math.min(minY, y0, y1); maxY = Math.max(maxY, y0, y1)
    return { ...m, x0, y0, z0: iz(m.z0), x1, y1, z1: iz(m.z1) }
  })
  if (!Number.isFinite(minX)) { minX = 0; maxX = 0; minY = 0; maxY = 0 }
  return { ...prog, moves, bounds: { minX, minY, maxX, maxY } }
}

export default function Simulator({
  files, sheets, onClose, coord, drillBlock,
}: {
  files: SimFile[]
  sheets: NestedSheet[]
  onClose: () => void
  coord?: SimCoord
  drillBlock?: DrillBlockConfig
}) {
  const [tools, setTools] = useState<Map<number, ToolRow>>(new Map())
  const [sel, setSel] = useState(0)                 // index into files
  const [view, setView] = useState<'2d' | '3d'>('2d')
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<number>(20)
  const [elapsed, setElapsed] = useState(0)         // program time (ms)

  // Pull the tool library once so the head circle / kerf width / cross-section
  // reflect the real bits this program references.
  useEffect(() => {
    let live = true
    supabase.from('cnc_tools').select('tool_number,name,diameter,tool_type,cutting_length,shape_profile').then(({ data }) => {
      if (!live || !data) return
      const m = new Map<number, ToolRow>()
      for (const r of data as ToolRow[]) if (r.tool_number != null) m.set(r.tool_number, r)
      setTools(m)
    })
    return () => { live = false }
  }, [])

  const file = files[sel]
  const sheet = useMemo(() => sheets.find(s => s.index === file?.sheetIndex), [sheets, file])
  const prog = useMemo<ParsedProgram>(() => {
    const raw = parseGcode(file?.gcode ?? '', drillBlock
      ? { drillBank: { xMcode: drillBlock.xBankMcode, yMcode: drillBlock.yBankMcode } } : undefined)
    return sheet && coord ? toInternal(raw, sheet, coord) : raw
  }, [file, sheet, coord, drillBlock])
  const total = prog.totalTime

  // Reset playback when switching sheets (render-time state adjustment — the
  // sanctioned alternative to a setState-in-effect; see React "you might not
  // need an effect").
  const [prevSel, setPrevSel] = useState(sel)
  if (prevSel !== sel) { setPrevSel(sel); setElapsed(0); setPlaying(false) }

  // rAF playback loop. performance.now() deltas, scaled by the speed multiplier.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last; last = now
      setElapsed(e => {
        const ne = e + dt * speed
        if (ne >= total) { setPlaying(false); return total }
        return ne
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, total])

  const frame = useMemo(() => frameAtTime(prog, elapsed), [prog, elapsed])

  // Step / jump helpers (all pause).
  const goto = (t: number) => { setPlaying(false); setElapsed(Math.min(total, Math.max(0, t))) }
  const stepFwd = () => { const m = prog.moves[frame.index]; goto(m ? m.t1 : total) }
  const stepBack = () => {
    // Jump to the start of the move just before the current one.
    const i = frame.current ? frame.index : prog.moves.length
    const prev = prog.moves[Math.max(0, i - 1)]
    goto(prev ? (Math.abs(prev.t0 - elapsed) < 1 ? (prog.moves[i - 2]?.t0 ?? 0) : prev.t0) : 0)
  }

  // Keyboard transport. Handlers are read through a ref so the listener is
  // subscribed once (stable deps) yet always calls the latest closures.
  const keyApi = useRef({ onClose, stepFwd, stepBack, goto, total })
  useEffect(() => { keyApi.current = { onClose, stepFwd, stepBack, goto, total } })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = keyApi.current
      if (e.key === 'Escape') a.onClose()
      else if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p) }
      else if (e.key === 'ArrowRight') a.stepFwd()
      else if (e.key === 'ArrowLeft') a.stepBack()
      else if (e.key === 'Home') a.goto(0)
      else if (e.key === 'End') a.goto(a.total)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const toolDia = (n: number | null, fallback = 8) => (n != null ? tools.get(n)?.diameter : null) ?? fallback
  const activeTool = frame.tool
  const activeRow = activeTool != null ? tools.get(activeTool) : undefined

  // Build a tool cross-section shape for the active bit (falls back to a plain
  // straight cutter when the row/profile is absent).
  const activeShape: ToolShape = useMemo(() => {
    if (activeRow?.shape_profile?.type) {
      return { type: activeRow.shape_profile.type as ToolShape['type'], params: { diameter: activeRow.diameter ?? 8, cutting_length: activeRow.cutting_length ?? 24, ...activeRow.shape_profile.params } }
    }
    return { type: shapeTypeFor(activeRow?.tool_type), params: { diameter: activeRow?.diameter ?? 8, cutting_length: activeRow?.cutting_length ?? 24 } }
  }, [activeRow])

  return (
    <div className="fixed inset-0 z-50 bg-canvas/98 backdrop-blur-sm flex flex-col text-ink">
      {/* Header */}
      <div className="flex-none border-b border-edge px-5 py-2.5 flex items-center gap-3">
        <span className="text-sm font-semibold">Toolpath Simulator</span>
        <span className="text-xs text-ink-subtle">Replaying posted G-code · {prog.moves.length} moves</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-edge-strong overflow-hidden">
            {(['2d', '3d'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-2.5 py-1 text-[11px] uppercase transition-colors ${view === v ? 'bg-accent text-white' : 'bg-surface-2 text-ink-muted hover:text-ink'}`}>{v}</button>
            ))}
          </div>
          <label className="text-[11px] text-ink-subtle">Sheet</label>
          <select value={sel} onChange={e => setSel(Number(e.target.value))}
            className="bg-surface-2 border border-edge-strong rounded px-2 py-1 text-xs text-ink focus:outline-none focus:border-accent">
            {files.map((f, i) => <option key={f.sheetIndex} value={i}>{i + 1}. {f.fileName}</option>)}
          </select>
          <button onClick={onClose} className="ml-2 px-3 py-1 text-xs rounded-lg border border-edge-strong text-ink-muted hover:bg-surface-2 transition-colors">Close ✕</button>
        </div>
      </div>

      {/* Body: canvas + info */}
      <div className="flex-1 flex overflow-hidden">
        <div className={`flex-1 overflow-hidden p-4 ${view === '3d' ? '' : 'grid place-items-center'}`}>
          {!sheet ? <p className="text-xs text-ink-subtle">No sheet geometry for this file.</p>
            : view === '3d'
              ? <SimCanvas3D sheet={sheet} prog={prog} elapsed={elapsed} toolDia={toolDia} headPos={frame.pos} cutting={frame.cutting} activeTool={activeTool} activeShape={activeShape} drillBlock={drillBlock} />
              : <Canvas sheet={sheet} prog={prog} elapsed={elapsed} toolDia={toolDia} headPos={frame.pos} cutting={frame.cutting} activeTool={activeTool} drillBlock={drillBlock} />}
        </div>

        {/* Right info column */}
        <div className="flex-none w-[320px] border-l border-edge flex flex-col overflow-hidden">
          <div className="flex-none px-4 py-3 border-b border-edge">
            <div className="flex items-center gap-3">
              <div className="flex-none">
                <ToolProfilePreview shape={activeShape} width={92} height={120} className="rounded-lg" />
              </div>
              <div className="text-[11px] space-y-1 min-w-0">
                <p className="text-ink font-medium truncate">{activeRow?.name ?? (activeTool != null ? `Tool ${activeTool}` : 'No tool')}</p>
                <p className="text-ink-subtle">T{activeTool ?? '—'} · ⌀{toolDia(activeTool)}mm</p>
                <p className="text-ink-subtle capitalize">Phase: <span className="text-ink-muted">{frame.phase}</span></p>
                <p className="text-ink-subtle truncate" title={frame.context}>{frame.context || '—'}</p>
              </div>
            </div>
            <Legend />
          </div>
          <CodeView prog={prog} line={frame.lineIndex} />
        </div>
      </div>

      {/* Transport */}
      <div className="flex-none border-t border-edge px-5 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <TBtn onClick={() => goto(0)} title="Jump to start (Home)">⏮</TBtn>
          <TBtn onClick={stepBack} title="Step back (←)">◀|</TBtn>
          <button onClick={() => setPlaying(p => !p)} title="Play/Pause (Space)"
            className="px-4 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover text-sm w-20 transition-colors">
            {playing ? '❚❚ Pause' : '▶ Play'}
          </button>
          <TBtn onClick={stepFwd} title="Step forward (→)">|▶</TBtn>
          <TBtn onClick={() => goto(total)} title="Jump to end (End)">⏭</TBtn>

          <div className="mx-3 inline-flex rounded-lg border border-edge-strong overflow-hidden">
            {SPEEDS.map(s => (
              <button key={s} onClick={() => setSpeed(s)}
                className={`px-2.5 py-1 text-[11px] transition-colors ${speed === s ? 'bg-accent text-white' : 'bg-surface-2 text-ink-muted hover:text-ink'}`}>{s}×</button>
            ))}
          </div>

          <span className="ml-auto text-[11px] font-mono text-ink-muted tabular-nums">
            {fmtClock(elapsed)} / {fmtClock(total)}
          </span>
        </div>
        <input type="range" min={0} max={Math.max(1, total)} step="any" value={elapsed}
          onChange={e => goto(parseFloat(e.target.value))}
          className="w-full accent-accent" />
      </div>
    </div>
  )
}

function TBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title}
      className="px-3 py-1.5 rounded-lg border border-edge-strong text-ink-muted hover:bg-surface-2 text-xs font-mono transition-colors">{children}</button>
  )
}

function Legend() {
  const item = (c: string, label: string, dash = false) => (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-4 h-0" style={{ borderTop: `2px ${dash ? 'dashed' : 'solid'} ${c}` }} />
      <span className="text-ink-subtle">{label}</span>
    </span>
  )
  return (
    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
      {item('#3b82f6', 'Rapid', true)}
      {item('#f59e0b', 'Cut')}
      <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-amber-500" /><span className="text-ink-subtle">Drill</span></span>
      <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm border border-dashed" style={{ borderColor: '#38bdf8' }} /><span className="text-ink-subtle">Drill block</span></span>
    </div>
  )
}

// ── Sheet canvas ──────────────────────────────────────────────────────────────
function Canvas({
  sheet, prog, elapsed, toolDia, headPos, cutting, activeTool, drillBlock,
}: {
  sheet: NestedSheet
  prog: ParsedProgram
  elapsed: number
  toolDia: (n: number | null, fallback?: number) => number
  headPos: { x: number; y: number; z: number }
  cutting: boolean
  activeTool: number | null
  drillBlock?: DrillBlockConfig
}) {
  const { w: W, h: H, trimTop, trimBottom, trimLeft, trimRight } = sheet.stock
  const scale = Math.min(940 / W, 560 / H)
  const pxW = W * scale, pxH = H * scale
  const X = (mm: number) => mm * scale
  const Y = (mm: number) => (H - mm) * scale          // BL origin → SVG top-down

  // Split completed work up to `elapsed`. Partial current move included.
  const { rapids, cuts, drills, partialCut, current } = useMemo(() => {
    const rapids: SimMove[] = [], cuts: SimMove[] = [], drills: SimMove[] = []
    let partialCut: { m: SimMove; px: number; py: number } | null = null
    let current: SimMove | null = null
    for (const m of prog.moves) {
      if (m.t1 <= elapsed) {
        if (m.kind === 'rapid') rapids.push(m)
        else if (m.kind === 'cut') cuts.push(m)
        else if (m.kind === 'drill') drills.push(m)
      } else if (m.t0 <= elapsed) {
        current = m
        const frac = (elapsed - m.t0) / Math.max(1e-6, m.t1 - m.t0)
        if (m.kind === 'cut') partialCut = { m, px: m.x0 + (m.x1 - m.x0) * frac, py: m.y0 + (m.y1 - m.y0) * frac }
        else if (m.kind === 'drill' && frac > 0.5) drills.push(m)   // pop the hole mid-plunge
        break
      } else break
    }
    return { rapids, cuts, drills, partialCut, current }
  }, [prog, elapsed])

  const kerf = toolDia(activeTool) * scale
  const newestDrill = drills[drills.length - 1]

  // Active drill-block firing: the in-progress move when it's a gang plunge.
  const firing = current && current.kind === 'drill' && current.bitmask && drillBlock
    ? blockView(current, drillBlock) : null
  // True hole radius (mm → px, drawn to actual size) and a clamped locator radius
  // so a sub-pixel ⌀5 hole on the full-sheet view is still findable. The true-size
  // ring sits inside the locator so each hole reads at its real diameter.
  const trueR = (m: SimMove) => Math.max(0.6, ((m.dia || toolDia(m.tool, 5)) / 2) * scale)
  const holeR = (m: SimMove) => Math.max(2.5, trueR(m))

  return (
    <svg width={pxW} height={pxH} viewBox={`0 0 ${pxW} ${pxH}`} className="block rounded-lg shadow-2xl">
      {/* Stock */}
      <rect x={0} y={0} width={pxW} height={pxH} fill="#0f172a" stroke="#475569" strokeWidth={1} />
      {(trimTop || trimBottom || trimLeft || trimRight) > 0 && (
        <rect x={trimLeft * scale} y={trimTop * scale}
          width={(W - trimLeft - trimRight) * scale} height={(H - trimTop - trimBottom) * scale}
          fill="none" stroke="#334155" strokeWidth={1} strokeDasharray="3 3" />
      )}

      {/* Panels (uncut material) */}
      {sheet.placements.map(p => (
        <g key={p.uid}>
          <rect x={X(p.x)} y={Y(p.y + p.h)} width={p.w * scale} height={p.h * scale}
            fill="#1e293b" stroke="#3b556e" strokeWidth={0.8} />
          {p.w * scale > 30 && p.h * scale > 14 && (
            <text x={X(p.x + p.w / 2)} y={Y(p.y + p.h / 2)} textAnchor="middle" dominantBaseline="middle"
              fill="#64748b" fontSize={Math.min(10, Math.max(6, p.h * scale / 5))} fontFamily="monospace">
              {p.label.length > 14 ? p.label.slice(0, 13) + '…' : p.label}
            </text>
          )}
        </g>
      ))}

      {/* Rapid trail (no material removed) */}
      {rapids.map((m, i) => (
        <line key={`r${i}`} x1={X(m.x0)} y1={Y(m.y0)} x2={X(m.x1)} y2={Y(m.y1)}
          stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 3" opacity={0.3} />
      ))}

      {/* Cut paths — material removed behind the tool (kerf-width amber) */}
      {cuts.map((m, i) => (
        <line key={`c${i}`} x1={X(m.x0)} y1={Y(m.y0)} x2={X(m.x1)} y2={Y(m.y1)}
          stroke="#f59e0b" strokeWidth={Math.max(1, kerf)} strokeOpacity={0.85} strokeLinecap="round" />
      ))}
      {partialCut && (
        <line x1={X(partialCut.m.x0)} y1={Y(partialCut.m.y0)} x2={X(partialCut.px)} y2={Y(partialCut.py)}
          stroke="#f59e0b" strokeWidth={Math.max(1, kerf)} strokeOpacity={0.85} strokeLinecap="round" />
      )}

      {/* All holes (the full plan) — ghost rings, always visible so you can see
          every hole on every piece even before/while the sim runs. Gang moves
          expand to every spindle hole they fire. A real ⌀5 hole is ~2px at sheet
          scale, so clamp to a visible marker. */}
      {prog.moves.flatMap((m, i) => m.kind === 'drill'
        ? holesOf(m, drillBlock).map((h, k) => {
            const tr = trueR(m), mr = holeR(m), cx = X(h.x), cy = Y(h.y)
            return (
              <g key={`gh${i}_${k}`}>
                <circle cx={cx} cy={cy} r={mr} fill="#f59e0b" fillOpacity={0.10} stroke="#f59e0b" strokeWidth={0.8} strokeOpacity={0.4} />
                {tr < mr - 0.4 && <circle cx={cx} cy={cy} r={tr} fill="none" stroke="#f59e0b" strokeWidth={0.8} strokeOpacity={0.75} />}
              </g>
            )
          })
        : [])}

      {/* Drill hits (already plunged) — true-size bore inside a locator halo */}
      {drills.flatMap((m, i) => holesOf(m, drillBlock).map((h, k) => {
        const tr = trueR(m), mr = holeR(m), cx = X(h.x), cy = Y(h.y), inner = tr < mr - 0.4
        return (
          <g key={`d${i}_${k}`}>
            <circle cx={cx} cy={cy} r={mr} fill="#f59e0b" fillOpacity={inner ? 0.25 : 0.9} stroke="#f59e0b" strokeWidth={0.6} strokeOpacity={0.7} />
            {inner && <circle cx={cx} cy={cy} r={tr} fill="#f59e0b" fillOpacity={0.95} stroke="#0f172a" strokeWidth={0.5} />}
          </g>
        )
      }))}
      {/* Plunge ping — only for plain single-spindle drilling; gang firing is shown
          by the block overlay's lit spindles instead. */}
      {newestDrill && !newestDrill.bitmask && (
        <circle cx={X(newestDrill.x1)} cy={Y(newestDrill.y1)} r={holeR(newestDrill)}
          fill="none" stroke="#fbbf24" strokeWidth={1.5}>
          <animate attributeName="r" from={holeR(newestDrill)} to={holeR(newestDrill) + 8} dur="0.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.9" to="0" dur="0.8s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Drill-block head overlay — the gang layout at 50% with firing spindles lit. */}
      {firing && <DrillBlock view={firing} X={X} Y={Y} scale={scale} />}

      {/* Tool head (the routing bit) — hidden while the drill block is firing. */}
      {!firing && (
        <g>
          <circle cx={X(headPos.x)} cy={Y(headPos.y)} r={Math.max(2, kerf / 2)}
            fill={cutting ? 'rgba(245,158,11,0.25)' : 'rgba(96,165,250,0.2)'}
            stroke={cutting ? '#f59e0b' : '#60a5fa'} strokeWidth={1.5} />
          <line x1={X(headPos.x) - kerf / 2 - 3} y1={Y(headPos.y)} x2={X(headPos.x) + kerf / 2 + 3} y2={Y(headPos.y)} stroke={cutting ? '#f59e0b' : '#60a5fa'} strokeWidth={0.6} opacity={0.7} />
          <line x1={X(headPos.x)} y1={Y(headPos.y) - kerf / 2 - 3} x2={X(headPos.x)} y2={Y(headPos.y) + kerf / 2 + 3} stroke={cutting ? '#f59e0b' : '#60a5fa'} strokeWidth={0.6} opacity={0.7} />
        </g>
      )}
    </svg>
  )
}

// ── Drill-block geometry + overlay ─────────────────────────────────────────────
// Lay the gang head out in sheet space so the firing master spindle sits on the
// move's master hole, with both banks meeting at the shared corner (spindle 1).
interface BlockView {
  mcode: string
  dia: number
  fired: number[]                              // firing spindle positions on the active bank
  xSpindles: { x: number; y: number; lit: boolean }[]
  ySpindles: { x: number; y: number; lit: boolean }[]
}
function blockView(m: SimMove, block: DrillBlockConfig): BlockView {
  const sp = block.spacingMm || 32
  const bank = m.bank!
  const count = bank === 'x' ? block.bankXCount : block.bankYCount
  const bits = m.bitmask ?? 0
  const fired: number[] = []
  for (let p = 1; p <= count; p++) if (bits & (1 << (p - 1))) fired.push(p)
  const master = fired[0] ?? 1
  // Corner = spindle-1 centre; placed so the master spindle lands on the master hole.
  const cornerX = bank === 'x' ? m.x1 - (master - 1) * sp : m.x1
  const cornerY = bank === 'y' ? m.y1 - (master - 1) * sp : m.y1
  const xSpindles = Array.from({ length: block.bankXCount }, (_, k) => ({
    x: cornerX + k * sp, y: cornerY, lit: bank === 'x' && fired.includes(k + 1),
  }))
  const ySpindles = Array.from({ length: block.bankYCount }, (_, k) => ({
    x: cornerX, y: cornerY + k * sp, lit: bank === 'y' && fired.includes(k + 1),
  }))
  return { mcode: bank === 'x' ? block.xBankMcode : block.yBankMcode, dia: m.dia || 5, fired, xSpindles, ySpindles }
}

function DrillBlock({ view, X, Y, scale }: {
  view: BlockView
  X: (mm: number) => number
  Y: (mm: number) => number
  scale: number
}) {
  const r = Math.max(3, (view.dia / 2) * scale)
  const all = [...view.xSpindles, ...view.ySpindles]
  const xs = all.map(s => X(s.x)), ys = all.map(s => Y(s.y))
  const pad = r + 6
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad
  const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad
  const lit = all.filter(s => s.lit)
  return (
    <g>
      {/* The block layout at 50% — head plate + every spindle bore. */}
      <g opacity={0.5}>
        <rect x={minX} y={minY} width={maxX - minX} height={maxY - minY} rx={8}
          fill="#0ea5e9" fillOpacity={0.08} stroke="#38bdf8" strokeWidth={1.2} strokeDasharray="5 3" />
        {all.map((s, i) => (
          <circle key={`s${i}`} cx={X(s.x)} cy={Y(s.y)} r={r} fill="none" stroke="#38bdf8" strokeWidth={0.9} strokeOpacity={0.6} />
        ))}
        <text x={minX} y={minY - 5} fill="#7dd3fc" fontSize={11} fontFamily="monospace">
          {view.mcode} · ⌀{view.dia} · spindle {view.fired.join(',')}
        </text>
      </g>
      {/* Firing spindles — bright over the dim layout so "which drills" is obvious. */}
      {lit.map((s, i) => (
        <g key={`lit${i}`}>
          <circle cx={X(s.x)} cy={Y(s.y)} r={r} fill="#f59e0b" fillOpacity={0.85} stroke="#fbbf24" strokeWidth={1.6} />
          <circle cx={X(s.x)} cy={Y(s.y)} r={r} fill="none" stroke="#fde68a" strokeWidth={1.5}>
            <animate attributeName="r" from={r} to={r + 7} dur="0.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.9" to="0" dur="0.6s" repeatCount="indefinite" />
          </circle>
        </g>
      ))}
    </g>
  )
}

// ── Windowed G-code listing (current line highlighted, auto-follows) ───────────
function CodeView({ prog, line }: { prog: ParsedProgram; line: number }) {
  const WINDOW = 80
  const start = Math.max(0, line - 14)
  const slice = prog.lines.slice(start, start + WINDOW)
  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="flex-none px-4 py-1.5 border-b border-edge text-[10px] uppercase tracking-wider text-ink-subtle">G-code · line {line + 1} / {prog.lines.length}</div>
      <div className="flex-1 overflow-auto px-2 py-1.5 font-mono text-[10.5px] leading-snug">
        {slice.map((ln, i) => {
          const n = start + i
          const active = n === line
          const comment = ln.trim().startsWith('(')
          return (
            <div key={n} className={`flex gap-2 px-2 rounded ${active ? 'bg-accent/20 text-ink' : comment ? 'text-ink-subtle' : 'text-ink-muted'}`}>
              <span className="text-ink-subtle/60 select-none w-9 text-right tabular-nums">{n + 1}</span>
              <span className="whitespace-pre">{ln || ' '}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
