// ============================================================
// auto_tool → drill resolver.
// Turns each drilling op's tool assignment (drill_id / auto_tool)
// into a CONCRETE bit from the cnc_drills library, and returns the
// effective diameter + (clamped) depth the rest of the pipeline
// should use.
//
// Why this matters: on the Anderson gang block a hole is drilled by
// whichever spindle holds a matching-diameter bit — there is no
// per-drill T-number. So "picking the tool" really means snapping
// the hole to a real bit's diameter (and respecting its max_depth),
// which is what then selects the spindle in gangDrill.computeGangs.
// Pure / framework-free / testable.
// ============================================================

export interface DrillLibItem {
  id: string
  name: string
  diameter: number
  max_depth: number | null
  rotation?: string | null
  drill_type?: string | null
  passes?: number | null     // plunges per hole (2 = "drill twice" for hard board)
}

export interface DrillOpToolInput {
  diameter: number | null
  depth: number | null
  drill_id: string | null
  auto_tool: boolean | null
}

// A router bit available for the pocket fallback (cnc_tools).
export interface RouterToolItem {
  id: string
  diameter: number
  tool_number: number
  name?: string | null
}

export interface ResolvedDrillTool {
  // 'drill' = a vertical bore with a drill bit; 'pocket' = a hole the optimiser
  // can't drill (no matching bit) routed out as a circular pocket with a router
  // bit (helical ram-in instead of a straight plunge).
  mode: 'drill' | 'pocket'
  diameter: number            // the hole's nominal diameter (pocket target for routed holes)
  depth: number
  passes: number              // plunges per hole from the chosen bit (1 = normal, 2 = drill twice)
  drill_id: string | null     // the bit actually chosen (null = unresolved or pocket-routed)
  drill_name: string | null
  router_tool_id: string | null     // set when mode = 'pocket'
  router_tool_number: number | null
  router_diameter: number | null
  warnings: string[]
}

export interface ResolveDrillOpts {
  // Diameters currently fitted on the machine's drill block (any bank). When
  // given, auto-select prefers a bit the block can actually fire, and a chosen
  // bit absent from the block raises a warning.
  blockDiameters?: number[]
  // Router bits available to pocket holes that no drill can make (or that match a
  // drill not fitted on the gang head). The preferred tool is used when it fits;
  // otherwise the LARGEST router bit at least pocketClearanceMm smaller than the
  // hole (room to helix in).
  routerTools?: RouterToolItem[]
  pocketClearanceMm?: number             // default 2
  preferredPocketToolNumber?: number | null
}

const DIA_TOL = 0.1     // mm — treat as the same nominal diameter
const SNAP_TOL = 0.5    // mm — auto-select may snap a typed Ø to a real bit within this

const nearlyEq = (a: number, b: number, tol = DIA_TOL) => Math.abs(a - b) < tol
const fitsBlock = (dia: number, block?: number[]) => !block || block.some(b => nearlyEq(b, dia))

// Clamp a requested depth to the bit's reach, warning if it had to shorten.
function clampDepth(depth: number, bit: DrillLibItem, warnings: string[]): number {
  if (bit.max_depth != null && depth > bit.max_depth + 1e-6) {
    warnings.push(`Depth ${round(depth)}mm exceeds ${bit.name} max ${bit.max_depth}mm — clamped`)
    return bit.max_depth
  }
  return depth
}

// Best bit for a target diameter: exact (within tol) preferred, with bits the
// block can fire and bits that reach the depth winning ties; otherwise the
// nearest bit within SNAP_TOL. null when nothing is close enough.
function pickByDiameter(
  targetDia: number, depth: number, lib: DrillLibItem[], block?: number[],
): { bit: DrillLibItem; snapped: boolean } | null {
  const score = (b: DrillLibItem) => {
    const diaDiff = Math.abs(b.diameter - targetDia)
    const inBlock = fitsBlock(b.diameter, block) ? 0 : 1
    const reaches = b.max_depth == null || b.max_depth + 1e-6 >= depth ? 0 : 1
    return [diaDiff, inBlock, reaches] as const
  }
  const sorted = [...lib].sort((a, b) => {
    const [da, ba, ra] = score(a), [db, bb, rb] = score(b)
    return da - db || ba - bb || ra - rb || a.name.localeCompare(b.name)
  })
  const best = sorted[0]
  if (!best) return null
  const diff = Math.abs(best.diameter - targetDia)
  if (diff < DIA_TOL) return { bit: best, snapped: false }
  if (diff <= SNAP_TOL) return { bit: best, snapped: true }
  return null
}

// Router bit to pocket a hole: the preferred tool when it fits, else the largest
// bit at least `clearance` mm smaller than the hole (room to helix in). null when
// none qualifies.
function pickRouterForPocket(
  holeDia: number, clearance: number, tools?: RouterToolItem[], preferredToolNumber?: number | null,
): RouterToolItem | null {
  if (!tools?.length) return null
  const max = holeDia - clearance
  const eligible = tools.filter(t => t.diameter > 0 && t.diameter <= max + 1e-6)
  if (!eligible.length) return null
  if (preferredToolNumber != null) {
    const pref = eligible.find(t => t.tool_number === preferredToolNumber)
    if (pref) return pref
  }
  return eligible.sort((a, b) => b.diameter - a.diameter)[0]
}

const drillResult = (diameter: number, depth: number, drill_id: string | null, drill_name: string | null, warnings: string[], passes = 1): ResolvedDrillTool =>
  ({ mode: 'drill', diameter, depth, passes: Math.max(1, Math.round(passes)), drill_id, drill_name, router_tool_id: null, router_tool_number: null, router_diameter: null, warnings })

// Resolve ONE drilling op to a concrete bit + effective diameter/depth, or a
// router-pocket fallback when no drill matches.
export function resolveDrillTool(
  op: DrillOpToolInput, lib: DrillLibItem[], opts: ResolveDrillOpts = {},
): ResolvedDrillTool {
  const warnings: string[] = []
  const typedDia = op.diameter ?? 0
  const typedDepth = op.depth ?? 0
  const block = opts.blockDiameters

  // 1. Explicit drill_id wins — snap the hole to that real bit.
  if (op.drill_id) {
    const bit = lib.find(d => d.id === op.drill_id)
    if (bit) {
      if (!fitsBlock(bit.diameter, block)) warnings.push(`${bit.name} (⌀${bit.diameter}) is not loaded on the drill block`)
      return drillResult(bit.diameter, clampDepth(typedDepth, bit, warnings), bit.id, bit.name, warnings, bit.passes ?? 1)
    }
    warnings.push('Assigned drill not found / inactive — auto-selecting by diameter')
    // fall through to auto
  }

  // 2. auto_tool (or a missing assignment): pick by diameter.
  if (typedDia <= 0) {
    warnings.push('Drill op has no diameter and no assigned bit — left unresolved')
    return drillResult(typedDia, typedDepth, null, null, warnings)
  }
  const clearance = opts.pocketClearanceMm ?? 2
  const pocketWith = (router: RouterToolItem): ResolvedDrillTool => ({
    mode: 'pocket', diameter: typedDia, depth: typedDepth, passes: 1, drill_id: null, drill_name: null,
    router_tool_id: router.id, router_tool_number: router.tool_number, router_diameter: router.diameter, warnings,
  })

  const pick = pickByDiameter(typedDia, typedDepth, lib, block)
  if (pick) {
    if (pick.snapped) warnings.push(`⌀${round(typedDia)} snapped to nearest bit ${pick.bit.name} (⌀${pick.bit.diameter})`)
    // A matching drill that's actually fitted on the gang head → drill it.
    if (fitsBlock(pick.bit.diameter, block)) {
      return drillResult(pick.bit.diameter, clampDepth(typedDepth, pick.bit, warnings), pick.bit.id, pick.bit.name, warnings, pick.bit.passes ?? 1)
    }
    // 3a. Matched a drill the head can't fire — pocket-route instead of dropping it.
    const router = pickRouterForPocket(typedDia, clearance, opts.routerTools, opts.preferredPocketToolNumber)
    if (router) {
      warnings.push(`⌀${round(typedDia)} (${pick.bit.name}) isn't on the drill head — pocket-routed with ${router.name ?? `⌀${router.diameter}`}`)
      return pocketWith(router)
    }
    warnings.push(`⌀${pick.bit.diameter} has no matching spindle on the drill block`)
    return drillResult(pick.bit.diameter, clampDepth(typedDepth, pick.bit, warnings), pick.bit.id, pick.bit.name, warnings, pick.bit.passes ?? 1)
  }

  // 3b. No drill matches at all — pocket-route with a router bit.
  const router = pickRouterForPocket(typedDia, clearance, opts.routerTools, opts.preferredPocketToolNumber)
  if (router) {
    warnings.push(`⌀${round(typedDia)} pocket-routed with ${router.name ?? `⌀${router.diameter}`} bit (no matching drill)`)
    return pocketWith(router)
  }
  warnings.push(`No drill or router bit can make ⌀${round(typedDia)} — left as typed`)
  return drillResult(typedDia, typedDepth, null, null, warnings)
}

// Resolve a batch in place is left to the caller; this helper just collects a
// de-duplicated warning set across many ops for a single user-facing notice.
export function resolveDrillTools(
  ops: DrillOpToolInput[], lib: DrillLibItem[], opts: ResolveDrillOpts = {},
): { resolved: ResolvedDrillTool[]; warnings: string[] } {
  const resolved = ops.map(o => resolveDrillTool(o, lib, opts))
  const warnings = [...new Set(resolved.flatMap(r => r.warnings))]
  return { resolved, warnings }
}

const round = (n: number) => Math.round(n * 10) / 10
