import type { CabinetInstance, Wall, Room } from '@/src/lib/types'
import { cabT } from '@/src/lib/geometry'
import { dbJoinKickRun, dbSeparateKickRun, type KickRunMutation } from './canvasDB'

// Gap (mm) within which two cabinets along a wall count as touching.
const KICK_TOL = 2

// A cabinet can take part in a joined kick run when it's a floor unit (base/tall,
// corners excluded in v1) with a ladder toe kick, and isn't itself a kick
// assembly. A null toe_type inherits the construction-method default (ladder),
// so only explicit 'leg'/'none' are excluded.
export function eligibleForKickRun(c: CabinetInstance): boolean {
  return !c.is_kick_assembly
    && (c.assembly_class === 'base' || c.assembly_class === 'tall')
    && c.has_toekick && c.toe_type !== 'leg' && c.toe_type !== 'none'
}

// The contiguous straight run of kick-eligible cabinets containing `clicked`,
// walking left then right while each neighbour touches within tolerance. Returns
// the members ordered left→right (empty when `clicked` itself isn't eligible).
export function detectKickRun(
  clicked: CabinetInstance,
  cabinets: CabinetInstance[],
  wall: Wall,
): CabinetInstance[] {
  if (!eligibleForKickRun(clicked)) return []
  const onWall = cabinets
    .filter(c => c.wall_id === wall.id && eligibleForKickRun(c))
    .map(c => ({ c, t0: cabT(c, wall), t1: cabT(c, wall) + c.dx }))
    .sort((a, b) => a.t0 - b.t0)
  const idx = onWall.findIndex(x => x.c.id === clicked.id)
  if (idx < 0) return []
  const run = [onWall[idx]]
  for (let i = idx - 1; i >= 0; i--) {
    if (run[0].t0 - onWall[i].t1 <= KICK_TOL) run.unshift(onWall[i]); else break
  }
  for (let i = idx + 1; i < onWall.length; i++) {
    if (onWall[i].t0 - run[run.length - 1].t1 <= KICK_TOL) run.push(onWall[i]); else break
  }
  return run.map(x => x.c)
}

// NB: a previous design dissolved a run when a move broke contiguity. That was
// dropped — moving a member now re-fits the kick assembly (syncKickAssembly) and
// the join always persists. The old `runIsContiguous` helper was removed with it.

interface KickRunOpsParams {
  cabinets:          CabinetInstance[]
  walls:             Wall[]
  room:              Room
  setCabinets:       React.Dispatch<React.SetStateAction<CabinetInstance[]>>
  applyKickMutation: (m: KickRunMutation) => void
  setContextMenu:    (v: null) => void
}

export function useKickRunOps(p: KickRunOpsParams) {
  const { cabinets, walls, room, applyKickMutation, setContextMenu } = p

  // Auto-detect the run from the clicked cabinet, warn on mixed depths (build to
  // the deepest on OK), then create the run + its standalone kick assembly.
  async function handleJoinKicks(cabId: string) {
    setContextMenu(null)
    const clicked = cabinets.find(c => c.id === cabId)
    const wall = walls.find(w => w.id === clicked?.wall_id)
    if (!clicked || !wall) return

    const run = detectKickRun(clicked, cabinets, wall)
    if (run.length < 2) {
      window.alert('Joining kicks needs at least two adjacent base/tall cabinets in a straight run.')
      return
    }

    const depths = [...new Set(run.map(c => Math.round(c.dz)))].sort((a, b) => a - b)
    if (depths.length > 1) {
      const deepest = Math.round(Math.max(...run.map(c => c.dz)))
      const ok = window.confirm(
        `This run mixes cabinet depths (${depths.join('/')}mm). ` +
        `Build one continuous kick to the deepest (${deepest}mm)?`,
      )
      if (!ok) return
    }

    const label = `KICK ${cabinets.filter(c => c.is_kick_assembly).length + 1}`
    const ids = run.map(c => c.id)
    // memberPatches in the mutation carry the detach transform (dy/pos_z/has_toekick
    // + kick_run_id) so we don't need to patch member state manually here.
    applyKickMutation(await dbJoinKickRun(room.id, ids, label))
  }

  // Detach a SINGLE cabinet's kick into its own standalone kick assembly.
  async function handleDetachKickSingle(cabId: string) {
    setContextMenu(null)
    const clicked = cabinets.find(c => c.id === cabId)
    if (!clicked || !eligibleForKickRun(clicked) || clicked.kick_run_id) return
    const label = `KICK ${cabinets.filter(c => c.is_kick_assembly).length + 1}`
    applyKickMutation(await dbJoinKickRun(room.id, [cabId], label))
  }

  async function handleSeparateKicks(cabId: string) {
    setContextMenu(null)
    const runId = cabinets.find(c => c.id === cabId)?.kick_run_id
    if (!runId) return
    // memberPatches restore each member (kick reattached, kick_run_id cleared).
    applyKickMutation(await dbSeparateKickRun(runId))
  }

  return { handleJoinKicks, handleDetachKickSingle, handleSeparateKicks }
}
