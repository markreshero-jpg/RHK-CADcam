// ============================================================
// Method-default fitting joints for the pick list (z_takeoff). The saved
// rebuild (dbLoadResolvedParts) only knows per-cabinet joint picks, not the
// construction method's joint_defaults — so the adj shelf pin joint (and its
// shelf support fitting) is missing for every cabinet that just uses the
// method. Cabinets with internal parts are resolved again here (not saved)
// and their fitting-carrying seam joints merged in — the same joints the CNC
// drills (seamDrillSync resolves the same way).
// ============================================================

import type { ResolvedCabinet, ResolvedSeamJoint } from '../resolver/types'
import { loadCabinetInput } from '../resolver/loadCabinetInput'
import { resolveCabinet } from '../resolver/resolver'

/** Cabinets whose method joints may carry fittings (shelves / divisions). */
export function fittingSeamCabIds(resolved: Map<string, ResolvedCabinet>): string[] {
  return [...resolved].filter(([, r]) => r.internal_parts?.length).map(([id]) => id).sort()
}

/** Each cabinet's fitting-carrying seam joints from a fresh (unsaved) resolve. */
export async function loadFittingSeams(ids: string[], isCancelled: () => boolean = () => false): Promise<Map<string, ResolvedSeamJoint[]>> {
  const byCab = new Map<string, ResolvedSeamJoint[]>()
  for (let i = 0; i < ids.length; i += 8) {
    if (isCancelled()) break
    await Promise.all(ids.slice(i, i + 8).map(async id => {
      try {
        const fresh = resolveCabinet(await loadCabinetInput(id))
        const seams = fresh.seam_joints.filter(sj => sj.ops.some(o => o.fitting))
        if (seams.length) byCab.set(id, seams)
      } catch (e) { console.warn('takeoff: method joints for', id, e) }
    }))
  }
  return byCab
}

/** The resolved cabinets with the method's fitting joints added (a seam the
 *  cabinet already has keeps its own joint). */
export function withFittingSeams(resolved: Map<string, ResolvedCabinet>, byCab: Map<string, ResolvedSeamJoint[]>): Map<string, ResolvedCabinet> {
  if (!byCab.size) return resolved
  const out = new Map(resolved)
  for (const [id, seams] of byCab) {
    const r = out.get(id)
    if (!r) continue
    const have = new Set((r.seam_joints ?? []).map(sj => sj.seam_key))
    const add = seams.filter(sj => !have.has(sj.seam_key))
    if (add.length) out.set(id, { ...r, seam_joints: [...(r.seam_joints ?? []), ...add] })
  }
  return out
}
