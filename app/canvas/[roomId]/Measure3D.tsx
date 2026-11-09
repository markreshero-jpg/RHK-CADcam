'use client'

// ── Room 3D measure tool: plane to plane ──────────────────────────────────────
// Hover tints the flat face under the cursor; click locks it as plane A; hover a
// second face for a live preview, click to lock plane B. Parallel faces read the
// true perpendicular gap (kick to kick, cabinet back to wall); non-parallel faces
// fall back to point-to-point with X / Y / height components. A third click
// starts a new measurement; right-click (touch: long-press) clears; Esc or the
// Measure button again exits the tool (CanvasClient). Touch: tap = click, no hover.
//
// Picks are raycast against what the scene actually renders, so only parts the
// layer set draws can be measured (hidden parts aren't in the scene). The overlay
// is a transient tool, like the 2D measure tools — not a layer-registry item.
// Mounted only while the tool is on; unmounting drops the measurement.
//
// Edge snap: within EDGE_PX of a face's edge (its outline or a cut-out's edge)
// the pick becomes the face across that edge — the board edge or the hole wall,
// which at 16–18 mm are too thin to hover on, or face away. The edge lights up.
// Also used by the cabinet edit modal's 3D view (Cabinet3DView), in cabinet
// space (x = width, y = height, z = depth) — `axes` relabels the components.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import {
  BufferGeometry, DoubleSide, Float32BufferAttribute, Matrix3, Raycaster, Vector2, Vector3,
  type Mesh, type Object3D, type Material,
} from 'three'
import { measurePlanes, coplanarTriangles, boundaryEdges, faceAcrossEdge, type PlanePick, type PlaneMeasure } from '@/src/lib/measure3d'
import { fmtMm } from '@/src/lib/format'

/** edge: the snapped edge (a, b) when the pick came from an edge snap. */
type Pick = PlanePick & { key: string; tris: Float32Array; edge: [Vector3, Vector3] | null }

const HOVER = '#22d3ee'
const PICKED = '#f59e0b'
const CLICK_SLOP = 5   // px of pointer travel still counted as a click (not an orbit / pan)
const TAP_MAX_MS = 400  // a longer touch is a long-press (clears), not a pick
const EDGE_PX = 7       // cursor within this many px of a face edge snaps to the face across it…
const THIN_PX = 24      // …when that face is thinner than this on screen

/** Mark a subtree with this userData to keep it out of measure picks. */
export const NO_MEASURE = { noMeasure: true }

function pickable(o: Object3D): boolean {
  for (let x: Object3D | null = o; x; x = x.parent) {
    if (!x.visible || x.userData?.noMeasure) return false
  }
  const m = (o as Mesh).material as Material | Material[] | undefined
  const mats = Array.isArray(m) ? m : m ? [m] : []
  return mats.some(mt => mt.visible !== false && !(mt.transparent && mt.opacity <= 0.02))
}

export default function Measure3D({ axes = ['X', 'Y', 'H'], onMeasured }: {
  /** Labels for the point-to-point components: [x, z, y] world axes. */
  axes?: [string, string, string]
  /** Fires when a second face is locked (a measurement is complete). */
  onMeasured?: () => void
} = {}) {
  const get = useThree(s => s.get)
  const gl  = useThree(s => s.gl)
  const [hover, setHover] = useState<Pick | null>(null)
  const [picks, setPicks] = useState<{ a: Pick | null; b: Pick | null }>({ a: null, b: null })

  const ray   = useMemo(() => new Raycaster(), [])
  const ndc   = useMemo(() => new Vector2(), [])
  const nm    = useMemo(() => new Matrix3(), [])
  const va    = useMemo(() => new Vector3(), [])
  const vb    = useMemo(() => new Vector3(), [])
  // Face region per (mesh, plane): recomputed only when the cursor crosses faces.
  const cache = useRef(new Map<string, { tris: Float32Array; edges: Float32Array | null }>())

  useEffect(() => {
    const el = gl.domElement

    function region(o: Mesh, n: Vector3, p: Vector3, withEdges: boolean) {
      const key = `${o.uuid}|${n.x.toFixed(3)},${n.y.toFixed(3)},${n.z.toFixed(3)}|${n.dot(p).toFixed(1)}`
      let r = cache.current.get(key)
      if (!r) {
        if (cache.current.size > 200) cache.current.clear()
        r = { tris: coplanarTriangles(o.geometry, o.matrixWorld, n, p), edges: null }
        cache.current.set(key, r)
      }
      if (withEdges && !r.edges) r.edges = boundaryEdges(r.tris)
      return { key, ...r }
    }

    type Hit = { o: Mesh; n: Vector3; point: Vector3 }
    // First pickable face under screen point (x, y) relative to the canvas.
    function hitAt(x: number, y: number, w: number, h: number): Hit | null {
      ndc.set((x / w) * 2 - 1, -(y / h) * 2 + 1)
      ray.setFromCamera(ndc, get().camera)
      for (const it of ray.intersectObjects(get().scene.children, true)) {
        const o = it.object as Mesh
        if (!o.isMesh || !it.face || !pickable(o)) continue
        const n = it.face.normal.clone().applyMatrix3(nm.getNormalMatrix(o.matrixWorld)).normalize()
        if (n.dot(ray.ray.direction) > 0) n.negate()     // face the viewer
        return { o, n, point: it.point.clone() }
      }
      return null
    }

    // Snap to the face across the nearest edge of `hit`'s face within EDGE_PX
    // of the cursor (cx, cy) — only when that face is thin on screen (a board
    // edge, a hole wall); on a board edge itself its big neighbour stays unsnapped.
    function snapFrom(hit: Hit, cx: number, cy: number, w: number, h: number): { pick: Pick; d: number } | null {
      const { camera } = get()
      const sx = (v: Vector3) => { const q = v.clone().project(camera); return [(q.x + 1) / 2 * w, (1 - q.y) / 2 * h] }
      const edges = region(hit.o, hit.n, hit.point, true).edges!
      let best = -1, bestD = EDGE_PX
      for (let i = 0; i + 8 < edges.length; i += 9) {
        const [ax, ay] = sx(va.set(edges[i], edges[i + 1], edges[i + 2]))
        const [bx, by] = sx(vb.set(edges[i + 3], edges[i + 4], edges[i + 5]))
        const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey
        const t = l2 ? Math.max(0, Math.min(1, ((cx - ax) * ex + (cy - ay) * ey) / l2)) : 0
        const d = Math.hypot(cx - ax - t * ex, cy - ay - t * ey)
        if (d < bestD) { bestD = d; best = i }
      }
      if (best < 0) return null
      const a = new Vector3(edges[best], edges[best + 1], edges[best + 2])
      const b = new Vector3(edges[best + 3], edges[best + 4], edges[best + 5])
      const inside = new Vector3(edges[best + 6], edges[best + 7], edges[best + 8])
      ndc.set((cx / w) * 2 - 1, -(cy / h) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const m = faceAcrossEdge(hit.o.geometry, hit.o.matrixWorld, a, b, hit.n, inside)
      if (m.dot(ray.ray.direction) > 0) m.negate()
      const point = new Vector3()
      ray.ray.distanceSqToSegment(a, b, undefined, point)
      const wall = region(hit.o, m, point, false)
      const [ax, ay] = sx(a), [bx, by] = sx(b)
      const ex = bx - ax, ey = by - ay, el = Math.hypot(ex, ey) || 1
      let thick = 0
      for (let i = 0; i + 2 < wall.tris.length; i += 3) {
        const [px, py] = sx(va.set(wall.tris[i], wall.tris[i + 1], wall.tris[i + 2]))
        thick = Math.max(thick, Math.abs((px - ax) * ey - (py - ay) * ex) / el)
      }
      if (thick >= THIN_PX) return null
      return { pick: { point, normal: m, key: wall.key, tris: wall.tris, edge: [a, b] }, d: bestD }
    }

    function pickAt(clientX: number, clientY: number): Pick | null {
      const r = el.getBoundingClientRect()
      const cx = clientX - r.left, cy = clientY - r.top
      const hit = hitAt(cx, cy, r.width, r.height)
      let snap = hit ? snapFrom(hit, cx, cy, r.width, r.height) : null
      // Just inside a hole (or past a board's end) the ray misses the face whose
      // edge the cursor is on — look a few px around for it.
      if (!snap) {
        for (let k = 0; k < 8; k++) {
          const ang = k * Math.PI / 4
          const ox = cx + Math.cos(ang) * EDGE_PX, oy = cy + Math.sin(ang) * EDGE_PX
          const near = hitAt(ox, oy, r.width, r.height)
          if (!near || (hit && near.o === hit.o && Math.abs(near.n.dot(hit.n)) > 0.9999 && Math.abs(near.n.dot(near.point) - hit.n.dot(hit.point)) < 0.5)) continue
          const s2 = snapFrom(near, cx, cy, r.width, r.height)
          if (s2 && (!snap || s2.d < snap.d)) snap = s2
        }
      }
      if (snap) return snap.pick
      if (!hit) return null
      const face = region(hit.o, hit.n, hit.point, false)
      return { point: hit.point, normal: hit.n, key: face.key, tris: face.tris, edge: null }
    }

    let raf = 0
    let last: { x: number; y: number } | null = null
    let down: { x: number; y: number; button: number; t: number } | null = null

    function onMove(e: PointerEvent) {
      if (e.buttons) return                     // orbiting / panning
      last = { x: e.clientX, y: e.clientY }
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (!last) return
        const p = pickAt(last.x, last.y)
        setHover(prev => (prev && p && prev.key === p.key && prev.point.distanceTo(p.point) < 0.5) ? prev : p)
      })
    }
    function onDown(e: PointerEvent) { down = { x: e.clientX, y: e.clientY, button: e.button, t: performance.now() } }
    function onUp(e: PointerEvent) {
      const d = down; down = null
      if (!d || d.button !== e.button || Math.hypot(e.clientX - d.x, e.clientY - d.y) > CLICK_SLOP) return
      if (e.button === 2) { setPicks({ a: null, b: null }); return }
      if (e.button !== 0) return
      if (e.pointerType === 'touch' && performance.now() - d.t > TAP_MAX_MS) return
      const p = pickAt(e.clientX, e.clientY)
      if (!p) return
      setPicks(prev => !prev.a || prev.b ? { a: p, b: null } : { a: prev.a, b: p })
    }
    function onLeave() { last = null; setHover(null) }
    // Touch has no right button: a long-press (useLongPressMenu's synthetic
    // contextmenu) clears instead. Harmless double-clear on a real right-click.
    function onMenu() { setPicks({ a: null, b: null }) }

    el.style.cursor = 'crosshair'
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('contextmenu', onMenu)
    return () => {
      cancelAnimationFrame(raf)
      el.style.cursor = ''
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('contextmenu', onMenu)
    }
  }, [gl, get, ray, ndc, nm, va, vb])

  const { a, b } = picks
  const onMeasuredRef = useRef(onMeasured)
  onMeasuredRef.current = onMeasured
  useEffect(() => { if (b) onMeasuredRef.current?.() }, [b])
  const target = b ?? (a ? hover : null)
  const m = a && target && target.key !== a.key ? measurePlanes(a, target) : null
  const showHover = hover && hover.key !== a?.key && hover.key !== b?.key

  return (
    <group userData={NO_MEASURE}>
      {showHover && <FaceTint tris={hover.tris} color={HOVER} opacity={0.35} />}
      {showHover && hover.edge && <EdgeLine edge={hover.edge} color={HOVER} />}
      {a && <FaceTint tris={a.tris} color={PICKED} opacity={0.45} />}
      {a?.edge && <EdgeLine edge={a.edge} color={PICKED} />}
      {b && <FaceTint tris={b.tris} color={PICKED} opacity={0.45} />}
      {b?.edge && <EdgeLine edge={b.edge} color={PICKED} />}
      {m && <Dimension m={m} live={!b} axes={axes} />}
    </group>
  )
}

function FaceTint({ tris, color, opacity }: { tris: Float32Array; color: string; opacity: number }) {
  const geo = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(tris, 3))
    return g
  }, [tris])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <mesh geometry={geo} renderOrder={10}>
      <meshBasicMaterial color={color} transparent opacity={opacity} side={DoubleSide} depthWrite={false}
        polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-4} />
    </mesh>
  )
}

// The snapped edge, drawn over everything: the face across it is often a thin
// strip or faces away, so its tint alone can be hard to see.
function EdgeLine({ edge, color }: { edge: [Vector3, Vector3]; color: string }) {
  return <Line points={edge} color={color} lineWidth={3} depthTest={false} renderOrder={11} />
}

const noPointer = { pointerEvents: 'none' as const }

function Dot({ at }: { at: PlaneMeasure['to'] }) {
  return (
    <Html position={at} center pointerEvents="none" style={noPointer} zIndexRange={[20, 0]}>
      <div className="w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white" />
    </Html>
  )
}

function Dimension({ m, live, axes }: { m: PlaneMeasure; live: boolean; axes: [string, string, string] }) {
  const mid = m.from.clone().add(m.to).multiplyScalar(0.5)
  return (
    <>
      {/* Plane A pick → the foot the gap is measured from (it can sit off the face). */}
      {m.kind === 'parallel' && m.anchor.distanceTo(m.from) > 1 && (
        <Line points={[m.anchor, m.from]} color="#64748b" lineWidth={1} dashed dashSize={15} gapSize={15}
          depthTest={false} renderOrder={11} />
      )}
      <Line points={[m.from, m.to]} color={PICKED} lineWidth={2.5} dashed={live} dashSize={20} gapSize={12}
        depthTest={false} renderOrder={12} />
      <Dot at={m.from} />
      <Dot at={m.to} />
      <Html position={mid} center pointerEvents="none" style={noPointer} zIndexRange={[21, 0]}>
        <div className={`whitespace-nowrap rounded px-2 py-1 text-center shadow-lg bg-gray-900/90 border ${live ? 'border-gray-600 opacity-80' : 'border-amber-500'}`}>
          <div className="text-sm font-semibold text-amber-300">{fmtMm(m.dist)} mm</div>
          <div className="text-[10px] text-gray-300">
            {m.kind === 'parallel'
              ? 'square gap between faces'
              : `faces at ${Math.round(m.angleDeg)}° · point to point · ${axes[0]} ${fmtMm(m.dx)} · ${axes[1]} ${fmtMm(m.dy)} · ${axes[2]} ${fmtMm(m.dz)}`}
          </div>
        </div>
      </Html>
    </>
  )
}
