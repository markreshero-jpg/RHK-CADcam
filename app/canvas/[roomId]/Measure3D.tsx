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

import { useEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import {
  BufferGeometry, DoubleSide, Float32BufferAttribute, Matrix3, Raycaster, Vector2,
  type Mesh, type Object3D, type Material,
} from 'three'
import { measurePlanes, coplanarTriangles, type PlanePick, type PlaneMeasure } from '@/src/lib/measure3d'
import { fmtMm } from '@/src/lib/format'

type Pick = PlanePick & { key: string; tris: Float32Array }

const HOVER = '#22d3ee'
const PICKED = '#f59e0b'
const CLICK_SLOP = 5   // px of pointer travel still counted as a click (not an orbit / pan)
const TAP_MAX_MS = 400  // a longer touch is a long-press (clears), not a pick

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

export default function Measure3D() {
  const get = useThree(s => s.get)
  const gl  = useThree(s => s.gl)
  const [hover, setHover] = useState<Pick | null>(null)
  const [picks, setPicks] = useState<{ a: Pick | null; b: Pick | null }>({ a: null, b: null })

  const ray   = useMemo(() => new Raycaster(), [])
  const ndc   = useMemo(() => new Vector2(), [])
  const nm    = useMemo(() => new Matrix3(), [])
  // Face region per (mesh, plane): recomputed only when the cursor crosses faces.
  const cache = useRef(new Map<string, Float32Array>())

  useEffect(() => {
    const el = gl.domElement

    function pickAt(clientX: number, clientY: number): Pick | null {
      const { camera, scene } = get()
      const r = el.getBoundingClientRect()
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      for (const h of ray.intersectObjects(scene.children, true)) {
        const o = h.object as Mesh
        if (!o.isMesh || !h.face || !pickable(o)) continue
        const n = h.face.normal.clone().applyMatrix3(nm.getNormalMatrix(o.matrixWorld)).normalize()
        if (n.dot(ray.ray.direction) > 0) n.negate()     // face the viewer
        const key = `${o.uuid}|${n.x.toFixed(3)},${n.y.toFixed(3)},${n.z.toFixed(3)}|${n.dot(h.point).toFixed(1)}`
        let tris = cache.current.get(key)
        if (!tris) {
          tris = coplanarTriangles(o.geometry, o.matrixWorld, n, h.point)
          if (cache.current.size > 200) cache.current.clear()
          cache.current.set(key, tris)
        }
        return { point: h.point.clone(), normal: n, key, tris }
      }
      return null
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
  }, [gl, get, ray, ndc, nm])

  const { a, b } = picks
  const target = b ?? (a ? hover : null)
  const m = a && target && target.key !== a.key ? measurePlanes(a, target) : null
  const showHover = hover && hover.key !== a?.key && hover.key !== b?.key

  return (
    <group userData={NO_MEASURE}>
      {showHover && <FaceTint tris={hover.tris} color={HOVER} opacity={0.35} />}
      {a && <FaceTint tris={a.tris} color={PICKED} opacity={0.45} />}
      {b && <FaceTint tris={b.tris} color={PICKED} opacity={0.45} />}
      {m && <Dimension m={m} live={!b} />}
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

const noPointer = { pointerEvents: 'none' as const }

function Dot({ at }: { at: PlaneMeasure['to'] }) {
  return (
    <Html position={at} center pointerEvents="none" style={noPointer} zIndexRange={[20, 0]}>
      <div className="w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white" />
    </Html>
  )
}

function Dimension({ m, live }: { m: PlaneMeasure; live: boolean }) {
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
              : `faces at ${Math.round(m.angleDeg)}° · point to point · X ${fmtMm(m.dx)} · Y ${fmtMm(m.dy)} · H ${fmtMm(m.dz)}`}
          </div>
        </div>
      </Html>
    </>
  )
}
