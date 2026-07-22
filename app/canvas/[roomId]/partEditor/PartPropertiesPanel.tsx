'use client'

// ============================================================
// Part Editor — right zone: contextual properties for the
// selected operation. Role picker (local/master/joint), the
// enforced-first joint picker (§7.1), validation banner (§6.2),
// the editable field grid, plane/edge picker and tool selects.
// ============================================================

import { useState } from 'react'
import { roundMm } from '@/src/lib/format'
import { evalCalc } from '@/src/lib/calc'
import OperationToolSelect, { useToolLibraries } from '@/src/components/cnc/OperationToolSelect'
import { isFiringRole } from '@/src/lib/partOps/enums'
import type { PartOp } from '../CabinetRoutesPanel'
import {
  ACTION_OPTIONS, PLANE_EDGES, PLANE_KINDS, PLANE_KIND_LABEL, TYPE_OPTIONS,
  type Issue, type JointType, type Origin,
} from './partEditorCore'

function PropRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <span className="text-gray-500 self-center">{label}</span>
      <span className="text-gray-200 text-right font-mono">{value}</span>
    </>
  )
}

// Calc-aware numeric field ("100+12" → 112). Reseeds by remounting (key on op
// change) rather than a setState-in-effect. Commits on blur / Enter, reverts on Esc.
function NumField({ value, onCommit, disabled }: {
  value: number | null; onCommit: (v: number) => void; disabled?: boolean
}) {
  const init = value == null ? '' : String(roundMm(value))
  const [draft, setDraft] = useState(init)
  function commit() {
    const x = evalCalc(draft)
    if (x != null && Number.isFinite(x)) onCommit(x)
    else setDraft(init)
  }
  return (
    <input
      type="text" inputMode="decimal" value={draft} disabled={disabled}
      onChange={e => setDraft(e.target.value)}
      onFocus={e => e.target.select()}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(init); e.currentTarget.blur() } }}
      className="w-20 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-right font-mono text-gray-100 disabled:text-gray-500 disabled:bg-gray-900/60 disabled:cursor-not-allowed focus:outline-none focus:border-blue-500"
    />
  )
}

export default function PartPropertiesPanel({
  selected, sel, selLocked, selIssues, swap, firing,
  jointTypes, slavesByMaster, toolSets,
  planePick, onPlanePickChange,
  patchOp, pickJoint, resyncJointsFromLibrary, deleteSelected, convertToManual,
  width,
}: {
  width: number
  selected: PartOp | null
  sel: Origin | null
  selLocked: boolean
  selIssues: Issue[]
  swap: boolean
  firing: boolean
  jointTypes: JointType[]
  slavesByMaster: Map<string, number>
  toolSets: { id: string; name: string }[]
  planePick: boolean
  onPlanePickChange: (on: boolean) => void
  patchOp: (changes: Partial<PartOp>) => void
  pickJoint: (jt: JointType) => void
  resyncJointsFromLibrary: () => void
  deleteSelected: () => void
  convertToManual: () => void
}) {
  // Tool libraries (router bits + drills), for the tool picker.
  const { tools, drills } = useToolLibraries()
  const [jointQuery, setJointQuery] = useState('')

  // Enforced-first joint pick (§7.1): a joint op with no type collapses the inspector
  // to just the picker until a joint is chosen.
  const jointPicking = !!selected && !selLocked && selected.operation_role === 'joint' && !selected.joint_type_id
  const jointName = selected?.joint_type_id ? (jointTypes.find(j => j.id === selected.joint_type_id)?.name ?? 'joint') : null
  const jointHits = jointTypes.filter(j => j.name.toLowerCase().includes(jointQuery.trim().toLowerCase()))

  return (
    <div style={{ width }} className="flex-none bg-gray-900 border-l border-gray-800 overflow-y-auto">
      <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Properties</span>
        {sel && (
          <span className={`text-[8px] px-1 py-0.5 rounded font-bold tracking-wide ${
            sel.generated ? 'bg-amber-900/60 text-amber-300' : 'bg-emerald-900/50 text-emerald-300'
          }`}>{sel.label}</span>
        )}
      </div>
      {selected ? (
        <div className="px-3 py-2 text-xs">
          {/* Validation banner (§6.2) */}
          {selIssues.length > 0 && (
            <div className="mb-2 rounded border border-gray-700 overflow-hidden">
              {selIssues.map((is, i) => (
                <div key={i} className={`px-2 py-1 text-[11px] flex items-start gap-1.5 ${
                  is.level === 'error' ? 'bg-red-950/50 text-red-300' : 'bg-amber-950/40 text-amber-300'
                }`}>
                  <span>{is.level === 'error' ? '⛔' : '⚠'}</span><span>{is.msg}</span>
                </div>
              ))}
            </div>
          )}
          {selLocked && (
            <div className="mb-2 text-[10px] text-amber-400/80 leading-snug">
              Generated operation — read-only (it’s re-created on every sync).
              Use “Convert to manual override” to edit.
            </div>
          )}

          {/* Slave pointer (§5.5): edit it on the source part, not here. */}
          {sel?.kind === 'slave' && (
            <div className="mb-2 text-[10px] text-sky-300/80 leading-snug">
              Slave hole — fired by a master on{' '}
              <span className="font-mono text-sky-200">{String(selected.parameters?.master_source_part_key ?? '?')}</span>.
              Edit it on that part.
            </div>
          )}

          {/* Role (§2, §7.1) — hand ops only. Master fires a slave onto the
              coincident part; Joint snapshots a library joint (§6). */}
          {!selLocked && (
            <div className="mb-2 flex items-center gap-2">
              <span className="text-gray-500 text-[10px] uppercase tracking-wider">Role</span>
              <div className="flex rounded overflow-hidden border border-gray-700">
                {(['local', 'master', 'joint'] as const).map(r => {
                  const active = (selected.operation_role ?? 'local') === r
                  return (
                    <button key={r} type="button"
                      onClick={() => { if (!active) patchOp({ operation_role: r, is_master: isFiringRole(r), ...(r !== 'joint' ? { joint_type_id: null } : {}) }) }}
                      className={`px-2 py-0.5 text-[11px] capitalize ${active ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
                      {r}
                    </button>
                  )
                })}
              </div>
              {firing && <span className="text-[9px] text-violet-300">firing…</span>}
            </div>
          )}
          {!selLocked && isFiringRole(selected.operation_role) && (() => {
            const n = slavesByMaster.get(selected.id) ?? 0
            return n > 0
              ? <div className="mb-2 text-[10px] text-violet-300/80 leading-snug">Fires {n} slave hole{n > 1 ? 's' : ''} onto the part{n > 1 ? 's' : ''} its plane/edge touches.</div>
              : <div className="mb-2 text-[10px] text-amber-300/80 leading-snug">No touching part at this position — no slave fired. Move it onto a shared edge, or check the plane.</div>
          })()}
          {/* Double-fire advisory (§6.1) — non-blocking. */}
          {!selLocked && isFiringRole(selected.operation_role) && selected.plane_kind === 'edge' && (
            <div className="mb-2 text-[10px] text-amber-300/80 leading-snug">
              ⚠ If this edge also has an automatic construction-method joint, both will fire (possible double-drill).
            </div>
          )}

          {jointPicking ? (
            /* Enforced-first joint picker (§7.1) — the one "you must pick this" case. */
            <div className="mb-2">
              <div className="text-[10px] text-violet-300 mb-1">Pick a joint from the library:</div>
              <input autoFocus type="text" value={jointQuery} onChange={e => setJointQuery(e.target.value)}
                placeholder="Search joints…"
                className="w-full mb-1.5 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100 focus:outline-none focus:border-violet-500" />
              <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto">
                {jointHits.length === 0 && <div className="text-[10px] text-gray-500 px-1 py-2">No matching joints.</div>}
                {jointHits.map(j => (
                  <button key={j.id} type="button" onClick={() => { setJointQuery(''); pickJoint(j) }}
                    className="text-left px-2 py-1 rounded bg-gray-800 hover:bg-violet-900/40 border border-gray-700 hover:border-violet-600">
                    <div className="text-gray-100 text-[11px]">{j.name}</div>
                    <div className="text-gray-500 text-[9px]">{j.ops.map(o => `${o.target_part === 'part_a' ? 'A' : 'B'}:${o.machine_operation}`).join(' · ') || 'no ops'}</div>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => patchOp({ operation_role: 'local', is_master: false })}
                className="mt-1.5 text-[10px] text-gray-400 hover:text-gray-200">Cancel — back to Local</button>
            </div>
          ) : (
          <>
          {/* Joint header (§6): chosen joint + re-sync, once picked. */}
          {!selLocked && selected.operation_role === 'joint' && selected.joint_type_id && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded border border-violet-800/60 bg-violet-950/30 px-2 py-1">
              <span className="text-[11px] text-violet-200">Joint: <span className="font-medium">{jointName}</span></span>
              <div className="flex gap-1">
                <button type="button" onClick={resyncJointsFromLibrary} title="Re-read the library and re-materialise every joint op in this cabinet"
                  className="text-[9px] px-1.5 py-0.5 rounded border border-violet-700 text-violet-200 hover:bg-violet-800/40">Re-sync</button>
                <button type="button" onClick={() => patchOp({ joint_type_id: null })}
                  className="text-[9px] px-1.5 py-0.5 rounded border border-gray-700 text-gray-300 hover:bg-gray-800">Change</button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 items-center">
            <span className="text-gray-500">Type</span>
            <select value={selected.operation_type} disabled={selLocked}
              onChange={e => patchOp({ operation_type: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-100 disabled:text-gray-500 disabled:bg-gray-900/60 focus:outline-none focus:border-blue-500">
              {/* keep any legacy value selectable */}
              {!(TYPE_OPTIONS as readonly string[]).includes(selected.operation_type) && <option value={selected.operation_type}>{selected.operation_type}</option>}
              {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            <span className="text-gray-500">Action</span>
            <select value={selected.operation_action ?? ''} disabled={selLocked}
              onChange={e => patchOp({ operation_action: e.target.value || null })}
              className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-100 disabled:text-gray-500 disabled:bg-gray-900/60 focus:outline-none focus:border-blue-500">
              {ACTION_OPTIONS.map(a => <option key={a} value={a}>{a === '' ? '—' : a}</option>)}
            </select>

            <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pt-1">Position (X across · Y up)</span>
            <span className="text-gray-500">X</span>
            <NumField key={`${selected.id}-px`} value={swap ? selected.pos_y : selected.pos_x} disabled={selLocked} onCommit={x => patchOp(swap ? { pos_y: x } : { pos_x: x })} />
            <span className="text-gray-500">Y</span>
            <NumField key={`${selected.id}-py`} value={swap ? selected.pos_x : selected.pos_y} disabled={selLocked} onCommit={x => patchOp(swap ? { pos_x: x } : { pos_y: x })} />
            <span className="text-gray-500" title="Start offset below the active face surface (Z0 = the face this op is on). The cut runs its depth further in. Leave 0 to start at the surface.">Z start ⓘ</span>
            <NumField key={`${selected.id}-pz`} value={selected.pos_z} disabled={selLocked} onCommit={x => patchOp({ pos_z: x })} />

            {selected.operation_type === 'drill' ? (
              <>
                <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pt-1">Drill</span>
                <span className="text-gray-500">⌀ Diameter</span>
                <NumField key={`${selected.id}-dia`} value={selected.diameter} disabled={selLocked} onCommit={x => patchOp({ diameter: x })} />
                <span className="text-gray-500">Depth</span>
                <NumField key={`${selected.id}-dep`} value={selected.depth} disabled={selLocked} onCommit={x => patchOp({ depth: x })} />
                <span className="text-gray-500">Repeat ×</span>
                <NumField key={`${selected.id}-rc`} value={selected.repeat_count} disabled={selLocked} onCommit={x => patchOp({ repeat_count: Math.max(1, Math.round(x)) })} />
                <span className="text-gray-500">Spacing</span>
                <NumField key={`${selected.id}-rs`} value={selected.repeat_spacing} disabled={selLocked} onCommit={x => patchOp({ repeat_spacing: x })} />
              </>
            ) : selected.operation_type === 'groove' ? (
              <>
                {/* Groove = straight slot; the tool drives the profile (§3.3). Length/width/
                    depth are its own columns. Repeat + spacing turn one groove into a
                    slatted/fluted run — no N hand-placed slots. */}
                <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pt-1">Groove</span>
                <span className="text-gray-500">Length</span>
                <NumField key={`${selected.id}-glen`} value={selected.length} disabled={selLocked} onCommit={x => patchOp({ length: x })} />
                <span className="text-gray-500">Width</span>
                <NumField key={`${selected.id}-gw`} value={selected.width} disabled={selLocked} onCommit={x => patchOp({ width: x })} />
                <span className="text-gray-500">Depth</span>
                <NumField key={`${selected.id}-gd`} value={selected.depth} disabled={selLocked} onCommit={x => patchOp({ depth: x })} />
                <span className="text-gray-500">Repeat ×</span>
                <NumField key={`${selected.id}-grc`} value={selected.repeat_count} disabled={selLocked} onCommit={x => patchOp({ repeat_count: Math.max(1, Math.round(x)) })} />
                <span className="text-gray-500">Spacing</span>
                <NumField key={`${selected.id}-grs`} value={selected.repeat_spacing} disabled={selLocked} onCommit={x => patchOp({ repeat_spacing: x })} />
              </>
            ) : (
              <>
                <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pt-1">Size</span>
                <span className="text-gray-500">dx</span>
                <NumField key={`${selected.id}-sx`} value={selected.size_dx} disabled={selLocked} onCommit={x => patchOp({ size_dx: x })} />
                <span className="text-gray-500">dy</span>
                <NumField key={`${selected.id}-sy`} value={selected.size_dy} disabled={selLocked} onCommit={x => patchOp({ size_dy: x })} />
                <span className="text-gray-500">dz (depth)</span>
                <NumField key={`${selected.id}-sz`} value={selected.size_dz} disabled={selLocked} onCommit={x => patchOp({ size_dz: x })} />
              </>
            )}

            {/* Strategy (§3.4) — operation-level clearing behaviour for route/pocket
                and over-width grooves. Physics (feeds/speeds) stays in the tool library. */}
            {(selected.operation_type === 'route' || selected.operation_type === 'groove') && (
              <>
                <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pt-1">Strategy</span>
                <span className="text-gray-500">Fill</span>
                <select value={selected.fill_strategy ?? ''} disabled={selLocked}
                  onChange={e => patchOp({ fill_strategy: e.target.value || null })}
                  className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-100 disabled:text-gray-500 disabled:bg-gray-900/60 focus:outline-none focus:border-blue-500">
                  <option value="">—</option>
                  <option value="raster">raster</option>
                  <option value="offset">offset</option>
                </select>
                <span className="text-gray-500">Stepover %</span>
                <NumField key={`${selected.id}-step`} value={selected.raster_stepover_pct} disabled={selLocked} onCommit={x => patchOp({ raster_stepover_pct: x })} />
                {selected.fill_strategy === 'raster' && (
                  <>
                    <span className="text-gray-500">Raster°</span>
                    <NumField key={`${selected.id}-rang`} value={selected.raster_angle_deg} disabled={selLocked} onCommit={x => patchOp({ raster_angle_deg: x })} />
                  </>
                )}
              </>
            )}

            <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pt-1">Angle</span>
            <span className="text-gray-500">ax</span>
            <NumField key={`${selected.id}-ax`} value={selected.angle_ax} disabled={selLocked} onCommit={x => patchOp({ angle_ax: x })} />
            <span className="text-gray-500">ay</span>
            <NumField key={`${selected.id}-ay`} value={selected.angle_ay} disabled={selLocked} onCommit={x => patchOp({ angle_ay: x })} />
            <span className="text-gray-500">az</span>
            <NumField key={`${selected.id}-az`} value={selected.angle_az} disabled={selLocked} onCommit={x => patchOp({ angle_az: x })} />

            <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pt-1">Plane / output</span>
            {selLocked ? (
              <>
                <PropRow label="Plane" value={PLANE_KIND_LABEL[selected.plane_kind ?? 'face_front'] ?? selected.plane_kind} />
                {selected.plane_kind === 'edge' && (
                  <PropRow label="Edge" value={selected.plane_edge_index != null ? `${selected.plane_edge_index} · ${PLANE_EDGES[selected.plane_edge_index] ?? '?'}` : '—'} />
                )}
              </>
            ) : (
              <>
                <span className="text-gray-500 self-center">Plane</span>
                <select value={selected.plane_kind ?? 'face_front'}
                  onChange={e => { const pk = e.target.value; patchOp(pk === 'edge' ? { plane_kind: pk } : { plane_kind: pk, plane_edge_index: null }); if (pk !== 'edge') onPlanePickChange(false) }}
                  className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-100 focus:outline-none focus:border-blue-500">
                  {PLANE_KINDS.map(pk => <option key={pk} value={pk}>{PLANE_KIND_LABEL[pk]}</option>)}
                </select>
                {selected.plane_kind === 'edge' && (
                  <>
                    <span className="text-gray-500 self-center">Edge</span>
                    <div className="flex gap-1 justify-end items-center">
                      <select value={selected.plane_edge_index ?? ''}
                        onChange={e => patchOp({ plane_edge_index: e.target.value === '' ? null : Number(e.target.value) })}
                        className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-100 focus:outline-none focus:border-blue-500">
                        <option value="">—</option>
                        {PLANE_EDGES.map((lbl, i) => <option key={i} value={i}>{i} · {lbl}</option>)}
                      </select>
                      <button type="button"
                        onClick={() => onPlanePickChange(!planePick)}
                        className={`px-1.5 py-0.5 rounded text-[10px] border ${planePick ? 'bg-violet-600 border-violet-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-violet-500'}`}>
                        {planePick ? 'Picking…' : 'Pick in view'}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
            <PropRow label="Out face" value={selected.output_face ?? '—'} />

            <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pt-1">Tool</span>
            <span className="text-gray-500 self-center">Tool set</span>
            <select value={selected.tool_set_id ?? ''} disabled={selLocked}
              onChange={e => patchOp({ tool_set_id: e.target.value || null })}
              className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-100 disabled:text-gray-500 disabled:bg-gray-900/60 focus:outline-none focus:border-blue-500">
              <option value="">— none —</option>
              {toolSets.map(ts => <option key={ts.id} value={ts.id}>{ts.name}</option>)}
            </select>
            {!selected.tool_set_id && (
              <>
                <span className="text-gray-500 self-center">Bit</span>
                <OperationToolSelect
                  operationType={selected.operation_type}
                  value={{ router_tool_id: selected.router_tool_id, drill_id: selected.drill_id, auto_tool: selected.auto_tool }}
                  tools={tools} drills={drills} disabled={selLocked}
                  onChange={val => patchOp({ router_tool_id: val.router_tool_id, drill_id: val.drill_id, auto_tool: val.auto_tool })}
                  className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-100 disabled:text-gray-500 disabled:bg-gray-900/60 focus:outline-none focus:border-blue-500"
                />
              </>
            )}

            <span className="text-gray-500 self-center">CNC output</span>
            <label className="flex items-center gap-1.5 justify-end">
              <input type="checkbox" checked={selected.output_to_cnc} disabled={selLocked}
                onChange={e => patchOp({ output_to_cnc: e.target.checked })}
                className="accent-blue-500 w-3.5 h-3.5 disabled:opacity-50" />
              <span className="text-gray-400 text-[10px]">{selected.output_to_cnc ? 'included' : 'excluded'}</span>
            </label>
          </div>

          <div className="mt-3 flex flex-col gap-1.5">
            {selLocked ? (
              <button onClick={() => convertToManual()}
                className="w-full text-[11px] px-2 py-1 rounded border border-amber-700/60 text-amber-300 hover:bg-amber-900/30 transition-colors">
                Convert to manual override
              </button>
            ) : (
              <button onClick={() => deleteSelected()}
                className="w-full text-[11px] px-2 py-1 rounded border border-red-800/60 text-red-300 hover:bg-red-900/30 transition-colors">
                Delete operation
              </button>
            )}
          </div>
          <div className="mt-2 text-[10px] text-gray-600 leading-snug">
            Drag markers in the Front view to place. Undo with ↺ / Ctrl+Z.
          </div>
          </>
          )}
        </div>
      ) : (
        <div className="p-4 text-xs text-gray-500">
          Select an operation to see and edit its properties.
        </div>
      )}
    </div>
  )
}
