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
export type TutorialTopic = 'room' | 'cabinets' | 'materials' | 'benchtops' | 'appliances' | 'cad' | 'reports' | 'production'

export const TUTORIAL_LEVELS: { id: TutorialLevel; label: string; blurb: string }[] = [
  { id: 'start',        label: 'Getting started', blurb: 'In order — a whole small kitchen, start to finish.' },
  { id: 'basics',       label: 'Basics',          blurb: 'Everyday drawing jobs.' },
  { id: 'intermediate', label: 'Intermediate',    blurb: 'Joins, shapes, kicks and printing.' },
  { id: 'advanced',     label: 'Advanced',        blurb: 'Shape editing and production.' },
]

export const TUTORIAL_TOPICS: { id: TutorialTopic; label: string }[] = [
  { id: 'room',       label: 'Room' },
  { id: 'cabinets',   label: 'Cabinets' },
  { id: 'materials',  label: 'Materials & colours' },
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
      body: 'Press F7 again, or Esc until the CAD tools close. Plan notes print on the Plan View report; notes drawn on an elevation print on that wall\'s page of the Elevation Views report and on its shop-drawing sheet. Tick Annotation colours on either report to print them in colour.',
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
    keywords: 'floating vanity wall hung no kick bathroom bottom under panel BUP edge tape gable underside elevation off floor', steps: [
    { id: 'place', title: 'Place a base cabinet',
      body: 'Place a base cabinet (F3). Anything from Base, or a starting point from the Vanity section. If it’s in a kick run, detach it first.',
      canvas: true, done: (c, s) => c.cabinets.length > s.cabinets.length },
    { id: 'float', title: 'Tick Floating',
      body: 'Select it. In the cabinet panel, tick Floating (wall-hung, no kick). The kick goes, the box keeps its size, and it hangs 300 off the floor (change that in Elevation from floor). It keeps its carcass bottom, between the gables. The gable tops and bottoms are taped, and the doors finish flush with the carcass bottom.',
      canvas: true, done: c => c.cabinets.some(cab => !!cab.rule_overrides?.FLOAT) },
    { id: 'bottom', title: 'Optional: sit it on an under panel',
      body: 'For an exposed panel under the whole run, Shift-click the cabinets (not the end panels), right-click one → Add under panel. It places a BUP between the end panels, at carcass depth, and gives each cabinet a bottom scribe of the panel thickness (Scribe Bottom, under Case Scribes). The fronts still run down over the panel edge. Delete the BUP and the scribes go with it. Overheads work the same way (WUP). To keep a vanity as a starting point, right-click → Save to library and pick the Vanity section.',
      canvas: true, done: c => c.cabinets.some(cab => !!cab.rule_overrides?.UNDER_PANEL) },
  ]},

  // Appended 2026-10-21 (group panel — shared Off wall field).
  { id: 'group_off_wall', level: 'intermediate', topic: 'cabinets', title: 'Move a group off the wall',
    blurb: 'Select several cabinets on one wall and set how far they all stand off it.',
    keywords: 'group multi select shift click several cabinets off wall distance gap move together clearance', steps: [
    { id: 'select', title: 'Select the cabinets',
      body: 'Click a cabinet, then Shift-click the others on the same wall. The right-hand panel changes to "N cabinets selected".',
      canvas: true, done: c => c.selected?.type === 'cabinet' },
    { id: 'offwall', title: 'Change Off wall',
      body: 'Under Clearance, Off wall shows how far they stand off the wall — it only appears when they’re all the same distance off. Type a new value and they all move out (or back) together, each keeping its place along the wall.',
      canvas: true, done: (c, s) => c.cabinets.some(cab => { const o = s.cabinets.find(x => x.id === cab.id); return !!o && (o.pos_x !== cab.pos_x || o.pos_y !== cab.pos_y) }) },
  ]},

  // Appended 2026-10-21 (elevation height chain for raised cabinets + bench / basin dims).
  { id: 'bench_basin_heights', level: 'intermediate', topic: 'reports', title: 'Bench and basin heights in elevation',
    blurb: 'Read how high a vanity hangs, and dimension the bench and basin heights.',
    keywords: 'elevation dimension height bench benchtop basin vanity floating off floor layer chain', steps: [
    { id: 'elevation', title: 'Open the elevation',
      body: 'Select the wall with the vanity and click Elevation. The height chain on the left starts at the floor: for a floating cabinet it shows the gap under it (300), then the cabinet height, then the rest of the wall.',
      target: 'view-elevation', canvas: true, done: c => c.view === 'elevation' },
    { id: 'bench', title: 'Bench and basin heights',
      body: 'Outside the height chain are two dimensions from the floor: one to the top of the benchtop, and one to the rim of a basin standing on it. They need a benchtop drawn on that wall. Undermount sinks don’t get the second one.',
      canvas: true, done: c => c.view === 'elevation' },
    { id: 'layer', title: 'Turn them on or off',
      body: 'Open Layers → Dimensions and untick Bench & basin heights to hide them. The setting is per layer set, so a print layer set can show them while your working set hides them. The Elevation Views report follows the layer set you pick there.',
      target: 'menu-Layers', canvas: true, done: c => c.view === 'elevation' },
  ]},

  // Appended 2026-10-21 (z_CAD_tool phase C — CAD blocks + live fields).
  { id: 'cad_spec_block', level: 'intermediate', topic: 'cad', title: 'Drop in the spec block',
    blurb: 'Insert the finishes spec block on the plan; its fields fill in from the job.',
    keywords: 'cad block blocks spec specification finishes schedule notes fields template save library benchtop fronts handles runners hinges', steps: [
    { id: 'open', title: 'Turn on CAD mode',
      body: 'Open the Plan and press F7. The CAD panel opens on the right.',
      target: 'tool-cad', canvas: true, done: c => c.mode === 'cad' },
    { id: 'insert', title: 'Insert the Spec block',
      body: 'In the CAD panel, under CAD blocks, click Spec block. It drops in to the right of the walls, clear of the dimensions and any other notes, and stays selected so you can drag it.',
      canvas: true, done: (c, s) => notes(c, true) > notes(s, true) },
    { id: 'fields', title: 'Fields fill themselves in',
      body: 'Words in curly brackets, like {benchtop} or {runners}, are fields: they show this job’s values and change when the job does. Double-click the block to edit it. Type extra words next to a field (e.g. the stone colour after {benchtop}), or click a field in the Fields list to add one where the cursor is.',
      canvas: true, done: c => c.mode === 'cad' },
    { id: 'save', title: 'Save your own blocks',
      body: 'Select any notes or markup (a north arrow, a standard note), right-click and choose Save as CAD block…, then name it. Every user gets it in their CAD blocks list.',
      canvas: true, done: c => c.mode === 'cad' },
  ]},
  { id: 'shop_drawings', level: 'intermediate', topic: 'reports', title: 'Print shop drawings',
    blurb: 'One PDF for the room: plan + elevations, one scale, company title block.', keywords: 'shop drawings pdf print plan elevation title block sheet package client', steps: [
    { id: 'open', title: 'Production → Shop Drawings…',
      body: 'Click Production in the menu bar and choose Shop Drawings…. It opens the room\'s reports on the Shop Drawings package.',
      target: 'menu-Production', canvas: true, done: c => c.report === 'shop_drawings' },
    { id: 'sheets', title: 'Pick scale, paper and sheets',
      body: 'Every sheet prints at the same scale (1:20 on A3 is usual). Tick the sheets you want: the plan and each wall. If a sheet won\'t fit, it\'s named in the warning: pick bigger paper or a larger scale number.',
      canvas: true, done: c => c.report === 'shop_drawings' },
    { id: 'download', title: 'Download the PDF',
      body: 'Click Download PDF. Each page has its heading, the drawing at true scale, and your company title block (Settings → Company) with Sheet n of N.',
      target: 'shop-download', canvas: true, done: (c, s) => ev(c, 'shop_pdf') > ev(s, 'shop_pdf') },
  ]},

  // Appended 2026-10-21 (fixtures: shift-pick, align, lock together).
  { id: 'fixture_align_lock', level: 'intermediate', topic: 'appliances', title: 'Line up and lock a basin and tap',
    blurb: 'Shift-click fixtures, line them up with one of them, then lock them so they move together.',
    keywords: 'fixture multi select shift click align centre centres edges height lock group unlock basin tap sink move together', steps: [
    { id: 'pick', title: 'Shift-click two fixtures',
      body: 'In plan or elevation, click a basin, then Shift+click its tap. Both light up. Shift+click one again to drop it from the pick.',
      canvas: true, done: c => c.selected?.type === 'fixture' },
    { id: 'align', title: 'Right-click the one to line up with',
      body: 'Right-click the basin and open Align 1 to this. The basin stays put and the tap moves: Centres along the wall puts the tap over the basin; front-to-back, left / right edges and same height work the same way.',
      canvas: true, done: c => c.selected?.type === 'fixture' },
    { id: 'lock', title: 'Lock them together',
      body: 'With both still picked, right-click and choose Lock 2 together. Now move, nudge or turn either one and the other comes too. If the basin follows its vanity, so does the tap. Click one later and its locked partner lights up. To split them, right-click and choose Unlock.',
      canvas: true, done: c => c.fixtures.some(f => !!f.lock_group) },
  ]},

  { id: 'shop_3d_view', level: 'intermediate', topic: 'reports', title: 'Add a 3D view to the shop drawings',
    blurb: 'Save your own 3D angle for the Shop Drawings 3D sheet.', keywords: 'shop drawings 3d view angle camera save perspective sheet', steps: [
    { id: 'open', title: 'Go to 3D',
      body: 'Click 3D. Orbit to the angle you want; right-click a wall area to hide walls that are in the way.',
      target: 'view-3d', canvas: true, done: c => c.view === '3d' },
    { id: 'save', title: 'Right-click → Save view for shop drawings',
      body: 'Right-click empty space and choose Save view for shop drawings. It keeps this angle and the walls you have hidden.',
      canvas: true, done: (c, s) => ev(c, 'shop_view_saved') > ev(s, 'shop_view_saved') },
    { id: 'print', title: 'It prints with the 3D views',
      body: 'Production → Shop Drawings…: your view is in the 3D views row (✕ removes it). Small rooms put 4 views on a sheet, bigger rooms 2.',
      target: 'menu-Production', canvas: true, done: c => c.report === 'shop_drawings' },
    { id: 'render', title: 'Try it in colour (trial)',
      body: 'Reports → Room Reports… → 3D Colour Render shows the same views shaded in the job colours, one per page. Untick a view to leave it out; Re-render after changing the room.',
      canvas: true, done: () => true },
  ]},
  { id: 'move_label', level: 'basics', topic: 'cabinets', title: 'Move a cabinet or fixture name',
    blurb: 'Move a name clear of other lines on plan or elevation; the PDFs follow.', keywords: 'label name move drag position text cabinet fixture plan elevation reset', steps: [
    { id: 'menu', title: 'Right-click → Move label',
      body: 'Right-click a cabinet or fixture and choose Move label. Its name gets an orange dashed box.',
      canvas: true, done: () => true },
    { id: 'place', title: 'Move the mouse, click to place',
      body: 'The name follows the mouse — click to drop it there (Esc or right-click cancels). Plan and elevation each keep their own spot, and the Plan / Elevation / Shop Drawings PDFs print it there.',
      canvas: true, done: (c, s) => ev(c, 'label_moved') > ev(s, 'label_moved') },
    { id: 'reset', title: 'Right-click → Reset label position',
      body: 'To put a name back where it started, right-click the item and choose Reset label position.',
      canvas: true, done: () => true },
  ]},
  { id: 'centre_room', level: 'basics', topic: 'room', title: 'Centre the room on screen',
    blurb: 'Lost the drawing? Room → Centre Room brings the whole job back to the middle.', keywords: 'center centre room zoom fit screen lost view pan extents', steps: [
    { id: 'centre', title: 'Room → Centre Room',
      body: 'Open the Room menu and choose Centre Room. The plan zooms out to fit everything in the room — walls, cabinets, benchtops, fixtures and CAD notes like the spec block — and centres it. From an elevation or 3D it goes back to plan first.',
      target: 'menu-Room', canvas: true, done: () => true },
  ]},

  // Appended 2026-10-22 (z_floating_shelf — FLSHLF).
  { id: 'floating_shelf', level: 'intermediate', topic: 'cabinets', title: 'Add a floating shelf',
    blurb: 'A thick glued-up shelf on a hidden cleat, with seen sides and the cleat slot set per shelf.',
    keywords: 'floating shelf FLSHLF thick glue up build up double triple strips cleat rebate pocket slot seen side wide tape edge open shelves', steps: [
    { id: 'place', title: 'Place FLSHLF',
      body: 'Press F3 and open Wall → Open Shelves. Pick FLSHLF and click a wall. Its underside starts level with the bottom of the overheads. It sits at its own height, so change Elevation from floor to put it anywhere, even below the overheads. It doesn’t push other cabinets along the wall.',
      canvas: true, done: c => c.cabinets.some(cab => !!cab.float_shelf) },
    { id: 'seen', title: 'Tick the seen sides',
      body: 'Select it. Under Floating shelf, tick Seen left / Seen right for any end you can see (or right-click → Floating shelf). A seen end gets the wide tape and no cleat slot, and the back slot stops 30 short of it. An unseen end gets a slot for a side cleat. The front and underside are always seen.',
      canvas: true, done: c => c.cabinets.some(cab => !!cab.float_shelf?.seen_left || !!cab.float_shelf?.seen_right) },
    { id: 'build', title: 'Pick the build',
      body: 'Double is two boards of the exposed colour glued together (2 × 16.5 = 33). Triple build-up adds a middle layer of strips: front and back rails, side strips and cross strips. It keeps the weight down. Triple solid is three full boards. The height follows the board thickness. Rebate depth (30) and height (10 into each board) set the cleat slot. The cleats are listed for hand cutting and never go to the CNC. Every board is marked “build up then edge”.',
      canvas: true, done: c => c.cabinets.some(cab => !!cab.float_shelf && cab.float_shelf.build !== 'double') },
  ]},

  // Appended 2026-10-22 (HANGING_RAIL_OVAL accessory, RHK6581 Bed 2).
  { id: 'hanging_rail', level: 'intermediate', topic: 'cabinets', title: 'Add a hanging rail',
    blurb: 'Put a 30 × 15 oval robe rail under a shelf.', keywords: 'hanging rail robe wardrobe oval hang coat accessory internals', steps: [
    { id: 'open', title: 'Open the cabinet',
      body: 'Double-click a robe cupboard to open it, and go to the internals.',
      canvas: true, done: c => c.cabEditorOpen },
    { id: 'add', title: 'Add → Hanging rail',
      body: 'Click the opening under the shelf, then Add → Hanging rail. The rail runs wall to wall, centred in the depth, 60 under the top of the opening. Lock its height to put it somewhere else. It’s hardware, so it never goes to the CNC or the cut list.',
      canvas: true, done: c => c.cabEditorOpen },
  ]},

  // Appended 2026-10-24 (z_island_back_panel — IBPF / IBPK).
  { id: 'island_back_panel', level: 'intermediate', topic: 'cabinets', title: 'Add an island back panel',
    blurb: 'Clad the back of an island run in the exposed board, split at the sheet width.',
    keywords: 'island back panel IBPF IBPK floor kick sheet width grain split join exposed end panels', steps: [
    { id: 'place', title: 'Place IBPF or IBPK on the island back',
      body: 'Press F3 and open Base → End Panels. Pick IBPF (runs to the floor) or IBPK (stands on the kick), then click the back side of the island line. Set its width to cover the run, end panels included. Its depth follows the exposed board, and its height follows the base cabinets.',
      canvas: true, done: c => c.cabinets.some(cab => !!cab.back_panel) },
    { id: 'sheet', title: 'Set the sheet width',
      body: 'Select it. Under Island back panel, Sheet width (1200) is the widest piece the board allows. A wider panel splits into equal pieces with the grain running up, e.g. 2500 makes 3 × 833. Every edge is taped, joins included. The bottom edge is taped only when it stands on the kick. Switch To floor / To kick here too.',
      canvas: true, done: c => c.cabinets.some(cab => !!cab.back_panel && (cab.back_panel.sheet_w !== 1200 || cab.back_panel.mount === 'kick')) },
  ]},

  // Appended 2026-10-24 (z_curved_end C7 — BHCRVFIXP; z_bulkhead B7 — shadowline split).
  { id: 'curved_bulkhead', level: 'advanced', topic: 'cabinets', title: 'Put a curved bulkhead over a curved end',
    blurb: 'Carry a curved end up to the ceiling with a curved bulkhead, with a shadow gap above the cupboards.',
    keywords: 'curved bulkhead BHCRVFIXP curved end TCRVFIXP radius ceiling shadowline split shadow gap rail MDF 10 ribs', steps: [
    { id: 'place', title: 'Place BHCRVFIXP over the curved end',
      body: 'Press F3 and open Wall → Bulkheads. Pick BHCRVFIXP and click it over a curved end (e.g. a TCRVFIXP), the same width. It hangs from the ceiling and fills down to the wall-cabinet top, like a straight bulkhead.',
      canvas: true, done: c => c.cabinets.some(cab => !!cab.bulkhead && !!cab.curved_end) },
    { id: 'match', title: 'Match the curve below',
      body: 'Select it. In the curved end section, set the same curve side and Radius as the curved end below, and give it the same depth, so it runs up as one curve. It’s built the same way: face board pocketed to bend, top and bottom formers, fixing panel and back. Ribs default to 0; untick Auto to type a count (any curved end). Put a straight BH (front Flush with overhead doors) beside it; its face board butts into the straight bulkhead.',
      canvas: true, done: c => c.cabinets.some(cab => !!cab.bulkhead && !!cab.curved_end && cab.curved_end.R !== 150) },
    { id: 'split', title: 'Tick Shadowline split',
      body: 'In the bulkhead section, tick Shadowline split on both bulkheads. A 60-wide MDF 10mm rail goes under each, 10 back from the face, and the bulkhead builds above it, so a 10 shadow shows over the cupboards. On the curved bulkhead the rail follows the front, the curve and the side. Change the rail width, setback or board there.',
      canvas: true, done: c => c.cabinets.some(cab => !!cab.bulkhead?.split?.on) },
  ]},

  // Appended 2026-10-24 (per-class face reveals in Job / Room Properties).
  { id: 'class_reveals', level: 'intermediate', topic: 'room', title: 'Set face reveals per cabinet type',
    blurb: 'Base, wall and tall reveals come from the cabinet builder; change one type for a job or a room.',
    keywords: 'reveal reveals gap face door top bottom end base wall tall job room properties construction cabinet builder override', steps: [
    { id: 'set', title: 'Change a reveal for one cabinet type',
      body: 'Open Job Properties → Cabinet Standards → Construction Methods (or Room Properties → Construction). Under Face Reveals each row has a Base, Wall and Tall column, filled from the cabinet builder. Type a new value in one column, e.g. Wall top reveal 0, and Save. Blue means overridden; clear the field to follow the builder (or the job, in a room) again. The Overrides tab lists them.',
      canvas: true, done: (c, s) => ev(c, 'class_reveals_saved') > ev(s, 'class_reveals_saved') },
  ]},

  // Appended 2026-10-25 (z_cabinet_split — height split at a fixed shelf).
  { id: 'cabinet_height_split', level: 'intermediate', topic: 'cabinets', title: 'Split a tall cabinet in height',
    blurb: 'Make a tall unit in two pieces, cut at a fixed shelf so the upper sides drop over a 3 mm lip.',
    keywords: 'split height cut tall two pieces sections fixed shelf lip 3mm sides back carry under stair upper lower', steps: [
    { id: 'split', title: 'Right-click → Split cabinet height',
      body: 'Right-click a tall cabinet with fixed shelves and pick Split cabinet height. It cuts the sides and back 3 mm below the top of the fixed shelf nearest the middle: the shelf stays with the lower section, 3 mm proud, and the upper sides drop over it. Doors stay full height. A red SPLIT line shows the cut in elevation.',
      canvas: true, done: c => c.cabinets.some(cab => !!cab.split?.at?.length) },
    { id: 'move', title: 'Move the cut',
      body: 'With the cabinet selected, the sidebar’s Height split section lists the cut (height from the cabinet bottom and off the floor). Click a Shelf button to cut at another fixed shelf, type a height, or drag the red line in elevation — it snaps to the shelves. + Add cut makes a third section; Remove split joins it back up.',
      canvas: true, done: c => c.cabinets.some(cab => !!cab.split?.at?.length) },
    { id: 'parts', title: 'Check the pieces',
      body: 'The cut list and the cabinet sheet show the sides and back as (lower) and (upper) pieces, and each piece keeps its own shelf and top holes. Nothing is drilled across the cut — it’s fixed by hand.',
      canvas: true, done: c => c.cabinets.some(cab => !!cab.split?.at?.length) },
  ]},

  // Appended 2026-10-25 (fixed shelf → back construction holes).
  { id: 'fixed_shelf_back_joint', level: 'advanced', topic: 'production', title: 'Fixed shelf holes into the back',
    blurb: 'Fixed shelves screw through the back as well as the gables — set or change that joint.',
    keywords: 'fixed shelf back construction holes screws dynamic joint drilling back edge construction method', steps: [
    { id: 'open', title: 'Open the construction method',
      body: 'Go to Library → Construction Methods, pick a method and open its Joints section. Under Fixed Shelf there is now a Back edge row beside Side supports.',
      done: c => c.path.startsWith('/library/construction-methods') },
    { id: 'joint', title: 'Pick the back joint (or leave it)',
      body: 'Left blank, the back edge uses the same joint as the sides, so fixed shelves get the same holes through the back as through the gables. Pick a different joint to drill the back another way. Holes only go in when the shelf sits hard against the back: a shelf with a back setback, or a cabinet with no back, gets none. To turn it off for one cabinet, select the back (or the shelf) in the cabinet edit modal and click ✕ on its Fixed Shelf row to suppress it.',
      done: c => c.path.startsWith('/library/construction-methods') },
  ]},

  // Appended 2026-10-25 (z_material_colours MC8 — job colours + board colours).
  { id: 'job_colours', level: 'basics', topic: 'materials', title: 'Pick the job colours',
    blurb: 'Board + colour for doors, exposed panels and interior, per base / wall / tall.',
    keywords: 'colour color material board finish doors drawers exposed interior laminex polytec woodmatt grain job room', steps: [
    { id: 'open', title: 'Open the job’s materials',
      body: 'Click Job in the menu bar → Cabinet Standards, then the Material Schedules tab. The Materials grid at the top is the job’s main picks: Doors / drawers, Interior and Exposed, each for Base, Wall and Tall cabinets.',
      target: 'menu-Job', canvas: true, done: (c, s) => ev(c, 'job_materials_tab') > ev(s, 'job_materials_tab') },
    { id: 'board', title: 'Pick a board',
      body: 'In the Base column, pick a board for Doors / drawers or Exposed — e.g. PT Woodmatt 16mm. A board with colours shows a second box in amber: "choose colour". Until you choose, the cabinets use the board’s default colour and show a "colour not chosen" warning (also in the CNC nest). A blank Doors / drawers cell keeps the Doors tab colour.',
      canvas: true, done: (c, s) => ev(c, 'mat_board_pick') > ev(s, 'mat_board_pick') },
    { id: 'colour', title: 'Pick its colour',
      body: 'Choose the colour in the second box — e.g. Boston Oak Woodmatt. It turns blue: that exact colour is now the job’s pick, and it nests on its own sheets.',
      canvas: true, done: (c, s) => ev(c, 'mat_colour_pick') > ev(s, 'mat_colour_pick') },
    { id: 'copy', title: 'Same colour on wall and tall',
      body: 'For a one-colour job, click "Copy to wall & tall →" under the base pick. Interior is its own row — usually Whiteboard, change it for a grey interior.',
      canvas: true, done: (c, s) => ev(c, 'mat_copy_classes') > ev(s, 'mat_copy_classes') },
    { id: 'save', title: 'Save, then look in 3D',
      body: 'Click Save — every cabinet updates to the new colours. Then click 3D: grained colours show grain lines. One room different? Room → Properties → Materials overrides any cell for that room.',
      target: 'view-3d', canvas: true, done: (c, s) => ev(c, 'props_saved') > ev(s, 'props_saved') && c.view === '3d' },
  ]},

  { id: 'board_colours', level: 'intermediate', topic: 'materials', title: 'Add colours to a board',
    blurb: 'One board in the library, its colours listed under it.',
    keywords: 'colour color library board stock materials laminex polytec default tape edgeband grain back face', steps: [
    { id: 'open', title: 'Open Board Stock',
      body: 'Go to Library → Materials. The Board Stock tab lists boards only; a chip shows how many colours each has.',
      done: c => c.path.startsWith('/library/materials') },
    { id: 'add', title: 'Add a colour',
      body: 'Click a board (e.g. PT Woodmatt 16mm) — its Colours panel opens under the form. Type a colour name and click + Add colour. Thickness, CNC settings and sheet size come from the board; edit those on the board and every colour follows.',
      done: (c, s) => ev(c, 'board_colour_added') > ev(s, 'board_colour_added') },
    { id: 'set', title: 'Set it up',
      body: 'Set the face colour swatch, tick Grain for a timber grain, pick its matching tape, and its $/sheet. Back blank = same as face. The Default radio is the colour used when a job picks the board without a colour. Changes save as you leave each field.',
      done: (c, s) => ev(c, 'board_colour_added') > ev(s, 'board_colour_added') },
  ]},

  // Appended 2026-10-25 (z_handles H9 / D17 — linear strip handles).
  { id: 'linear_handles', level: 'intermediate', topic: 'cabinets', title: 'Linear strip handles',
    blurb: 'A 35 strip of the door colour along every front, sharknose underneath, screwed from the back.',
    keywords: 'linear handle strip g handle sharknose finger pull door material full length length override shorten lengthen screws holes', steps: [
    { id: 'schedule', title: 'Pick the strip handle schedule',
      body: 'Job → Cabinet Standards → Material Schedules (or Room → Properties for one room): set Handles to "Linear sharknose strip 35". Base doors and drawers get a strip flush with their top edge, tall doors a full-height strip on the non-hinged edge, overheads stay push-to-open. Save.',
      target: 'menu-Job', canvas: true, done: (c, s) => ev(c, 'props_saved') > ev(s, 'props_saved') },
    { id: 'look', title: 'See the strips',
      body: 'Click Elevation. Each strip is the door’s own colour, 35 wide, standing on the face, with its screw holes (from the back of the door, max 350 apart). The cut list names them Linear Handle 1, 2… with the sharknose edge to saw; tape is on the top edge and both ends.',
      target: 'view-elevation', canvas: true, done: c => c.view === 'elevation' },
    { id: 'length', title: 'Shorten or lengthen one',
      body: 'Double-click a cabinet → Fronts, click a door or drawer front, and under Handle type a Length. It turns amber (an override) — ↺ puts it back to full length. A shorter strip keeps to the non-hinged side on doors, centres on drawers, and hangs from the top on tall doors; the second box moves it in. Handle holes → Don’t drill turns the screw holes off, like any handle.',
      canvas: true, done: (c, s) => ev(c, 'handle_length_set') > ev(s, 'handle_length_set') },
  ]},

  // Appended 2026-10-25 (z_section_view X7 — cross section in elevation).
  { id: 'cross_section', level: 'basics', topic: 'room', title: 'Cross section through a wall',
    blurb: 'Slide a cut line along an elevation and see every part it passes through, side-on.',
    keywords: 'section cut side view profile depth slice elevation', steps: [
    { id: 'elev', title: 'Open an elevation',
      body: 'Click Elevation and pick a wall with cabinets on it.',
      target: 'view-elevation', canvas: true, done: c => c.view === 'elevation' },
    { id: 'on', title: 'Turn on Cross section',
      body: 'Click Cross section in the elevation toolbar (next to Section). The side-on cut fills the canvas: the wall hatched, and every cabinet part, kick, front, benchtop, hinge, handle, runner and fixture (sinks, appliances) the cut passes through in its true shape, coloured like the elevation. The elevation moves to the right-hand column with a purple dashed line across the wall where the cut is.',
      canvas: true, done: (c, s) => ev(c, 'xsec_on') > ev(s, 'xsec_on') },
    { id: 'drag', title: 'Slide the line',
      body: 'Drag the purple line along the wall in the right-hand elevation (or type a distance in the At box) and watch the cut change. In the section, scroll to zoom in, drag to move around, double-click to fit it again. Hover a shape to see which cabinet and part it is; click it to select that cabinet.',
      canvas: true, done: (c, s) => ev(c, 'xsec_moved') > ev(s, 'xsec_moved') },
    { id: 'flip', title: 'Look the other way',
      body: 'Click Flip. The arrow shows which end of the wall you are looking toward: → has the wall on the left, ← has it on the right. The cut follows the elevation layer set: change the layer set (or an item colour) and the section changes with it. Close puts the elevation back in the canvas.',
      canvas: true, done: (c, s) => ev(c, 'xsec_flip') > ev(s, 'xsec_flip') },
  ]},
  { id: 'cad_appliance_block', level: 'intermediate', topic: 'cad', title: 'Appliance + sink spec block',
    blurb: 'List the sinks, taps and appliances placed in the room on the plan.',
    keywords: 'cad block spec appliances sink sinks tap taps tapware oven cooktop rangehood dishwasher fixtures schedule model', steps: [
    { id: 'open', title: 'Turn on CAD mode',
      body: 'Open the Plan and press F7. The CAD panel opens on the right.',
      target: 'tool-cad', canvas: true, done: c => c.mode === 'cad' },
    { id: 'insert', title: 'Insert the Appliance spec block',
      body: 'Under CAD blocks, click Appliance spec block. It drops in to the right of the walls, below the finishes Spec block if there is one.',
      canvas: true, done: (c, s) => notes(c, true) > notes(s, true) },
    { id: 'fields', title: 'It lists what you placed',
      body: 'Each section fills from the fixtures in the room: name, brand, model no. and W x D x H, with "2 x" for repeats. If the sink or tap is only a stand-in, type what to show in the fixture’s Label (e.g. "Sink TBC by client"); ✕ Remove override under the field puts the model back. Place or swap a fixture and the block follows. A section with nothing placed shows "-": double-click the block and delete that section.',
      canvas: true, done: c => c.mode === 'cad' },
  ]},

  // Appended 2026-10-25 (z_accessories — Accessories library, hanging rails).
  { id: 'accessories_library', level: 'intermediate', topic: 'cabinets', title: 'Hanging rails from the library',
    blurb: 'Keep your robe rails (and their supports) in Library → Materials → Accessories and pick one per rail.',
    keywords: 'accessories accessory hanging rail robe wardrobe oval supports end support centre pillar library misc', steps: [
    { id: 'tab', title: 'Open the Accessories tab',
      body: 'Go to Library → Materials and click Accessories. Rails are Category "Hanging rail": W and H are the profile size the rail is drawn at (oval 15 × 30), Bar mm the length you buy, Colour how it shows in 3D. Supports are their own rows ("Rail support") — pick them in a rail’s End support / Centre support. Tick Default on the rail most jobs use.',
      done: c => c.path.startsWith('/library/materials') },
    { id: 'pick', title: 'Pick a rail in a cupboard',
      body: 'Open a robe cupboard, go to the internals and click its hanging rail (or Add → Hanging rail). The Rail select says Default (the ticked rail) — pick another rail to change just this one. The rail takes that rail’s size and colour.',
      canvas: true, done: (c, s) => ev(c, 'rail_product_set') > ev(s, 'rail_product_set') },
  ]},
  // Appended 2026-10-25 (z_accessories A6 / A8 — rail supports + end support drilling).
  { id: 'rail_supports', level: 'intermediate', topic: 'cabinets', title: 'Hanging rail supports and drilling',
    blurb: 'Rails place their own end supports and centre pillars; end supports prick their screw holes in the gables.',
    keywords: 'hanging rail supports end support end pillar centre pillar drilling joint gable prick holes robe wardrobe', steps: [
    { id: 'supports', title: 'Set a rail’s supports',
      body: 'Open a robe cupboard, go to the internals and click its hanging rail. Each end gets an End support (screwed to the gable) unless you pick End pillar — use that for an open end or where another rail runs the other way — or None. Centre pillars are added one per 1000 of rail; type a number to override. A rail with pillars hangs with its centre 50 below the shelf so the pillars fit as sold. The rail is cut 5 short at each end support. Move the rail up or down and the supports go with it. The rail and supports draw from their library models (Finista chrome).',
      canvas: true, done: (c, s) => ev(c, 'rail_supports_set') > ev(s, 'rail_supports_set') },
    { id: 'drill', title: 'End support holes',
      body: 'With “Drill end support holes” ticked, each end support pricks two holes 32 apart, one above the other, 1 deep into the gable — 10 up from the bottom of the 42 support (4 and 36 above the rail bottom). Turn on Drilling in the 3D view to see them. The pattern is the “Finista end support” joint in Library → Joints; change it there and every rail follows.',
      canvas: true, done: (c, s) => ev(c, 'rail_supports_set') > ev(s, 'rail_supports_set') },
  ]},
  // Appended 2026-10-25 (z_item_cad IC1 — CAD drawn on a cabinet, item CAD in the library).
  { id: 'item_cad', level: 'intermediate', topic: 'cad', title: 'Notes that come with a cabinet (item CAD)',
    blurb: 'Draw a note on a cabinet in its edit window, e.g. PULLOUT BIN, and move it to the library so every bin front shows it.',
    keywords: 'item cad cabinet notes library bin front pullout pull out bin label elevation edit window f7 attach code', steps: [
    { id: 'open', title: 'Open the cabinet, Elevation tab, CAD',
      body: 'Double-click a bin cabinet to open its edit window. On the Elevation tab press F7 (or click CAD next to Measure). The CAD tools open on the left, the CAD panel on the right.',
      canvas: true, done: (c, s) => ev(c, 'item_cad_on') > ev(s, 'item_cad_on') },
    { id: 'draw', title: 'Draw the note on the front',
      body: 'Pick the Text tool (T) and click on the bin front, then type PULLOUT BIN and press Ctrl+Enter. Notes drawn here belong to this cabinet only, and show on the room elevation with it. While typing, click {bin} under This cabinet in the Fields list to add the bin’s name (e.g. Nikpol Teramo 74L): each cabinet shows its own bin. {code}, {w}, {h} and {d} work the same way.',
      canvas: true, done: (c, s) => ev(c, 'item_cad_on') > ev(s, 'item_cad_on') },
    { id: 'move', title: 'Move it to the library',
      body: 'Select the note (Ctrl+A selects them all), then in the Item CAD bar click Bin front (all cabinets). Now every cabinet with a bin front draws it, sitting in the same place on the front at any width. The dashed blue boxes show where library notes can attach. Pick the cabinet code button instead to attach it to that cabinet type only.',
      canvas: true, done: (c, s) => ev(c, 'item_cad_moved') > ev(s, 'item_cad_moved') },
    { id: 'jobs', title: 'One cabinet, the library, and older jobs',
      body: 'For one cabinet only: Hide here stops it drawing the library notes (Show here brings them back), and Detach copies them onto the cabinet so you can change them for this job. For everyone: Edit brings the library notes back onto this cabinet to change, then Move to library again; Remove takes them out of the library. Jobs already drawn keep the notes they had: library changes never change an old job by themselves.',
      canvas: true, done: (c, s) => ev(c, 'item_cad_moved') > ev(s, 'item_cad_moved') },
  ]},

  // Appended 2026-10-25 (z_handles H5c / D18 — cabinet-wide handle position).
  { id: 'cabinet_handle_position', level: 'intermediate', topic: 'cabinets', title: 'Move every handle on a cabinet',
    blurb: 'Set how far the handles sit from the edge for one whole cabinet, without touching each door.',
    keywords: 'handle position offset inset move down up from edge from side cabinet all doors drawers override schedule', steps: [
    { id: 'set', title: 'Edit position',
      body: 'Click a cabinet. In the right-hand panel, under Handle schedule, click ▸ Edit position. Type a From grip edge (e.g. 80) — every door and drawer handle on this cabinet moves to 80 from its grip edge (top on base and tall, bottom on wall). From side moves door handles in from the non-hinged edge; drawers stay centred. The box turns amber; ↺ goes back to the schedule.',
      canvas: true, done: (c, s) => ev(c, 'cab_handle_pos_set') > ev(s, 'cab_handle_pos_set') },
    { id: 'see', title: 'See it',
      body: 'Double-click the cabinet → Face: the handles are drawn on the fronts. Click one door and set its own From grip edge in the Handle block to move just that door — a door’s own setting beats the cabinet’s.',
      canvas: true, done: (c, s) => ev(c, 'cab_handle_pos_set') > ev(s, 'cab_handle_pos_set') },
  ]},

  // Appended 2026-10-25 (z_part_shape_editor OPTIMISER-PHASE-PLAN O7 — edgeband length report).
  { id: 'edgeband_length', level: 'intermediate', topic: 'reports', title: 'Edgeband metres and cost',
    blurb: 'How many metres of each tape a room or job takes, with waste and cost.',
    keywords: 'edgeband edge band tape metres meters length cost price waste order report abs', steps: [
    { id: 'open', title: 'Open Room Reports',
      body: 'Click Reports in the menu bar and choose Room Reports… (Job Reports… adds up every room).',
      target: 'menu-Reports', canvas: true, done: c => c.report !== null },
    { id: 'pick', title: 'Choose Edgeband Length',
      body: 'In the list on the left, click Edgeband Length. Each tape gets a line with its Finish (a matching tape shows the board colour it goes on, from Job / Room Properties → Materials), parts, finished metres, metres with waste, $/m and cost, then a per-cabinet breakdown. It reads the saved parts the optimiser cuts, so save after changing cabinets. Shaped parts count their banded outline, arcs included.',
      target: 'report-edgeband_length', canvas: true, done: c => c.report === 'edgeband_length' },
    { id: 'print', title: 'Set waste and print',
      body: 'Type the Waste % at the top (it is remembered on this computer, default 10). A tape with no price shows — : set its $/m in Library → Materials → Edge banding. "Tape not set" means a banded edge with no tape chosen. Click Print / PDF.',
      target: 'edgeband-waste', canvas: true, done: (c, s) => ev(c, 'edgeband_print') > ev(s, 'edgeband_print') },
  ]},

  // Appended 2026-10-26 (plan view — pick one of several stacked cabinets).
  { id: 'plan_cabinet_picker', level: 'basics', topic: 'cabinets', title: 'Pick a cabinet that’s under another',
    blurb: 'Where cabinets overlap in plan, choose which one you meant from a list.',
    keywords: 'select pick click overlap stacked under below overhead wall base kick choose list plan', steps: [
    { id: 'pick', title: 'Click where cabinets overlap',
      body: 'In the plan, click a spot where an overhead sits over a base (or a kick under its run). A list pops up with every cabinet under the pointer, top-drawn first: its name, kind and width × depth. Point at a row to see that cabinet light up orange, then click the row to select it. Esc or a click elsewhere closes the list. Shift-click still adds the top cabinet to a multi-select without the list.',
      canvas: true, done: (c, s) => ev(c, 'plan_cab_pick') > ev(s, 'plan_cab_pick') },
  ]},

  // Appended 2026-10-26 (z_section_view R1 — return cabinets cut side-on in the elevation).
  { id: 'return_sections', level: 'basics', topic: 'room', title: 'See the corner cabinets side-on',
    blurb: 'An elevation shows the cabinets on the walls at each end, cut through at this wall’s cabinet depth.',
    keywords: 'return wall corner side on end view section cut tall pantry elevation adjoining next wall', steps: [
    { id: 'elev', title: 'Open an elevation with a corner',
      body: 'Click Elevation and pick a wall that has cabinets on the wall joined to its end (e.g. bases on this wall, talls running into the corner on the next).',
      target: 'view-elevation', canvas: true, done: c => c.view === 'elevation' },
    { id: 'look', title: 'The return cabinets, side-on',
      body: 'In the corner, beside the hatched return wall, the next wall’s cabinets show side-on as a plain outline of each part: everything from the wall out to where this wall’s cabinets come to (their depth: 600-deep bases show the return up to 600). Gables, back, top, bottom, shelves, door and drawer edges, kick and benchtop all show (no hinges or runners); a cabinet that starts past that depth isn’t drawn. They can’t be clicked; select those cabinets on their own wall. They print on the elevation report and the shop drawings too.',
      canvas: true, done: c => c.view === 'elevation' },
    { id: 'layer', title: 'Turn them off',
      body: 'In the Layers drop-down pick Manage layers…, open the Elevation view’s Room group and untick Return cabinet sections to hide them (on screen and in prints that use that layer set). Their parts also follow their own items: untick Doors and the door edges go too.',
      canvas: true, done: c => c.view === 'elevation' },
  ]},

  // Appended 2026-10-26 (z_edgeband_edit EB1 + EB2 — edge banding on the 3D parts).
  { id: 'edgeband_edit', level: 'basics', topic: 'cabinets', title: 'Edge band the parts in 3D',
    blurb: 'See which edges are taped on the cabinet’s parts and change them by clicking the edges.',
    keywords: 'edge banding edgeband tape taped untaped edges paint brush part 3D cabinet edit modal finished edge', steps: [
    { id: 'one', title: 'One part: right-click it',
      body: 'Double-click a cabinet to open it, go to 3D (turn Wire off), and right-click a part. Its four edges show on the part: cyan = taped, rose = no tape (white under the mouse). Click the part menu away, then click an edge to tape or untape it; the Top / Bottom / Left / Right ticks in the part panel follow.',
      canvas: true, done: (c, s) => ev(c, 'edgeband_part_edge') > ev(s, 'edgeband_part_edge') },
    { id: 'paint', title: 'Every part at once',
      body: 'Press Edge banding (bottom right of the 3D view), or right-click a part → Edit edge banding (all parts). Every board part shows its edges. The bar at the top picks what a click does: Toggle flips the edge, Edge tapes it, No edge removes the tape.',
      canvas: true, done: (c, s) => ev(c, 'edgeband_paint') > ev(s, 'edgeband_paint') },
    { id: 'brush', title: 'Paint edges',
      body: 'Click edges to paint them; Shift+click does all four edges of that part. Each click saves straight away and survives rebuilds. Drag to turn the cabinet as usual. Done (or Esc) finishes; hardware and parts with a drawn shape have no edges to click.',
      canvas: true, done: (c, s) => ev(c, 'edgeband_paint_edge') > ev(s, 'edgeband_paint_edge') },
  ]},

  // Appended 2026-10-26 (z_display_layers — wall layers: walls / wall_fill / wall_names).
  { id: 'wall_layers', level: 'basics', topic: 'room', title: 'Wall lines, hatching and names',
    blurb: 'Choose how walls draw in each view: hatch, cross-hatch or solid fill, line colour and weight, or hide them.',
    keywords: 'wall hatch hatching cross-hatch crosshatch solid fill infill poche wall lines outline wall names layer set plan elevation', steps: [
    { id: 'open', title: 'Open the Room group',
      body: 'In the Layers drop-down pick Manage layers…, choose the Plan tab and scroll to the Room group. Walls is the outline of each wall, Wall fill is the infill, Wall names is the name in the wall.',
      target: 'menu-Layers', canvas: true, done: c => c.view === 'plan' },
    { id: 'fill', title: 'Pick the fill',
      body: 'On the Wall fill row, the last drop-down picks Solid, Hatch or Cross-hatch (Default = solid on screen, hatch on the Plan View report). The colour swatch colours it on screen; prints stay black. Untick Wall fill for empty walls, or untick Walls to drop the outline (you can still click the wall to select it). Save the set.',
      canvas: true, done: c => c.view === 'plan' },
    { id: 'elev', title: 'Elevation and reports',
      body: 'On the Elevation tab the same three items drive the cut return walls at each end of an elevation (fill default hatch) and the wall’s outline. The Plan View and Elevation Views reports and shop drawings follow the layer set you pick in their toolbar, so a print set can hatch the walls while your working set keeps them solid.',
      canvas: true, done: c => c.view === 'elevation' },
  ]},

  // Appended 2026-10-27 (elevation — pick a cabinet behind a fixture, or stacked cabinets).
  { id: 'elev_stack_picker', level: 'basics', topic: 'cabinets', title: 'Pick the cabinet behind an appliance',
    blurb: 'In elevation, an integrated dishwasher covers its cabinet — choose which one you meant from a list.',
    keywords: 'select pick click integrated dishwasher appliance fixture panel behind under stacked elevation choose list', steps: [
    { id: 'pick', title: 'Click the appliance in elevation',
      body: 'In elevation, click an integrated dishwasher (or anywhere a fixture sits over a cabinet, or cabinets overlap). A list pops up with the fixtures first, then the cabinets under the pointer. Point at a row to light it up, click it to select. Pick the cabinet to edit its panel. Esc or a click elsewhere closes the list; shift-click still multi-selects without it.',
      canvas: true, done: (c, s) => ev(c, 'elev_stack_pick') > ev(s, 'elev_stack_pick') },
  ]},

  { id: 'benchtop_quote', level: 'intermediate', topic: 'reports', title: 'Send benchtops to the stonemason',
    blurb: 'A plan of just the walls, tops, edges and appliances, plus a schedule — for a stone quote.',
    keywords: 'benchtop stone mason stonemason quote report plan edge profile cutout schedule layer set', steps: [
    { id: 'layer', title: 'Look at it on the canvas',
      body: 'In Plan, pick the Benchtops layer set from the layer set dropdown in the header. You see the walls, each top with its name and edge lengths, the edge profile codes, sinks / hobs / appliances and your CAD notes, with no cabinets. Fix anything that looks wrong before you print.',
      canvas: true, done: () => true },
    { id: 'open', title: 'Open Room Reports',
      body: 'Click Reports in the menu bar and choose Room Reports…',
      target: 'menu-Reports', canvas: true, done: c => c.report !== null },
    { id: 'pick', title: 'Choose Benchtop Quote',
      body: 'In the list on the left, click Benchtop Quote. It starts on the Benchtops layer set; the schedule (area, edges per profile, cutouts) is under the drawing.',
      target: 'report-benchtop_quote', canvas: true, done: c => c.report === 'benchtop_quote' },
    { id: 'download', title: 'Download and send',
      body: 'Set the paper and scale, then Download PDF. Page 1 is the plan, page 2 the schedule. Email it to the stonemason.',
      target: 'plan-download', canvas: true, done: (c, s) => ev(c, 'plan_pdf') > ev(s, 'plan_pdf') },
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
