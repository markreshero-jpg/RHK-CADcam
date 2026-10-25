'use client'
// Loads a fixture's model file and traces its plan shape (z_fixtures P8) — the
// browser side of fixturePlanShape.ts. Used by the library editor after an
// upload / fit change. Same loaders and fit as FixtureModel, outside any Canvas.
// P11: also reads the GLB's stretch spec; a model with one is traced at its
// nominal size (what fixtureStretch maps the shapes out from).

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import type { FixtureBody } from './types'
import { fittedTriangles, planShapeFromTriangles, elevShapeFromTriangles, type PlanShape } from './fixturePlanShape'
import { readStretchSpec, activeStretch, nominalBox, type StretchSpec } from './fixtureStretch'

export async function loadModel(url: string, format: 'glb' | 'stl' | 'obj'): Promise<THREE.Object3D> {
  if (format === 'glb') return (await new GLTFLoader().loadAsync(url)).scene
  if (format === 'stl') return new THREE.Mesh(await new STLLoader().loadAsync(url))
  return new OBJLoader().loadAsync(url)
}

/** Plan (top) + elevation (front) shapes + stretch spec; all null when the item has no model. */
export async function traceShapes(f: Pick<FixtureBody,
  'model_url' | 'model_format' | 'width' | 'depth' | 'height' | 'model_scale' | 'model_rot_x' | 'model_rot_y' | 'model_off_x' | 'model_off_y' | 'model_off_z'>,
): Promise<{ plan_shape: PlanShape | null; elev_shape: PlanShape | null; stretch: StretchSpec | null }> {
  if (!f.model_url || !f.model_format) return { plan_shape: null, elev_shape: null, stretch: null }
  const obj = await loadModel(f.model_url, f.model_format)
  const stretch = readStretchSpec(obj.userData?.stretch)
  // A stretchable model is traced at its nominal size (shapes are mapped out from it).
  const spec = activeStretch({ ...f, resizable: true, stretch })
  const size = spec ? { ...f, ...nominalBox(f, spec) } : f
  const tris = fittedTriangles(obj, size)
  // Finer grid for small items so sink drains / burners / knobs keep their shape.
  const cellPlan = Math.max(2, Math.min(6, Math.max(size.width, size.depth) / 200))
  const cellElev = Math.max(2, Math.min(6, Math.max(size.width, size.height) / 200))
  return {
    plan_shape: planShapeFromTriangles(tris, size.width, size.depth, cellPlan),
    elev_shape: elevShapeFromTriangles(tris, size.width, size.height, cellElev),
    stretch,
  }
}
