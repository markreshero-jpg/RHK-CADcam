'use client'

// ============================================================
// Benchtop Shape Editor overlay (benchtop Phase 3).
// Full-screen host for the shared ShapeEditor: double-click a
// benchtop on the plan (or "Edit shape" in the panel) to open.
//
// FRAME: benchtop segments live in the ROOM frame (plan mm,
// y-down). The editor works part-relative, so we shift by the
// rounded bbox min of the outline + its reference outlines on
// the way in and add it back on save — translation only, no
// flip. Walls, cabinets and the
// other benchtops come in as reference outlines in the same
// shifted frame. boundsCheck is off: a benchtop can grow in any
// direction. Edges are authored here via edgeOptions
// ({ wall, profile_id }) — spec z_benchtop_builder P-a / P-d.
// ============================================================

import { useMemo, useRef } from 'react'
import ShapeEditor, { type ShapeEditorHandle, type ShapeEditorSegment } from '@/src/components/ShapeEditor/ShapeEditor'
import type { BenchtopInstance, BenchtopSegment, BenchtopEdgeProfile, Wall, CabinetInstance } from '@/src/lib/types'
import { btSegments, outlineBounds, mapSegments, translateFn, edgeProfileColor, type P } from '@/src/lib/benchtopGeometry'
import { centroid, wallMitreCorners, wallEnd } from '@/src/lib/geometry'
import { cabinetCorners } from '@/src/lib/canvasSnap'

// Reference geometry further than this from the benchtop is left out (clutter).
const REF_MARGIN = 1500

const loop = (pts: P[]): BenchtopSegment[] =>
  pts.map((p, i) => ({ type: 'line' as const, p0: p, p1: pts[(i + 1) % pts.length] }))

export default function BenchtopShapeEditor({
  benchtop, benchtops, walls, cabinets, profiles, defaultProfileId, defaultLabel, onSave, onClose, isNew = false,
}: {
  benchtop: BenchtopInstance
  benchtops: BenchtopInstance[]
  walls: Wall[]
  cabinets: CabinetInstance[]
  profiles: BenchtopEdgeProfile[]
  defaultProfileId: string | null
  defaultLabel: string
  onSave: (segs: BenchtopSegment[]) => void | Promise<void>
  onClose: () => void
  /** A draft (F4 → Draw in Shape Editor): show the whole room as reference. */
  isNew?: boolean
}) {
  const ref = useRef<ShapeEditorHandle>(null)

  const { origin, local, w, h, refs } = useMemo(() => {
    const segs = btSegments(benchtop)
    const b = outlineBounds(segs) ?? { minX: 0, minY: 0, maxX: 600, maxY: 600 }

    // Reference outlines, room frame. Near = any point inside the benchtop
    // bbox grown by REF_MARGIN.
    const margin = isNew ? Infinity : REF_MARGIN
    const near = (pts: P[]) => pts.some(p =>
      p.x > b.minX - margin && p.x < b.maxX + margin && p.y > b.minY - margin && p.y < b.maxY + margin)
    const roomRefs: { label: string; segments: BenchtopSegment[] }[] = []
    const cx = centroid(walls)
    for (const wl of walls) {
      const pts = wl.wall_type === 'island'
        ? [{ x: wl.pos_x, y: wl.pos_y }, wallEnd(wl)]
        : wallMitreCorners(wl, walls, cx.x, cx.y)
      if (pts.length < 2 || !near(pts)) continue
      roomRefs.push({ label: 'Wall', segments: loop(pts) })
    }
    for (const cab of cabinets) {
      const wl = walls.find(x => x.id === cab.wall_id)
      if (!wl) continue
      const [bl, br, fl, fr] = cabinetCorners(cab, wl, cx)
      const pts = [bl, br, fr, fl]
      if (!near(pts)) continue
      roomRefs.push({ label: cab.label ?? '', segments: loop(pts) })
    }
    for (const other of benchtops) {
      if (other.id === benchtop.id) continue
      const os = btSegments(other)
      if (!os.length || !near(os.map(s => s.p0))) continue
      roomRefs.push({ label: other.label ?? 'Benchtop', segments: os })
    }

    // Editor frame = the union of the benchtop and its references, so the
    // opening view fits the walls and cabinets too (boundsCheck is off, so the
    // shape needn't start at 0,0).
    const all = [b, ...roomRefs.map(r => outlineBounds(r.segments)).filter(x => x != null)]
    const u = {
      minX: Math.min(...all.map(x => x.minX)), minY: Math.min(...all.map(x => x.minY)),
      maxX: Math.max(...all.map(x => x.maxX)), maxY: Math.max(...all.map(x => x.maxY)),
    }
    const origin = { x: Math.floor(u.minX), y: Math.floor(u.minY) }
    const toLocal = translateFn(-origin.x, -origin.y)
    return {
      origin,
      local: mapSegments(segs, toLocal) as ShapeEditorSegment[],
      w: Math.ceil(u.maxX - origin.x), h: Math.ceil(u.maxY - origin.y),
      refs: roomRefs.map(r => ({ label: r.label, segments: mapSegments(r.segments, toLocal) as ShapeEditorSegment[] })),
    }
  }, [benchtop, benchtops, walls, cabinets, isNew])

  const edgeOptions = useMemo(() => ({
    profiles: profiles.filter(p => p.active).map(p => ({
      id: p.id, code: p.code, name: p.name, category: p.category, color: edgeProfileColor(p),
    })),
    defaultProfileId,
    defaultLabel,
  }), [profiles, defaultProfileId, defaultLabel])

  function handleSave(segs: ShapeEditorSegment[]) {
    // Back to the room frame. The editor rounds to whole mm in its own frame;
    // origin is whole mm too, so stored points stay on the mm grid.
    void onSave(mapSegments(segs as BenchtopSegment[], translateFn(origin.x, origin.y)))
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 bg-gray-900">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-200 truncate">{isNew ? 'New benchtop' : 'Benchtop shape'} — {benchtop.label ?? 'Benchtop'}</p>
          <p className="text-[10px] text-gray-500">
            {isNew && 'Reshape the starting rectangle (drag vertices / lines, or Clear and draw your own) · '}
            Select an edge to set Wall / Exposed and its profile · dashed grey outlines are walls, cabinets and other benchtops
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => ref.current?.requestExit()}
            className="px-3 py-1.5 rounded text-xs bg-gray-800 hover:bg-gray-700 text-gray-300">
            Cancel
          </button>
          <button onClick={() => ref.current?.requestSave()}
            className="px-3 py-1.5 rounded text-xs font-medium bg-teal-700 hover:bg-teal-600 text-white">
            Save shape
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ShapeEditor
          ref={ref}
          hideChrome
          boundsCheck={false}
          partWidth={w}
          partHeight={h}
          partLabel={benchtop.label ?? 'Benchtop'}
          initialSegments={local}
          referenceOutlines={refs}
          edgeOptions={edgeOptions}
          onSave={handleSave}
          onCancel={onClose}
        />
      </div>
    </div>
  )
}
