'use client'

import { useState } from 'react'
import type {
  ResolvedCabinet, ResolvedSeamJoint, JointTypeOp,
  ResolvedSlideDrill, ResolvedHingeInstance, ResolvedHingeDrill,
} from '@/src/lib/resolver/types'
import { fmtMm } from '@/src/lib/format'
import type { PartPosOverrides } from './canvasDB'

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

type NodeKind = 'section' | 'part' | 'seam' | 'op' | 'slideop' | 'hinge' | 'hingeop'

type PartPayload = {
  kind:       'part'
  partId:     string
  X: number; Y: number; Z: number
  DX: number; DY: number; DZ: number
  AX: number; AY: number; AZ: number
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
  | { kind: 'op';   op: JointTypeOp; seam: ResolvedSeamJoint; ax: number; ay: number; az: number }
  | { kind: 'slideop'; drill: ResolvedSlideDrill }
  | { kind: 'hinge'; hinge: ResolvedHingeInstance }
  | { kind: 'hingeop'; drill: ResolvedHingeDrill }
)

const SLIDE_OP_LABELS: Record<string, string> = {
  drill: 'Bore', route: 'Route', pocket: 'Pocket',
}

// ── Tree builder ──────────────────────────────────────────────────────────────

// Joints are owned by their MASTER part (part_a): the whole joint and all its ops —
// including the holes bored into the slave — hang off the master, matching how the
// operation travels with the master. Each op carries its owner's rotation so its
// orientation (which equals the master's, since it is attached) can be shown.
function makeSeamNodes(partKey: string, rp: ResolvedCabinet, owner: { ax: number; ay: number; az: number }): TreeNode[] {
  const out: TreeNode[] = []
  for (const seam of rp.seam_joints) {
    if (seam.part_a_key !== partKey) continue
    if (seam.ops.length === 0) continue

    const opNodes: TreeNode[] = seam.ops.map(op => {
      const ev = evalOpFields(op, seam, rp)
      const targetKey = op.target_part === 'part_a' ? seam.part_a_key : seam.part_b_key
      return {
        id:         `op-${seam.seam_key}-${op.id}`,
        kind:       'op' as const,
        label:      ev
          ? `${OP_LABELS[op.machine_operation] ?? op.machine_operation} Ø${ev.tool_diameter_mm}×${ev.depth_mm}mm`
          : `${OP_LABELS[op.machine_operation] ?? op.machine_operation} — invalid expression`,
        detail:     ev ? ([`→ ${CASE_LABELS[targetKey] ?? targetKey.replace(/_/g, ' ')}`, op.face !== 'normal' ? op.face : null, ev.qty > 1 ? `×${ev.qty}` : null].filter(Boolean).join(' · ') || undefined) : undefined,
        children:   [],
        expandable: false,
        op,
        seam,
        ax: owner.ax, ay: owner.ay, az: owner.az,
      }
    })

    out.push({
      id:         `seam-${seam.seam_key}`,
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

const HINGE_OP_LABELS: Record<string, string> = { cup: 'Cup bore', anchor: 'Anchor hole', plate: 'Plate hole' }

function makeHingeOpNode(d: ResolvedHingeDrill, i: number): TreeNode {
  const dia = Math.round(d.radius * 2 * 100) / 100
  const depth = Math.round(d.depthLen * 100) / 100
  return {
    id:         `hingeop-${d.kind}-${i}-${Math.round(d.x)}-${Math.round(d.y)}-${Math.round(d.z)}`,
    kind:       'hingeop',
    label:      `${HINGE_OP_LABELS[d.kind] ?? d.kind} Ø${dia}×${depth}mm`,
    detail:     d.kind === 'plate' ? 'hinge plate' : undefined,
    children:   [],
    expandable: false,
    drill:      d,
  }
}

function makePart(
  id: string, label: string, detail: string | undefined,
  X: number, Y: number, Z: number, DX: number, DY: number, DZ: number,
  AX: number, AY: number, AZ: number,
  materialId: string | null | undefined,
  partKey: string, rp: ResolvedCabinet,
  overrides: PartPosOverrides | undefined,
  slideDrillIdx?: Map<string, ResolvedSlideDrill[]>,
  hingeDrillIdx?: Map<string, ResolvedHingeDrill[]>,
): TreeNode {
  // Resolved base angles are 0; the live rotation comes from the part's override.
  // Show the effective angle so the tree matches the rotated part in the views.
  const ov  = overrides?.[id]
  const eAX = AX + (ov?.oax ?? 0)
  const eAY = AY + (ov?.oay ?? 0)
  const eAZ = AZ + (ov?.oaz ?? 0)
  const seams = makeSeamNodes(partKey, rp, { ax: eAX, ay: eAY, az: eAZ })
  const slideOps = (slideDrillIdx?.get(id) ?? []).map((d, i) => makeSlideOpNode(d, i))
  // Hinge PLATE bores land on the carcass part the plate touches (gable/shelf/
  // top/bottom), so they sit under that part — not under the door.
  const hingeOps = (hingeDrillIdx?.get(id) ?? []).map((d, i) => makeHingeOpNode(d, i))
  const children = [...seams, ...slideOps, ...hingeOps]
  return { id, label, detail, kind: 'part', partId: id, X, Y, Z, DX, DY, DZ, AX: eAX, AY: eAY, AZ: eAZ, materialId, children, expandable: children.length > 0 }
}

// Maps each hinge PLATE bore to the carcass/internal part it drills into, via
// the resolved mount_target. Part ids match the tree's (case_*/int_*) keys.
function buildHingeDrillIndex(rp: ResolvedCabinet): Map<string, ResolvedHingeDrill[]> {
  const idx = new Map<string, ResolvedHingeDrill[]>()
  const add = (partId: string, d: ResolvedHingeDrill) => {
    const arr = idx.get(partId) ?? []; arr.push(d); idx.set(partId, arr)
  }
  for (const h of rp.hinge_instances ?? []) {
    const t = h.mount_target
    if (!t) continue
    let partId: string | null = null
    if (t.table === 'case_parts' && t.part_key) partId = `case_${t.part_key}`
    else if (t.table === 'internal_parts' && t.internal_part_type != null && t.internal_sort_order != null) partId = `int_${t.internal_part_type}_${t.internal_sort_order}`
    if (partId) for (const d of h.plate_drills) add(partId, d)
  }
  return idx
}

function buildSections(rp: ResolvedCabinet, overrides: PartPosOverrides | undefined): TreeNode[] {
  const groups: TreeNode[] = []
  const slideIdx = buildSlideDrillIndex(rp)
  const hingeIdx = buildHingeDrillIndex(rp)

  if (rp.case_parts.length > 0) {
    const parts = rp.case_parts.map(p => makePart(
      `case_${p.part_key}`, CASE_LABELS[p.part_key] ?? p.part_key.replace(/_/g, ' '), undefined,
      p.X, p.Y, p.Z, p.DX, p.DY, p.DZ, p.AX, p.AY, p.AZ, p.material_id, p.part_key, rp, overrides, slideIdx, hingeIdx,
    ))
    groups.push({ id: 'sec-case', kind: 'section', label: 'Case', detail: `${parts.length}`, children: parts, expandable: true })
  }

  if (rp.toekick_parts.length > 0) {
    const parts = rp.toekick_parts.map(p => makePart(
      `tk_${p.part_key}_${p.sort_order}`, TK_LABELS[p.part_key] ?? p.part_key.replace(/_/g, ' '), undefined,
      p.X, p.Y, p.Z, p.DX, p.DY, p.DZ, p.AX, p.AY, p.AZ, p.material_id, p.part_key, rp, overrides, slideIdx, hingeIdx,
    ))
    groups.push({ id: 'sec-tk', kind: 'section', label: 'Toe Kick', detail: `${parts.length}`, children: parts, expandable: true })
  }

  const intParts = rp.internal_parts.map(p => makePart(
    `int_${p.part_type}_${p.sort_order}`,
    `${INT_LABELS[p.part_type] ?? p.part_type.replace(/_/g, ' ')} ${p.sort_order + 1}`,
    undefined, p.X, p.Y, p.Z, p.DX, p.DY, p.DZ, p.AX, p.AY, p.AZ, p.material_id, p.part_type, rp, overrides, slideIdx, hingeIdx,
  ))
  const drawerNodes = (rp.drawer_stacks ?? []).flatMap(stack => {
    const tag = `R${stack.face_zone_row + 1}C${stack.face_zone_col + 1}`
    const dbParts = stack.box_parts.map(p => makePart(
      `db_${stack.face_zone_row}_${stack.face_zone_col}_${p.part_type}`,
      DB_LABELS[p.part_type] ?? p.part_type, tag,
      p.X, p.Y, p.Z, p.DX, p.DY, p.DZ, p.AX, p.AY, p.AZ, p.material_id, p.part_type, rp, overrides, slideIdx, hingeIdx,
    ))
    const slideNodes = stack.slides.map(s => makePart(
      `slide_${stack.face_zone_row}_${stack.face_zone_col}_${s.side}`,
      `Slide (${s.side})`, `${tag} · ${s.nominal_length}mm`,
      s.X, s.Y, s.Z, s.DX, s.DY, s.DZ, 0, 0, 0, null, '', rp, overrides, slideIdx, hingeIdx,
    ))
    return [...dbParts, ...slideNodes]
  })
  const allInt = [...intParts, ...drawerNodes]
  if (allInt.length > 0) {
    groups.push({ id: 'sec-int', kind: 'section', label: 'Interior', detail: `${allInt.length}`, children: allInt, expandable: true })
  }

  if (rp.face_zones.length > 0) {
    // Hinges grouped by door zone, so each door lists its hinges as children.
    const hingesByZone = new Map<string, ResolvedHingeInstance[]>()
    for (const h of (rp.hinge_instances ?? [])) {
      const k = `${h.row_index}_${h.col_index}`
      const arr = hingesByZone.get(k) ?? []
      arr.push(h); hingesByZone.set(k, arr)
    }
    const parts = rp.face_zones.map(z => {
      const node = makePart(
        `zone_${z.row_index}_${z.col_index}`,
        `${FACE_LABELS[z.face_type] ?? z.face_type} R${z.row_index + 1}C${z.col_index + 1}`,
        z.hinge_side ? `Hinge: ${z.hinge_side}` : undefined,
        z.X, z.Y, z.Z, z.DX, z.DY, z.DZ, z.AX, z.AY, z.AZ, z.material_id, z.face_type, rp, overrides, slideIdx, hingeIdx,
      )
      const hinges = hingesByZone.get(`${z.row_index}_${z.col_index}`) ?? []
      for (const h of hinges) {
        // Only the cup + anchor bores fire on the door; the plate bores live
        // under the carcass part they drill into (see buildHingeDrillIndex).
        const ops = h.cup_drills.map((d, di) => makeHingeOpNode(d, di))
        node.children.push({
          id: `hinge_${z.row_index}_${z.col_index}_${h.sort_order}`,
          kind: 'hinge', hinge: h,
          label: `Hinge #${h.sort_order + 1}`,
          detail: `${h.hinge_edge} · ${Math.round(h.y_position_mm)}mm${h.hinge_plate_id ? ' · +plate' : ''}`,
          children: ops, expandable: ops.length > 0,
        })
      }
      if (hinges.length) node.expandable = true
      return node
    })
    groups.push({ id: 'sec-face', kind: 'section', label: 'Face', detail: `${parts.length}`, children: parts, expandable: true })
  }

  return groups
}

// ── Tree UI ───────────────────────────────────────────────────────────────────

const KIND_ICON: Record<NodeKind, string> = { section: '▸', part: '▬', seam: '⟳', op: '•', slideop: '•', hinge: '◈', hingeop: '•' }
const KIND_COLOR: Record<NodeKind, string> = {
  section: 'text-amber-400', part: 'text-gray-300', seam: 'text-violet-400', op: 'text-gray-500',
  slideop: 'text-amber-500', hinge: 'text-purple-400', hingeop: 'text-purple-300',
}

// Compact rotation tag (parts carry AX/AY/AZ, ops carry their owner's ax/ay/az).
// Returned only when some axis is non-zero so unrotated rows stay clean.
function angleTag(node: TreeNode): string | null {
  let ax = 0, ay = 0, az = 0
  if (node.kind === 'part')    { ax = node.AX; ay = node.AY; az = node.AZ }
  else if (node.kind === 'op') { ax = node.ax; ay = node.ay; az = node.az }
  else return null
  if (!Math.round(ax) && !Math.round(ay) && !Math.round(az)) return null
  return `∠ ${Math.round(ax)}/${Math.round(ay)}/${Math.round(az)}°`
}

function TreeRow({ node, depth, expanded, selected, onToggle, onSelect }: {
  node: TreeNode; depth: number; expanded: boolean; selected: boolean
  onToggle: (id: string) => void; onSelect: (n: TreeNode) => void
}) {
  const aTag = angleTag(node)
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
      {aTag && <span className="text-[10px] text-sky-400 font-mono shrink-0 ml-auto pl-1">{aTag}</span>}
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
          <PR label="X" value={fmtMm(node.X)} unit="mm" />
          <PR label="Y" value={fmtMm(node.Y)} unit="mm" />
          <PR label="Z" value={fmtMm(node.Z)} unit="mm" />
          <Divider label="Dimensions" />
          <PR label="DX" value={fmtMm(node.DX)} unit="mm" />
          <PR label="DY" value={fmtMm(node.DY)} unit="mm" />
          <PR label="DZ" value={fmtMm(node.DZ)} unit="mm" />
          <Divider label="Orientation" />
          <PR label="AX" value={Math.round(node.AX)} unit="°" />
          <PR label="AY" value={Math.round(node.AY)} unit="°" />
          <PR label="AZ" value={Math.round(node.AZ)} unit="°" />
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
    const { op, seam, ax, ay, az } = node
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
          <Divider label="Orientation (owner part)" />
          <PR label="AX" value={Math.round(ax)} unit="°" />
          <PR label="AY" value={Math.round(ay)} unit="°" />
          <PR label="AZ" value={Math.round(az)} unit="°" />
          <Divider label="Tooling" />
          <EVR label="Tool Ø"   field="tool_diameter_mm" unit="mm" />
          <EVR label="Depth"    field="depth_mm"         unit="mm" />
          <EVR label="Offset X" field="offset_x_mm"      unit="mm" />
          <EVR label="Offset Y" field="offset_y_mm"      unit="mm" />
          <EVR label="Offset Z" field="offset_z_mm"      unit="mm" />
          <EVR label="Qty"      field="qty" />
          {(op.spacing_mm !== null || exprs.spacing_mm) && <EVR label="Spacing" field="spacing_mm" unit="mm" />}
          {(op.auto_tool || op.router_tool_id || op.drill_id) && (
            <PR label="Tool" value={op.auto_tool ? 'Auto-select' : op.drill_id ? 'Drill' : 'Router bit'} />
          )}
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
          <PR label="X" value={fmtMm(d.x)} unit="mm" />
          <PR label="Y" value={fmtMm(d.y)} unit="mm" />
          <PR label="Z" value={fmtMm(d.z)} unit="mm" />
        </dl>
      </div>
    )
  }

  return null
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function CabinetTreePanel({ rp, partOverrides }: { rp: ResolvedCabinet; partOverrides?: PartPosOverrides }) {
  const sections = buildSections(rp, partOverrides)

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
