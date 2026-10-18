'use client'

// ── Tutorial panel (z_tutorial) ───────────────────────────────────────────────
// Floating card, bottom-right: lesson picker, the lesson's steps (ticked / current
// / to come), and Back · Show me · Skip. Minimises to a pill. Close = tutorial off.

import { useState } from 'react'
import { useTutorial } from '@/src/lib/tutorial/store'
import { LESSONS, stepKey } from '@/src/lib/tutorial/lessons'

export default function TutorialPanel() {
  const t = useTutorial()
  const [min, setMin] = useState(false)
  const lesson = LESSONS[t.lesson]
  const finished = t.step >= lesson.steps.length
  const current = finished ? null : lesson.steps[t.step]
  const needsCanvas = !!current?.canvas && !t.ctx.inCanvas
  const lessonDone = (i: number) => LESSONS[i].steps.every(s => t.done.includes(stepKey(LESSONS[i], s)))

  if (min) {
    return (
      <button
        onClick={() => setMin(false)}
        className="fixed bottom-4 right-4 z-[61] rounded-full bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-semibold px-3 py-2 shadow-lg"
      >
        Tutorial · {lesson.title} {Math.min(t.step + 1, lesson.steps.length)}/{lesson.steps.length}
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-[61] w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-amber-500/40 bg-gray-900 text-gray-200 shadow-2xl shadow-black/50 text-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Tutorial</span>
        <select
          value={t.lesson}
          onChange={e => t.goTo(Number(e.target.value))}
          className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-100 outline-none focus:border-amber-500"
        >
          {LESSONS.map((l, i) => (
            <option key={l.id} value={i}>{i + 1}. {l.title}{lessonDone(i) ? ' ✓' : ''}</option>
          ))}
        </select>
        <button title="Minimise" onClick={() => setMin(true)}
          className="w-6 h-6 rounded text-gray-400 hover:text-white hover:bg-gray-800">–</button>
        <button title="Turn tutorial mode off" onClick={() => t.setEnabled(false)}
          className="w-6 h-6 rounded text-gray-400 hover:text-white hover:bg-gray-800">✕</button>
      </div>

      {/* Steps */}
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
            {t.lesson < LESSONS.length - 1
              ? <>Lesson done. Next up: <b>{LESSONS[t.lesson + 1].title}</b>.</>
              : <>All lessons done. Turn Tutorial mode off in the File menu, or pick a lesson to go again.</>}
          </li>
        )}
      </ol>

      {/* Actions */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-t border-gray-800">
        <button onClick={t.back} disabled={t.lesson === 0 && t.step === 0}
          className="px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30">Back</button>
        {current?.target && (
          <button onClick={() => t.setSpotlight(!t.spotlight)}
            className={`px-2 py-1 rounded text-xs ${t.spotlight ? 'bg-amber-500/20 text-amber-300' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
            {t.spotlight ? 'Hide pointer' : 'Show me'}
          </button>
        )}
        <span className="flex-1" />
        {finished
          ? t.lesson < LESSONS.length - 1 && (
            <button onClick={t.next}
              className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-semibold">Next lesson →</button>
          )
          : (
            <button onClick={t.next} title="Move on without doing this step"
              className="px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-800">Skip step</button>
          )}
      </div>
    </div>
  )
}
