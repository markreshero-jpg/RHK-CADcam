'use client'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { AssemblyClass } from '@/src/lib/types'
import { DEFAULT_DIMS } from '@/src/lib/types'

const BODY_HEX: Record<AssemblyClass, number> = {
  base:        0x3B82F6,
  wall:        0x10B981,
  tall:        0x8B5CF6,
  base_corner: 0x60A5FA,
  wall_corner: 0x34D399,
  tall_corner: 0xA78BFA,
}

const DOOR_HEX: Record<AssemblyClass, number> = {
  base:        0x93C5FD,
  wall:        0x6EE7B7,
  tall:        0xC4B5FD,
  base_corner: 0xBFDBFE,
  wall_corner: 0xA7F3D0,
  tall_corner: 0xDDD6FE,
}

interface Props {
  assemblyClass: AssemblyClass
  isEndPanel?: boolean
  label: string
  canvasWidth: number
  toeType?: 'ladder' | 'leg' | 'none'
  topType?: 'full_top' | 'front_rail' | 'double_rail' | 'none'
  showFace?: boolean
}

export default function CabinetPreview3D({ assemblyClass, isEndPanel, label, canvasWidth, toeType, topType, showFace = true }: Props) {
  const mountRef   = useRef<HTMLDivElement>(null)
  const pivotRef   = useRef<THREE.Group | null>(null)
  const renderRef  = useRef<(() => void) | null>(null)
  const isDragging = useRef(false)
  const lastPos    = useRef({ x: 0, y: 0 })

  const dims = DEFAULT_DIMS[assemblyClass] ?? DEFAULT_DIMS.base
  const W = Math.max(80, canvasWidth)
  const H = Math.round(W * 0.85)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)

    const scene  = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, W / H, 1, 100000)

    const { dx, dy, dz } = dims
    const maxDim = Math.max(dx, dy, dz)
    const s  = 700 / maxDim
    const nw = isEndPanel ? 18 * s : dx * s
    const nh = dy * s
    const nd = dz * s

    camera.position.set(nw * 1.7 + 100, nh * 0.55, nd * 2.1 + 100)
    camera.lookAt(0, 0, 0)

    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const key = new THREE.DirectionalLight(0xfff8f0, 1.15)
    key.position.set(1.5, 2, 1)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xd0e8ff, 0.38)
    fill.position.set(-1, 0.5, -1)
    scene.add(fill)

    const pivot   = new THREE.Group()
    const bodyMat = new THREE.MeshPhongMaterial({ color: BODY_HEX[assemblyClass], shininess: 20 })
    const doorMat = new THREE.MeshPhongMaterial({ color: DOOR_HEX[assemblyClass], shininess: 90, specular: 0x555555 })
    const tkMat   = new THREE.MeshPhongMaterial({ color: 0x1c1c1c, shininess: 5 })
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xf97316, opacity: 0.65, transparent: true })
    scene.add(pivot)

    function box(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) {
      const geo  = new THREE.BoxGeometry(w, h, d)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(x, y, z)
      pivot.add(mesh)
      const eLine = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat)
      eLine.position.set(x, y, z)
      pivot.add(eLine)
    }

    const isCorner = assemblyClass.includes('corner')

    if (isEndPanel) {
      box(nw, nh, nd, 0, 0, 0, bodyMat)
    } else if (isCorner) {
      box(nw,       nh, nd * 0.5,   0,          0, -nd * 0.25, bodyMat)
      box(nw * 0.5, nh, nd * 0.5,  -nw * 0.25,  0,  nd * 0.25, bodyMat)
      if (showFace) box(nw * 0.44, nh * 0.84, 5,  nw * 0.12,  0,  2.5, doorMat)
    } else if (assemblyClass === 'tall') {
      box(nw, nh, nd, 0, 0, 0, bodyMat)
      if (showFace) {
        const dw = nw * 0.46, dh = nh * 0.44
        box(dw, dh, 5, -nw / 4,  nh * 0.275, nd / 2 + 2.5, doorMat)
        box(dw, dh, 5,  nw / 4,  nh * 0.275, nd / 2 + 2.5, doorMat)
        box(dw, dh, 5, -nw / 4, -nh * 0.275, nd / 2 + 2.5, doorMat)
        box(dw, dh, 5,  nw / 4, -nh * 0.275, nd / 2 + 2.5, doorMat)
      }
    } else {
      box(nw, nh, nd, 0, 0, 0, bodyMat)
      if (showFace) {
        const dw = nw * 0.46, dh = nh * 0.84
        box(dw, dh, 5, -nw / 4, 0, nd / 2 + 2.5, doorMat)
        box(dw, dh, 5,  nw / 4, 0, nd / 2 + 2.5, doorMat)
      }
    }

    const hasToe = (assemblyClass === 'base' || assemblyClass === 'base_corner' || assemblyClass === 'tall' || assemblyClass === 'tall_corner')
      && toeType !== 'none'
    if (hasToe) {
      const tkH = nh * 0.165
      const tkD = nd * 0.12
      box(isCorner ? nw : nw * 0.98, tkH, tkD, 0, -(nh / 2 - tkH / 2), nd / 2 - tkD / 2, tkMat)
    }

    // Top rail hint for front_rail / double_rail
    if (topType === 'front_rail' || topType === 'double_rail') {
      const railH = nh * 0.055
      const railD = nd * 0.18
      box(nw, railH, railD, 0, nh / 2 - railH / 2, nd / 2 - railD / 2, tkMat)
      if (topType === 'double_rail') {
        box(nw, railH, railD, 0, nh / 2 - railH / 2, -nd / 2 + railD / 2, tkMat)
      }
    }

    pivot.rotation.y = -Math.PI / 5

    pivotRef.current  = pivot
    renderRef.current = () => renderer.render(scene, camera)
    renderer.render(scene, camera)

    return () => {
      pivotRef.current  = null
      renderRef.current = null
      pivot.traverse(obj => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose()
          const m = obj.material
          if (Array.isArray(m)) m.forEach((x: THREE.Material) => x.dispose())
          else (m as THREE.Material).dispose()
        }
      })
      renderer.dispose()
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
    }
  }, [assemblyClass, isEndPanel, W, H, dims, toeType, topType, showFace])

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    isDragging.current = true
    lastPos.current    = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging.current || !pivotRef.current || !renderRef.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    pivotRef.current.rotation.y += dx * 0.013
    pivotRef.current.rotation.x  = Math.max(
      -Math.PI / 3,
      Math.min(Math.PI / 3, pivotRef.current.rotation.x + dy * 0.013),
    )
    lastPos.current = { x: e.clientX, y: e.clientY }
    renderRef.current()
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    isDragging.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const { dx, dy, dz } = dims
  const dispDx = isEndPanel ? 18 : dx

  return (
    <div className="rounded-lg bg-gray-950 border border-gray-800 hover:border-orange-500 overflow-hidden select-none transition-colors">
      <div
        ref={mountRef}
        style={{ width: W, height: H, cursor: isDragging.current ? 'grabbing' : 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      <div className="px-2 pb-2 pt-1.5 border-t border-gray-800">
        <div className="text-[11px] font-semibold text-white/80 truncate">{label}</div>
        <div className="text-[10px] text-gray-500 mt-0.5 font-mono">
          {dispDx} × {dy} × {dz} mm
        </div>
      </div>
    </div>
  )
}
