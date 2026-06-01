'use client'

import { useState } from 'react'
import type {
  ResolvedCabinet, ResolvedSeamJoint, JointTypeOp,
  ResolvedSlideDrill,
} from '@/src/lib/resolver/types'

// ── Expression evaluation ─────────────────────────────────────────────────────

function evalExpr(expr: string, vars: Record<string, number>): number | null {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(...Object.keys(vars), `'use strict'; return +(${expr})`)
    const result = fn(...Object.values(vars))
    return Number.isFinite(result) ? result : null
  } catch { return null }
}

// Returns { w, h, d, thick } for a part key in cabinet-space box coordinates,
// matching the caseBox() convention used in Cabinet3DView.
function partBox(key: string, rp: ResolvedCabinet): { w: number; h: number; d: number; thick: number } | null {
  const isSide = key === 'left_side' || key === 'right_side'
  const cp = rp.case_parts.find(p => p.part_key === key)
  if (cp) {
    if (isSide)          return { w: cp.DZ, h: cp.DY, d: cp.DX, thick: cp.DZ }
    if (key === 'back')  return { w: cp.DY, h: cp.DX, d: cp.DZ, thick: cp.DZ }
    return                      { w: cp.DY, h: cp.DZ, d: cp.DX, thick: cp.DZ }
  }
  const tp = rp.toekick_parts.find(p => p.part_key === key)
  if (tp) return { w: tp.DY, h: tp.DZ, d: tp.DX, thick: tp.DZ }
  return null
}

// Returns null if any expression-bearing field fails — callers should treat the op as inactive.
function evalOpFields(op: JointTypeOp, seam: ResolvedSeamJoint, rp: ResolvedCabinet): {
  tool_diameter_mm: number; depth_mm: number
  offset_x_mm: number; offset_y_mm: number; offset_z_mm: number
  qty: number; spacing_mm: number | null
} | null {
  const exprs = op.expressions ?? {}
  const isA   = op.target_part === 'part_a'
  const bA    = partBox(seam.part_a_key, rp)
  const bB    = partBox(seam.part_b_key, rp)
  const vars: Record<string, number> = {
    W:  isA ? (bA?.w ?? 0) : (bB?.w ?? 0),
    L:  isA ? (bA?.h ?? 0) : (bB?.h ?? 0),
    D:  isA ? (bA?.d ?? 0) : (bB?.d ?? 0),
    T:  isA ? (bA?.thick ?? 0) : (bB?.thick ?? 0),
    MW: bA?.w ?? 0, ML: bA?.h ?? 0, MD: bA?.d ?? 0,
    SW: bB?.w ?? 0, SL: bB?.h ?? 0, SD: bB?.d ?? 0,
  }
  const ev = (field: string, fallback: number): number | null =>
    exprs[field] != null ? evalExpr(exprs[field], vars) : fallback

  const tool  = ev('tool_diameter_mm', op.tool_diameter_mm)
  const depth = ev('depth_mm',         op.depth_mm)
  const ox    = ev('offset_x_mm',      op.offset_x_mm)
  const oy    = ev('offset_y_mm',      op.offset_y_mm)
  const oz    = ev('offset_z_mm',      op.offset_z_mm)
  if (tool === null || depth === null || ox === null || oy === null || oz === null) return null

  const rawQty = exprs.qty != null ? evalExpr(exprs.qty, vars) : (op.qty ?? 1)
  if (rawQty === null) return null
  const rawSpc = exprs.spacing_mm != null ? evalExpr(exprs.spacing_mm, vars) : op.spacing_mm
  if (exprs.spacing_mm != null && rawSpc === null) return null

  return {
    tool_diameter_mm: tool,
    depth_mm:         depth,
    offset_x_mm:      ox,
    offset_y_mm:      oy,
    offset_z_mm:      oz,
    qty:              Math.max(1, Math.round(rawQty)),
    spacing_mm:       rawSpc,
  }
}

// ── Labels ────────────────────────────────────────────────────────────────────

const CASE_LABELS: Record<string, string> = {
  left_side: 'Left Gable', right_side: 'Right Gable', bottom: 'Bottom Panel',
  back: 'Back Panel', full_top: 'Top Panel', front_rail: 'Front Top Rail', back_rail: 'Back Top Rail',
}
const TK_LABELS: Record<string, string> = {
  kick_front_face: 'Toe Kick Face', kick_sub_front: 'Toe Kick Sub-Front',
  kick_back: 'Toe Kick Back', spreader_vertical: 'Toe Kick Leg', spreader_horizontal: 'Toe Kick Spreader',
}
const INT_LABELS: Record<string, string> = {
  adj_shelf: 'Adj. Shelf', fixed_shelf: 'Fixed Shelf',
  inner_drawer_bottom: 'Inner Drawer Bottom', inner_drawer_back: 'Inner Drawer Back',
  inner_drawer_side:   'Inner Drawer Side',  inner_drawer_front: 'Inner Drawer Front',
  pull_out_bottom:     'Pull-out Bottom',    pull_out_side:      'Pull-out Side',
  pull_out_back:       'Pull-out Back',
  accessory:           'Accessory',
}
const FACE_LABELS: Record<string, string> = {
  door: 'Door', drawer_face: 'Drawer Face', false_panel: 'False Panel', open: 'Open',
}
const DB_LABELS: Record<string, string> = {
  db_left_side: 'DB Left Side', db_right_side: 'DB Right Side', db_bottom: 'DB Bottom',
  db_front: 'DB Front', db_back: 'DB Back',
}
const OP_LABELS: Record<string, string> = {
  drill: 'Bore', route: 'Route', pocket: 'Pocket', saw: 'Saw',
}

// ── Tree node types ───────────────────────────────────────────────────────────

type NodeKind = 'section' | 'part' | 'seam' | 'op' | 'slideop'

type PartPayload = {
  kind:       'part'
  partId:     string
  X: number; Y: number; Z: number
  DX: number; DY: number; DZ: number
  materialId: string | null | undefined
}

type TreeNode = {
  id:          string
  label:       string
  detail?:     string
  children:    TreeNode[]
  expandable:  boolean
} & (
  | { kind: 'section' }
  | PartPayload
  | { kind: 'seam'; seam: ResolvedSeamJoint }
  | { kind: 'op';   op: JointTypeOp; seam: ResolvedSeamJoint }
  | { kind: 'slideop'; drill: ResolvedSlideDrill }
)

const SLIDE_OP_LABELS: Record<string, string> = {
  drill: 'Bore', route: 'Route', pocket: 'Pocket',
}

// ── Tree builder ──────────────────────────────────────────────────────────────

function makeSeamNodes(partKey: string, rp: ResolvedCabinet): TreeNode[] {
  const out: TreeNode[] = []
  for (const seam of rp.seam_joints) {
    let role: 'part_a' | 'part_b' | null = null
    if (seam.part_a_key === partKey) role = 'part_a'
    else if (seam.part_b_key === partKey) role = 'part_b'
    if (!role) continue

    const matchOps = seam.ops.filter(op => op.target_part === role)
    if (matchOps.length === 0) continue

    const opNodes: TreeNode[] = matchOps.map(op => {
      const ev = evalOpFields(op, seam, rp)
      return {
        id:         `op-${seam.seam_key}-${op.id}`,
        kind:       'op' as const,
        label:      ev
          ? `${OP_LABELS[op.machine_operation] ?? op.machine_operation} Ø${ev.tool_diameter_mm}×${ev.depth_mm}mm`
          : `${OP_LABELS[op.machine_operation] ?? op.machine_operation} — invalid expression`,
        detail:     ev ? ([op.face !== 'normal' ? op.face : null, ev.qty > 1 ? `×${ev.qty}` : null].filter(Boolean).join(' · ') || undefined) : undefined,
        children:   [],
        expandable: false,
        op,
        seam,
      }
    })

    out.push({
      id:         `seam-${seam.seam_key}-${role}`,
      kind:       'seam' as const,
      label:      seam.joint_type_name,
      detail:     seam.seam_key.replace(':', ' → '),
      children:   opNodes,
      expandable: opNodes.length > 0,
      seam,
    })
  }
  return out
}

// Maps every resolved slide drill to the tree part-id it should hang under, so a
// part node can pick up the holes that actually land on it. Built once per tree.
function buildSlideDrillIndex(rp: ResolvedCabinet): Map<string, ResolvedSlideDrill[]> {
  const idx = new Map<string, ResolvedSlideDrill[]>()
  const add = (partId: string, d: ResolvedSlideDrill) => {
    const arr = idx.get(partId) ?? []
    arr.push(d)
    idx.set(partId, arr)
  }
  for (const stack of rp.drawer_stacks ?? []) {
    const rc = `${stack.face_zone_row}_${stack.face_zone_col}`
    for (const sl of stack.slides) {
      for (const d of sl.drills) {
        let partId: string | null = null
        switch (d.surface) {
          case 'cabinet_member': partId = `case_${d.side}_side`;        break
          case 'drawer_bottom':  partId = `db_${rc}_db_bottom`;         break
          case 'drawer_back':    partId = `db_${rc}_db_back`;           break
          case 'drawer_front':   partId = `zone_${rc}`;                 break
          case 'drawer_side':    partId = `db_${rc}_db_${d.side}_side`; break
        }
        if (partId) add(partId, d)
      }
    }
  }
  return idx
}

function makeSlideOpNode(d: ResolvedSlideDrill, i: number): TreeNode {
  const dia = Math.round(d.radius * 2 * 100) / 100
  const depth = Math.round(d.depthLen * 100) / 100
  return {
    id:         `slideop-${d.surface}-${d.side}-${i}-${Math.round(d.x)}-${Math.round(d.y)}-${Math.round(d.z)}`,
    kind:       'slideop',
    label:      `${SLIDE_OP_LABELS[d.machine_operation] ?? d.machine_operation} Ø${dia}×${depth}mm`,
    detail:     `slide ${d.side === 'left' ? 'L' : 'R'}`,
    children:   [],
    expandable: false,
    drill:      d,
  }
}

function makePart(
  id: string, label: string, detail: string | undefined,
  X: number, Y: number, Z: number, DX: number, DY: number, DZ: number,
  materialId: string | null | undefined,
  partKey: string, rp: ResolvedCabinet,
  slideDrillIdx?: Map<string, ResolvedSlideDrill[]>,
): TreeNode {
  const seams = makeSeamNodes(partKey, rp)
  const slideOps = (slideDrillIdx?.get(id) ?? []).map((d, i) => makeSlideOpNode(d, i))
  const children = [...seams, ...slideOps]
  return { id, label, detail, kind: 'part', partId: id, X, Y, Z, DX, DY, DZ, materialId, children, expandable: children.length > 0 }
}

function buildSections(rp: ResolvedCabinet): TreeNode[] {
  const groups: TreeNode[] = []
  const slideIdx = buildSlideDrillIndex(rp)

  if (rp.case_parts.length > 0) {
    const parts = rp.case_parts.map(p => makePart(
      `case_${p.part_key}`, CASE_LABELS[p.part_key] ?? p.part_key.replace(/_/g, ' '), undefined,
      p.X, p.Y, p.Z, p.DX, p.DY, p.DZ, p.material_id, p.part_key, rp, slideIdx,
    ))
    groups.push({ id: 'sec-case', kind: 'section', label: 'Case', detail: `${parts.length}`, children: parts, expandable: true })
  }

  if (rp.toekick_parts.length > 0) {
    const parts = rp.toekick_parts.map(p => makePart(
      `tk_${p.part_key}_${p.sort_order}`, TK_LABELS[p.part_key] ?? p.part_key.replace(/_/g, ' '), undefined,
      p.X, p.Y, p.Z, p.DX, p.DY, p.DZ, p.material_id, p.part_key, rp, slideIdx,
    ))
    groups.push({ id: 'sec-tk', kind: 'section', label: 'Toe Kick', detail: `${parts.length}`, children: parts, expandable: true })
  }

  const intParts = rp.internal_parts.map(p => makePart(
    `int_${p.part_type}_${p.sort_order}`,
    `${INT_LABELS[p.part_type] ?? p.part_type.replace(/_/g, ' ')} ${p.sort_order + 1}`,
    undefined, p.X, p.Y, p.Z, p.DX, p.DY, p.DZ, p.material_id, p.part_type, rp, slideIdx,
  ))
  const drawerNodes = (rp.drawer_stacks ?? []).flatMap(stack => {
    const tag = `R${stack.face_zone_row + 1}C${stack.face_zone_col + 1}`
    const dbParts = stack.box_parts.map(p => makePart(
      `db_${stack.face_zone_row}_${stack.face_zone_col}_${p.part_type}`,
      DB_LABELS[p.part_type] ?? p.part_type, tag,
      p.X, p.Y, p.Z, p.DX, p.DY, p.DZ, p.material_id, p.part_type, rp, slideIdx,
    ))
    const slideNodes = stack.slides.map(s => makePart(
      `slide_${stack.face_zone_row}_${stack.face_zone_col}_${s.side}`,
      `Slide (${s.side})`, `${tag} · ${s.nominal_length}mm`,
      s.X, s.Y, s.Z, s.DX, s.DY, s.DZ, null, '', rp, slideIdx,
    ))
    return [...dbParts, ...slideNodes]
  })
  const allInt = [...intParts, ...drawerNodes]
  if (allInt.length > 0) {
    groups.push({ id: 'sec-int', kind: 'section', label: 'Interior', detail: `${allInt.length}`, children: allInt, expandable: true })
  }

  if (rp.face_zones.length > 0) {
    const parts = rp.face_zones.map(z => makePart(
      `zone_${z.row_index}_${z.col_index}`,
      `${FACE_LABELS[z.face_type] ?? z.face_type} R${z.row_index + 1}C${z.col_index + 1}`,
      z.hinge_side ? `Hinge: ${z.hinge_side}` : undefined,
      z.X, z.Y, z.Z, z.DX, z.DY, z.DZ, z.material_id, z.face_type, rp, slideIdx,
    ))
    groups.push({ id: 'sec-face', kind: 'section', label: 'Face', detail: `${parts.length}`, children: parts, expandable: true })
  }

  return groups
}

// ── Tree UI ───────────────────────────────────────────────────────────────────

const KIND_ICON: Record<NodeKind, string> = { section: '▸', part: '▬', seam: '⟳', op: '•', slideop: '•' }
const KIND_COLOR: Record<NodeKind, string> = {
  section: 'text-amber-400', part: 'text-gray-300', seam: 'text-violet-400', op: 'text-gray-500',
  slideop: 'text-amber-500',
}

function TreeRow({ node, depth, expanded, selected, onToggle, onSelect }: {
  node: TreeNode; depth: number; expanded: boolean; selected: boolean
  onToggle: (id: string) => void; onSelect: (n: TreeNode) => void
}) {
  return (
    <div
      className={`flex items-center gap-1 py-0.5 cursor-pointer select-none rounded-sm
        ${selected ? 'bg-blue-700/60 text-white' : 'hover:bg-gray-800/60 text-gray-300'}`}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
      onClick={() => { onSelect(node); if (node.expandable) onToggle(node.id) }}
    >
      <span className="w-3 text-[10px] text-gray-600 shrink-0">
        {node.expandable ? (expanded ? '▾' : '▸') : ''}
      </span>
      <span className={`text-[10px] shrink-0 ${KIND_COLOR[node.kind]}`}>{KIND_ICON[node.kind]}</span>
      <span className="text-xs truncate">{node.label}</span>
      {node.detail && <span className="text-[10px] text-gray-600 shrink-0 ml-1">{node.detail}</span>}
    </div>
  )
}

function TreeBranch({ node, depth, expandedIds, selectedId, onToggle, onSelect }: {
  node: TreeNode; depth: number; expandedIds: Set<string>; selectedId: string | null
  onToggle: (id: string) => void; onSelect: (n: TreeNode) => void
}) {
  const expanded = expandedIds.has(node.id)
  return (
    <>
      <TreeRow node={node} depth={depth} expanded={expanded}
        selected={selectedId === node.id} onToggle={onToggle} onSelect={onSelect} />
      {expanded && node.children.map(child => (
        <TreeBranch key={child.id} node={child} depth={depth + 1}
          expandedIds={expandedIds} selectedId={selectedId}
          onToggle={onToggle} onSelect={onSelect} />
      ))}
    </>
  )
}

// ── Properties panel ──────────────────────────────────────────────────────────

function PR({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <>
      <dt className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</dt>
      <dd className="text-xs text-gray-200 font-mono text-right">
        {value}{unit ? <span className="text-gray-600 ml-0.5 text-[10px]">{unit}</span> : null}
      </dd>
    </>
  )
}

function Divider({ label }: { label: string }) {
  return (
    <div className="col-span-2 pt-3 pb-0.5 border-t border-gray-800">
      <span className="text-[10px] uppercase tracking-widest text-gray-600">{label}</span>
    </div>
  )
}

function NodeProps({ node, rp }: { node: TreeNode | null; rp: ResolvedCabinet }) {
  if (!node) {
    return <div className="flex items-center justify-center h-full text-xs text-gray-600">Select a node</div>
  }

  if (node.kind === 'section') {
    return (
      <div className="p-4">
        <h3 className="text-sm font-semibold text-gray-200 mb-1">{node.label}</h3>
        <p className="text-xs text-gray-500">{node.detail} part{node.detail === '1' ? '' : 's'}</p>
      </div>
    )
  }

  if (node.kind === 'part') {
    return (
      <div className="p-4 overflow-y-auto">
        <h3 className="text-sm font-semibold text-gray-200 mb-3">{node.label}</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 items-baseline">
          <Divider label="Position" />
          <PR label="X" value={Math.round(node.X)} unit="mm" />
          <PR label="Y" value={Math.round(node.Y)} unit="mm" />
          <PR label="Z" value={Math.round(node.Z)} unit="mm" />
          <Divider label="Dimensions" />
          <PR label="DX" value={Math.round(node.DX)} unit="mm" />
          <PR label="DY" value={Math.round(node.DY)} unit="mm" />
          <PR label="DZ" value={Math.round(node.DZ)} unit="mm" />
          {node.materialId && (
            <>
              <Divider label="Material" />
              <dt className="text-[10px] text-gray-500 uppercase tracking-wider">ID</dt>
              <dd className="text-xs text-gray-200 font-mono text-right truncate">{node.materialId}</dd>
            </>
          )}
        </dl>
      </div>
    )
  }

  if (node.kind === 'seam') {
    const s = node.seam
    return (
      <div className="p-4">
        <h3 className="text-sm font-semibold text-gray-200 mb-1">{s.joint_type_name}</h3>
        <p className="text-[10px] text-gray-500 mb-3">{s.seam_key} · {s.source}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 items-baseline">
          <PR label="Part A" value={s.part_a_key.replace(/_/g, ' ')} />
          <PR label="Part B" value={s.part_b_key.replace(/_/g, ' ')} />
          <PR label="Ops"    value={s.ops.length} />
        </dl>
      </div>
    )
  }

  if (node.kind === 'op') {
    const { op, seam } = node
    const ev = evalOpFields(op, seam, rp)
    const exprs = op.expressions ?? {}
    if (!ev) {
      return (
        <div className="p-4">
          <h3 className="text-sm font-semibold text-gray-200 mb-1">{OP_LABELS[op.machine_operation] ?? op.machine_operation}</h3>
          <p className="text-[10px] text-gray-500 mb-3">{op.target_part.replace('_', ' ')} · face: {op.face}</p>
          <p className="text-[11px] text-amber-500">Expression failed — op will be skipped</p>
          {Object.keys(exprs).length > 0 && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 items-baseline mt-3">
              <Divider label="Expressions" />
              {Object.entries(exprs).map(([k, v]) => <PR key={k} label={k} value={v} />)}
            </dl>
          )}
        </div>
      )
    }
    const EVR = ({ label, field, unit }: { label: string; field: keyof typeof ev; unit?: string }) => {
      const raw = op[field as keyof JointTypeOp] as number
      const hasExpr = !!exprs[field]
      const val = ev[field] as number
      return (
        <>
          <dt className="text-[10px] text-gray-500">{label}</dt>
          <dd className="text-[11px] font-mono text-right">
            <span className={hasExpr ? 'text-sky-300' : 'text-gray-200'}>
              {typeof val === 'number' ? Math.round(val * 100) / 100 : val}{unit}
            </span>
            {hasExpr && raw !== val && (
              <span className="ml-1 text-[9px] text-gray-600">({raw}{unit})</span>
            )}
          </dd>
        </>
      )
    }
    return (
      <div className="p-4">
        <h3 className="text-sm font-semibold text-gray-200 mb-1">{OP_LABELS[op.machine_operation] ?? op.machine_operation}</h3>
        <p className="text-[10px] text-gray-500 mb-3">{op.target_part.replace('_', ' ')} · face: {op.face}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 items-baseline">
          <EVR label="Tool Ø"   field="tool_diameter_mm" unit="mm" />
          <EVR label="Depth"    field="depth_mm"         unit="mm" />
          <EVR label="Offset X" field="offset_x_mm"      unit="mm" />
          <EVR label="Offset Y" field="offset_y_mm"      unit="mm" />
          <EVR label="Offset Z" field="offset_z_mm"      unit="mm" />
          <EVR label="Qty"      field="qty" />
          {(op.spacing_mm !== null || exprs.spacing_mm) && <EVR label="Spacing" field="spacing_mm" unit="mm" />}
          {op.tool  && <PR label="Tool"  value={op.tool} />}
          {op.notes && <PR label="Notes" value={op.notes} />}
          {Object.keys(exprs).length > 0 && (
            <>
              <Divider label="Expressions" />
              {Object.entries(exprs).map(([k, v]) => <PR key={k} label={k} value={v} />)}
            </>
          )}
        </dl>
      </div>
    )
  }

  if (node.kind === 'slideop') {
    const d = node.drill
    return (
      <div className="p-4">
        <h3 className="text-sm font-semibold text-gray-200 mb-1">{SLIDE_OP_LABELS[d.machine_operation] ?? d.machine_operation}</h3>
        <p className="text-[10px] text-gray-500 mb-3">{d.surface.replace(/_/g, ' ')} · slide {d.side}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 items-baseline">
          <PR label="Tool Ø" value={Math.round(d.radius * 2 * 100) / 100} unit="mm" />
          <PR label="Depth"  value={Math.round(d.depthLen * 100) / 100} unit="mm" />
          <PR label="Axis"   value={d.axis} />
          <Divider label="Position" />
          <PR label="X" value={Math.round(d.x)} unit="mm" />
          <PR label="Y" value={Math.round(d.y)} unit="mm" />
          <PR label="Z" value={Math.round(d.z)} unit="mm" />
        </dl>
      </div>
    )
  }

  return null
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function CabinetTreePanel({ rp }: { rp: ResolvedCabinet }) {
  const sections = buildSections(rp)

  const [expandedIds, setExpandedIds]   = useState<Set<string>>(() => new Set(sections.map(s => s.id)))
  const [selectedId, setSelectedId]     = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null)

  function toggleExpand(id: string) {
    setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function handleSelect(node: TreeNode) {
    setSelectedId(node.id)
    setSelectedNode(node)
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto min-w-0 border-r border-gray-800 py-1">
        {sections.map(s => (
          <TreeBranch key={s.id} node={s} depth={0}
            expandedIds={expandedIds} selectedId={selectedId}
            onToggle={toggleExpand} onSelect={handleSelect} />
        ))}
      </div>
      <div className="w-56 shrink-0 overflow-y-auto">
        <NodeProps node={selectedNode} rp={rp} />
      </div>
    </div>
  )
}
