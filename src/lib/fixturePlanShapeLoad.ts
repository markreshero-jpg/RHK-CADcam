'use client'
// Loads a fixture's model file and traces its plan shape (z_fixtures P8) — the
// browser side of fixturePlanShape.ts. Used by the library editor after an
// upload / fit change. Same loaders and fit as FixtureModel, outside any Canvas.

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import type { FixtureBody } from './types'
import { fittedTriangles, planShapeFromTriangles, type PlanShape } from './fixturePlanShape'

async function loadModel(url: string, format: 'glb' | 'stl' | 'obj'): Promise<THREE.Object3D> {
  if (format === 'glb') return (await new GLTFLoader().loadAsync(url)).scene
  if (format === 'stl') return new THREE.Mesh(await new STLLoader().loadAsync(url))
  return new OBJLoader().loadAsync(url)
}

/** Null when the item has no model (or it fails to load). */
export async function tracePlanShape(f: Pick<FixtureBody,
  'model_url' | 'model_format' | 'width' | 'depth' | 'height' | 'model_scale' | 'model_rot_x' | 'model_rot_y' | 'model_off_x' | 'model_off_y' | 'model_off_z'>,
): Promise<PlanShape | null> {
  if (!f.model_url || !f.model_format) return null
  const obj = await loadModel(f.model_url, f.model_format)
  const tris = fittedTriangles(obj, f)
  // Finer grid for small items so sink drains / burners keep their shape.
  const cell = Math.max(2, Math.min(6, Math.max(f.width, f.depth) / 200))
  return planShapeFromTriangles(tris, f.width, f.depth, cell)
}
