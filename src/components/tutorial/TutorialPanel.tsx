'use client'

// ── Tutorial panel (z_tutorial) ───────────────────────────────────────────────
// Floating card, bottom-right. Two views: the picker (a search box over a
// level ▸ topic ▸ tutorial tree, ticked when finished) and a lesson (its steps
// ticked / current / to come, with Back · Show me · Skip). Minimises to a pill.
// Close = tutorial mode off.

import { useMemo, useState } from 'react'
import { useTutorial } from '@/src/lib/tutorial/store'
import {
  LESSONS, TUTORIAL_LEVELS, TUTORIAL_TOPICS, stepKey, lessonDone, searchLessons,
  type TutorialLesson,
} from '@/src/lib/tutorial/lessons'

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

const levelLabel = (l: TutorialLesson) => TUTORIAL_LEVELS.find(v => v.id === l.level)?.label ?? ''
const topicLabel = (l: TutorialLesson) => TUTORIAL_TOPICS.find(v => v.id === l.topic)?.label ?? ''

function Picker() {
  const t = useTutorial()
  const [query, setQuery] = useState('')
  // Open branches: 'L:<level>' and 'T:<level>/<topic>'. Starts with Getting started
  // and the branch holding the current tutorial open.
  const [open, setOpen] = useState<Set<string>>(() => {
    const cur = LESSONS[t.lesson]
    const s = new Set(['L:start', `L:${cur.level}`])
    if (cur.topic) s.add(`T:${cur.level}/${cur.topic}`)
    return s
  })
  const toggle = (k: string) => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(k)) next.delete(k); else next.add(k)
    return next
  })
  const hits = useMemo(() => searchLessons(query), [query])
  const searching = query.trim().length > 0
  const all = LESSONS.map((l, i) => ({ l, i }))
  const count = (items: { l: TutorialLesson }[]) =>
    `${items.filter(x => lessonDone(x.l, t.done)).length}/${items.length}`

  return (
    <div className="flex flex-col">
      <div className="px-2 pt-2">
        <input
          type="search" value={query} onChange={e => setQuery(e.target.value)} autoFocus
          placeholder="Search tutorials… e.g. corner join, kick, print"
          className="w-full bg-gray-800 border border-gray-700 focus:border-amber-500 rounded px-2 py-1.5 text-xs text-gray-100 placeholder-gray-500 outline-none"
        />
      </div>
      <div className="max-h-[60vh] overflow-y-auto px-2 py-2 flex flex-col gap-0.5">
        {searching ? (
          hits.length
            ? hits.map(i => <LessonRow key={LESSONS[i].id} i={i} crumb={[levelLabel(LESSONS[i]), topicLabel(LESSONS[i])].filter(Boolean).join(' › ')} />)
            : <p className="px-2 py-3 text-xs text-gray-400">No tutorial for that yet. Try fewer or different words.</p>
        ) : TUTORIAL_LEVELS.map(lv => {
          const items = all.filter(x => x.l.level === lv.id)
          if (!items.length) return null
          const lk = `L:${lv.id}`
          return (
            <div key={lv.id}>
              <Branch label={lv.label} sub={lv.blurb} count={count(items)} open={open.has(lk)} onClick={() => toggle(lk)} />
              {open.has(lk) && (
                <div className="ml-3 pl-1.5 border-l border-gray-800">
                  {lv.id === 'start'
                    ? items.map(({ i }, n) => <LessonRow key={LESSONS[i].id} i={i} num={n + 1} />)
                    : TUTORIAL_TOPICS.map(tp => {
                      const inTopic = items.filter(x => x.l.topic === tp.id)
                      if (!inTopic.length) return null
                      const tk = `T:${lv.id}/${tp.id}`
                      return (
                        <div key={tp.id}>
                          <Branch label={tp.label} count={count(inTopic)} open={open.has(tk)} onClick={() => toggle(tk)} small />
                          {open.has(tk) && (
                            <div className="ml-3 pl-1.5 border-l border-gray-800">
                              {inTopic.map(({ i }) => <LessonRow key={LESSONS[i].id} i={i} />)}
                            </div>
                          )}
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          )
        })}
        {!searching && t.done.length > 0 && (
          <button onClick={t.restart} className="self-start mt-1 px-2 text-[11px] text-gray-500 hover:text-gray-300">Reset progress</button>
        )}
      </div>
    </div>
  )
}

function Branch({ label, sub, count, open, onClick, small }: {
  label: string; sub?: string; count: string; open: boolean; onClick: () => void; small?: boolean
}) {
  return (
    <button onClick={onClick} aria-expanded={open}
      className="w-full flex items-start gap-1.5 text-left rounded-md px-1.5 py-1 hover:bg-gray-800">
      <span className={`mt-0.5 text-[10px] text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
      <span className="flex-1 min-w-0">
        <span className={`block ${small ? 'text-xs text-gray-300' : 'text-sm font-semibold text-gray-100'}`}>{label}</span>
        {sub && <span className="block text-[11px] text-gray-500 leading-snug">{sub}</span>}
      </span>
      <span className="mt-0.5 text-[10px] text-gray-500 tabular-nums">{count}</span>
    </button>
  )
}

function LessonRow({ i, num, crumb }: { i: number; num?: number; crumb?: string }) {
  const t = useTutorial()
  const l = LESSONS[i]
  const done = lessonDone(l, t.done)
  const going = !done && i === t.lesson && t.step > 0 && t.step < l.steps.length
  return (
    <button onClick={() => t.goTo(i, going ? t.step : 0)}
      className="w-full flex items-start gap-2 text-left rounded-lg px-2 py-1.5 hover:bg-gray-800">
      <span className={`mt-0.5 flex-none w-4 h-4 rounded-full text-[10px] leading-4 text-center font-bold
        ${done ? 'bg-emerald-500 text-gray-950' : going ? 'bg-amber-400 text-gray-950' : 'bg-gray-800 text-gray-500'}`}>
        {done ? '✓' : num ?? '·'}
      </span>
      <span className="min-w-0">
        {crumb && <span className="block text-[10px] uppercase tracking-wider text-gray-500">{crumb}</span>}
        <span className="block font-medium text-gray-100">{l.title}
          {going && <span className="ml-1.5 text-[10px] text-amber-400">in progress</span>}</span>
        <span className="block text-[11px] text-gray-400 leading-snug">{l.blurb}</span>
      </span>
    </button>
  )
}

function Lesson({ finished }: { finished: boolean }) {
  const t = useTutorial()
  const lesson = LESSONS[t.lesson]
  const current = finished ? null : lesson.steps[t.step]
  const needsCanvas = !!current?.canvas && !t.ctx.inCanvas
  const following = LESSONS[t.lesson + 1]
  const runsOn = lesson.level === 'start' && following?.level === 'start'

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
