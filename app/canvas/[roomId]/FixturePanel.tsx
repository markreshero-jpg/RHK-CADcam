'use client'

// ── Selected fixture panel (z_fixtures P2) ────────────────────────────────────
// Right-docked like BenchtopPanel. Size edits are per placement (the job copy);
// the catalogue row is untouched. Position = footprint centre in plan; Move picks
// the fixture up (same carry as placing), Turn rotates 90° about its centre.

import PanelDeleteButton, { PanelCloseButton } from './PanelDeleteButton'
import CalcInput from '@/src/components/CalcInput'
import type { RoomFixture, Wall } from '@/src/lib/types'
import { fixtureCenter, backLeftForCenter } from '@/src/lib/fixtureGeometry'

const CATEGORY_LABEL: Record<string, string> = {
  appliance: 'Appliance', sink: 'Sink', tap: 'Tap', decorative: 'Decorative',
}

export default function FixturePanel({ fixture, walls, onUpdate, onDelete, onMove, onTurn, onOpen, onClose, linkedTo, clashWith, onUnlink }: {
  fixture:  RoomFixture
  walls:    Wall[]
  /** P4: label of the cabinet it sits on (follows it), or null. */
  linkedTo?:  string | null
  /** P4: labels of cabinets it overlaps. */
  clashWith?: string[]
  onUnlink?:  (id: string) => void
  onUpdate: (id: string, patch: Partial<RoomFixture>) => void
  onDelete: (id: string) => void
  /** Header ✕ — closes (deselects). Omitted → no ✕. */
  onClose?: () => void
  onMove:   (id: string) => void
  onTurn:   (id: string, deg: number) => void
  /** Open the big viewer (double-click does the same); omitted inside the viewer. */
  onOpen?:  (id: string) => void
}) {
  const f = fixture
  const c = fixtureCenter(f)
  const wall = f.wall_id ? walls.find(w => w.id === f.wall_id) : null
  const inp = 'w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500 text-right'
  const lbl = 'text-[10px] text-gray-500 uppercase tracking-wider mb-0.5 block'

  const field = (k: string, value: number, onCommit: (v: number) => void, title: string) => (
    <div title={title}>
      <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">{k}</div>
      <CalcInput value={Math.round(value * 10) / 10} decimals={1} onCommit={onCommit} className={inp} />
    </div>
  )

  // Keep the centre where it is when the size changes (it grows about its middle,
  // except depth on a wall-backed item, which grows forward).
  function resize(patch: Partial<Pick<RoomFixture, 'width' | 'depth' | 'height'>>) {
    const w = patch.width ?? f.width, d = patch.depth ?? f.depth
    if (w <= 0 || d <= 0 || (patch.height ?? f.height) <= 0) return
    const centre = { ...c }
    if (wall && patch.depth != null) {
      // back stays on the wall: shift the centre forward by half the change
      const n = { x: -Math.sin(f.rotation * Math.PI / 180), y: Math.cos(f.rotation * Math.PI / 180) }
      centre.x += n.x * (d - f.depth) / 2; centre.y += n.y * (d - f.depth) / 2
    }
    const bl = backLeftForCenter(centre, f.rotation, w, d)
    onUpdate(f.id, { ...patch, x: Math.round(bl.x * 10) / 10, y: Math.round(bl.y * 10) / 10 })
  }

  function moveCentre(axis: 'x' | 'y', v: number) {
    const centre = { ...c, [axis]: v }
    const bl = backLeftForCenter(centre, f.rotation, f.width, f.depth)
    onUpdate(f.id, { x: Math.round(bl.x * 10) / 10, y: Math.round(bl.y * 10) / 10, wall_id: null })
  }

  return (
    <div className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-300 truncate">{f.label || f.name}</p>
          <p className="text-[10px] text-gray-500 truncate">
            {CATEGORY_LABEL[f.category] ?? f.category}{f.kind ? ` · ${f.kind}` : ''}{wall ? ` · on ${wall.name || 'wall'}` : ' · free-standing'}
          </p>
        </div>
        {onClose && <PanelCloseButton onClose={onClose} />}
      </div>

      <div className="p-4 space-y-4">
        <div>
          <label className={lbl}>Label</label>
          <input
            key={f.id + (f.label ?? '')}
            defaultValue={f.label ?? ''}
            placeholder={f.name}
            onBlur={e => { const v = e.target.value.trim() || null; if (v !== f.label) onUpdate(f.id, { label: v }) }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className={inp.replace('text-right', '')}
          />
        </div>

        <div className="space-y-1.5">
          <label className={lbl}>Size (mm)</label>
          <div className="grid grid-cols-3 gap-1">
            {field('Width',  f.width,  v => resize({ width: v }),  'Width (this placement only — the library item is unchanged)')}
            {field('Depth',  f.depth,  v => resize({ depth: v }),  'Depth — grows forward when backed onto a wall')}
            {field('Height', f.height, v => resize({ height: v }), 'Height')}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className={lbl}>Position (mm)</label>
          <div className="grid grid-cols-3 gap-1">
            {field('Off floor', f.z, v => onUpdate(f.id, { z: Math.max(0, v) }), 'Underside height above the floor')}
            {field('Centre X', c.x, v => moveCentre('x', v), 'Plan centre X (frees it from the wall)')}
            {field('Centre Y', c.y, v => moveCentre('y', v), 'Plan centre Y (frees it from the wall)')}
          </div>
          <div className="grid grid-cols-3 gap-1">
            {field('Rotation', f.rotation, v => onTurn(f.id, v - f.rotation), 'Plan rotation in degrees (turns about the centre)')}
          </div>
        </div>

        {linkedTo && (
          <div className="flex items-center gap-2 rounded bg-gray-800/60 px-2 py-1.5">
            <p className="flex-1 text-[11px] text-gray-300" title="Moves with this cabinet when the cabinet is moved or slid">On <span className="font-medium text-white">{linkedTo}</span> · follows it</p>
            {onUnlink && (
              <button onClick={() => onUnlink(f.id)}
                className="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-[10px] text-gray-200"
                title="Stop following the cabinet (stays where it is)">Unlink</button>
            )}
          </div>
        )}
        {!!clashWith?.length && (
          <p className="rounded border border-red-800 bg-red-950/50 px-2 py-1.5 text-[11px] text-red-300">
            Overlaps {clashWith.join(', ')} — check the gap or move it.
          </p>
        )}

        <div className="flex gap-1.5">
          <button onClick={() => onMove(f.id)}
            className="flex-1 px-2 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-xs text-gray-200"
            title="Pick up and drop somewhere else (M)">Move</button>
          <button onClick={() => onTurn(f.id, 90)}
            className="flex-1 px-2 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-xs text-gray-200"
            title="Turn 90° about its centre">Turn 90°</button>
        </div>
        {onOpen && (
          <button onClick={() => onOpen(f.id)}
            className="w-full px-2 py-1.5 rounded bg-blue-700 hover:bg-blue-600 text-xs text-white"
            title="Open the viewer: 3D, front, back, sides, top (double-click)">View 3D / elevations</button>
        )}

        {f.cutout_shape && (
          <p className="text-[10px] text-gray-500">
            Benchtop cutout: {f.cutout_shape === 'round' ? `Ø${f.cutout_w}` : `${f.cutout_w} × ${f.cutout_d}${f.cutout_radius ? ` R${f.cutout_radius}` : ''}`}
            {f.bench_drop ? ` · drops ${f.bench_drop} below the top` : ''}
          </p>
        )}
        {f.model_url
          ? <p className="text-[10px] text-gray-500">3D model: {f.model_format?.toUpperCase()}</p>
          : <p className="text-[10px] text-gray-500">No 3D model — shows as a box.</p>}
      </div>
      <PanelDeleteButton label="Delete fixture" onDelete={() => onDelete(f.id)} />
    </div>
  )
}
