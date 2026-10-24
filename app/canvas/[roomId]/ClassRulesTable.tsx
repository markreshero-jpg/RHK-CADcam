'use client'
import { useState, useEffect } from 'react'
import { DEFAULT_CONSTRUCTION_METHOD } from '@/src/lib/defaults/constructionMethod'
import { RULE_CLASSES, type RuleClass } from '@/src/lib/resolver/mergeRules'
import { supabase } from '@/src/lib/supabase'
import CalcInput from '@/src/components/CalcInput'

// Per-class (base / wall / tall) construction rules for the Job and Room
// properties. The cabinet builder (construction method schedule rows) holds a
// value per class; the job and room can override each class separately.
// Stored in rule_overrides.BY_CLASS — see rulesForClass in mergeRules.ts.

type Rules = typeof DEFAULT_CONSTRUCTION_METHOD.rules
const SYS = DEFAULT_CONSTRUCTION_METHOD.rules

export const CLASS_RULE_KEYS = ['REVT', 'REVB', 'REVL', 'REVR', 'REVENDL', 'REVENDR', 'GAPC', 'GAPR', 'FPGAP'] as const
export type ClassRuleKey = typeof CLASS_RULE_KEYS[number]
export type ClassRuleValues = Record<RuleClass, Partial<Record<ClassRuleKey, number>>>

const isClassKey = (k: string): k is ClassRuleKey => (CLASS_RULE_KEYS as readonly string[]).includes(k)

function pickClassKeys(src: Record<string, unknown> | undefined): Partial<Record<ClassRuleKey, number>> {
  const out: Partial<Record<ClassRuleKey, number>> = {}
  for (const [k, v] of Object.entries(src ?? {})) if (isClassKey(k) && typeof v === 'number') out[k] = v
  return out
}

/** A level's explicit per-class values. Legacy flat values apply to every class. */
export function readClassOverrides(ro: Record<string, unknown> | null | undefined): ClassRuleValues {
  const byClass = (ro?.BY_CLASS ?? {}) as Partial<Record<RuleClass, Record<string, unknown>>>
  const flat = pickClassKeys(ro ?? undefined)
  return Object.fromEntries(RULE_CLASSES.map(c => [c, { ...flat, ...pickClassKeys(byClass[c]) }])) as ClassRuleValues
}

/** Writes the per-class values into rule_overrides: drops the flat class keys and
 *  any value equal to its baseline (so it keeps following the builder). */
export function writeClassOverrides(
  out: Record<string, unknown>,
  ov: ClassRuleValues,
  baselines: Record<RuleClass, Rules> | null,
) {
  for (const k of CLASS_RULE_KEYS) delete out[k]
  const byClass: Partial<Record<RuleClass, Partial<Record<ClassRuleKey, number>>>> = {}
  for (const c of RULE_CLASSES) {
    const entry: Partial<Record<ClassRuleKey, number>> = {}
    for (const [k, v] of Object.entries(ov[c]) as [ClassRuleKey, number][]) {
      if (baselines && baselines[c][k] === v) continue
      entry[k] = v
    }
    if (Object.keys(entry).length) byClass[c] = entry
  }
  if (Object.keys(byClass).length) out.BY_CLASS = byClass
  else delete out.BY_CLASS
}

/** Cabinet-builder values per class for a construction method schedule
 *  (null = the shop default schedule). Null while loading. */
export function useBuilderRules(scheduleId: string | null): Record<RuleClass, Rules> | null {
  const [rows, setRows] = useState<Record<RuleClass, Rules> | null>(null)
  useEffect(() => {
    let cancelled = false
    setRows(null)
    ;(async () => {
      let id = scheduleId
      if (!id) {
        const { data } = await supabase.from('shop_settings').select('construction_schedule_id').limit(1).maybeSingle()
        id = (data?.construction_schedule_id as string | null) ?? null
      }
      const deltas: Partial<Record<RuleClass, Partial<Rules>>> = {}
      if (id) {
        const { data } = await supabase.from('construction_method_schedule_rows').select('assembly_class, rules').eq('schedule_id', id)
        for (const r of (data ?? []) as { assembly_class: RuleClass; rules: Partial<Rules> | null }[]) deltas[r.assembly_class] = r.rules ?? {}
      }
      if (cancelled) return
      setRows(Object.fromEntries(RULE_CLASSES.map(c => [c, { ...SYS, ...(deltas[c] ?? {}) }])) as Record<RuleClass, Rules>)
    })()
    return () => { cancelled = true }
  }, [scheduleId])
  return rows
}

/** Count of per-class values that differ from their baseline. */
export function classOverrideCount(ov: ClassRuleValues, baselines: Record<RuleClass, Rules> | null): number {
  let n = 0
  for (const c of RULE_CLASSES)
    for (const [k, v] of Object.entries(ov[c]) as [ClassRuleKey, number][])
      if (!baselines || baselines[c][k] !== v) n++
  return n
}

export default function ClassRulesTable({ labels, values, setValues, baselines, baselineLabel }: {
  labels: Record<ClassRuleKey, string>
  values: ClassRuleValues
  setValues: (fn: (prev: ClassRuleValues) => ClassRuleValues) => void
  baselines: Record<RuleClass, Rules> | null
  baselineLabel: string
}) {
  function set(c: RuleClass, k: ClassRuleKey, v: number | null) {
    setValues(prev => {
      const entry = { ...prev[c] }
      if (v == null || (baselines && baselines[c][k] === v)) delete entry[k]
      else entry[k] = v
      return { ...prev, [c]: entry }
    })
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-gray-500 text-left">
          <th className="pb-1 font-medium" />
          {RULE_CLASSES.map(c => <th key={c} className="pb-1 font-medium text-right capitalize">{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {CLASS_RULE_KEYS.map(k => (
          <tr key={k} className="hover:bg-gray-800/40">
            <td className="py-1 px-2 text-gray-400">{labels[k]}</td>
            {RULE_CLASSES.map(c => {
              const base = baselines?.[c][k]
              const own = values[c][k]
              const overridden = own !== undefined && own !== base
              return (
                <td key={c} className="py-1 pl-2 text-right">
                  <CalcInput value={own ?? base ?? null} decimals={1}
                    onCommit={v => set(c, k, v)}
                    onClear={() => set(c, k, null)}
                    title={overridden ? `${baselineLabel}: ${base ?? '…'} — clear to follow ${baselineLabel}` : `from ${baselineLabel}`}
                    className={`w-16 bg-gray-800 border rounded px-2 py-0.5 text-xs text-right font-mono focus:outline-none focus:border-blue-500 ${
                      overridden ? 'border-blue-700 text-blue-300' : 'border-gray-700 text-white'
                    }`} />
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
