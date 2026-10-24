// Shop drawings 3D shots (z_shop_drawings S8). <Room3DCapture> mounts the room's
// own 3D scene off-screen (RoomScene printMode), points the camera at each shot
// in turn with that shot's walls hidden, lets the scene settle (part details,
// fixture models), then captures it as vector hidden lines. <Shot3DSVG> draws a
// captured shot as black SVG lines fitted to a paper-mm box.
'use client'
import { Suspense, useEffect, useMemo, type ComponentProps } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import type { PerspectiveCamera } from 'three'
import type { Wall, CabinetInstance, Room, RoomFixture, BenchtopInstance, BenchtopEdgeProfile } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import type { LayerView } from '@/src/lib/displayLayers/resolve'
import type { BtElevInfo } from './BenchtopElevation'
import { RoomScene } from './Room3DScene'
import { captureHiddenLines, type HiddenLineResult } from '@/src/lib/shopDrawings/hiddenLine'
import type { Shot3D } from '@/src/lib/shopDrawings/shots3d'
import { PEN, PRINT_INK } from '@/src/lib/shopDrawings/pens'

/** Wait after a shot's scene mounts before capturing (async part details + models). */
const SETTLE_MS = 1500
const NOOP = () => {}

export interface Bt3DPrint {
  benchtops: BenchtopInstance[]
  info: (bt: BenchtopInstance) => BtElevInfo
  profiles: Record<string, BenchtopEdgeProfile>
}

function CaptureDriver({ shot, onDone }: { shot: Shot3D; onDone: (r: HiddenLineResult) => void }) {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => requestAnimationFrame(() => {
      if (cancelled) return
      const cam = camera as PerspectiveCamera
      cam.position.set(...shot.eye)
      cam.lookAt(...shot.target)
      cam.updateMatrixWorld()
      scene.updateMatrixWorld(true)
      onDone(captureHiddenLines(gl, scene, cam))
    }), SETTLE_MS)
    return () => { cancelled = true; clearTimeout(t) }
    // One capture per shot; onDone identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot.id, gl, scene, camera])
  return null
}

export default function Room3DCapture({ shots, walls, cabinets, room, resolvedParts, layers, fixtures, bt, onCaptured }: {
  shots: Shot3D[]
  walls: Wall[]
  cabinets: CabinetInstance[]
  room: Room
  resolvedParts: Map<string, ResolvedCabinet>
  layers: LayerView
  fixtures: RoomFixture[]
  bt?: Bt3DPrint
  onCaptured: (shotId: string, r: HiddenLineResult) => void
}) {
  // Always the first view still to capture — the parent drops it once its result is in.
  const shot = shots[0]
  const hidden = useMemo(() => new Set(shot?.hiddenWallIds ?? []), [shot])
  const hiddenCabs = useMemo(() => new Set(shot?.hiddenCabinetIds ?? []), [shot])
  if (!shot) return null
  return (
    <div aria-hidden style={{ position: 'fixed', left: -20000, top: 0, width: 1200, height: 900, pointerEvents: 'none' }}>
      <Canvas gl={{ antialias: false }} dpr={1}>
        <Suspense fallback={null}>
          <RoomScene
            printMode
            walls={walls} cabinets={cabinets} room={room}
            selectedId={null} onSelectCabinet={NOOP} onCabContextMenu={NOOP}
            resolvedParts={resolvedParts}
            hiddenWallIds={hidden}
            hiddenCabinetIds={hiddenCabs}
            birdsEyeSignal={0} resetSignal={0}
            layers={layers}
            bt={bt && { ...bt, selectedId: null, onSelect: NOOP }}
            fx={{ fixtures, selectedId: null, onSelect: NOOP }}
            pickBenchtops={false} measuring={false} wire={false}
          />
          <CaptureDriver key={shot.id} shot={shot} onDone={r => onCaptured(shot.id, r)} />
        </Suspense>
      </Canvas>
    </div>
  )
}

// ── Colour render (trial report, 2026-10-24) ─────────────────────────────────
// Same off-screen scene and shots, but shaded in the room's material colours and
// captured as a JPEG. A raster picture — the vector rule (S8) is for the shop drawings.

const RENDER_BG = '#f4f2ee'

function RenderDriver({ shot, onDone }: { shot: Shot3D; onDone: (dataUrl: string) => void }) {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => requestAnimationFrame(() => {
      if (cancelled) return
      const cam = camera as PerspectiveCamera
      cam.position.set(...shot.eye)
      cam.lookAt(...shot.target)
      cam.updateMatrixWorld()
      // Render and read back in the same tick (no preserveDrawingBuffer needed).
      gl.render(scene, cam)
      onDone(gl.domElement.toDataURL('image/jpeg', 0.92))
    }), SETTLE_MS)
    return () => { cancelled = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot.id, gl, scene, camera])
  return null
}

/** Off-screen colour render of each shot in turn, at width × height pixels. */
export function Room3DRender({ shots, width, height, walls, cabinets, room, resolvedParts, layers, fixtures, bt, materialColours, ebByMatId, onCaptured }: {
  shots: Shot3D[]
  width: number
  height: number
  walls: Wall[]
  cabinets: CabinetInstance[]
  room: Room
  resolvedParts: Map<string, ResolvedCabinet>
  layers: LayerView
  fixtures: RoomFixture[]
  bt?: Bt3DPrint
  materialColours?: ComponentProps<typeof RoomScene>['materialColours']
  ebByMatId?: ComponentProps<typeof RoomScene>['ebByMatId']
  onCaptured: (shotId: string, dataUrl: string) => void
}) {
  const shot = shots[0]
  const hidden = useMemo(() => new Set(shot?.hiddenWallIds ?? []), [shot])
  const hiddenCabs = useMemo(() => new Set(shot?.hiddenCabinetIds ?? []), [shot])
  if (!shot) return null
  return (
    <div aria-hidden style={{ position: 'fixed', left: -20000, top: 0, width, height, pointerEvents: 'none' }}>
      <Canvas gl={{ antialias: true }} dpr={1}>
        <color attach="background" args={[RENDER_BG]} />
        <Suspense fallback={null}>
          <RoomScene
            printMode floor
            walls={walls} cabinets={cabinets} room={room}
            selectedId={null} onSelectCabinet={NOOP} onCabContextMenu={NOOP}
            resolvedParts={resolvedParts}
            materialColours={materialColours} ebByMatId={ebByMatId}
            hiddenWallIds={hidden}
            hiddenCabinetIds={hiddenCabs}
            birdsEyeSignal={0} resetSignal={0}
            layers={layers}
            bt={bt && { ...bt, selectedId: null, onSelect: NOOP }}
            fx={{ fixtures, selectedId: null, onSelect: NOOP }}
            pickBenchtops={false} measuring={false} wire={false}
          />
          <RenderDriver key={shot.id} shot={shot} onDone={url => onCaptured(shot.id, url)} />
        </Suspense>
      </Canvas>
    </div>
  )
}

/** A captured shot as black vector lines, fitted (centred) into a w × h paper-mm box. */
export function Shot3DSVG({ shot, width, height }: { shot: HiddenLineResult; width: number; height: number }) {
  const { d, vb, sw } = useMemo(() => {
    const s = shot.segs
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (let k = 0; k < s.length; k += 2) {
      x0 = Math.min(x0, s[k]); x1 = Math.max(x1, s[k])
      y0 = Math.min(y0, s[k + 1]); y1 = Math.max(y1, s[k + 1])
    }
    if (!Number.isFinite(x0)) return { d: '', vb: [0, 0, width, height], sw: 0 }
    // Pad, then widen the short side so the viewBox matches the box's aspect.
    const pad = Math.max(x1 - x0, y1 - y0) * 0.03
    let w = x1 - x0 + pad * 2, h = y1 - y0 + pad * 2
    let vx = x0 - pad, vy = y0 - pad
    if (w / h > width / height) { const nh = w * height / width; vy -= (nh - h) / 2; h = nh }
    else { const nw = h * width / height; vx -= (nw - w) / 2; w = nw }
    const r = (n: number) => Math.round(n * 10) / 10
    let path = ''
    for (let k = 0; k < s.length; k += 4) path += `M${r(s[k])} ${r(s[k + 1])}L${r(s[k + 2])} ${r(s[k + 3])}`
    // Pen width is paper mm → viewBox units at this fit.
    return { d: path, vb: [vx, vy, w, h], sw: PEN.front * (w / width) }
  }, [shot, width, height])
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={vb.join(' ')} width={`${width}mm`} height={`${height}mm`}
      preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 'auto', display: 'block' }}>
      <path d={d} fill="none" stroke={PRINT_INK} strokeWidth={sw} strokeLinecap="round" />
    </svg>
  )
}
