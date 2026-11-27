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

function fittingWord(f: InternalFitting): string {
  if (f.type === 'inner_drawer') return 'inner drawer'
  if (f.type === 'pull_out') return 'rollout'
  if (f.type === 'fixed_shelf') return 'fixed shelf (loose, inside the bay)'
  if (f.type === 'accessory') return f.key?.includes('RAIL') || f.product_id ? 'hanging rail' : `accessory${f.key ? ` ${f.key}` : ''}`
  return 'adjustable shelf'
}

function contents(s: Section): string {
  if (s.type !== 'open') return s.type === 'hsplit' ? 'split by shelves:' : 'split by dividers:'
  const adj = s.fittings.filter(f => f.type === 'adj_shelf').length
  const rest = s.fittings.filter(f => f.type !== 'adj_shelf').map(fittingWord)
  const parts = [...(adj ? [`${adj} adjustable shel${adj === 1 ? 'f' : 'ves'}`] : []), ...rest]
  return parts.length ? parts.join(', ') : 'empty'
}

function sizeWord(c: SectionChild, axis: 'h' | 'v'): string {
  if (c.auto_height) return 'sized to its drawer'
  const eg = c.equalise_group ? ` (equal group ${c.equalise_group})` : ''
  return (c.size != null ? `${c.size} ${axis === 'h' ? 'high' : 'wide'}` : 'fills the rest') + eg
}

/** The interior as numbered bays for the AI (get_cabinet_detail). */
export function renderInterior(raw: unknown): string[] {
  const root = asTree(raw)
  if (root.type === 'open') return [`Bay 0 (the whole interior): ${contents(root)}`]
  const out: string[] = [`Bay 0 (the whole interior): ${contents(root)}`]
  const walk = (s: Section, prefix: string, depth: number) => {
    if (s.type === 'open') return
    const axis = s.type === 'hsplit' ? 'h' : 'v'
    s.children.forEach((c, i) => {
      const path = prefix ? `${prefix}.${i + 1}` : `${i + 1}`
      const pad = '  '.repeat(depth)
      out.push(`${pad}Bay ${path} — ${sizeWord(c, axis)}: ${contents(c.section)}`)
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
  if (root.type === 'open') return `[${contents(root)}]`
  const axis = root.type === 'hsplit' ? 'h' : 'v'
  return root.children.map((c, i) => {
    const sz = c.auto_height ? 'drawer bay' : c.size != null ? String(c.size) : 'fill'
    const what = c.section.type === 'open' ? contents(c.section) : c.section.type === 'hsplit' ? 'shelves' : 'dividers'
    const sep = i < root.children.length - 1 ? (axis === 'h' ? ` ${c.separator === 'adj_shelf' ? '‑adj‑' : c.separator === 'none' ? '·' : '═'} ` : ' | ') : ''
    return `[${sz}${what === 'empty' ? '' : ` ${what}`}]${sep}`
  }).join('')
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
