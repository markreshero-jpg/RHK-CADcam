import { describe, it, expect, beforeEach } from 'vitest'
import { useTutorial } from '../tutorial/store'
import { LESSONS, EMPTY_CTX } from '../tutorial/lessons'
import type { Wall, CabinetInstance } from '../types'

const wall = (id: string, angle: number, x = 0, y = 0): Wall => ({
  id, room_id: 'r', name: id, sort_order: 0, length: 3000, height: null, soffit_height: null,
  angle, pos_x: x, pos_y: y, thickness: 90, wall_type: 'standard', created_at: '',
})
const base = (id: string, wall_id: string, x: number): CabinetInstance =>
  ({ id, wall_id, assembly_class: 'base', pos_x: x, pos_y: 0, pos_z: 0, rotation: 0, dx: 600, dy: 720, dz: 560 }) as CabinetInstance

const lessonIdx = (id: string) => LESSONS.findIndex(l => l.id === id)

describe('tutorial store', () => {
  beforeEach(() => {
    useTutorial.setState({ enabled: false, lesson: 0, step: 0, done: [], ctx: EMPTY_CTX })
  })

  it('turning it on inside a job skips lesson 1', () => {
    useTutorial.getState().setCtx({ path: '/canvas/x', inCanvas: true })
    useTutorial.getState().setEnabled(true)
    expect(useTutorial.getState().lesson).toBe(lessonIdx('walls'))
  })

  it('ticks steps in order as the drawing changes', () => {
    const t = useTutorial.getState()
    t.setCtx({ path: '/canvas/x', inCanvas: true })
    t.setEnabled(true)
    t.setCtx({ mode: 'draw_wall' })
    expect(useTutorial.getState().step).toBe(1)
    t.setCtx({ walls: [wall('a', 0), wall('b', 90, 3000)] })
    expect(useTutorial.getState().step).toBe(2)
    t.setCtx({ mode: 'select' })
    expect(useTutorial.getState().step).toBe(3) // lesson finished
    expect(useTutorial.getState().done).toEqual(['walls/tool', 'walls/draw', 'walls/finish'])
  })

  it('does not tick a later step early', () => {
    const t = useTutorial.getState()
    t.setCtx({ path: '/canvas/x', inCanvas: true, walls: [wall('a', 0)], cabinets: [base('c1', 'a', 0)] })
    t.goTo(lessonIdx('cabinets'))
    t.setEnabled(true)
    // Step 0 (open the library) isn't done, so 'first base placed' must not tick yet.
    expect(useTutorial.getState().step).toBe(0)
  })

  it('canvas steps wait while outside the canvas', () => {
    const t = useTutorial.getState()
    t.setCtx({ path: '/', inCanvas: false, mode: 'draw_wall' })
    t.goTo(lessonIdx('walls'))
    t.setEnabled(true)
    expect(useTutorial.getState().step).toBe(0)
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
})
