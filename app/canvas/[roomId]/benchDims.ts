// Bench + basin heights for an elevation (display layer item `dim_elev_bench`):
// overall dims from the floor to the top of the benchtop on this wall, and to the
// rim of a basin standing proud of it (a vessel; undermount sinks sit below).
import type { BenchtopInstance, RoomFixture } from '@/src/lib/types'

export function benchDimHeights(
  wallId: string,
  benchtops: BenchtopInstance[],
  topZ: (bt: BenchtopInstance) => number,
  fixtures: RoomFixture[],
): number[] {
  const bench = Math.max(0, ...benchtops.filter(bt => bt.wall_id === wallId).map(topZ))
  if (bench <= 0) return []
  const basin = Math.max(0, ...fixtures
    .filter(f => f.wall_id === wallId && f.category === 'sink')
    .map(f => Number(f.z ?? 0) + Number(f.height ?? 0)))
  return basin > bench + 0.5 ? [bench, basin] : [bench]
}
