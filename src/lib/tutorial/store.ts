// ── Tutorial mode state (z_tutorial/TUTORIAL-SPEC.md) ─────────────────────────
// enabled / lesson / step / done persist in userPrefs.tutorial. `ctx` is live:
// the canvas and TutorialHost push into it, and every push re-checks the current
// step — when its done(ctx) is true the step is ticked and the next one starts.
// step === lesson.steps.length means the lesson is finished (panel offers Next).

import { create } from 'zustand'
import { getUserPrefs, setUserPrefs, type TutorialPrefs } from '../userPrefs'
import { LESSONS, EMPTY_CTX, stepKey, type TutorialCtx } from './lessons'

interface TutorialState extends TutorialPrefs {
  ctx: TutorialCtx
  /** Show the spotlight ring on the current step's target. */
  spotlight: boolean
  loaded: boolean
  load: () => void
  setEnabled: (on: boolean) => void
  setCtx: (patch: Partial<TutorialCtx>) => void
  goTo: (lesson: number, step?: number) => void
  next: () => void
  back: () => void
  setSpotlight: (on: boolean) => void
  restart: () => void
}

const persist = (s: TutorialPrefs) =>
  setUserPrefs({ tutorial: { enabled: s.enabled, lesson: s.lesson, step: s.step, done: s.done } })

const clampLesson = (i: number) => Math.max(0, Math.min(LESSONS.length - 1, i))

/** Tick the current step (and any after it) that ctx already satisfies. */
function advance(s: TutorialPrefs, ctx: TutorialCtx): TutorialPrefs {
  const lesson = LESSONS[clampLesson(s.lesson)]
  let step = s.step
  let done = s.done
  while (step < lesson.steps.length) {
    const st = lesson.steps[step]
    if (st.canvas && !ctx.inCanvas) break
    if (!st.done(ctx)) break
    const key = stepKey(lesson, st)
    if (!done.includes(key)) done = [...done, key]
    step++
  }
  return step === s.step ? s : { ...s, step, done }
}

export const useTutorial = create<TutorialState>((set, get) => ({
  enabled: false, lesson: 0, step: 0, done: [],
  ctx: EMPTY_CTX, spotlight: true, loaded: false,

  load: () => {
    if (get().loaded) return
    const t = getUserPrefs().tutorial
    set({ ...t, lesson: clampLesson(t.lesson), loaded: true })
  },

  setEnabled: on => {
    const s = { ...get(), enabled: on }
    // Turning it on inside a job: lesson 1 (start a job) is already done in spirit,
    // so start at the first unfinished lesson after it.
    if (on && get().ctx.inCanvas && s.lesson === 0 && s.step === 0) {
      const first = LESSONS.findIndex((l, i) => i > 0 && l.steps.some(st => !s.done.includes(stepKey(l, st))))
      s.lesson = first < 0 ? 1 : first
      s.step = 0
    }
    const next = on ? advance(s, s.ctx) : s
    set({ ...next, enabled: on, spotlight: true })
    persist({ ...next, enabled: on })
  },

  setCtx: patch => {
    const ctx = { ...get().ctx, ...patch }
    const s = get()
    if (!s.enabled) { set({ ctx }); return }
    const next = advance(s, ctx)
    set({ ctx, lesson: next.lesson, step: next.step, done: next.done })
    if (next !== s) persist(next)
  },

  goTo: (lesson, step = 0) => {
    const s = { ...get(), lesson: clampLesson(lesson), step }
    const next = advance(s, s.ctx)
    set({ lesson: next.lesson, step: next.step, done: next.done, spotlight: true })
    persist(next)
  },

  next: () => {
    const s = get()
    const lesson = LESSONS[s.lesson]
    if (s.step >= lesson.steps.length) {
      if (s.lesson < LESSONS.length - 1) get().goTo(s.lesson + 1)
      return
    }
    // Skip: move on without ticking it.
    const n = { ...s, step: s.step + 1 }
    set({ step: n.step, spotlight: true })
    persist(n)
  },

  back: () => {
    const s = get()
    if (s.step > 0) {
      const n = { ...s, step: s.step - 1 }
      set({ step: n.step, spotlight: true }); persist(n)
    } else if (s.lesson > 0) {
      const l = s.lesson - 1
      const n = { ...s, lesson: l, step: LESSONS[l].steps.length - 1 }
      set({ lesson: n.lesson, step: n.step, spotlight: true }); persist(n)
    }
  },

  setSpotlight: on => set({ spotlight: on }),

  restart: () => {
    const n = { ...get(), lesson: 0, step: 0, done: [] }
    set({ lesson: 0, step: 0, done: [], spotlight: true })
    persist(n)
  },
}))
