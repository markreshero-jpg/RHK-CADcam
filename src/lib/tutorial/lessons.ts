// ── Tutorial lessons (z_tutorial/TUTORIAL-SPEC.md) ────────────────────────────
// Each step ticks itself off when done(ctx) turns true. Only the current step is
// checked, so steps run in order. `target` is a data-tour id the panel can
// spotlight; `hints` are plan-view shapes in room mm (TutorialHintsPlan).
// Step ids are stored in userPrefs.tutorial.done — never rename one.

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
  cabEditorOpen: boolean
}

export const EMPTY_CTX: TutorialCtx = {
  path: '', inCanvas: false, mode: 'select', view: 'plan',
  walls: [], cabinets: [], benchtops: [], fixtures: [], cabEditorOpen: false,
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
  /** Only shown while in the canvas; outside it the step says to open a job. */
  canvas?: boolean
  done:   (c: TutorialCtx) => boolean
  hints?: (c: TutorialCtx) => TutorialHint[]
}

export interface TutorialLesson {
  id:    string
  title: string
  steps: TutorialStep[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const isBase = (c: CabinetInstance) => c.assembly_class === 'base' || c.assembly_class === 'base_corner'
const isWallCab = (c: CabinetInstance) => c.assembly_class === 'wall' || c.assembly_class === 'wall_corner'
const bases = (c: TutorialCtx) => c.cabinets.filter(isBase)
const standardWalls = (c: TutorialCtx) => c.walls.filter(w => w.wall_type !== 'island')
const longestWall = (c: TutorialCtx) => standardWalls(c).reduce<Wall | null>((m, w) => (!m || w.length > m.length ? w : m), null)
/** Walls that have at least one base cabinet on them — each wants its own top. */
const wallsWithBases = (c: TutorialCtx) => new Set(bases(c).map(b => b.wall_id).filter(Boolean)).size

/** A strip `depth` mm deep off the wall's room face, from `from` to `to` mm along it. */
function strip(w: Wall, c: TutorialCtx, from: number, to: number, depth: number): Pt[] {
  const d = wallDir(w), n = wallInwardNormal(w, centroid(c.walls))
  const p = (t: number, off: number) => ({ x: w.pos_x + d.x * t + n.x * off, y: w.pos_y + d.y * t + n.y * off })
  return [p(from, 0), p(to, 0), p(to, depth), p(from, depth)]
}

function wallHint(w: Wall | null, label: string): TutorialHint[] {
  return w ? [{ kind: 'wall', a: { x: w.pos_x, y: w.pos_y }, b: wallEnd(w), label }] : []
}

/** Span (mm along the wall) covered by the base cabinets on `w`, from their wall offsets. */
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

// ── Lessons ───────────────────────────────────────────────────────────────────

export const LESSONS: TutorialLesson[] = [
  { id: 'job', title: 'Start a job', steps: [
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

  { id: 'walls', title: 'Draw the walls', steps: [
    { id: 'tool', title: 'Pick the wall tool',
      body: 'Open Wall in the left sidebar (or press F2) and choose Standard Wall.',
      target: 'tool-wall', canvas: true, done: c => c.mode === 'draw_wall' },
    { id: 'draw', title: 'Draw two walls',
      body: 'Click where the first wall starts, then click at each corner. Type a length and press Enter for an exact size. Draw at least two walls, e.g. an L of 3600 and 2400.',
      canvas: true, done: c => c.walls.length >= 2 },
    { id: 'finish', title: 'Finish drawing',
      body: 'Press Esc (or click Select at the top of the sidebar) to stop drawing walls.',
      canvas: true, done: c => c.mode === 'select' && c.walls.length >= 2 },
  ]},

  { id: 'cabinets', title: 'Place cabinets', steps: [
    { id: 'library', title: 'Open the cabinet library',
      body: 'Open Cabinet in the sidebar (F3), go into a base cabinet category and click a cabinet. It follows your cursor.',
      target: 'tool-cabinet', canvas: true, done: c => c.mode.startsWith('place_') && c.mode !== 'place_fixture' },
    { id: 'first', title: 'Drop it against a wall',
      body: 'Move the cabinet up to the highlighted wall — it snaps to the wall face — and click to place it.',
      canvas: true, done: c => bases(c).length >= 1,
      hints: c => wallHint(longestWall(c), 'Place base cabinets along here') },
    { id: 'run', title: 'Make a run of three',
      body: 'Keep clicking to add more cabinets next to the first one — they snap to its side. Esc when you have three base cabinets.',
      canvas: true, done: c => bases(c).length >= 3,
      hints: c => wallHint(longestWall(c), 'Keep going along this wall') },
    { id: 'edit', title: 'Open the cabinet editor',
      body: 'Double-click one of your cabinets. The editor is where you change sizes, doors, drawers and parts. Close it when you have had a look.',
      canvas: true, done: c => c.cabEditorOpen },
    { id: 'upper', title: 'Add a wall cabinet',
      body: 'Back in the library, pick a wall (overhead) cabinet and place it above your base run.',
      target: 'tool-cabinet', canvas: true, done: c => c.cabinets.some(isWallCab) && !c.cabEditorOpen,
      hints: c => wallHint(mainRunWall(c), 'Wall cabinets go above the bases') },
  ]},

  { id: 'benchtops', title: 'Benchtops', steps: [
    { id: 'tool', title: 'Pick Line + Offset',
      body: 'Open Benchtop in the sidebar (F4) and choose Line + Offset. In Benchtop mode only tops can be selected; Esc leaves it.',
      target: 'tool-benchtop', canvas: true, done: c => c.mode === 'draw_benchtop_line' },
    { id: 'first', title: 'Draw a top over the base run',
      body: 'Click the back corners of the run along the wall, then pull out to the depth (or type it) and click.',
      canvas: true, done: c => c.benchtops.length >= 1,
      hints: c => {
        const w = mainRunWall(c); const span = w && baseSpan(w, c)
        return w && span ? [{ kind: 'zone', pts: strip(w, c, span[0], span[1], 600), label: 'Benchtop goes here' }] : []
      } },
    { id: 'per_wall', title: 'One top per wall',
      body: 'If you have base cabinets on another wall, draw a separate top for that wall too. Tops meet at a joint edge in the corner — never draw one continuous L.',
      canvas: true, done: c => c.benchtops.length >= Math.max(1, wallsWithBases(c)) },
  ]},

  { id: 'appliances', title: 'Appliances', steps: [
    { id: 'pick', title: 'Pick an appliance',
      body: 'Open Fixtures in the sidebar (F6) and click an appliance (e.g. a dishwasher or oven). R turns it, Shift places it freely.',
      target: 'tool-fixtures', canvas: true, done: c => c.mode === 'place_fixture' },
    { id: 'drop', title: 'Drop it next to the cabinets',
      body: 'Move it to the end of your base run — it backs onto the nearest wall — and click. Esc to finish.',
      canvas: true, done: c => c.fixtures.some(f => f.category === 'appliance'),
      hints: c => {
        const w = mainRunWall(c); const span = w && baseSpan(w, c)
        if (!w || !span) return []
        const to = Math.min(w.length, span[1] + 600)
        return to - span[1] > 50 ? [{ kind: 'zone', pts: strip(w, c, span[1], to, 600), label: 'Appliance here' }] : []
      } },
  ]},

  { id: 'views', title: 'Look at your job', steps: [
    { id: 'elevation', title: 'Elevation view',
      body: 'Click Elevation at the top. Select a wall first to look at that wall.',
      target: 'view-elevation', canvas: true, done: c => c.view === 'elevation' },
    { id: '3d', title: '3D view',
      body: 'Click 3D. Drag to orbit, scroll to zoom.', target: 'view-3d', canvas: true, done: c => c.view === '3d' },
    { id: 'plan', title: 'Back to plan',
      body: 'Click Plan. That is the basics — switch Tutorial mode off in the File menu, or pick another lesson.',
      target: 'view-plan', canvas: true, done: c => c.view === 'plan' },
  ]},
]

export const stepKey = (lesson: TutorialLesson, step: TutorialStep) => `${lesson.id}/${step.id}`
