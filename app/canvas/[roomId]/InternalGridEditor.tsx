'use client'

import { useState, useRef, useEffect } from 'react'
import type { CabinetInstance } from '@/src/lib/types'
import type {
  ResolvedCabinet, ResolvedInternalPart, Section, SplitSection, SectionChild, SectionSeparator,
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
// MAT_T is only a fallback before the cabinet resolves; once resolved the editor
// uses the cabinet's real carcass / shelf material thicknesses (matT / shelfT).
const MAT_T   = 18   // fallback carcass / divider / shelf thickness (pre-resolve)
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
        ...(c.separator === 'none' || c.separator === 'adj_shelf' || c.separator === 'fixed_shelf' ? { separator: c.separator } : {}),
        ...(c.auto_height === true ? { auto_height: true } : {}),
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
  kind:       'fixed_shelf' | 'adj_shelf' | 'divider'   // what this separator is
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

// A drawer/rollout bay — an open compartment holding a drawer/rollout. Such bays
// have OPEN gaps around them; detecting it self-heals data where 'none' was lost.
const isDrawerBaySectionEd = (section: Section): boolean =>
  section.type === 'open' && section.fittings.some(f => f.type === 'inner_drawer' || f.type === 'pull_out')

// Thickness of the divider between child i and i+1 of a split (editor mirror of
// the resolver's gapThickness): vertical = divider (matT); horizontal = shelf
// (shelfT) unless the gap is 'none' or borders a drawer/rollout bay with no
// explicit separator set. matT/shelfT are the cabinet's real material thicknesses.
const edGapT = (kids: SectionChild[], i: number, horiz: boolean, shelfT: number, matT: number): number => {
  if (i >= kids.length - 1) return 0
  if (!horiz) return matT
  const c = kids[i]
  if (c.separator === 'none') return 0
  if (c.separator === undefined && (isDrawerBaySectionEd(c.section) || (!!kids[i + 1] && isDrawerBaySectionEd(kids[i + 1].section)))) return 0
  return shelfT
}

type SlideLite = { id: string; box_height: number | null }

// Editor mirror of resolveInternal.autoBayHeight — a drawer/rollout bay's height
// from the explicit fitting height or the chosen slide's box_height, else the
// type default (used until a slide/height is set; auto-pick can't be sized here).
function autoBayHeightEd(section: Section, slides: SlideLite[]): number | null {
  if (section.type !== 'open') return null
  const f = section.fittings.find(g => g.type === 'inner_drawer' || g.type === 'pull_out') as
    | { type: string; height?: number; slide_product_id?: string } | undefined
  if (!f) return null
  if (f.height != null && f.height > 0) return f.height
  if (f.slide_product_id) {
    const sp = slides.find(s => s.id === f.slide_product_id)
    if (sp?.box_height != null && sp.box_height > 0) return sp.box_height
  }
  return f.type === 'inner_drawer' ? DEF_INNER_H : DEF_PULL_OUT_H
}

// A child's fixed extent for layout: explicit size, or an auto-height drawer
// bay's height. null = free/flex.
const childFixed = (c: SectionChild, slides: SlideLite[]): number | null =>
  c.size !== undefined ? c.size
  : c.auto_height ? autoBayHeightEd(c.section, slides)
  : null

// Pass-1 walker (editor-side mirror of resolveInternal.computeGroupSizes).
// Records each equalise group's per-split natural fair share; the group's
// resolved size is min(candidates) so it always fits.
function computeGroupSizes(root: Section, interior: Box, slides: SlideLite[], shelfT: number, matT: number): Map<string, number> {
  const candidates = new Map<string, number[]>()

  function walk(s: Section, box: Box) {
    if (s.type === 'open' || box.w <= 0 || box.h <= 0) return
    const horiz = s.type === 'hsplit'
    const total = horiz ? box.h : box.w
    const kids  = s.children
    const N     = kids.length
    if (N === 0) return
    const sepThick = (i: number) => edGapT(kids, i, horiz, shelfT, matT)
    const fixedOf      = (c: SectionChild) => childFixed(c, slides)
    const sumSep       = kids.reduce<number>((a, _c, i) => a + sepThick(i), 0)
    const avail        = total - sumSep
    const lockedSum    = kids.reduce((a, c) => a + (fixedOf(c) ?? 0), 0)
    const unlockedCnt  = kids.filter(c => fixedOf(c) === null).length
    const naturalFlex  = unlockedCnt > 0 ? (avail - lockedSum) / unlockedCnt : 0
    if (naturalFlex > 0) {
      for (const c of kids) {
        if (fixedOf(c) === null && c.equalise_group) {
          const arr = candidates.get(c.equalise_group) ?? []
          arr.push(naturalFlex)
          candidates.set(c.equalise_group, arr)
        }
      }
    }
    let cursor = horiz ? box.y : box.x
    kids.forEach((c, i) => {
      const size = fixedOf(c) ?? Math.max(0, naturalFlex)
      const childBox: Box = horiz
        ? { x: box.x, y: cursor, w: box.w, h: size }
        : { x: cursor, y: box.y, w: size, h: box.h }
      walk(c.section, childBox)
      cursor += size + sepThick(i)
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
  slides:   SlideLite[],
  shelfT:   number,
  matT:     number,
): { seps: SepDisplay[]; leaves: LeafDisplay[]; groupSizes: Map<string, number> } {
  const seps:   SepDisplay[]  = []
  const leaves: LeafDisplay[] = []
  const groupSizes = computeGroupSizes(root, interior, slides, shelfT, matT)

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
        const openH = (box.h - n * shelfT) / (n + 1)
        if (openH > 0) adjEntries.forEach((e, i) => {
          const y = (e.f.y_locked && e.f.y_position !== undefined)
            ? e.f.y_position
            : box.y + (i + 1) * openH + i * shelfT
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
            : (loneUnlockedShelf ? box.y + box.h / 2 - shelfT / 2 : cursor)
          fittings.push({ type: 'fixed_shelf', idx, y, h: shelfT, labelH: shelfT, yLocked: !!f.y_locked })
          cursor = Math.max(cursor, y + shelfT + stackGap)
        }
      })

      leaves.push({ path, box, adjShelves, adjCount: n, fittings })
      return
    }

    const horiz = section.type === 'hsplit'
    const total = horiz ? box.h : box.w
    const kids  = section.children
    const N     = kids.length
    if (N === 0) return

    // Per-separator thickness: horizontal honours each child's separator type
    // ('none' = open gap = 0, and inferred 'none' around drawer bays); vertical
    // separators are always dividers.
    const sepThick = (i: number) => edGapT(kids, i, horiz, shelfT, matT)

    // Classify: locked (size set), auto-height drawer bay, grouped (resolved
    // group size), or free flex.
    const childResolved: (number | null)[] = kids.map(c => {
      if (c.size !== undefined) return c.size
      if (c.auto_height) {
        const h = autoBayHeightEd(c.section, slides)
        if (h != null && h > 0) return h
      }
      if (c.equalise_group) {
        const gs = groupSizes.get(c.equalise_group)
        if (gs !== undefined && gs > 0) return gs
      }
      return null
    })
    const sumSep       = kids.reduce<number>((a, _c, i) => a + sepThick(i), 0)
    const avail        = total - sumSep
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

      const st = sepThick(i)
      // 'none' separators (st === 0) carve no shelf and aren't draggable, so we
      // emit no SepDisplay — the two bays simply abut (e.g. above/below a drawer).
      if (i < N - 1 && st > 0) {
        seps.push({
          path, index: i, axis: horiz ? 'h' : 'v',
          kind: horiz ? (c.separator === 'adj_shelf' ? 'adj_shelf' : 'fixed_shelf') : 'divider',
          box: horiz ? { x: box.x, y: cursor + size, w: box.w, h: st }
                     : { x: cursor + size, y: box.y, w: st, h: box.h },
          childStart: cursor, splitEnd, sepT: st,
          locked: childResolved[i] !== null, equalised: !!c.equalise_group,
        })
      }
      cursor += size + st
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
// the leaf itself into two bays. `sep` is the divider placed between the two new
// bays (hsplit only): 'fixed_shelf' (default) or 'adj_shelf'.
function addSeparator(root: Section, path: Path, type: SplitSection['type'], sep?: SectionSeparator): Section {
  const parentPath = path.slice(0, -1)
  const idx        = path[path.length - 1]
  const parent     = path.length > 0 ? getSection(root, parentPath) : null

  if (parent && parent.type === type) {
    return updateAtPath(root, parentPath, s => {
      if (s.type !== type) return s
      const children = [...s.children]
      const orig = children[idx]
      // The new bay goes after `orig`. `orig`'s divider becomes `sep`; the new
      // bay inherits orig's old divider so the chain to the next bay is intact.
      const newChild: SectionChild = { ...newOpen(), ...(orig.separator ? { separator: orig.separator } : {}) }
      children[idx] = { ...orig, ...(sep ? { separator: sep } : { separator: undefined }) }
      children.splice(idx + 1, 0, newChild)
      return { ...s, children }
    })
  }
  return updateAtPath(root, path, s => {
    if (s.type !== 'open') return s
    // Preserve any existing contents: they move into the first bay and a new
    // empty bay is added after. Splitting an empty opening just makes two empty
    // bays. This stops a split from wiping drawers/shelves already placed here.
    const first: SectionChild = { section: s.fittings.length > 0 ? s : { type: 'open', fittings: [] }, ...(sep ? { separator: sep } : {}) }
    return { type, children: [first, newOpen()] }
  })
}

// Add a drawer / rollout as its own bay with an OPEN compartment above and below
// it (no shelves between — 'none' separators). The drawer bay is locked to a
// default height; the open bays fill the rest and can hold more.
function addDrawerBay(root: Section, path: Path, type: 'inner_drawer' | 'pull_out'): Section {
  return updateAtPath(root, path, s => {
    if (s.type !== 'open') return s
    // The drawer bay auto-sizes to the drawer's REAL height (explicit height or
    // chosen slide's box_height); the open bays above/below fill the rest.
    const below: SectionChild = { section: s.fittings.length > 0 ? s : { type: 'open', fittings: [] }, separator: 'none' }
    const drawerBay: SectionChild = { section: { type: 'open', fittings: [newFitting(type)] }, auto_height: true, separator: 'none' }
    const above: SectionChild = newOpen()
    return { type: 'hsplit', children: [below, drawerBay, above] }
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

// Delete the compartment at `path` from its parent split. The remaining bays
// close up; a split left with one child collapses to it; the root compartment
// just clears to empty.
function deleteCompartment(root: Section, path: Path): Section {
  if (path.length === 0) return EMPTY_SECTION
  const parentPath = path.slice(0, -1)
  const idx        = path[path.length - 1]
  return updateAtPath(root, parentPath, s => {
    if (s.type === 'open') return s
    const children = s.children.filter((_, i) => i !== idx)
    if (children.length === 0) return EMPTY_SECTION
    if (children.length === 1) return children[0].section
    return { ...s, children }
  })
}

// ── Types ──────────────────────────────────────────────────────────────────────

type Selection =
  | { kind: 'leaf';    path: Path }
  | { kind: 'sep';     path: Path; index: number }
  | { kind: 'fitting'; path: Path; fittingIndex: number }
  | null

type Menu =
  | { kind: 'leaf';    clientX: number; clientY: number; path: Path }
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
  // Undo / redo history of interior edits. Each entry snapshots the whole tree +
  // stack gap; commit() pushes the pre-change state. Capped to bound memory.
  const [undoStack, setUndoStack] = useState<{ tree: Section; stackGap: number }[]>([])
  const [redoStack, setRedoStack] = useState<{ tree: Section; stackGap: number }[]>([])

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

  const persist = (t: Section, g: number) =>
    onUpdate(cabinet.id, { internal_grid: { tree: t, stack_gap: g } as unknown as Record<string, unknown> })

  // Record the current state on the undo stack and clear redo. Called before any
  // tree / stack-gap change so it can be undone.
  function pushHistory() {
    setUndoStack(s => [...s, { tree, stackGap }].slice(-100))
    setRedoStack([])
  }

  async function save(next: Section) {
    pushHistory()
    setTree(next)
    await persist(next, stackGap)
  }

  // Persist a new stack gap. Same write shape as `save` so the JSONB blob keeps
  // both fields. Default (3mm) is stored explicitly so the resolver default and
  // the user's value are interchangeable; an empty input falls back to default.
  async function saveStackGap(next: number) {
    pushHistory()
    setStackGap(next)
    await persist(tree, next)
  }

  function undo() {
    if (undoStack.length === 0) return
    const prev = undoStack[undoStack.length - 1]
    setUndoStack(undoStack.slice(0, -1))
    setRedoStack(r => [...r, { tree, stackGap }].slice(-100))
    setTree(prev.tree); setStackGap(prev.stackGap)
    setSelected(null); setMenu(null)
    persist(prev.tree, prev.stackGap)
  }

  function redo() {
    if (redoStack.length === 0) return
    const nxt = redoStack[redoStack.length - 1]
    setRedoStack(redoStack.slice(0, -1))
    setUndoStack(u => [...u, { tree, stackGap }].slice(-100))
    setTree(nxt.tree); setStackGap(nxt.stackGap)
    setSelected(null); setMenu(null)
    persist(nxt.tree, nxt.stackGap)
  }

  // ── SVG geometry ─────────────────────────────────────────────────────────────
  const cabDX = cabinet.dx
  const cabDY = cabinet.dy
  // Real material thicknesses from the resolved cabinet so the preview matches
  // the built parts: carcass/divider thickness (matT) from a case panel, shelf
  // thickness (shelfT) from a resolved shelf. Fall back to 18mm before resolve.
  const lsPanel = rp?.case_parts.find(p => p.part_key === 'left_side')
  const rsPanel = rp?.case_parts.find(p => p.part_key === 'right_side')
  const matT = lsPanel?.DZ
    ?? rp?.case_parts.find(p => p.part_key === 'bottom')?.DZ
    ?? MAT_T
  const shelfT = rp?.internal_parts?.find(p => p.part_type === 'fixed_shelf' || p.part_type === 'adj_shelf')?.DZ
    ?? matT
  const T = matT
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
  const intX0 = lsPanel ? lsPanel.X + lsPanel.DZ : T
  const intW  = lsPanel && rsPanel ? Math.max(0, rsPanel.X - (lsPanel.X + lsPanel.DZ)) : cabDX - 2 * T
  const tkH   = toeH

  const interior: Box = { x: intX0, y: intY0, w: intW, h: intH }
  let layoutTree = tree
  if (dragLive) layoutTree = setChildSize(layoutTree, dragLive.path, dragLive.index, dragLive.size)
  if (fittingDragLive) layoutTree = patchFitting(layoutTree, fittingDragLive.path, fittingDragLive.fittingIndex,
    { y_locked: true, y_position: fittingDragLive.y } as Partial<InternalFitting>)
  const { seps, leaves } = computeLayout(layoutTree, interior, rp?.internal_parts, stackGap, slideProds, shelfT, matT)

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

  // Target compartment for toolbar actions: the selected compartment, else the
  // root if it's open.
  const targetPath: Path | null =
    selected?.kind === 'leaf' ? selected.path
    : (tree.type === 'open' ? [] : null)

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
    if (inAdj) return { y: inAdj.y, h: shelfT, labelH: shelfT }
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

  // Delete whatever is selected: a fitting → remove it; a shelf/divider → merge
  // its bays; a compartment → remove that bay from its split (root → clear).
  function deleteSelected() {
    if (!selected) return
    setMenu(null)
    if (selected.kind === 'fitting') {
      save(removeFittingAt(tree, selected.path, selected.fittingIndex))
      setSelected({ kind: 'leaf', path: selected.path })
    } else if (selected.kind === 'sep') {
      setSelected(null)
      save(deleteSep(tree, selected.path, selected.index))
    } else if (selected.kind === 'leaf') {
      setSelected(null)
      save(deleteCompartment(tree, selected.path))
    }
  }

  // Keyboard: Delete/Backspace removes the selection; Ctrl/Cmd+Z undoes,
  // Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redoes. A ref keeps the listener bound once
  // while always calling the latest handlers (which read current state).
  const keyActionsRef = useRef({ deleteSelected, undo, redo })
  useEffect(() => { keyActionsRef.current = { deleteSelected, undo, redo } })
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      const mod = e.ctrlKey || e.metaKey
      // Capture phase + stopImmediatePropagation so these take priority over the
      // canvas behind the modal (which has its own window-level undo/redo/delete
      // that would otherwise also act on the room / whole cabinet).
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault(); e.stopImmediatePropagation()
        if (e.shiftKey) keyActionsRef.current.redo(); else keyActionsRef.current.undo()
      } else if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault(); e.stopImmediatePropagation(); keyActionsRef.current.redo()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault(); e.stopImmediatePropagation(); keyActionsRef.current.deleteSelected()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

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

  // Commit a typed size (a value fixes/locks the opening; empty/invalid clears
  // the lock so it fills the remaining space). Clears any equalise membership.
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

    // An auto-height drawer/rollout bay is sized by its drawer — show the value
    // read-only; you change it by editing the drawer's height/slide.
    if (child.auto_height) {
      return (
        <div className="mt-3 border-t border-gray-800 pt-2">
          <p className="uppercase tracking-wider text-gray-500 mb-1.5">Opening size</p>
          <p className="text-gray-400">Height {Math.round(curExtent)} mm</p>
          <p className="text-[9px] text-gray-600 mt-0.5">Auto — matches the drawer’s height. Change it on the drawer (height / slide).</p>
        </div>
      )
    }
    return (
      <div className="mt-3 border-t border-gray-800 pt-2">
        <p className="uppercase tracking-wider text-gray-500 mb-1.5">Opening size</p>

        {/* Size field — type a fixed mm value (locks the opening) or clear it to
            let the opening fill the remaining space. Disabled while equalised
            (the group governs the size). */}
        <label className="block mb-1.5">
          <span className="block text-gray-500 mb-1">{axis === 'v' ? 'Width' : 'Height'} (mm)</span>
          <div className="flex items-center gap-1">
            <input type="number" min={1} step={1}
              key={`leaf-size-${path.join('.')}-${child.size ?? ''}-${equalised ? 'eq' : ''}`}
              defaultValue={child.size ?? ''}
              disabled={equalised}
              placeholder={`${Math.round(curExtent)}${equalised ? '' : ' · fills'}`}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              onBlur={e => setLeafLockSize(path, e.target.value)}
              className={inp + (equalised ? ' opacity-40 cursor-not-allowed' : '')}
              title={equalised
                ? 'Size is set by the equalise group — untick Equalise to type a fixed size.'
                : 'Type a fixed size in mm, or clear to let this opening fill the remaining space.'}
            />
            <span className="text-gray-500">mm</span>
            {locked && <span className="text-amber-400" title="Fixed size">⚲</span>}
          </div>
        </label>

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

  // Dispatch an "add element" choice for an opening. Every horizontal element
  // splits the opening into real compartments:
  //   • fixed / adjustable shelf → top + bottom bays, the shelf as the divider
  //   • inner drawer / rollout   → open bay, drawer bay, open bay (no shelves)
  //   • accessory                → an occupant placed in the opening (no split)
  function runAdd(path: Path, kind: AddKind) {
    if (kind === 'fixed_shelf')      { save(addSeparator(tree, path, 'hsplit', 'fixed_shelf')); setMenu(null) }
    else if (kind === 'adj_shelf')   { save(addSeparator(tree, path, 'hsplit', 'adj_shelf'));  setMenu(null) }
    else if (kind === 'inner_drawer' || kind === 'pull_out') { save(addDrawerBay(tree, path, kind)); setMenu(null) }
    else                             handleAddFitting(path, kind)   // accessory
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
          {selected?.kind === 'leaf' ? 'Selected compartment:'
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
        <button className={addBtn} disabled={!targetPath}
          onClick={() => targetPath && runAdd(targetPath, 'adj_shelf')}
          title="Add an adjustable shelf — splits the opening into a top and bottom compartment.">+ Adj shelf</button>
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
          <button className={addBtn} disabled={undoStack.length === 0} onClick={undo}
            title="Undo (Ctrl/Cmd+Z)">↶ Undo</button>
          <button className={addBtn} disabled={redoStack.length === 0} onClick={redo}
            title="Redo (Ctrl/Cmd+Shift+Z)">↷ Redo</button>
          <button
            className={'px-2 py-0.5 rounded text-[10px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ' +
              (selected ? 'bg-red-900/50 hover:bg-red-900/70 text-red-300' : 'bg-gray-700 text-gray-300')}
            disabled={!selected}
            onClick={deleteSelected}
            title="Delete the selected compartment / shelf / fitting (Delete)">🗑 Delete</button>
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
                  {/* The compartment — one clickable rect. Click selects it (so
                      its Lock / Equalise + Add-element controls show); right-click
                      opens its menu. Shelves and content are drawn on top. */}
                  <rect
                    x={ox + leaf.box.x} y={svgY(leaf.box.y + leaf.box.h)}
                    width={leaf.box.w} height={leaf.box.h}
                    fill={isSel ? 'rgba(59,130,246,0.10)' : (groupId ? `${groupColor(groupId)}14` : 'transparent')}
                    stroke={isSel ? '#3b82f6' : (groupId ? groupColor(groupId) : 'none')}
                    strokeWidth={isSel ? 1.5 : (groupId ? 1 : 0)}
                    strokeDasharray={!isSel && groupId ? '3 3' : undefined}
                    style={{ cursor: 'pointer' }}
                    onClick={e => {
                      e.stopPropagation(); setMenu(null)
                      setSelected(isSel ? null : { kind: 'leaf', path: leaf.path })
                    }}
                    onContextMenu={e => {
                      e.preventDefault(); e.stopPropagation()
                      setSelected({ kind: 'leaf', path: leaf.path })
                      setMenu({ kind: 'leaf', clientX: e.clientX, clientY: e.clientY, path: leaf.path })
                    }}
                  />
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
                        onMouseDown={e => startFittingDrag(e, leaf, { idx: adj.fittingIdx, y: adj.y, h: shelfT, yLocked: adj.yLocked })}
                        onClick={e => {
                          e.stopPropagation()
                          if (wasDragging.current) { wasDragging.current = false; return }
                          setMenu(null)
                          setSelected({ kind: 'fitting', path: leaf.path, fittingIndex: adj.fittingIdx })
                        }}
                        style={{ cursor: adj.yLocked ? 'not-allowed' : (isDragA ? 'grabbing' : 'grab') }}
                      >
                        <rect
                          x={ox + leaf.box.x + ADJ_INSET} y={svgY(adj.y + shelfT)}
                          width={w} height={shelfT}
                          fill={isSelA ? '#312e81' : '#1e1b4b'}
                          stroke={isSelA ? '#818cf8' : '#4338ca'}
                          strokeWidth={isSelA ? 1.5 : 1}
                          strokeDasharray="4 2"
                        />
                        {w > 60 && (
                          <text x={ox + leaf.box.x + leaf.box.w / 2} y={svgY(adj.y + shelfT / 2)}
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

            {/* Separators — fixed shelves, adjustable shelves (h) and dividers (v) */}
            {seps.map(sep => {
              const isSel = selected?.kind === 'sep' && pathEq(selected.path, sep.path) && selected.index === sep.index
              const live  = dragLive && pathEq(dragLive.path, sep.path) && dragLive.index === sep.index
              // Colour by separator kind: fixed shelf = purple, adjustable shelf =
              // indigo dashed, divider = grey.
              const fill =
                sep.kind === 'adj_shelf'   ? (isSel ? '#312e81' : '#1e1b4b')
                : sep.kind === 'fixed_shelf' ? (isSel ? '#4a1d96' : '#2e1065')
                : (isSel ? '#1c1917' : '#111827')
              const stroke =
                sep.kind === 'adj_shelf'   ? (isSel ? '#818cf8' : '#4338ca')
                : sep.kind === 'fixed_shelf' ? (isSel ? '#c084fc' : '#7c3aed')
                : (isSel ? '#a8a29e' : '#4b5563')
              const labelFill = sep.kind === 'adj_shelf' ? '#a5b4fc' : '#a78bfa'
              const baseLabel = sep.kind === 'adj_shelf' ? 'adj shelf' : 'shelf'
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
                    strokeDasharray={sep.kind === 'adj_shelf' ? '4 2' : undefined}
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
                      fontSize={Math.min(13, sep.box.h * 0.72)} fill={isSel ? '#e9d5ff' : labelFill}
                      fontFamily="system-ui,sans-serif" style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >{sep.equalised ? `${baseLabel} =` : sep.locked ? `${baseLabel} ⚲` : baseLabel}</text>
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
              <p className={`uppercase tracking-wider mb-2 ${selSep.kind === 'adj_shelf' ? 'text-indigo-400' : selSep.axis === 'h' ? 'text-violet-400' : 'text-gray-300'}`}>
                {selSep.kind === 'adj_shelf' ? 'Adjustable shelf' : selSep.axis === 'h' ? 'Fixed shelf' : 'Divider'}
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

          {!isEmpty && !selLeaf && !selSep && !selFittingData && (
            <p className="text-gray-600">Click a compartment to add elements or lock/equalise it, or click a shelf/divider/fitting to edit it.</p>
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
