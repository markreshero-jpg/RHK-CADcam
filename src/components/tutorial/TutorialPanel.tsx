'use client'

// ── Tutorial panel (z_tutorial) ───────────────────────────────────────────────
// Floating card, bottom-right. Two views: the picker (every tutorial, grouped,
// ticked when finished) and a lesson (its steps ticked / current / to come, with
// Back · Show me · Skip). Minimises to a pill. Close = tutorial mode off.

import { useState } from 'react'
import { useTutorial } from '@/src/lib/tutorial/store'
import { LESSONS, TUTORIAL_GROUPS, stepKey, lessonDone } from '@/src/lib/tutorial/lessons'

const iconBtn = 'w-6 h-6 rounded text-gray-400 hover:text-white hover:bg-gray-800'

export default function TutorialPanel() {
  const t = useTutorial()
  const [min, setMin] = useState(false)
  const lesson = LESSONS[t.lesson]
  const finished = t.step >= lesson.steps.length

  if (min) {
    return (
      <button
        onClick={() => setMin(false)}
        className="fixed bottom-4 right-4 z-[61] rounded-full bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-semibold px-3 py-2 shadow-lg"
      >
        {t.picking ? 'Tutorials' : <>Tutorial · {lesson.title} {Math.min(t.step + 1, lesson.steps.length)}/{lesson.steps.length}</>}
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-[61] w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-amber-500/40 bg-gray-900 text-gray-200 shadow-2xl shadow-black/50 text-sm">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
        {t.picking
          ? <span className="flex-1 text-[10px] font-bold uppercase tracking-wider text-amber-400">Tutorials</span>
          : <>
            <button onClick={() => t.setPicking(true)} title="All tutorials"
              className="shrink-0 text-xs text-amber-400 hover:text-amber-300">☰ All</button>
            <span className="flex-1 min-w-0 truncate font-semibold text-white">{lesson.title}</span>
          </>}
        <button title="Minimise" onClick={() => setMin(true)} className={iconBtn}>–</button>
        <button title="Turn tutorial mode off" onClick={() => t.setEnabled(false)} className={iconBtn}>✕</button>
      </div>
      {t.picking ? <Picker /> : <Lesson finished={finished} />}
    </div>
  )
}

function Picker() {
  const t = useTutorial()
  return (
    <div className="max-h-[60vh] overflow-y-auto px-2 py-2 flex flex-col gap-2">
      {TUTORIAL_GROUPS.map(g => {
        const items = LESSONS.map((l, i) => ({ l, i })).filter(x => x.l.group === g.id)
        if (!items.length) return null
        return (
          <div key={g.id}>
            <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{g.label}</p>
            {g.blurb && <p className="px-1 text-[11px] text-gray-500 mb-0.5">{g.blurb}</p>}
            <div className="flex flex-col">
              {items.map(({ l, i }) => {
                const done = lessonDone(l, t.done)
                const going = !done && i === t.lesson && t.step > 0 && t.step < l.steps.length
                return (
                  <button key={l.id} onClick={() => t.goTo(i, going ? t.step : 0)}
                    className="flex items-start gap-2 text-left rounded-lg px-2 py-1.5 hover:bg-gray-800">
                    <span className={`mt-0.5 flex-none w-4 h-4 rounded-full text-[10px] leading-4 text-center font-bold
                      ${done ? 'bg-emerald-500 text-gray-950' : going ? 'bg-amber-400 text-gray-950' : 'bg-gray-800 text-gray-500'}`}>
                      {done ? '✓' : g.id === 'start' ? items.findIndex(x => x.i === i) + 1 : '·'}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium text-gray-100">{l.title}
                        {going && <span className="ml-1.5 text-[10px] text-amber-400">in progress</span>}</span>
                      <span className="block text-[11px] text-gray-400 leading-snug">{l.blurb}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
      {t.done.length > 0 && (
        <button onClick={t.restart} className="self-start px-2 text-[11px] text-gray-500 hover:text-gray-300">Reset progress</button>
      )}
    </div>
  )
}

function Lesson({ finished }: { finished: boolean }) {
  const t = useTutorial()
  const lesson = LESSONS[t.lesson]
  const current = finished ? null : lesson.steps[t.step]
  const needsCanvas = !!current?.canvas && !t.ctx.inCanvas
  const following = LESSONS[t.lesson + 1]
  const runsOn = lesson.group === 'start' && following?.group === 'start'

  return (
    <>
      <ol className="px-3 py-2 flex flex-col gap-1 max-h-[45vh] overflow-y-auto">
        {lesson.steps.map((s, i) => {
          const isDone = t.done.includes(stepKey(lesson, s))
          const isCur = i === t.step
          return (
            <li key={s.id} className={`rounded-lg px-2 py-1.5 ${isCur ? 'bg-amber-500/10 ring-1 ring-amber-500/40' : ''}`}>
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 flex-none w-4 h-4 rounded-full text-[10px] leading-4 text-center font-bold
                  ${isDone ? 'bg-emerald-500 text-gray-950' : isCur ? 'bg-amber-400 text-gray-950' : 'bg-gray-800 text-gray-500'}`}>
                  {isDone ? '✓' : i + 1}
                </span>
                <div className="min-w-0">
                  <p className={`font-medium ${isCur ? 'text-white' : isDone ? 'text-gray-400' : 'text-gray-500'}`}>{s.title}</p>
                  {isCur && <p className="text-xs text-gray-300 mt-0.5 leading-snug">{s.body}</p>}
                  {isCur && needsCanvas && (
                    <p className="text-xs text-amber-300 mt-1">Open a job (a room&apos;s canvas) to carry on with this step.</p>
                  )}
                </div>
              </div>
            </li>
          )
        })}
        {finished && (
          <li className="rounded-lg px-2 py-2 bg-emerald-500/10 ring-1 ring-emerald-500/40 text-emerald-300 text-xs">
            {runsOn
              ? <>Lesson done. Next up: <b>{following.title}</b>.</>
              : <>Tutorial done. Pick another one, or turn Tutorial mode off in the File menu.</>}
          </li>
        )}
      </ol>

      <div className="flex items-center gap-1.5 px-3 py-2 border-t border-gray-800">
        <button onClick={t.back} disabled={t.step === 0}
          className="px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30">Back</button>
        {current?.target && (
          <button onClick={() => t.setSpotlight(!t.spotlight)}
            className={`px-2 py-1 rounded text-xs ${t.spotlight ? 'bg-amber-500/20 text-amber-300' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
            {t.spotlight ? 'Hide pointer' : 'Show me'}
          </button>
        )}
        <span className="flex-1" />
        {finished
          ? (
            <button onClick={t.next}
              className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-semibold">
              {runsOn ? 'Next lesson →' : 'All tutorials'}
            </button>
          )
          : (
            <button onClick={t.next} title="Move on without doing this step"
              className="px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-800">Skip step</button>
          )}
      </div>
    </>
  )
}
