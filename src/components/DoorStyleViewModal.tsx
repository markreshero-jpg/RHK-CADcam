'use client'

// ============================================================
// DoorStyleViewModal — enlarged door preview using the PART
// EDITOR'S view layer (PreviewCanvas/Part 3D + PartOrthoView
// ortho SVGs), NOT a parallel renderer. The full Part Editor
// itself can't be reused here — it edits persisted CNC ops on a
// real cabinet part (usePartOps: DB load, joints, undo) while a
// door style is a parametric template with nothing persisted —
// so we mount just its read-only viewing pieces. Any future
// upgrade to those components shows up here automatically.
//
// The bridge: resolved profile primitives (inset frames, groove
// lines) are mapped to synthetic read-only PartOps ('route' area
// ops) — the exact shape the part-editor glyph/CSG layer eats.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { Part, PreviewCanvas, type PartMeta } from '@/src/components/three/PartViewer'
import PartOrthoView from '@/app/canvas/[roomId]/partEditor/PartOrthoView'
import { buildOpSubtractions } from '@/app/canvas/[roomId]/partEditor/partOpGlyphs'
import type { PartOp } from '@/app/canvas/[roomId]/CabinetRoutesPanel'
import { evaluateProfileOps, doorProfilePrimitives } from '@/src/lib/doorProfile'
import { fmtMm } from '@/src/lib/format'
import type { DoorStylePreviewProps } from './DoorStylePreview'

// Full synthetic PartOp for a routed strip: area op centred at (cx,cy), size
// dx×dy, cut `depth` into the front face. parameters.generated marks it locked
// so the glyph layer renders it in the generated (sky-blue) colour.
function stripOp(i: number, cx: number, cy: number, dx: number, dy: number, depth: number): PartOp {
  return {
    id: `doorpv_${i}`,
    source_table: 'preview', source_part_id: null, source_cabinet_id: null, source_part_key: null,
    operation_type: 'route', operation_action: null, operation_role: 'local',
    joint_type_id: null, operation_key: null,
    router_tool_id: null, drill_id: null, auto_tool: true, tool_set_id: null,
    depth, diameter: null, width: dy, length: dx,
    pos_x: cx, pos_y: cy, pos_z: null,
    size_dx: dx, size_dy: dy, size_dz: depth,
    angle_ax: 0, angle_ay: 0, angle_az: 0,
    repeat_count: null, repeat_spacing: null, repeat_axis: null,
    offset_top_mm: null, offset_bottom_mm: null, offset_left_mm: null, offset_right_mm: null,
    fill_strategy: null, raster_angle_deg: null, raster_stepover_pct: null,
    output_face: 'front', plane_kind: null, plane_edge_index: null,
    is_master: false, master_operation_id: null, slave_table: null, slave_part_id: null,
    output_to_cnc: false, sort_order: i,
    parameters: { generated: true },
    created_at: '', updated_at: '',
  }
}

// Resolved door-profile ops → synthetic PartOps. Frames become four strips
// centred on the routed path (so corners meet); repeated grooves one strip each.
export function doorOpsToPartOps(
  profileType: DoorStylePreviewProps['profileType'],
  ops: NonNullable<DoorStylePreviewProps['ops']>,
  W: number, H: number, thickness: number,
): PartOp[] {
  const resolved = evaluateProfileOps(ops, { w: W, h: H, thickness, toolDiameter: ops[0]?.tool_diameter_mm ?? 0 })
  const out: PartOp[] = []
  let i = 0
  for (const op of resolved) {
    const cw    = Math.max(op.width_mm ?? 8, 1)          // cutter width
    const depth = Math.max(op.depth_mm ?? 4, 0.5)
    const prims = doorProfilePrimitives({ profile_type: profileType ?? 'custom', ops: [op] }, { w: W, h: H, thickness })
    for (const r of prims.insetRects) {
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2
      out.push(stripOp(i++, cx, r.y,       r.w + cw, cw, depth))   // bottom rail
      out.push(stripOp(i++, cx, r.y + r.h, r.w + cw, cw, depth))   // top rail
      out.push(stripOp(i++, r.x,       cy, cw, r.h + cw, depth))   // left stile
      out.push(stripOp(i++, r.x + r.w, cy, cw, r.h + cw, depth))   // right stile
    }
    for (const l of prims.grooveLines) {
      const cx = (l.x1 + l.x2) / 2, cy = (l.y1 + l.y2) / 2
      out.push(stripOp(i++, cx, cy, Math.max(Math.abs(l.x2 - l.x1), cw), Math.max(Math.abs(l.y2 - l.y1), cw), depth))
    }
  }
  return out
}

type ViewMode = '3d' | 'top' | 'front' | 'side'

export default function DoorStyleViewModal({
  w: initialW = 450, h: initialH = 720, thickness = 18,
  profileType = null, ops = null, faceColour = null,
  caption = null, onClose,
}: DoorStylePreviewProps & { onClose: () => void }) {
  const [view, setView]           = useState<ViewMode>('3d')
  const [wire, setWire]           = useState(false)
  const [measuring, setMeasuring] = useState(false)
  // Editable sample size — profile formulas re-evaluate live, so the routing
  // adapts exactly as it would on a real door of that size.
  const [wStr, setWStr] = useState(String(initialW))
  const [hStr, setHStr] = useState(String(initialH))
  const clamp = (s: string, fallback: number, max: number) => {
    const x = parseFloat(s)
    return Number.isFinite(x) ? Math.max(50, Math.min(max, x)) : fallback
  }
  const w = clamp(wStr, initialW, 1500)
  const h = clamp(hStr, initialH, 3000)
  const dragRef = useRef(false)

  const partOps = useMemo(
    () => doorOpsToPartOps(profileType, ops ?? [], w, h, thickness),
    [profileType, ops, w, h, thickness],
  )
  // swap=false everywhere: the door is already display-framed (u = width across,
  // v = height up), unlike cabinet parts whose local DX can be their height.
  const subtractions = useMemo(
    () => buildOpSubtractions(partOps, w, h, thickness, false),
    [partOps, w, h, thickness],
  )

  const meta: PartMeta = {
    id: 'door_preview', label: caption ?? 'Door', w, h, d: thickness, thickness,
    edge: { top: false, bottom: false, left: false, right: false }, panelKind: 'face',
  }
  const face = faceColour || '#7b8494'

  // Escape closes (capture, so pickers/modals behind don't also react).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation(); e.preventDefault()
      if (measuring) { setMeasuring(false); return }
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, measuring])

  return (
    <div className="fixed inset-0 z-[70] bg-black/85 flex flex-col" onPointerDown={e => e.stopPropagation()}>
      {/* Header — mirrors the Part Editor bar */}
      <div className="flex-none bg-gray-900 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-semibold text-white">Door Preview</span>
          {caption && <span className="text-xs text-gray-300 truncate">{caption}</span>}
          <span className="flex items-center gap-1.5 text-[11px] text-gray-400 whitespace-nowrap">
            Sample
            <input value={wStr} onChange={e => setWStr(e.target.value)} aria-label="Sample door width (mm)"
              className="w-14 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[11px] text-gray-200 font-mono text-right focus:outline-none focus:border-blue-500" />
            ×
            <input value={hStr} onChange={e => setHStr(e.target.value)} aria-label="Sample door height (mm)"
              className="w-14 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[11px] text-gray-200 font-mono text-right focus:outline-none focus:border-blue-500" />
            <span className="text-gray-500 font-mono">× {fmtMm(thickness)} mm</span>
          </span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none px-1" aria-label="Close">✕</button>
      </div>

      {/* Scene — same toolbar + views as the Part Editor centre pane */}
      <div className="flex-1 relative bg-gray-950 min-w-0">
        <div className="absolute top-2 left-2 z-10 flex items-center gap-2 select-none">
          <div className="flex rounded-md overflow-hidden border border-gray-700 bg-gray-900/90">
            {(['3d', 'top', 'front', 'side'] as const).map(vm => (
              <button key={vm}
                onClick={() => { setView(vm); if (vm === '3d') setMeasuring(false) }}
                className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  view === vm ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}>
                {vm === '3d' ? '3D' : vm[0].toUpperCase() + vm.slice(1)}
              </button>
            ))}
          </div>
          <button onClick={() => setWire(x => !x)} title="Toggle wire / solid view"
            className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors ${
              wire ? 'bg-sky-600 border-sky-500 text-white' : 'bg-gray-900/90 border-gray-700 text-gray-300 hover:bg-gray-700'
            }`}>
            Wire
          </button>
          {view !== '3d' && (
            <button onClick={() => setMeasuring(m => !m)} title="Measure between corners — click two points"
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                measuring ? 'bg-amber-600 border-amber-500 text-white' : 'bg-gray-900/90 border-gray-700 text-gray-300 hover:bg-gray-700'
              }`}>
              Measure
            </button>
          )}
        </div>

        {view === '3d' ? (
          <PreviewCanvas dx={w} dy={h} dz={thickness} bgColor="#0b1220">
            <group position={[-w / 2, -h / 2, -thickness / 2]}>
              <Part
                b={{ x: 0, y: 0, z: 0, w, h, d: thickness }}
                // [edge×4, +Z face, −Z back]; index 0 doubles as the whole
                // material when recesses are CSG-cut, so both carry the board
                // colour — routed grooves then read as the same material.
                faceColors={[face, '#3f4653', '#3f4653', '#3f4653', face, '#565d6b']}
                edgeLineColor="#1e293b"
                meta={meta}
                selected={false}
                highlighted={false}
                onSelect={() => {}}
                dragRef={dragRef}
                wire={wire}
                subtractions={wire ? undefined : subtractions}
                hoverHighlight={false}
              />
            </group>
          </PreviewCanvas>
        ) : (
          <div className="w-full h-full flex items-center justify-center p-6">
            <PartOrthoView
              u={w} v={h} n={thickness} swap={false}
              view={view} measuring={measuring} wire={wire}
              edge={meta.edge}
              ops={partOps} selectedId={null} onSelect={() => {}} levels={{}}
            />
          </div>
        )}
      </div>
    </div>
  )
}
