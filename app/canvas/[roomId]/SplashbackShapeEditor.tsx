'use client'

// ============================================================
// Splashback Shape Editor overlay (z_splashback S2).
// The outline lives in the wall ELEVATION frame (x along the
// wall as seen, y = height UP). The shared ShapeEditor is
// y-down, so points go in as (x − ox, top − y) — a reflection,
// so mapSegments(mirror) keeps the winding — and come back the
// same way. The wall, cabinets, benchtops and openings on this
// wall side are reference outlines.
// ============================================================

import { useMemo, useRef } from 'react'
import ShapeEditor, { type ShapeEditorHandle, type ShapeEditorSegment } from '@/src/components/ShapeEditor/ShapeEditor'
import type { BenchtopSegment, SplashbackInstance } from '@/src/lib/types'
import { mapSegments } from '@/src/lib/benchtopGeometry'
import { rectSegments, sbBounds, sbOpenings, type SbRect } from '@/src/lib/splashbackGeometry'
import type { CabinetInstance, BenchtopInstance, Room, RoomFixture, Wall } from '@/src/lib/types'
import { cabBottomZ, cabT, cabWallSide, centroid } from '@/src/lib/geometry'
import { btElevBands, type BtElevInfo } from './BenchtopElevation'

/** Ghost outlines for the editor, in the splashback's elevation frame. */
export interface SbRefInput {
  walls: Wall[]; cabinets: CabinetInstance[]; room: Room; benchtops: BenchtopInstance[]
  btInfo: (b: BenchtopInstance) => BtElevInfo; fixtures: RoomFixture[]
}

function splashbackRefs(sb: SplashbackInstance, a: SbRefInput): { label: string; rect: SbRect }[] {
  const wall = a.walls.find(w => w.id === sb.wall_id)
  if (!wall) return []
  const side = sb.wall_side
  const rc = centroid(a.walls)
  const roomH = wall.height ?? a.room.room_dy ?? 2400
  const out: { label: string; rect: SbRect }[] = [{ label: 'Wall', rect: { x0: 0, x1: wall.length, z0: 0, z1: roomH } }]
  for (const c of a.cabinets) {
    if (c.wall_id !== wall.id || cabWallSide(c, wall) !== side) continue
    const t = cabT(c, wall)
    const x0 = side === 'back' ? wall.length - t - c.dx : t
    const z0 = cabBottomZ(c, a.room, wall)
    out.push({ label: c.label ?? '', rect: { x0, x1: x0 + c.dx, z0, z1: z0 + c.dy } })
  }
  for (const bn of btElevBands(a.benchtops, a.walls, wall, side, rc, roomH, a.btInfo)) {
    out.push({ label: 'Benchtop', rect: { x0: bn.t0, x1: bn.t1, z0: roomH - bn.yBot, z1: roomH - bn.yTop } })
  }
  for (const o of sbOpenings(a.fixtures, wall, side, rc)) out.push({ label: 'Opening', rect: o })
  return out
}

export default function SplashbackShapeEditor({ sb, refInput, onSave, onClose }: {
  sb: SplashbackInstance
  /** The room, for ghost outlines (wall, cabinets, benchtops, openings) in the elevation frame. */
  refInput: SbRefInput
  onSave: (segs: BenchtopSegment[]) => void
  onClose: () => void
}) {
  const ref = useRef<ShapeEditorHandle>(null)
  // Taken once when the editor opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refs = useMemo(() => splashbackRefs(sb, refInput), [sb.id])

  const { local, w, h, back, refOutlines } = useMemo(() => {
    const b = sbBounds(sb.segments) ?? { x0: 0, x1: 600, z0: 0, z1: 600 }
    const all = [b, ...refs.map(r => r.rect)]
    const ox = Math.floor(Math.min(...all.map(r => r.x0)))
    const top = Math.ceil(Math.max(...all.map(r => r.z1)))
    const bottom = Math.floor(Math.min(...all.map(r => r.z0)))
    const xMax = Math.ceil(Math.max(...all.map(r => r.x1)))
    const toEd = (p: { x: number; y: number }) => ({ x: p.x - ox, y: top - p.y })
    const fromEd = (p: { x: number; y: number }) => ({ x: p.x + ox, y: top - p.y })
    return {
      local: mapSegments(sb.segments, toEd, true) as ShapeEditorSegment[],
      w: xMax - ox, h: top - bottom,
      back: (segs: BenchtopSegment[]) => mapSegments(segs, fromEd, true),
      refOutlines: refs.map(r => ({ label: r.label, segments: mapSegments(rectSegments(r.rect), toEd, true) as ShapeEditorSegment[] })),
    }
  }, [sb.segments, refs])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 bg-gray-900">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-200 truncate">Splashback shape — {sb.label ?? 'Splashback'}</p>
          <p className="text-[10px] text-gray-500">
            Seen as in elevation · dashed grey outlines are the wall, cabinets, benchtops and windows on this wall
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => ref.current?.requestExit()}
            className="px-3 py-1.5 rounded text-xs bg-gray-800 hover:bg-gray-700 text-gray-300">
            Cancel
          </button>
          <button onClick={() => ref.current?.requestSave()}
            className="px-3 py-1.5 rounded text-xs font-medium bg-sky-700 hover:bg-sky-600 text-white">
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
          partLabel={sb.label ?? 'Splashback'}
          initialSegments={local}
          referenceOutlines={refOutlines}
          onSave={segs => { onSave(back(segs as BenchtopSegment[])); onClose() }}
          onCancel={onClose}
        />
      </div>
    </div>
  )
}
