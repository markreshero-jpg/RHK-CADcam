'use client'

// Loads + traces the true top / front / side outlines of the fixtures linked to
// a cabinet (fixtureViewShapes.ts) for the edit modal's ortho views. three and
// the loaders are imported on demand; models load once per url, traces are
// cached per fit + size + turn. Entries appear as they resolve — the overlay
// draws the box until then (or for good when a model fails / there is none).

import { useEffect, useState } from 'react'
import type { LocalFixtureBox } from './cabinetContents'
import type { FixtureViewShapes } from './fixtureViewShapes'

const modelCache = new Map<string, Promise<import('three').Object3D>>()
const traceCache = new Map<string, Promise<FixtureViewShapes | null>>()

/** Trace key: everything that changes the outline. Null = nothing to trace. */
export function fixtureTraceKey(b: LocalFixtureBox): string | null {
  const f = b.f
  if (!f.model_url || !f.model_format) return null
  return JSON.stringify([f.model_format, f.model_url, f.width, f.depth, f.height, f.model_scale,
    f.model_rot_x, f.model_rot_y, f.model_off_x, f.model_off_y, f.model_off_z, !!f.resizable, f.stretch ?? null,
    b.w, b.h, b.d, b.yaw])
}

async function trace(b: LocalFixtureBox): Promise<FixtureViewShapes | null> {
  const f = b.f
  const [{ loadModel }, { sizedTriangles, viewShapesFromTriangles }] = await Promise.all([
    import('./fixturePlanShapeLoad'), import('./fixtureViewShapes'),
  ])
  const mk = `${f.model_format}:${f.model_url}`
  let model = modelCache.get(mk)
  if (!model) { model = loadModel(f.model_url!, f.model_format!); modelCache.set(mk, model) }
  const tris = sizedTriangles(await model, f)
  return tris.length ? viewShapesFromTriangles(tris, f, b) : null
}

export function useFixtureViewShapes(fixtures: LocalFixtureBox[]): Map<string, FixtureViewShapes> {
  const [map, setMap] = useState<Map<string, FixtureViewShapes>>(() => new Map())
  const jobs = fixtures.map(b => [b, fixtureTraceKey(b)] as const).filter(j => j[1]) as [LocalFixtureBox, string][]
  const sig = Array.from(new Set(jobs.map(j => j[1]))).sort().join('\n')

  useEffect(() => {
    if (!sig) { setMap(new Map()); return }
    let cancelled = false
    Promise.all(jobs.map(async ([b, key]) => {
      let p = traceCache.get(key)
      if (!p) {
        p = trace(b).catch(e => { console.error('fixture outline trace failed', b.f.model_url, e); return null })
        traceCache.set(key, p)
      }
      return [key, await p] as const
    })).then(entries => {
      if (cancelled) return
      const next = new Map<string, FixtureViewShapes>()
      for (const [k, s] of entries) if (s) next.set(k, s)
      setMap(next)
    })
    return () => { cancelled = true }
  }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps

  return map
}
