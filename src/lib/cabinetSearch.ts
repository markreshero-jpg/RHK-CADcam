// ============================================================
// Cabinet library search — one matcher for every library search box
// (canvas sidebar, Replace Cabinet modal, /library/cabinets).
//
// Every word typed must match somewhere (AND), across the code (name),
// description, assembly class and category path. Plurals are folded
// ("panels" finds "panel"). Results rank code hits above description hits,
// so searching "d3" lists D3-SLL before anything that merely mentions it.
// ============================================================

export interface SearchableDef {
  name: string
  description?: string | null
  assembly_class?: string | null
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Query → lowercase words, trailing plural "s" dropped from longer words. */
export function searchTokens(query: string): string[] {
  return norm(query).split(' ').filter(Boolean)
    .map(t => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t))
}

/** True when `t` occurs at the start of some word in `text`. */
const startsWord = (text: string, t: string) =>
  new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text)

/**
 * Score a definition against pre-tokenised words. 0 = no match (some word
 * missed every field); higher = better. `path` is the category breadcrumb.
 */
export function scoreDef(d: SearchableDef, tokens: string[], path = ''): number {
  if (tokens.length === 0) return 1
  const name = norm(d.name)
  const desc = norm(d.description ?? '')
  const cls  = norm(d.assembly_class ?? '')
  const cat  = norm(path)
  let total = 0
  for (const t of tokens) {
    let s = 0
    if (name === t)                 s = 100
    else if (name.startsWith(t))    s = 60
    else if (name.includes(t))      s = 40
    if (cat.includes(t))            s = Math.max(s, startsWord(cat, t) ? 25 : 15)
    if (cls.startsWith(t))          s = Math.max(s, 20)
    if (desc.includes(t))           s = Math.max(s, startsWord(desc, t) ? 15 : 8)
    if (s === 0) return 0
    total += s
  }
  return total
}

/** Filter + rank. Stable: equal scores keep the input (library) order. */
export function searchDefs<T extends SearchableDef>(
  defs: T[], query: string, pathOf: (d: T) => string = () => '',
): T[] {
  const tokens = searchTokens(query)
  if (tokens.length === 0) return defs
  return defs
    .map((d, i) => ({ d, i, s: scoreDef(d, tokens, pathOf(d)) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map(x => x.d)
}
