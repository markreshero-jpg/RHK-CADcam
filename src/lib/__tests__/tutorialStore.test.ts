import { describe, it, expect, beforeEach } from 'vitest'
import { useTutorial } from '../tutorial/store'
import { LESSONS, EMPTY_CTX, searchLessons } from '../tutorial/lessons'
import type { Wall, CabinetInstance, BenchtopInstance, RoomAnnotation, RoomFixture } from '../types'

const wall = (id: string, angle: number, x = 0, y = 0, wall_type: Wall['wall_type'] = 'standard'): Wall => ({
  id, room_id: 'r', name: id, sort_order: 0, length: 3000, height: null, soffit_height: null,
  angle, pos_x: x, pos_y: y, thickness: 90, wall_type, created_at: '',
})
const base = (id: string, wall_id: string, x: number): CabinetInstance =>
  ({ id, wall_id, assembly_class: 'base', pos_x: x, pos_y: 0, pos_z: 0, rotation: 0, dx: 600, dy: 720, dz: 560 }) as CabinetInstance
const top = (id: string, joint = false): BenchtopInstance =>
  ({ id, segments: [{ edge: joint ? { joint: 'mitre' } : {} }] }) as unknown as BenchtopInstance

const lessonIdx = (id: string) => LESSONS.findIndex(l => l.id === id)
const st = () => useTutorial.getState()

describe('tutorial store', () => {
  beforeEach(() => {
    useTutorial.setState({ enabled: false, lesson: 0, step: 0, done: [], ctx: EMPTY_CTX, start: null, picking: false })
  })

  it('turning it on opens the picker and ticks nothing', () => {
    st().setCtx({ path: '/canvas/x', inCanvas: true, mode: 'draw_wall' })
    st().setEnabled(true)
    expect(st().picking).toBe(true)
    st().setCtx({ walls: [wall('a', 0)] })
    expect(st().done).toEqual([])
  })

  it('ticks steps in order as the drawing changes', () => {
    st().setCtx({ path: '/canvas/x', inCanvas: true })
    st().setEnabled(true)
    st().goTo(lessonIdx('walls'))
    st().setCtx({ mode: 'draw_wall' })
    expect(st().step).toBe(1)
    st().setCtx({ walls: [wall('a', 0), wall('b', 90, 3000)] })
    expect(st().step).toBe(2)
    st().setCtx({ mode: 'select' })
    expect(st().step).toBe(3) // lesson finished
    expect(st().done).toEqual(['walls/tool', 'walls/draw', 'walls/finish'])
    st().next()
    expect(LESSONS[st().lesson].id).toBe('cabinets') // Getting started runs on
  })

  it('counts from what the job already had', () => {
    st().setCtx({ path: '/canvas/x', inCanvas: true, walls: [wall('a', 0)], cabinets: [base('c1', 'a', 0)] })
    st().setEnabled(true)
    st().goTo(lessonIdx('cabinets'))
    st().setCtx({ mode: 'place_base' })
    expect(st().step).toBe(1) // the existing cabinet doesn't count
    st().setCtx({ cabinets: [base('c1', 'a', 0), base('c2', 'a', 600)] })
    expect(st().step).toBe(2)
  })

  it('canvas steps wait while outside the canvas', () => {
    st().setCtx({ path: '/', inCanvas: false, mode: 'draw_wall' })
    st().setEnabled(true)
    st().goTo(lessonIdx('walls'))
    expect(st().step).toBe(0)
  })

  it('corner join runs through to the joint', () => {
    const L = [wall('a', 0), wall('b', 90, 3000)]
    st().setCtx({ path: '/canvas/x', inCanvas: true, walls: L })
    st().setEnabled(true)
    st().goTo(lessonIdx('corner_join'))
    expect(st().step).toBe(1) // corner already there
    st().setCtx({ mode: 'draw_benchtop_line' })
    st().setCtx({ benchtops: [top('t1')] })
    st().setCtx({ benchtops: [top('t1'), top('t2')] })
    st().setCtx({ mode: 'benchtop_select', pickedTops: 2 })
    st().setCtx({ joinDialogOpen: true })
    expect(st().step).toBe(6)
    st().setCtx({ joinDialogOpen: false, benchtops: [top('t1', true), top('t2', true)] })
    expect(st().step).toBe(7)
    st().next()
    expect(st().picking).toBe(true) // topics go back to the picker
  })

  it('island cabinets must stand on the island', () => {
    st().setCtx({ path: '/canvas/x', inCanvas: true, walls: [wall('a', 0)] })
    st().setEnabled(true)
    st().goTo(lessonIdx('island'))
    st().setCtx({ mode: 'draw_island' })
    st().setCtx({ walls: [wall('a', 0), wall('i', 0, 0, 1500, 'island')] })
    expect(st().step).toBe(2)
    st().setCtx({ cabinets: [base('c1', 'a', 0)] })
    expect(st().step).toBe(2)
    st().setCtx({ cabinets: [base('c1', 'a', 0), base('c2', 'i', 0)] })
    expect(st().step).toBe(3)
  })

  it('benchtop hint covers the base run on the main wall', () => {
    const ctx = { ...EMPTY_CTX, inCanvas: true, walls: [wall('a', 0), wall('b', 90, 3000)],
      cabinets: [base('c1', 'a', 0), base('c2', 'a', 600)] }
    const step = LESSONS[lessonIdx('benchtops')].steps.find(s => s.id === 'first')!
    const [h] = step.hints!(ctx)
    expect(h.kind).toBe('zone')
    if (h.kind === 'zone') {
      const xs = h.pts.map(p => Math.round(p.x))
      expect(Math.min(...xs)).toBe(0)
      expect(Math.max(...xs)).toBe(1200)
    }
  })

  it('every lesson and step id is unique', () => {
    expect(new Set(LESSONS.map(l => l.id)).size).toBe(LESSONS.length)
    for (const l of LESSONS) expect(new Set(l.steps.map(s => s.id)).size).toBe(l.steps.length)
  })
  it('search matches words from titles, blurbs and keywords', () => {
    const ids = (q: string) => searchLessons(q).map(i => LESSONS[i].id)
    expect(ids('corner join')).toContain('corner_join')
    expect(ids('KICK')).toEqual(expect.arrayContaining(['kick_runs', 'floating_vanity']))
    expect(ids('print elevation')).toEqual(['print_elevations', 'shop_drawings'])
    expect(ids('pdf')).toEqual(expect.arrayContaining(['print_elevations', 'print_plan']))
    expect(ids('zzz')).toEqual([])
    expect(ids('  ')).toEqual([])
  })

  it('every tutorial outside Getting started sits in a topic', () => {
    for (const l of LESSONS) expect(l.level === 'start' || !!l.topic).toBe(true)
  })

  it('minimised is saved, and turning it on unfolds it', () => {
    st().setEnabled(true)
    st().setMinimised(true)
    expect(st().minimised).toBe(true)
    st().setEnabled(false)
    st().setEnabled(true)
    expect(st().minimised).toBe(false)
  })

  it('CAD notes: text, then a text box, select, style, leave', () => {
    const note = (id: string, width?: number) =>
      ({ id, view: 'plan', kind: 'text', geom: { at: { x: 0, y: 0 }, width } }) as unknown as RoomAnnotation
    const old = note('old')
    st().setCtx({ path: '/canvas/x', inCanvas: true, annotations: [old] })
    st().setEnabled(true)
    st().goTo(lessonIdx('cad_notes'))
    st().setCtx({ mode: 'cad' })
    expect(st().step).toBe(1) // the note already on the plan doesn't count
    st().setCtx({ annotations: [old, note('a', 40)] })
    expect(st().step).toBe(1) // a box isn't point text
    st().setCtx({ annotations: [old, note('a', 40), note('b')] })
    expect(st().step).toBe(3)
    st().setCtx({ annotSelected: 1 })
    st().emit('annot_style')
    expect(st().step).toBe(5)
    st().setCtx({ mode: 'select' })
    expect(st().step).toBe(6)
  })

  it('UBO oven: pick, drop (oven seated), editor, click the oven, close', () => {
    const oven = { id: 'o1', category: 'appliance', cabinet_id: 'c1', link_zone: { row_index: 1, col_index: 0, y: 220 } } as unknown as RoomFixture
    const loose = { id: 'd1', category: 'appliance', cabinet_id: null, link_zone: null } as unknown as RoomFixture
    st().setCtx({ path: '/canvas/x', inCanvas: true, fixtures: [loose] })
    st().setEnabled(true)
    st().goTo(lessonIdx('ubo_oven'))
    st().setCtx({ mode: 'place_cabinet' })
    expect(st().step).toBe(1)
    st().setCtx({ mode: 'select', fixtures: [loose, { ...loose, id: 'd2' }] })
    expect(st().step).toBe(1) // a free-standing appliance isn't a seated oven
    st().setCtx({ fixtures: [loose, oven] })
    expect(st().step).toBe(2)
    st().setCtx({ cabEditorOpen: true })
    st().emit('cab_fixture_pick')
    expect(st().step).toBe(4)
    st().setCtx({ cabEditorOpen: false })
    expect(st().step).toBe(5)
  })

  it('job colours: open, board, colour, copy, save + 3D', () => {
    st().setCtx({ path: '/canvas/x', inCanvas: true })
    st().setEnabled(true)
    st().emit('mat_board_pick')                  // before the lesson: doesn't count
    st().goTo(lessonIdx('job_colours'))
    st().emit('job_materials_tab')
    expect(st().step).toBe(1)
    st().emit('mat_board_pick')
    expect(st().step).toBe(2)
    st().emit('mat_colour_pick')
    expect(st().step).toBe(3)
    st().emit('mat_copy_classes')
    expect(st().step).toBe(4)
    st().emit('props_saved')
    expect(st().step).toBe(4)                    // saved, not yet in 3D
    st().setCtx({ view: '3d' })
    expect(st().step).toBe(5)
  })

  it('a PDF download ticks the print step', () => {
    st().setCtx({ path: '/canvas/x', inCanvas: true })
    st().setEnabled(true)
    st().goTo(LESSONS.findIndex(l => l.id === 'print_elevations'))
    st().setCtx({ report: 'parts_list_summary' })
    st().setCtx({ report: 'elevation_view_v2' })
    expect(st().step).toBe(2)
    st().emit('elevation_pdf')
    expect(st().step).toBe(3)
  })

  it('edgeband length: open, pick the report, print', () => {
    st().setCtx({ path: '/canvas/x', inCanvas: true })
    st().setEnabled(true)
    st().goTo(LESSONS.findIndex(l => l.id === 'edgeband_length'))
    st().setCtx({ report: 'parts_list_summary' })
    st().setCtx({ report: 'edgeband_length' })
    expect(st().step).toBe(2)
    st().emit('edgeband_print')
    expect(st().step).toBe(3)
  })
})
