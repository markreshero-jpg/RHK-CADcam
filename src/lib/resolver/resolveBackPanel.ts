// ============================================================
// Island back panel parts (z_island_back_panel/ISLAND-BACK-PANEL-SPEC.md).
//
// Cabinet frame: X along the width (0 = left), Y up from the floor, Z from the
// island line (0) out to the panel's outer face (the exposed board thickness).
//
//   ibp:<n>   one piece per sheet-width split, left → right, equal widths;
//             floor (IBPF) from Y 0, kick (IBPK) from r.TOEH, up to the cabinet height
//
// Face-kind frame as the bulkhead fascia: DY along the width, DX the height,
// DZ thickness, turned AY 180 about its right end so the outer face is the
// front (local x = 0 = the piece's right end, edge `left`). Grain runs up the
// panel (grain_direction 'vertical' — the nest turns it). Taped all round,
// joins included; the bottom edge only when it stands on the kick.
// Applied panel, screwed through from inside: no seams / drilling.
// ============================================================

import type { CabinetInput, ConstructionRules, ResolvedCasePart } from './types'
import { backPanelPieces } from '../backPanel'

export function resolveBackPanel(cab: CabinetInput, r: ConstructionRules): ResolvedCasePart[] {
  const s = cab.back_panel
  if (!s) return []
  const W = cab.DX
  const y0 = s.mount === 'kick' ? Number(r.TOEH ?? 0) : 0
  const H = cab.DY - y0
  const t = cab.exposed_material.DZ
  const n = backPanelPieces(W, s.sheet_w)
  if (!(H > 0) || !(t > 0) || n === 0) return []
  const w = W / n
  const out: ResolvedCasePart[] = []
  for (let i = 0; i < n; i++) {
    const x1 = Math.round((i + 1) * w * 10) / 10, x0 = Math.round(i * w * 10) / 10
    out.push({
      part_key: `ibp:${i + 1}`,
      DX: H, DY: x1 - x0, DZ: t,
      X: x1, Y: y0, Z: t, AX: 0, AY: 180, AZ: 0,
      material_id: cab.exposed_material.id,
      edge_band: { top: true, bottom: s.mount === 'kick', left: true, right: true, id: cab.exposed_edgeband_id },
      grain_direction: 'vertical',
    })
  }
  return out
}
