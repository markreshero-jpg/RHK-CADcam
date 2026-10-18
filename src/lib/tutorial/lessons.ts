// ── Tutorial lessons (z_tutorial/TUTORIAL-SPEC.md) ────────────────────────────
// Each step ticks itself off when done(ctx, start) turns true. `start` is the
// drawing as it was when the lesson began in the canvas, so "add a top" means one
// more than the job already had. Only the current step is checked, so steps run
// in order. `target` is a data-tour id the panel can spotlight; `hints` are
// plan-view shapes in room mm (TutorialHintsPlan).
// Lesson + step ids are stored in userPrefs.tutorial — never rename one.

import type { Wall, CabinetInstance, BenchtopInstance, RoomFixture } from '../types'
import { cabT, centroid, wallDir, wallEnd, wallInwardNormal, type Pt } from '../geometry'

export interface TutorialCtx {
  path:          string
  inCanvas:      boolean
  mode:          string
  view:          string
  walls:         Wall[]
  cabinets:      CabinetInstance[]
  benchtops:     BenchtopInstance[]
  fixtures:      RoomFixture[]
  selected:      { type: string; id: string } | null
  cabEditorOpen: boolean
  /** Benchtops Shift-picked in F4 mode. */
  pickedTops:    number
  joinDialogOpen: boolean
}

export const EMPTY_CTX: TutorialCtx = {
  path: '', inCanvas: false, mode: 'select', view: 'plan',
  walls: [], cabinets: [], benchtops: [], fixtures: [], selected: null,
  cabEditorOpen: false, pickedTops: 0, joinDialogOpen: false,
}

export type TutorialHint =
  /** Pulsing outline along a wall, with a label. */
  | { kind: 'wall'; a: Pt; b: Pt; label: string }
  /** Dashed target area (polygon), with a label at its middle. */
  | { kind: 'zone'; pts: Pt[]; label: string }

export interface TutorialStep {
  id:     string
  title:  string
  body:   string
  target?: string
  /** Only checked while in the canvas; outside it the step says to open a job. */
  canvas?: boolean
  done:   (c: TutorialCtx, start: TutorialCtx) => boolean
  hints?: (c: TutorialCtx) => TutorialHint[]
}

export type TutorialGroup = 'start' | 'benchtops' | 'cabinets' | 'room'

export const TUTORIAL_GROUPS: { id: TutorialGroup; label: string; blurb: string }[] = [
  { id: 'start',     label: 'Getting started', blurb: 'The basics, in order — a whole small kitchen.' },
  { id: 'benchtops', label: 'Benchtops',       blurb: '' },
  { id: 'cabinets',  label: 'Cabinets',        blurb: '' },
  { id: 'room',      label: 'Room',            blurb: '' },
]

export interface TutorialLesson {
  id:    string
  group: TutorialGroup
  title: string
  /** One line for the picker. */
  blurb: string
  steps: TutorialStep[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const isBase = (c: CabinetInstance) => c.assembly_class === 'base' || c.assembly_class === 'base_corner'
const isWallCab = (c: CabinetInstance) => c.assembly_class === 'wall' || c.assembly_class === 'wall_corner'
const bases = (c: TutorialCtx) => c.cabinets.filter(isBase)
const standardWalls = (c: TutorialCtx) => c.walls.filter(w => w.wall_type !== 'island')
const islandWalls = (c: TutorialCtx) => c.walls.filter(w => w.wall_type === 'island')
const longestWall = (c: TutorialCtx) => standardWalls(c).reduce<Wall | null>((m, w) => (!m || w.length > m.length ? w : m), null)
/** Walls that have at least one base cabinet on them — each wants its own top. */
const wallsWithBases = (c: TutorialCtx) => new Set(bases(c).map(b => b.wall_id).filter(Boolean)).size
const selectedCab = (c: TutorialCtx) => c.selected?.type === 'cabinet' ? c.cabinets.find(k => k.id === c.selected!.id) : undefined
const jointEdges = (c: TutorialCtx) => c.benchtops.reduce((n, b) => n + b.segments.filter(s => s.edge?.joint).length, 0)
const profiledEdges = (c: TutorialCtx) => c.benchtops.reduce((n, b) => n + b.segments.filter(s => s.edge?.profile_id).length, 0)
const sinks = (c: TutorialCtx) => c.fixtures.filter(f => f.category === 'sink')

/** Two standard walls joined end to start — the corner of an L. */
function cornerWalls(c: TutorialCtx): [Wall, Wall] | null {
  const ws = standardWalls(c)
  for (const a of ws) {
    const e = wallEnd(a)
    for (const b of ws) {
      if (a === b) continue
      if (Math.hypot(b.pos_x - e.x, b.pos_y - e.y) < 5) return [a, b]
    }
  }
  return null
}

/** A strip `depth` mm deep off the wall's room face, from `from` to `to` mm along it. */
function strip(w: Wall, c: TutorialCtx, from: number, to: number, depth: number): Pt[] {
  const d = wallDir(w), n = wallInwardNormal(w, centroid(c.walls))
  const p = (t: number, off: number) => ({ x: w.pos_x + d.x * t + n.x * off, y: w.pos_y + d.y * t + n.y * off })
  return [p(from, 0), p(to, 0), p(to, depth), p(from, depth)]
}

function wallHint(w: Wall | null, label: string): TutorialHint[] {
  return w ? [{ kind: 'wall', a: { x: w.pos_x, y: w.pos_y }, b: wallEnd(w), label }] : []
}

/** Span (mm along the wall) covered by the base cabinets on `w`. */
function baseSpan(w: Wall, c: TutorialCtx): [number, number] | null {
  const onWall = bases(c).filter(b => b.wall_id === w.id)
  if (!onWall.length) return null
  const lo = Math.min(...onWall.map(b => cabT(b, w)))
  const hi = Math.max(...onWall.map(b => cabT(b, w) + b.dx))
  return [Math.max(0, lo), Math.min(w.length, hi)]
}

/** The wall with the most base cabinets (the main run). */
function mainRunWall(c: TutorialCtx): Wall | null {
  const count = new Map<string, number>()
  for (const b of bases(c)) if (b.wall_id) count.set(b.wall_id, (count.get(b.wall_id) ?? 0) + 1)
  let best: Wall | null = null, bestN = 0
  for (const w of c.walls) { const n = count.get(w.id) ?? 0; if (n > bestN) { best = w; bestN = n } }
  return best
}

// Reused steps
const lineTool = (id = 'tool'): TutorialStep => ({
  id, title: 'Pick Line + Offset',
  body: 'Open Benchtop in the sidebar (F4) and choose Line + Offset. In Benchtop mode only tops can be selected; Esc leaves it.',
  target: 'mode-draw_benchtop_line|tool-benchtop', canvas: true, done: c => c.mode === 'draw_benchtop_line',
})

// ── Lessons ───────────────────────────────────────────────────────────────────

export const LESSONS: TutorialLesson[] = [
  // ── Getting started (a course: Next lesson runs through these in order) ──
  { id: 'job', group: 'start', title: 'Start a job', blurb: 'Create a project and open its first room.', steps: [
    { id: 'projects', title: 'Go to Projects',
      body: 'Every drawing lives in a job. Open File → Back to Projects (skip this lesson if you already have a job open to practise in).',
      target: 'menu-File', done: c => c.path === '/' },
    { id: 'new', title: 'Click New Project',
      body: 'Top right of the Projects page.', target: 'new-project',
      done: c => c.path === '/projects/new' },
    { id: 'create', title: 'Name it and create it',
      body: 'Type a project name (e.g. "Tutorial Kitchen"), leave the room as Kitchen, then click Create. The canvas opens on the new room.',
      target: 'project-name', done: c => c.inCanvas },
  ]},

  { id: 'walls', group: 'start', title: 'Draw the walls', blurb: 'Draw the room with the wall tool.', steps: [
    { id: 'tool', title: 'Pick the wall tool',
      body: 'Open Wall in the left sidebar (or press F2) and choose Standard Wall.',
      target: 'mode-draw_wall|tool-wall', canvas: true, done: c => c.mode === 'draw_wall' },
    { id: 'draw', title: 'Draw two walls',
      body: 'Click where the first wall starts, then click at each corner. Type a length and press Enter for an exact size. Draw at least two walls, e.g. an L of 3600 and 2400.',
      canvas: true, done: c => c.walls.length >= 2 },
    { id: 'finish', title: 'Finish drawing',
      body: 'Press Esc (or click Select at the top of the sidebar) to stop drawing walls.',
      canvas: true, done: c => c.mode === 'select' && c.walls.length >= 2 },
  ]},

  { id: 'cabinets', group: 'start', title: 'Place cabinets', blurb: 'Drop base and wall cabinets from the library.', steps: [
    { id: 'library', title: 'Open the cabinet library',
      body: 'Open Cabinet in the sidebar (F3), go into a base cabinet category and click a cabinet. It follows your cursor.',
      target: 'tool-cabinet', canvas: true, done: c => c.mode.startsWith('place_') && c.mode !== 'place_fixture' },
    { id: 'first', title: 'Drop it against a wall',
      body: 'Move the cabinet up to the highlighted wall — it snaps to the wall face — and click to place it.',
      canvas: true, done: (c, s) => bases(c).length > bases(s).length,
      hints: c => wallHint(longestWall(c), 'Place base cabinets along here') },
    { id: 'run', title: 'Make a run of three',
      body: 'Keep clicking to add more cabinets next to the first one — they snap to its side. Esc when you have three.',
      canvas: true, done: (c, s) => bases(c).length >= bases(s).length + 3,
      hints: c => wallHint(longestWall(c), 'Keep going along this wall') },
    { id: 'edit', title: 'Open the cabinet editor',
      body: 'Double-click one of your cabinets. The editor is where you change sizes, doors, drawers and parts. Close it when you have had a look.',
      canvas: true, done: c => c.cabEditorOpen },
    { id: 'upper', title: 'Add a wall cabinet',
      body: 'Back in the library, pick a wall (overhead) cabinet and place it above your base run.',
      target: 'tool-cabinet', canvas: true,
      done: (c, s) => c.cabinets.filter(isWallCab).length > s.cabinets.filter(isWallCab).length && !c.cabEditorOpen,
      hints: c => wallHint(mainRunWall(c), 'Wall cabinets go above the bases') },
  ]},

  { id: 'benchtops', group: 'start', title: 'Benchtops', blurb: 'Draw a top over the base cabinets.', steps: [
    lineTool(),
    { id: 'first', title: 'Draw a top over the base run',
      body: 'Click the back corners of the run along the wall, then pull out to the depth (or type it) and click.',
      canvas: true, done: (c, s) => c.benchtops.length > s.benchtops.length,
      hints: c => {
        const w = mainRunWall(c); const span = w && baseSpan(w, c)
        return w && span ? [{ kind: 'zone', pts: strip(w, c, span[0], span[1], 600), label: 'Benchtop goes here' }] : []
      } },
    { id: 'per_wall', title: 'One top per wall',
      body: 'If you have base cabinets on another wall, draw a separate top for that wall too — the "Join benchtops in a corner" tutorial shows how to join them.',
      canvas: true, done: c => c.benchtops.length >= Math.max(1, wallsWithBases(c)) },
  ]},

  { id: 'appliances', group: 'start', title: 'Appliances', blurb: 'Drop a dishwasher, oven or fridge.', steps: [
    { id: 'pick', title: 'Pick an appliance',
      body: 'Open Fixtures in the sidebar (F6) and click an appliance (e.g. a dishwasher or oven). R turns it, Shift places it freely.',
      target: 'tool-fixtures', canvas: true, done: c => c.mode === 'place_fixture' },
    { id: 'drop', title: 'Drop it next to the cabinets',
      body: 'Move it to the end of your base run — it backs onto the nearest wall — and click. Esc to finish.',
      canvas: true,
      done: (c, s) => c.fixtures.filter(f => f.category === 'appliance').length > s.fixtures.filter(f => f.category === 'appliance').length,
      hints: c => {
        const w = mainRunWall(c); const span = w && baseSpan(w, c)
        if (!w || !span) return []
        const to = Math.min(w.length, span[1] + 600)
        return to - span[1] > 50 ? [{ kind: 'zone', pts: strip(w, c, span[1], to, 600), label: 'Appliance here' }] : []
      } },
  ]},

  { id: 'views', group: 'start', title: 'Look at your job', blurb: 'Elevation and 3D views.', steps: [
    { id: 'elevation', title: 'Elevation view',
      body: 'Click Elevation at the top. Select a wall first to look at that wall.',
      target: 'view-elevation', canvas: true, done: c => c.view === 'elevation' },
    { id: '3d', title: '3D view',
      body: 'Click 3D. Drag to orbit, scroll to zoom.', target: 'view-3d', canvas: true, done: c => c.view === '3d' },
    { id: 'plan', title: 'Back to plan',
      body: 'Click Plan. That is the basics — pick another tutorial, or switch Tutorial mode off in the File menu.',
      target: 'view-plan', canvas: true, done: c => c.view === 'plan' },
  ]},

  // ── Benchtops ──
  { id: 'corner_join', group: 'benchtops', title: 'Join benchtops in a corner',
    blurb: 'Two tops, one per wall, with a mitre or butt joint where they meet.', steps: [
    { id: 'corner', title: 'Have an L corner',
      body: 'You need two walls that meet at a corner. Draw them with the wall tool (F2) if this room has none.',
      canvas: true, done: c => cornerWalls(c) !== null },
    lineTool(),
    { id: 'top_a', title: 'Top along the first wall',
      body: 'Draw a top along the highlighted wall, running all the way into the corner. Click both ends of the back line, then the depth.',
      canvas: true, done: (c, s) => c.benchtops.length >= s.benchtops.length + 1,
      hints: c => { const k = cornerWalls(c); return k ? [{ kind: 'zone', pts: strip(k[0], c, 0, k[0].length, 600), label: 'Top 1 — into the corner' }] : [] } },
    { id: 'top_b', title: 'Top along the corner wall',
      body: 'Now draw a second, separate top along the other wall, also running into the corner. It overlaps the first one there — that is fine, the join sorts it out.',
      canvas: true, done: (c, s) => c.benchtops.length >= s.benchtops.length + 2,
      hints: c => { const k = cornerWalls(c); return k ? [{ kind: 'zone', pts: strip(k[1], c, 0, k[1].length, 600), label: 'Top 2 — into the corner' }] : [] } },
    { id: 'pick', title: 'Pick both tops',
      body: 'Press Esc to finish drawing (you stay in Benchtop mode). Click the first top, then Shift-click the second so both are picked.',
      canvas: true, done: c => c.pickedTops >= 2 },
    { id: 'dialog', title: 'Right-click → Join benchtops',
      body: 'Right-click one of the picked tops and choose Join benchtops (2)…',
      canvas: true, done: c => c.joinDialogOpen },
    { id: 'apply', title: 'Choose the joint and apply',
      body: 'Pick Mitre (45° across the corner) or Butt (one top runs through). The preview shows the cut. Click Apply joints (or Enter).',
      canvas: true, done: (c, s) => jointEdges(c) > jointEdges(s) && !c.joinDialogOpen },
  ]},

  { id: 'sink_cutout', group: 'benchtops', title: 'Sink or cooktop cutout',
    blurb: 'Drop a sink on a benchtop so it cuts its own hole.', steps: [
    { id: 'top', title: 'Have a benchtop',
      body: 'The sink needs a top to sit in. Draw one with Benchtop → Line + Offset if this room has none.',
      canvas: true, done: c => c.benchtops.length > 0 },
    { id: 'pick', title: 'Pick a sink',
      body: 'Esc out of Benchtop mode, open Fixtures (F6) and click a sink.',
      target: 'tool-fixtures', canvas: true, done: c => c.mode === 'place_fixture' },
    { id: 'drop', title: 'Drop it on the benchtop',
      body: 'Move it over the top — it sits into it — and click. Esc to finish.',
      canvas: true, done: (c, s) => sinks(c).length > sinks(s).length },
    { id: 'check', title: 'Check the cutout',
      body: 'Click the sink. In its panel, Cut benchtop is ticked: the top gets the sink\'s cutout. Untick it to keep the top whole, or change the cutout size there.',
      canvas: true, done: c => c.selected?.type === 'fixture' && sinks(c).some(f => f.id === c.selected!.id) },
    { id: '3d', title: 'See the hole in 3D',
      body: 'Click 3D to see the sink sitting in its cutout.', target: 'view-3d', canvas: true, done: c => c.view === '3d' },
  ]},

  { id: 'edge_profiles', group: 'benchtops', title: 'Edge profiles',
    blurb: 'Choose the finish on each exposed edge of a top.', steps: [
    { id: 'top', title: 'Have a benchtop',
      body: 'Draw a top first with Benchtop → Line + Offset if this room has none.',
      canvas: true, done: c => c.benchtops.length > 0 },
    { id: 'mode', title: 'Right-click a top → Edit edges',
      body: 'In Benchtop mode (F4 → Select Tops), right-click the top and choose Edit edges.',
      target: 'tool-benchtop', canvas: true, done: c => c.mode === 'edit_benchtop_edges' },
    { id: 'paint', title: 'Paint an edge and save',
      body: 'Pick a profile chip in the panel, then click the front edge of the top to paint it. Wall edges and joints can\'t take a profile. Save when done.',
      canvas: true, done: (c, s) => profiledEdges(c) > profiledEdges(s) && c.mode !== 'edit_benchtop_edges' },
  ]},

  // ── Cabinets ──
  { id: 'shaped_cabinet', group: 'cabinets', title: 'Make a shaped cabinet',
    blurb: 'Clipped corner, angled end or L corner from a plain box.', steps: [
    { id: 'select', title: 'Select a base cabinet',
      body: 'Click a base cabinet in plan (place one from the library first if the room has none). Its panel opens on the right.',
      canvas: true, done: c => { const k = selectedCab(c); return !!k && isBase(k) } },
    { id: 'shape', title: 'Pick a shape',
      body: 'In the cabinet panel, find Shape and choose Clipped corner or Angled end. The plan outline changes straight away.',
      target: 'cab-shape', canvas: true, done: c => !!selectedCab(c)?.footprint },
    { id: 'tune', title: 'Set the sizes and side',
      body: 'Change the shape\'s sizes (e.g. Clip along width) and which end it is on. Then click 3D to see the parts follow the shape.',
      target: 'view-3d', canvas: true, done: c => c.view === '3d' },
  ]},

  // ── Room ──
  { id: 'island', group: 'room', title: 'Draw an island',
    blurb: 'An island bench with cabinets on it.', steps: [
    { id: 'tool', title: 'Pick the island tool',
      body: 'Open Wall (F2) and choose Island. An island is a line with no wall thickness that cabinets can stand on.',
      target: 'mode-draw_island|tool-wall', canvas: true, done: c => c.mode === 'draw_island' },
    { id: 'draw', title: 'Draw the island line',
      body: 'Click the start and end of the island\'s line, out in the room, then Esc.',
      canvas: true, done: (c, s) => islandWalls(c).length > islandWalls(s).length },
    { id: 'cabs', title: 'Put base cabinets on it',
      body: 'Pick a base cabinet from the library (F3) and drop it on the highlighted island line.',
      target: 'tool-cabinet', canvas: true,
      done: (c, s) => {
        const ids = new Set(islandWalls(c).map(w => w.id))
        const on = (k: TutorialCtx) => k.cabinets.filter(b => isBase(b) && b.wall_id && ids.has(b.wall_id)).length
        return on(c) > on(s)
      },
      hints: c => { const w = islandWalls(c).at(-1); return wallHint(w ?? null, 'Drop cabinets on the island') } },
  ]},
]

export const stepKey = (lesson: TutorialLesson, step: TutorialStep) => `${lesson.id}/${step.id}`
export const lessonDone = (lesson: TutorialLesson, done: string[]) => lesson.steps.every(s => done.includes(stepKey(lesson, s)))
