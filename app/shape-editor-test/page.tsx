'use client'

// ============================================================
// Smoke-test page for the ShapeEditor (part-profile editor).
// Mounts the component in isolation — replaces the missing
// cad-editor.html harness from the z_part_shape_editor handoff.
//
// 2026-07-22: the old 'room-outline' mode toggle was dropped —
// ShapeEditor.jsx is now the Part Editor handoff version, which
// has no `mode` prop. The old wall-outline variant (plan-view
// WIP, paused 2026-05-28) lives in git history at this path and
// in z_CAD_tool/ if the elevation work ever revives it.
// ============================================================

import { useState } from 'react'
import dynamic from 'next/dynamic'

// Since M7 the editor is container-sized and SSR-safe (no module-scope window
// reads) — dynamic() kept only to skip SSR work for a dev-only harness page.
const ShapeEditor = dynamic(() => import('@/src/components/ShapeEditor/ShapeEditor'), { ssr: false })

export default function ShapeEditorTestPage() {
  const [latestSegs, setLatestSegs] = useState<unknown[]>([])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #ccc', display: 'flex', gap: 16, alignItems: 'center', fontSize: 13 }}>
        <strong>ShapeEditor smoke test</strong>
        <span style={{ color: '#666' }}>{latestSegs.length} segments</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ShapeEditor
          partWidth={600}
          partHeight={720}
          partLabel="Left Gable (smoke test)"
          onShapeChange={segs => setLatestSegs(segs)}
          onSave={(segs, meta) => console.log('[smoke test save]', segs, meta)}
        />
      </div>
    </div>
  )
}
