// ── Tutorial lessons (z_tutorial/TUTORIAL-SPEC.md) ────────────────────────────
// Each step ticks itself off when done(ctx, start) turns true. `start` is the
// drawing as it was when the lesson began in the canvas, so "add a top" means one
// more than the job already had. Only the current step is checked, so steps run
// in order. `target` is a data-tour id the panel can spotlight; `hints` are
// plan-view shapes in room mm (TutorialHintsPlan).
// Lesson + step ids are stored in userPrefs.tutorial — never rename one.

import type { Wall, CabinetInstance, BenchtopInstance, RoomFixture, RoomAnnotation } from '../types'
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
  kickSettingsOpen: boolean
  /** Report open in the Reports window (its id), null when the window is closed. */
  report:        string | null
  /** One-off actions counted by emit() — e.g. elevation_pdf, plan_pdf. */
  events:        Record<string, number>
  /** Plan CAD annotations (F7) and how many are selected. */
  annotations:   RoomAnnotation[]
  annotSelected: number
}

export const EMPTY_CTX: TutorialCtx = {
  path: '', inCanvas: false, mode: 'select', view: 'plan',
  walls: [], cabinets: [], benchtops: [], fixtures: [], selected: null,
  cabEditorOpen: false, pickedTops: 0, joinDialogOpen: false, kickSettingsOpen: false,
  report: null, events: {}, annotations: [], annotSelected: 0,
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

// Picker tree: level ▸ topic ▸ tutorial. Getting started is one flat course.
export type TutorialLevel = 'start' | 'basics' | 'intermediate' | 'advanced'
export type TutorialTopic = 'room' | 'cabinets' | 'benchtops' | 'appliances' | 'cad' | 'reports' | 'production'

export const TUTORIAL_LEVELS: { id: TutorialLevel; label: string; blurb: string }[] = [
  { id: 'start',        label: 'Getting started', blurb: 'In order — a whole small kitchen, start to finish.' },
  { id: 'basics',       label: 'Basics',          blurb: 'Everyday drawing jobs.' },
  { id: 'intermediate', label: 'Intermediate',    blurb: 'Joins, shapes, kicks and printing.' },
  { id: 'advanced',     label: 'Advanced',        blurb: 'Shape editing and production.' },
]

export const TUTORIAL_TOPICS: { id: TutorialTopic; label: string }[] = [
  { id: 'room',       label: 'Room' },
  { id: 'cabinets',   label: 'Cabinets' },
  { id: 'benchtops',  label: 'Benchtops' },
  { id: 'appliances', label: 'Appliances & fixtures' },
  { id: 'cad',        label: 'CAD notes & markup' },
  { id: 'reports',    label: 'Reports & printing' },
  { id: 'production', label: 'Production' },
]

export interface TutorialLesson {
  id:    string
  level: TutorialLevel
  /** Sub-folder in the picker (not used by Getting started). */
  topic?: TutorialTopic
  title: string
  /** One line for the picker. */
  blurb: string
  /** Extra words the search matches (title, blurb and step titles are searched too). */
  keywords?: string
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
/** Fixtures seated in a cabinet's opening (cabinet contents, z_ubo). */
const seated = (c: TutorialCtx) => c.fixtures.filter(f => f.cabinet_id && f.link_zone).length

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

const kickRuns = (c: TutorialCtx) => new Set(c.cabinets.map(k => k.kick_run_id).filter(Boolean)).size
const openings = (c: TutorialCtx) => c.fixtures.filter(f => f.category === 'opening')
const ev = (c: TutorialCtx, name: string) => c.events[name] ?? 0
/** Some wall carries two or more base cabinets (a run to join kicks along). */
const hasBaseRun = (c: TutorialCtx) => {
  const n = new Map<string, number>()
  for (const b of bases(c)) if (b.wall_id) n.set(b.wall_id, (n.get(b.wall_id) ?? 0) + 1)
  return [...n.values()].some(v => v >= 2)
}
const topShapes = (c: TutorialCtx) => new Map(c.benchtops.map(b => [b.id, JSON.stringify(b.segments)]))
/** A top that existed at the start has a different outline now. */
const reshaped = (c: TutorialCtx, s: TutorialCtx) => {
  const before = topShapes(s)
  return [...topShapes(c)].some(([id, seg]) => before.has(id) && before.get(id) !== seg)
}

// Reused steps
/** Text notes (F7): point text, or a text box when it has a width. */
const notes = (c: TutorialCtx, boxed: boolean) =>
  c.annotations.filter(a => a.kind === 'text' && ((a.geom as { width?: number }).width != null) === boxed).length

const lineTool = (id = 'tool'): TutorialStep => ({
  id, title: 'Pick Line + Offset',
  body: 'Open Benchtop in the sidebar (F4) and choose Line + Offset. In Benchtop mode only tops can be selected; Esc leaves it.',
  target: 'mode-draw_benchtop_line|tool-benchtop', canvas: true, done: c => c.mode === 'draw_benchtop_line',
})

// ── Lessons ───────────────────────────────────────────────────────────────────

export const LESSONS: TutorialLesson[] = [
  // ── Getting started (a course: Next lesson runs through these in order) ──
  { id: 'job', level: 'start', keywords: 'new job project create room', title: 'Start a job', blurb: 'Create a project and open its first room.', steps: [
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

  { id: 'walls', level: 'start', keywords: 'wall draw room length corner', title: 'Draw the walls', blurb: 'Draw the room with the wall tool.', steps: [
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

  { id: 'cabinets', level: 'start', keywords: 'cabinet place library base wall overhead upper', title: 'Place cabinets', blurb: 'Drop base and wall cabinets from the library.', steps: [
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

  { id: 'benchtops', level: 'start', keywords: 'benchtop top bench worktop', title: 'Benchtops', blurb: 'Draw a top over the base cabinets.', steps: [
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

  { id: 'appliances', level: 'start', keywords: 'appliance dishwasher oven fridge fixture', title: 'Appliances', blurb: 'Drop a dishwasher, oven or fridge.', steps: [
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

  { id: 'views', level: 'start', keywords: 'elevation 3d plan view orbit', title: 'Look at your job', blurb: 'Elevation and 3D views.', steps: [
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
  { id: 'corner_join', level: 'intermediate', topic: 'benchtops', keywords: 'mitre butt joint l shape corner two tops join', title: 'Join benchtops in a corner',
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

  { id: 'sink_cutout', level: 'basics', topic: 'benchtops', keywords: 'sink cooktop hob hole cutout cut out', title: 'Sink or cooktop cutout',
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

  { id: 'edge_profiles', level: 'intermediate', topic: 'benchtops', keywords: 'edge profile bullnose pencil round arris finish edgeband tape', title: 'Edge profiles',
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
  { id: 'shaped_cabinet', level: 'intermediate', topic: 'cabinets', keywords: 'shape clipped corner angled end diagonal pie l corner footprint', title: 'Make a shaped cabinet',
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
  { id: 'island', level: 'basics', topic: 'room', keywords: 'island bench peninsula', title: 'Draw an island',
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

  // ── Added 2026-10-18 (append only — the lesson index is persisted) ──
  { id: 'copy_paste', level: 'basics', topic: 'cabinets', title: 'Copy and paste a cabinet',
    blurb: 'Repeat a cabinet you have already set up.', keywords: 'copy paste duplicate clone ctrl c v', steps: [
    { id: 'select', title: 'Select a cabinet',
      body: 'Click a cabinet you have already set up (place one from the library first if the room has none).',
      canvas: true, done: c => c.selected?.type === 'cabinet' },
    { id: 'copy', title: 'Copy it',
      body: 'Press Ctrl+C (or Edit → Copy Cabinet). A copy follows your cursor.',
      target: 'menu-Edit', canvas: true, done: c => c.mode === 'paste' },
    { id: 'paste', title: 'Drop the copy',
      body: 'Click against a wall or next to another cabinet to place it. Ctrl+V pastes another; Esc to finish.',
      canvas: true, done: (c, s) => c.cabinets.length > s.cabinets.length },
  ]},

  { id: 'openings', level: 'basics', topic: 'room', title: 'Doors and windows',
    blurb: 'Put a door or window in a wall.', keywords: 'door window opening archway sill head', steps: [
    { id: 'pick', title: 'Pick a door or window',
      body: 'Open Fixtures (F6), go into Doors & windows and click one.',
      target: 'tool-fixtures', canvas: true, done: c => c.mode === 'place_fixture' },
    { id: 'drop', title: 'Drop it in a wall',
      body: 'Move it onto a wall — it sits in the wall and the wall is drawn split around it — and click. Esc to finish.',
      canvas: true, done: (c, s) => openings(c).length > openings(s).length,
      hints: c => wallHint(longestWall(c), 'Drop it in a wall') },
    { id: 'size', title: 'Set its size',
      body: 'Click the opening. In its panel set the width, height and sill (windows), or move it along the wall.',
      canvas: true, done: c => c.selected?.type === 'fixture' && openings(c).some(f => f.id === c.selected!.id) },
  ]},

  { id: 'kick_runs', level: 'intermediate', topic: 'cabinets', title: 'Join kicks along a run',
    blurb: 'One continuous toe kick under a run of base cabinets.', keywords: 'kick toe kick plinth ladder join run split', steps: [
    { id: 'run', title: 'Have a run of base cabinets',
      body: 'You need two or more base cabinets side by side on one wall, with ladder kicks (the default).',
      canvas: true, done: c => hasBaseRun(c),
      hints: c => wallHint(mainRunWall(c), 'This run') },
    { id: 'join', title: 'Right-click → Join kicks in run',
      body: 'Right-click any base cabinet in the run and choose Join kicks in run. If the cabinets are different depths it asks to build the kick to the deepest one.',
      canvas: true, done: (c, s) => kickRuns(c) > kickRuns(s) },
    { id: 'look', title: 'See the kick',
      body: 'Kicks are hidden in plan by default. Select the run\'s wall and click Elevation to see one kick under the whole run.',
      target: 'view-elevation', canvas: true, done: c => c.view === 'elevation' },
    { id: 'split', title: 'Set the split length',
      body: 'Right-click the kick under the cabinets and choose Kick split… to set the longest piece the kick may be — longer runs are cut into pieces at that size. (Separate kicks undoes the join.)',
      canvas: true, done: c => c.kickSettingsOpen },
  ]},

  { id: 'print_elevations', level: 'intermediate', topic: 'reports', title: 'Print elevations',
    blurb: 'A scaled PDF, one wall per page.', keywords: 'print pdf elevation drawing report wall page scale', steps: [
    { id: 'open', title: 'Open Room Reports',
      body: 'Click Reports in the menu bar and choose Room Reports… (Job Reports… does every room).',
      target: 'menu-Reports', canvas: true, done: c => c.report !== null },
    { id: 'pick', title: 'Choose Elevation Views',
      body: 'In the list on the left, click Elevation Views.',
      target: 'report-elevation_view_v2', canvas: true, done: c => c.report === 'elevation_view_v2' },
    { id: 'download', title: 'Pick walls and download',
      body: 'Choose the paper and scale, the layer set, and click the walls you want (each is a page). Then Download PDF.',
      target: 'elev-download', canvas: true, done: (c, s) => ev(c, 'elevation_pdf') > ev(s, 'elevation_pdf') },
  ]},

  { id: 'print_plan', level: 'intermediate', topic: 'reports', title: 'Print the plan',
    blurb: 'A scaled plan view PDF that follows a layer set.', keywords: 'print pdf plan drawing report layout scale', steps: [
    { id: 'open', title: 'Open Room Reports',
      body: 'Click Reports in the menu bar and choose Room Reports…',
      target: 'menu-Reports', canvas: true, done: c => c.report !== null },
    { id: 'pick', title: 'Choose Plan View',
      body: 'In the list on the left, click Plan View.',
      target: 'report-plan_view_v2', canvas: true, done: c => c.report === 'plan_view_v2' },
    { id: 'download', title: 'Download it',
      body: 'Set the paper, scale and layer set, then Download PDF.',
      target: 'plan-download', canvas: true, done: (c, s) => ev(c, 'plan_pdf') > ev(s, 'plan_pdf') },
  ]},

  { id: 'reshape_top', level: 'advanced', topic: 'benchtops', title: 'Reshape a benchtop',
    blurb: 'Move corners, add points and curves on a top.', keywords: 'shape edit vertex corner curve arc radius notch benchtop', steps: [
    { id: 'top', title: 'Have a benchtop',
      body: 'Draw a top first with Benchtop → Line + Offset if this room has none.',
      canvas: true, done: c => c.benchtops.length > 0 },
    { id: 'mode', title: 'Right-click a top → Edit shape',
      body: 'In Benchtop mode (F4 → Select Tops), right-click the top and choose Edit shape.',
      target: 'tool-benchtop', canvas: true, done: c => c.mode === 'edit_benchtop_shape' },
    { id: 'edit', title: 'Change the outline and save',
      body: 'Drag a corner to move it, or select an edge to type its length. Save when done.',
      canvas: true, done: (c, s) => c.mode !== 'edit_benchtop_shape' && reshaped(c, s) },
  ]},

  { id: 'cnc', level: 'advanced', topic: 'production', title: 'Cut list and CNC',
    blurb: 'Send the job to the panel optimiser.', keywords: 'cnc nest nesting optimiser optimizer gcode cut list sheets production', steps: [
    { id: 'open', title: 'Production → Generate CNC…',
      body: 'Click Production in the menu bar and choose Generate CNC… The panel optimiser opens on this job.',
      target: 'menu-Production', canvas: true, done: c => c.path.endsWith('/optimiser') },
    { id: 'look', title: 'Work through the stages',
      body: 'The optimiser works stage by stage, from the parts to the sheets, the nest and the G-code. Use your browser Back button to return to the drawing.',
      done: c => c.inCanvas },
  ]},

  // Appended 2026-10-18 (z_CAD_tool A2 — plan text + text boxes).
  { id: 'cad_notes', level: 'basics', topic: 'cad', title: 'Notes on the plan (F7 CAD)',
    blurb: 'Add text and text boxes that print on the plan.',
    keywords: 'cad f7 annotation annotate note notes text label textbox text box markup ribbon comment write colour', steps: [
    { id: 'open', title: 'Turn on CAD mode',
      body: 'Press F7, or click CAD in the left sidebar. The CAD tools open in the sidebar, right under the CAD button. CAD notes go on the Plan for now.',
      target: 'tool-cad', canvas: true, done: c => c.mode === 'cad' },
    { id: 'text', title: 'Place a note',
      body: 'Pick Text in the CAD tools (or press T) and click on the plan where the note goes. Type it; Enter starts a new line. Click away or press Ctrl+Enter to finish.',
      target: 'cad-text', canvas: true, done: (c, s) => notes(c, false) > notes(s, false) },
    { id: 'box', title: 'Draw a text box',
      body: 'Pick Text box (or press B) and drag out a box. Its text wraps to that width. Type a note and click away.',
      target: 'cad-textbox', canvas: true, done: (c, s) => notes(c, true) > notes(s, true) },
    { id: 'select', title: 'Select a note',
      body: 'Pick Select (or press S) and click one of your notes. Drag it to move it, or drag the handle to rotate it. Double-click to change the words.',
      target: 'cad-select', canvas: true, done: c => c.annotSelected > 0 },
    { id: 'style', title: 'Change its look',
      body: 'With the note selected, pick a colour in the CAD tools, or change the size, bold, background or border. Whatever you pick becomes the default for your next note.',
      target: 'cad-colour', canvas: true, done: (c, s) => ev(c, 'annot_style') > ev(s, 'annot_style') },
    { id: 'finish', title: 'Leave CAD mode',
      body: 'Press F7 again, or Esc until the CAD tools close. Your notes print on the Plan View report; tick Annotation colours there to print them in colour.',
      canvas: true, done: c => c.mode !== 'cad' },
  ]},

  // Appended 2026-10-18 (z_ubo U1–U6 — cabinets that come with fixtures inside).
  { id: 'ubo_oven', level: 'intermediate', topic: 'appliances', title: 'Under-bench oven cabinet',
    blurb: 'Place a UBO — it comes with the oven already in it.',
    keywords: 'ubo oven under bench underbench housing appliance cabinet contents fixture inside swap save library', steps: [
    { id: 'pick', title: 'Pick the UBO cabinet',
      body: 'Open Cabinet in the sidebar (F3), go into Appliances and click UBO. It follows your cursor like any cabinet.',
      target: 'tool-cabinet', canvas: true, done: c => c.mode.startsWith('place_') && c.mode !== 'place_fixture' },
    { id: 'drop', title: 'Place it on a wall',
      body: 'Drop it against a wall in your base run. A moment after it lands, the oven appears in its opening, sitting on the oven shelf with its front flush with the panels.',
      canvas: true, done: (c, s) => seated(c) > seated(s),
      hints: c => wallHint(mainRunWall(c) ?? longestWall(c), 'Put the oven cabinet in this run') },
    { id: 'edit', title: 'Open the cabinet editor',
      body: 'Double-click the UBO. The oven shows inside the cabinet in the 3D, Elevation, Top and Side tabs. There is no back panel, just a rail at the top back.',
      canvas: true, done: c => c.cabEditorOpen },
    { id: 'oven', title: 'Click the oven',
      body: 'In the 3D or Elevation tab, click the oven. Its card lets you swap it for another oven, remove it, or jump to it on the canvas.',
      canvas: true, done: (c, s) => ev(c, 'cab_fixture_pick') > ev(s, 'cab_fixture_pick') },
    { id: 'close', title: 'Close the editor',
      body: 'Close the editor. Resize or move the UBO and the oven goes with it; delete it and the oven goes too. Set up your own appliance cabinet the same way (drop fixtures onto a cabinet), then use Save to library and it comes out with them.',
      canvas: true, done: c => !c.cabEditorOpen },
  ]},

  // Appended 2026-10-19 (z_wot K3/K4 — the oven tower drops as a set of cabinets).
  { id: 'wot_tower', level: 'intermediate', topic: 'appliances', title: 'Wall oven tower',
    blurb: 'Place a WOT — end panels, drawers, oven and the cupboard above, all in one go.',
    keywords: 'wot oven tower tall wall oven combi microwave steam cleats end panel tepk d2-ll w2d under panel scribe off wall kit set appliance', steps: [
    { id: 'pick', title: 'Pick WOT or WOT-COMBI',
      body: 'Open Cabinet in the sidebar (F3), go into Appliances and click WOT (oven with an open microwave box) or WOT-COMBI (oven with an integrated microwave or combi above).',
      target: 'tool-cabinet', canvas: true, done: c => c.mode.startsWith('place_') && c.mode !== 'place_fixture' },
    { id: 'drop', title: 'Place it on a wall',
      body: 'Drop it against a wall. It lands as five cabinets: a TEPK either side, a D2-LL with a full top at 650, the oven on its cleats, and a W2D over it with an under panel, set out off the wall so its doors meet the panel fronts.',
      canvas: true, done: (c, s) => c.cabinets.length >= s.cabinets.length + 5,
      hints: c => wallHint(longestWall(c), 'Put the oven tower on this wall') },
    { id: 'w2d', title: 'Select the cupboard above',
      body: 'Click the W2D at the top. Under Wall position, Off wall shows how far it stands off the wall. Change it there if your panels are a different depth.',
      canvas: true, done: c => !!c.selected && c.cabinets.find(x => x.id === c.selected!.id)?.assembly_class === 'wall' },
    { id: 'core', title: 'Look at the oven cleats',
      body: 'Double-click the oven core between the panels. The cleats, shelf and back panel are its parts; each cleat has its two 5 mm fixing holes and an "Edge in black" comment.',
      canvas: true, done: c => c.cabEditorOpen },
  ]},

  // Appended 2026-10-19 (right-click → Insert list of library items).
  { id: 'insert_list', level: 'basics', topic: 'cabinets', title: 'Insert end panels and fillers',
    blurb: 'Right-click a cabinet → Insert → WEP → Left side, and choose what that menu offers.',
    keywords: 'insert right click end panel filler wep bep bepk bfk wf tepk side left right beside adjacent edit insert list favourites menu', steps: [
    { id: 'edit', title: 'Right-click a cabinet → Insert → Edit insert list…',
      body: 'Right-click any cabinet and hover Insert. At the bottom, click Edit insert list….',
      canvas: true, done: (c, s) => ev(c, 'insert_list_open') > ev(s, 'insert_list_open') },
    { id: 'tick', title: 'Tick the items you insert most',
      body: 'Search (e.g. "EP" or "filler") and tick things like WEP, BEPK, BFK and WF, then Save. The list is kept in this browser.',
      canvas: true, done: (c, s) => ev(c, 'insert_list_save') > ev(s, 'insert_list_save') },
    { id: 'insert', title: 'Insert one beside a cabinet',
      body: 'Right-click a wall cabinet → Insert → WEP → Left side. It butts against that side and takes the cabinet’s height, depth and elevation. If the cabinet is hard against a wall or another cabinet, it narrows by the panel’s thickness to make room. Items for other cabinet types are under Insert → Other.',
      canvas: true, done: (c, s) => c.cabinets.length > s.cabinets.length },
  ]},

  { id: 'auto_tops', level: 'basics', topic: 'benchtops', title: 'Auto-build benchtops',
    blurb: 'Let the app put a top over every run of base cabinets, with joints at the corners.',
    keywords: 'auto build automatic benchtop tops overhang corner mitre butt joint island gap waterfall profile', steps: [
    { id: 'bases', title: 'Have some base cabinets',
      body: 'Place a few base cabinets (F3) — ideally a run on two walls meeting in a corner.',
      canvas: true, done: c => bases(c).length >= 2 },
    { id: 'open', title: 'Benchtop → Auto-build tops…',
      body: 'Open Benchtop in the sidebar (F4) and choose Auto-build tops…. Select some cabinets first to build over just those; otherwise it covers the whole room.',
      target: 'tool-benchtop-autobuild|tool-benchtop', canvas: true, done: (c, s) => ev(c, 'bt_autobuild_open') > ev(s, 'bt_autobuild_open') },
    { id: 'answer', title: 'Answer the questions and click through',
      body: 'Set the front and open-end overhangs, how wide a gap to bridge (a freestanding dishwasher), Mitre or Butt corners, waterfall ends (island ends or every open end) and the edge profile. Next → shows each top (skip it or change its overhangs) and each corner (pick the joint). Build now skips ahead; Esc cancels.',
      canvas: true, done: (c, s) => ev(c, 'bt_autobuild') > ev(s, 'bt_autobuild') && c.benchtops.length > s.benchtops.length },
    { id: 'check', title: 'Check the result',
      body: 'Each top is a separate benchtop anchored to its wall, with joint edges (red) where they meet. Right-click one → Edit shape or Edit edges to adjust it. Ctrl+Z undoes the whole build.',
      canvas: true, done: c => c.selected?.type === 'benchtop' },
  ]},

  // Appended 2026-10-20 (z_access_control Phase 3 — live online presence).
  { id: 'who_online', level: 'basics', topic: 'production', title: 'See who’s online',
    blurb: 'Admins: see who has the app open right now, and which job they’re in.',
    keywords: 'online who logged in signed in users presence active admin tester settings', steps: [
    { id: 'open', title: 'Settings → Users',
      body: 'From the job list, open Settings and pick Users (admins only). A green dot next to an email means that person has the app open right now. The Online column says which job and room (or page) each of their open tabs is on, and updates live as they move around. Hover a line to see when that tab was opened.',
      done: (c, s) => ev(c, 'users_view') > ev(s, 'users_view') },
  ]},

  // Appended 2026-10-20 (fixtures: appliances seat in a cabinet's open opening).
  { id: 'oven_in_opening', level: 'intermediate', topic: 'appliances', title: 'Drop an oven into a tower opening',
    blurb: 'An oven dropped on a tall cabinet with an open space sits itself in that opening.',
    keywords: 'oven tower opening open zone seat microwave compact tall cabinet appliance drop right click 3d', steps: [
    { id: 'pick', title: 'Pick an oven',
      body: 'Open Fixtures in the sidebar (F6) and click an oven (or a microwave). You need a tall cabinet on the canvas with an open space in its front.',
      target: 'tool-fixtures', canvas: true, done: c => c.mode === 'place_fixture' },
    { id: 'drop', title: 'Drop it on the cabinet',
      body: 'Drop it over the cabinet. It moves into the opening on its own: centred, sitting on the shelf, front flush with the doors. In elevation, drop it over the opening you want; in plan it picks the one it fits best (an oven goes in the oven space, a microwave in the smaller one). Change the cabinet’s height or kick and it stays in the opening. If it fits no opening it just sits where you dropped it.',
      canvas: true, done: (c, s) => seated(c) > seated(s) },
    { id: 'menu', title: 'Right-click it in 3D',
      body: 'Switch to 3D and right-click the oven. You get the same menu as in plan: View 3D / elevations, Move, Turn 90° and Delete.',
      canvas: true, done: c => c.selected?.type === 'fixture' },
  ]},

  // Appended 2026-10-20 (z_floating — wall-hung cabinets with no kick).
  { id: 'floating_vanity', level: 'intermediate', topic: 'cabinets', title: 'Make a floating vanity',
    blurb: 'Hang a base cabinet off the floor with no kick, with taped gable ends.',
    keywords: 'floating vanity wall hung no kick bathroom bottom panel edge tape gable underside elevation off floor', steps: [
    { id: 'place', title: 'Place a base cabinet',
      body: 'Place a base cabinet (F3). Anything from Base, or a starting point from the Vanity section. If it’s in a kick run, detach it first.',
      canvas: true, done: (c, s) => c.cabinets.length > s.cabinets.length },
    { id: 'float', title: 'Tick Floating',
      body: 'Select it. In the cabinet panel, tick Floating (wall-hung, no kick). The kick goes, the box keeps its size, and it hangs 300 off the floor (change that in Elevation from floor). There’s no bottom panel. The gable tops and bottoms and the bottom edge of the back are taped, and the doors finish flush with the carcass bottom.',
      canvas: true, done: c => c.cabinets.some(cab => !!cab.rule_overrides?.FLOAT) },
    { id: 'bottom', title: 'Optional: add a bottom panel',
      body: 'Tick Bottom panel to put an exposed-board bottom under the gables, taped front and ends. The gables sit on it, so the overall height stays the same. To keep it as a starting point, right-click → Save to library and pick the Vanity section.',
      canvas: true, done: c => c.cabinets.some(cab => !!cab.rule_overrides?.FLOAT_BOTTOM) },
  ]},
]

export const stepKey = (lesson: TutorialLesson, step: TutorialStep) => `${lesson.id}/${step.id}`
/** Tutorials matching every word of the query (title, blurb, keywords, step titles). */
export function searchLessons(query: string): number[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return LESSONS.flatMap((l, i) => {
    const text = [l.title, l.blurb, l.keywords ?? '', ...l.steps.map(s => s.title)].join(' ').toLowerCase()
    return words.every(w => text.includes(w)) ? [i] : []
  })
}

export const lessonDone = (lesson: TutorialLesson, done: string[]) => lesson.steps.every(s => done.includes(stepKey(lesson, s)))
