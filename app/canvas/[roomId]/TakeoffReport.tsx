'use client'
// Hardware Pick List + Takeoff reports (z_takeoff/TAKEOFF-SPEC.md).
//  - Pick List: per room, every hardware product with its qty, a tick box and
//    the cabinets it goes in — for the floor to pick the job.
//  - Takeoff: per room, cabinet counts (base / wall / tall + end panels,
//    fillers, bulkheads, shadowlines, floating shelves), finger pulls, sheets
//    per material (each room nested on its own), edgetape metres and hardware;
//    then the job totals — for keying into the quoting system.
// Rollups: src/lib/takeoff/hardware.ts (hardware + counts), roomSheets.ts (nest),
// optimiser/edgebandLength.ts (tape). Hardware reads the resolved cabinets the
// modal holds (removed parts out); sheets + tape read the saved part snapshot
// the optimiser nests (loadProjectParts). Print HTML: TakeoffPrint.ts.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { Project, Room, CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { loadProjectParts } from '@/src/lib/optimiser/loadClient'
import type { NormalizedProject } from '@/src/lib/optimiser/normalize'
import type { OptiMaterial, OptiProfile, OptiTool } from '@/src/lib/optimiser/types'
import { buildEdgebandReport, type EdgebandProduct, type EdgebandBoard, type EdgebandLine } from '@/src/lib/optimiser/edgebandLength'
import {
  buildHardware, countKinds, KIND_LABEL, GRIP_LABEL, lengthsText, unitLabel,
  type HardwareProducts, type HardwareProduct, type HardwareLine, type FingerPullLine, type KindCount, type TakeoffCab,
} from '@/src/lib/takeoff/hardware'
import { nestRoomsAndJob, type SheetLine } from '@/src/lib/takeoff/roomSheets'

const m2 = (m: number) => m.toFixed(2)
const pct = (v: number) => `${Math.round(v * 100)}%`

// ── Data ─────────────────────────────────────────────────────────────────────

export interface TakeoffRoom {
  room: Room
  kinds: KindCount[]
  hardware: HardwareLine[]
  fingerPulls: FingerPullLine[]
  sheets: SheetLine[] | null          // null = still nesting
  sheetNotes: string[]
  tape: EdgebandLine[]
}

export interface TakeoffData {
  rooms: TakeoffRoom[]
  kinds: KindCount[]
  hardware: HardwareLine[]
  fingerPulls: FingerPullLine[]
  /** Sum of the per-room nests, per material. */
  sheetsByRoom: SheetLine[] | null
  /** The rooms nested together. */
  sheetsJob: SheetLine[] | null
  tape: EdgebandLine[]
  tapeWaste: number
}

type ProductRow = { id: string; name: string; brand?: string | null; supplier_code?: string | null }
const toMap = (rows: ProductRow[] | null) =>
  new Map<string, HardwareProduct>((rows ?? []).map(r => [r.id, { name: r.name, brand: r.brand ?? null, code: r.supplier_code ?? null }]))

function sumSheetLines(lists: SheetLine[][]): SheetLine[] {
  const by = new Map<string, SheetLine>()
  for (const l of lists.flat()) {
    const e = by.get(l.groupKey)
    if (!e) { by.set(l.groupKey, { ...l }); continue }
    e.efficiency = (e.efficiency * e.sheets + l.efficiency * l.sheets) / Math.max(1, e.sheets + l.sheets)
    e.sheets += l.sheets; e.parts += l.parts; e.sheetEquiv += l.sheetEquiv
  }
  return [...by.values()].sort((a, b) => a.material.localeCompare(b.material) || a.thickness - b.thickness)
}

/** Loads what the two reports need while `active`; nests once the parts are in. */
export function useTakeoff({ active, project, rooms, cabinets, resolved }: {
  active: boolean
  project: Project | null
  rooms: Room[]
  cabinets: CabinetInstance[]
  resolved: Map<string, ResolvedCabinet>
}): { data: TakeoffData | null; loading: boolean; nesting: boolean } {
  const [codes, setCodes] = useState<Map<string, string> | null>(null)
  const [products, setProducts] = useState<HardwareProducts | null>(null)
  const [opti, setOpti] = useState<{ norm: NormalizedProject; materials: OptiMaterial[]; profiles: OptiProfile[]; tools: OptiTool[]; profileId: string | null; eb: Map<string, EdgebandProduct>; boards: Map<string, EdgebandBoard> } | null>(null)
  const [nested, setNested] = useState<{ key: string; res: ReturnType<typeof nestRoomsAndJob> } | null>(null)
  const tapeWaste = (() => {
    try { const raw = localStorage.getItem('rhk.edgebandWastePct'); return raw != null && Number(raw) >= 0 ? Number(raw) / 100 : 0.1 } catch { return 0.1 }
  })()

  // Library codes of the placed definitions (what counts as a cabinet / panel / filler …).
  const defKey = [...new Set(cabinets.map(c => c.cabinet_definition_id).filter((x): x is string => !!x))].sort().join(',')
  useEffect(() => {
    if (!active) return
    const ids = defKey ? defKey.split(',') : []
    let cancelled = false
    void (ids.length ? supabase.from('cabinet_definitions').select('id,name').in('id', ids) : Promise.resolve({ data: [] as { id: string; name: string }[] }))
      .then(({ data }) => { if (!cancelled) setCodes(new Map((data ?? []).map(d => [d.id as string, d.name as string]))) })
    return () => { cancelled = true }
  }, [active, defKey])

  useEffect(() => {
    if (!active || products) return
    let cancelled = false
    void Promise.all([
      supabase.from('hardware_hinges').select('id,name,brand,supplier_code'),
      supabase.from('hardware_hinge_plates').select('id,name,brand,supplier_code'),
      supabase.from('hardware_slides').select('id,name,brand'),
      supabase.from('hardware_handles').select('id,name,brand'),
      supabase.from('hardware_accessories').select('id,name,brand,supplier_code'),
    ]).then(([h, p, s, hd, a]) => {
      if (cancelled) return
      setProducts({
        hinges: toMap(h.data as ProductRow[]), plates: toMap(p.data as ProductRow[]), slides: toMap(s.data as ProductRow[]),
        handles: toMap(hd.data as ProductRow[]), accessories: toMap(a.data as ProductRow[]),
      })
    })
    return () => { cancelled = true }
  }, [active, products])

  // Saved part snapshot (as the optimiser loads it) + the nest / tape inputs.
  useEffect(() => {
    if (!active || !project || opti) return
    let cancelled = false
    void (async () => {
      const norm = await loadProjectParts(project.id)
      const banded = norm.parts.filter(p => p.eb_tape?.length)
      const tapeIds = [...new Set(banded.flatMap(p => p.eb_tape!.map(t => t.id).filter((id): id is string => !!id)))]
      const boardIds = [...new Set(banded.map(p => p.material_id).filter((id): id is string => !!id))]
      const [matR, machR, profR, toolR, ebR, bmR, kidR] = await Promise.all([
        supabase.from('materials').select('id,name,dz,sheet_dx,sheet_dy,has_grain,grain_direction,trim_top,trim_bottom,trim_left,trim_right,pad,cnc_tool_id,feed_rate_pct').eq('active', true),
        supabase.from('cnc_machines').select('id,is_default').eq('active', true).order('name'),
        supabase.from('cnc_machine_profiles').select('id,cnc_machine_id,name,is_default,nest_pad,tool_entry_offset,margin_use_tool_dia,margin_use_entry_offset,deduct_edgeband'),
        supabase.from('cnc_tools').select('id,diameter').eq('active', true),
        tapeIds.length ? supabase.from('edge_banding').select('id,name,brand,color,finish,material_match_id,thickness,width,cost_per_metre').in('id', tapeIds) : Promise.resolve({ data: [] }),
        boardIds.length ? supabase.from('materials').select('id,name').in('id', boardIds) : Promise.resolve({ data: [] }),
        boardIds.length ? supabase.from('materials').select('parent_id').in('parent_id', boardIds).eq('active', true) : Promise.resolve({ data: [] }),
      ])
      if (cancelled) return
      const machines = (machR.data ?? []) as { id: string; is_default: boolean }[]
      const profiles = (profR.data ?? []) as OptiProfile[]
      const machine = machines.find(m => m.is_default) ?? machines[0]
      const prof = profiles.find(p => p.cnc_machine_id === machine?.id && p.is_default) ?? profiles.find(p => p.cnc_machine_id === machine?.id)
      const parents = new Set(((kidR.data ?? []) as { parent_id: string }[]).map(k => k.parent_id))
      setOpti({
        norm, materials: (matR.data ?? []) as OptiMaterial[], profiles, tools: (toolR.data ?? []) as OptiTool[], profileId: prof?.id ?? null,
        eb: new Map(((ebR.data ?? []) as EdgebandProduct[]).map(p => [p.id, p])),
        boards: new Map(((bmR.data ?? []) as { id: string; name: string }[]).map(m => [m.id, { id: m.id, name: m.name, hasColours: parents.has(m.id) }])),
      })
    })()
    return () => { cancelled = true }
  }, [active, project, opti])

  // Nest off the render (a big job takes a moment), once per room set.
  const roomKey = rooms.map(r => r.id).join(',')
  useEffect(() => {
    if (!active || !opti || nested?.key === roomKey) return
    const t = setTimeout(() => {
      const ids = roomKey ? roomKey.split(',') : []
      setNested({ key: roomKey, res: nestRoomsAndJob({ ...opti.norm, materials: opti.materials, profiles: opti.profiles, tools: opti.tools, profileId: opti.profileId }, ids) })
    }, 30)
    return () => clearTimeout(t)
  }, [active, opti, roomKey, nested?.key])

  const data = useMemo<TakeoffData | null>(() => {
    if (!codes || !products) return null
    const ids = rooms.map(r => r.id)
    const tc: TakeoffCab[] = cabinets.map(c => ({
      id: c.id, room_id: c.room_id, label: c.label ?? null, assembly_class: c.assembly_class,
      is_kick_assembly: c.is_kick_assembly, bulkhead: c.bulkhead, float_shelf: c.float_shelf,
    }))
    const defOf = new Map(cabinets.map(c => [c.id, c.cabinet_definition_id]))
    const codeOf = (c: TakeoffCab) => { const d = defOf.get(c.id); return d ? codes.get(d) ?? null : null }
    const hw = buildHardware(ids, tc, resolved, products)
    const eb = opti ? buildEdgebandReport(opti.norm.parts.filter(p => ids.includes(p.room_id)), opti.eb, tapeWaste, ids, opti.boards) : null
    const nest = nested?.key === roomKey ? nested.res : null
    const roomsOut: TakeoffRoom[] = rooms.map((room, i) => {
      const ns = nest?.rooms.find(r => r.roomId === room.id)
      return {
        room,
        kinds: countKinds(tc.filter(c => c.room_id === room.id), codeOf),
        hardware: hw.rooms[i].lines,
        fingerPulls: hw.rooms[i].fingerPulls,
        sheets: ns ? ns.lines : null,
        sheetNotes: ns ? [...ns.unplaced.map(u => `Too big for a sheet: ${u}`), ...ns.stale.map(s => `Shape out of date, not nested: ${s}`)] : [],
        tape: eb?.rooms.find(r => r.roomId === room.id)?.lines ?? [],
      }
    })
    return {
      rooms: roomsOut,
      kinds: countKinds(tc.filter(c => ids.includes(c.room_id)), codeOf),
      hardware: hw.totals,
      fingerPulls: hw.fingerPulls,
      sheetsByRoom: nest ? sumSheetLines(nest.rooms.map(r => r.lines)) : null,
      sheetsJob: nest ? nest.job : null,
      tape: eb?.totals ?? [],
      tapeWaste,
    }
  }, [codes, products, rooms, cabinets, resolved, opti, nested, roomKey, tapeWaste])

  return { data, loading: !data || !opti, nesting: !!opti && nested?.key !== roomKey }
}

// ── Shared bits ──────────────────────────────────────────────────────────────

const TH = 'pb-1 pr-3 font-medium border-b border-gray-800'
const rowCls = (i: number) => (i % 2 === 0 ? 'text-gray-300' : 'text-gray-400 bg-gray-800/30')
const cabText = (c: { label: string; qty: number }) => (c.qty > 1 ? `${c.label} ×${c.qty}` : c.label)
const prodSub = (l: HardwareLine) => [l.brand, l.code].filter(Boolean).join(' · ')

function RoomHead({ name, sub }: { name: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-3 pb-1.5 border-b border-gray-700">
      <span className="text-sm font-semibold text-white">{name}</span>
      {sub && <span className="text-xs text-gray-500">{sub}</span>}
    </div>
  )
}
function SubHead({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold text-blue-400 uppercase tracking-widest mt-4 mb-1.5">{children}</div>
}
const Empty = ({ children }: { children: React.ReactNode }) => <div className="text-[11px] text-gray-600">{children}</div>
const Loading = () => <div className="text-gray-500 text-center py-12 text-sm">Loading…</div>

// ── Hardware Pick List ───────────────────────────────────────────────────────

function PickTable({ lines, showCabs }: { lines: HardwareLine[]; showCabs: boolean }) {
  return (
    <table className="w-full text-[11px] border-collapse table-fixed">
      <thead>
        <tr className="text-gray-500 text-[10px]">
          <th className={`${TH} text-left w-6`}>✓</th>
          <th className={`${TH} text-right w-20`}>Qty</th>
          <th className={`${TH} text-left w-[30%]`}>Product</th>
          <th className={`${TH} text-left w-36`}>Type</th>
          {showCabs && <th className={`${TH} text-left`}>Cabinets</th>}
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={l.key} className={rowCls(i)}>
            <td className="py-0.5 pr-3"><span className="inline-block w-3 h-3 border border-gray-500 rounded-sm align-middle" /></td>
            <td className="py-0.5 pr-3 text-right font-mono font-semibold text-white whitespace-nowrap">{l.qty}<span className="text-gray-500 font-normal"> {unitLabel(l)}</span></td>
            <td className="py-0.5 pr-3">{l.name}{prodSub(l) && <span className="text-gray-500"> · {prodSub(l)}</span>}
              {l.lengths && <div className="text-gray-500">{lengthsText(l.lengths)}</div>}</td>
            <td className="py-0.5 pr-3 text-gray-500">{l.group}</td>
            {showCabs && <td className="py-0.5 pr-3 font-mono text-gray-400">{l.cabinets.map((c, j) => <span key={c.label}>{j > 0 && ', '}<span className="whitespace-nowrap">{cabText(c)}</span></span>)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function HardwarePickSheet({ data }: { data: TakeoffData | null }) {
  if (!data) return <Loading />
  if (!data.hardware.length) {
    return <div className="text-center py-12 text-gray-500 text-sm">No hardware.<div className="text-xs mt-1 text-gray-600">Reads the saved cabinets — resolve and save them first.</div></div>
  }
  return (
    <div className="space-y-8">
      {data.rooms.filter(r => r.hardware.length).map(r => (
        <div key={r.room.id}>
          <RoomHead name={r.room.name} sub={`${r.hardware.length} line${r.hardware.length > 1 ? 's' : ''}`} />
          <PickTable lines={r.hardware} showCabs />
        </div>
      ))}
      {data.rooms.length > 1 && (
        <div>
          <RoomHead name="Job totals" />
          <PickTable lines={data.hardware} showCabs={false} />
        </div>
      )}
    </div>
  )
}

// ── Takeoff ──────────────────────────────────────────────────────────────────

const codesText = (k: KindCount) => k.codes.map(c => `${c.code}${c.count > 1 ? ` ×${c.count}` : ''}`).join(', ')
const CAB_KINDS = new Set(['base', 'wall', 'tall'])
const fingerTotal = (f: FingerPullLine[]) => f.reduce((a, l) => a + l.fronts, 0)
const fingerText = (f: FingerPullLine) => `${GRIP_LABEL[f.grip] ?? f.grip} — ${f.name}`

function CountsTable({ kinds, fingerPulls }: { kinds: KindCount[]; fingerPulls: FingerPullLine[] }) {
  const cabs = kinds.filter(k => CAB_KINDS.has(k.kind))
  const extras = kinds.filter(k => !CAB_KINDS.has(k.kind))
  const row = (label: string, count: number, detail: string, i: number, strong = false) => (
    <tr key={label} className={rowCls(i)}>
      <td className={`py-0.5 pr-3 ${strong ? 'text-white' : ''}`}>{label}</td>
      <td className="py-0.5 pr-3 text-right font-mono font-semibold text-white w-14">{count}</td>
      <td className="py-0.5 pr-3 font-mono text-gray-500">{detail}</td>
    </tr>
  )
  return (
    <table className="w-full text-[11px] border-collapse">
      <tbody>
        {cabs.map((k, i) => row(KIND_LABEL[k.kind], k.count, codesText(k), i, true))}
        {cabs.length > 1 && row('Cabinets total', cabs.reduce((a, k) => a + k.count, 0), '', cabs.length, true)}
        {extras.map((k, i) => row(KIND_LABEL[k.kind], k.count, codesText(k), i + cabs.length + 1))}
        {fingerPulls.length > 0 && row('Finger pull fronts', fingerTotal(fingerPulls), fingerPulls.map(f => `${fingerText(f)} ×${f.fronts}`).join(', '), cabs.length + extras.length + 1)}
      </tbody>
    </table>
  )
}

function SheetsTable({ lines, jobLines }: { lines: SheetLine[]; jobLines?: SheetLine[] | null }) {
  return (
    <table className="w-full text-[11px] border-collapse">
      <thead>
        <tr className="text-gray-500 text-[10px]">
          {['Material', 'Thk', 'Sheet', 'Parts', 'Sheets', 'Sheet equiv.', 'Yield', ...(jobLines ? ['Cut together'] : [])].map((h, i) => (
            <th key={h} className={`${TH} ${i >= 3 || i === 1 ? 'text-right' : 'text-left'}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={l.groupKey} className={rowCls(i)}>
            <td className="py-0.5 pr-3">{l.material}</td>
            <td className="py-0.5 pr-3 text-right font-mono">{l.thickness}</td>
            <td className="py-0.5 pr-3 font-mono text-gray-500">{l.sheetW}×{l.sheetH}</td>
            <td className="py-0.5 pr-3 text-right font-mono">{l.parts}</td>
            <td className="py-0.5 pr-3 text-right font-mono font-semibold text-white">{l.sheets}</td>
            <td className="py-0.5 pr-3 text-right font-mono">{l.sheetEquiv.toFixed(2)}</td>
            <td className="py-0.5 pr-3 text-right font-mono">{pct(l.efficiency)}</td>
            {jobLines && <td className="py-0.5 pr-3 text-right font-mono">{jobLines.find(j => j.groupKey === l.groupKey)?.sheets ?? '—'}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TapeTable({ lines, waste }: { lines: EdgebandLine[]; waste: number }) {
  return (
    <table className="w-full text-[11px] border-collapse">
      <thead>
        <tr className="text-gray-500 text-[10px]">
          {['Tape', 'Finish', 'Metres', `+${Math.round(waste * 100)}% waste`].map((h, i) => (
            <th key={h} className={`${TH} ${i >= 2 ? 'text-right' : 'text-left'}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={`${l.id ?? '-'}|${l.finish}`} className={rowCls(i)}>
            <td className="py-0.5 pr-3">{l.name}</td>
            <td className={`py-0.5 pr-3 ${l.colourNotChosen ? 'text-amber-300' : ''}`}>{l.finish}{l.colourNotChosen ? ' — colour not chosen' : ''}</td>
            <td className="py-0.5 pr-3 text-right font-mono">{m2(l.m)}</td>
            <td className="py-0.5 pr-3 text-right font-mono font-semibold text-white">{m2(l.mWaste)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function HwTable({ lines }: { lines: HardwareLine[] }) {
  return (
    <table className="w-full text-[11px] border-collapse">
      <thead>
        <tr className="text-gray-500 text-[10px]">
          {['Type', 'Product', 'Qty'].map((h, i) => <th key={h} className={`${TH} ${i === 2 ? 'text-right' : 'text-left'}`}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={l.key} className={rowCls(i)}>
            <td className="py-0.5 pr-3 text-gray-500">{l.group}</td>
            <td className="py-0.5 pr-3">{l.name}{l.lengths && <span className="text-gray-500"> · {lengthsText(l.lengths)}</span>}</td>
            <td className="py-0.5 pr-3 text-right font-mono font-semibold text-white">{l.qty} <span className="text-gray-500 font-normal">{unitLabel(l)}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TakeoffBlock({ kinds, fingerPulls, sheets, jobSheets, sheetNotes, tape, hardware, waste, nesting }: {
  kinds: KindCount[]; fingerPulls: FingerPullLine[]; sheets: SheetLine[] | null; jobSheets?: SheetLine[] | null
  sheetNotes: string[]; tape: EdgebandLine[]; hardware: HardwareLine[]; waste: number; nesting: boolean
}) {
  return (
    <>
      <SubHead>Cabinets</SubHead>
      {kinds.length || fingerPulls.length ? <CountsTable kinds={kinds} fingerPulls={fingerPulls} /> : <Empty>None placed.</Empty>}
      <SubHead>Sheets</SubHead>
      {sheets ? (sheets.length ? <SheetsTable lines={sheets} jobLines={jobSheets} /> : <Empty>No cut parts.</Empty>) : <Empty>{nesting ? 'Nesting…' : 'Loading…'}</Empty>}
      {sheetNotes.map(n => <div key={n} className="text-[11px] text-amber-300">{n}</div>)}
      <SubHead>Edgetape</SubHead>
      {tape.length ? <TapeTable lines={tape} waste={waste} /> : <Empty>No edgebanded parts.</Empty>}
      <SubHead>Hardware</SubHead>
      {hardware.length ? <HwTable lines={hardware} /> : <Empty>No hardware.</Empty>}
    </>
  )
}

export function TakeoffSheet({ data, nesting }: { data: TakeoffData | null; nesting: boolean }) {
  if (!data) return <Loading />
  return (
    <div className="space-y-10">
      {data.rooms.map(r => (
        <div key={r.room.id}>
          <RoomHead name={r.room.name} />
          <TakeoffBlock kinds={r.kinds} fingerPulls={r.fingerPulls} sheets={r.sheets} sheetNotes={r.sheetNotes}
            tape={r.tape} hardware={r.hardware} waste={data.tapeWaste} nesting={nesting} />
        </div>
      ))}
      {data.rooms.length > 1 && (
        <div>
          <RoomHead name="Job totals" sub="sheets = sum of the room nests · Cut together = all rooms nested as one" />
          <TakeoffBlock kinds={data.kinds} fingerPulls={data.fingerPulls} sheets={data.sheetsByRoom} jobSheets={data.sheetsJob} sheetNotes={[]}
            tape={data.tape} hardware={data.hardware} waste={data.tapeWaste} nesting={nesting} />
        </div>
      )}
    </div>
  )
}

