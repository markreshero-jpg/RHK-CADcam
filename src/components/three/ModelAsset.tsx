'use client'

// ── ModelAsset ────────────────────────────────────────────────────────────────
// Shared loader for uploaded 3D models (GLB / STL / OBJ). Used by drawer slides
// (SlideModel) and fixtures (FixtureModel). Each format is its own component so
// React mounts the right loader hook; the loaded object is handed to `children`.
//
// GLB keeps its own materials (cloned per instance so layer alpha doesn't leak
// between instances). STL / OBJ get a single-colour standard material.
// Everything renders double-sided — mirrored instances (right-hand slide rails)
// invert winding, and bought-in models are often not closed meshes.
//
// Callers own the Suspense boundary (so each can choose its own fallback).

import { useMemo, useContext } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { useLoader } from '@react-three/fiber'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { PartAlphaContext, alphaMat } from './PartViewer'

import type { ModelFormat } from '@/src/lib/modelFormat'
export type { ModelFormat }

export interface ModelLook {
  color:      string
  metalness?: number
  roughness?: number
}

interface SourceProps {
  url:      string
  look:     ModelLook
  children: (obj: THREE.Object3D) => React.ReactNode
}

function applyDoubleSide(obj: THREE.Object3D) {
  obj.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    for (const mat of mats) {
      if (mat) (mat as THREE.Material).side = THREE.DoubleSide
    }
  })
}

function flatMaterial(look: ModelLook, alpha: number) {
  return new THREE.MeshStandardMaterial({
    color: look.color, metalness: look.metalness ?? 0.6, roughness: look.roughness ?? 0.4,
    side: THREE.DoubleSide, ...alphaMat(alpha),
  })
}

// Our 3D views have no environment map, so a fully metallic material (metalness
// 1 — what most manufacturer stainless exports use) has nothing to reflect and
// renders near-black. Capping it keeps a share of the base colour (Abi Zalo sink,
// Mark 2026-10-18: "very dark … mine be so much darker?").
const MAX_METALNESS = 0.8

function GlbSource({ url, children }: SourceProps) {
  const gltf = useGLTF(url)
  // The GLB's own materials are shared by every instance (and cached by useGLTF),
  // so clone them before changing anything.
  const alpha = useContext(PartAlphaContext)
  const cloned = useMemo(() => {
    const c = gltf.scene.clone(true)
    applyDoubleSide(c)
    c.traverse(o => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const mats = (Array.isArray(m.material) ? m.material : [m.material]).map(src => {
        const mat = (src as THREE.Material).clone()
        const std = mat as THREE.MeshStandardMaterial
        if (typeof std.metalness === 'number' && std.metalness > MAX_METALNESS) std.metalness = MAX_METALNESS
        if (alpha < 1) { mat.transparent = true; mat.opacity = alpha; mat.depthWrite = false }
        return mat
      })
      m.material = mats.length === 1 ? mats[0] : mats
    })
    return c
  }, [gltf.scene, alpha])
  return <>{children(cloned)}</>
}

function StlSource({ url, look, children }: SourceProps) {
  const geometry = useLoader(STLLoader, url)
  const alpha = useContext(PartAlphaContext)
  const obj = useMemo(
    () => new THREE.Mesh(geometry, flatMaterial(look, alpha)),
    [geometry, look.color, look.metalness, look.roughness, alpha], // eslint-disable-line react-hooks/exhaustive-deps
  )
  return <>{children(obj)}</>
}

function ObjSource({ url, look, children }: SourceProps) {
  const loaded = useLoader(OBJLoader, url)
  const alpha = useContext(PartAlphaContext)
  const obj = useMemo(() => {
    const g = loaded.clone(true)
    g.traverse(o => {
      const m = o as THREE.Mesh
      if (m.isMesh) m.material = flatMaterial(look, alpha)
    })
    return g
  }, [loaded, look.color, look.metalness, look.roughness, alpha]) // eslint-disable-line react-hooks/exhaustive-deps
  return <>{children(obj)}</>
}

const SOURCES: Record<ModelFormat, React.ComponentType<SourceProps>> = {
  glb: GlbSource,
  stl: StlSource,
  obj: ObjSource,
}

/** Loads `url` and renders `children(object)`. Must sit inside a Suspense boundary. */
export function ModelSource({ url, format, look, children }: {
  url: string; format: ModelFormat; look: ModelLook
  children: (obj: THREE.Object3D) => React.ReactNode
}) {
  const Source = SOURCES[format]
  return <Source url={url} look={look}>{children}</Source>
}

/** Warm the GLB cache for a URL (no-op for STL / OBJ). */
export function preloadModel(format: ModelFormat, url: string) {
  if (format === 'glb') useGLTF.preload(url)
}

