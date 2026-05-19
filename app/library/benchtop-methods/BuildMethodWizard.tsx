'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { BenchtopBuildMethod, BenchtopPartRole } from '@/src/lib/types'

// ── Illustration components (placeholder SVGs) ────────────────────────────────

function IllustrationCornerButt({ selected }: { selected: boolean }) {
  const stroke = selected ? '#3b82f6' : '#64748b'
  return (
    <svg viewBox="0 0 160 110" className="w-full h-full">
      <rect x="0" y="0" width="160" height="110" fill="#0f172a" rx="4"/>
      {/* front rail — runs full width */}
      <rect x="15" y="72" width="130" height="22" fill="#1e3a5f" stroke={stroke} strokeWidth="1.5"/>
      {/* right side rail — butts into front rail */}
      <rect x="123" y="16" width="22" height="56" fill="#1e3a5f" stroke={stroke} strokeWidth="1.5"/>
      {/* butt joint highlight */}
      <line x1="123" y1="72" x2="145" y2="72" stroke="#fbbf24" strokeWidth="2"/>
      <text x="80" y="105" textAnchor="middle" fontSize="8" fill="#64748b" fontFamily="system-ui">butt joint</text>
    </svg>
  )
}

function IllustrationCornerMitre({ selected }: { selected: boolean }) {
  const stroke = selected ? '#3b82f6' : '#64748b'
  return (
    <svg viewBox="0 0 160 110" className="w-full h-full">
      <rect x="0" y="0" width="160" height="110" fill="#0f172a" rx="4"/>
      {/* front rail with mitre cut at right end */}
      <polygon points="15,72 123,72 145,94 15,94" fill="#1e3a5f" stroke={stroke} strokeWidth="1.5"/>
      {/* right side rail with mitre cut at bottom */}
      <polygon points="123,16 145,16 145,94 123,72" fill="#1e3a5f" stroke={stroke} strokeWidth="1.5"/>
      {/* mitre line */}
      <line x1="123" y1="72" x2="145" y2="94" stroke="#fbbf24" strokeWidth="2"/>
      <text x="80" y="105" textAnchor="middle" fontSize="8" fill="#64748b" fontFamily="system-ui">mitre joint</text>
    </svg>
  )
}

function IllustrationDropNone({ selected }: { selected: boolean }) {
  const stroke = selected ? '#3b82f6' : '#64748b'
  return (
    <svg viewBox="0 0 160 100" className="w-full h-full">
      <rect x="0" y="0" width="160" height="100" fill="#0f172a" rx="4"/>
      {/* worktop side profile */}
      <rect x="20" y="30" width="120" height="28" fill="#1e3a5f" stroke={stroke} strokeWidth="1.5"/>
      {/* floor line */}
      <line x1="10" y1="90" x2="150" y2="90" stroke="#334155" strokeWidth="1" strokeDasharray="4 3"/>
      <text x="80" y="97" textAnchor="middle" fontSize="8" fill="#64748b" fontFamily="system-ui">clean edge, no drop</text>
    </svg>
  )
}

function IllustrationDropFlush({ selected }: { selected: boolean }) {
  const stroke = selected ? '#3b82f6' : '#64748b'
  return (
    <svg viewBox="0 0 160 100" className="w-full h-full">
      <rect x="0" y="0" width="160" height="100" fill="#0f172a" rx="4"/>
      {/* worktop */}
      <rect x="20" y="25" width="120" height="22" fill="#1e3a5f" stroke={stroke} strokeWidth="1.5"/>
      {/* drop front — front face flush with worktop front face */}
      <rect x="20" y="47" width="14" height="28" fill="#1e293b" stroke={stroke} strokeWidth="1.5"/>
      {/* flush indicator */}
      <line x1="20" y1="18" x2="20" y2="80" stroke="#fbbf24" strokeWidth="1" strokeDasharray="3 2"/>
      <text x="80" y="97" textAnchor="middle" fontSize="8" fill="#64748b" fontFamily="system-ui">flush front face</text>
    </svg>
  )
}

function IllustrationDropProud({ selected }: { selected: boolean }) {
  const stroke = selected ? '#3b82f6' : '#64748b'
  return (
    <svg viewBox="0 0 160 100" className="w-full h-full">
      <rect x="0" y="0" width="160" height="100" fill="#0f172a" rx="4"/>
      {/* worktop */}
      <rect x="24" y="25" width="116" height="22" fill="#1e3a5f" stroke={stroke} strokeWidth="1.5"/>
      {/* drop front — protrudes proud of worktop */}
      <rect x="18" y="47" width="14" height="28" fill="#1e293b" stroke={stroke} strokeWidth="1.5"/>
      {/* proud indicator */}
      <line x1="24" y1="18" x2="24" y2="55" stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 2"/>
      <line x1="18" y1="55" x2="18" y2="80" stroke="#fbbf24" strokeWidth="1" strokeDasharray="3 2"/>
      <line x1="18" y1="52" x2="28" y2="52" stroke="#fbbf24" strokeWidth="1.5" markerEnd="url(#arr)"/>
      <text x="80" y="97" textAnchor="middle" fontSize="8" fill="#64748b" fontFamily="system-ui">proud of worktop edge</text>
    </svg>
  )
}

function IllustrationDropRebated({ selected }: { selected: boolean }) {
  const stroke = selected ? '#3b82f6' : '#64748b'
  return (
    <svg viewBox="0 0 160 100" className="w-full h-full">
      <rect x="0" y="0" width="160" height="100" fill="#0f172a" rx="4"/>
      {/* worktop with rebate notch at front bottom */}
      <polygon points="20,25 140,25 140,47 34,47 34,53 20,53" fill="#1e3a5f" stroke={stroke} strokeWidth="1.5"/>
      {/* drop front sits in rebate */}
      <rect x="20" y="47" width="14" height="32" fill="#1e293b" stroke={stroke} strokeWidth="1.5"/>
      <text x="80" y="97" textAnchor="middle" fontSize="8" fill="#64748b" fontFamily="system-ui">rebated under worktop</text>
    </svg>
  )
}

function IllustrationEndSquare({ selected }: { selected: boolean }) {
  const stroke = selected ? '#3b82f6' : '#64748b'
  return (
    <svg viewBox="0 0 160 100" className="w-full h-full">
      <rect x="0" y="0" width="160" height="100" fill="#0f172a" rx="4"/>
      {/* benchtop end view — square cut raw end */}
      <rect x="50" y="30" width="60" height="22" fill="#1e3a5f" stroke={stroke} strokeWidth="1.5"/>
      {/* raw end cross-hatch */}
      <line x1="50" y1="30" x2="50" y2="52" stroke="#fbbf24" strokeWidth="2"/>
      <text x="80" y="97" textAnchor="middle" fontSize="8" fill="#64748b" fontFamily="system-ui">square cut end</text>
    </svg>
  )
}

function IllustrationEndApplied({ selected }: { selected: boolean }) {
  const stroke = selected ? '#3b82f6' : '#64748b'
  return (
    <svg viewBox="0 0 160 100" className="w-full h-full">
      <rect x="0" y="0" width="160" height="100" fill="#0f172a" rx="4"/>
      {/* benchtop end view */}
      <rect x="54" y="30" width="60" height="22" fill="#1e3a5f" stroke={stroke} strokeWidth="1.5"/>
      {/* applied end panel — thin strip on the left */}
      <rect x="46" y="28" width="8" height="26" fill="#1e293b" stroke={stroke} strokeWidth="1.5"/>
      <text x="80" y="97" textAnchor="middle" fontSize="8" fill="#64748b" fontFamily="system-ui">applied end panel</text>
    </svg>
  )
}

function IllustrationEndMitre({ selected }: { selected: boolean }) {
  const stroke = selected ? '#3b82f6' : '#64748b'
  return (
    <svg viewBox="0 0 160 100" className="w-full h-full">
      <rect x="0" y="0" width="160" height="100" fill="#0f172a" rx="4"/>
      {/* main worktop — plan view showing L-wrap */}
      <rect x="54" y="30" width="70" height="22" fill="#1e3a5f" stroke={stroke} strokeWidth="1.5"/>
      {/* mitre return piece wrapping the end */}
      <polygon points="46,28 54,30 54,52 46,54" fill="#1e293b" stroke={stroke} strokeWidth="1.5"/>
      {/* mitre line */}
      <line x1="46" y1="28" x2="54" y2="30" stroke="#fbbf24" strokeWidth="2"/>
      <line x1="46" y1="54" x2="54" y2="52" stroke="#fbbf24" strokeWidth="2"/>
      <text x="80" y="97" textAnchor="middle" fontSize="8" fill="#64748b" fontFamily="system-ui">mitre return</text>
    </svg>
  )
}

function IllustrationGrainLength({ selected }: { selected: boolean }) {
  const stroke = selected ? '#3b82f6' : '#64748b'
  return (
    <svg viewBox="0 0 160 100" className="w-full h-full">
      <rect x="0" y="0" width="160" height="100" fill="#0f172a" rx="4"/>
      {/* panel plan view */}
      <rect x="15" y="25" width="130" height="55" fill="#1e3a5f" stroke={stroke} strokeWidth="1.5"/>
      {/* grain lines running along length (horizontal) */}
      {[33, 41, 49, 57, 65].map(y => (
        <line key={y} x1="20" y1={y} x2="140" y2={y} stroke="#334155" strokeWidth="1"/>
      ))}
      {/* grain direction arrow */}
      <line x1="30" y1="52" x2="130" y2="52" stroke="#fbbf24" strokeWidth="1.5" markerEnd="url(#a)"/>
      <polygon points="130,49 140,52 130,55" fill="#fbbf24"/>
      <text x="80" y="97" textAnchor="middle" fontSize="8" fill="#64748b" fontFamily="system-ui">grain runs with length</text>
    </svg>
  )
}

function IllustrationGrainWidth({ selected }: { selected: boolean }) {
  const stroke = selected ? '#3b82f6' : '#64748b'
  return (
    <svg viewBox="0 0 160 100" className="w-full h-full">
      <rect x="0" y="0" width="160" height="100" fill="#0f172a" rx="4"/>
      {/* panel plan view */}
      <rect x="15" y="25" width="130" height="55" fill="#1e3a5f" stroke={stroke} strokeWidth="1.5"/>
      {/* grain lines running across width (vertical) */}
      {[30, 42, 54, 66, 78, 90, 102, 114, 126].map(x => (
        <line key={x} x1={x} y1="30" x2={x} y2="75" stroke="#334155" strokeWidth="1"/>
      ))}
      {/* grain direction arrow (downward) */}
      <line x1="80" y1="30" x2="80" y2="70" stroke="#fbbf24" strokeWidth="1.5"/>
      <polygon points="77,70 80,80 83,70" fill="#fbbf24"/>
      <text x="80" y="97" textAnchor="middle" fontSize="8" fill="#64748b" fontFamily="system-ui">grain runs with width</text>
    </svg>
  )
}

function IllustrationJoinButt({ selected }: { selected: boolean }) {
  const stroke = selected ? '#3b82f6' : '#64748b'
  return (
    <svg viewBox="0 0 160 110" className="w-full h-full">
      <rect x="0" y="0" width="160" height="110" fill="#0f172a" rx="4"/>
      {/* run 1 — horizontal (bottom) */}
      <rect x="15" y="68" width="130" height="26" fill="#1e3a5f" stroke={stroke} strokeWidth="1.5"/>
      {/* run 2 — vertical (right side, butts into run 1) */}
      <rect x="119" y="16" width="26" height="52" fill="#1e3a5f" stroke={stroke} strokeWidth="1.5"/>
      {/* butt joint line */}
      <line x1="119" y1="68" x2="145" y2="68" stroke="#fbbf24" strokeWidth="2"/>
      <text x="80" y="106" textAnchor="middle" fontSize="8" fill="#64748b" fontFamily="system-ui">square butt join</text>
    </svg>
  )
}

function IllustrationJoinMitre({ selected }: { selected: boolean }) {
  const stroke = selected ? '#3b82f6' : '#64748b'
  return (
    <svg viewBox="0 0 160 110" className="w-full h-full">
      <rect x="0" y="0" width="160" height="110" fill="#0f172a" rx="4"/>
      {/* run 1 — horizontal with mitre cut at right end */}
      <polygon points="15,68 119,68 145,94 15,94" fill="#1e3a5f" stroke={stroke} strokeWidth="1.5"/>
      {/* run 2 — vertical with mitre cut at bottom */}
      <polygon points="119,16 145,16 145,94 119,68" fill="#1e3a5f" stroke={stroke} strokeWidth="1.5"/>
      {/* mitre joint line */}
      <line x1="119" y1="68" x2="145" y2="94" stroke="#fbbf24" strokeWidth="2"/>
      <text x="80" y="106" textAnchor="middle" fontSize="8" fill="#64748b" fontFamily="system-ui">45° mitre join</text>
    </svg>
  )
}

// ── Wizard step definitions ───────────────────────────────────────────────────

type StepOption = {
  value:        string
  label:        string
  desc:         string
  Illustration: React.ComponentType<{ selected: boolean }>
}

type Step = {
  id:         string
  question:   string
  wizardKey:  string
  methodField?: keyof BenchtopBuildMethod
  options:    StepOption[]
  condition:  (m: BenchtopBuildMethod) => boolean
}

const STEPS: Step[] = [
  {
    id: 'corner_join', question: 'How do build-up rails meet at corners?',
    wizardKey: 'corner_join', methodField: 'corner_join_type',
    condition: m => m.active_part_roles.includes('buildup_rail'),
    options: [
      { value: 'butt',  label: 'Butt',  desc: 'One rail runs full length, the other butts in', Illustration: IllustrationCornerButt  },
      { value: 'mitre', label: 'Mitre', desc: 'Both rails are mitre-cut at 45° at the corner',  Illustration: IllustrationCornerMitre },
    ],
  },
  {
    id: 'drop_front', question: 'How does the drop front fascia sit relative to the worktop?',
    wizardKey: 'drop_front_treatment',
    condition: m => (m.drop_front_height ?? 0) > 0,
    options: [
      { value: 'none',    label: 'None',    desc: 'No drop front on this method',                  Illustration: IllustrationDropNone    },
      { value: 'flush',   label: 'Flush',   desc: 'Fascia front face aligns with worktop edge',    Illustration: IllustrationDropFlush   },
      { value: 'proud',   label: 'Proud',   desc: 'Fascia front face protrudes beyond worktop',    Illustration: IllustrationDropProud   },
      { value: 'rebated', label: 'Rebated', desc: 'Fascia sits in a rebate under the worktop',     Illustration: IllustrationDropRebated },
    ],
  },
  {
    id: 'end_return', question: 'How are exposed ends treated?',
    wizardKey: 'end_return_treatment',
    condition: m => m.active_part_roles.includes('side_fascia'),
    options: [
      { value: 'square_cut',    label: 'Square cut',      desc: 'Raw square-cut end, no treatment',    Illustration: IllustrationEndSquare  },
      { value: 'applied_panel', label: 'Applied panel',   desc: 'Thin end panel applied to the end',   Illustration: IllustrationEndApplied },
      { value: 'mitre_return',  label: 'Mitre return',    desc: 'Worktop wraps the end with a mitre',  Illustration: IllustrationEndMitre   },
    ],
  },
  {
    id: 'grain', question: 'Which direction does the worktop grain run?',
    wizardKey: 'grain_direction', methodField: 'grain_direction',
    condition: () => true,
    options: [
      { value: 'length', label: 'With length', desc: 'Grain runs along the longest dimension', Illustration: IllustrationGrainLength },
      { value: 'width',  label: 'With width',  desc: 'Grain runs across the bench depth',      Illustration: IllustrationGrainWidth  },
    ],
  },
  {
    id: 'join_type', question: 'What is the default join type where two runs meet?',
    wizardKey: 'default_join', methodField: 'default_join_type',
    condition: () => true,
    options: [
      { value: 'butt',  label: 'Butt',  desc: 'Square cut — one run butts into the other', Illustration: IllustrationJoinButt  },
      { value: 'mitre', label: 'Mitre', desc: '45° mitre cut at the join between runs',     Illustration: IllustrationJoinMitre },
    ],
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  method:   BenchtopBuildMethod
  onUpdate: (updated: BenchtopBuildMethod) => void
  onClose:  () => void
}

export default function BuildMethodWizard({ method, onUpdate, onClose }: Props) {
  const activeSteps = STEPS.filter(s => s.condition(method))

  // Initialise selections from existing wizard_answers
  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const step of STEPS) {
      const stored = method.wizard_answers[step.wizardKey]
      if (typeof stored === 'string') init[step.id] = stored
    }
    return init
  })

  const [stepIdx,  setStepIdx]  = useState(0)
  const [saving,   setSaving]   = useState(false)
  const [summary,  setSummary]  = useState(false)

  useEffect(() => {
    // Reset if method changes externally
    const init: Record<string, string> = {}
    for (const step of STEPS) {
      const stored = method.wizard_answers[step.wizardKey]
      if (typeof stored === 'string') init[step.id] = stored
    }
    setSelections(init)
    setStepIdx(0)
    setSummary(false)
  }, [method.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentStep = activeSteps[stepIdx]
  const isLast      = stepIdx === activeSteps.length - 1

  async function saveStep(stepId: string, value: string) {
    setSaving(true)
    const step   = STEPS.find(s => s.id === stepId)!
    const newAnswers = { ...method.wizard_answers, [step.wizardKey]: value }
    const updates: Partial<BenchtopBuildMethod> = { wizard_answers: newAnswers }
    if (step.methodField) {
      (updates as Record<string, unknown>)[step.methodField] = value
    }
    const { data } = await supabase
      .from('benchtop_build_methods')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', method.id)
      .select('*')
      .single()
    if (data) onUpdate(data as BenchtopBuildMethod)
    setSaving(false)
  }

  function selectOption(value: string) {
    setSelections(prev => ({ ...prev, [currentStep.id]: value }))
  }

  async function confirmAndNext() {
    const value = selections[currentStep.id]
    if (!value) return
    await saveStep(currentStep.id, value)
    if (isLast) {
      setSummary(true)
    } else {
      setStepIdx(i => i + 1)
    }
  }

  // ── CSS helpers ─────────────────────────────────────────────────────────────

  const cardCls = (selected: boolean) =>
    `flex flex-col rounded-lg border-2 cursor-pointer transition-all overflow-hidden ${
      selected
        ? 'border-blue-500 bg-blue-950/30'
        : 'border-gray-700 bg-gray-900 hover:border-gray-600'
    }`

  const stepDotCls = (i: number) =>
    `w-2 h-2 rounded-full transition-colors ${
      i < stepIdx   ? 'bg-blue-500' :
      i === stepIdx ? 'bg-blue-400 ring-2 ring-blue-400/30' :
                      'bg-gray-700'
    }`

  // ── Summary screen ──────────────────────────────────────────────────────────

  if (summary) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="bg-gray-950 border border-gray-700 rounded-xl w-[520px] max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
          <div className="flex-none border-b border-gray-800 px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Setup Wizard</p>
              <p className="text-sm font-semibold text-white mt-0.5">{method.name}</p>
            </div>
            <button onClick={onClose} className="text-gray-600 hover:text-gray-300 text-lg leading-none">×</button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
            <p className="text-sm font-medium text-green-400 mb-4">Setup complete — all answers saved.</p>
            {activeSteps.map(step => {
              const val = selections[step.id]
              const opt = step.options.find(o => o.value === val)
              return (
                <div key={step.id} className="flex items-start gap-3 py-2.5 border-b border-gray-800/60">
                  <div className="flex-1">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">{step.question}</p>
                    {opt
                      ? <p className="text-sm text-white mt-0.5">{opt.label} <span className="text-gray-500 text-xs">— {opt.desc}</span></p>
                      : <p className="text-sm text-gray-600 mt-0.5 italic">Not answered</p>
                    }
                  </div>
                  <button
                    onClick={() => { setStepIdx(activeSteps.indexOf(step)); setSummary(false) }}
                    className="text-[10px] text-blue-500 hover:text-blue-400 shrink-0 mt-1"
                  >Edit</button>
                </div>
              )
            })}
          </div>

          <div className="flex-none border-t border-gray-800 px-6 py-4 flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors"
            >Done</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Step screen ─────────────────────────────────────────────────────────────

  if (!currentStep) return null

  const currentValue = selections[currentStep.id] ?? ''
  const cols         = currentStep.options.length <= 2 ? 'grid-cols-2' : 'grid-cols-2'

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-950 border border-gray-700 rounded-xl w-[680px] max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex-none border-b border-gray-800 px-6 py-4 flex items-center gap-4">
          <div className="flex-1">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Setup Wizard · {method.name}</p>
            <p className="text-sm font-semibold text-white mt-0.5">
              Step {stepIdx + 1} of {activeSteps.length}
            </p>
          </div>
          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {activeSteps.map((_, i) => (
              <div key={i} className={stepDotCls(i)} />
            ))}
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-300 text-lg leading-none ml-2">×</button>
        </div>

        {/* Question */}
        <div className="flex-none px-6 pt-5 pb-3">
          <p className="text-base font-medium text-white">{currentStep.question}</p>
        </div>

        {/* Option cards */}
        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <div className={`grid ${cols} gap-3`}>
            {currentStep.options.map(opt => {
              const isSelected = currentValue === opt.value
              const Illus      = opt.Illustration
              return (
                <div
                  key={opt.value}
                  className={cardCls(isSelected)}
                  onClick={() => selectOption(opt.value)}
                >
                  {/* Illustration */}
                  <div className="w-full aspect-[8/5] bg-gray-900/60 p-1">
                    <Illus selected={isSelected} />
                  </div>
                  {/* Label + desc */}
                  <div className="px-3 py-2.5">
                    <p className={`text-sm font-semibold ${isSelected ? 'text-blue-300' : 'text-gray-200'}`}>
                      {opt.label}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{opt.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer navigation */}
        <div className="flex-none border-t border-gray-800 px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => stepIdx > 0 ? setStepIdx(i => i - 1) : onClose()}
            className="px-4 py-1.5 text-xs text-gray-400 hover:text-gray-200 border border-gray-700 hover:border-gray-600 rounded-lg transition-colors"
          >
            {stepIdx === 0 ? 'Cancel' : '← Back'}
          </button>

          <div className="flex items-center gap-3">
            {saving && <span className="text-[10px] text-gray-500">Saving…</span>}
            <button
              onClick={() => {
                // Allow skipping a step (no selection required)
                if (isLast) { setSummary(true) } else { setStepIdx(i => i + 1) }
              }}
              className="px-4 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Skip
            </button>
            <button
              onClick={confirmAndNext}
              disabled={!currentValue || saving}
              className="px-5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs rounded-lg transition-colors"
            >
              {isLast ? 'Finish →' : 'Confirm & Next →'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
