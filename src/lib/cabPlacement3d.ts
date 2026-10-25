// Where a cabinet sits in the room 3D world (Room3DScene CabinetMesh, and the
// cross section that slices it — z_section_view). Cabinet local space:
// +X along the wall (width), +Y up, +Z into the room (depth); world = [plan x,
// height, plan y]. The group origin is the cabinet's bottom-back-left corner,
// turned by rotY = −angle so local +X runs with the wall.
//
// When +Z must point the other way the cabinet is turned 180° (rotY + π) with
// its origin moved to the far end of its span — a real rotation, never a mirror:
// a negative scale flips face winding, which culls drei <Edges> (fat-line quads)
// and see-through faces, and swaps the cabinet's left/right.
//   isNaturalPerp = true  → rotY=−angle makes +Z point toward wall inward ✓
//   isNaturalPerp = false → +Z points outward → turn
//   isFlipped (back side) → cabinet faces opposite side → turn again
//   net: needTurn = (isNaturalPerp === isFlipped)

import type { Wall, CabinetInstance, Room } from './types'
import { wallDir, wallInwardNormal, cabWallSide, cabBottomZ, type RoomRef } from './geometry'

export function cabPlacement3d(cab: CabinetInstance, wall: Wall, rc: RoomRef, room: Room) {
  const angleRad = wall.angle * Math.PI / 180
  const perp     = wallInwardNormal(wall, rc)
  const wd       = wallDir(wall)
  // Back-side cabinets (islands and standard walls alike) face away from the
  // room — same test the plan view uses via cabWallPerp.
  const isFlipped = cabWallSide(cab, wall) === 'back'
  // natural +Z after rotY=−angle = (−sin θ, cos θ) in plan space
  const isNaturalPerp = (perp.x * (-Math.sin(angleRad)) + perp.y * Math.cos(angleRad)) >= 0
  const needTurn = isNaturalPerp === isFlipped
  const floorY = cabBottomZ(cab, room, wall)
  const rotY   = -angleRad + (needTurn ? Math.PI : 0)
  // Turned: local +X runs back along the wall, so the origin is the span's far end.
  const originX = cab.pos_x + (needTurn ? cab.dx * wd.x : 0)
  const originZ = cab.pos_y + (needTurn ? cab.dx * wd.y : 0)
  return { originX, originZ, floorY, rotY, isFlipped, perp, wd }
}
