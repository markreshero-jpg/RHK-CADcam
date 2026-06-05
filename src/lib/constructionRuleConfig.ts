// Shared config for construction rule editors
// Used by ConstructionMethodsClient and SettingsClient

import { ConstructionRules, DEFAULT_RULES, EdgingDefaults, DEFAULT_EDGING, EdgeSides } from './resolver/types'

export type RuleKey    = Exclude<keyof ConstructionRules, 'EDGING'>
export type EdgingKey  = keyof Required<EdgingDefaults>

export const RULE_LABELS: Record<RuleKey, string> = {
  TOEH:    'Toe Height (mm)',
  TOE_TYPE:'Toe Type',
  TOESP:   'Toe Setback Panel (mm)',
  TOESCF:  'Toe Scribe Front (mm)',
  TOESCB:  'Toe Scribe Back (mm)',
  TOESCL:  'Toe Scribe Left (mm)',
  TOESCR:  'Toe Scribe Right (mm)',
  SCRBK:   'Scribe Back (mm)',
  SCRBT:   'Scribe Bottom (mm)',
  SCRL:    'Scribe Left (mm)',
  SCRR:    'Scribe Right (mm)',
  SCRT:    'Scribe Top (mm)',
  TOP_TYPE:'Top Type',
  RD:      'Rail Depth (mm)',
  ADJSB_F: 'Adj. Shelf Front Setback (mm)',
  ADJSB_B: 'Adj. Shelf Back Setback (mm)',
  ADJSL:   'Adj. Shelf Left Notch (mm)',
  ADJSR:   'Adj. Shelf Right Notch (mm)',
  FIXSB_F: 'Fixed Shelf Front Setback (mm)',
  FIXSB_B: 'Fixed Shelf Back Setback (mm)',
  IDCL:          'Inner Drawer Front Clearance Left (mm)',
  IDCR:          'Inner Drawer Front Clearance Right (mm)',
  IDFAO:         'Drawer Box Face Above Opening (mm)',
  SLIDE_SETBACK: 'Min Depth Behind Slide (mm)',
  REVT:    'Face Reveal Top (mm)',
  REVB:    'Face Reveal Bottom (mm)',
  REVL:    'Face Reveal Left (mm)',
  REVR:    'Face Reveal Right (mm)',
  REVENDL: 'End Reveal Left (mm)',
  REVENDR: 'End Reveal Right (mm)',
  GAPC:    'Centre Gap (mm)',
  GAPR:    'Row Gap (mm)',
  FACBUF:  'Face Buffer (mm)',
  FACINS:  'Face Inset (mm)',
  BOTTOM_JOIN:      'Bottom Join',
  BOTTOM_BACK_JOIN: 'Bottom / Back Join',
  BACK_JOIN:        'Back Join',
  TOP_BACK_JOIN:    'Top / Back Join',
  RAIL_JOIN:        'Rail / Top Join',
}

export const RULE_GROUPS: { label: string; keys: RuleKey[] }[] = [
  { label: 'Toe Kick',           keys: ['TOEH', 'TOE_TYPE', 'TOESP', 'TOESCF', 'TOESCB', 'TOESCL', 'TOESCR'] },
  { label: 'Case Scribes',       keys: ['SCRBK', 'SCRBT', 'SCRL', 'SCRR', 'SCRT'] },
  { label: 'Top Rail',           keys: ['TOP_TYPE', 'RD'] },
  { label: 'Adjustable Shelves', keys: ['ADJSB_F', 'ADJSB_B', 'ADJSL', 'ADJSR'] },
  { label: 'Fixed Shelves',      keys: ['FIXSB_F', 'FIXSB_B'] },
  { label: 'Inner Drawers',      keys: ['IDCL', 'IDCR', 'IDFAO', 'SLIDE_SETBACK'] },
  { label: 'Face Reveals',       keys: ['REVT', 'REVB', 'REVL', 'REVR', 'REVENDL', 'REVENDR', 'GAPC', 'GAPR'] },
  { label: 'Face Clearance',     keys: ['FACBUF', 'FACINS'] },
  { label: 'Joinery',            keys: ['BOTTOM_JOIN', 'BOTTOM_BACK_JOIN', 'BACK_JOIN', 'TOP_BACK_JOIN', 'RAIL_JOIN'] },
]

export const EDGING_LABELS: Record<EdgingKey, string> = {
  left_side:           'Left Side',
  right_side:          'Right Side',
  bottom:              'Bottom',
  back:                'Back',
  full_top:            'Full Top',
  front_rail:          'Front Rail',
  back_rail:           'Back Rail',
  kick_front_face:     'Kick Face',
  kick_sub_front:      'Kick Sub Front',
  kick_back:           'Kick Back',
  spreader_vertical:   'Spreader Vertical',
  spreader_horizontal: 'Spreader Horizontal',
  adj_shelf:           'Adj Shelf',
  fixed_shelf:         'Fixed Shelf',
  inner_drawer_bottom: 'Inner Drawer Bottom',
  inner_drawer_back:   'Inner Drawer Back',
  inner_drawer_side:   'Inner Drawer Side',
  inner_drawer_front:  'Inner Drawer Front',
  pull_out_bottom:     'Pull-out Bottom',
  pull_out_side:       'Pull-out Side',
  pull_out_back:       'Pull-out Back',
  accessory:           'Accessory',
  divider:             'Divider',
  door:                'Door',
  drawer_face:         'Drawer Face',
  false_panel:         'False Panel',
}

export const EDGING_GROUPS: { label: string; keys: EdgingKey[] }[] = [
  { label: 'Case',     keys: ['left_side','right_side','bottom','back','full_top','front_rail','back_rail'] },
  { label: 'Toe Kick', keys: ['kick_front_face','kick_sub_front','kick_back','spreader_vertical','spreader_horizontal'] },
  { label: 'Internal', keys: ['adj_shelf','fixed_shelf','divider','inner_drawer_bottom','inner_drawer_back','inner_drawer_side','inner_drawer_front','pull_out_bottom','pull_out_side','pull_out_back','accessory'] },
  { label: 'Face',     keys: ['door','drawer_face','false_panel'] },
]

export const EDGE_SIDES: ('top'|'bottom'|'left'|'right')[] = ['top','bottom','left','right']
export const EDGE_LABELS: Record<string, string> = { top:'T', bottom:'B', left:'L', right:'R' }

// Get the effective value for a rule key: stored delta or system default
export function effectiveRule<K extends RuleKey>(delta: Partial<ConstructionRules>, key: K): ConstructionRules[K] {
  return (delta[key] ?? DEFAULT_RULES[key]) as ConstructionRules[K]
}

// Get the effective edge sides for a part: stored edging delta or DEFAULT_EDGING
export function effectiveEdgeSides(delta: Partial<ConstructionRules>, part: EdgingKey): EdgeSides {
  return delta.EDGING?.[part] ?? DEFAULT_EDGING[part]
}

export function sidesEqual(a: EdgeSides, b: EdgeSides): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort(), sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

// Compute a delta (only keys that differ from DEFAULT_RULES)
export function computeDelta(rules: ConstructionRules): Partial<ConstructionRules> {
  const delta: Partial<ConstructionRules> = {}
  for (const k of Object.keys(DEFAULT_RULES) as RuleKey[]) {
    if (rules[k] !== DEFAULT_RULES[k]) (delta as Record<string, unknown>)[k] = rules[k]
  }
  if (rules.EDGING && Object.keys(rules.EDGING).length > 0) {
    delta.EDGING = rules.EDGING
  }
  return delta
}
