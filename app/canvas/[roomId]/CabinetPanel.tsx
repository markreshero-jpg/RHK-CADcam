'use client'

import PanelDeleteButton, { PanelCloseButton } from './PanelDeleteButton'
import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import { Room, Wall, CabinetInstance, NeighbourType, TopType, ToeType } from '@/src/lib/types'
import { cabT, findFreeSlot, cabsBlock, cabBottomZ, slideAlongWall, cabWallGap, cabWallSide, wallAnchorPoint, type RoomRef } from '@/src/lib/geometry'
import { getCachedInput } from '@/src/lib/resolver/resolveCabinetFromDB'
import CalcInput from '@/src/components/CalcInput'
import CabinetShapeSection from './CabinetShapeSection'
import BulkheadSection from './BulkheadSection'
import CurvedEndSection from './CurvedEndSection'
import FloatShelfSection from './FloatShelfSection'
import BackPanelSection from './BackPanelSection'
import { canFloat, isFloating, floatingPatch, FLOAT_Z } from '@/src/lib/floating'

export default function CabinetPanel({ cabinet, wall, wallCabinets, room, roomRef, onUpdate, onDelete, onClose, hideWallPosition, hideDelete, autoFocusWidth }: {
  cabinet: CabinetInstance
  wall: Wall | null
  /** centroid(walls) — which way is into the room. Omitted → no "Off wall" field. */
  roomRef?: RoomRef
  wallCabinets: CabinetInstance[]
  room: Room | null
  onUpdate: (id: string, u: Partial<CabinetInstance>) => Promise<void>
  onDelete: (id: string) => void | Promise<void>
  /** Header ✕ — closes (deselects). Omitted → no ✕. */
  onClose?: () => void
  hideWallPosition?: boolean
  hideDelete?: boolean
  /** Focus the width field when the panel opens, so Tab flows width → height → depth. */
  autoFocusWidth?: boolean
}) {
  const [local, setLocal] = useState<Partial<CabinetInstance>>({})
  const [saving, setSaving] = useState(false)
  // Handle schedules for the per-cabinet override (z_handles D7) — stored in
  // hardware_overrides.handle_schedule_id, read by loadCabinetInput.
  const [handleSchedules, setHandleSchedules] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    let cancelled = false
    void supabase.from('handle_schedules').select('id, name').eq('active', true).order('name')
      .then(({ data }) => { if (!cancelled) setHandleSchedules((data ?? []) as { id: string; name: string }[]) })
    return () => { cancelled = true }
  }, [])
  function f<K extends keyof CabinetInstance>(k: K) { return (k in local ? local[k] : cabinet[k]) as CabinetInstance[K] }
  function set<K extends keyof CabinetInstance>(k: K, v: CabinetInstance[K]) { setLocal(l => ({ ...l, [k]: v })) }
  async function save() {
    if (!Object.keys(local).length) return
    setSaving(true); await onUpdate(cabinet.id, local); setLocal({}); setSaving(false)
  }
  const inp = 'w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500'
  const lbl = 'text-[10px] text-gray-500 uppercase tracking-wider mb-0.5 block'

  const meas = wall ? (() => {
    const t = cabT(cabinet, wall)
    // Only cabinets that actually overlap this one vertically count as left/right
    // neighbours — a wall unit's clearances ignore base units below it, and vice versa.
    const others = wallCabinets
      .filter(c => c.id !== cabinet.id && (room ? cabsBlock(cabinet, c, wall, room) : true))
      .map(c => ({ t: cabT(c, wall), dx: c.dx }))
    const leftN  = others.filter(o => o.t + o.dx <= t + 1).sort((a, b) => b.t - a.t)[0]
    const rightN = others.filter(o => o.t >= t + cabinet.dx - 1).sort((a, b) => a.t - b.t)[0]
    return {
      posLeft:    Math.round(t),
      posRight:   Math.round(wall.length - (t + cabinet.dx)),
      clearLeft:  Math.round(leftN  ? t - (leftN.t + leftN.dx)  : t),
      clearRight: Math.round(rightN ? rightN.t - (t + cabinet.dx) : wall.length - (t + cabinet.dx)),
      leftN, rightN,
    }
  })() : null

  const elevFromFloor = room ? Math.round(cabBottomZ(cabinet, room, wall)) : cabinet.pos_z

  return (
    <div className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <p className="text-xs font-mono font-medium text-gray-300">{cabinet.label ?? '—'}</p>
          <p className="text-[10px] text-gray-500 capitalize">{cabinet.assembly_class.replace('_', ' ')}</p>
        </div>
        {onClose && <PanelCloseButton onClose={onClose} />}
      </div>
      <div className="p-4 space-y-3">
        <div>
          <label className={lbl}>Label</label>
          <input value={(f('label') as string) ?? ''} onChange={e => set('label', e.target.value || null)}
            onBlur={save} className={inp} />
        </div>

        <div>
          <label className={lbl}>Elevation from floor (mm)</label>
          <CalcInput
            value={elevFromFloor}
            decimals={1}
            onCommit={v => onUpdate(cabinet.id, { pos_z: v })}
            className={inp + ' text-right'} />
        </div>

        {meas && wall && !hideWallPosition && (
          <div>
            <p className={lbl}>Wall position</p>
            {/* Left / centre / right X, all from the wall's left end — type one to move the cabinet there. */}
            <div className="grid grid-cols-3 gap-1 mb-1">
              {([['Left X', 0], ['Centre X', 0.5], ['Right X', 1]] as const).map(([name, k]) => (
                <div key={name}>
                  <p className="text-[9px] text-gray-500 mb-0.5">{name}</p>
                  <CalcInput
                    value={Math.round((meas.posLeft + cabinet.dx * k) * 10) / 10}
                    decimals={1}
                    onCommit={v => {
                      const occ = wallCabinets.filter(c => c.id !== cabinet.id).map(c => ({ t: cabT(c, wall), dx: c.dx }))
                      const t = findFreeSlot(v - cabinet.dx * k, cabinet.dx, wall.length, occ)
                      const p = slideAlongWall(cabinet, wall, t)
                      onUpdate(cabinet.id, { pos_x: p.x, pos_y: p.y })
                    }}
                    className={inp + ' text-right'} />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <p className="text-[9px] text-gray-500 mb-0.5">From left end</p>
                <CalcInput
                  value={meas.posLeft}
                  decimals={1}
                  onCommit={v => {
                    const occ = wallCabinets.filter(c => c.id !== cabinet.id).map(c => ({ t: cabT(c, wall), dx: c.dx }))
                    const t = findFreeSlot(v, cabinet.dx, wall.length, occ)
                    const p = slideAlongWall(cabinet, wall, t)
                    onUpdate(cabinet.id, { pos_x: p.x, pos_y: p.y })
                  }}
                  className={inp + ' text-right'} />
              </div>
              <div>
                <p className="text-[9px] text-gray-500 mb-0.5">From right end</p>
                <CalcInput
                  value={meas.posRight}
                  decimals={1}
                  onCommit={v => {
                    const newT = wall.length - v - cabinet.dx
                    const occ = wallCabinets.filter(c => c.id !== cabinet.id).map(c => ({ t: cabT(c, wall), dx: c.dx }))
                    const t = findFreeSlot(newT, cabinet.dx, wall.length, occ)
                    const p = slideAlongWall(cabinet, wall, t)
                    onUpdate(cabinet.id, { pos_x: p.x, pos_y: p.y })
                  }}
                  className={inp + ' text-right'} />
              </div>
              <div>
                <p className="text-[9px] text-gray-500 mb-0.5">Clear left</p>
                <CalcInput
                  value={meas.clearLeft}
                  decimals={1}
                  onCommit={v => {
                    const lN = meas.leftN
                    const desiredT = lN ? lN.t + lN.dx + v : v
                    const occ = wallCabinets.filter(c => c.id !== cabinet.id).map(c => ({ t: cabT(c, wall), dx: c.dx }))
                    const t = findFreeSlot(desiredT, cabinet.dx, wall.length, occ)
                    const p = slideAlongWall(cabinet, wall, t)
                    onUpdate(cabinet.id, { pos_x: p.x, pos_y: p.y })
                  }}
                  className={`${inp} text-right ${meas.clearLeft < 0 ? 'text-red-400' : ''}`} />
              </div>
              <div>
                <p className="text-[9px] text-gray-500 mb-0.5">Clear right</p>
                <CalcInput
                  value={meas.clearRight}
                  decimals={1}
                  onCommit={v => {
                    const rN = meas.rightN
                    const desiredT = rN ? rN.t - v - cabinet.dx : wall.length - v - cabinet.dx
                    const occ = wallCabinets.filter(c => c.id !== cabinet.id).map(c => ({ t: cabT(c, wall), dx: c.dx }))
                    const t = findFreeSlot(desiredT, cabinet.dx, wall.length, occ)
                    const p = slideAlongWall(cabinet, wall, t)
                    onUpdate(cabinet.id, { pos_x: p.x, pos_y: p.y })
                  }}
                  className={`${inp} text-right ${meas.clearRight < 0 ? 'text-red-400' : ''}`} />
              </div>
              {roomRef && (
                <div>
                  <p className="text-[9px] text-gray-500 mb-0.5">Off wall</p>
                  <CalcInput
                    value={cabWallGap(cabinet, wall, roomRef)}
                    decimals={1}
                    onCommit={v => {
                      const p = wallAnchorPoint(wall, cabT(cabinet, wall), cabWallSide(cabinet, wall) === 'back', roomRef, Math.max(0, v))
                      onUpdate(cabinet.id, { pos_x: p.x, pos_y: p.y })
                    }}
                    className={inp + ' text-right'} />
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <p className={lbl}>Dimensions (mm)</p>
          <div className="grid grid-cols-3 gap-1.5">
            {(['dx', 'dy', 'dz'] as const).map(dim => (
              <div key={dim}>
                <p className="text-[10px] text-gray-600 text-center mb-0.5 uppercase">{dim}</p>
                <CalcInput value={f(dim) as number} decimals={1}
                  autoFocus={autoFocusWidth && dim === 'dx'}
                  onCommit={v => onUpdate(cabinet.id, {
                    [dim]: v,
                    // A typed bulkhead height is the user's — stop following the ceiling.
                    ...(dim === 'dy' && cabinet.bulkhead?.auto_h ? { bulkhead: { ...cabinet.bulkhead, auto_h: false } } : {}),
                  })}
                  className={inp + ' text-right'} />
              </div>
            ))}
          </div>
        </div>
        {cabinet.has_carcass && !cabinet.is_kick_assembly && (
          <CabinetShapeSection cabinet={cabinet} wall={wall} onUpdate={onUpdate} inp={inp} lbl={lbl} />
        )}
        {cabinet.bulkhead && (
          <BulkheadSection cabinet={cabinet} wall={wall} room={room} onUpdate={onUpdate} inp={inp} lbl={lbl} />
        )}
        {cabinet.float_shelf && (
          <FloatShelfSection cabinet={cabinet} onUpdate={onUpdate} inp={inp} lbl={lbl} />
        )}
        {cabinet.back_panel && (
          <BackPanelSection cabinet={cabinet} onUpdate={onUpdate} inp={inp} lbl={lbl} />
        )}
        {cabinet.curved_end && (
          <CurvedEndSection cabinet={cabinet} onUpdate={onUpdate} inp={inp} lbl={lbl} />
        )}
        <div>
          <label className={lbl}>Top Type</label>
          <select value={(f('top_type') as string) ?? 'front_rail'}
            onChange={async e => onUpdate(cabinet.id, { top_type: e.target.value as TopType })} className={inp}>
            <option value="front_rail">Front Rail</option>
            <option value="full_top">Full Top</option>
            <option value="double_rail">Double Rail</option>
            <option value="none">None</option>
          </select>
          {/* Rail orientation (z_cabinet_shape L1) — rule_overrides.RAIL_ORIENT */}
          {((f('top_type') as string) ?? 'front_rail') !== 'full_top' && (f('top_type') as string) !== 'none' && (() => {
            const cur = (cabinet.rule_overrides ?? {}).RAIL_ORIENT
            const inherited = getCachedInput(cabinet.id)?.rules_base?.RAIL_ORIENT ?? 'horizontal'
            const name = (v: string) => v === 'vertical' ? 'on edge (vertical)' : 'flat (horizontal)'
            return (
              <select
                value={cur === 'horizontal' || cur === 'vertical' ? cur : ''}
                onChange={e => {
                  const next = { ...(cabinet.rule_overrides ?? {}) }
                  if (e.target.value === '') delete next.RAIL_ORIENT
                  else next.RAIL_ORIENT = e.target.value
                  void onUpdate(cabinet.id, { rule_overrides: next })
                }}
                className={inp + ' mt-1'}
              >
                <option value="">Rails: inherit ({name(inherited)})</option>
                <option value="horizontal">Rails: flat (horizontal)</option>
                <option value="vertical">Rails: on edge (vertical)</option>
              </select>
            )
          })()}
        </div>
        {/* Back (z_ubo U1) — rule_overrides.BACK_TYPE */}
        {cabinet.has_carcass && !cabinet.is_kick_assembly && (() => {
          const cur = (cabinet.rule_overrides ?? {}).BACK_TYPE
          const inherited = getCachedInput(cabinet.id)?.rules_base?.BACK_TYPE ?? 'panel'
          const name = (v: string) => v === 'none' ? 'no back' : v === 'rail' ? 'back rail' : 'back panel'
          return (
            <div>
              <label className={lbl}>Back</label>
              <select
                value={cur === 'panel' || cur === 'none' || cur === 'rail' ? cur : ''}
                onChange={e => {
                  const next = { ...(cabinet.rule_overrides ?? {}) }
                  if (e.target.value === '') delete next.BACK_TYPE
                  else next.BACK_TYPE = e.target.value
                  void onUpdate(cabinet.id, { rule_overrides: next })
                }}
                className={inp}
              >
                <option value="">Inherit ({name(inherited)})</option>
                <option value="panel">Back panel</option>
                <option value="none">No back</option>
                <option value="rail">Back rail (top, on edge)</option>
              </select>
            </div>
          )
        })()}
        {(cabinet.assembly_class === 'base' || cabinet.assembly_class === 'tall' ||
          cabinet.assembly_class === 'base_corner' || cabinet.assembly_class === 'tall_corner') && (
          <div>
            <label className={lbl}>Toe Kick</label>
            <select value={(f('toe_type') as string) ?? 'ladder'}
              onChange={async e => onUpdate(cabinet.id, { toe_type: e.target.value as ToeType })} className={inp}>
              <option value="ladder">Ladder Frame</option>
              <option value="leg">Leg</option>
              <option value="none">None</option>
            </select>
          </div>
        )}
        <div>
          <p className={lbl}>Neighbours</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(['left_neighbour_type', 'right_neighbour_type'] as const).map(side => (
              <div key={side}>
                <p className="text-[10px] text-gray-600 mb-0.5 capitalize">{side.split('_')[0]}</p>
                <select value={(f(side) as string) ?? 'wall'}
                  onChange={async e => onUpdate(cabinet.id, { [side]: e.target.value as NeighbourType })} className={inp}>
                  <option value="wall">Wall</option>
                  <option value="cabinet">Cabinet</option>
                  <option value="end_panel">End Panel</option>
                  <option value="freestanding">Freestanding</option>
                </select>
              </div>
            ))}
          </div>
        </div>
        {f('has_face') && (
          <div>
            <p className={lbl}>Handle schedule</p>
            <select
              value={((cabinet.hardware_overrides ?? {}).handle_schedule_id as string | undefined) ?? ''}
              onChange={e => {
                const next = { ...(cabinet.hardware_overrides ?? {}) }
                if (e.target.value) next.handle_schedule_id = e.target.value; else delete next.handle_schedule_id
                void onUpdate(cabinet.id, { hardware_overrides: next })
              }}
              className={inp}
            >
              <option value="">Inherit (room / job)</option>
              {handleSchedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {/* Handle holes (z_handles D13) — rule_overrides.HANDLE_DRILL */}
            {(() => {
              const cur = (cabinet.rule_overrides ?? {}).HANDLE_DRILL
              const inherited = getCachedInput(cabinet.id)?.rules_base?.HANDLE_DRILL ?? true
              return (
                <select
                  value={cur === true ? 'on' : cur === false ? 'off' : ''}
                  onChange={e => {
                    const next = { ...(cabinet.rule_overrides ?? {}) }
                    if (e.target.value === '') delete next.HANDLE_DRILL
                    else next.HANDLE_DRILL = e.target.value === 'on'
                    void onUpdate(cabinet.id, { rule_overrides: next })
                  }}
                  className={inp + ' mt-1'}
                >
                  <option value="">Holes: inherit ({inherited ? 'drill' : 'off'})</option>
                  <option value="on">Holes: drill</option>
                  <option value="off">Holes: don&apos;t drill</option>
                </select>
              )
            })()}
            {/* Finger-pull backing rails (z_handles H6) — rule_overrides.FPRAIL */}
            {(() => {
              const cur = (cabinet.rule_overrides ?? {}).FPRAIL
              const inherited = getCachedInput(cabinet.id)?.rules_base?.FPRAIL ?? true
              return (
                <select
                  value={cur === true ? 'on' : cur === false ? 'off' : ''}
                  onChange={e => {
                    const next = { ...(cabinet.rule_overrides ?? {}) }
                    if (e.target.value === '') delete next.FPRAIL
                    else next.FPRAIL = e.target.value === 'on'
                    void onUpdate(cabinet.id, { rule_overrides: next })
                  }}
                  className={inp + ' mt-1'}
                >
                  <option value="">Finger rails: inherit ({inherited ? 'on' : 'off'})</option>
                  <option value="on">Finger rails: on</option>
                  <option value="off">Finger rails: off</option>
                </select>
              )
            })()}
            {/* Rail grain (z_handles H6) — rule_overrides.RAILGRAIN */}
            {(() => {
              const cur = (cabinet.rule_overrides ?? {}).RAILGRAIN
              const inherited = getCachedInput(cabinet.id)?.rules_base?.RAILGRAIN ?? 'horizontal'
              return (
                <select
                  value={cur === 'horizontal' || cur === 'vertical' ? cur : ''}
                  onChange={e => {
                    const next = { ...(cabinet.rule_overrides ?? {}) }
                    if (e.target.value === '') delete next.RAILGRAIN
                    else next.RAILGRAIN = e.target.value
                    void onUpdate(cabinet.id, { rule_overrides: next })
                  }}
                  className={inp + ' mt-1'}
                >
                  <option value="">Rail grain: inherit ({inherited})</option>
                  <option value="horizontal">Rail grain: horizontal</option>
                  <option value="vertical">Rail grain: vertical</option>
                </select>
              )
            })()}
            {/* Finger gap (z_handles D4) — rule_overrides.FPGAP; only applies
                where a front's grip needs one (sharknose, rail). */}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-gray-500 shrink-0">Finger gap</span>
              <CalcInput
                value={typeof (cabinet.rule_overrides ?? {}).FPGAP === 'number' ? (cabinet.rule_overrides.FPGAP as number) : null}
                decimals={1}
                min={0}
                placeholder={String(getCachedInput(cabinet.id)?.rules_base?.FPGAP ?? 20)}
                onCommit={v => {
                  const next = { ...(cabinet.rule_overrides ?? {}) }
                  next.FPGAP = v
                  void onUpdate(cabinet.id, { rule_overrides: next })
                }}
                onClear={() => {
                  const next = { ...(cabinet.rule_overrides ?? {}) }
                  delete next.FPGAP
                  void onUpdate(cabinet.id, { rule_overrides: next })
                }}
                className={inp + ' text-right'}
              />
            </div>
          </div>
        )}
        <div>
          <p className={lbl}>Scribes (mm)</p>
          <div className="grid grid-cols-3 gap-1">
            {(['SCRL', 'SCRR', 'SCRT', 'SCRBT', 'SCRBK'] as const).map((key, i) => {
              const label = ['Left', 'Right', 'Top', 'Bottom', 'Back'][i]
              const cur = typeof (cabinet.rule_overrides ?? {})[key] === 'number'
                ? cabinet.rule_overrides[key] as number : 0
              return (
                <div key={key}>
                  <p className="text-[10px] text-gray-600 mb-0.5">{label}</p>
                  <CalcInput
                    value={cur}
                    decimals={1}
                    onCommit={v => {
                      const next = { ...(cabinet.rule_overrides ?? {}) }
                      if (v === 0) delete next[key]; else next[key] = v
                      void onUpdate(cabinet.id, { rule_overrides: next })
                    }}
                    className={inp + ' text-right'}
                  />
                </div>
              )
            })}
          </div>
        </div>
        {cabinet.has_toekick && (() => {
          const rules = getCachedInput(cabinet.id)?.rules
          const ov = (cabinet.rule_overrides ?? {}) as Record<string, number>
          return (
            <div>
              <p className={lbl}>Kick Scribes (mm)</p>
              <div className="grid grid-cols-4 gap-1">
                {(['TOESCF', 'TOESCB', 'TOESCL', 'TOESCR'] as const).map((key, i) => {
                  const label = ['Front', 'Back', 'Left', 'Right'][i]
                  return (
                    <div key={key}>
                      <p className="text-[10px] text-gray-600 mb-0.5">{label}</p>
                      <CalcInput
                        value={ov[key] ?? null}
                        decimals={1}
                        min={0}
                        placeholder={rules ? String(Math.round(rules[key] * 10) / 10) : ''}
                        onCommit={v => {
                          const next = { ...(cabinet.rule_overrides ?? {}) }
                          next[key] = v
                          void onUpdate(cabinet.id, { rule_overrides: next })
                        }}
                        onClear={() => {
                          const next = { ...(cabinet.rule_overrides ?? {}) }
                          delete next[key]
                          void onUpdate(cabinet.id, { rule_overrides: next })
                        }}
                        className={inp + ' text-right'}
                      />
                    </div>
                  )
                })}
              </div>
              <p className="text-[10px] text-gray-600 mt-1">Blank = inherited from the construction method.</p>
            </div>
          )
        })()}

        {/* Floating (z_floating) — rule_overrides.FLOAT */}
        {canFloat(cabinet) && (() => {
          const floating = isFloating(cabinet)
          const inKickRun = !!cabinet.kick_run_id
          const kickH = Number(getCachedInput(cabinet.id)?.rules?.TOEH ?? 150)
          return (
            <div>
              <p className={lbl}>Floating</p>
              <label className={`flex items-center gap-2 ${inKickRun ? 'opacity-50' : 'cursor-pointer'}`}>
                <input type="checkbox" checked={floating} disabled={inKickRun}
                  onChange={e => void onUpdate(cabinet.id, floatingPatch(cabinet, e.target.checked, kickH))}
                  className="accent-blue-500" />
                <span className="text-xs text-gray-400">Wall-hung, no kick</span>
              </label>
              <p className="text-[10px] text-gray-600 mt-1">
                {inKickRun ? 'Detach it from the kick run first.'
                  : floating ? 'Gable tops and bottoms are taped. For an exposed panel under the run, right-click the cabinets → Add under panel.'
                  : `Drops the kick and hangs it ${FLOAT_Z} off the floor.`}
              </p>
            </div>
          )
        })()}

        <div>
          <p className={lbl}>Modules</p>
          <div className="space-y-1">
            {([['has_carcass', 'Carcass'], ['has_internal', 'Internal'], ['has_face', 'Face / Doors'], ['has_toekick', 'Toe Kick']] as [keyof CabinetInstance, string][]).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={f(k) as boolean}
                  onChange={async e => onUpdate(cabinet.id, { [k]: e.target.checked })} className="accent-blue-500" />
                <span className="text-xs text-gray-400">{label}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className={lbl}>Notes</label>
          <textarea value={(f('notes') as string) ?? ''} onChange={e => set('notes', e.target.value || null)}
            onBlur={save} rows={2} className={inp + ' resize-none'} />
        </div>
      </div>
      {!hideDelete && <PanelDeleteButton label="Delete cabinet" onDelete={() => void onDelete(cabinet.id)} />}
      {saving && <div className="px-4 py-2 border-t border-gray-800 text-[10px] text-gray-500">Saving…</div>}
    </div>
  )
}
