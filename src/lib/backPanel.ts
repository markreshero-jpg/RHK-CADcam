// ============================================================
// Island bench back panels (z_island_back_panel/ISLAND-BACK-PANEL-SPEC.md).
//
// A non-null `back_panel` on a definition / instance marks it as an island
// back panel (`IBPF` to the floor, `IBPK` to kick height): a base-class item of
// exposed board placed on the back face of an island run. Wider than the sheet
// width → split into equal pieces (resolver/resolveBackPanel.ts).
// ============================================================

import type { CabinetInstance } from './types'

export type BackPanelMount = 'floor' | 'kick'

export interface BackPanelSettings {
  mount:   BackPanelMount   // floor = IBPF, kick = IBPK (starts at r.TOEH)
  sheet_w: number           // widest piece (grain board sheet width); wider panels split evenly
}

export const DEFAULT_BACK_PANEL: BackPanelSettings = { mount: 'floor', sheet_w: 1200 }

export const isBackPanel = (c: Pick<CabinetInstance, 'back_panel'> | null | undefined): boolean => !!c?.back_panel

// Tolerates partial / legacy stored values.
export function normaliseBackPanel(s: Partial<BackPanelSettings> | null | undefined): BackPanelSettings | null {
  if (!s) return null
  return {
    mount: s.mount === 'kick' ? 'kick' : 'floor',
    sheet_w: typeof s.sheet_w === 'number' && s.sheet_w > 0 ? s.sheet_w : DEFAULT_BACK_PANEL.sheet_w,
  }
}

/** Equal pieces no wider than the sheet width (0.5 mm slack so 1200 on a 1200 sheet is one piece). */
export function backPanelPieces(W: number, sheetW: number): number {
  if (!(W > 0)) return 0
  return Math.max(1, Math.ceil((W - 0.5) / Math.max(sheetW, 1)))
}

/** Display name of a back panel part key, or null for anything else. */
export function backPanelPartLabel(k: string): string | null {
  const m = /^ibp:(\d+)$/.exec(k)
  return m ? `Island Back Panel ${m[1]}` : null
}
