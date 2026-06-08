'use client'

import { useState, useEffect } from 'react'
import type { Room, Wall, CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet, ResolvedSeamJoint, JointTypeOp } from '@/src/lib/resolver/types'
import {
  dbLoadPartPosOverrides, dbSavePartPosOverride, dbDeletePartPosOverride,
  type PartPosOverrides,
} from './canvasDB'
// ── Part label maps ───────────────────────────────────────────────────────────

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
  door: 'Door', drawer_face: 'Drawer Face', open: 'Open',
  fixed_panel: 'Fixed Panel', false_panel: 'False Panel',
}
const DB_LABELS: Record<string, string> = {
  db_left_side: 'DB Left Side', db_right_side: 'DB Right Side', db_bottom: 'DB Bottom',
  db_front: 'DB Front', db_back: 'DB Back',
}
const OP_LABELS: Record<string, string> = {
  drill: 'Bore', route: 'Route', pocket: 'Pocket', saw: 'Saw',
}

// ── Tree node types ───────────────────────────────────────────────────────────

type NodeKind = 'room' | 'wall' | 'cabinet' | 'section' | 'part' | 'seam' | 'op'

type PartPayload = {
  kind: 'part'
  cabinetId: string
  wall: Wall
  // cabinet position fields (for room-space transform)
  cabPosX: number; cabPosY: number; cabPosZ: number
  cabDy: number; cabClass: string
  partId: string
  localX: number; localY: number; localZ: number
  DX: number; DY: number; DZ: number
  AX: number; AY: number; AZ: number
  materialId: string | null | undefined
}

type TreeNode = {
  id: string
  label: string
  detail?: string
  children: TreeNode[]
  expandable: boolean
} & (
  | { kind: 'room';    room: Room }
  | { kind: 'wall';   wall: Wall }
  | { kind: 'cabinet'; cabinet: CabinetInstance; wall: Wall }
  | { kind: 'section' }
  | PartPayload
  | { kind: 'seam';   cabinetId: string; seam: ResolvedSeamJoint }
  | { kind: 'op';     cabinetId: string; op: JointTypeOp; ownerPartId: string; ax: number; ay: number; az: number }
)

// ── Tree builder ──────────────────────────────────────────────────────────────

function makePartNode(
  id: string,
  label: string,
  detail: string | undefined,
  payload: Omit<PartPayload, 'kind'>,
  partKey: string,
  rp: ResolvedCabinet,
  cabOverrides: PartPosOverrides | undefined,
): TreeNode {
  // Resolved base angles are 0; live rotation comes from the part's override.
  // Carry the effective angle so the tree matches the rotated part in the views.
  const ov  = cabOverrides?.[payload.partId]
  const eAX = payload.AX + (ov?.oax ?? 0)
  const eAY = payload.AY + (ov?.oay ?? 0)
  const eAZ = payload.AZ + (ov?.oaz ?? 0)
  // Joints are owned by their MASTER part (part_a): the whole joint, with every
  // operation — including the holes it bores into the slave — hangs off the master,
  // matching how the operation moves/rotates with the master in the views. Each op
  // carries its owner's rotation so its orientation can be shown (it travels with it).
  const seamNodes: TreeNode[] = []
  for (const seam of rp.seam_joints) {
    if (seam.part_a_key !== partKey) continue
    if (seam.ops.length === 0) continue

    const opNodes: TreeNode[] = seam.ops.map(op => {
      const targetKey = op.target_part === 'part_a' ? seam.part_a_key : seam.part_b_key
      return {
        id:   `op-${payload.cabinetId}-${seam.seam_key}-${op.id}`,
        kind: 'op' as const,
        label: `${OP_LABELS[op.machine_operation] ?? op.machine_operation} Ø${op.tool_diameter_mm}×${op.depth_mm}mm`,
        detail: [
          `→ ${CASE_LABELS[targetKey] ?? targetKey.replace(/_/g, ' ')}`,
          op.face !== 'normal' ? op.face : null,
          op.qty > 1 ? `×${op.qty}` : null,
          op.auto_tool ? 'auto' : null,
        ].filter(Boolean).join(' · ') || undefined,
        children: [],
        expandable: false,
        cabinetId: payload.cabinetId,
        op,
        ownerPartId: payload.partId,
        ax: eAX, ay: eAY, az: eAZ,
      }
    })

    seamNodes.push({
      id:    `seam-${payload.cabinetId}-${seam.seam_key}`,
      kind:  'seam' as const,
      label: seam.joint_type_name,
      detail: seam.seam_key.replace(':', ' → '),
      children: opNodes,
      expandable: opNodes.length > 0,
      cabinetId: payload.cabinetId,
      seam,
    })
  }

  return {
    id, label, detail,
    children: seamNodes,
    expandable: seamNodes.length > 0,
    kind: 'part',
    ...payload,
    AX: eAX, AY: eAY, AZ: eAZ,
  }
}

function buildTree(
  room: Room,
  walls: Wall[],
  cabinets: CabinetInstance[],
  resolvedParts: Map<string, ResolvedCabinet>,
  overrides: Map<string, PartPosOverrides>,
): TreeNode {
  const wallNodes: TreeNode[] = walls.map(wall => {
    const wallCabs = cabinets.filter(c => c.wall_id === wall.id)

    const cabNodes: TreeNode[] = wallCabs.map(cab => {
      const rp = resolvedParts.get(cab.id)
      const groups: TreeNode[] = []

      if (rp) {
        const cabPos = { cabPosX: cab.pos_x, cabPosY: cab.pos_y, cabPosZ: cab.pos_z, cabDy: cab.dy, cabClass: cab.assembly_class }
        const cabOv = overrides.get(cab.id)

        // ── Case ──────────────────────────────────────────────────────────────
        if (rp.case_parts.length > 0) {
          const parts: TreeNode[] = rp.case_parts.map(p => makePartNode(
            `part-${cab.id}-case_${p.part_key}`,
            CASE_LABELS[p.part_key] ?? p.part_key.replace(/_/g, ' '),
            undefined,
            { cabinetId: cab.id, wall, ...cabPos, partId: `case_${p.part_key}`,
              localX: p.X, localY: p.Y, localZ: p.Z,
              DX: p.DX, DY: p.DY, DZ: p.DZ,
              AX: p.AX, AY: p.AY, AZ: p.AZ,
              materialId: p.material_id },
            p.part_key, rp, cabOv,
          ))
          groups.push({ id: `sec-${cab.id}-case`, kind: 'section', label: 'Case',
            children: parts, expandable: parts.length > 0, detail: `${parts.length}` })
        }

        // ── Toe Kick ──────────────────────────────────────────────────────────
        if (rp.toekick_parts.length > 0) {
          const parts: TreeNode[] = rp.toekick_parts.map(p => makePartNode(
            `part-${cab.id}-tk_${p.part_key}_${p.sort_order}`,
            TK_LABELS[p.part_key] ?? p.part_key.replace(/_/g, ' '),
            undefined,
            { cabinetId: cab.id, wall, ...cabPos, partId: `tk_${p.part_key}_${p.sort_order}`,
              localX: p.X, localY: p.Y, localZ: p.Z,
              DX: p.DX, DY: p.DY, DZ: p.DZ,
              AX: p.AX, AY: p.AY, AZ: p.AZ,
              materialId: p.material_id },
            p.part_key, rp, cabOv,
          ))
          groups.push({ id: `sec-${cab.id}-tk`, kind: 'section', label: 'Toe Kick',
            children: parts, expandable: parts.length > 0, detail: `${parts.length}` })
        }

        // ── Interior ──────────────────────────────────────────────────────────
        const intParts: TreeNode[] = rp.internal_parts.map(p => makePartNode(
          `part-${cab.id}-int_${p.part_type}_${p.sort_order}`,
          `${INT_LABELS[p.part_type] ?? p.part_type.replace(/_/g, ' ')} ${p.sort_order + 1}`,
          undefined,
          { cabinetId: cab.id, wall, ...cabPos, partId: `int_${p.part_type}_${p.sort_order}`,
            localX: p.X, localY: p.Y, localZ: p.Z,
            DX: p.DX, DY: p.DY, DZ: p.DZ,
            AX: p.AX, AY: p.AY, AZ: p.AZ,
            materialId: p.material_id },
          p.part_type, rp, cabOv,
        ))

        const drawerNodes: TreeNode[] = (rp.drawer_stacks ?? []).flatMap(stack => {
          const dbParts: TreeNode[] = stack.box_parts.map(p => makePartNode(
            `part-${cab.id}-db_${stack.face_zone_row}_${stack.face_zone_col}_${p.part_type}`,
            DB_LABELS[p.part_type] ?? p.part_type,
            `R${stack.face_zone_row + 1}C${stack.face_zone_col + 1}`,
            { cabinetId: cab.id, wall, ...cabPos, partId: `db_${stack.face_zone_row}_${stack.face_zone_col}_${p.part_type}`,
              localX: p.X, localY: p.Y, localZ: p.Z,
              DX: p.DX, DY: p.DY, DZ: p.DZ,
              AX: p.AX, AY: p.AY, AZ: p.AZ,
              materialId: p.material_id },
            p.part_type, rp, cabOv,
          ))
          const slideNodes: TreeNode[] = stack.slides.map(s => makePartNode(
            `part-${cab.id}-slide_${stack.face_zone_row}_${stack.face_zone_col}_${s.side}`,
            `Slide (${s.side})`,
            `R${stack.face_zone_row + 1}C${stack.face_zone_col + 1} · ${s.nominal_length}mm`,
            { cabinetId: cab.id, wall, ...cabPos, partId: `slide_${stack.face_zone_row}_${stack.face_zone_col}_${s.side}`,
              localX: s.X, localY: s.Y, localZ: s.Z,
              DX: s.DX, DY: s.DY, DZ: s.DZ,
              AX: 0, AY: 0, AZ: 0,
              materialId: null },
            '', rp, cabOv,
          ))
          return [...dbParts, ...slideNodes]
        })

        const allInt = [...intParts, ...drawerNodes]
        if (allInt.length > 0) {
          groups.push({ id: `sec-${cab.id}-int`, kind: 'section', label: 'Interior',
            children: allInt, expandable: true, detail: `${allInt.length}` })
        }

        // ── Face ──────────────────────────────────────────────────────────────
        if (rp.face_zones.length > 0) {
          const parts: TreeNode[] = rp.face_zones.map(z => makePartNode(
            `part-${cab.id}-zone_${z.row_index}_${z.col_index}`,
            `${FACE_LABELS[z.face_type] ?? z.face_type} R${z.row_index + 1}C${z.col_index + 1}`,
            z.hinge_side ? `Hinge: ${z.hinge_side}` : undefined,
            { cabinetId: cab.id, wall, ...cabPos, partId: `zone_${z.row_index}_${z.col_index}`,
              localX: z.X, localY: z.Y, localZ: z.Z,
              DX: z.DX, DY: z.DY, DZ: z.DZ,
              AX: z.AX, AY: z.AY, AZ: z.AZ,
              materialId: z.material_id },
            z.face_type, rp, cabOv,
          ))
          groups.push({ id: `sec-${cab.id}-face`, kind: 'section', label: 'Face',
            children: parts, expandable: parts.length > 0, detail: `${parts.length}` })
        }
      }

      return {
        id:     `cab-${cab.id}`,
        kind:   'cabinet' as const,
        label:  cab.label ?? cab.assembly_class.replace(/_/g, ' '),
        detail: `${cab.dx}×${cab.dy}×${cab.dz}`,
        children: groups,
        expandable: groups.length > 0,
        cabinet: cab,
        wall,
      }
    })

    return {
      id:    `wall-${wall.id}`,
      kind:  'wall' as const,
      label: wall.name,
      detail: `${wallCabs.length} cabinet${wallCabs.length !== 1 ? 's' : ''}`,
      children: cabNodes,
      expandable: cabNodes.length > 0,
      wall,
    }
  })

  return {
    id: 'room',
    kind: 'room',
    label: room.name,
    detail: `${walls.length} wall${walls.length !== 1 ? 's' : ''}`,
    children: wallNodes,
    expandable: wallNodes.length > 0,
    room,
  }
}

// ── Tree row component ────────────────────────────────────────────────────────

const KIND_ICON: Record<NodeKind, string> = {
  room: '⌂', wall: '▦', cabinet: '▣', section: '▸', part: '▬', seam: '⟳', op: '•',
}
const KIND_COLOR: Record<NodeKind, string> = {
  room: 'text-sky-400', wall: 'text-amber-400', cabinet: 'text-emerald-400',
  section: 'text-gray-400', part: 'text-gray-300', seam: 'text-violet-400', op: 'text-gray-500',
}

// Compact rotation tag (parts carry AX/AY/AZ, ops carry their owner's ax/ay/az,
// both already including any rotation override). Shown only when some axis is
// non-zero so unrotated rows stay clean.
function angleTag(node: TreeNode): string | null {
  let ax = 0, ay = 0, az = 0
  if (node.kind === 'part')    { ax = node.AX; ay = node.AY; az = node.AZ }
  else if (node.kind === 'op') { ax = node.ax; ay = node.ay; az = node.az }
  else return null
  if (!Math.round(ax) && !Math.round(ay) && !Math.round(az)) return null
  return `∠ ${Math.round(ax)}/${Math.round(ay)}/${Math.round(az)}°`
}

function TreeRow({
  node, depth, expanded, selected,
  onToggle, onSelect,
}: {
  node: TreeNode
  depth: number
  expanded: boolean
  selected: boolean
  onToggle: (id: string) => void
  onSelect: (node: TreeNode) => void
}) {
  const hasChildren = node.expandable
  const aTag = angleTag(node)
  return (
    <div
      className={`flex items-center gap-1 px-2 py-0.5 cursor-pointer select-none rounded-sm
        ${selected ? 'bg-blue-700/60 text-white' : 'hover:bg-gray-800/60 text-gray-300'}`}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
      onClick={() => { onSelect(node); if (hasChildren) onToggle(node.id) }}
    >
      <span className="w-3 text-[10px] text-gray-600 shrink-0">
        {hasChildren ? (expanded ? '▾' : '▸') : ''}
      </span>
      <span className={`text-[10px] shrink-0 ${KIND_COLOR[node.kind]}`}>{KIND_ICON[node.kind]}</span>
      <span className="text-xs truncate">{node.label}</span>
      {node.detail && (
        <span className="text-[10px] text-gray-600 shrink-0 ml-1">{node.detail}</span>
      )}
      {aTag && <span className="text-[10px] text-sky-400 font-mono shrink-0 ml-auto pl-1">{aTag}</span>}
    </div>
  )
}

function TreeBranch({
  node, depth, expandedIds, selectedId, onToggle, onSelect,
}: {
  node: TreeNode
  depth: number
  expandedIds: Set<string>
  selectedId: string | null
  onToggle: (id: string) => void
  onSelect: (node: TreeNode) => void
}) {
  const expanded = expandedIds.has(node.id)
  return (
    <>
      <TreeRow
        node={node} depth={depth} expanded={expanded}
        selected={selectedId === node.id}
        onToggle={onToggle} onSelect={onSelect}
      />
      {expanded && node.children.map(child => (
        <TreeBranch
          key={child.id} node={child} depth={depth + 1}
          expandedIds={expandedIds} selectedId={selectedId}
          onToggle={onToggle} onSelect={onSelect}
        />
      ))}
    </>
  )
}

// ── Properties panel ──────────────────────────────────────────────────────────

function PropRow({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <>
      <dt className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</dt>
      <dd className="text-xs text-gray-200 font-mono text-right">{value}{unit ? <span className="text-gray-600 ml-0.5 text-[10px]">{unit}</span> : null}</dd>
    </>
  )
}

function EditPropRow({ label, value, unit, onChange }: {
  label: string; value: number; unit?: string
  onChange: (v: number) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <>
      <dt className="text-[10px] text-gray-500 uppercase tracking-wider self-center">{label}</dt>
      <dd className="flex items-center justify-end gap-1">
        <input
          type="number" value={draft} step="1"
          onChange={e => setDraft(parseFloat(e.target.value) || 0)}
          onBlur={e => { const v = parseFloat(e.target.value) || 0; setDraft(v); onChange(v) }}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          onFocus={e => e.target.select()}
          className="w-20 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs font-mono text-right text-white focus:outline-none focus:border-blue-500"
        />
        {unit && <span className="text-[10px] text-gray-600">{unit}</span>}
      </dd>
    </>
  )
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="col-span-2 pt-3 pb-0.5 border-t border-gray-800">
      <span className="text-[10px] uppercase tracking-widest text-gray-600">{label}</span>
    </div>
  )
}

function PropertiesPanel({
  node, room,
  onUpdateCabinet,
  overrideCache, setOverrideCache,
}: {
  node: TreeNode | null
  room: Room
  onUpdateCabinet: (id: string, u: Partial<CabinetInstance>) => Promise<void>
  overrideCache: Map<string, PartPosOverrides>
  setOverrideCache: React.Dispatch<React.SetStateAction<Map<string, PartPosOverrides>>>
}) {
  if (!node) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-gray-600">Select a node to view properties</p>
      </div>
    )
  }

  // ── Wall ──────────────────────────────────────────────────────────────────
  if (node.kind === 'wall') {
    const w = node.wall
    return (
      <div className="p-4 space-y-2">
        <h3 className="text-sm font-semibold text-gray-200 mb-3">{w.name}</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 items-baseline">
          <PropRow label="Type"    value={w.wall_type} />
          <PropRow label="Length"  value={w.length}  unit="mm" />
          <PropRow label="Height"  value={w.height ?? '—'}  unit={w.height ? 'mm' : ''} />
          <PropRow label="Angle"   value={w.angle}   unit="°" />
          <PropRow label="Pos X"   value={w.pos_x}   unit="mm" />
          <PropRow label="Pos Y"   value={w.pos_y}   unit="mm" />
          <PropRow label="Thickness" value={w.thickness} unit="mm" />
        </dl>
      </div>
    )
  }

  // ── Cabinet ───────────────────────────────────────────────────────────────
  if (node.kind === 'cabinet') {
    const c = node.cabinet
    return (
      <div className="p-4">
        <h3 className="text-sm font-semibold text-gray-200 mb-1">{c.label ?? c.assembly_class.replace(/_/g, ' ')}</h3>
        <p className="text-[10px] text-gray-500 mb-3">{c.assembly_class}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 items-baseline">
          <SectionDivider label="Dimensions" />
          <PropRow label="DX" value={c.dx} unit="mm" />
          <PropRow label="DY" value={c.dy} unit="mm" />
          <PropRow label="DZ" value={c.dz} unit="mm" />
          <SectionDivider label="Position" />
          <EditPropRow label="X" value={c.pos_x} unit="mm" onChange={v => onUpdateCabinet(c.id, { pos_x: v })} />
          <EditPropRow label="Y" value={c.pos_y} unit="mm" onChange={v => onUpdateCabinet(c.id, { pos_y: v })} />
          <EditPropRow label="Z" value={c.pos_z} unit="mm" onChange={v => onUpdateCabinet(c.id, { pos_z: v })} />
          <EditPropRow label="Rotation" value={c.rotation} unit="°" onChange={v => onUpdateCabinet(c.id, { rotation: v })} />
        </dl>
      </div>
    )
  }

  // ── Part ─────────────────────────────────────────────────────────────────
  if (node.kind === 'part') {
    const n = node
    const θ = node.wall.angle * Math.PI / 180
    const floorY = (node.cabClass === 'wall' || node.cabClass === 'wall_corner')
      ? (room.wall_cabinet_top ?? 2100) - node.cabDy : 0
    const c = Math.cos(θ), s = Math.sin(θ)
    const roomX = Math.round(node.cabPosX + node.localX * c - node.localZ * s)
    const roomY = Math.round(floorY + node.localY)
    const roomZ = Math.round(node.cabPosY + node.localX * s + node.localZ * c)

    const ovs = overrideCache.get(node.cabinetId) ?? {}
    const ov  = ovs[node.partId]

    function saveOv(ox: number, oy: number, oz: number, oax = ov?.oax ?? 0, oay = ov?.oay ?? 0, oaz = ov?.oaz ?? 0) {
      const entry = { ox, oy, oz, oax, oay, oaz }
      setOverrideCache(prev => new Map(prev).set(n.cabinetId, { ...ovs, [n.partId]: entry }))
      dbSavePartPosOverride(n.cabinetId, n.partId, entry, ovs).catch(console.error)
    }

    function removeOv() {
      const { [n.partId]: _r, ...rest } = ovs
      setOverrideCache(prev => new Map(prev).set(n.cabinetId, rest))
      dbDeletePartPosOverride(n.cabinetId, n.partId, ovs).catch(console.error)
    }

    return (
      <div className="p-4 overflow-y-auto">
        <h3 className="text-sm font-semibold text-gray-200 mb-3">{node.label}</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 items-baseline">
          <SectionDivider label="Room Space" />
          <PropRow label="X" value={roomX} unit="mm" />
          <PropRow label="Y (height)" value={roomY} unit="mm" />
          <PropRow label="Z" value={roomZ} unit="mm" />
          <SectionDivider label="Cabinet-Local" />
          <PropRow label="X" value={Math.round(node.localX)} unit="mm" />
          <PropRow label="Y" value={Math.round(node.localY)} unit="mm" />
          <PropRow label="Z" value={Math.round(node.localZ)} unit="mm" />
          <PropRow label="AX" value={Math.round(node.AX)} unit="°" />
          <PropRow label="AY" value={Math.round(node.AY)} unit="°" />
          <PropRow label="AZ" value={Math.round(node.AZ)} unit="°" />
          <SectionDivider label="Dimensions" />
          <PropRow label="DX" value={Math.round(node.DX)} unit="mm" />
          <PropRow label="DY" value={Math.round(node.DY)} unit="mm" />
          <PropRow label="DZ" value={Math.round(node.DZ)} unit="mm" />

          {ov && <SectionDivider label="Position Override" />}
          {ov && (
            <>
              <EditPropRow label="ox" value={ov.ox} unit="mm" onChange={v => saveOv(v, ov.oy, ov.oz)} />
              <EditPropRow label="oy" value={ov.oy} unit="mm" onChange={v => saveOv(ov.ox, v, ov.oz)} />
              <EditPropRow label="oz" value={ov.oz} unit="mm" onChange={v => saveOv(ov.ox, ov.oy, v)} />
              <EditPropRow label="oax" value={ov.oax ?? 0} unit="°" onChange={v => saveOv(ov.ox, ov.oy, ov.oz, v, ov.oay, ov.oaz)} />
              <EditPropRow label="oay" value={ov.oay ?? 0} unit="°" onChange={v => saveOv(ov.ox, ov.oy, ov.oz, ov.oax, v, ov.oaz)} />
              <EditPropRow label="oaz" value={ov.oaz ?? 0} unit="°" onChange={v => saveOv(ov.ox, ov.oy, ov.oz, ov.oax, ov.oay, v)} />
              <div className="col-span-2 pt-1">
                <button onClick={removeOv} className="text-xs text-red-500 hover:text-red-300">Remove override</button>
              </div>
            </>
          )}
          {!ov && (
            <div className="col-span-2 pt-2">
              <button
                onClick={() => saveOv(0, 0, 0)}
                className="text-xs text-sky-500 hover:text-sky-300"
              >+ Add position override</button>
            </div>
          )}
        </dl>
      </div>
    )
  }

  // ── Seam joint ────────────────────────────────────────────────────────────
  if (node.kind === 'seam') {
    const seam = node.seam
    return (
      <div className="p-4">
        <h3 className="text-sm font-semibold text-gray-200 mb-1">{seam.joint_type_name}</h3>
        <p className="text-[10px] text-gray-500 mb-3">{seam.seam_key} · {seam.source}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 items-baseline">
          <PropRow label="Part A" value={seam.part_a_key.replace(/_/g, ' ')} />
          <PropRow label="Part B" value={seam.part_b_key.replace(/_/g, ' ')} />
          <PropRow label="Ops"    value={seam.ops.length} />
        </dl>
      </div>
    )
  }

  // ── Machining op ──────────────────────────────────────────────────────────
  if (node.kind === 'op') {
    const op = node.op
    // Operation orientation = its owner (master) part's effective rotation (the op
    // is attached to the master and rotates with it). node.ax/ay/az already fold in
    // the owner's rotation override.
    const ax = Math.round(node.ax)
    const ay = Math.round(node.ay)
    const az = Math.round(node.az)
    return (
      <div className="p-4">
        <h3 className="text-sm font-semibold text-gray-200 mb-1">
          {OP_LABELS[op.machine_operation] ?? op.machine_operation}
        </h3>
        <p className="text-[10px] text-gray-500 mb-3">{op.target_part.replace('_', ' ')} · face: {op.face}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 items-baseline">
          <SectionDivider label="Orientation (owner part)" />
          <PropRow label="AX" value={ax} unit="°" />
          <PropRow label="AY" value={ay} unit="°" />
          <PropRow label="AZ" value={az} unit="°" />
          <SectionDivider label="Tooling" />
          <PropRow label="Tool Ø"   value={op.tool_diameter_mm} unit="mm" />
          <PropRow label="Depth"    value={op.depth_mm}         unit="mm" />
          <PropRow label="Offset X" value={op.offset_x_mm}     unit="mm" />
          <PropRow label="Offset Y" value={op.offset_y_mm}     unit="mm" />
          <PropRow label="Offset Z" value={op.offset_z_mm}     unit="mm" />
          <PropRow label="Qty"      value={op.qty} />
          {op.spacing_mm !== null && <PropRow label="Spacing" value={op.spacing_mm} unit="mm" />}
          {(op.auto_tool || op.router_tool_id || op.drill_id) && (
            <PropRow label="Tool" value={op.auto_tool ? 'Auto-select' : op.drill_id ? 'Drill' : 'Router bit'} />
          )}
          {op.notes && <PropRow label="Notes" value={op.notes} />}
          {op.expressions && Object.keys(op.expressions).length > 0 && (
            <>
              <SectionDivider label="Expressions" />
              {Object.entries(op.expressions).map(([k, v]) => (
                <PropRow key={k} label={k} value={v} />
              ))}
            </>
          )}
        </dl>
      </div>
    )
  }

  return null
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function ObjectTreeModal({
  room, walls, cabinets, resolvedParts, onUpdateCabinet, onClose,
}: {
  room: Room
  walls: Wall[]
  cabinets: CabinetInstance[]
  resolvedParts: Map<string, ResolvedCabinet>
  onUpdateCabinet: (id: string, u: Partial<CabinetInstance>) => Promise<void>
  onClose: () => void
}) {
  // Expand room + all walls by default
  const defaultExpanded = new Set<string>(['room', ...walls.map(w => `wall-${w.id}`)])
  const [expandedIds, setExpandedIds]     = useState<Set<string>>(defaultExpanded)
  const [selectedId, setSelectedId]       = useState<string | null>(null)
  const [selectedNode, setSelectedNode]   = useState<TreeNode | null>(null)
  const [overrideCache, setOverrideCache] = useState<Map<string, PartPosOverrides>>(new Map())

  const tree = buildTree(room, walls, cabinets, resolvedParts, overrideCache)

  // Eager-load every cabinet's overrides once so the inline rotation tags are
  // consistent across the whole tree without having to select each part first.
  useEffect(() => {
    let cancelled = false
    Promise.all(cabinets.map(c =>
      dbLoadPartPosOverrides(c.id).then(ovs => [c.id, ovs] as const).catch(() => [c.id, {}] as const),
    )).then(entries => {
      if (!cancelled) setOverrideCache(prev => { const next = new Map(prev); for (const [id, ovs] of entries) if (!next.has(id)) next.set(id, ovs); return next })
    })
    return () => { cancelled = true }
  }, [cabinets])

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleSelect(node: TreeNode) {
    setSelectedId(node.id)
    setSelectedNode(node)

    // Load overrides for this cabinet if not yet cached (parts edit them; ops read
    // their owner's rotation override to show effective orientation).
    if ((node.kind === 'part' || node.kind === 'op') && !overrideCache.has(node.cabinetId)) {
      dbLoadPartPosOverrides(node.cabinetId).then(ovs => {
        setOverrideCache(prev => new Map(prev).set(node.cabinetId, ovs))
      }).catch(console.error)
    }
  }

  function expandAll() {
    const ids = new Set<string>()
    function collect(n: TreeNode) { ids.add(n.id); n.children.forEach(collect) }
    collect(tree)
    setExpandedIds(ids)
  }

  function collapseAll() {
    setExpandedIds(new Set(['room']))
  }

  // Keep selected node fresh if resolvedParts changes
  useEffect(() => {
    if (selectedNode?.kind === 'part') {
      // Re-find the node in the rebuilt tree by id — no-op for now, tree is rebuilt on each render
    }
  }, [resolvedParts]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onPointerDown={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col"
        style={{ width: '1150px', height: '88vh' }}
        onPointerDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 shrink-0">
          <div className="flex items-baseline gap-3">
            <p className="text-sm font-semibold text-white">Object Tree</p>
            <p className="text-xs text-gray-500">{room.name}</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={expandAll}   className="text-xs text-gray-500 hover:text-gray-300">Expand all</button>
            <button onClick={collapseAll} className="text-xs text-gray-500 hover:text-gray-300">Collapse</button>
            <button onClick={onClose} className="text-gray-500 hover:text-white text-base leading-none px-1">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Tree */}
          <div className="w-[420px] shrink-0 border-r border-gray-800 overflow-y-auto py-2">
            <TreeBranch
              node={tree}
              depth={0}
              expandedIds={expandedIds}
              selectedId={selectedId}
              onToggle={toggleExpand}
              onSelect={handleSelect}
            />
          </div>

          {/* Properties */}
          <div className="flex-1 overflow-y-auto">
            <PropertiesPanel
              node={selectedNode}
              room={room}
              onUpdateCabinet={onUpdateCabinet}
              overrideCache={overrideCache}
              setOverrideCache={setOverrideCache}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
