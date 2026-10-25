'use client'

// Side panel for Edit shape (z_cabinet_shape_edit E3). Shows what is picked on
// the plan — an edge (type, sub-type, scribe) or a corner (how the pieces meet)
// — plus every edge and corner as a list to pick from. Changes save as they're
// made (the cabinet re-resolves); ✓ Done / Enter / Esc finishes, Cancel puts the
// shape back as it was, ↶ / Ctrl+Z steps back inside the edit.

import type { CabinetInstance } from '@/src/lib/types'
import CalcInput from '@/src/components/CalcInput'
import {
  EDGE_ROLES, EDGE_SUBS, edgeLabel, edgeSub, evaluateFootprint, withEdgeOverrides,
  type EdgeOverride, type EdgeRole, type EdgeSub, type JoinChoice,
} from '@/src/lib/cabinetShape/footprint'
import { footprintJunctions, joinOptions, withJoin } from '@/src/lib/cabinetShape/junctions'
import { withEdgeChoice } from '@/src/lib/cabinetShape/edit'
import { getCachedInput } from '@/src/lib/resolver/resolveCabinetFromDB'
import { edgeRuleScribe } from '@/src/lib/resolver/resolveShapedCase'
import { ROLE_COLOUR, edgePlanLabel } from './CabinetShapeEditPlan'
import type { CabinetShapeEdit, ShapeEditSel } from './useCabinetShapeEdit'

const btn = 'px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-40'
const inp = 'w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white'

export default function CabinetShapeEditPanel({ edit, cab, onApply, onSelect, onDone, onCancel, onUndo }: {
  edit: CabinetShapeEdit
  cab: CabinetInstance
  onApply: (next: CabinetShapeEdit['fp']) => void
  onSelect: (s: ShapeEditSel) => void
  onDone: () => void
  onCancel: () => void
  onUndo: () => void
}) {
  const dims = { w: cab.dx, d: cab.dz }
  const edges = evaluateFootprint(withEdgeOverrides(edit.fp), dims)
  const corners = footprintJunctions(edit.fp, dims.w, dims.d)
  const selEdge = edit.sel?.kind === 'edge' ? edges.find(s => s.edge.id === (edit.sel as { id: string }).id) : undefined
  const selCorner = edit.sel?.kind === 'corner' ? corners.find(j => j.key === (edit.sel as { key: string }).key) : undefined

  const setEdge = (id: string, patch: Partial<EdgeOverride>) => onApply(withEdgeChoice(edit.fp, dims, id, patch))
  const setJoin = (key: string, c: JoinChoice | '') => onApply(withJoin(edit.fp, dims.w, dims.d, key, c))

  return (
    <div className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-gray-800">
        <p className="text-xs font-medium text-amber-300">Edit shape — {cab.label ?? 'Cabinet'}</p>
        <p className="text-[10px] text-gray-500">{edges.length} edges · {corners.length} corners with a choice</p>
        <div className="flex gap-1.5 mt-2">
          <button onClick={onDone} className="flex-1 px-2 py-1 rounded text-xs bg-teal-600 hover:bg-teal-500 text-white" title="Enter / Esc">✓ Done</button>
          <button onClick={onCancel} disabled={!edit.history.length} className={btn} title="Put the shape back as it was">Cancel</button>
          <button onClick={onUndo} disabled={!edit.history.length} className={btn} title="Ctrl+Z — undo the last change in this edit">↶</button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {!selEdge && !selCorner && (
          <p className="text-[11px] text-gray-400">Click an edge or a corner dot on the plan (or pick one below).</p>
        )}

        {selEdge && (() => {
          const e = selEdge.edge
          const subs = EDGE_SUBS[e.role]
          const sub = edgeSub(e)
          const rules = getCachedInput(cab.id)?.rules
          const inherited = rules ? edgeRuleScribe(rules, cab.dx, selEdge) : 0
          return (
            <div className="space-y-2">
              <p className="text-[11px] text-gray-300">Edge: <span className="text-white font-medium">{edgeLabel(e.id)}</span></p>
              <div className="grid grid-cols-2 gap-1">
                {EDGE_ROLES.map(r => (
                  <button key={r.value} onClick={() => setEdge(e.id, { role: r.value as EdgeRole })}
                    className={`text-xs py-1 rounded border flex items-center justify-center gap-1.5 ${e.role === r.value
                      ? 'bg-gray-700 border-gray-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}>
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: ROLE_COLOUR[r.value] }} />
                    {r.label.replace(' (face)', '')}
                  </button>
                ))}
              </div>
              {subs.length > 0 && (
                <div className="space-y-1">
                  {subs.map(o => (
                    <label key={o.value} className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                      <input type="radio" checked={sub === o.value} onChange={() => setEdge(e.id, { sub: o.value as EdgeSub })} className="accent-amber-500" />
                      {o.label}
                    </label>
                  ))}
                </div>
              )}
              {sub === 'scribe' && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-400">Scribe (mm)</span>
                  <CalcInput value={e.scribe ?? null} decimals={1} min={0} placeholder={String(inherited)}
                    title={e.scribe == null ? `Inherited ${inherited} mm — type to override, clear to inherit` : 'Clear to inherit'}
                    onCommit={v => setEdge(e.id, { scribe: v })} onClear={() => setEdge(e.id, { scribe: undefined })}
                    className={inp + ' w-20 text-right'} />
                </div>
              )}
            </div>
          )
        })()}

        {selCorner && (
          <div className="space-y-2">
            <p className="text-[11px] text-gray-300">
              Corner: <span className="text-white font-medium">{edgeLabel(selCorner.a.id)} / {edgeLabel(selCorner.b.id)}</span>
              <span className="text-gray-500"> · {Math.round(selCorner.angle * 10) / 10}°</span>
            </p>
            <div className="space-y-1">
              {joinOptions(selCorner).map(o => (
                <label key={o.value} className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                  <input type="radio" checked={(selCorner.choice ?? '') === o.value} onChange={() => setJoin(selCorner.key, o.value)} className="accent-amber-500" />
                  {o.label}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-gray-800 pt-3 space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Edges</p>
          {edges.map(s => (
            <button key={s.edge.id} onClick={() => onSelect({ kind: 'edge', id: s.edge.id })}
              className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left text-[11px] ${selEdge?.edge.id === s.edge.id ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ROLE_COLOUR[s.edge.role] }} />
              <span className="w-20 truncate">{edgeLabel(s.edge.id)}</span>
              <span className="truncate">{edgePlanLabel(s.edge)}</span>
            </button>
          ))}
          {corners.length > 0 && <p className="text-[10px] uppercase tracking-wide text-gray-500 pt-2">Corners</p>}
          {corners.map(j => (
            <button key={j.key} onClick={() => onSelect({ kind: 'corner', key: j.key })}
              className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left text-[11px] ${selCorner?.key === j.key ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 border border-gray-300 ${j.choice ? 'bg-gray-200' : ''}`} />
              <span className="w-20 truncate">{edgeLabel(j.a.id)} / {edgeLabel(j.b.id)}</span>
              <span className="truncate">{joinOptions(j).find(o => o.value === (j.choice ?? ''))?.label}</span>
            </button>
          ))}
        </div>

        <p className="text-[10px] text-gray-500">Changes save as you make them; Cancel puts the shape back as it was when you started.</p>
      </div>
    </div>
  )
}
