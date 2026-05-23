// Config for the drawer box method editor

import {
  DrawerBoxRules, DEFAULT_DB_RULES,
  DbEdgingKey, DbEdgingDefaults, DEFAULT_DB_EDGING, EdgeSides,
} from './resolver/types'

export type { DbEdgingKey, DbEdgingDefaults }
export { DEFAULT_DB_EDGING }

export type DbRuleKey = Exclude<keyof DrawerBoxRules, 'DB_EDGING'>

export const DB_RULE_LABELS: Record<DbRuleKey, string> = {
  DB_SIDE_T:             'Side / Front / Back Thickness (mm)',
  DB_BOTTOM_T:           'Bottom Panel Thickness (mm)',
  DB_BOTTOM_JOIN:        'Bottom Join',
  DB_DADO_HEIGHT:        'Offset off Drawer Box Bottom (mm)',
  DB_DADO_DEPTH:         'Dado Cut Depth (mm)',
  DB_BACK_SETBACK:       'Bottom Setback from Back (mm)',
  DB_JOINT_TYPE:         'Front / Back Joint Type',
  DB_BACK_HEIGHT_ADJUST: 'Back Panel Height Adjust (mm)',
  DB_BACK_WIDTH_ADJUST:  'Back Panel Width Adjust (mm)',
  DB_BACK_Y_OFFSET:      'Offset off Drawer Box Bottom (mm)',
}

export const DB_RULE_GROUPS: { label: string; keys: DbRuleKey[] }[] = [
  { label: 'Bottom',      keys: ['DB_BOTTOM_JOIN', 'DB_DADO_HEIGHT', 'DB_DADO_DEPTH', 'DB_BACK_SETBACK'] },
  { label: 'Joinery',     keys: ['DB_JOINT_TYPE'] },
  { label: 'Back Panel',  keys: ['DB_BACK_HEIGHT_ADJUST', 'DB_BACK_WIDTH_ADJUST', 'DB_BACK_Y_OFFSET'] },
]

export const DB_BOTTOM_JOIN_OPTIONS = [
  { value: 'dado',    label: 'Dado' },
  { value: 'screwed', label: 'Screwed' },
] as const

export const DB_JOINT_TYPE_OPTIONS = [
  { value: 'butt',      label: 'Butt' },
  { value: 'dado',      label: 'Dado' },
  { value: 'dovetail',  label: 'Dovetail' },
] as const

export function effectiveDbRule<K extends DbRuleKey>(
  delta: Partial<DrawerBoxRules>,
  key: K,
): DrawerBoxRules[K] {
  return (delta[key] ?? DEFAULT_DB_RULES[key]) as DrawerBoxRules[K]
}

export function effectiveDbEdgeSides(delta: Partial<DrawerBoxRules>, part: DbEdgingKey): EdgeSides {
  return delta.DB_EDGING?.[part] ?? DEFAULT_DB_EDGING[part]
}

export function dbSidesEqual(a: EdgeSides, b: EdgeSides): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort(), sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

export function computeDbDelta(rules: DrawerBoxRules): Partial<DrawerBoxRules> {
  const delta: Partial<DrawerBoxRules> = {}
  for (const k of Object.keys(DEFAULT_DB_RULES) as DbRuleKey[]) {
    if (rules[k] !== DEFAULT_DB_RULES[k]) {
      (delta as Record<string, unknown>)[k] = rules[k]
    }
  }
  if (rules.DB_EDGING && Object.keys(rules.DB_EDGING).length > 0) {
    delta.DB_EDGING = rules.DB_EDGING
  }
  return delta
}

// ── Edging UI config ──────────────────────────────────────────────────────────

export const DB_EDGING_LABELS: Record<DbEdgingKey, string> = {
  db_left_side:  'Left Side',
  db_right_side: 'Right Side',
  db_bottom:     'Bottom Panel',
  db_front:      'Front Panel',
  db_back:       'Back Panel',
}

export const DB_EDGING_PARTS: DbEdgingKey[] = [
  'db_left_side', 'db_right_side', 'db_bottom', 'db_front', 'db_back',
]

export const DB_EDGE_SIDES: ('top' | 'bottom' | 'left' | 'right')[] = ['top', 'bottom', 'left', 'right']
export const DB_EDGE_LABELS: Record<string, string> = { top: 'T', bottom: 'B', left: 'L', right: 'R' }
