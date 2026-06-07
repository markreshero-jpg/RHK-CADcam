'use client'

import { useState, useRef, useEffect } from 'react'
import type { CabinetInstance } from '@/src/lib/types'
import type {
  ResolvedCabinet, ResolvedInternalPart, Section, SplitSection, SectionChild,
  InternalFitting, InternalFittingType,
  AdjShelfFitting, FixedShelfFitting, InnerDrawerFitting, PullOutFitting, AccessoryFitting,
  DrawerType,
} from '@/src/lib/resolver/types'
import { EMPTY_SECTION } from '@/src/lib/resolver/types'
import { getUserPrefs } from '@/src/lib/userPrefs'
import { supabase } from '@/src/lib/supabase'

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

// Adjustable shelves within an open compartment (the only fitting this editor edits yet).
const adjOf = (fittings: InternalFitting[]): AdjShelfFitting[] =>
  fittings.filter((f): f is AdjShelfFitting => f.type === 'adj_shelf')

// Normalise a stored section tree to the current shape. Older saves stored an open
// compartment as { adj_shelves: [...] }; convert those to adj_shelf fittings so the
// editor (and the resolver, once re-saved) sees the new model.
function normalizeSection(raw: unknown): Section {
  const s = raw as Record<string, unknown> | null
  if (!s || typeof s !== 'object') return EMPTY_SECTION
  if (s.type === 'open') {
    if (Array.isArray(s.fittings)) return { type: 'open', fittings: s.fittings as InternalFitting[] }
    const legacy = Array.isArray(s.adj_shelves) ? (s.adj_shelves as Record<string, unknown>[]) : []
    return {
      type: 'open',
      fittings: legacy.map(a => ({
        type: 'adj_shelf', y_locked: !!a.y_locked,
        ...(typeof a.y_position === 'number' ? { y_position: a.y_position } : {}),
      })),
    }
  }
  if (s.type === 'hsplit' || s.type === 'vsplit') {
    const children = Array.isArray(s.children) ? (s.children as Record<string, unknown>[]) : []
    return {
      type: s.type,
      children: children.map(c => ({
        ...(typeof c.size === 'number' ? { size: c.size } : {}),
        ...(typeof c.equalise_group === 'string' && c.equalise_group ? { equalise_group: c.equalise_group } : {}),
        section: normalizeSection(c.section),
      })),
    }
  }
  return EMPTY_SECTION
}

interface SepDisplay {
  path:       Path
  index:      number          // separator sits after children[index]
  axis:       'h' | 'v'       // h = horizontal shelf, v = vertical divider
  box:        Box             // separator rect (y = bottom)
  childStart: number          // start coord of children[index] along the split axis
  splitEnd:   number          // far edge of the split box along the axis
  sepT:       number
  locked:     boolean         // children[index] has a fixed size OR is group-sized
  equalised:  boolean         // children[index] is in an equalise group (drag would break it)
}

interface LeafDisplay {
  path:       Path
  box:        Box
  adjShelves: { y: number; fittingIdx: number; yLocked: boolean }[]  // adj shelf bottom-face Y + index into section.fittings + lock state
  adjCount:   number
  fittings:   FittingDisplay[]                      // non-adj fittings placed in this compartment
  // Sub-compartments — vertical gaps inside this leaf not covered by any
  // horizontal element (adj shelf, fixed shelf, inner drawer, pull-out,
  // accessory). Always ≥1 entry: a leaf with no horizontal parts yields one
  // sub-compartment equal to the whole leaf. Each is drawn as its own clickable
  // rect so the user sees the "above shelf / below shelf" division visually,
  // mirroring the way structural hsplit produces top + bottom bays. Selection
  // still resolves to the parent leaf — sub-compartments have no data identity.
  subCompartments: { y: number; h: number }[]
}

// One non-adjustable fitting laid out inside an open compartment (preview only).
// The resolver is the source of truth; this stacking mirrors `emitBoxStack` and the
// fixed-shelf-fitting placement in `fittings.ts` so the editor preview matches.
interface FittingDisplay {
  type:    'inner_drawer' | 'pull_out' | 'fixed_shelf' | 'accessory'
  idx:     number    // index in section.fittings
  y:       number    // bottom Y in cabinet coords (= y_position when y_locked)
  h:       number    // rect height (box height for drawers — matches y_position axis)
  labelH:  number    // height shown in the size label (front DX for drawers; = h otherwise)
  yLocked: boolean   // mirrors f.y_locked — drives drag-blocking + cursor styling
}

// Default heights for fitting preview when the user hasn't set one explicitly.
const DEF_INNER_H    = 150
const DEF_PULL_OUT_H = 60
const DEF_ACC_H      = 80
const DEFAULT_STACK_GAP_DISP = 3   // mirrors DEFAULT_STACK_GAP in resolver/fittings.ts

// Friendly labels shown in the right panel + fitting list.
const FITTING_LABEL: Record<InternalFittingType, string> = {
  adj_shelf:    'Adjustable shelf',
  inner_drawer: 'Inner drawer',
  pull_out:     'Rollout shelf',
  fixed_shelf:  'Fixed shelf',
  accessory:    'Accessory',
}

// Single source of truth for "add a horizontal element to an opening", shared by
// the side panel and the right-click menu so they never drift apart. A FIXED
// SHELF is the one and only way to make a horizontal division — it splits the
// opening into structural bays, each independently lockable / equalisable.
// Everything else is a fitting placed inside the opening.
type AddKind = 'fixed_shelf' | 'adj_shelf' | 'pull_out' | 'inner_drawer' | 'accessory'
const ADD_ELEMENTS: { kind: AddKind; label: string; title: string }[] = [
  { kind: 'fixed_shelf',  label: 'Fixed shelf',      title: 'A fixed shelf — splits this opening into bays you can lock or equalise.' },
  { kind: 'adj_shelf',    label: 'Adjustable shelf', title: 'A movable shelf inside this opening.' },
  { kind: 'pull_out',     label: 'Rollout shelf',    title: 'A pull-out / rollout shelf on slides.' },
  { kind: 'inner_drawer', label: 'Inner drawer',     title: 'An inner drawer on slides.' },
  { kind: 'accessory',    label: 'Accessory',        title: 'An accessory (wine rack, etc.).' },
]

// Visual styling per fitting type for the SVG preview + legend.
const FITTING_STYLE: Record<FittingDisplay['type'], {
  title: string; fill: string; fillSel: string; stroke: string; label: string; dash?: string
}> = {
  inner_drawer: { title: 'Drawer',   fill: 'rgba(34,197,94,0.06)',  fillSel: 'rgba(59,130,246,0.16)', stroke: '#22c55e', label: '#22c55e', dash: '4 2' },
  pull_out:     { title: 'Rollout', fill: 'rgba(245,158,11,0.08)', fillSel: 'rgba(59,130,246,0.16)', stroke: '#f59e0b', label: '#f59e0b', dash: '4 2' },
  fixed_shelf:  { title: 'Shelf',    fill: '#2e1065',                fillSel: '#4a1d96',                stroke: '#7c3aed', label: '#a78bfa' },
  accessory:    { title: 'Accy',     fill: 'rgba(156,163,175,0.06)', fillSel: 'rgba(59,130,246,0.16)', stroke: '#9ca3af', label: '#9ca3af', dash: '4 2' },
}

// Pass-1 walker (editor-side mirror of resolveInternal.computeGroupSizes).
// Records each equalise group's per-split natural fair share; the group's
// resolved size is min(candidates) so it always fits.
function computeGroupSizes(root: Section, interior: Box): Map<string, number> {
  const candidates = new Map<string, number[]>()

  function walk(s: Section, box: Box) {
    if (s.type === 'open' || box.w <= 0 || box.h <= 0) return
    const horiz = s.type === 'hsplit'
    const sepT  = horiz ? SHELF_T : MAT_T
    const total = horiz ? box.h : box.w
    const kids  = s.children
    const N     = kids.length
    if (N === 0) return
    const avail        = total - (N - 1) * sepT
    const lockedSum    = kids.reduce((a, c) => a + (c.size ?? 0), 0)
    const unlockedCnt  = kids.filter(c => c.size === undefined).length
    const naturalFlex  = unlockedCnt > 0 ? (avail - lockedSum) / unlockedCnt : 0
    if (naturalFlex > 0) {
      for (const c of kids) {
        if (c.size === undefined && c.equalise_group) {
          const arr = candidates.get(c.equalise_group) ?? []
          arr.push(naturalFlex)
          candidates.set(c.equalise_group, arr)
        }
      }
    }
    let cursor = horiz ? box.y : box.x
    kids.forEach(c => {
      const size = c.size ?? Math.max(0, naturalFlex)
      const childBox: Box = horiz
        ? { x: box.x, y: cursor, w: box.w, h: size }
        : { x: cursor, y: box.y, w: size, h: box.h }
      walk(c.section, childBox)
      cursor += size + sepT
    })
  }

  walk(root, interior)

  const out = new Map<string, number>()
  for (const [g, arr] of candidates) {
    if (arr.length === 0) continue
    out.set(g, Math.min(...arr))
  }
  return out
}

// Compute the open sub-compartments of a leaf: the leaf's vertical extent minus
// every horizontal-element y-span. Returns sorted bottom→top. Always returns at
// least one entry — an empty leaf yields one sub-compartment equal to the whole
// leaf — so the renderer can iterate uniformly.
function computeSubCompartments(leaf: Box, spans: { y: number; h: number }[]): { y: number; h: number }[] {
  if (spans.length === 0) return [{ y: leaf.y, h: leaf.h }]
  const sorted = [...spans].sort((a, b) => a.y - b.y)
  const out: { y: number; h: number }[] = []
  let cursor = leaf.y
  const leafTop = leaf.y + leaf.h
  for (const s of sorted) {
    const sStart = Math.max(leaf.y, s.y)
    const sEnd   = Math.min(leafTop, s.y + s.h)
    if (sEnd <= cursor) continue          // already past it (overlap / out of leaf)
    if (sStart > cursor + 0.5) out.push({ y: cursor, h: sStart - cursor })
    cursor = Math.max(cursor, sEnd)
  }
  if (leafTop > cursor + 0.5) out.push({ y: cursor, h: leafTop - cursor })
  // If every span covers the leaf (degenerate), still yield a zero-area entry so
  // callers can rely on length ≥ 1.
  if (out.length === 0) out.push({ y: leaf.y, h: 0 })
  return out
}

// Read the resolver's actual box (y, h) plus a label height for inner_drawer /
// pull_out fittings in a given compartment. The resolver tags every emitted
// drawer/pull-out part with a per-compartment `inner_drawer_index` (0..N within
// one emitBoxStack call) so within a single leaf the indices uniquely identify
// a drawer.
//
// We deliberately use the SIDE part for rect geometry, not the FRONT:
//   • side.Y      = box bottom Y = the fitting's stored `y_position`
//   • side.DY     = box height
// matching the stored `y_position` keeps drag smooth — the live drag patches
// y_position and the rect re-reads from the same axis, so there's no offset
// from the front-face top/bottom adjusts (which would otherwise jump the rect
// by IDB_FRONT_BOTTOM_ADJUST on every commit).
//
// labelH is the inner-drawer FRONT height (DX), so the size label shows the
// real visible face dimension the user asked for. For pull-outs (no front)
// labelH == box height.
interface ResolvedFitSummary { y: number; h: number; labelH: number }
function summariseResolvedInLeaf(
  parts: ResolvedInternalPart[] | undefined,
  leaf:  Box,
): { inner_drawer: ResolvedFitSummary[]; pull_out: ResolvedFitSummary[] } {
  const empty = { inner_drawer: [], pull_out: [] }
  if (!parts || parts.length === 0) return empty

  // Per-index bookkeeping. SIDE is preferred for box geometry because side.Y =
  // boxY = the fitting's stored y_position (no offset), but SYSTEM drawers only
  // emit back/bottom/front (no sides), so we also collect FRONT and use it as
  // a fallback. front.Y is offset from boxY by IDB_FRONT_BOTTOM_ADJUST — for
  // typical setups that's 0, so the visual is exact; for non-zero adjusts the
  // rect renders slightly low (cosmetic only, drag still works because the
  // y_locked override in computeLayout uses the live y_position).
  const idSides:  Map<number, { y: number; h: number }> = new Map()
  const idFronts: Map<number, { y: number; h: number }> = new Map()
  const poSides:  Map<number, { y: number; h: number }> = new Map()

  // A part is "in the leaf" if its bounding box overlaps the leaf rect. We use
  // overlap (not corner-inside) because the inner-drawer FRONT extends past the
  // box by IDB_FRONT_BOTTOM_ADJUST / IDB_FRONT_TOP_ADJUST / IDB_FRONT_WIDTH_ADJUST;
  // for any non-zero bottom-adjust the front's Y sits below the leaf's bottom
  // edge, so a corner-inside test misses it and we fall back to using the box
  // height for the label.
  //
  // Per-type dimension axes (resolver/fittings.ts conventions):
  //   • side          → width = DZ, height = DY
  //   • front / back  → width = DY, height = DX
  //   • bottom        → width = DY, height = DZ (thin horizontal panel)
  const inLeaf = (p: ResolvedInternalPart) => {
    let bw: number, bh: number
    if (p.part_type === 'inner_drawer_side' || p.part_type === 'pull_out_side') {
      bw = p.DZ; bh = p.DY
    } else if (p.part_type === 'inner_drawer_bottom' || p.part_type === 'pull_out_bottom') {
      bw = p.DY; bh = p.DZ
    } else {
      // inner_drawer_front / inner_drawer_back / pull_out_back / accessory
      bw = p.DY; bh = p.DX
    }
    return p.X     <  leaf.x + leaf.w + 1
        && p.X + bw >  leaf.x - 1
        && p.Y     <  leaf.y + leaf.h + 1
        && p.Y + bh >  leaf.y - 1
  }

  for (const p of parts) {
    if (p.inner_drawer_index === undefined) continue
    if (!inLeaf(p)) continue
    if (p.part_type === 'inner_drawer_side') {
      // side convention: Y=bottom, DY=height
      if (!idSides.has(p.inner_drawer_index)) idSides.set(p.inner_drawer_index, { y: p.Y, h: p.DY })
    }
    else if (p.part_type === 'inner_drawer_front') {
      // face convention: Y=bottom, DX=height (incl. IDB_FRONT_TOP/BOTTOM_ADJUST)
      idFronts.set(p.inner_drawer_index, { y: p.Y, h: p.DX })
    }
    else if (p.part_type === 'pull_out_side') {
      if (!poSides.has(p.inner_drawer_index)) poSides.set(p.inner_drawer_index, { y: p.Y, h: p.DY })
    }
  }

  // Union of side + front keys — system drawers populate only front, five-piece
  // populates both. For each index, derive (y, h) from side when available,
  // else from front; labelH always prefers front (the visible face).
  const innerKeys = [...new Set([...idSides.keys(), ...idFronts.keys()])].sort((a, b) => a - b)
  const poKeys    = [...poSides.keys()].sort((a, b) => a - b)
  return {
    inner_drawer: innerKeys.map(k => {
      const s  = idSides.get(k)
      const f  = idFronts.get(k)
      const y  = s?.y ?? f?.y ?? 0
      const h  = s?.h ?? f?.h ?? 0
      const lh = f?.h ?? s?.h ?? h
      return { y, h, labelH: lh }
    }),
    pull_out: poKeys.map(k => {
      const s = poSides.get(k)!
      return { y: s.y, h: s.h, labelH: s.h }
    }),
  }
}

function computeLayout(
  root:     Section,
  interior: Box,
  resolved: ResolvedInternalPart[] | undefined,
  stackGap: number,
): { seps: SepDisplay[]; leaves: LeafDisplay[]; groupSizes: Map<string, number> } {
  const seps:   SepDisplay[]  = []
  const leaves: LeafDisplay[] = []
  const groupSizes = computeGroupSizes(root, interior)

  function walk(section: Section, box: Box, path: Path) {
    if (box.w <= 0 || box.h <= 0) return

    if (section.type === 'open') {
      // 1. Adj shelves — equalised across the full compartment height (preserved).
      //    Track each shelf's original index in section.fittings so the editor
      //    can address them individually for selection / drag.
      const adjEntries: { f: AdjShelfFitting; origIdx: number }[] = []
      section.fittings.forEach((f, i) => {
        if (f.type === 'adj_shelf') adjEntries.push({ f, origIdx: i })
      })
      const n = adjEntries.length
      const adjShelves: { y: number; fittingIdx: number; yLocked: boolean }[] = []
      if (n > 0) {
        const openH = (box.h - n * SHELF_T) / (n + 1)
        if (openH > 0) adjEntries.forEach((e, i) => {
          const y = (e.f.y_locked && e.f.y_position !== undefined)
            ? e.f.y_position
            : box.y + (i + 1) * openH + i * SHELF_T
          adjShelves.push({ y, fittingIdx: e.origIdx, yLocked: !!e.f.y_locked })
        })
      }

      // 2. Non-adj fittings — drawers/pull-outs/accessories stack from box.y;
      //    fixed shelves sit at y_position or compartment mid-height.
      //
      //    For inner_drawer / pull_out, the resolver's actual (y, height) is the
      //    source of truth — `f.height` is often empty (means "inherit from the
      //    picked slide's box_height"), and the inner_drawer FACE is taller than
      //    the box (boxHeight + IDB_FRONT_TOP/BOTTOM_ADJUST). We mirror that here
      //    by reading the resolved parts so the preview matches what's built.
      //    Fall back to the placeholder default before the first resolve.
      const resolvedHere = summariseResolvedInLeaf(resolved, box)
      let nextInnerIdx = 0
      let nextPullOutIdx = 0
      const fittings: FittingDisplay[] = []
      let cursor = box.y
      section.fittings.forEach((f, idx) => {
        if (f.type === 'inner_drawer' || f.type === 'pull_out' || f.type === 'accessory') {
          const defH = f.type === 'inner_drawer' ? DEF_INNER_H : f.type === 'pull_out' ? DEF_PULL_OUT_H : DEF_ACC_H
          // Prefer the resolver's actual (h, labelH) when available so the rect
          // matches what's actually built (slide-driven height + adjusts). For Y
          // the live-patched `y_locked + y_position` wins: during drag the
          // editor patches y_position immediately, but the resolved geometry is
          // stale until the next save+resolve cycle. Without this override the
          // rect would snap back to the old resolved Y each frame and the drag
          // would look jumpy.
          let y: number
          let h: number
          let labelH: number
          if (f.type === 'inner_drawer' && resolvedHere.inner_drawer[nextInnerIdx]) {
            const r = resolvedHere.inner_drawer[nextInnerIdx++]
            y = (f.y_locked && f.y_position !== undefined) ? f.y_position : r.y
            h = r.h
            labelH = r.labelH
          } else if (f.type === 'pull_out' && resolvedHere.pull_out[nextPullOutIdx]) {
            const r = resolvedHere.pull_out[nextPullOutIdx++]
            y = (f.y_locked && f.y_position !== undefined) ? f.y_position : r.y
            h = r.h
            labelH = r.labelH
          } else {
            h = f.height ?? defH
            y = (f.y_locked && f.y_position !== undefined) ? f.y_position : cursor
            labelH = h
          }
          fittings.push({ type: f.type, idx, y, h, labelH, yLocked: !!f.y_locked })
          cursor = Math.max(cursor, y + h + stackGap)
        } else if (f.type === 'fixed_shelf') {
          // Fixed-shelf fittings share the same cursor as drawer-like items so
          // the stack gap applies between every adjacent horizontal pair
          // (shelf-drawer, drawer-shelf, …). The historical "lone shelf at
          // mid-height" default is preserved when the compartment holds only
          // one non-adj fitting — same special-case as positionFittings in
          // resolver/fittings.ts.
          const stackableCount = section.fittings.filter(g => g.type !== 'adj_shelf').length
          const loneUnlockedShelf = stackableCount === 1 && !f.y_locked
          const y = (f.y_locked && f.y_position !== undefined)
            ? f.y_position
            : (loneUnlockedShelf ? box.y + box.h / 2 - SHELF_T / 2 : cursor)
          fittings.push({ type: 'fixed_shelf', idx, y, h: SHELF_T, labelH: SHELF_T, yLocked: !!f.y_locked })
          cursor = Math.max(cursor, y + SHELF_T + stackGap)
        }
      })

      // 3. Sub-compartments — the openings created by DIVIDERS only. A shelf
      //    (fixed or adjustable) genuinely splits the opening into a usable space
      //    above and below, so those read as separate openings you can click and
      //    fill. Drawers, rollouts and accessories are OCCUPANTS — they sit in
      //    the opening without carving it, so they don't create sub-compartments
      //    (you just stack another one). The parent opening's Lock / Equalise
      //    stays reachable from the sub-compartment panel.
      const spans: { y: number; h: number }[] = [
        ...fittings.filter(f => f.type === 'fixed_shelf').map(f => ({ y: f.y, h: f.h })),
        ...adjShelves.map(a => ({ y: a.y, h: SHELF_T })),
      ]
      const subCompartments = computeSubCompartments(box, spans)

      leaves.push({ path, box, adjShelves, adjCount: n, fittings, subCompartments })
      return
    }

    const horiz = section.type === 'hsplit'
    const sepT  = horiz ? SHELF_T : MAT_T
    const total = horiz ? box.h : box.w
    const kids  = section.children
    const N     = kids.length
    if (N === 0) return

    // Classify: locked (size set), grouped (resolved group size), or free flex.
    const childResolved: (number | null)[] = kids.map(c => {
      if (c.size !== undefined) return c.size
      if (c.equalise_group) {
        const gs = groupSizes.get(c.equalise_group)
        if (gs !== undefined && gs > 0) return gs
      }
      return null
    })
    const avail        = total - (N - 1) * sepT
    const fixedSum     = childResolved.reduce<number>((a, s) => a + (s ?? 0), 0)
    const flexCount    = childResolved.filter(s => s === null).length
    const flexSize     = flexCount > 0 ? (avail - fixedSum) / flexCount : 0
    const splitEnd     = horiz ? box.y + box.h : box.x + box.w

    let cursor = horiz ? box.y : box.x
    kids.forEach((c, i) => {
      const size = childResolved[i] ?? Math.max(0, flexSize)
      const childBox: Box = horiz
        ? { x: box.x, y: cursor, w: box.w, h: size }
        : { x: cursor, y: box.y, w: size, h: box.h }

      walk(c.section, childBox, [...path, i])

      if (i < N - 1) {
        seps.push({
          path, index: i, axis: horiz ? 'h' : 'v',
          box: horiz ? { x: box.x, y: cursor + size, w: box.w, h: sepT }
                     : { x: cursor + size, y: box.y, w: sepT, h: box.h },
          childStart: cursor, splitEnd, sepT,
          locked: childResolved[i] !== null, equalised: !!c.equalise_group,
        })
      }
      cursor += size + (i < N - 1 ? sepT : 0)
    })
  }

  walk(root, interior, [])
  return { seps, leaves, groupSizes }
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

const newOpen = (): SectionChild => ({ section: { type: 'open', fittings: [] } })

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
    // Preserve any existing contents: they move into the first bay and a new
    // empty bay is added after. Splitting an empty opening just makes two empty
    // bays. This stops a split from wiping drawers/shelves already placed here.
    if (s.fittings.length > 0) return { type, children: [{ section: s }, newOpen()] }
    return { type, children: [newOpen(), newOpen()] }
  })
}

function setAdjCount(root: Section, path: Path, n: number): Section {
  return updateAtPath(root, path, s => {
    if (s.type !== 'open') return s
    const existing = adjOf(s.fittings)
    const others   = s.fittings.filter(f => f.type !== 'adj_shelf')
    const adj: AdjShelfFitting[] = []
    for (let i = 0; i < n; i++) adj.push(existing[i] ?? { type: 'adj_shelf', y_locked: false })
    return { type: 'open', fittings: [...adj, ...others] }
  })
}

// ── Fitting mutations (compartment contents) ─────────────────────────────────

function addFitting(root: Section, path: Path, fitting: InternalFitting): Section {
  return updateAtPath(root, path, s => s.type === 'open' ? { ...s, fittings: [...s.fittings, fitting] } : s)
}

function removeFittingAt(root: Section, path: Path, idx: number): Section {
  return updateAtPath(root, path, s => s.type === 'open'
    ? { ...s, fittings: s.fittings.filter((_, i) => i !== idx) } : s)
}

function moveFitting(root: Section, path: Path, idx: number, delta: -1 | 1): Section {
  return updateAtPath(root, path, s => {
    if (s.type !== 'open') return s
    const j = idx + delta
    if (j < 0 || j >= s.fittings.length) return s
    const next = [...s.fittings]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    return { ...s, fittings: next }
  })
}

function patchFitting(root: Section, path: Path, idx: number, patch: Partial<InternalFitting>): Section {
  return updateAtPath(root, path, s => {
    if (s.type !== 'open') return s
    const cur = s.fittings[idx]
    if (!cur) return s
    // Merging across discriminated-union members — discriminator stays from cur.
    const merged = { ...cur, ...patch } as InternalFitting
    return { ...s, fittings: s.fittings.map((f, i) => i === idx ? merged : f) }
  })
}

// Constructors for newly-added fittings.
function newFitting(type: InternalFittingType): InternalFitting {
  switch (type) {
    case 'adj_shelf':    return { type: 'adj_shelf',    y_locked: false }
    case 'fixed_shelf':  return { type: 'fixed_shelf',  y_locked: false }
    case 'inner_drawer': return { type: 'inner_drawer', y_locked: false }
    case 'pull_out':     return { type: 'pull_out',     y_locked: false }
    case 'accessory':    return { type: 'accessory',    y_locked: false }
  }
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

// ── Equalise-group helpers ───────────────────────────────────────────────────
// Group membership lives on a leaf's parent SectionChild (the slot, not the
// section content). The root leaf (path = []) has no parent slot so it can't
// be tagged.

function getLeafChild(root: Section, path: Path): SectionChild | null {
  if (path.length === 0) return null
  const parentPath = path.slice(0, -1)
  const idx        = path[path.length - 1]
  const parent     = getSection(root, parentPath)
  if (!parent || parent.type === 'open') return null
  return parent.children[idx] ?? null
}

function getParentSplitAxis(root: Section, path: Path): 'h' | 'v' | null {
  if (path.length === 0) return null
  const parent = getSection(root, path.slice(0, -1))
  if (!parent || parent.type === 'open') return null
  return parent.type === 'hsplit' ? 'h' : 'v'
}

function setLeafEqualiseGroup(root: Section, path: Path, group: string | undefined): Section {
  if (path.length === 0) return root
  const parentPath = path.slice(0, -1)
  const idx        = path[path.length - 1]
  return updateAtPath(root, parentPath, s => {
    if (s.type === 'open') return s
    const children = s.children.map((c, i) => {
      if (i !== idx) return c
      if (group === undefined) {
        // Untag — preserve size if present.
        const { equalise_group: _g, ...rest } = c
        return rest
      }
      // Tagging clears any locked size so the group rule controls extent.
      const { size: _s, ...rest } = c
      return { ...rest, equalise_group: group }
    })
    return { ...s, children }
  })
}

// Walk the tree and collect every group id in use, with its member count.
function collectGroups(root: Section): Map<string, { count: number }> {
  const out = new Map<string, { count: number }>()
  function walk(s: Section) {
    if (s.type === 'open') return
    for (const c of s.children) {
      if (c.equalise_group) {
        const cur = out.get(c.equalise_group) ?? { count: 0 }
        cur.count++
        out.set(c.equalise_group, cur)
      }
      walk(c.section)
    }
  }
  walk(root)
  return out
}

function nextGroupId(existing: Set<string>): string {
  for (let i = 0; i < 26; i++) {
    const id = String.fromCharCode(65 + i)   // A..Z
    if (!existing.has(id)) return id
  }
  let n = 1
  while (existing.has(`G${n}`)) n++
  return `G${n}`
}

// Colour palette indexed by group id (deterministic by char code) so a given
// group keeps its colour across renders.
const GROUP_COLORS = ['#14b8a6', '#ec4899', '#f59e0b', '#84cc16', '#a855f7', '#06b6d4', '#fb7185', '#eab308']
function groupColor(id: string): string {
  const c = id.charCodeAt(0) || 0
  return GROUP_COLORS[c % GROUP_COLORS.length]
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
  | { kind: 'leaf';    path: Path }
  | { kind: 'subcomp'; path: Path; subIdx: number }   // a vertical band inside an open leaf
  | { kind: 'sep';     path: Path; index: number }
  | { kind: 'fitting'; path: Path; fittingIndex: number }
  | null

type Menu =
  | { kind: 'leaf';    clientX: number; clientY: number; path: Path }
  | { kind: 'subcomp'; clientX: number; clientY: number; path: Path; subIdx: number }
  | { kind: 'sep';     clientX: number; clientY: number; path: Path; index: number; axis: 'h' | 'v' }
  | null

type DragLive = { path: Path; index: number; size: number } | null

// Live drag of a fitting (drawer/pull-out/fixed-shelf/accessory) within its
// compartment — preview position before commit. Commit sets y_locked=true and
// y_position to the dropped Y on the underlying fitting.
type FittingDragLive = { path: Path; fittingIndex: number; y: number } | null

// ── Inspector sub-rows ─────────────────────────────────────────────────────────
// Shared height + Y controls for inner_drawer / pull_out / accessory inspectors.

function InnerHeightYRow({
  inp, height, yLocked, yPosition, onPatch,
}: {
  inp:        string
  height?:    number
  yLocked?:   boolean
  yPosition?: number
  onPatch:    (p: Partial<InternalFitting>) => void
}) {
  return (
    <>
      <label className="block">
        <span className="block text-gray-500 mb-1">Height (mm) — empty = use slide box-height</span>
        <input type="number"
          key={`h-${height ?? ''}`}
          defaultValue={height ?? ''}
          onBlur={e => {
            const v = e.target.value.trim()
            const n = v === '' ? undefined : Number(v)
            onPatch({ height: Number.isFinite(n) ? (n as number) : undefined } as Partial<InternalFitting>)
          }}
          className={inp}
        />
      </label>
      <YLockRow inp={inp} yLocked={yLocked} yPosition={yPosition} onPatch={onPatch} />
    </>
  )
}

function YLockRow({
  inp, yLocked, yPosition, onPatch,
}: {
  inp:        string
  yLocked?:   boolean
  yPosition?: number
  onPatch:    (p: Partial<InternalFitting>) => void
}) {
  return (
    <label className="block">
      <span className="block text-gray-500 mb-1">Lock Y (mm) — empty = auto stack/mid</span>
      <div className="flex items-center gap-1">
        <input type="checkbox"
          checked={!!yLocked}
          onChange={e => onPatch({ y_locked: e.target.checked } as Partial<InternalFitting>)}
          className="accent-blue-500 w-3.5 h-3.5"
        />
        <input type="number"
          key={`y-${yPosition ?? ''}-${yLocked ? 1 : 0}`}
          defaultValue={yPosition ?? ''}
          disabled={!yLocked}
          onBlur={e => {
            const v = e.target.value.trim()
            const n = v === '' ? undefined : Number(v)
            onPatch({ y_position: Number.isFinite(n) ? (n as number) : undefined } as Partial<InternalFitting>)
          }}
          className={inp + ' flex-1'}
        />
      </div>
    </label>
  )
}

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
    normalizeSection((cabinet.internal_grid as { tree?: unknown } | null)?.tree)
  )
  // Per-cabinet vertical gap between stacked fittings (mm). Stored as a sibling
  // of `tree` in internal_grid; mirrored on the resolver side via
  // CabinetInput.internal_stack_gap so the editor preview and the resolved
  // geometry stay in sync.
  const [stackGap, setStackGap] = useState<number>(() => {
    const g = (cabinet.internal_grid as { stack_gap?: unknown } | null)?.stack_gap
    return typeof g === 'number' && g >= 0 ? g : DEFAULT_STACK_GAP_DISP
  })
  const [selected, setSelected] = useState<Selection>(null)
  const [menu, setMenu]         = useState<Menu>(null)
  const [dragLive, setDragLive] = useState<DragLive>(null)
  const [fittingDragLive, setFittingDragLive] = useState<FittingDragLive>(null)

  // Picker data for the inner-drawer/pull-out inspectors — lazy-loaded once.
  // `kind` is a newer column on drawer_box_methods; read defensively so the editor
  // keeps working before the ALTER. When unavailable, every method is treated as
  // 'external' (= filtered OUT of the inner picker) — set kind via SQL or the
  // drawer-boxes library to tag methods as 'internal'.
  type DbMethodRow    = { id: string; name: string; drawer_type: DrawerType | null; kind?: 'external' | 'internal' | null }
  type SlideProdRow   = { id: string; name: string; nominal_length: number | null; box_height: number | null; runner_thickness: number | null }
  const [dbMethods,    setDbMethods]    = useState<DbMethodRow[]>([])
  const [slideProds,   setSlideProds]   = useState<SlideProdRow[]>([])
  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('drawer_box_methods').select('id,name,drawer_type,kind').eq('active', true).order('name'),
      supabase.from('hardware_slides').select('id,name,nominal_length,box_height,runner_thickness').eq('active', true).order('nominal_length', { ascending: true }),
    ]).then(async ([m, s]) => {
      if (!alive) return
      // Fall back to the legacy (no-kind) select if `kind` doesn't exist yet.
      let methodsRows = (m.data ?? []) as DbMethodRow[]
      if (m.error) {
        const r = await supabase.from('drawer_box_methods').select('id,name,drawer_type').eq('active', true).order('name')
        methodsRows = (r.data ?? []) as DbMethodRow[]
      }
      setDbMethods(methodsRows)
      setSlideProds((s.data ?? []) as SlideProdRow[])
    })
    return () => { alive = false }
  }, [])
  const innerMethods = dbMethods.filter(m => m.kind === 'internal')

  const dragRef = useRef<{
    path: Path; index: number; axis: 'h' | 'v'
    startCabX: number; startCabY: number
    startBoundary: number; childStart: number; min: number; max: number
    moved: boolean; lastSize: number
  } | null>(null)
  const fittingDragRef = useRef<{
    path: Path; fittingIndex: number
    startCabY: number; startY: number
    fittingH: number; minY: number; maxY: number
    moved: boolean; lastY: number
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
      const p = cabPoint(e)
      if (!p) return
      const dr = dragRef.current
      if (dr) {
        if (!dr.moved && (Math.abs(p.x - dr.startCabX) > 1 || Math.abs(p.y - dr.startCabY) > 1)) dr.moved = true
        if (dr.moved) {
          const delta    = dr.axis === 'v' ? p.x - dr.startCabX : p.y - dr.startCabY
          const boundary = Math.max(dr.min, Math.min(dr.max, dr.startBoundary + delta))
          const size     = Math.round(boundary - dr.childStart)
          dr.lastSize = size
          setDragLive({ path: dr.path, index: dr.index, size })
        }
      }
      const fr = fittingDragRef.current
      if (fr) {
        if (!fr.moved && Math.abs(p.y - fr.startCabY) > 1) fr.moved = true
        if (fr.moved) {
          const rawY = fr.startY + (p.y - fr.startCabY)
          const y    = Math.round(Math.max(fr.minY, Math.min(fr.maxY, rawY)))
          fr.lastY = y
          setFittingDragLive({ path: fr.path, fittingIndex: fr.fittingIndex, y })
        }
      }
    }
    function onUp() {
      const dr = dragRef.current
      dragRef.current = null
      setDragLive(null)
      const fr = fittingDragRef.current
      fittingDragRef.current = null
      setFittingDragLive(null)
      const data = dragDataRef.current!
      if (dr && dr.moved) {
        wasDragging.current = true
        data.save(setChildSize(data.tree, dr.path, dr.index, dr.lastSize))
      }
      if (fr && fr.moved) {
        wasDragging.current = true
        data.save(patchFitting(data.tree, fr.path, fr.fittingIndex,
          { y_locked: true, y_position: fr.lastY } as Partial<InternalFitting>))
      }
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
    await onUpdate(cabinet.id, { internal_grid: { tree: next, stack_gap: stackGap } as unknown as Record<string, unknown> })
  }

  // Persist a new stack gap. Same write shape as `save` so the JSONB blob keeps
  // both fields. Default (3mm) is stored explicitly so the resolver default and
  // the user's value are interchangeable; an empty input falls back to default.
  async function saveStackGap(next: number) {
    setStackGap(next)
    await onUpdate(cabinet.id, { internal_grid: { tree, stack_gap: next } as unknown as Record<string, unknown> })
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
  // Interior X bounds — prefer the resolved gable inner faces so scribes (which
  // shift/narrow the opening) are reflected; fall back to the flat approximation.
  const lsPanel = rp?.case_parts.find(p => p.part_key === 'left_side')
  const rsPanel = rp?.case_parts.find(p => p.part_key === 'right_side')
  const intX0 = lsPanel ? lsPanel.X + lsPanel.DZ : T
  const intW  = lsPanel && rsPanel ? Math.max(0, rsPanel.X - (lsPanel.X + lsPanel.DZ)) : cabDX - 2 * T
  const tkH   = toeH

  const interior: Box = { x: intX0, y: intY0, w: intW, h: intH }
  let layoutTree = tree
  if (dragLive) layoutTree = setChildSize(layoutTree, dragLive.path, dragLive.index, dragLive.size)
  if (fittingDragLive) layoutTree = patchFitting(layoutTree, fittingDragLive.path, fittingDragLive.fittingIndex,
    { y_locked: true, y_position: fittingDragLive.y } as Partial<InternalFitting>)
  const { seps, leaves } = computeLayout(layoutTree, interior, rp?.internal_parts, stackGap)

  dragDataRef.current = { svg: svgRef.current, ox, oy, cabDY, save, tree }

  // Arrow-key nudge: when a fitting is selected, ↑/↓ shifts its Y by 1mm
  // (Shift = 10mm). First nudge locks the fitting (y_locked=true). Skipped
  // when typing into a form control. Clamped to the compartment.
  useEffect(() => {
    if (selected?.kind !== 'fitting') return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (selected?.kind !== 'fitting') return
      const s = getSection(tree, selected.path)
      if (s?.type !== 'open') return
      const f = s.fittings[selected.fittingIndex]
      if (!f || f.type === 'adj_shelf') return
      // Arrow-key nudge is also a "move" — block it on y_locked fittings for
      // the same reason as drag (otherwise the lock has no effect).
      if (f.y_locked) return
      const leaf = leaves.find(l => pathEq(l.path, selected.path))
      const disp = leaf?.fittings.find(d => d.idx === selected.fittingIndex)
      if (!leaf || !disp) return
      e.preventDefault()
      const step  = e.shiftKey ? 10 : 1
      const delta = e.key === 'ArrowUp' ? step : -step
      const minY  = leaf.box.y
      const maxY  = leaf.box.y + leaf.box.h - disp.h
      const newY  = Math.round(Math.max(minY, Math.min(maxY, disp.y + delta)))
      if (newY === disp.y && f.y_locked) return
      save(patchFitting(tree, selected.path, selected.fittingIndex,
        { y_locked: true, y_position: newY } as Partial<InternalFitting>))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, tree, leaves])

  // ── Selection resolution ─────────────────────────────────────────────────────
  const selLeaf = selected?.kind === 'leaf'
    ? leaves.find(l => pathEq(l.path, selected.path)) ?? null
    : null
  const selSep = selected?.kind === 'sep'
    ? seps.find(s => pathEq(s.path, selected.path) && s.index === selected.index) ?? null
    : null
  const selLeafSection = selLeaf ? getSection(tree, selLeaf.path) : null
  const selLeafOpen = selLeafSection?.type === 'open' ? selLeafSection : null

  // Target leaf for toolbar actions: the selected leaf or sub-comp, else the
  // root if it's open. A sub-comp selection still targets its parent leaf for
  // mutations (sub-comps have no data identity); the band itself is carried
  // separately in `selSub` so positional actions can clamp into the band.
  const targetPath: Path | null =
    selected?.kind === 'leaf'     ? selected.path
    : selected?.kind === 'subcomp' ? selected.path
    : (tree.type === 'open' ? [] : null)

  // Selected sub-compartment band (a vertical region inside an open leaf).
  // Used by "Split → shelves" + "+ Add fitting" to lock the new fitting's Y
  // into the clicked band, instead of stacking from the leaf bottom.
  const selSub: { leaf: LeafDisplay; sub: { y: number; h: number } } | null =
    selected?.kind === 'subcomp'
      ? (() => {
          const leaf = leaves.find(l => pathEq(l.path, selected.path))
          const sub  = leaf?.subCompartments[selected.subIdx]
          return leaf && sub ? { leaf, sub } : null
        })()
      : null

  // Selected fitting (a placed component inside an open compartment).
  const selFittingPath  = selected?.kind === 'fitting' ? selected.path : null
  const selFittingIndex = selected?.kind === 'fitting' ? selected.fittingIndex : -1
  const selFittingSection = selFittingPath ? getSection(tree, selFittingPath) : null
  const selFittingData: InternalFitting | null =
    selFittingSection?.type === 'open' && selFittingIndex >= 0
      ? (selFittingSection.fittings[selFittingIndex] ?? null) : null
  const selFittingLeaf = selFittingPath ? (leaves.find(l => pathEq(l.path, selFittingPath)) ?? null) : null
  const selFittingDisplay: { y: number; h: number; labelH: number } | null = (() => {
    if (!selFittingLeaf) return null
    const inFittings = selFittingLeaf.fittings.find(f => f.idx === selFittingIndex)
    if (inFittings) return inFittings
    const inAdj = selFittingLeaf.adjShelves.find(a => a.fittingIdx === selFittingIndex)
    if (inAdj) return { y: inAdj.y, h: SHELF_T, labelH: SHELF_T }
    return null
  })()

  // ── Mutations ────────────────────────────────────────────────────────────────
  function addShelf(path: Path | null)   { if (path) { save(addSeparator(tree, path, 'hsplit')); setMenu(null) } }
  function addDivider(path: Path | null) { if (path) { save(addSeparator(tree, path, 'vsplit')); setMenu(null) } }
  function bumpAdj(path: Path | null, delta: number) {
    if (!path) return
    const s = getSection(tree, path)
    if (s?.type !== 'open') return
    save(setAdjCount(tree, path, Math.max(0, adjOf(s.fittings).length + delta)))
    setMenu(null)
  }
  function removeSep(path: Path, index: number) {
    setSelected(null); setMenu(null)
    save(deleteSep(tree, path, index))
  }
  function equaliseThis(path: Path) { save(equaliseSplit(tree, path)); setMenu(null) }
  function resetAll() { setSelected(null); setMenu(null); save(EMPTY_SECTION) }

  // Bounding fittings of a sub-compartment band — the fitting whose y matches
  // the band's top edge ("topBound"), and the fitting whose y+h matches the
  // band's bottom edge ("botBound"). Either can be missing when the band
  // borders the leaf top/bottom directly. Returns indices into section.fittings
  // so callers can patch the fitting itself.
  type SubBound = { idx: number; y: number; h: number }
  function findSubBounds(leaf: LeafDisplay, sub: { y: number; h: number }): { topBound: SubBound | null; botBound: SubBound | null } {
    const TOL = 0.5
    const topEdge = sub.y + sub.h
    const botEdge = sub.y
    const all: SubBound[] = [
      ...leaf.fittings.map(f => ({ idx: f.idx, y: f.y, h: f.h })),
      ...leaf.adjShelves.map(a => ({ idx: a.fittingIdx, y: a.y, h: SHELF_T })),
    ]
    const topBound = all.find(b => Math.abs(b.y - topEdge) < TOL) ?? null
    const botBound = all.find(b => Math.abs(b.y + b.h - botEdge) < TOL) ?? null
    return { topBound, botBound }
  }

  // A band's height is pinned when both its edges are immovable. An edge is
  // immovable when it coincides with the leaf edge (intrinsically fixed) OR
  // when the bounding fitting on that side has y_locked=true.
  //
  // Special case: a band with NO bounding fittings on either side fills the
  // whole leaf. Its edges are both leaf edges, so naïvely it'd register as
  // "locked" — but there's nothing to actually pin (no fittings exist). Empty
  // compartments would then show the ⚲ badge with no way to unlock, which is
  // the false-positive the user kept seeing. Treat this case as not locked.
  function isSubCompLocked(leaf: LeafDisplay, sub: { y: number; h: number }): boolean {
    const TOL = 0.5
    const topEdge = sub.y + sub.h
    const botEdge = sub.y
    const leafTop = leaf.box.y + leaf.box.h
    const leafBot = leaf.box.y
    const section = getSection(tree, leaf.path)
    if (section?.type !== 'open') return false
    const { topBound, botBound } = findSubBounds(leaf, sub)
    if (!topBound && !botBound) return false   // empty-leaf band — no fittings to lock
    const isLocked = (b: SubBound) =>
      (section.fittings[b.idx] as { y_locked?: boolean } | undefined)?.y_locked === true
    const topPinned = Math.abs(topEdge - leafTop) < TOL || (topBound ? isLocked(topBound) : false)
    const botPinned = Math.abs(botEdge - leafBot) < TOL || (botBound ? isLocked(botBound) : false)
    return topPinned && botPinned
  }

  // "Lock height" — pins the band's current height by locking BOTH bounding
  // fittings at their current y_position in a single save. Leaf edges are
  // already intrinsically fixed so we only need to lock fittings on whichever
  // side(s) actually have one. After this, the band's height is invariant
  // against anything happening elsewhere in the compartment because every
  // fitting that defines its edges is pinned.
  function lockSubCompHeight(leaf: LeafDisplay, sub: { y: number; h: number }) {
    const { topBound, botBound } = findSubBounds(leaf, sub)
    if (!topBound && !botBound) return
    let next = tree
    if (topBound) {
      next = patchFitting(next, leaf.path, topBound.idx,
        { y_locked: true, y_position: Math.round(topBound.y) } as Partial<InternalFitting>)
    }
    if (botBound) {
      // y_position of any fitting is its bottom edge — that's the same axis
      // y_locked uses elsewhere, so just freeze it at its current Y.
      next = patchFitting(next, leaf.path, botBound.idx,
        { y_locked: true, y_position: Math.round(botBound.y) } as Partial<InternalFitting>)
    }
    if (next !== tree) save(next)
  }

  // "Unlock height" — frees both bounding fittings so the band returns to
  // auto-stacking. We clear y_locked but keep y_position for reference (the
  // resolver ignores it when y_locked is false).
  function unlockSubCompHeight(leaf: LeafDisplay, sub: { y: number; h: number }) {
    const { topBound, botBound } = findSubBounds(leaf, sub)
    let next = tree
    if (topBound) {
      next = patchFitting(next, leaf.path, topBound.idx,
        { y_locked: false } as Partial<InternalFitting>)
    }
    if (botBound) {
      next = patchFitting(next, leaf.path, botBound.idx,
        { y_locked: false } as Partial<InternalFitting>)
    }
    if (next !== tree) save(next)
  }

  // Resize a sub-compartment to the given height by moving its bounding
  // fitting. A sub-comp isn't a stored entity — it's a gap between horizontal
  // occupants — so to "make this band 100mm" we lock the nearest fitting at
  // a new y_position. Preference:
  //   • If the band has a fitting ABOVE it (= a top-bounding shelf/drawer),
  //     move that fitting so the band beneath it is newH tall.
  //   • Else if there's a fitting BELOW (band is the topmost sub-comp), move
  //     the fitting down so the band above is newH tall.
  //   • Else the band fills the whole leaf — nothing to anchor against.
  // Locked fittings keep their explicit Y but bump the stacking cursor in
  // positionFittings, so the new locked Y can leave unintended slack against
  // earlier unlocked items (visible to the user, easily corrected by dragging
  // them or locking them too).
  function commitSubCompHeight(leaf: LeafDisplay, sub: { y: number; h: number }, newH: number) {
    if (!Number.isFinite(newH) || newH <= 0) return
    const TOL = 0.5
    const topEdge = sub.y + sub.h     // band's top edge = y_position of fitting above
    const botEdge = sub.y             // band's bottom edge = (y_position + h) of fitting below

    type Bound = { idx: number; y: number; h: number }
    const collect = (): { topBound: Bound | null; botBound: Bound | null } => {
      const all: Bound[] = [
        ...leaf.fittings.map(f => ({ idx: f.idx, y: f.y, h: f.h })),
        ...leaf.adjShelves.map(a => ({ idx: a.fittingIdx, y: a.y, h: SHELF_T })),
      ]
      const topBound = all.find(b => Math.abs(b.y - topEdge) < TOL) ?? null
      const botBound = all.find(b => Math.abs(b.y + b.h - botEdge) < TOL) ?? null
      return { topBound, botBound }
    }
    const { topBound, botBound } = collect()

    if (topBound) {
      // Move the fitting above so the band beneath it has the new height.
      // y_position of a fitting is its bottom edge in cabinet coords — for
      // inner_drawer / pull_out that's the box bottom (same axis the drag /
      // y_locked code uses), so this stays consistent with the rest of the UI.
      save(patchFitting(tree, leaf.path, topBound.idx,
        { y_locked: true, y_position: Math.round(sub.y + newH) } as Partial<InternalFitting>))
      return
    }
    if (botBound) {
      // Topmost band — move the fitting below down so the band above grows /
      // shrinks to newH. botBound's top edge must land at (leaf.top - newH),
      // so its y_position = leaf.top - newH - botBound.h.
      const leafTop = leaf.box.y + leaf.box.h
      save(patchFitting(tree, leaf.path, botBound.idx,
        { y_locked: true, y_position: Math.round(leafTop - newH - botBound.h) } as Partial<InternalFitting>))
      return
    }
    // No bounding fittings — band = whole leaf. Can't resize without changing
    // the leaf itself (which is the parent split's job).
  }

  // Tag the leaf at `path` into an equalise group. `null` removes it from any
  // group it belongs to. New groups are auto-named A, B, C…
  function setLeafGroup(path: Path, group: string | null) {
    save(setLeafEqualiseGroup(tree, path, group ?? undefined))
    setMenu(null)
  }
  function newGroupForLeaf(path: Path) {
    const ids = new Set(collectGroups(tree).keys())
    setLeafGroup(path, nextGroupId(ids))
  }

  // ── Per-box size controls ─────────────────────────────────────────────────────
  // A box's extent inside its parent split has three states, mutually exclusive:
  //   • Locked    — fixed mm (child.size set)
  //   • Equalised — shares one computed size with every box in the same group
  //                 (child.equalise_group set), even across splits/columns
  //   • Free      — neither; fills the remainder, split equally with other free
  //                 boxes in the same split (the resolver default)
  // Lock and Equalise each clear the other so the box is only ever in one state.

  // Toggle the lock. Turning it on freezes the box at its current extent.
  function setLeafLock(path: Path, on: boolean, currentExtent: number) {
    const parentPath = path.slice(0, -1)
    const idx        = path[path.length - 1]
    let next = setLeafEqualiseGroup(tree, path, undefined)   // lock wins over equalise
    next = setChildSize(next, parentPath, idx, on ? Math.max(1, Math.round(currentExtent)) : undefined)
    save(next)
  }

  // Commit a typed lock size (implies locked; empty/invalid clears the lock).
  function setLeafLockSize(path: Path, raw: string) {
    const parentPath = path.slice(0, -1)
    const idx        = path[path.length - 1]
    const v          = parseFloat(raw)
    if (raw.trim() === '' || isNaN(v) || v <= 0) {
      save(setChildSize(tree, parentPath, idx, undefined))
      return
    }
    let next = setLeafEqualiseGroup(tree, path, undefined)
    next = setChildSize(next, parentPath, idx, v)
    save(next)
  }

  // Simple per-box Equalise tick. Joins the single equalise group already in use
  // (the common case — "equalise this box with that one"); if none or several
  // exist, falls back to the canonical group 'A'. Advanced multi-group control
  // stays in the inline group picker + the right-click menu.
  function setLeafEqualise(path: Path, on: boolean) {
    if (!on) { save(setLeafEqualiseGroup(tree, path, undefined)); return }
    const ids    = [...collectGroups(tree).keys()]
    const target = ids.length === 1 ? ids[0] : 'A'
    save(setLeafEqualiseGroup(tree, path, target))
  }

  // An open compartment is "shelf-divided" when every fitting it holds is a
  // fixed shelf — i.e. the shelves are being used to carve the space into bands,
  // not to add a shelf inside a populated bay. Those bands have no identity, so
  // their height can't be locked per-band (locking one pins shelves shared with
  // the neighbours). Converting them to a structural hsplit gives each opening a
  // real, independently lockable / equalisable bay.
  const isShelfDivided = (s: Section | null): boolean =>
    s?.type === 'open' && s.fittings.length > 0 && s.fittings.every(f => f.type === 'fixed_shelf')

  function convertShelvesToBays(path: Path) {
    const s = getSection(tree, path)
    if (!isShelfDivided(s) || s?.type !== 'open') return
    const n = s.fittings.filter(f => f.type === 'fixed_shelf').length   // shelves ⇒ n+1 bays
    const children: SectionChild[] = Array.from({ length: n + 1 }, () => newOpen())
    save(updateAtPath(tree, path, () => ({ type: 'hsplit', children })))
    setSelected({ kind: 'leaf', path: [...path, 0] })
  }

  // Lock / Equalise controls for an opening, reused by the Compartment panel and
  // the Sub-compartment panel — so an opening keeps these controls even when an
  // adjustable shelf or drawer divides it into bands. Returns null for the root
  // opening, which has no parent split to size against.
  function renderSizeControls(path: Path, box: Box) {
    const axis  = getParentSplitAxis(tree, path)
    const child = getLeafChild(tree, path)
    if (!axis || !child) return null
    const locked    = child.size !== undefined
    const equalised = child.equalise_group !== undefined
    const dimLabel  = axis === 'v' ? 'width' : 'height'
    const curExtent = axis === 'v' ? box.w : box.h
    const groups    = collectGroups(tree)
    const myGroup   = child.equalise_group
    return (
      <div className="mt-3 border-t border-gray-800 pt-2">
        <p className="uppercase tracking-wider text-gray-500 mb-1.5">Opening size</p>

        {/* Lock */}
        <label className="flex items-center gap-1.5 mb-1 cursor-pointer">
          <input type="checkbox" className="accent-blue-500 w-3.5 h-3.5"
            checked={locked}
            onChange={e => setLeafLock(path, e.target.checked, curExtent)} />
          <span className="text-gray-400">Lock {dimLabel}</span>
        </label>
        {locked && (
          <div className="flex items-center gap-1 mb-2 pl-5">
            <input type="number" min={1} step={1}
              key={`leaf-size-${path.join('.')}-${child.size}`}
              defaultValue={child.size}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              onBlur={e => setLeafLockSize(path, e.target.value)}
              className={inp} />
            <span className="text-gray-500">mm</span>
          </div>
        )}

        {/* Equalise */}
        <label className="flex items-center gap-1.5 mb-1 cursor-pointer">
          <input type="checkbox" className="accent-blue-500 w-3.5 h-3.5"
            checked={equalised}
            onChange={e => setLeafEqualise(path, e.target.checked)} />
          <span className="text-gray-400">Equalise {dimLabel}</span>
          {equalised && myGroup && (
            <span className="inline-block w-3 h-3 rounded-full ml-auto"
              style={{ background: groupColor(myGroup) }} title={`Group ${myGroup}`} />
          )}
        </label>
        {equalised && myGroup && (
          <div className="flex items-center gap-1 mb-1 pl-5">
            <span className="text-gray-500">Group</span>
            <select
              value={myGroup}
              onChange={e => setLeafGroup(path, e.target.value)}
              className={inp + ' text-left flex-1'}
            >
              {!groups.has(myGroup) && <option value={myGroup}>Group {myGroup}</option>}
              {[...groups.keys()].map(id => (
                <option key={id} value={id}>Group {id} ({groups.get(id)!.count})</option>
              ))}
            </select>
            <button className={addBtn} title="New equalise group"
              onClick={() => newGroupForLeaf(path)}>+</button>
          </div>
        )}

        {!locked && !equalised && (
          <p className="text-[9px] text-gray-600">Fills the remaining space, shared equally with other unlocked bays.</p>
        )}
      </div>
    )
  }

  function handleAddFitting(path: Path, type: InternalFittingType) {
    const s = getSection(tree, path)
    if (s?.type !== 'open') return
    const idx = s.fittings.length
    save(addFitting(tree, path, newFitting(type)))
    setSelected({ kind: 'fitting', path, fittingIndex: idx })
    setMenu(null)
  }

  // Dispatch an "add element" choice for a whole opening: a fixed shelf splits it
  // structurally; everything else is added as a fitting. (addShelf / bumpAdj /
  // handleAddFitting each close the menu.)
  function runAdd(path: Path, kind: AddKind) {
    if (kind === 'fixed_shelf')    addShelf(path)
    else if (kind === 'adj_shelf') bumpAdj(path, +1)
    else                           handleAddFitting(path, kind)
  }

  // Same, but targeting a specific sub-compartment band: fittings land in the
  // band; a fixed shelf still splits the whole opening structurally (the single
  // horizontal-division mechanism).
  function runAddInSub(leafPath: Path, sub: { y: number; h: number }, kind: AddKind) {
    if (kind === 'fixed_shelf')    { addShelf(leafPath); return }
    if (kind === 'adj_shelf')      { bumpAdj(leafPath, +1); return }
    handleAddFittingInSub(leafPath, kind, sub)
  }

  // Add a fitting INTO a specific sub-compartment band of an open leaf. The
  // new fitting is inserted at the correct INDEX in section.fittings so the
  // cursor-based stacking in positionFittings places it between the band's
  // bounding fittings — without setting y_locked. That avoids auto-locking
  // adjacent bands (isSubCompLocked treats any neighbouring y_locked fitting
  // as a pin) and lets the user drag the new fitting freely. If the user
  // wants to pin the band, they explicitly right-click → Lock height.
  function handleAddFittingInSub(path: Path, type: InternalFittingType, sub: { y: number; h: number }) {
    const s = getSection(tree, path)
    if (s?.type !== 'open') return
    const leaf = leaves.find(l => pathEq(l.path, path))
    if (!leaf) return
    // Refuse to add into a locked band — it'd squeeze the band by re-flowing
    // the stacking cursor. Mirrors the inspector's disabled buttons; keeps
    // any future call site (toolbar, right-click) from sneaking past the gate.
    if (isSubCompLocked(leaf, sub)) return

    // Only non-adj fittings define ordering in the cursor stack — adj_shelves
    // are equalised independently and don't carry a fixed array position.
    const TOL = 0.5
    const topEdge = sub.y + sub.h
    const botEdge = sub.y
    const topBound = leaf.fittings.find(d => Math.abs(d.y - topEdge) < TOL) ?? null
    const botBound = leaf.fittings.find(d => Math.abs(d.y + d.h - botEdge) < TOL) ?? null

    // Insertion index in fittings[]:
    //   • both bounds   → right after botBound (= between the two)
    //   • only botBound → right after botBound (band is at the top of the leaf)
    //   • only topBound → at topBound's index (band is at the bottom)
    //   • neither       → append (band fills the leaf)
    let insertIdx: number
    if (botBound)      insertIdx = botBound.idx + 1
    else if (topBound) insertIdx = topBound.idx
    else               insertIdx = s.fittings.length

    const base = newFitting(type)
    const next = updateAtPath(tree, path, sec => {
      if (sec.type !== 'open') return sec
      return { ...sec, fittings: [...sec.fittings.slice(0, insertIdx), base, ...sec.fittings.slice(insertIdx)] }
    })
    save(next)
    setSelected({ kind: 'fitting', path, fittingIndex: insertIdx })
    setMenu(null)
  }

  function handleRemoveFitting(path: Path, idx: number) {
    setSelected({ kind: 'leaf', path })
    save(removeFittingAt(tree, path, idx))
  }
  function handleMoveFitting(path: Path, idx: number, delta: -1 | 1) {
    const next = idx + delta
    const s = getSection(tree, path)
    if (s?.type !== 'open' || next < 0 || next >= s.fittings.length) return
    save(moveFitting(tree, path, idx, delta))
    setSelected({ kind: 'fitting', path, fittingIndex: next })
  }
  function handlePatchFitting(path: Path, idx: number, patch: Partial<InternalFitting>) {
    save(patchFitting(tree, path, idx, patch))
  }

  function commitSepSize(path: Path, index: number, raw: string) {
    const v = parseFloat(raw)
    const locked = raw !== '' && !isNaN(v) && v > 0
    save(setChildSize(tree, path, index, locked ? v : undefined))
  }

  function startFittingDrag(e: React.MouseEvent, leaf: LeafDisplay, f: { idx: number; y: number; h: number; yLocked?: boolean }) {
    if (e.button !== 0) return
    // Drag is blocked on y_locked fittings — they're either pinning a sub-comp
    // height (via right-click → Lock height) or were explicitly locked in the
    // inspector. Unticking "Lock Y" in the inspector or using the sub-comp's
    // Unlock height menu releases them. Without this guard, dragging just
    // re-asserts y_locked at a new y_position, so the lock did nothing.
    if (f.yLocked) {
      e.preventDefault()
      e.stopPropagation()
      setSelected({ kind: 'fitting', path: leaf.path, fittingIndex: f.idx })
      return
    }
    e.preventDefault()
    e.stopPropagation()
    setMenu(null)
    const data = dragDataRef.current
    const svg  = data?.svg
    if (!svg) return
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY
    const inv = svg.getScreenCTM()?.inverse()
    if (!inv) return
    const u = pt.matrixTransform(inv)
    const cabY = cabDY - (u.y - oy)
    fittingDragRef.current = {
      path: leaf.path, fittingIndex: f.idx,
      startCabY: cabY, startY: f.y,
      fittingH: f.h,
      minY: leaf.box.y,
      maxY: leaf.box.y + leaf.box.h - f.h,
      moved: false, lastY: f.y,
    }
    setSelected({ kind: 'fitting', path: leaf.path, fittingIndex: f.idx })
  }

  function startDrag(e: React.MouseEvent, sep: SepDisplay) {
    // A locked or equalised bay's extent is fixed — by its size, or by its
    // group — not by dragging. Dragging here would overwrite the locked size /
    // silently break the equalise relationship, so bail out (no preventDefault)
    // and let the click select the separator instead. To change a locked bay,
    // edit its Lock field or unlock it; to resize an equalised bay, untick
    // Equalise first. (sep.locked is true for both locked and group-sized bays.)
    if (sep.locked) return
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
  const isEmpty  = tree.type === 'open' && tree.fittings.length === 0

  const inp     = 'bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-300 focus:outline-none focus:border-blue-500 w-full text-right'
  const addBtn  = 'px-2 py-0.5 rounded text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-gray-700'
  const menuBtn = 'w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-300 transition-colors'

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-gray-950">

      {/* Toolbar */}
      <div className="flex-none flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 border-b border-gray-700 flex-wrap text-[11px]">
        <span className="text-gray-500">
          {selected?.kind === 'subcomp' ? 'Selected sub-compartment:'
            : selected?.kind === 'leaf' ? 'Selected compartment:'
            : selected?.kind === 'fitting' ? 'Selected fitting:'
            : tree.type === 'open' ? 'Interior:' : 'Select a compartment:'}
        </span>
        <button className={addBtn} disabled={!targetPath}
          onClick={() => addShelf(targetPath)}
          title="Add a fixed shelf — splits the opening into bays you can lock or equalise."
        >+ Fixed shelf</button>
        <button className={addBtn} disabled={!targetPath}
          onClick={() => addDivider(targetPath)}
          title="Split the opening into side-by-side columns."
        >Split → columns</button>
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Adj:</span>
          <button className={addBtn} disabled={!targetPath} onClick={() => bumpAdj(targetPath, -1)}>−</button>
          <button className={addBtn} disabled={!targetPath} onClick={() => bumpAdj(targetPath, +1)}>+</button>
        </div>
        <div className="ml-1 flex items-center gap-1">
          <span className="text-gray-500">Gap:</span>
          <input
            type="number"
            min={0}
            step={1}
            key={`stack-gap-${stackGap}`}
            defaultValue={stackGap}
            onBlur={e => {
              const v = e.target.value.trim()
              const n = v === '' ? DEFAULT_STACK_GAP_DISP : Number(v)
              if (Number.isFinite(n) && n >= 0 && n !== stackGap) saveStackGap(n)
            }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-300 focus:outline-none focus:border-blue-500 w-12 text-right"
            title="Vertical gap (mm) between stacked drawers / pull-outs inside a compartment. Empty resets to default (3mm)."
          />
          <span className="text-gray-500">mm</span>
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
          style={(dragLive || fittingDragLive) ? { cursor: 'grabbing' } : undefined}
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
              const leafChild = getLeafChild(layoutTree, leaf.path)
              const groupId   = leafChild?.equalise_group
              const lockedBay = leafChild?.size !== undefined && !groupId
              return (
                <g key={key}>
                  {/* Sub-compartments — gaps between horizontal elements. Each is
                      its own clickable rect. A click selects the sub-compartment
                      itself when the leaf has 2+ sub-comps (so subsequent splits /
                      added fittings target only that band); when there's just one
                      sub-comp it's identical to the whole leaf, so click selects
                      the leaf. Sub-comp selections have no data identity — the
                      tree is untouched. */}
                  {leaf.subCompartments.map((sub, si) => {
                    const multi  = leaf.subCompartments.length > 1
                    const isSelS = multi
                      && selected?.kind === 'subcomp'
                      && pathEq(selected.path, leaf.path)
                      && selected.subIdx === si
                    // The leaf reads as "selected" when EITHER the leaf is selected
                    // (highlight all sub-rects) OR any of its sub-comps is selected
                    // (highlight only that one). Group viz applies to all sub-rects.
                    const isSelHere = isSel || isSelS
                    return (
                      <rect key={`sub-${si}`}
                        x={ox + leaf.box.x} y={svgY(sub.y + sub.h)}
                        width={leaf.box.w} height={sub.h}
                        fill={isSelHere ? 'rgba(59,130,246,0.10)' : (groupId ? `${groupColor(groupId)}14` : 'transparent')}
                        stroke={isSelHere ? '#3b82f6' : (groupId ? groupColor(groupId) : 'none')}
                        strokeWidth={isSelHere ? 1.5 : (groupId ? 1 : 0)}
                        strokeDasharray={!isSelHere && groupId ? '3 3' : undefined}
                        style={{ cursor: 'pointer' }}
                        onClick={e => {
                          e.stopPropagation(); setMenu(null)
                          if (!multi) {
                            setSelected(isSel ? null : { kind: 'leaf', path: leaf.path })
                          } else {
                            setSelected(isSelS ? null : { kind: 'subcomp', path: leaf.path, subIdx: si })
                          }
                        }}
                        onContextMenu={e => {
                          e.preventDefault(); e.stopPropagation()
                          if (!multi) {
                            setSelected({ kind: 'leaf', path: leaf.path })
                            setMenu({ kind: 'leaf', clientX: e.clientX, clientY: e.clientY, path: leaf.path })
                          } else {
                            setSelected({ kind: 'subcomp', path: leaf.path, subIdx: si })
                            setMenu({ kind: 'subcomp', clientX: e.clientX, clientY: e.clientY, path: leaf.path, subIdx: si })
                          }
                        }}
                      />
                    )
                  })}
                  {/* Equalise-group badge — top-left corner of the leaf */}
                  {groupId && leaf.box.w > 24 && leaf.box.h > 24 && (
                    <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      <circle cx={ox + leaf.box.x + 10} cy={svgY(leaf.box.y + leaf.box.h) + 10}
                        r={7} fill={groupColor(groupId)} stroke="#0a111e" strokeWidth={1} />
                      <text x={ox + leaf.box.x + 10} y={svgY(leaf.box.y + leaf.box.h) + 10}
                        textAnchor="middle" dominantBaseline="central"
                        fontSize={9} fontWeight={700} fill="#0a111e"
                        fontFamily="system-ui,sans-serif"
                      >{groupId}</text>
                    </g>
                  )}
                  {/* Lock badge — top-right corner of a fixed-size bay */}
                  {lockedBay && leaf.box.w > 24 && leaf.box.h > 24 && (
                    <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      <circle cx={ox + leaf.box.x + leaf.box.w - 10} cy={svgY(leaf.box.y + leaf.box.h) + 10}
                        r={7} fill="#1f2937" stroke="#fbbf24" strokeWidth={1} />
                      <text x={ox + leaf.box.x + leaf.box.w - 10} y={svgY(leaf.box.y + leaf.box.h) + 10}
                        textAnchor="middle" dominantBaseline="central"
                        fontSize={10} fontWeight={700} fill="#fbbf24"
                        fontFamily="system-ui,sans-serif"
                      >⚲</text>
                    </g>
                  )}
                  {/* adjustable shelves inside this compartment — click to select, drag to lock at Y */}
                  {leaf.adjShelves.map(adj => {
                    const isSelA  = selected?.kind === 'fitting' && pathEq(selected.path, leaf.path) && selected.fittingIndex === adj.fittingIdx
                    const isDragA = fittingDragLive
                      && pathEq(fittingDragLive.path, leaf.path)
                      && fittingDragLive.fittingIndex === adj.fittingIdx
                    const w = Math.max(0, leaf.box.w - 2 * ADJ_INSET)
                    return (
                      <g key={`adj-${key}-${adj.fittingIdx}`}
                        onMouseDown={e => startFittingDrag(e, leaf, { idx: adj.fittingIdx, y: adj.y, h: SHELF_T, yLocked: adj.yLocked })}
                        onClick={e => {
                          e.stopPropagation()
                          if (wasDragging.current) { wasDragging.current = false; return }
                          setMenu(null)
                          setSelected({ kind: 'fitting', path: leaf.path, fittingIndex: adj.fittingIdx })
                        }}
                        style={{ cursor: adj.yLocked ? 'not-allowed' : (isDragA ? 'grabbing' : 'grab') }}
                      >
                        <rect
                          x={ox + leaf.box.x + ADJ_INSET} y={svgY(adj.y + SHELF_T)}
                          width={w} height={SHELF_T}
                          fill={isSelA ? '#312e81' : '#1e1b4b'}
                          stroke={isSelA ? '#818cf8' : '#4338ca'}
                          strokeWidth={isSelA ? 1.5 : 1}
                          strokeDasharray="4 2"
                        />
                        {w > 60 && (
                          <text x={ox + leaf.box.x + leaf.box.w / 2} y={svgY(adj.y + SHELF_T / 2)}
                            textAnchor="middle" dominantBaseline="central"
                            fontSize={10} fill={isSelA ? '#c7d2fe' : '#a5b4fc'}
                            fontFamily="system-ui,sans-serif"
                            style={{ pointerEvents: 'none', userSelect: 'none' }}
                          >Adj shelf{adj.yLocked ? ' ⚲' : ''}</text>
                        )}
                      </g>
                    )
                  })}
                  {/* placed fittings — drawers, pull-outs, fixed shelves, accessories */}
                  {leaf.fittings.map(f => {
                    const isSelF = selected?.kind === 'fitting' && pathEq(selected.path, leaf.path) && selected.fittingIndex === f.idx
                    const isDragF = fittingDragLive
                      && pathEq(fittingDragLive.path, leaf.path)
                      && fittingDragLive.fittingIndex === f.idx
                    const style  = FITTING_STYLE[f.type]
                    const w      = Math.max(0, leaf.box.w - 2 * ADJ_INSET)
                    return (
                      <g key={`fit-${key}-${f.idx}`}
                        onMouseDown={e => startFittingDrag(e, leaf, f)}
                        onClick={e => {
                          e.stopPropagation()
                          if (wasDragging.current) { wasDragging.current = false; return }
                          setMenu(null)
                          setSelected({ kind: 'fitting', path: leaf.path, fittingIndex: f.idx })
                        }}
                        style={{ cursor: f.yLocked ? 'not-allowed' : (isDragF ? 'grabbing' : 'grab') }}
                      >
                        <rect
                          x={ox + leaf.box.x + ADJ_INSET} y={svgY(f.y + f.h)}
                          width={w} height={f.h}
                          fill={isSelF ? style.fillSel : style.fill}
                          stroke={isSelF ? '#3b82f6' : style.stroke}
                          strokeWidth={isSelF ? 1.5 : 1}
                          strokeDasharray={style.dash}
                        />
                        {w > 60 && f.h > 18 && (
                          <text x={ox + leaf.box.x + leaf.box.w / 2} y={svgY(f.y + f.h / 2)}
                            textAnchor="middle" dominantBaseline="central"
                            fontSize={10} fill={isSelF ? '#bfdbfe' : style.label}
                            fontFamily="system-ui,sans-serif"
                            style={{ pointerEvents: 'none', userSelect: 'none' }}
                          >{style.title} {Math.round(f.labelH)}mm</text>
                        )}
                      </g>
                    )
                  })}
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
                  style={{ cursor: sep.locked ? 'pointer' : (sep.axis === 'h' ? 'ns-resize' : 'ew-resize') }}
                >
                  <rect
                    x={ox + sep.box.x} y={svgY(sep.box.y + sep.box.h)}
                    width={sep.box.w} height={sep.box.h}
                    fill={fill} stroke={stroke} strokeWidth={isSel || live ? 1.5 : 1}
                    onMouseDown={e => startDrag(e, sep)}
                  >
                    {sep.equalised
                      ? <title>Equalised bay — resize via the box’s Lock field, or untick Equalise to drag.</title>
                      : sep.locked
                        ? <title>Locked bay — change its size in the box’s Lock field, or unlock it to drag.</title>
                        : null}
                  </rect>
                  {sep.axis === 'h' && sep.box.w > 80 && (
                    <text x={ox + sep.box.x + sep.box.w / 2} y={svgY(sep.box.y + sep.box.h / 2)}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize={Math.min(13, sep.box.h * 0.72)} fill={isSel ? '#e9d5ff' : '#a78bfa'}
                      fontFamily="system-ui,sans-serif" style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >{sep.equalised ? 'shelf =' : sep.locked ? 'shelf ⚲' : 'shelf'}</text>
                  )}
                </g>
              )
            })}

            {/* Drawer boxes (resolved) — non-interactive overlay so the interior view
                reflects drawers, including scribe-corrected width/position. */}
            {(rp?.drawer_stacks ?? []).map((stack, si) => {
              const bx = ox + stack.box_X
              const byTop = svgY(stack.box_Y + stack.box_height)
              return (
                <g key={`drawer-${si}`} style={{ pointerEvents: 'none' }}>
                  {stack.slides.map((sl, li) => (
                    <rect key={`dsl-${si}-${li}`}
                      x={ox + sl.X} y={svgY(sl.Y + sl.DY)}
                      width={Math.max(sl.DZ, 1)} height={sl.DY}
                      fill="#1c1917" stroke="#d97706" strokeWidth={0.75} />
                  ))}
                  <rect x={bx} y={byTop} width={stack.box_width} height={stack.box_height}
                    fill="rgba(34,197,94,0.06)" stroke="#22c55e" strokeWidth={1} strokeDasharray="4 2" />
                  {stack.box_width > 60 && stack.box_height > 20 && (
                    <text x={bx + stack.box_width / 2} y={byTop + 11}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize={10} fill="#22c55e" fontFamily="system-ui,sans-serif"
                      style={{ userSelect: 'none' }}
                    >drawer {Math.round(stack.box_width)}mm</text>
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

          {/* Selected sub-compartment — a vertical band inside an open leaf.
              Actions add fittings with y_locked into this band; Split into
              shelves inserts a fixed-shelf fitting at the band midpoint. */}
          {selSub && (() => {
            // Locked bands refuse all height-changing actions in the inspector
            // (resize input, Split into shelves, Add fitting). The user has to
            // explicitly unlock via right-click first. This matches the lock's
            // promise: "doesn't change height unless its unlocked."
            const subLocked  = isSubCompLocked(selSub.leaf, selSub.sub)
            const lockedTip  = 'This sub-compartment is locked. Right-click it → Unlock height first.'
            const canConvert = isShelfDivided(getSection(tree, selSub.leaf.path))
            return (
            <div>
              <p className="uppercase tracking-wider text-blue-400 mb-2">
                Sub-compartment{subLocked ? ' ⚲' : ''}
              </p>
              <p className="text-gray-500 mb-2">
                W {Math.round(selSub.leaf.box.w)} mm{subLocked ? ' · locked' : ''}
              </p>

              {/* Recommended path: turn shelf-divided bands into real bays so each
                  opening gets its own Lock / Equalise (locking a band can't be
                  per-band — it pins shelves shared with the neighbours). */}
              {canConvert && (
                <div className="mb-2 p-1.5 rounded bg-amber-950/40 border border-amber-900/60">
                  <button className={addBtn + ' w-full text-left'}
                    onClick={() => convertShelvesToBays(selSub.leaf.path)}
                    title="Turn these fixed shelves into structural bays. Each opening then becomes its own area with a Lock / Equalise control — and locking one no longer affects the others."
                  >Convert shelves → bays ⭢</button>
                  <p className="text-[9px] text-amber-300/70 mt-1">
                    Bands can’t lock individually. Convert to bays to lock/equalise each opening.
                  </p>
                </div>
              )}

              {/* The whole opening's Lock / Equalise (its slot in the parent
                  split) — shown here too so dividing it with a shelf/drawer
                  doesn't hide these controls. */}
              {renderSizeControls(selSub.leaf.path, selSub.leaf.box)}

              <label className="block mb-2 mt-3">
                <span className="block text-gray-500 mb-1">
                  Height (mm){subLocked ? ' — locked' : ''}
                </span>
                <input type="number"
                  min={1}
                  step={1}
                  key={`sub-h-${selSub.leaf.path.join('.') || 'r'}-${selSub.sub.y}-${Math.round(selSub.sub.h)}`}
                  defaultValue={Math.round(selSub.sub.h)}
                  disabled={subLocked}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  onBlur={e => {
                    const v = e.target.value.trim()
                    const n = v === '' ? NaN : Number(v)
                    if (Number.isFinite(n) && n > 0 && Math.abs(n - selSub.sub.h) > 0.5) {
                      commitSubCompHeight(selSub.leaf, selSub.sub, n)
                    }
                  }}
                  className={inp + (subLocked ? ' opacity-40 cursor-not-allowed' : '')}
                  title={subLocked ? lockedTip : 'Resize this band by locking the bounding shelf/drawer. Empty restores the default by editing the bounding fitting directly.'}
                />
              </label>
              {/* Add element here — same unified menu as a whole opening. A fixed
                  shelf splits the opening structurally; the rest land in this band. */}
              <p className="uppercase tracking-wider text-gray-500 mt-3 mb-1">
                Add element here{subLocked ? ' — locked' : ''}
              </p>
              <div className="grid grid-cols-2 gap-1">
                {ADD_ELEMENTS.map(el => (
                  <button key={el.kind} className={addBtn + ' text-left'}
                    disabled={subLocked} title={subLocked ? lockedTip : el.title}
                    onClick={() => runAddInSub(selSub.leaf.path, selSub.sub, el.kind)}
                  >+ {el.label}</button>
                ))}
              </div>

              <button className={addBtn + ' mt-3 w-full text-left'}
                onClick={() => setSelected({ kind: 'leaf', path: selSub.leaf.path })}
                title="Switch selection to the whole compartment"
              >Select whole compartment</button>
            </div>
            )
          })()}

          {/* Selected compartment */}
          {selLeaf && selLeafOpen && (
            <div>
              <p className="uppercase tracking-wider text-blue-400 mb-2">Compartment</p>
              <p className="text-gray-500 mb-2">{Math.round(selLeaf.box.w)} × {Math.round(selLeaf.box.h)} mm</p>

              {/* Offer the structural conversion here too when this compartment is
                  divided only by fixed shelves. */}
              {isShelfDivided(selLeafOpen) && (
                <div className="mb-2 p-1.5 rounded bg-amber-950/40 border border-amber-900/60">
                  <button className={addBtn + ' w-full text-left'}
                    onClick={() => convertShelvesToBays(selLeaf.path)}
                    title="Turn these fixed shelves into structural bays so each opening can be locked / equalised independently."
                  >Convert shelves → bays ⭢</button>
                </div>
              )}

              <button className={addBtn + ' text-left w-full'} onClick={() => addDivider(selLeaf.path)}
                title="Split this opening into side-by-side columns.">Split into columns ⇆</button>

              {/* Lock / Equalise this opening within its parent split */}
              {renderSizeControls(selLeaf.path, selLeaf.box)}

              {/* Add element — one menu for every horizontal element. Fixed shelf
                  splits the opening into bays; the rest are fittings placed here.
                  (Also available by right-clicking the opening.) */}
              <p className="uppercase tracking-wider text-gray-500 mt-3 mb-1">Add element</p>
              <div className="grid grid-cols-2 gap-1">
                {ADD_ELEMENTS.map(el => (
                  <button key={el.kind} className={addBtn + ' text-left'} title={el.title}
                    onClick={() => runAdd(selLeaf.path, el.kind)}>+ {el.label}</button>
                ))}
              </div>

              {/* Adjustable-shelf count — only when some exist, for quick +/- */}
              {adjOf(selLeafOpen.fittings).length > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-indigo-400">Adjustable shelves</span>
                  <div className="ml-auto flex items-center gap-1">
                    <button className={addBtn} onClick={() => bumpAdj(selLeaf.path, -1)}>−</button>
                    <span className="w-4 text-center font-mono text-gray-300">{adjOf(selLeafOpen.fittings).length}</span>
                    <button className={addBtn} onClick={() => bumpAdj(selLeaf.path, +1)}>+</button>
                  </div>
                </div>
              )}

              {/* Fitting list (non-adj fittings shown bottom→top) */}
              {selLeafOpen.fittings.some(f => f.type !== 'adj_shelf') && (
                <>
                  <p className="uppercase tracking-wider text-gray-500 mt-3 mb-1">Placed fittings</p>
                  <div className="flex flex-col gap-1">
                    {selLeafOpen.fittings.map((f, i) => {
                      if (f.type === 'adj_shelf') return null
                      const isSelF = selected?.kind === 'fitting' && selected.fittingIndex === i
                      return (
                        <div key={`flist-${i}`}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer ${isSelF ? 'bg-blue-900/40 text-blue-200' : 'bg-gray-800/60 text-gray-300 hover:bg-gray-800'}`}
                          onClick={() => setSelected({ kind: 'fitting', path: selLeaf.path, fittingIndex: i })}
                        >
                          <span className="flex-1 truncate">{FITTING_LABEL[f.type]}</span>
                          <button className={addBtn} title="Move up"   onClick={e => { e.stopPropagation(); handleMoveFitting(selLeaf.path, i, -1) }}>↑</button>
                          <button className={addBtn} title="Move down" onClick={e => { e.stopPropagation(); handleMoveFitting(selLeaf.path, i, +1) }}>↓</button>
                          <button className="px-1.5 py-0.5 rounded text-[10px] bg-red-900/40 hover:bg-red-900/60 text-red-300"
                            title="Remove"
                            onClick={e => { e.stopPropagation(); handleRemoveFitting(selLeaf.path, i) }}
                          >✕</button>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Selected fitting — inspector */}
          {selFittingData && selFittingPath && selFittingIndex >= 0 && (
            <div>
              <p className="uppercase tracking-wider text-blue-400 mb-2">
                {FITTING_LABEL[selFittingData.type] ?? selFittingData.type}
              </p>
              {selFittingDisplay && (
                <p className="text-gray-500 mb-2">
                  Y {Math.round(selFittingDisplay.y)} · H {Math.round(selFittingDisplay.labelH)} mm
                </p>
              )}

              {/* Per-type fields */}
              {selFittingData.type === 'inner_drawer' && (
                <div className="flex flex-col gap-2">
                  <label className="block">
                    <span className="block text-gray-500 mb-1">Drawer type</span>
                    <select
                      value={(selFittingData as InnerDrawerFitting).drawer_type ?? ''}
                      onChange={e => handlePatchFitting(selFittingPath, selFittingIndex, {
                        drawer_type: (e.target.value === '' ? undefined : e.target.value) as DrawerType | undefined,
                      })}
                      className={inp}
                      title="Empty = inherit from the cabinet's inner-drawer method (set in Job/Room properties)."
                    >
                      <option value="">— inherit from method —</option>
                      <option value="five_piece">Five-piece</option>
                      <option value="system">System (Blum/DTC…)</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-gray-500 mb-1">Box method</span>
                    <select
                      value={(selFittingData as InnerDrawerFitting).drawer_box_method_id ?? ''}
                      onChange={e => handlePatchFitting(selFittingPath, selFittingIndex, { drawer_box_method_id: e.target.value || undefined })}
                      className={inp}
                      title="Pick an inner-drawer method (tagged kind='internal' in the drawer-boxes library). Empty = use the cabinet's inner method."
                    >
                      <option value="">— use cabinet default —</option>
                      {innerMethods.map(m => <option key={m.id} value={m.id}>{m.name}{m.drawer_type ? ` · ${m.drawer_type}` : ''}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-gray-500 mb-1">Slide</span>
                    <select
                      value={(selFittingData as InnerDrawerFitting).slide_product_id ?? ''}
                      onChange={e => handlePatchFitting(selFittingPath, selFittingIndex, { slide_product_id: e.target.value || undefined })}
                      className={inp}
                    >
                      <option value="">— auto-pick —</option>
                      {slideProds.map(s => <option key={s.id} value={s.id}>{s.name}{s.nominal_length ? ` (NL ${s.nominal_length})` : ''}</option>)}
                    </select>
                  </label>
                  <InnerHeightYRow
                    inp={inp}
                    height={(selFittingData as InnerDrawerFitting).height}
                    yLocked={(selFittingData as InnerDrawerFitting).y_locked}
                    yPosition={(selFittingData as InnerDrawerFitting).y_position}
                    onPatch={p => handlePatchFitting(selFittingPath, selFittingIndex, p)}
                  />
                </div>
              )}

              {selFittingData.type === 'pull_out' && (
                <div className="flex flex-col gap-2">
                  <label className="block">
                    <span className="block text-gray-500 mb-1">Slide</span>
                    <select
                      value={(selFittingData as PullOutFitting).slide_product_id ?? ''}
                      onChange={e => handlePatchFitting(selFittingPath, selFittingIndex, { slide_product_id: e.target.value || undefined })}
                      className={inp}
                    >
                      <option value="">— auto-pick —</option>
                      {slideProds.map(s => <option key={s.id} value={s.id}>{s.name}{s.nominal_length ? ` (NL ${s.nominal_length})` : ''}</option>)}
                    </select>
                  </label>
                  <InnerHeightYRow
                    inp={inp}
                    height={(selFittingData as PullOutFitting).height}
                    yLocked={(selFittingData as PullOutFitting).y_locked}
                    yPosition={(selFittingData as PullOutFitting).y_position}
                    onPatch={p => handlePatchFitting(selFittingPath, selFittingIndex, p)}
                  />
                </div>
              )}

              {selFittingData.type === 'adj_shelf' && (
                <div className="flex flex-col gap-2">
                  <p className="text-gray-500 text-[10px]">
                    Drag the shelf or use ↑/↓ to lock at a specific Y. Uncheck Lock Y to re-equalise.
                  </p>
                  <YLockRow
                    inp={inp}
                    yLocked={(selFittingData as AdjShelfFitting).y_locked}
                    yPosition={(selFittingData as AdjShelfFitting).y_position}
                    onPatch={p => handlePatchFitting(selFittingPath, selFittingIndex, p)}
                  />
                </div>
              )}

              {selFittingData.type === 'fixed_shelf' && (
                <div className="flex flex-col gap-2">
                  <YLockRow
                    inp={inp}
                    yLocked={(selFittingData as FixedShelfFitting).y_locked}
                    yPosition={(selFittingData as FixedShelfFitting).y_position}
                    onPatch={p => handlePatchFitting(selFittingPath, selFittingIndex, p)}
                  />
                </div>
              )}

              {selFittingData.type === 'accessory' && (
                <div className="flex flex-col gap-2">
                  <label className="block">
                    <span className="block text-gray-500 mb-1">Key (parts_library)</span>
                    <input type="text"
                      defaultValue={(selFittingData as AccessoryFitting).key ?? ''}
                      onBlur={e => handlePatchFitting(selFittingPath, selFittingIndex, { key: e.target.value.trim() || undefined })}
                      placeholder="WINE_RACK"
                      className={inp + ' text-left'}
                    />
                  </label>
                  <InnerHeightYRow
                    inp={inp}
                    height={(selFittingData as AccessoryFitting).height}
                    yLocked={(selFittingData as AccessoryFitting).y_locked}
                    yPosition={(selFittingData as AccessoryFitting).y_position}
                    onPatch={p => handlePatchFitting(selFittingPath, selFittingIndex, p)}
                  />
                  <label className="block">
                    <span className="block text-gray-500 mb-1">Notes</span>
                    <input type="text"
                      defaultValue={(selFittingData as AccessoryFitting).notes ?? ''}
                      onBlur={e => handlePatchFitting(selFittingPath, selFittingIndex, { notes: e.target.value.trim() || undefined })}
                      className={inp + ' text-left'}
                    />
                  </label>
                </div>
              )}

              <div className="flex items-center gap-1 mt-3 pt-2 border-t border-gray-800">
                <button className={addBtn} onClick={() => handleMoveFitting(selFittingPath, selFittingIndex, -1)}>↑ Up</button>
                <button className={addBtn} onClick={() => handleMoveFitting(selFittingPath, selFittingIndex, +1)}>↓ Down</button>
                <button className="ml-auto px-2 py-0.5 rounded text-[10px] bg-red-900/40 hover:bg-red-900/60 text-red-300"
                  onClick={() => handleRemoveFitting(selFittingPath, selFittingIndex)}
                >Remove</button>
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

          {!isEmpty && !selLeaf && !selSep && !selFittingData && !selSub && (
            <p className="text-gray-600">Click a compartment (or one of its sub-bands above/below a shelf) to split it or add fittings, or a shelf/divider/fitting to edit it.</p>
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
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: 'rgba(34,197,94,0.06)', border: '1px dashed #22c55e' }} />
                  <span className="text-gray-500">Inner drawer</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: 'rgba(245,158,11,0.08)', border: '1px dashed #f59e0b' }} />
                  <span className="text-gray-500">Rollout</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-gray-800/60">
                  <div className="w-3 h-3 rounded-full shrink-0 flex items-center justify-center text-[8px] font-bold"
                    style={{ background: '#1f2937', border: '1px solid #fbbf24', color: '#fbbf24' }}>⚲</div>
                  <span className="text-gray-500">Locked bay (fixed size)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: groupColor('A') }} />
                  <span className="text-gray-500">Equalised bay (group)</span>
                </div>
              </div>
            </div>
          )}

          {/* Interior dims */}
          <div className="text-gray-700 space-y-0.5 mt-auto pt-2 border-t border-gray-800">
            <p>W {Math.round(intW)}mm (approx)</p>
            <p>H {Math.round(intH)}mm</p>
            <p className="text-[9px] text-gray-800">Click a bay → Lock or Equalise it in the Size panel</p>
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
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-gray-500">Add element</div>
                {ADD_ELEMENTS.map(el => (
                  <button key={el.kind} className={menuBtn} title={el.title}
                    onClick={() => runAdd(menu.path, el.kind)}>+ {el.label}</button>
                ))}
                <div className="border-t border-gray-700 mt-1 pt-1">
                  <button className={menuBtn} onClick={() => addDivider(menu.path)}>Split into columns ⇆</button>
                  <button className={menuBtn + ' text-gray-400'} onClick={() => bumpAdj(menu.path, -1)}>− Adjustable shelf</button>
                </div>
                {(() => {
                  const axis = getParentSplitAxis(tree, menu.path)
                  if (!axis) return null   // root leaf has no parent split
                  const label = axis === 'v' ? 'Equalise width' : 'Equalise height'
                  const groups = collectGroups(tree)
                  const myGroup = getLeafChild(tree, menu.path)?.equalise_group
                  return (
                    <div className="border-t border-gray-700 mt-1 pt-1">
                      <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
                      {[...groups.entries()].map(([id, g]) => {
                        const isMine = id === myGroup
                        return (
                          <button key={id}
                            className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-300 transition-colors flex items-center gap-2"
                            onClick={() => setLeafGroup(menu.path, id)}
                          >
                            <span className="inline-block w-3 h-3 rounded-full" style={{ background: groupColor(id) }} />
                            <span>{isMine ? '✓ ' : ''}Group {id} ({g.count})</span>
                          </button>
                        )
                      })}
                      <button className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-300 transition-colors"
                        onClick={() => newGroupForLeaf(menu.path)}>+ New group</button>
                      {myGroup && (
                        <button className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-400 transition-colors"
                          onClick={() => setLeafGroup(menu.path, null)}>− Remove from group</button>
                      )}
                    </div>
                  )
                })()}
              </>
            ) : menu.kind === 'subcomp' ? (() => {
              // Resolve the band the user right-clicked. If the leaf re-rendered
              // and the indices shifted (rare — e.g. concurrent save), fall back
              // gracefully by closing the menu.
              const m = menu
              const leaf = leaves.find(l => pathEq(l.path, m.path))
              const sub  = leaf?.subCompartments[m.subIdx]
              if (!leaf || !sub) return null
              const locked = isSubCompLocked(leaf, sub)
              const { topBound, botBound } = findSubBounds(leaf, sub)
              const canLock = !!(topBound || botBound)
              const canConvertHere = isShelfDivided(getSection(tree, leaf.path))
              return (
                <>
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-gray-500">
                    Add element here
                  </div>
                  {ADD_ELEMENTS.map(el => (
                    <button key={el.kind}
                      className={menuBtn + (locked ? ' opacity-40 cursor-not-allowed' : '')}
                      disabled={locked} title={locked ? undefined : el.title}
                      onClick={() => runAddInSub(leaf.path, sub, el.kind)}
                    >+ {el.label}</button>
                  ))}
                  {canConvertHere && (
                    <div className="border-t border-gray-700 mt-1 pt-1">
                      <button className={menuBtn}
                        onClick={() => { convertShelvesToBays(leaf.path); setMenu(null) }}
                        title="Turn these fixed shelves into structural bays so each opening can be locked / equalised independently."
                      >Convert shelves → bays ⭢</button>
                    </div>
                  )}
                  <div className="border-t border-gray-700 mt-1 pt-1">
                    <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-gray-500">
                      Band · {Math.round(sub.h)} mm{locked ? ' · locked' : ''}
                    </div>
                    {!locked && (
                      <button className={menuBtn + ' disabled:opacity-40 disabled:cursor-not-allowed'}
                        disabled={!canLock}
                        onClick={() => { lockSubCompHeight(leaf, sub); setMenu(null) }}
                        title={canLock
                          ? 'Pin this band’s height. Note: this can also pin a shelf shared with the neighbour — convert to bays for clean per-opening locking.'
                          : 'No bounding shelf/drawer to lock — this band already fills the whole compartment.'}
                      >Lock height ⚲</button>
                    )}
                    {locked && (
                      <button className={menuBtn}
                        onClick={() => { unlockSubCompHeight(leaf, sub); setMenu(null) }}
                        title="Unlock both bounding fittings so this band re-flows with the rest of the stack."
                      >Unlock height</button>
                    )}
                  </div>
                </>
              )
            })() : (
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
