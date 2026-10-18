'use client'

// ── Selected fixture panel (z_fixtures P2) ────────────────────────────────────
// Right-docked like BenchtopPanel. Size edits are per placement (the job copy);
// the catalogue row is untouched. Position = footprint centre in plan; Move picks
// the fixture up (same carry as placing), Turn rotates 90° about its centre.

import PanelDeleteButton, { PanelCloseButton } from './PanelDeleteButton'
import CalcInput from '@/src/components/CalcInput'
import type { RoomFixture, Wall } from '@/src/lib/types'
import { fixtureCenter, backLeftForCenter, fixtureCorners, fixtureWallRef, fixtureAxes, type Clearances } from '@/src/lib/fixtureGeometry'
import { wallFrame, alongOf } from '@/src/lib/benchtopAnchor'
import { centroid } from '@/src/lib/geometry'

const CATEGORY_LABEL: Record<string, string> = {
  appliance: 'Appliance', sink: 'Sink', tap: 'Tap', decorative: 'Decorative', opening: 'Door / window',
}

export default function FixturePanel({ fixture, walls, onUpdate, onDelete, onMove, onTurn, onOpen, onClose, linkedTo, linkable, onLink, clashWith, onUnlink, clearance }: {
  fixture:  RoomFixture
  walls:    Wall[]
  /** Gaps to the nearest objects (left / right feed Clear left / Clear right). */
  clearance?: Clearances | null
  /** P4: label of the cabinet it sits on (follows it), or null. */
  linkedTo?:  string | null
  /** P4: labels of cabinets it overlaps. */
  clashWith?: string[]
  onUnlink?:  (id: string) => void
  /** Unlinked but sitting on a cabinet (e.g. placed before P4, or unlinked): that cabinet's label. */
  linkable?:  string | null
  onLink?:    (id: string) => void
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

  // Openings (P5): position = distance of the left jamb from the wall start.
  const opening = f.category === 'opening'
  const face = opening && wall ? wallFrame(wall, 'face', centroid(walls)) : null
  const fromStart = face ? Math.min(...fixtureCorners(f).map(p => alongOf(face, p))) : 0
  function slideAlong(v: number) {
    if (!face) return
    const k = v - fromStart
    onUpdate(f.id, { x: Math.round((f.x + face.d.x * k) * 10) / 10, y: Math.round((f.y + face.d.y * k) * 10) / 10 })
  }
  const isDoor = opening && /door/i.test(f.kind ?? '') && !/sliding/i.test(f.kind ?? '')
  const toggle = (on: boolean, label: string, onClick: () => void, title: string) => (
    <button onClick={onClick} title={title}
      className={`flex-1 px-2 py-1 rounded text-xs ${on ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>{label}</button>
  )

  // Wall position (like CabinetPanel): ends / clears along the wall + off the wall face.
  const wref = !opening && wall ? fixtureWallRef(f, walls, centroid(walls)) : null
  const { a: ax, n: nx } = fixtureAxes(f.rotation)
  const shift = (along: number, out: number) => onUpdate(f.id, {
    x: Math.round((f.x + ax.x * along + nx.x * out) * 10) / 10,
    y: Math.round((f.y + ax.y * along + nx.y * out) * 10) / 10,
  })

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

        {f.category !== 'opening' && (
          // This job's copy — the schedule prints these; editing doesn't touch the library.
          <div className="grid grid-cols-2 gap-1">
            {(['brand', 'model_no'] as const).map(k => (
              <div key={k}>
                <label className={lbl}>{k === 'brand' ? 'Brand' : 'Model no.'}</label>
                <input
                  key={f.id + (f[k] ?? '')}
                  defaultValue={f[k] ?? ''}
                  onBlur={e => { const v = e.target.value.trim() || null; if (v !== f[k]) onUpdate(f.id, { [k]: v }) }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  className={inp.replace('text-right', '')}
                />
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1.5">
          <label className={lbl}>Size (mm)</label>
          <div className="grid grid-cols-3 gap-1">
            {field('Width',  f.width,  v => resize({ width: v }),  'Width (this placement only — the library item is unchanged)')}
            {!opening && field('Depth',  f.depth,  v => resize({ depth: v }),  'Depth — grows forward when backed onto a wall')}
            {field('Height', f.height, v => resize({ height: v }), 'Height')}
          </div>
        </div>

        {wref && (
          <div className="space-y-1.5">
            <label className={lbl}>Wall position (mm)</label>
            <div className="grid grid-cols-2 gap-1">
              {field('From left end', wref.endLeft, v => shift(v - wref.endLeft, 0), 'Its left side to the wall end on that side (looking at its front)')}
              {field('From right end', wref.endRight, v => shift(wref.endRight - v, 0), 'Its right side to the wall end on that side')}
              {clearance?.left != null && field('Clear left', clearance.left, v => shift(v - clearance.left!, 0), 'Gap to the nearest thing on its left')}
              {clearance?.right != null && field('Clear right', clearance.right, v => shift(clearance.right! - v, 0), 'Gap to the nearest thing on its right')}
              {field('Off wall', wref.off, v => shift(0, v - wref.off), 'Back of the item to the wall face — pull a sink or appliance forward')}
            </div>
          </div>
        )}
        {opening ? (
          <div className="space-y-1.5">
            <label className={lbl}>Position (mm)</label>
            <div className="grid grid-cols-3 gap-1">
              {field('Sill', f.z, v => onUpdate(f.id, { z: Math.max(0, v) }), 'Sill height above the floor (0 for doors)')}
              {face && field('From start', fromStart, slideAlong, 'Distance of the left jamb from the wall start (inside face)')}
            </div>
            {isDoor && <>
              <label className={lbl}>Hinge (from inside)</label>
              <div className="flex gap-1">
                {toggle(f.hinge_side === 'left', 'Left', () => onUpdate(f.id, { hinge_side: 'left' }), 'Hinged on the left, looking at it from inside the room')}
                {toggle(f.hinge_side === 'right', 'Right', () => onUpdate(f.id, { hinge_side: 'right' }), 'Hinged on the right, looking at it from inside the room')}
              </div>
              <label className={lbl}>Swings</label>
              <div className="flex gap-1">
                {toggle(f.swing === 'in', 'Into room', () => onUpdate(f.id, { swing: 'in' }), 'Opens into this room')}
                {toggle(f.swing === 'out', 'Out', () => onUpdate(f.id, { swing: 'out' }), 'Opens away from this room')}
              </div>
            </>}
          </div>
        ) : (
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
        )}

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
        {!linkedTo && linkable && onLink && (
          <div className="flex items-center gap-2 rounded bg-gray-800/60 px-2 py-1.5">
            <p className="flex-1 text-[11px] text-gray-400">Sits on <span className="font-medium text-gray-200">{linkable}</span> · not linked</p>
            <button onClick={() => onLink(f.id)}
              className="px-2 py-0.5 rounded bg-blue-700 hover:bg-blue-600 text-[10px] text-white"
              title="Follow this cabinet when it moves or slides (stays where it is now)">Link</button>
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
          {!opening && <button onClick={() => onTurn(f.id, 90)}
            className="flex-1 px-2 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-xs text-gray-200"
            title="Turn 90° about its centre">Turn 90°</button>}
        </div>
        {onOpen && (
          <button onClick={() => onOpen(f.id)}
            className="w-full px-2 py-1.5 rounded bg-blue-700 hover:bg-blue-600 text-xs text-white"
            title="Open the viewer: 3D, front, back, sides, top (double-click)">View 3D / elevations</button>
        )}

        {/* Benchtop cutout (P10): this placement's copy of the library template —
            edits here override it for this job only. */}
        {!opening && (
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer"
              title="Cut this fixture's cutout into the benchtop under it">
              <input type="checkbox" checked={f.cut_benchtop ?? true}
                onChange={e => onUpdate(f.id, { cut_benchtop: e.target.checked })} />
              Cut benchtop
            </label>
            {(f.cut_benchtop ?? true) && <>
              <div className="flex gap-1">
                {toggle(!f.cutout_shape, 'None', () => onUpdate(f.id, { cutout_shape: null }), 'No cutout')}
                {toggle(f.cutout_shape === 'rect', 'Rect', () => onUpdate(f.id, f.cutout_shape || f.cutout_w > 0
                  ? { cutout_shape: 'rect' }
                  : { cutout_shape: 'rect', cutout_w: Math.max(0, f.width - 20), cutout_d: Math.max(0, f.depth - 20) }), 'Rectangular cutout')}
                {toggle(f.cutout_shape === 'round', 'Round', () => onUpdate(f.id, f.cutout_shape || f.cutout_w > 0
                  ? { cutout_shape: 'round' }
                  : { cutout_shape: 'round', cutout_w: Math.max(0, Math.min(f.width, f.depth) - 20) }), 'Round cutout (taps, round sinks)')}
              </div>
              {f.cutout_shape && <>
                <div className="grid grid-cols-3 gap-1">
                  {f.cutout_shape === 'round'
                    ? field('Diameter', f.cutout_w, v => v > 0 && onUpdate(f.id, { cutout_w: v }), 'Cutout diameter (this placement only)')
                    : <>
                        {field('Width', f.cutout_w, v => v > 0 && onUpdate(f.id, { cutout_w: v }), 'Cutout width (this placement only)')}
                        {field('Depth', f.cutout_d, v => v > 0 && onUpdate(f.id, { cutout_d: v }), 'Cutout depth (this placement only)')}
                        {field('Radius', f.cutout_radius, v => onUpdate(f.id, { cutout_radius: Math.max(0, v) }), 'Corner radius')}
                      </>}
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {field('Off right', f.cutout_off_x, v => onUpdate(f.id, { cutout_off_x: v }), 'Cutout centre offset to the right of the item centre (looking at its front)')}
                  {field('Off fwd', f.cutout_off_y, v => onUpdate(f.id, { cutout_off_y: v }), 'Cutout centre offset forward of the item centre')}
                </div>
              </>}
            </>}
            {f.bench_drop ? <p className="text-[10px] text-gray-500">Drops {f.bench_drop} below the top</p> : null}
          </div>
        )}
        {f.model_url
          ? <p className="text-[10px] text-gray-500">3D model: {f.model_format?.toUpperCase()}</p>
          : <p className="text-[10px] text-gray-500">No 3D model — shows as a box.</p>}
      </div>
      <PanelDeleteButton label="Delete fixture" onDelete={() => onDelete(f.id)} />
    </div>
  )
}
