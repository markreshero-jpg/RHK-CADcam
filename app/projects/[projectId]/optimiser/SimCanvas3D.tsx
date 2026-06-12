'use client'

// ============================================================
// Phase 2 — Toolpath Simulator, 3-D view (companion to Simulator.tsx).
// Same PURE REPLAY data (ParsedProgram + elapsed) as the 2-D canvas,
// rendered with react-three-fiber so you can orbit the sheet and
// watch the bit actually remove material.
//
// The board top is a height-field (a "Z-map"): a fine grid whose
// vertices start flush at the stock face (y = 0). As the program
// plays we read the interpolated machine Z of each cutting move and
// lower every grid vertex under the tool footprint to that depth —
// so routed paths become trenches cut to the real depth and drills
// become pits to their drill depth. flatShading lets the GPU shade
// the freshly-cut walls from screen-space derivatives, so we never
// recompute normals and the carve stays cheap (just Y writes).
//
// Coordinate map (machine/sheet space → three.js world):
//   worldX = sheetX − W/2      (centre the sheet on the origin)
//   worldZ = H/2 − sheetY      (sheet lies flat in the XZ plane)
//   worldY = machine Z         (0 = top of stock, − = into material)
// ============================================================

import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Line, Text, Environment, Lightformer, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import type { NestedSheet } from '@/src/lib/optimiser/nest'
import type { DrillBlockConfig } from '@/src/lib/optimiser/gangDrill'
import { holesOf, type ParsedProgram, type SimMove } from '@/src/lib/optimiser/gcodeParser'
import { buildProfile, type ToolShape } from '@/src/lib/cnc/toolProfile'

const BOARD_COLOR = '#d8c8a4'   // finished panel face
const PART_COLOR  = '#c6ad82'   // nested parts — a touch darker so they read against the board
const EDGE_COLOR  = '#9a8a5e'   // board edge / underside
const CUT_CORE = new THREE.Color('#2a2316')   // freshly-cut material at the trench bottom (true kerf width)
const RAPID_Y = 14              // rapids float above the sheet on a constant safe plane
const GRID_TARGET = 1100        // ~ max grid cells across the longest board edge (caps vertex count)
const OUTLINE_COLOR = '#7a6a45' // crisp part-edge lines (sharp at any zoom, grid-independent)

// Live tool position at a given program time (interpolated). Cheap; called once
// per frame for the head + contact ring.
function headAt(prog: ParsedProgram, t: number) {
  const ms = prog.moves
  if (!ms.length) return { x: 0, y: 0, z: 0, cutting: false, tool: null as number | null }
  const i = ms.findIndex(m => m.t1 > t)
  if (i < 0) { const m = ms[ms.length - 1]; return { x: m.x1, y: m.y1, z: m.z1, cutting: false, tool: m.tool } }
  const m = ms[i]
  const f = Math.min(1, Math.max(0, (t - m.t0) / Math.max(1e-6, m.t1 - m.t0)))
  const z = m.z0 + (m.z1 - m.z0) * f
  return { x: m.x0 + (m.x1 - m.x0) * f, y: m.y0 + (m.y1 - m.y0) * f, z, cutting: m.kind !== 'rapid' && z < -1e-3, tool: m.tool }
}

// ── Merged line segments (rapid trail) ────────────────────────────────────────
function Segments({ moves, map, level, color, opacity }: {
  moves: SimMove[]; map: (x: number, y: number, l: number) => [number, number, number]
  level: number; color: string; opacity: number
}) {
  const n = moves.length
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    if (n) {
      const arr = new Float32Array(n * 6)
      for (let i = 0; i < n; i++) {
        const m = moves[i]
        const a = map(m.x0, m.y0, level)
        const b = map(m.x1, m.y1, level)
        arr.set([a[0], a[1], a[2], b[0], b[1], b[2]], i * 6)
      }
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    }
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, level, color])
  useEffect(() => () => geo.dispose(), [geo])
  if (!n) return null
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={color} transparent opacity={opacity} />
    </lineSegments>
  )
}

// ── The carvable board (height-field / Z-map) ─────────────────────────────────
function CarvedBoard({ W, H, thickness, placements, prog, elapsedRef, toolDia }: {
  W: number; H: number; thickness: number
  placements: NestedSheet['placements']
  prog: ParsedProgram
  elapsedRef: React.MutableRefObject<number>
  toolDia: (n: number | null, f?: number) => number
}) {
  const last = useRef(0)

  // Build the grid once per board/layout. Vertices start flush (y = 0); the
  // colour attribute marks part vs. waste so the parts read a shade apart.
  const { geom, heights, state, baseColors, cols, rows, cell, floorY } = useMemo(() => {
    const cell = Math.max(2, Math.max(W, H) / GRID_TARGET)
    const cols = Math.max(1, Math.round(W / cell))
    const rows = Math.max(1, Math.round(H / cell))
    const cx = cols + 1, cz = rows + 1
    const count = cx * cz
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const heights = new Float32Array(count)          // current y per vertex (0 = uncut face)
    const state = new Uint8Array(count)              // 0 = uncut, 1 = shaded margin, 2 = cut core
    const board = new THREE.Color(BOARD_COLOR)
    const part = new THREE.Color(PART_COLOR)
    const rects = placements.map(p => ({ x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.h }))
    for (let j = 0; j < cz; j++) {
      const sy = Math.min(H, j * cell)
      for (let i = 0; i < cx; i++) {
        const sx = Math.min(W, i * cell)
        const idx = j * cx + i
        positions[idx * 3] = sx - W / 2
        positions[idx * 3 + 1] = 0
        positions[idx * 3 + 2] = H / 2 - sy
        const inPart = rects.some(r => sx >= r.x0 && sx <= r.x1 && sy >= r.y0 && sy <= r.y1)
        const c = inPart ? part : board
        colors[idx * 3] = c.r; colors[idx * 3 + 1] = c.g; colors[idx * 3 + 2] = c.b
      }
    }
    const index = new Uint32Array(cols * rows * 6)
    let o = 0
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = j * cx + i, b = a + 1, c = a + cx, d = c + 1
      index[o++] = a; index[o++] = c; index[o++] = b
      index[o++] = b; index[o++] = c; index[o++] = d
    }
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geom.setIndex(new THREE.BufferAttribute(index, 1))
    return { geom, heights, state, baseColors: colors.slice(), cols, rows, cell, floorY: -(thickness - 0.3) }
  }, [W, H, thickness, placements])

  useEffect(() => { last.current = 0 }, [geom])
  useEffect(() => () => geom.dispose(), [geom])

  // Incremental carve each frame: stamp the tool footprint of every cutting move
  // in (lastTime, target] down to the move's interpolated Z. Scrub-back resets.
  useFrame(() => {
    const target = elapsedRef.current
    const pos = geom.attributes.position as THREE.BufferAttribute
    const col = geom.attributes.color as THREE.BufferAttribute
    const cx = cols + 1
    let changed = false

    // True trench: every grid cell under the tool footprint (kerf = tool radius r)
    // is lowered to the cut depth and darkened — a real recessed channel, not paint.
    const stamp = (sx: number, sy: number, depth: number, r: number) => {
      const i0 = Math.max(0, Math.floor((sx - r) / cell)), i1 = Math.min(cols, Math.ceil((sx + r) / cell))
      const j0 = Math.max(0, Math.floor((sy - r) / cell)), j1 = Math.min(rows, Math.ceil((sy + r) / cell))
      const r2 = r * r
      for (let j = j0; j <= j1; j++) {
        const gy = Math.min(H, j * cell)
        for (let i = i0; i <= i1; i++) {
          const gx = Math.min(W, i * cell)
          if ((gx - sx) ** 2 + (gy - sy) ** 2 > r2) continue
          const idx = j * cx + i
          if (depth < heights[idx]) { heights[idx] = depth; pos.setY(idx, depth); changed = true }
          if (state[idx] === 0) { state[idx] = 1; col.setXYZ(idx, CUT_CORE.r, CUT_CORE.g, CUT_CORE.b); changed = true }
        }
      }
    }

    if (target < last.current) {            // scrubbed backwards → reset and re-carve forward
      heights.fill(0)
      state.fill(0)
      for (let k = 0; k < heights.length; k++) pos.setY(k, 0)
      ;(col.array as Float32Array).set(baseColors)
      col.needsUpdate = true
      last.current = 0
      changed = true
    }

    const from = last.current, to = target
    if (to > from) {
      for (const m of prog.moves) {
        if (m.t1 <= from) continue
        if (m.t0 >= to) break
        if (m.kind === 'rapid') continue
        const span = Math.max(1e-6, m.t1 - m.t0)
        const fA = Math.max(0, (Math.max(from, m.t0) - m.t0) / span)
        const fB = Math.min(1, (Math.min(to, m.t1) - m.t0) / span)
        const r = Math.max(0.6, toolDia(m.tool, 8) / 2)
        const dx = m.x1 - m.x0, dy = m.y1 - m.y0
        const segLen = Math.hypot(dx, dy) * (fB - fA)
        const steps = Math.max(1, Math.ceil(segLen / (cell * 0.6)))
        for (let s = 0; s <= steps; s++) {
          const f = fA + (fB - fA) * (s / steps)
          const z = m.z0 + (m.z1 - m.z0) * f
          if (z < -1e-3) stamp(m.x0 + dx * f, m.y0 + dy * f, Math.max(z, floorY), r)
        }
      }
      last.current = to
    }

    if (changed) { pos.needsUpdate = true; col.needsUpdate = true }
  })

  return (
    <group>
      {/* Machined top face (carvable) */}
      <mesh geometry={geom}>
        <meshStandardMaterial vertexColors flatShading side={THREE.DoubleSide} roughness={0.72} metalness={0.04} />
      </mesh>
      {/* Underside */}
      <mesh position={[0, -thickness, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial color="#0e1420" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      {/* Edge skirt (static — board borders aren't cut) */}
      <mesh position={[0, -thickness / 2, H / 2]}><planeGeometry args={[W, thickness]} /><meshStandardMaterial color={EDGE_COLOR} roughness={0.8} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, -thickness / 2, -H / 2]} rotation={[0, Math.PI, 0]}><planeGeometry args={[W, thickness]} /><meshStandardMaterial color={EDGE_COLOR} roughness={0.8} side={THREE.DoubleSide} /></mesh>
      <mesh position={[-W / 2, -thickness / 2, 0]} rotation={[0, -Math.PI / 2, 0]}><planeGeometry args={[H, thickness]} /><meshStandardMaterial color={EDGE_COLOR} roughness={0.8} side={THREE.DoubleSide} /></mesh>
      <mesh position={[W / 2, -thickness / 2, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[H, thickness]} /><meshStandardMaterial color={EDGE_COLOR} roughness={0.8} side={THREE.DoubleSide} /></mesh>
    </group>
  )
}

// ── Drilled holes (appear in sequence) ────────────────────────────────────────
// Gang drilling fires through the Anderson block in a separate block-Z datum, so
// the height-field carve (which keys off routing Z) can't show it. Instead we pop
// a recessed bore at each hole the moment the program reaches its drill move —
// appearance only, which is all the gang pass needs to read here. Every hole
// (master + reconstructed slaves) is placed via the shared holesOf().
function DrillPits({ hits, W, H, thickness, elapsedRef }: {
  hits: { x: number; y: number; dia: number; t: number }[]
  W: number; H: number; thickness: number
  elapsedRef: React.MutableRefObject<number>
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 18), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  useEffect(() => () => geo.dispose(), [geo])
  const depth = Math.min(Math.max(4, thickness - 1), thickness)

  useFrame(() => {
    const mesh = ref.current
    if (!mesh || !hits.length) return
    const t = elapsedRef.current
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i]
      const shown = h.t <= t
      const rad = Math.max(1.5, (h.dia || 6) / 2)
      // Recess the bore just below the face; hide unreached holes by zero-scaling.
      dummy.position.set(h.x - W / 2, shown ? -depth / 2 + 0.3 : 1e6, H / 2 - h.y)
      dummy.scale.set(shown ? rad : 1e-4, depth, shown ? rad : 1e-4)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  if (!hits.length) return null
  return (
    <instancedMesh ref={ref} args={[geo, undefined, hits.length]}>
      <meshStandardMaterial color="#140d04" roughness={0.95} metalness={0.04} />
    </instancedMesh>
  )
}

// ── The bit ───────────────────────────────────────────────────────────────────
function Tool({ shape, cx, cz, tipY, cutting, span }: {
  shape: ToolShape; cx: number; cz: number; tipY: number; cutting: boolean; span: number
}) {
  const spin = useRef<THREE.Group>(null)
  useFrame((_, dt) => { if (spin.current) spin.current.rotation.y += dt * (cutting ? 26 : 8) })

  const { bodyGeo, shank, ringR } = useMemo(() => {
    const prof = buildProfile(shape)
    const right: { x: number; y: number }[] = []
    for (const p of prof.outline) { if (p.x < -1e-6) break; right.push(p) }
    const pts = right.map(p => new THREE.Vector2(Math.max(p.x, 1e-4), p.y))
    if (pts.length < 2) pts.push(new THREE.Vector2(4, 24))
    const bodyGeo = new THREE.LatheGeometry(pts, 28)
    bodyGeo.computeVertexNormals()
    return { bodyGeo, shank: prof.shank, ringR: Math.max(prof.widthMm / 2, span * 0.004) }
  }, [shape, span])
  useEffect(() => () => bodyGeo.dispose(), [bodyGeo])

  return (
    <group position={[cx, 0, cz]}>
      {/* Contact ring on the stock face — marks where the bit is working */}
      <mesh position={[0, 0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[ringR, ringR * 0.18, 8, 32]} />
        <meshBasicMaterial color={cutting ? '#f59e0b' : '#60a5fa'} transparent opacity={0.9} />
      </mesh>
      {/* Faint spindle axis so the (small) bit is easy to locate when zoomed out */}
      <Line points={[[0, tipY, 0], [0, RAPID_Y + span * 0.25, 0]]} color="#475569" transparent opacity={0.35} lineWidth={1} />
      {/* The bit, tip at the live machine Z, extending upward */}
      <group ref={spin} position={[0, tipY, 0]}>
        <mesh geometry={bodyGeo}>
          <meshStandardMaterial color={cutting ? '#fbbf24' : '#d7dde6'} metalness={0.95} roughness={0.22} />
        </mesh>
        <mesh position={[0, (shank.bottom + shank.top) / 2, 0]}>
          <cylinderGeometry args={[shank.halfW, shank.halfW, shank.top - shank.bottom, 32]} />
          <meshStandardMaterial color="#aab4c2" metalness={0.95} roughness={0.18} />
        </mesh>
        <mesh position={[0, shank.top + span * 0.05, 0]}>
          <cylinderGeometry args={[shank.halfW * 2.4, shank.halfW * 1.6, span * 0.1, 32]} />
          <meshStandardMaterial color="#7b8696" metalness={0.9} roughness={0.3} />
        </mesh>
      </group>
    </group>
  )
}

// ── Scene ──────────────────────────────────────────────────────────────────────
function Scene({ sheet, prog, elapsed, toolDia, activeShape, drillBlock }: Props) {
  const { w: W, h: H } = sheet.stock
  const thickness = sheet.thickness || 18
  const span = Math.max(W, H)

  const map = (x: number, y: number, level: number): [number, number, number] => [x - W / 2, level, H / 2 - y]

  // The carve runs in useFrame off a ref so it isn't tied to React's render cadence.
  const elapsedRef = useRef(elapsed)
  elapsedRef.current = elapsed

  // Gang-drilled holes (masters + reconstructed slaves) with the time each lands.
  // Only gang moves need pits — plain single-spindle drilling has real routing-Z
  // and is already carved into the height-field by CarvedBoard.
  const drillHits = useMemo(() => {
    const out: { x: number; y: number; dia: number; t: number }[] = []
    for (const m of prog.moves) if (m.kind === 'drill' && m.bitmask) for (const h of holesOf(m, drillBlock)) out.push({ ...h, t: m.t1 })
    return out
  }, [prog, drillBlock])

  const rapids = useMemo(() => {
    const out: SimMove[] = []
    for (const m of prog.moves) { if (m.t1 > elapsed) break; if (m.kind === 'rapid') out.push(m) }
    return out
  }, [prog, elapsed])

  const head = headAt(prog, elapsed)
  const [tx, , tz] = map(head.x, head.y, 0)
  const camPos = useMemo<[number, number, number]>(() => [span * 0.18, span * 0.55, span * 0.92], [span])

  return (
    <>
      <PerspectiveCamera makeDefault fov={38} position={camPos} near={span * 0.02} far={span * 12} />
      {/* Mouse-wheel zoom (dolly) + orbit + pan. */}
      <OrbitControls target={[0, -thickness / 2, 0]} enableZoom enablePan enableDamping={false}
        minDistance={span * 0.04} maxDistance={span * 6} zoomSpeed={1.1} />

      {/* Lighting: soft sky/ground fill + warm key + cool rim, plus image-based
          environment (procedural — no downloads) so steel + board catch highlights. */}
      <hemisphereLight args={['#e7eeff', '#37301d', 0.85]} />
      <directionalLight position={[span * 0.5, span * 1.1, span * 0.55]} intensity={2.1} color="#fff4e2" />
      <directionalLight position={[-span * 0.6, span * 0.5, -span * 0.45]} intensity={0.7} color="#bcd2ff" />
      <Environment resolution={128} frames={1}>
        <Lightformer intensity={2.4} position={[0, span, 0]} scale={[span, span, 1]} />
        <Lightformer intensity={1.3} position={[span, span * 0.5, span]} scale={span * 0.7} color="#cfe0ff" />
        <Lightformer intensity={1.0} position={[-span, span * 0.5, -span]} scale={span * 0.7} color="#ffe7c2" />
      </Environment>

      <CarvedBoard W={W} H={H} thickness={thickness} placements={sheet.placements}
        prog={prog} elapsedRef={elapsedRef} toolDia={toolDia} />

      {/* Drilled holes popping in sequence (gang block has no routing-Z carve) */}
      <DrillPits hits={drillHits} W={W} H={H} thickness={thickness} elapsedRef={elapsedRef} />

      {/* Crisp, grid-independent part outlines */}
      {sheet.placements.map(p => {
        const x0 = p.x - W / 2, x1 = p.x + p.w - W / 2
        const z0 = H / 2 - p.y, z1 = H / 2 - (p.y + p.h)
        return (
          <Line key={p.uid} points={[[x0, 0.3, z0], [x1, 0.3, z0], [x1, 0.3, z1], [x0, 0.3, z1], [x0, 0.3, z0]]}
            color={OUTLINE_COLOR} lineWidth={1.25} transparent opacity={0.55} />
        )
      })}

      {/* Soft grounding shadow under the board */}
      <ContactShadows position={[0, -thickness - 1, 0]} scale={span * 1.5} far={thickness + 6}
        blur={2.4} opacity={0.45} resolution={1024} frames={1} color="#000000" />

      {/* Part labels float just above the face */}
      {sheet.placements.map(p => {
        const cxp = p.x + p.w / 2 - W / 2
        const czp = H / 2 - (p.y + p.h / 2)
        if (!(p.w > span * 0.08 && p.h > span * 0.05)) return null
        return (
          <Text key={p.uid} position={[cxp, 1, czp]} rotation={[-Math.PI / 2, 0, 0]}
            fontSize={Math.min(p.w, p.h) * 0.16} color="#5b4e33" anchorX="center" anchorY="middle" maxWidth={p.w * 0.9}>
            {p.label.length > 16 ? p.label.slice(0, 15) + '…' : p.label}
          </Text>
        )
      })}

      {/* Rapids float above the board on a safe plane */}
      <Segments moves={rapids} map={map} level={RAPID_Y} color="#3b82f6" opacity={0.22} />

      {/* The working bit — tip at the true machine Z, tracking the carved surface */}
      <Tool shape={activeShape} cx={tx} cz={tz} tipY={head.z} cutting={head.cutting} span={span} />
    </>
  )
}

interface Props {
  sheet: NestedSheet
  prog: ParsedProgram
  elapsed: number
  headPos: { x: number; y: number; z: number }
  cutting: boolean
  activeTool: number | null
  toolDia: (n: number | null, fallback?: number) => number
  activeShape: ToolShape
  drillBlock?: DrillBlockConfig
}

export default function SimCanvas3D(props: Props) {
  return (
    <Canvas className="rounded-lg shadow-2xl" gl={{ antialias: true }} dpr={[1, 2]}
      style={{ background: 'radial-gradient(circle at 50% 22%, #1d2942 0%, #0a0f18 78%)' }}>
      <Suspense fallback={null}>
        <Scene {...props} />
      </Suspense>
    </Canvas>
  )
}
