'use client'

// ── FixtureModel ──────────────────────────────────────────────────────────────
// Renders a fixture / appliance (z_fixtures/FIXTURES-SPEC.md) in its item box.
//
// Item-box convention: origin = back-bottom-left corner.
//   +X = width (left → right, looking at the front)
//   +Y = up
//   +Z = toward the front (glTF's "forward", so most GLB exports face out)
//
// The uploaded model is rotated (rot_x first — fixes Z-up exports — then rot_y),
// scaled, then its bounding box is auto-aligned: centred in X and Z, bottom on
// Y = 0. Offsets nudge it after that. No model / still loading → a plain box.

import { Component, Suspense, useContext, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { PartAlphaContext, alphaMat } from './PartViewer'
import { ModelSource, type ModelFormat } from './ModelAsset'
import { rotatedBounds, fitOffset } from '@/src/lib/fixtureFit'
import { activeStretch, nativeTargets, stretchObject } from '@/src/lib/fixtureStretch'

export interface FixtureLook {
  width:  number
  depth:  number
  height: number
  colour:       string | null
  model_url:    string | null
  model_format: ModelFormat | string | null
  model_scale:  number
  model_rot_x:  number
  model_rot_y:  number
  model_off_x:  number
  model_off_y:  number
  model_off_z:  number
  /** P11: follow width / depth (banded stretch when the model has a spec, else scale). */
  resizable?:   boolean | null
  stretch?:     unknown
}

export const FIXTURE_DEFAULT_COLOUR = '#cbd5e1'
const DEG = Math.PI / 180

function isFormat(f: unknown): f is ModelFormat {
  return f === 'glb' || f === 'stl' || f === 'obj'
}

// ── Plain box (no model, loading, or failed) ──────────────────────────────────

export function FixtureBox({ w, h, d, color, edges = true }: {
  w: number; h: number; d: number; color: string; edges?: boolean
}) {
  const alpha = useContext(PartAlphaContext)
  const edgeGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), [w, h, d])
  return (
    <group position={[w / 2, h / 2, d / 2]}>
      <mesh key={alpha < 1 ? 't' : 'o'}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} metalness={0.1} roughness={0.7} {...alphaMat(alpha)} />
      </mesh>
      {edges && (
        <lineSegments geometry={edgeGeo}>
          <lineBasicMaterial color="#475569" transparent={alpha < 1} opacity={alpha} />
        </lineSegments>
      )}
    </group>
  )
}

// A model that fails to load (deleted file, bad export) falls back to the box
// instead of taking the whole scene down.
export class ModelErrorBoundary extends Component<
  { fallback: React.ReactNode; resetKey: string; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false })
  }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

// ── Fitted model ──────────────────────────────────────────────────────────────
// A resizable item (P11) is stretched to its box first: banded via the stretch
// spec (the row's copy, else the GLB's own scene extras), or — no spec — scaled
// in width / depth to fill the box. Height never stretches.

function Fitted({ obj, f, onNativeSize }: {
  obj: THREE.Object3D
  f: FixtureLook
  onNativeSize?: (size: { x: number; y: number; z: number }) => void
}) {
  const rx = (f.model_rot_x || 0) * DEG
  const ry = (f.model_rot_y || 0) * DEG
  const s  = f.model_scale || 1

  // Rotated bounds at scale 1 — the "native" size the editor's Fit-to-size uses.
  const native = useMemo(() => rotatedBounds(obj, f.model_rot_x, f.model_rot_y), [obj, f.model_rot_x, f.model_rot_y])

  const spec = f.resizable ? activeStretch({ ...f, stretch: f.stretch ?? obj.userData?.stretch }) : null
  const targets = spec ? nativeTargets(f) : null
  const specKey = spec ? JSON.stringify(spec) : ''
  const shaped = useMemo(
    () => spec && targets ? stretchObject(obj, spec, targets) : obj,
    [obj, specKey, targets?.x, targets?.z], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const shapedBounds = useMemo(
    () => shaped === obj ? native : rotatedBounds(shaped, f.model_rot_x, f.model_rot_y),
    [shaped, obj, native, f.model_rot_x, f.model_rot_y],
  )

  useEffect(() => {
    if (!onNativeSize || native.isEmpty()) return
    const sz = native.getSize(new THREE.Vector3())
    onNativeSize({ x: sz.x, y: sz.y, z: sz.z })
  }, [native, onNativeSize])

  // Resizable, no spec: stretch the box-space width / depth to fill the box.
  const sz = shapedBounds.isEmpty() ? null : shapedBounds.getSize(new THREE.Vector3())
  const kx = f.resizable && !spec && sz && sz.x > 0 ? f.width / (sz.x * s) : 1
  const kz = f.resizable && !spec && sz && sz.z > 0 ? f.depth / (sz.z * s) : 1
  const [ox, oy, oz] = fitOffset(shapedBounds, f)
  const c = shapedBounds.isEmpty() ? null : shapedBounds.getCenter(new THREE.Vector3())
  // fitOffset centres the unscaled model; the k scale is about the origin, so re-centre.
  const offset: [number, number, number] = c
    ? [ox + c.x * s * (1 - kx), oy, oz + c.z * s * (1 - kz)]
    : [ox, oy, oz]

  return (
    <group position={offset}>
      <group scale={[kx, 1, kz]}>
        <group rotation={[rx, ry, 0, 'YXZ']} scale={s}>
          <primitive object={shaped} />
        </group>
      </group>
    </group>
  )
}

/** Thin outline of the item box — shows how a model sits inside its size. */
export function FixtureOutline({ w, h, d, color = '#38bdf8' }: { w: number; h: number; d: number; color?: string }) {
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), [w, h, d])
  return (
    <lineSegments geometry={geo} position={[w / 2, h / 2, d / 2]}>
      <lineBasicMaterial color={color} transparent opacity={0.5} />
    </lineSegments>
  )
}

export function FixtureModel({ f, onNativeSize, outline = false }: {
  f: FixtureLook
  onNativeSize?: (size: { x: number; y: number; z: number }) => void
  /** Also draw the item box outline around a loaded model (library preview). */
  outline?: boolean
}) {
  const color = f.colour || FIXTURE_DEFAULT_COLOUR
  const box = <FixtureBox w={f.width} h={f.height} d={f.depth} color={color} />
  if (!f.model_url || !isFormat(f.model_format)) return box
  return (
    <>
      <ModelErrorBoundary fallback={box} resetKey={f.model_url}>
        <Suspense fallback={box}>
          <ModelSource url={f.model_url} format={f.model_format} look={{ color, metalness: 0.2, roughness: 0.6 }}>
            {obj => <Fitted obj={obj} f={f} onNativeSize={onNativeSize} />}
          </ModelSource>
        </Suspense>
      </ModelErrorBoundary>
      {outline && <FixtureOutline w={f.width} h={f.height} d={f.depth} />}
    </>
  )
}
