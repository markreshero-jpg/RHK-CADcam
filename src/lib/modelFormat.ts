// Upload helpers for 3D model files (no three.js imports — safe in server-rendered
// client components). Loader side: src/components/three/ModelAsset.tsx.

export type ModelFormat = 'glb' | 'stl' | 'obj'

/** Format from a file name; null when unsupported. */
export function modelFormatFromName(name: string): ModelFormat | null {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'glb' || ext === 'gltf') return 'glb'
  if (ext === 'stl') return 'stl'
  if (ext === 'obj') return 'obj'
  return null
}

export const MODEL_ACCEPT = '.glb,.gltf,.stl,.obj'
