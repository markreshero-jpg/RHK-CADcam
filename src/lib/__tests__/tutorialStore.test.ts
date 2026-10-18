import { describe, it, expect, beforeEach } from 'vitest'
import { useTutorial } from '../tutorial/store'
import { LESSONS, EMPTY_CTX } from '../tutorial/lessons'
import type { Wall, CabinetInstance, BenchtopInstance } from '../types'

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
})
