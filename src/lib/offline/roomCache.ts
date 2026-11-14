// Room copies on this device (z_offline/OFFLINE-SPEC.md, step 2). The canvas keeps the
// room it has open saved here (a moment after each change), so with no signal the
// offline canvas (/offline/canvas?room=…) can open it exactly as it was last seen.

import type { Project, Room, Wall, CabinetInstance, BenchtopInstance, RoomFixture, RoomAnnotation, CadLayer } from '@/src/lib/types'
import { idbAll, idbDelete, idbGet, idbPut, idbClear } from './idb'

export interface RoomSnapshotData {
  project: Project | null
  room: Room
  walls: Wall[]
  cabinets: CabinetInstance[]
  benchtops: BenchtopInstance[]
  fixtures: RoomFixture[]
  annotations: RoomAnnotation[]
  cadLayers: CadLayer[]
}

export interface RoomSnapshot {
  roomId: string
  projectId: string
  projectName: string
  roomName: string
  savedAt: number
  data: RoomSnapshotData
}

export async function saveRoomSnapshot(data: RoomSnapshotData): Promise<boolean> {
  const snap: RoomSnapshot = {
    roomId: data.room.id,
    projectId: data.room.project_id,
    projectName: data.project?.name ?? '',
    roomName: data.room.name,
    savedAt: Date.now(),
    // structuredClone drops anything IndexedDB can't store (functions, class instances).
    data: JSON.parse(JSON.stringify(data)) as RoomSnapshotData,
  }
  return idbPut('rooms', snap)
}

export const getRoomSnapshot = (roomId: string) => idbGet<RoomSnapshot>('rooms', roomId)

/** Every room copy on this device, without the (big) room data. */
export async function listRoomSnapshots(): Promise<Omit<RoomSnapshot, 'data'>[]> {
  const all = await idbAll<RoomSnapshot>('rooms')
  return all.map(r => ({ roomId: r.roomId, projectId: r.projectId, projectName: r.projectName, roomName: r.roomName, savedAt: r.savedAt })).sort((a, b) => a.projectName.localeCompare(b.projectName) || a.roomName.localeCompare(b.roomName))
}

export const deleteRoomSnapshot = (roomId: string) => idbDelete('rooms', roomId)

/** Sign out: forget every room copy and the cached server reads on this device. */
export async function clearOfflineCopies(): Promise<void> {
  await idbClear('rooms')
  try { await caches.delete('rhk-data') } catch { /* no Cache API */ }
}
