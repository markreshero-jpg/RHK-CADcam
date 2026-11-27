// Cabinet interiors and hinges for the AI helper (z_ai_helper Q4). Pure — no DB.
//
// Interior: the cabinet's section tree (internal_grid.tree, z types.ts "Internal
// section tree"). The AI sees it as numbered bays — "2.1" = the first child of bay 2,
// bottom → top in a shelf split, left → right in a divider split — and edits it
// with the same moves as the canvas Interior editor (InternalGridEditor.tsx
// addSeparator / setChildSize / setAdjCount / deleteSep / deleteCompartment).
//
// Hinges: a door's manual hinge list (face_grid zone.hinges, mm from the door
// bottom) laid out the way resolveHinges lays out the shop rules, with the rule's
// insets for that door height.

import { EMPTY_SECTION, type HingeRuleInput, type InternalFitting, type Section, type SectionChild, type SectionSeparator } from '@/src/lib/resolver/types'

type Path = number[]   // 0-based child indexes from the root

// ── Reading ───────────────────────────────────────────────────────────────────

const SEP_WORD: Record<SectionSeparator, string> = { fixed_shelf: 'fixed shelf', adj_shelf: 'adjustable shelf', none: 'no shelf (open)' }

/** Resolved drawer fronts, bottom → top, for the detail readout (internal_parts inner_drawer_front: y, dx = height). */
export interface ResolvedDrawerFront { y: number; h: number }

const r1 = (n: number) => Math.round(n * 10) / 10

function drawerWord(f: InternalFitting, front?: ResolvedDrawerFront, frontOffset = 0): string {
  const name = f.type === 'inner_drawer' ? 'inner drawer' : 'rollout'
  const d = f as { y_locked?: boolean; y_position?: number; height?: number }
  const bits = [
    d.y_locked && d.y_position != null ? `box bottom ${r1(d.y_position)} (locked)`
      : front ? `box bottom auto, ${r1(front.y - frontOffset)} as resolved` : 'box bottom auto',
    d.height != null ? `box ${r1(d.height)} high` : '',
    front ? `front as resolved ${r1(front.y)}–${r1(front.y + front.h)} (${r1(front.h)} high)` : '',
  ].filter(Boolean)
  return `${name} [${bits.join(', ')}]`
}

function fittingWord(f: InternalFitting): string {
  if (f.type === 'inner_drawer') return 'inner drawer'
  if (f.type === 'pull_out') return 'rollout'
  if (f.type === 'fixed_shelf') return 'fixed shelf (loose, inside the bay)'
  if (f.type === 'accessory') return f.key?.includes('RAIL') || f.product_id ? 'hanging rail' : `accessory${f.key ? ` ${f.key}` : ''}`
  return 'adjustable shelf'
}

const isDrawer = (f: InternalFitting) => f.type === 'inner_drawer' || f.type === 'pull_out'

function contents(s: Section, fronts?: () => ResolvedDrawerFront | undefined, frontOffset = 0): string {
  if (s.type !== 'open') return s.type === 'hsplit' ? 'split by shelves:' : 'split by dividers:'
  const adj = s.fittings.filter(f => f.type === 'adj_shelf').length
  const rest = s.fittings.filter(f => f.type !== 'adj_shelf').map(f =>
    !fronts ? fittingWord(f) : isDrawer(f) ? drawerWord(f, f.type === 'inner_drawer' ? fronts() : undefined, frontOffset) : fittingWord(f))
  const parts = [...(adj ? [`${adj} adjustable shel${adj === 1 ? 'f' : 'ves'}`] : []), ...rest]
  return parts.length ? parts.join(', ') : 'empty'
}

function sizeWord(c: SectionChild, axis: 'h' | 'v'): string {
  if (c.auto_height) return 'sized to its drawer'
  const eg = c.equalise_group ? ` (equal group ${c.equalise_group})` : ''
  return (c.size != null ? `${c.size} ${axis === 'h' ? 'high' : 'wide'}` : 'fills the rest') + eg
}

/** Inner drawers in tree order; true when every one sits in a shelf-split chain (so tree order = bottom → top). */
function innerDrawerOrder(root: Section): { count: number; stacked: boolean } {
  let count = 0, stacked = true
  const walk = (s: Section, underV: boolean) => {
    if (s.type === 'open') { const n = s.fittings.filter(f => f.type === 'inner_drawer').length; count += n; if (n > 1 || (n && underV)) stacked = false; return }
    s.children.forEach(c => walk(c.section, underV || s.type === 'vsplit'))
  }
  walk(root, false)
  return { count, stacked }
}

/** The interior as numbered bays for the AI (get_cabinet_detail). `fronts` = the resolved
 *  inner drawer fronts (any order); shown against each drawer when they can be matched. */
export function renderInterior(raw: unknown, fronts?: ResolvedDrawerFront[]): string[] {
  const root = asTree(raw)
  const order = innerDrawerOrder(root)
  const sorted = [...(fronts ?? [])].sort((a, b) => a.y - b.y)
  let next = 0
  const matched = !!fronts && order.stacked && sorted.length === order.count
  const pick = matched ? () => sorted[next++] : fronts ? () => undefined : undefined
  // The front sits off the box bottom by the shop's IDB_FRONT_BOTTOM_ADJUST: read it off a locked drawer.
  let off = 0
  if (matched) {
    const inner: InternalFitting[] = []
    const all = (s: Section): void => { if (s.type === 'open') inner.push(...s.fittings.filter(f => f.type === 'inner_drawer')); else s.children.forEach(c => all(c.section)) }
    all(root)
    const i = inner.findIndex(f => (f as { y_locked?: boolean; y_position?: number }).y_locked && (f as { y_position?: number }).y_position != null)
    if (i >= 0) off = r1(sorted[i].y - (inner[i] as { y_position: number }).y_position)
  }
  if (root.type === 'open') return [`Bay 0 (the whole interior): ${contents(root, pick, off)}`]
  const out: string[] = [`Bay 0 (the whole interior): ${contents(root, pick, off)}`]
  const walk = (s: Section, prefix: string, depth: number) => {
    if (s.type === 'open') return
    const axis = s.type === 'hsplit' ? 'h' : 'v'
    s.children.forEach((c, i) => {
      const path = prefix ? `${prefix}.${i + 1}` : `${i + 1}`
      const pad = '  '.repeat(depth)
      out.push(`${pad}Bay ${path} — ${sizeWord(c, axis)}: ${contents(c.section, pick, off)}`)
      walk(c.section, path, depth + 1)
      if (i < s.children.length - 1) {
        out.push(axis === 'h'
          ? `${pad}  ↑ above bay ${path}: ${SEP_WORD[c.separator ?? 'fixed_shelf']}`
          : `${pad}  → right of bay ${path}: ${c.divider === 'double' ? 'double divider' : 'divider'}`)
      }
    })
  }
  walk(root, '', 1)
  return out
}

/** One-line summary for a change line: top-level bays bottom → top. */
export function shortInterior(raw: unknown): string {
  const root = asTree(raw)
  // Every drawer / rollout in tree order: box bottom (or auto) and box height when set.
  const ds: string[] = []
  const walk = (s: Section) => s.type === 'open'
    ? s.fittings.filter(isDrawer).forEach(f => {
      const d = f as { type: string; y_locked?: boolean; y_position?: number; height?: number }
      ds.push(`${d.type === 'pull_out' ? 'rollout' : 'drawer'} ${d.y_locked && d.y_position != null ? `at ${r1(d.y_position)}` : 'auto'}${d.height != null ? ` ${r1(d.height)} high` : ''}`)
    })
    : s.children.forEach(c => walk(c.section))
  walk(root)
  const tail = ds.length ? ` · ${ds.join(', ')}` : ''
  if (root.type === 'open') return `[${contents(root)}]${tail}`
  const axis = root.type === 'hsplit' ? 'h' : 'v'
  return root.children.map((c, i) => {
    const sz = c.auto_height ? 'drawer bay' : c.size != null ? String(c.size) : 'fill'
    const what = c.section.type === 'open' ? contents(c.section) : c.section.type === 'hsplit' ? 'shelves' : 'dividers'
    const sep = i < root.children.length - 1 ? (axis === 'h' ? ` ${c.separator === 'adj_shelf' ? '‑adj‑' : c.separator === 'none' ? '·' : '═'} ` : ' | ') : ''
    return `[${sz}${what === 'empty' ? '' : ` ${what}`}]${sep}`
  }).join('') + tail
}

function asTree(raw: unknown): Section {
  const t = (raw as { tree?: unknown } | null)?.tree
  return t && typeof t === 'object' && 'type' in (t as object) ? t as Section : EMPTY_SECTION
}

// ── Editing ───────────────────────────────────────────────────────────────────

export type InteriorAction =
  /** A bay's height (shelf split) / width (divider split); null = fills the rest. */
  | { do: 'size'; bay: string; size: number | null }
  /** How many adjustable shelves in an open bay (0 removes them). */
  | { do: 'adj_shelves'; bay: string; count: number }
  /** A fixed (or adjustable) shelf across an open bay, `below` mm above the bay's bottom (else halfway). */
  | { do: 'add_shelf'; bay: string; kind?: 'fixed' | 'adjustable'; below?: number }
  /** What sits above a bay in a shelf split: fixed shelf, adjustable shelf, or nothing (open). */
  | { do: 'shelf_type'; bay: string; kind: 'fixed' | 'adjustable' | 'none' }
  /** Take out the shelf above a bay (it and the bay above become one). */
  | { do: 'remove_shelf'; bay: string }
  /** A divider up through an open bay, `left` mm wide on its left (else halfway). */
  | { do: 'add_divider'; bay: string; left?: number }
  /** Take a bay out; the rest close up. */
  | { do: 'remove_bay'; bay: string }
  /** An inner drawer / rollout in an open bay, as the Interior editor adds one: its own bay sized
   *  to the drawer, open bays below and above with no shelf between. below = height of the space under it
   *  (0 = it sits on the bay's bottom; leave out = halfway, as the editor does); height = box height. */
  | { do: 'add_drawer'; bay: string; drawer?: 'inner' | 'rollout'; height?: number; below?: number }
  /** The drawer / rollout in a bay: up = move it by this much (negative = down), as the editor's
   *  gap drag does it (the bay under it grows); bottom = its box bottom, mm from the cabinet bottom (locks it;
   *  null = back to auto); height = box height (null = from the slide / construction). */
  | { do: 'move_drawer'; bay: string; up?: number; bottom?: number | null; height?: number | null }
  /** Take the drawer / rollout out of a bay; empty open bays either side close up. */
  | { do: 'remove_drawer'; bay: string }

function parseBay(bay: string): Path | null {
  const b = String(bay).trim()
  if (b === '0' || b === '') return []
  if (!/^\d+(\.\d+)*$/.test(b)) return null
  const p = b.split('.').map(n => Number(n) - 1)
  return p.some(n => n < 0) ? null : p
}

function getSection(root: Section, path: Path): Section | null {
  let cur: Section = root
  for (const i of path) {
    if (cur.type === 'open') return null
    const child: SectionChild | undefined = cur.children[i]
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

/** As the editor's addSeparator: a sibling bay in a same-way split, else split the bay in two. Returns the new tree and the path of the lower / left bay. */
function addSeparator(root: Section, path: Path, type: 'hsplit' | 'vsplit', sep?: SectionSeparator): { tree: Section; first: Path } {
  const parentPath = path.slice(0, -1)
  const idx = path[path.length - 1]
  const parent = path.length > 0 ? getSection(root, parentPath) : null
  if (parent && parent.type === type) {
    const tree = updateAtPath(root, parentPath, s => {
      if (s.type !== type) return s
      const children = [...s.children]
      const orig = children[idx]
      const added: SectionChild = { ...newOpen(), ...(orig.separator ? { separator: orig.separator } : {}) }
      children[idx] = { ...orig, ...(sep ? { separator: sep } : { separator: undefined }) }
      children.splice(idx + 1, 0, added)
      return { ...s, children }
    })
    return { tree, first: path }
  }
  const tree = updateAtPath(root, path, s => {
    if (s.type !== 'open') return s
    const first: SectionChild = { section: s.fittings.length > 0 ? s : { type: 'open', fittings: [] }, ...(sep ? { separator: sep } : {}) }
    return { type, children: [first, newOpen()] }
  })
  return { tree, first: [...path, 0] }
}

function setChildSize(root: Section, path: Path, size: number | null): Section {
  const parentPath = path.slice(0, -1), index = path[path.length - 1]
  return updateAtPath(root, parentPath, s => s.type === 'open' ? s : {
    ...s, children: s.children.map((c, i) => {
      if (i !== index) return c
      const { size: _old, auto_height: _auto, ...rest } = c
      return size == null ? rest : { ...rest, size: Math.max(1, Math.round(size * 10) / 10) }
    }),
  })
}

const SEP_OF: Record<'fixed' | 'adjustable' | 'none', SectionSeparator> = { fixed: 'fixed_shelf', adjustable: 'adj_shelf', none: 'none' }

/** Apply the AI's interior moves in order; any bad bay number stops with an error. */
export function applyInteriorActions(raw: unknown, actions: InteriorAction[]): { grid: Record<string, unknown> } | { error: string } {
  const grid = { ...((raw ?? {}) as Record<string, unknown>) }
  let tree = asTree(raw)
  for (const [n, a] of actions.entries()) {
    const at = `Interior move ${n + 1} (${a.do} bay ${a.bay})`
    const path = parseBay(a.bay)
    if (!path) return { error: `${at}: bay must be a number like 2 or 2.1 (0 = the whole interior).` }
    const here = getSection(tree, path)
    if (!here) return { error: `${at}: no such bay. ${renderInterior({ tree }).join(' / ')}` }
    const parent = path.length ? getSection(tree, path.slice(0, -1)) : null
    if (a.do === 'size') {
      if (!parent || parent.type === 'open') return { error: `${at}: bay 0 is the whole interior — its size follows the cabinet.` }
      if (a.size != null && !(a.size > 0 && a.size < 4000)) return { error: `${at}: size must be 1–4000 mm, or null to fill.` }
      tree = setChildSize(tree, path, a.size)
    } else if (a.do === 'adj_shelves') {
      if (here.type !== 'open') return { error: `${at}: that bay is split — pick one of its bays.` }
      if (!(Number.isInteger(a.count) && a.count >= 0 && a.count <= 20)) return { error: `${at}: count must be 0–20.` }
      tree = updateAtPath(tree, path, s => {
        if (s.type !== 'open') return s
        const existing = s.fittings.filter(f => f.type === 'adj_shelf')
        const others = s.fittings.filter(f => f.type !== 'adj_shelf')
        const adj: InternalFitting[] = Array.from({ length: a.count }, (_, i) => existing[i] ?? { type: 'adj_shelf', y_locked: false })
        return { type: 'open', fittings: [...adj, ...others] }
      })
    } else if (a.do === 'add_shelf' || a.do === 'add_divider') {
      if (here.type !== 'open') return { error: `${at}: that bay is split — pick one of its bays.` }
      const r = a.do === 'add_shelf'
        ? addSeparator(tree, path, 'hsplit', a.kind === 'adjustable' ? 'adj_shelf' : 'fixed_shelf')
        : addSeparator(tree, path, 'vsplit')
      tree = r.tree
      const below = a.do === 'add_shelf' ? a.below : a.left
      if (below != null) {
        if (!(below > 0 && below < 4000)) return { error: `${at}: the size of the bay ${a.do === 'add_shelf' ? 'below the shelf' : 'left of the divider'} must be 1–4000 mm.` }
        tree = setChildSize(tree, r.first, below)
      }
    } else if (a.do === 'shelf_type') {
      if (!parent || parent.type !== 'hsplit') return { error: `${at}: only bays in a shelf split have a shelf above them.` }
      const idx = path[path.length - 1]
      if (idx >= parent.children.length - 1) return { error: `${at}: that's the top bay — nothing above it.` }
      tree = updateAtPath(tree, path.slice(0, -1), s => s.type === 'open' ? s : { ...s, children: s.children.map((c, i) => i === idx ? { ...c, separator: SEP_OF[a.kind] } : c) })
    } else if (a.do === 'remove_shelf') {
      if (!parent || parent.type !== 'hsplit') return { error: `${at}: only bays in a shelf split have a shelf above them.` }
      const idx = path[path.length - 1]
      if (idx >= parent.children.length - 1) return { error: `${at}: that's the top bay — nothing above it.` }
      const pa = path.slice(0, -1)
      tree = updateAtPath(tree, pa, s => {
        if (s.type === 'open') return s
        // Like the editor's deleteSep, but the two bays' contents stay (merged) instead of emptying.
        const lo = s.children[idx], hi = s.children[idx + 1]
        const merged: SectionChild = {
          ...(hi.separator ? { separator: hi.separator } : {}),
          section: lo.section.type === 'open' && hi.section.type === 'open'
            ? { type: 'open', fittings: [...lo.section.fittings, ...hi.section.fittings] }
            : lo.section.type === 'open' && !lo.section.fittings.length ? hi.section
            : hi.section.type === 'open' && !hi.section.fittings.length ? lo.section
            : { type: 'open', fittings: [] },
        }
        const children = [...s.children.slice(0, idx), merged, ...s.children.slice(idx + 2)]
        return children.length === 1 ? children[0].section : { ...s, children }
      })
    } else if (a.do === 'remove_bay') {
      if (!path.length) tree = EMPTY_SECTION
      else tree = updateAtPath(tree, path.slice(0, -1), s => {
        if (s.type === 'open') return s
        const children = s.children.filter((_, i) => i !== path[path.length - 1])
        return !children.length ? EMPTY_SECTION : children.length === 1 ? children[0].section : { ...s, children }
      })
    } else if (a.do === 'add_drawer') {
      if (here.type !== 'open') return { error: `${at}: that bay is split — pick one of its bays.` }
      if (a.height != null && !(a.height >= 40 && a.height <= 600)) return { error: `${at}: box height must be 40–600 mm.` }
      if (a.below != null && !(a.below >= 0 && a.below < 4000)) return { error: `${at}: below must be 0–4000 mm (0 = on the bay's bottom).` }
      const f = {
        type: a.drawer === 'rollout' ? 'pull_out' : 'inner_drawer',
        y_locked: false,
        ...(a.height != null ? { height: r1(a.height) } : {}),
      } as InternalFitting
      const drawerBay: SectionChild = { section: { type: 'open', fittings: [f] }, auto_height: true, separator: 'none' }
      tree = updateAtPath(tree, path, s => s.type !== 'open' ? s : {
        type: 'hsplit', children: a.below === 0
          // On the bay's bottom: what was in the bay goes above it.
          ? [drawerBay, { section: s }]
          : [{ section: s, separator: 'none', ...(a.below != null ? { size: r1(a.below) } : {}) }, drawerBay, newOpen()],
      })
    } else if (a.do === 'move_drawer' || a.do === 'remove_drawer') {
      if (here.type !== 'open') return { error: `${at}: that bay is split — give the bay the drawer itself is in.` }
      const ds = here.fittings.filter(isDrawer)
      if (ds.length !== 1) return { error: `${at}: ${ds.length ? `bay ${a.bay} holds ${ds.length} drawers / rollouts — this move needs a bay with one` : `there's no drawer or rollout in bay ${a.bay}`}. ${renderInterior({ tree }).join(' / ')}` }
      if (a.do === 'move_drawer') {
        if (a.bottom === undefined && a.height === undefined && a.up === undefined) return { error: `${at}: give up, bottom and / or height.` }
        if (a.up != null && a.bottom != null) return { error: `${at}: give up OR bottom, not both.` }
        if (a.up != null && !(Math.abs(a.up) > 0 && Math.abs(a.up) < 2000)) return { error: `${at}: up must be a non-zero amount in mm (negative = down).` }
        if (a.bottom != null && !(a.bottom >= 0 && a.bottom < 4000)) return { error: `${at}: bottom must be 0–4000 mm from the cabinet bottom.` }
        if (a.height != null && !(a.height >= 40 && a.height <= 600)) return { error: `${at}: box height must be 40–600 mm.` }
        const df = here.fittings.find(isDrawer) as { y_locked?: boolean; y_position?: number }
        const locked = !!df.y_locked && df.y_position != null
        if (a.up != null) {
          // As dragging the gap in the Interior editor: the drawer's own bay (sized to the drawer)
          // moves when the bay under it grows — or a sized bay above it shrinks.
          const idx = path[path.length - 1]
          const inAuto = parent?.type === 'hsplit' && parent.children[idx]?.auto_height
          const below = inAuto ? parent.children[idx - 1] : undefined
          const above = inAuto ? parent.children[idx + 1] : undefined
          const nb = below?.size != null ? below.size + a.up : null
          const na = nb == null && above?.size != null ? above.size - a.up : null
          if (nb != null || na != null) {
            if ((nb ?? na)! < 1) return { error: `${at}: that's more room than there is — the bay ${nb != null ? 'under' : 'over'} it is only ${(nb != null ? below!.size : above!.size)} high.` }
            tree = setChildSize(tree, nb != null ? [...path.slice(0, -1), idx - 1] : [...path.slice(0, -1), idx + 1], nb ?? na)
          } else if (!locked) {
            return { error: `${at}: the drawer is on auto and neither bay next to it has a size — give bottom (its box bottom as resolved + the move) instead.` }
          }
        }
        tree = updateAtPath(tree, path, s => s.type !== 'open' ? s : {
          ...s, fittings: s.fittings.map(f => {
            if (!isDrawer(f)) return f
            const g = { ...f } as Record<string, unknown>
            if (a.up != null && locked) g.y_position = r1(Number(g.y_position) + a.up)
            if (a.bottom === null) { g.y_locked = false; delete g.y_position }
            else if (a.bottom !== undefined) { g.y_locked = true; g.y_position = r1(a.bottom) }
            if (a.height === null) delete g.height
            else if (a.height !== undefined) g.height = r1(a.height)
            return g as unknown as InternalFitting
          }),
        })
      } else {
        tree = updateAtPath(tree, path, s => s.type !== 'open' ? s : { ...s, fittings: s.fittings.filter(f => !isDrawer(f)) })
        if (path.length) {
          const parentPath = path.slice(0, -1), idx = path[path.length - 1]
          tree = updateAtPath(tree, parentPath, s => {
            if (s.type !== 'hsplit') return s
            // The drawer's own bay goes (if now empty), then open bays joined with no shelf merge.
            let kids = s.children.filter((c, i) => !(i === idx && c.auto_height && c.section.type === 'open' && !c.section.fittings.length))
            const merged: SectionChild[] = []
            for (const c of kids) {
              const prev = merged[merged.length - 1]
              if (prev && prev.separator === 'none' && prev.section.type === 'open' && c.section.type === 'open' && !prev.auto_height && !c.auto_height) {
                merged[merged.length - 1] = { ...(c.separator ? { separator: c.separator } : {}), section: { type: 'open', fittings: [...prev.section.fittings, ...c.section.fittings] } }
              } else merged.push(c)
            }
            kids = merged
            return kids.length === 1 ? kids[0].section : { ...s, children: kids }
          })
        }
      }
    } else return { error: `${at}: unknown move "${(a as { do: string }).do}".` }
  }
  grid.tree = tree
  return { grid }
}

// ── Hinges ────────────────────────────────────────────────────────────────────

const DEFAULT_INSET = 100

/** Hinge positions (mm from the door bottom, ascending) for `count` hinges on a door `span` long,
 *  using the shop rule's insets for that height — as resolveHinges spaces them. */
export function hingePositions(count: number, span: number, rules: HingeRuleInput[]): number[] {
  const sorted = [...rules].sort((a, b) => a.max_height_mm - b.max_height_mm)
  const hit = sorted.find(r => span <= r.max_height_mm) ?? sorted[sorted.length - 1]
  const top = hit?.top_inset_mm ?? DEFAULT_INSET, bottom = hit?.bottom_inset_mm ?? DEFAULT_INSET
  if (count <= 0) return []
  const far = span - top, near = bottom
  if (count === 1) return [near]
  const out: number[] = []
  for (let i = 0; i < count; i++) out.push(Math.round((near + ((far - near) * i) / (count - 1)) * 10) / 10)
  return out
}
