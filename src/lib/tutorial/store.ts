// ── Tutorial mode state (z_tutorial/TUTORIAL-SPEC.md) ─────────────────────────
// enabled / lesson / step / done persist in userPrefs.tutorial. `ctx` is live:
// the canvas and TutorialHost push into it, and every push re-checks the current
// step — when its done(ctx, start) is true the step is ticked and the next one
// starts. `start` is the canvas ctx when the lesson began (taken the first time
// the lesson sees the canvas; re-taken after a reload). `picking` shows the
// tutorial picker instead of a lesson.
// step === lesson.steps.length means the lesson is finished (panel offers Next).

import { create } from 'zustand'
import { getUserPrefs, setUserPrefs, type TutorialPrefs } from '../userPrefs'
import { LESSONS, EMPTY_CTX, stepKey, type TutorialCtx } from './lessons'

interface TutorialState extends TutorialPrefs {
  ctx: TutorialCtx
  start: TutorialCtx | null
  picking: boolean
  /** Show the spotlight ring on the current step's target. */
  spotlight: boolean
  loaded: boolean
  load: () => void
  setEnabled: (on: boolean) => void
  setCtx: (patch: Partial<TutorialCtx>) => void
  goTo: (lesson: number, step?: number) => void
  next: () => void
  back: () => void
  setPicking: (on: boolean) => void
  setSpotlight: (on: boolean) => void
  restart: () => void
}

const persist = (s: TutorialPrefs) =>
  setUserPrefs({ tutorial: { enabled: s.enabled, lesson: s.lesson, step: s.step, done: s.done } })

const clampLesson = (i: number) => Math.max(0, Math.min(LESSONS.length - 1, i))

/** Tick the current step (and any after it) that ctx already satisfies. */
function advance<S extends TutorialPrefs>(s: S, ctx: TutorialCtx, start: TutorialCtx | null): S {
  const lesson = LESSONS[clampLesson(s.lesson)]
  let step = s.step
  let done = s.done
  while (step < lesson.steps.length) {
    const st = lesson.steps[step]
    if (st.canvas && (!ctx.inCanvas || !start)) break
    if (!st.done(ctx, start ?? ctx)) break
    const key = stepKey(lesson, st)
    if (!done.includes(key)) done = [...done, key]
    step++
  }
  return step === s.step ? s : { ...s, step, done }
}

/** The lesson's starting point: the canvas as it is now, or null outside it. */
const startFrom = (ctx: TutorialCtx) => (ctx.inCanvas ? ctx : null)

export const useTutorial = create<TutorialState>((set, get) => ({
  enabled: false, lesson: 0, step: 0, done: [],
  ctx: EMPTY_CTX, start: null, picking: false, spotlight: true, loaded: false,

  load: () => {
    if (get().loaded) return
    const t = getUserPrefs().tutorial
    set({ ...t, lesson: clampLesson(t.lesson), loaded: true })
  },

  setEnabled: on => {
    const s = get()
    // Turning it on opens the picker; the lesson in progress stays where it was.
    set({ enabled: on, picking: on, spotlight: true, start: on ? startFrom(s.ctx) : null })
    persist({ ...s, enabled: on })
  },

  setCtx: patch => {
    const ctx = { ...get().ctx, ...patch }
    const s = get()
    if (!s.enabled || s.picking) { set({ ctx }); return }
    const start = s.start ?? startFrom(ctx)
    const next = advance(s, ctx, start)
    set({ ctx, start, lesson: next.lesson, step: next.step, done: next.done })
    if (next !== s) persist(next)
  },

  goTo: (lesson, step = 0) => {
    const s = get()
    const start = startFrom(s.ctx)
    const next = advance({ ...s, lesson: clampLesson(lesson), step }, s.ctx, start)
    set({ lesson: next.lesson, step: next.step, done: next.done, start, picking: false, spotlight: true })
    persist(next)
  },

  next: () => {
    const s = get()
    const lesson = LESSONS[s.lesson]
    if (s.step >= lesson.steps.length) {
      // Finished: Getting started runs on to its next lesson; topics go back to the picker.
      const following = LESSONS[s.lesson + 1]
      if (following && following.group === lesson.group && lesson.group === 'start') get().goTo(s.lesson + 1)
      else set({ picking: true })
      return
    }
    // Skip: move on without ticking it.
    const n = { ...s, step: s.step + 1 }
    set({ step: n.step, spotlight: true })
    persist(n)
  },

  back: () => {
    const s = get()
    if (s.step <= 0) return
    const n = { ...s, step: s.step - 1 }
    set({ step: n.step, spotlight: true }); persist(n)
  },

  setPicking: on => set({ picking: on }),

  setSpotlight: on => set({ spotlight: on }),

  restart: () => {
    const n = { ...get(), lesson: 0, step: 0, done: [] }
    set({ lesson: 0, step: 0, done: [], picking: true, spotlight: true })
    persist(n)
  },
}))
