// Faced doors (z_faced_doors): a door blank whose cut board gets a bought-in
// facing (e.g. 4mm mirror) cut to the door's size and stuck on its face.
import type { DoorFacing } from '@/src/lib/resolver/types'

/** Part comment on the cut board, e.g. "4mm MIRROR FACED - stick on after (bought in, same size)". */
export function facedDoorNote(facing: DoorFacing | null | undefined): string | null {
  if (!facing?.thickness_mm) return null
  return `${facing.name.toUpperCase()} FACED - stick on after (bought in, same size)`
}
