'use client'
// Cross section, fixtures + hardware (z_section_view X4). Hinges, handles,
// runners and bins are drawn in 3D by many small components (GLB models,
// parametric runners, door / drawer groups), and fixtures are uploaded models —
// so instead of rebuilding them, this mounts the room 3D's own CabinetMesh and
// fixture models in a tiny hidden canvas that never renders a frame, then reads
// the meshes back as world-space triangles for the slicer.
//
// Tags: CabinetScene's hardware groups carry userData.partId (PickableHardware /
// Part); each cabinet / fixture here is wrapped in a group carrying its id.
// Board parts aren't collected — the section already slices them as solids.

import { Suspense, useEffect } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import type { Wall, CabinetInstance, Room, RoomFixture } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import type { LayerView } from '@/src/lib/displayLayers/resolve'
import type { RoomRef } from '@/src/lib/geometry'
import { fixtureLayer } from '@/src/lib/fixtureGeometry'
import { FixtureModel } from '@/src/components/three/FixtureModel'
import { OpeningModel } from './Fixtures3D'
import { CabinetMesh } from './Room3DScene'
import type { PartPosOverrides, ShapeOverrides } from './canvasDB'

export interface SectionMesh {
  /** Stable key: cabinet + part id, or fixture id. */
  id: string
  cabId?: string
  fixtureId?: string
  /** Display-layer item (hinges / handles / drawer_runners / … / fixture_*). */
  item: string
  /** World triangles, 9 floats each ([plan x, height, plan y]). */
  tris: Float32Array
}

/** Hardware part id → layer item (board parts → null, they're sliced as solids). */
function hardwareItem(partId: string): string | null {
  if (partId.startsWith('hw_hinge_')) return 'hinges'
  if (partId.startsWith('hw_handle_')) return 'handles'
  if (partId.startsWith('hw_bin_')) return 'bins'
  if (partId.startsWith('int_slide_')) return 'inner_drawer_runners'
  if (partId.startsWith('slide_')) return 'drawer_runners'
  return null
}

const NOOP = () => {}
const _m = new THREE.Matrix4(), _v = new THREE.Vector3()

/** Reads the tagged meshes out of the scene; re-reads while models load. */
function Collect({ onMeshes }: { onMeshes: (m: SectionMesh[]) => void }) {
  const scene = useThree(s => s.scene)
  useEffect(() => {
    let sig = ''
    const read = () => {
      scene.updateMatrixWorld(true)
      const groups = new Map<string, { cabId?: string; fixtureId?: string; item: string; meshes: THREE.Mesh[] }>()
      scene.traverseVisible(o => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh || !mesh.geometry?.getAttribute('position')) return
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        if (mats.every(m => !m || m.visible === false || (m.transparent && m.opacity === 0))) return
        // Nearest tags up the tree.
        let partId: string | undefined, cabId: string | undefined, fixtureId: string | undefined, fxItem: string | undefined
        for (let p: THREE.Object3D | null = mesh; p; p = p.parent) {
          const u = p.userData
          if (partId === undefined && typeof u.partId === 'string') partId = u.partId
          if (u.xsecCab) { cabId = u.xsecCab; break }
          if (u.xsecFixture) { fixtureId = u.xsecFixture; fxItem = u.xsecItem; break }
        }
        let id: string, item: string | null
        if (fixtureId) { id = `fx:${fixtureId}`; item = fxItem ?? null }
        else if (cabId && partId) { id = `${cabId}:${partId}`; item = hardwareItem(partId) }
        else return
        if (!item) return
        const g = groups.get(id)
        if (g) g.meshes.push(mesh)
        else groups.set(id, { cabId, fixtureId, item, meshes: [mesh] })
      })
      // Only rebuild when something changed (a model finished loading, a part moved).
      const nextSig = [...groups.entries()].map(([id, g]) =>
        id + g.meshes.map(m => m.geometry.uuid + m.matrixWorld.elements.map(e => e.toFixed(2)).join(',')).join(';')).join('|')
      if (nextSig === sig) return
      sig = nextSig
      const out: SectionMesh[] = []
      for (const [id, g] of groups) {
        const parts: Float32Array[] = []
        for (const mesh of g.meshes) {
          const pos = mesh.geometry.getAttribute('position')
          const idx = mesh.geometry.getIndex()
          const n = idx ? idx.count : pos.count
          const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? mesh as THREE.InstancedMesh : null
          const count = inst ? inst.count : 1
          for (let c = 0; c < count; c++) {
            if (inst) { inst.getMatrixAt(c, _m); _m.premultiply(mesh.matrixWorld) } else _m.copy(mesh.matrixWorld)
            const arr = new Float32Array(Math.floor(n / 3) * 9)
            for (let i = 0; i < arr.length / 3; i++) {
              const vi = idx ? idx.getX(i) : i
              _v.fromBufferAttribute(pos, vi).applyMatrix4(_m)
              arr[i * 3] = _v.x; arr[i * 3 + 1] = _v.y; arr[i * 3 + 2] = _v.z
            }
            parts.push(arr)
          }
        }
        const tris = new Float32Array(parts.reduce((s, a) => s + a.length, 0))
        let off = 0
        for (const a of parts) { tris.set(a, off); off += a.length }
        out.push({ id, cabId: g.cabId, fixtureId: g.fixtureId, item: g.item, tris })
      }
      onMeshes(out)
    }
    read()
    const t = setInterval(read, 600)
    return () => clearInterval(t)
  }, [scene, onMeshes])
  return null
}

export default function CrossSectionMeshes({ walls, cabinets, room, rc, resolvedParts, details, layers, fixtures, onMeshes }: {
  walls: Wall[]
  cabinets: CabinetInstance[]
  room: Room
  rc: RoomRef
  resolvedParts: Map<string, ResolvedCabinet>
  details: { posById: Map<string, PartPosOverrides>; shapesById: Map<string, ShapeOverrides> } | null
  layers: LayerView
  fixtures: RoomFixture[]
  onMeshes: (m: SectionMesh[]) => void
}) {
  const anyHardware = layers.any('hinges', 'handles', 'bins', 'drawer_runners', 'inner_drawer_runners')
  return (
    // R3F only mounts the scene once its box has a size — 2 px, off-screen.
    <div aria-hidden style={{ position: 'fixed', left: -10, top: -10, width: 2, height: 2, opacity: 0, pointerEvents: 'none' }}>
      <Canvas frameloop="never" dpr={1} gl={{ antialias: false, powerPreference: 'low-power' }}>
        {anyHardware && cabinets.map(cab => {
          const wall = walls.find(w => w.id === cab.wall_id)
          const rp = resolvedParts.get(cab.id)
          if (!wall || !rp) return null
          return (
            <group key={cab.id} userData={{ xsecCab: cab.id }}>
              <CabinetMesh cab={cab} wall={wall} rc={rc} room={room} selected={false} onSelect={NOOP} onContextMenu={NOOP}
                rp={rp} layers={layers} partOverrides={details?.posById.get(cab.id)} shapeOverrides={details?.shapesById.get(cab.id)} wire={false} />
            </group>
          )
        })}
        {fixtures.map(f => {
          const item = fixtureLayer(f.category, f.kind)
          if (!layers.show(item)) return null
          return (
            <group key={f.id} userData={{ xsecFixture: f.id, xsecItem: item }}
              position={[f.x, f.z, f.y]} rotation={[0, -f.rotation * Math.PI / 180, 0]}>
              <Suspense fallback={null}>
                {f.category === 'opening' && !f.model_url ? <OpeningModel f={f} colour={null} /> : <FixtureModel f={f} />}
              </Suspense>
            </group>
          )
        })}
        <Collect onMeshes={onMeshes} />
      </Canvas>
    </div>
  )
}
