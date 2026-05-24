'use client'

import { useState, useRef, useEffect } from 'react'
import type { CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet, Section, SplitSection, SectionChild, AdjShelfInput } from '@/src/lib/resolver/types'
import { EMPTY_SECTION } from '@/src/lib/resolver/types'
import { getUserPrefs } from '@/src/lib/userPrefs'

function useSvgZoom(initW: number, initH: number) {
  const initRef = useRef({ w: initW, h: initH })
  const vbRef   = useRef({ x: 0, y: 0, w: initW, h: initH })
  const [vb, setVb] = useState({ x: 0, y: 0, w: initW, h: initH })
  const svgRef  = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const { x, y, w, h } = vbRef.current
      const delta = getUserPrefs().invertScroll ? -e.deltaY : e.deltaY
      const factor = delta > 0 ? 1.15 : 1 / 1.15
      const vx = x + (cx / rect.width) * w
      const vy = y + (cy / rect.height) * h
      const newW = Math.max(initRef.current.w / 20, Math.min(initRef.current.w * 4, w * factor))
      const newH = h * (newW / w)
      const next = { x: vx - (cx / rect.width) * newW, y: vy - (cy / rect.height) * newH, w: newW, h: newH }
      vbRef.current = next
      setVb({ ...next })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return { svgRef, viewBox: `${vb.x} ${vb.y} ${vb.w} ${vb.h}` }
}

// ── Display constants ────────────────────────────────────────────────────────
// Approximate — mirrors resolveInternal.ts using construction-rule defaults.
const MAT_T   = 18   // carcass / divider thickness
const SHELF_T = 18   // shelf thickness
const ADJ_INSET = 1  // adj shelf pin clearance (display)
const DEF_TOE = 150  // default toe kick height
const MIN_BAY = 10   // minimum bay extent when dragging a separator

// ── Geometry ─────────────────────────────────────────────────────────────────

type Path = number[]
interface Box { x: number; y: number; w: number; h: number }   // cabinet coords; y = bottom

interface SepDisplay {
  path:       Path
  index:      number          // separator sits after children[index]
  axis:       'h' | 'v'       // h = horizontal shelf, v = vertical divider
  box:        Box             // separator rect (y = bottom)
  childStart: number          // start coord of children[index] along the split axis
  splitEnd:   number          // far edge of the split box along the axis
  sepT:       number
  locked:     boolean
}

interface LeafDisplay {
  path:     Path
  box:      Box
  adjYs:    number[]          // adj shelf bottom-face Ys
  adjCount: number
}

function computeLayout(root: Section, interior: Box): { seps: SepDisplay[]; leaves: LeafDisplay[] } {
  const seps:   SepDisplay[]  = []
  const leaves: LeafDisplay[] = []

  function walk(section: Section, box: Box, path: Path) {
    if (box.w <= 0 || box.h <= 0) return

    if (section.type === 'open') {
      const n = section.adj_shelves.length
      const adjYs: number[] = []
      if (n > 0) {
        const openH = (box.h - n * SHELF_T) / (n + 1)
        if (openH > 0) section.adj_shelves.forEach((s, i) => {
          adjYs.push((s.y_locked && s.y_position !== undefined) ? s.y_position : box.y + (i + 1) * openH + i * SHELF_T)
        })
      }
      leaves.push({ path, box, adjYs, adjCount: n })
      return
    }

    const horiz = section.type === 'hsplit'
    const sepT  = horiz ? SHELF_T : MAT_T
    const total = horiz ? box.h : box.w
    const kids  = section.children
    const N     = kids.length
    if (N === 0) return

    const avail     = total - (N - 1) * sepT
    const lockedSum = kids.reduce((a, c) => a + (c.size ?? 0), 0)
    const flexCount = kids.filter(c => c.size === undefined).length
    const flexSize  = flexCount > 0 ? (avail - lockedSum) / flexCount : 0
    const splitEnd  = horiz ? box.y + box.h : box.x + box.w

    let cursor = horiz ? box.y : box.x
    kids.forEach((c, i) => {
      const size = c.size ?? Math.max(0, flexSize)
      const childBox: Box = horiz
        ? { x: box.x, y: cursor, w: box.w, h: size }
        : { x: cursor, y: box.y, w: size, h: box.h }

      walk(c.section, childBox, [...path, i])

      if (i < N - 1) {
        seps.push({
          path, index: i, axis: horiz ? 'h' : 'v',
          box: horiz ? { x: box.x, y: cursor + size, w: box.w, h: sepT }
                     : { x: cursor + size, y: box.y, w: sepT, h: box.h },
          childStart: cursor, splitEnd, sepT, locked: c.size !== undefined,
        })
      }
      cursor += size + (i < N - 1 ? sepT : 0)
    })
  }

  walk(root, interior, [])
  return { seps, leaves }
}

// ── Tree helpers (all immutable) ─────────────────────────────────────────────

const pathEq = (a: Path, b: Path) => a.length === b.length && a.every((v, i) => v === b[i])

function getSection(root: Section, path: Path): Section | null {
  let cur: Section = root
  for (const i of path) {
    if (cur.type === 'open') return null
    const child = cur.children[i]
    if (!child) return null
    cur = child.section
  }
  return cur
}

function updateAtPath(root: Section, path: Path, fn: (s: Section) => Section): Section {
  if (path.length === 0) return fn(root)
  if (root.type === 'open') return root
  const [i, ...rest] = path
  return { ...root, children: root.children.map((c, idx) => idx !== i ? c : { ...c, section: updateAtPath(c.section, rest, fn) }) }
}

const newOpen = (): SectionChild => ({ section: { type: 'open', adj_shelves: [] } })

// Add a separator at a leaf. If the leaf's parent is already a split of the same
// orientation, insert a sibling bay (more bays in the same split). Otherwise split
// the leaf itself into two bays.
function addSeparator(root: Section, path: Path, type: SplitSection['type']): Section {
  const parentPath = path.slice(0, -1)
  const idx        = path[path.length - 1]
  const parent     = path.length > 0 ? getSection(root, parentPath) : null

  if (parent && parent.type === type) {
    return updateAtPath(root, parentPath, s => {
      if (s.type !== type) return s
      const children = [...s.children]
      children.splice(idx + 1, 0, newOpen())
      return { ...s, children }
    })
  }
  return updateAtPath(root, path, s => {
    if (s.type !== 'open') return s
    return { type, children: [newOpen(), newOpen()] }
  })
}

function setAdjCount(root: Section, path: Path, n: number): Section {
  return updateAtPath(root, path, s => {
    if (s.type !== 'open') return s
    const next: AdjShelfInput[] = []
    for (let i = 0; i < n; i++) next.push({ ...(s.adj_shelves[i] ?? { y_locked: false }), sort_order: i })
    return { type: 'open', adj_shelves: next }
  })
}

function setChildSize(root: Section, path: Path, index: number, size: number | undefined): Section {
  return updateAtPath(root, path, s => {
    if (s.type === 'open') return s
    return { ...s, children: s.children.map((c, i) => i !== index ? c : { ...c, size: size === undefined ? undefined : Math.max(1, Math.round(size)) }) }
  })
}

function equaliseSplit(root: Section, path: Path): Section {
  return updateAtPath(root, path, s => s.type === 'open' ? s : { ...s, children: s.children.map(c => ({ ...c, size: undefined })) })
}

function equaliseAll(s: Section): Section {
  if (s.type === 'open') return s
  return { ...s, children: s.children.map(c => ({ size: undefined, section: equaliseAll(c.section) })) }
}

// Delete the separator after children[index]: merge it and the next bay into one
// open compartment. If the split is left with a single child, collapse to it.
function deleteSep(root: Section, path: Path, index: number): Section {
  return updateAtPath(root, path, s => {
    if (s.type === 'open') return s
    const children = [...s.children.slice(0, index), newOpen(), ...s.children.slice(index + 2)]
    return children.length === 1 ? children[0].section : { ...s, children }
  })
}

// ── Types ──────────────────────────────────────────────────────────────────────

type Selection =
  | { kind: 'leaf'; path: Path }
  | { kind: 'sep';  path: Path; index: number }
  | null

type Menu =
  | { kind: 'leaf'; clientX: number; clientY: number; path: Path }
  | { kind: 'sep';  clientX: number; clientY: number; path: Path; index: number; axis: 'h' | 'v' }
  | null

type DragLive = { path: Path; index: number; size: number } | null

// ── Component ──────────────────────────────────────────────────────────────────

export default function InternalGridEditor({
  cabinet,
  rp,
  onUpdate,
}: {
  cabinet: CabinetInstance
  rp?: ResolvedCabinet
  onUpdate: (id: string, u: Partial<CabinetInstance>) => Promise<void>
}) {
  const [tree, setTree]         = useState<Section>(() =>
    ((cabinet.internal_grid as { tree?: Section } | null)?.tree) ?? EMPTY_SECTION
  )
  const [selected, setSelected] = useState<Selection>(null)
  const [menu, setMenu]         = useState<Menu>(null)
  const [dragLive, setDragLive] = useState<DragLive>(null)

  const dragRef = useRef<{
    path: Path; index: number; axis: 'h' | 'v'
    startCabX: number; startCabY: number
    startBoundary: number; childStart: number; min: number; max: number
    moved: boolean; lastSize: number
  } | null>(null)
  const wasDragging = useRef(false)
  const dragDataRef = useRef<{ svg: SVGSVGElement | null; ox: number; oy: number; cabDY: number; save: (t: Section) => void; tree: Section } | null>(null)

  // Close menu on Escape without bubbling to the modal
  useEffect(() => {
    if (!menu) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { e.stopImmediatePropagation(); setMenu(null) } }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [menu])

  // Global drag handlers — stable; read fresh data via dragDataRef
  useEffect(() => {
    function cabPoint(e: MouseEvent): { x: number; y: number } | null {
      const data = dragDataRef.current
      const svg  = data?.svg
      if (!data || !svg) return null
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY
      const inv = svg.getScreenCTM()?.inverse()
      if (!inv) return null
      const u = pt.matrixTransform(inv)   // viewBox/user coords
      return { x: u.x - data.ox, y: data.cabDY - (u.y - data.oy) }
    }
    function onMove(e: MouseEvent) {
      const dr = dragRef.current
      if (!dr) return
      const p = cabPoint(e)
      if (!p) return
      if (!dr.moved && (Math.abs(p.x - dr.startCabX) > 1 || Math.abs(p.y - dr.startCabY) > 1)) dr.moved = true
      if (!dr.moved) return
      const delta    = dr.axis === 'v' ? p.x - dr.startCabX : p.y - dr.startCabY
      const boundary = Math.max(dr.min, Math.min(dr.max, dr.startBoundary + delta))
      const size     = Math.round(boundary - dr.childStart)
      dr.lastSize = size
      setDragLive({ path: dr.path, index: dr.index, size })
    }
    function onUp() {
      const dr = dragRef.current
      dragRef.current = null
      setDragLive(null)
      if (!dr || !dr.moved) return
      wasDragging.current = true
      const data = dragDataRef.current!
      data.save(setChildSize(data.tree, dr.path, dr.index, dr.lastSize))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const toeH = !cabinet.has_toekick
    ? 0
    : rp
      ? rp.toekick_parts.filter(p => p.part_key !== 'spreader_horizontal').reduce((max, p) => Math.max(max, p.DX), 0) || DEF_TOE
      : DEF_TOE

  async function save(next: Section) {
    setTree(next)
    await onUpdate(cabinet.id, { internal_grid: { tree: next } as unknown as Record<string, unknown> })
  }

  // ── SVG geometry ─────────────────────────────────────────────────────────────
  const cabDX = cabinet.dx
  const cabDY = cabinet.dy
  const T = MAT_T
  const PL = 12, PT = 28, PR = 50, PB = 12
  const vw = cabDX + PL + PR
  const vh = cabDY + PT + PB
  const ox = PL, oy = PT
  const { svgRef, viewBox } = useSvgZoom(vw, vh)
  const svgY = (cabY: number) => oy + (cabDY - cabY)

  const intY0 = cabinet.has_toekick ? toeH + T : T
  const intH  = cabDY - intY0 - T
  const intX0 = T
  const intW  = cabDX - 2 * T
  const tkH   = toeH

  const interior: Box = { x: intX0, y: intY0, w: intW, h: intH }
  const layoutTree = dragLive ? setChildSize(tree, dragLive.path, dragLive.index, dragLive.size) : tree
  const { seps, leaves } = computeLayout(layoutTree, interior)

  dragDataRef.current = { svg: svgRef.current, ox, oy, cabDY, save, tree }

  // ── Selection resolution ─────────────────────────────────────────────────────
  const selLeaf = selected?.kind === 'leaf'
    ? leaves.find(l => pathEq(l.path, selected.path)) ?? null
    : null
  const selSep = selected?.kind === 'sep'
    ? seps.find(s => pathEq(s.path, selected.path) && s.index === selected.index) ?? null
    : null
  const selLeafSection = selLeaf ? getSection(tree, selLeaf.path) : null
  const selLeafOpen = selLeafSection?.type === 'open' ? selLeafSection : null

  // Target leaf for toolbar actions: the selected leaf, else the root if it's open.
  const targetPath: Path | null =
    selected?.kind === 'leaf' ? selected.path : (tree.type === 'open' ? [] : null)

  // ── Mutations ────────────────────────────────────────────────────────────────
  function addShelf(path: Path | null)   { if (path) { save(addSeparator(tree, path, 'hsplit')); setMenu(null) } }
  function addDivider(path: Path | null) { if (path) { save(addSeparator(tree, path, 'vsplit')); setMenu(null) } }
  function bumpAdj(path: Path | null, delta: number) {
    if (!path) return
    const s = getSection(tree, path)
    if (s?.type !== 'open') return
    save(setAdjCount(tree, path, Math.max(0, s.adj_shelves.length + delta)))
    setMenu(null)
  }
  function removeSep(path: Path, index: number) {
    setSelected(null); setMenu(null)
    save(deleteSep(tree, path, index))
  }
  function equaliseThis(path: Path) { save(equaliseSplit(tree, path)); setMenu(null) }
  function resetAll() { setSelected(null); setMenu(null); save(EMPTY_SECTION) }

  function commitSepSize(path: Path, index: number, raw: string) {
    const v = parseFloat(raw)
    const locked = raw !== '' && !isNaN(v) && v > 0
    save(setChildSize(tree, path, index, locked ? v : undefined))
  }

  function startDrag(e: React.MouseEvent, sep: SepDisplay) {
    e.preventDefault()
    setMenu(null)
    const data = dragDataRef.current
    const svg  = data?.svg
    if (!svg) return
    const boundary = sep.axis === 'v' ? sep.box.x : sep.box.y   // cab coord of separator near edge
    // Anchor mouse position in cab coords
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY
    const inv = svg.getScreenCTM()?.inverse()
    if (!inv) return
    const u = pt.matrixTransform(inv)
    dragRef.current = {
      path: sep.path, index: sep.index, axis: sep.axis,
      startCabX: u.x - ox, startCabY: cabDY - (u.y - oy),
      startBoundary: boundary, childStart: sep.childStart,
      min: sep.childStart + MIN_BAY,
      max: sep.splitEnd - sep.sepT - MIN_BAY,
      moved: false, lastSize: boundary - sep.childStart,
    }
  }

  // ── Render geometry helpers ──────────────────────────────────────────────────
  const errors   = rp?.errors   ?? []
  const warnings = rp?.warnings ?? []
  const isEmpty  = tree.type === 'open' && tree.adj_shelves.length === 0

  const inp    = 'bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-300 focus:outline-none focus:border-blue-500 w-full text-right'
  const addBtn = 'px-2 py-0.5 rounded text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-gray-700'

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-gray-950">

      {/* Toolbar */}
      <div className="flex-none flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 border-b border-gray-700 flex-wrap text-[11px]">
        <span className="text-gray-500">
          {selected?.kind === 'leaf' ? 'Selected compartment:' : tree.type === 'open' ? 'Interior:' : 'Select a compartment:'}
        </span>
        <button className={addBtn} disabled={!targetPath} onClick={() => addShelf(targetPath)}>Split → shelves</button>
        <button className={addBtn} disabled={!targetPath} onClick={() => addDivider(targetPath)}>Split → columns</button>
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Adj:</span>
          <button className={addBtn} disabled={!targetPath} onClick={() => bumpAdj(targetPath, -1)}>−</button>
          <button className={addBtn} disabled={!targetPath} onClick={() => bumpAdj(targetPath, +1)}>+</button>
        </div>
        <div className="ml-1 flex items-center gap-1">
          <button className={addBtn} onClick={() => save(equaliseAll(tree))}>= Equalise all</button>
          <button className={addBtn} onClick={resetAll}>Reset</button>
        </div>
        {errors.length > 0 && (
          <span className="ml-auto text-[10px] text-red-400">{errors.length} error{errors.length !== 1 ? 's' : ''}</span>
        )}
        {errors.length === 0 && warnings.length > 0 && (
          <span className="ml-auto text-[10px] text-amber-400">{warnings.length} warning{warnings.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* SVG preview */}
        <div
          className="flex-1 overflow-hidden relative"
          onClick={() => { setSelected(null); setMenu(null) }}
          onContextMenu={e => e.preventDefault()}
          style={dragLive ? { cursor: 'grabbing' } : undefined}
        >
          <svg ref={svgRef} viewBox={viewBox} width="100%" height="100%">

            {/* Width dimension */}
            <text x={ox + cabDX / 2} y={PT / 2}
              textAnchor="middle" dominantBaseline="central"
              fontSize={14} fill="#ffffff" fontFamily="system-ui,sans-serif"
            >{cabDX}mm</text>

            {/* Cabinet bg */}
            <rect x={ox} y={oy} width={cabDX} height={cabDY} fill="#0a111e" />

            {/* Toekick */}
            {tkH > 0 && (
              <rect x={ox} y={svgY(tkH)} width={cabDX} height={tkH}
                fill="#06090f" stroke="#1e293b" strokeWidth={0.5} />
            )}

            {/* Side / top / bottom panels */}
            <rect x={ox}             y={oy} width={T} height={cabDY} fill="#0f172a" stroke="#1e293b" strokeWidth={0.5} />
            <rect x={ox + cabDX - T} y={oy} width={T} height={cabDY} fill="#0f172a" stroke="#1e293b" strokeWidth={0.5} />
            <rect x={ox + T} y={oy} width={cabDX - 2 * T} height={T} fill="#0f172a" stroke="#1e293b" strokeWidth={0.5} />
            <rect x={ox + T} y={svgY(tkH + T)} width={cabDX - 2 * T} height={T} fill="#0f172a" stroke="#1e293b" strokeWidth={0.5} />

            {/* Compartments (leaves) — drawn first; click to select */}
            {leaves.map(leaf => {
              const isSel = selected?.kind === 'leaf' && pathEq(selected.path, leaf.path)
              const key = `leaf-${leaf.path.join('.') || 'root'}`
              return (
                <g key={key}>
                  <rect
                    x={ox + leaf.box.x} y={svgY(leaf.box.y + leaf.box.h)}
                    width={leaf.box.w} height={leaf.box.h}
                    fill={isSel ? 'rgba(59,130,246,0.10)' : 'transparent'}
                    stroke={isSel ? '#3b82f6' : 'none'}
                    strokeWidth={isSel ? 1.5 : 0}
                    style={{ cursor: 'pointer' }}
                    onClick={e => { e.stopPropagation(); setMenu(null); setSelected(isSel ? null : { kind: 'leaf', path: leaf.path }) }}
                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setSelected({ kind: 'leaf', path: leaf.path }); setMenu({ kind: 'leaf', clientX: e.clientX, clientY: e.clientY, path: leaf.path }) }}
                  />
                  {/* adjustable shelves inside this compartment */}
                  {leaf.adjYs.map((y, i) => (
                    <rect key={`adj-${key}-${i}`}
                      x={ox + leaf.box.x + ADJ_INSET} y={svgY(y + SHELF_T)}
                      width={Math.max(0, leaf.box.w - 2 * ADJ_INSET)} height={SHELF_T}
                      fill="#1e1b4b" stroke="#4338ca" strokeWidth={1}
                      strokeDasharray="4 2"
                      style={{ pointerEvents: 'none' }}
                    />
                  ))}
                  {/* size label */}
                  {leaf.box.w > 46 && leaf.box.h > 22 && (
                    <text
                      x={ox + leaf.box.x + leaf.box.w / 2}
                      y={svgY(leaf.box.y + (leaf.adjCount > 0 ? leaf.box.h - 12 : leaf.box.h / 2))}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize={11} fill={isSel ? '#93c5fd' : '#475569'}
                      fontFamily="system-ui,sans-serif"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >{Math.round(leaf.box.w)} × {Math.round(leaf.box.h)}</text>
                  )}
                </g>
              )
            })}

            {/* Separators — fixed shelves (h) and dividers (v) */}
            {seps.map(sep => {
              const isSel = selected?.kind === 'sep' && pathEq(selected.path, sep.path) && selected.index === sep.index
              const live  = dragLive && pathEq(dragLive.path, sep.path) && dragLive.index === sep.index
              const fill  = sep.axis === 'h'
                ? (isSel ? '#4a1d96' : '#2e1065')
                : (isSel ? '#1c1917' : '#111827')
              const stroke = sep.axis === 'h'
                ? (isSel ? '#c084fc' : '#7c3aed')
                : (isSel ? '#a8a29e' : '#4b5563')
              const key = `sep-${sep.path.join('.') || 'r'}-${sep.index}`
              return (
                <g key={key}
                  onClick={e => { e.stopPropagation(); if (wasDragging.current) { wasDragging.current = false; return }; setMenu(null); setSelected(isSel ? null : { kind: 'sep', path: sep.path, index: sep.index }) }}
                  onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setSelected({ kind: 'sep', path: sep.path, index: sep.index }); setMenu({ kind: 'sep', clientX: e.clientX, clientY: e.clientY, path: sep.path, index: sep.index, axis: sep.axis }) }}
                  style={{ cursor: sep.axis === 'h' ? 'ns-resize' : 'ew-resize' }}
                >
                  <rect
                    x={ox + sep.box.x} y={svgY(sep.box.y + sep.box.h)}
                    width={sep.box.w} height={sep.box.h}
                    fill={fill} stroke={stroke} strokeWidth={isSel || live ? 1.5 : 1}
                    onMouseDown={e => startDrag(e, sep)}
                  />
                  {sep.axis === 'h' && sep.box.w > 80 && (
                    <text x={ox + sep.box.x + sep.box.w / 2} y={svgY(sep.box.y + sep.box.h / 2)}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize={Math.min(13, sep.box.h * 0.72)} fill={isSel ? '#e9d5ff' : '#a78bfa'}
                      fontFamily="system-ui,sans-serif" style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >{sep.locked ? 'shelf ⚲' : 'shelf'}</text>
                  )}
                </g>
              )
            })}

            {/* Cabinet outline */}
            <rect x={ox} y={oy} width={cabDX} height={cabDY} fill="none" stroke="#6b7280" strokeWidth={1.5} />
          </svg>
        </div>

        {/* Controls panel */}
        <div className="flex-none w-48 border-l border-gray-800 overflow-y-auto p-3 flex flex-col gap-4 text-[10px]">

          {isEmpty && (
            <div className="text-gray-600 text-center py-6 space-y-1">
              <p className="text-gray-500">Empty interior</p>
              <p>Click the interior, then split it into shelves or columns.</p>
            </div>
          )}

          {/* Selected compartment */}
          {selLeaf && selLeafOpen && (
            <div>
              <p className="uppercase tracking-wider text-blue-400 mb-2">Compartment</p>
              <p className="text-gray-500 mb-2">{Math.round(selLeaf.box.w)} × {Math.round(selLeaf.box.h)} mm</p>
              <div className="flex flex-col gap-1">
                <button className={addBtn + ' text-left'} onClick={() => addShelf(selLeaf.path)}>Split into shelves</button>
                <button className={addBtn + ' text-left'} onClick={() => addDivider(selLeaf.path)}>Split into columns</button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-indigo-400">Adjustable shelves</span>
                <div className="ml-auto flex items-center gap-1">
                  <button className={addBtn} onClick={() => bumpAdj(selLeaf.path, -1)}>−</button>
                  <span className="w-4 text-center font-mono text-gray-300">{selLeafOpen.adj_shelves.length}</span>
                  <button className={addBtn} onClick={() => bumpAdj(selLeaf.path, +1)}>+</button>
                </div>
              </div>
            </div>
          )}

          {/* Selected separator */}
          {selSep && (
            <div>
              <p className={`uppercase tracking-wider mb-2 ${selSep.axis === 'h' ? 'text-violet-400' : 'text-gray-300'}`}>
                {selSep.axis === 'h' ? 'Fixed shelf' : 'Divider'}
              </p>
              <label className="block text-gray-500 mb-1">
                {selSep.axis === 'h' ? 'Bay height below (mm)' : 'Bay width left (mm)'}
              </label>
              <input
                type="number"
                key={`sepsize-${selSep.path.join('.')}-${selSep.index}-${selSep.locked}`}
                defaultValue={selSep.locked ? Math.round((selSep.axis === 'h' ? selSep.box.y : selSep.box.x) - selSep.childStart) : ''}
                placeholder={`≈${Math.round((selSep.axis === 'h' ? selSep.box.y : selSep.box.x) - selSep.childStart)}`}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                onBlur={e => commitSepSize(selSep.path, selSep.index, e.target.value.trim())}
                className={inp}
              />
              <div className="flex flex-col gap-1 mt-2">
                <button className={addBtn + ' text-left'} onClick={() => equaliseThis(selSep.path)}>= Equalise this split</button>
                <button className="px-2 py-0.5 rounded text-[10px] bg-red-900/40 hover:bg-red-900/60 text-red-300 text-left transition-colors"
                  onClick={() => removeSep(selSep.path, selSep.index)}>Delete (merge bays)</button>
              </div>
            </div>
          )}

          {!isEmpty && !selLeaf && !selSep && (
            <p className="text-gray-600">Click a compartment to split it, or a shelf/divider to resize or delete it.</p>
          )}

          {/* Legend */}
          {!isEmpty && (
            <div>
              <p className="uppercase tracking-wider text-gray-600 mb-1.5">Legend</p>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: '#2e1065', border: '1px solid #7c3aed' }} />
                  <span className="text-gray-500">Fixed shelf</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: '#1e1b4b', border: '1px dashed #4338ca' }} />
                  <span className="text-gray-500">Adj shelf</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: '#111827', border: '1px solid #4b5563' }} />
                  <span className="text-gray-500">Divider</span>
                </div>
              </div>
            </div>
          )}

          {/* Interior dims */}
          <div className="text-gray-700 space-y-0.5 mt-auto pt-2 border-t border-gray-800">
            <p>W {Math.round(intW)}mm (approx)</p>
            <p>H {Math.round(intH)}mm</p>
            <p className="text-[9px] text-gray-800">Type mm to lock a bay · clear to re-equalise</p>
          </div>
        </div>
      </div>

      {/* Context menu */}
      {menu && (
        <>
          <div className="fixed inset-0 z-[100]"
            onClick={() => setMenu(null)}
            onContextMenu={e => { e.preventDefault(); setMenu(null) }}
          />
          <div className="fixed z-[101] bg-gray-800 border border-gray-700 rounded shadow-xl py-1 min-w-[180px] text-[11px]"
            style={{ left: menu.clientX, top: menu.clientY }}
            onClick={e => e.stopPropagation()}
          >
            {menu.kind === 'leaf' ? (
              <>
                <button className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-300 transition-colors"
                  onClick={() => addShelf(menu.path)}>Split into shelves</button>
                <button className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-300 transition-colors"
                  onClick={() => addDivider(menu.path)}>Split into columns</button>
                <div className="border-t border-gray-700 mt-1 pt-1">
                  <button className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-300 transition-colors"
                    onClick={() => bumpAdj(menu.path, +1)}>+ Adjustable shelf</button>
                  <button className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-300 transition-colors"
                    onClick={() => bumpAdj(menu.path, -1)}>− Adjustable shelf</button>
                </div>
              </>
            ) : (
              <>
                <button className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-300 transition-colors"
                  onClick={() => equaliseThis(menu.path)}>= Equalise this split</button>
                <button className="w-full text-left px-3 py-1.5 hover:bg-red-900/40 text-red-400 transition-colors"
                  onClick={() => removeSep(menu.path, menu.index)}>Delete {menu.axis === 'h' ? 'shelf' : 'divider'} (merge bays)</button>
              </>
            )}
            <div className="border-t border-gray-700 mt-1 pt-1">
              <button className="w-full text-left px-3 py-1.5 hover:bg-red-900/40 text-red-400 transition-colors"
                onClick={resetAll}>Reset all internal parts</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
