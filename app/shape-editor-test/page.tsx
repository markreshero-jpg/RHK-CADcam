'use client'

// ============================================================
// ⚠ WIP — TO BE FINISHED OR DELETED (paused 2026-05-28)
// Smoke-test page for the ShapeEditor port. The 'room-outline'
// mode toggle here is plan-view-specific (see wallPolyline.ts).
// The page itself is useful for testing the editor in isolation;
// keep it (drop the mode toggle) or delete it when the elevation
// shape-editor work has its own mounting point.
// ============================================================

import { useState } from 'react'
import ShapeEditor from '@/src/components/ShapeEditor/ShapeEditor'

export default function ShapeEditorTestPage() {
  const [latestSegs, setLatestSegs] = useState<unknown[]>([])
  const [mode, setMode] = useState<'free' | 'room-outline'>('free')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #ccc', display: 'flex', gap: 16, alignItems: 'center', fontSize: 13 }}>
        <strong>ShapeEditor smoke test</strong>
        <label>
          <input type="radio" checked={mode === 'free'} onChange={() => setMode('free')} /> free
        </label>
        <label>
          <input type="radio" checked={mode === 'room-outline'} onChange={() => setMode('room-outline')} /> room-outline
        </label>
        <span style={{ color: '#666' }}>{latestSegs.length} segments</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ShapeEditor mode={mode} onShapeChange={(segs: unknown[]) => setLatestSegs(segs)} />
      </div>
    </div>
  )
}
