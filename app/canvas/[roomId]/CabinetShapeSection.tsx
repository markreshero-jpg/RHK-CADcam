'use client'

// Shape section of the cabinet panel — z_cabinet_shape Phase 1. Picks a shape
// preset, edits its params and per-edge roles. Writes `footprint` only; the
// plan outline re-evaluates it at the cabinet's live size.

import { CabinetInstance } from '@/src/lib/types'
import CalcInput from '@/src/components/CalcInput'
import { EDGE_ROLES, type EdgeRole } from '@/src/lib/cabinetShape/footprint'
import {
  SHAPE_PRESETS, getPreset, buildPresetFootprint, presetWarnings,
} from '@/src/lib/cabinetShape/presets'

const EDGE_LABELS: Record<string, string> = {
  back: 'Back', back2: 'Back (corner wall)', end: 'End', facet: 'Angled facet',
  front: 'Front', side: 'Side', curve: 'Curve', left: 'Left', right: 'Right',
}

export default function CabinetShapeSection({ cabinet, onUpdate, inp, lbl }: {
  cabinet: CabinetInstance
  onUpdate: (id: string, u: Partial<CabinetInstance>) => Promise<void>
  inp: string
  lbl: string
}) {
  const fp = cabinet.footprint ?? null
  const preset = getPreset(fp?.preset)
  const dims = { w: cabinet.dx, d: cabinet.dz }

  function setFootprint(next: CabinetInstance['footprint']) {
    void onUpdate(cabinet.id, { footprint: next })
  }

  function choosePreset(key: string) {
    if (!key) return setFootprint(null)
    setFootprint(buildPresetFootprint(key, {}, dims))
  }

  function setParam(k: string, v: number | string) {
    if (!fp?.preset) return
    setFootprint(buildPresetFootprint(fp.preset, { ...fp.params, [k]: v }, dims, fp.role_overrides))
  }

  function setRole(edgeId: string, role: EdgeRole) {
    if (!fp) return
    const role_overrides = { ...(fp.role_overrides ?? {}), [edgeId]: role }
    if (fp.preset) return setFootprint(buildPresetFootprint(fp.preset, fp.params, dims, role_overrides))
    setFootprint({
      ...fp, role_overrides,
      segments: fp.segments.map(s => s.edge.id === edgeId ? { ...s, edge: { ...s.edge, role } } : s),
    })
  }

  const warnings = fp?.preset ? presetWarnings(fp.preset, fp.params, dims) : []

  return (
    <div className="border-t border-gray-800 pt-3 space-y-2">
      <label className={lbl}>Shape</label>
      <select value={fp?.preset ?? (fp ? '__custom' : '')} onChange={e => choosePreset(e.target.value)} className={inp}>
        <option value="">Rectangle</option>
        {SHAPE_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        {fp && !fp.preset && <option value="__custom" disabled>Custom (hand-edited)</option>}
      </select>

      {preset && fp && (
        <>
          {preset.sided && (
            <div>
              <label className={lbl}>Shaped end</label>
              <div className="flex gap-1">
                {(['left', 'right'] as const).map(s => (
                  <button key={s} onClick={() => setParam('side', s)}
                    className={`flex-1 text-xs py-1 rounded border ${fp.params.side === s
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}>
                    {s === 'left' ? 'Left' : 'Right'}
                  </button>
                ))}
              </div>
            </div>
          )}
          {preset.params.map(d => (
            <div key={d.key}>
              <label className={lbl}>{d.label} (mm)</label>
              <CalcInput value={Number(fp.params[d.key] ?? d.default)} decimals={0}
                onCommit={v => setParam(d.key, v)} className={inp + ' text-right'} />
            </div>
          ))}
        </>
      )}

      {fp && (
        <div>
          <label className={lbl}>Edges</label>
          <div className="space-y-1">
            {fp.segments.map(s => (
              <div key={s.edge.id} className="flex items-center gap-2">
                <span className="text-[11px] text-gray-400 w-24 truncate">{EDGE_LABELS[s.edge.id] ?? s.edge.id}</span>
                <select value={s.edge.role} onChange={e => setRole(s.edge.id, e.target.value as EdgeRole)}
                  className={inp + ' flex-1'}>
                  {EDGE_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {warnings.map(w => <p key={w} className="text-[10px] text-amber-400">{w}</p>)}
      {fp && (
        <p className="text-[10px] text-gray-500">
          Carcass and shelves follow the shape. Doors, toe kick and elevations are still box-built (Phases 3–5).
        </p>
      )}
    </div>
  )
}
