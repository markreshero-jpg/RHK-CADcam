'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Project, ProjectStatus, Room, ROOM_STATUS_OPTIONS, type RoomStatus } from '@/src/lib/types'
import { supabase } from '@/src/lib/supabase'
import { useIsAdmin } from '@/src/lib/useRole'
import RoomPropertiesModal from './canvas/[roomId]/RoomPropertiesModal'
import TakeOfflineButton, { useOfflineRooms } from './TakeOfflineButton'
import DeleteRoomModal from './DeleteRoomModal'
import DeleteProjectModal from './DeleteProjectModal'

type RoomCounts = { cabinets: number; walls: number; benchtops: number; fixtures: number }
type ProjectCounts = { rooms: number; cabinets: number }

// ── Status config (shared shape with the projects page) ─────────────────────────

const STATUS_CONFIG: Record<string, { badge: string; bar: string; dot: string }> = {
  draft:         { badge: 'bg-surface-3/60 text-ink-muted',          bar: 'bg-gray-600',    dot: 'bg-gray-500' },
  quoted:        { badge: 'bg-yellow-900/50 text-yellow-300',        bar: 'bg-yellow-600',  dot: 'bg-yellow-500' },
  approved:      { badge: 'bg-blue-900/50 text-blue-300',            bar: 'bg-blue-600',    dot: 'bg-blue-500' },
  in_production: { badge: 'bg-green-900/50 text-green-300',          bar: 'bg-green-600',   dot: 'bg-green-500' },
  completed:     { badge: 'bg-purple-900/50 text-purple-300',        bar: 'bg-purple-600',  dot: 'bg-purple-500' },
  archived:      { badge: 'bg-surface-2/60 text-ink-subtle',         bar: 'bg-gray-700',    dot: 'bg-gray-600' },
}

// ── Icons ───────────────────────────────────────────────────────────────────────

const FolderIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 5 C2 4.1 2.7 3.5 3.5 3.5 L7 3.5 L8.5 5 L15 5 C15.8 5 16.5 5.7 16.5 6.5 L16.5 13.5 C16.5 14.3 15.8 15 15 15 L3.5 15 C2.7 15 2 14.3 2 13.5 Z" fill="currentColor" fillOpacity="0.1"/>
  </svg>
)

const ClientIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="4" r="2.2"/>
    <path d="M1.5 10.5 C1.5 8.3 3.5 6.5 6 6.5 C8.5 6.5 10.5 8.3 10.5 10.5"/>
  </svg>
)

const LocationIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5.5 1 C3.6 1 2 2.6 2 4.5 C2 6.8 5.5 10.5 5.5 10.5 C5.5 10.5 9 6.8 9 4.5 C9 2.6 7.4 1 5.5 1 Z"/>
    <circle cx="5.5" cy="4.5" r="1.2" fill="currentColor" fillOpacity="0.5"/>
  </svg>
)

const CalendarIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="2" width="9" height="8.5" rx="0.8"/>
    <line x1="1" y1="4.5" x2="10" y2="4.5"/>
    <line x1="3.5" y1="1" x2="3.5" y2="3"/>
    <line x1="7.5" y1="1" x2="7.5" y2="3"/>
  </svg>
)

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    className={`transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}>
    <polyline points="5,3 9,7 5,11"/>
  </svg>
)

const DragHandleIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
    <circle cx="4" cy="2.5" r="1"/><circle cx="8" cy="2.5" r="1"/>
    <circle cx="4" cy="6" r="1"/><circle cx="8" cy="6" r="1"/>
    <circle cx="4" cy="9.5" r="1"/><circle cx="8" cy="9.5" r="1"/>
  </svg>
)

const PencilIcon = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2.5 L11.5 4.5 L5 11 L2.5 11.5 L3 9 Z"/>
  </svg>
)

const ArchiveIcon = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="2.5" width="11" height="3" rx="0.5"/>
    <path d="M2.5 5.5 V11 C2.5 11.5 2.9 12 3.5 12 H10.5 C11.1 12 11.5 11.5 11.5 11 V5.5"/>
    <line x1="5.5" y1="8" x2="8.5" y2="8"/>
  </svg>
)

const UnarchiveIcon = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="2.5" width="11" height="3" rx="0.5"/>
    <path d="M2.5 5.5 V11 C2.5 11.5 2.9 12 3.5 12 H10.5 C11.1 12 11.5 11.5 11.5 11 V5.5"/>
    <path d="M5.5 9 L7 7.5 L8.5 9 M7 7.5 V10.5"/>
  </svg>
)

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 3.5 H11.5 M5 3.5 V2.5 H9 V3.5 M3.5 3.5 L4 11.5 H10 L10.5 3.5"/>
  </svg>
)

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="7" y1="2" x2="7" y2="12"/>
    <line x1="2" y1="7" x2="12" y2="7"/>
  </svg>
)

const CncIcon = () => (
  <svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="2" width="12" height="11" rx="1" />
    <line x1="1.5" y1="5.5" x2="13.5" y2="5.5" />
    <line x1="6" y1="5.5" x2="6" y2="13" />
    <rect x="8" y="7.5" width="3.5" height="3.5" rx="0.4" fill="currentColor" fillOpacity="0.25" />
  </svg>
)

// ── Helpers ─────────────────────────────────────────────────────────────────────

function dimSummary(r: Room): string | null {
  if (r.room_dx != null && r.room_dz != null && r.room_dy != null) {
    return `${r.room_dx} × ${r.room_dz} × ${r.room_dy}mm`
  }
  return null
}

/** Drawing status drop-down on a room row — saves straight to the room. */
function RoomStatusSelect({ status, onChange }: { status: RoomStatus; onChange: (s: RoomStatus) => void }) {
  const opt = ROOM_STATUS_OPTIONS.find(o => o.value === status) ?? ROOM_STATUS_OPTIONS[0]
  return (
    <span className="relative flex-none inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md border border-edge bg-surface-2/60 hover:border-edge-strong transition-colors" title="Drawing status">
      <span className={`w-1.5 h-1.5 rounded-full ${opt.dot}`} />
      <span className={opt.text}>{opt.label}</span>
      <select
        value={status}
        onChange={e => onChange(e.target.value as RoomStatus)}
        className="absolute inset-0 opacity-0 cursor-pointer bg-surface text-ink"
        aria-label="Drawing status"
      >
        {/* Explicit colours — the popup otherwise inherits the badge's light text on a white list */}
        {ROOM_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value} className="bg-surface text-ink">{o.label}</option>)}
      </select>
    </span>
  )
}

// ── Sortable room row ───────────────────────────────────────────────────────────

function SortableRoomRow({ room, removing, offlineAt, onEdit, onDelete, onStatus }: {
  room: Room
  removing: boolean
  /** When this room's copy on this device was saved (Take offline), if there is one. */
  offlineAt?: number
  onEdit: () => void
  onDelete: () => void
  onStatus: (s: RoomStatus) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: room.id })
  const dim = dimSummary(room)

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-2 py-2 rounded-md border transition-all duration-200 group/room ${
        isDragging ? 'border-edge bg-surface shadow-lg relative z-10' : 'border-transparent hover:border-edge hover:bg-surface'
      } ${removing ? 'opacity-0 scale-95' : 'opacity-100'}`}
    >
      {/* Drag handle — only this starts a drag, so the name link still navigates */}
      <span
        {...attributes}
        {...listeners}
        className="flex-none text-ink-subtle/50 hover:text-ink-muted cursor-grab active:cursor-grabbing touch-none"
        title="Drag to reorder"
      >
        <DragHandleIcon />
      </span>

      {/* Room name — navigates to canvas */}
      <Link
        href={`/canvas/${room.id}`}
        className="flex-1 min-w-0 text-sm font-medium text-ink hover:text-accent-ink truncate transition-colors"
      >
        {room.name}
      </Link>

      {/* Kept on this device for no signal (z_offline step 2) */}
      {offlineAt !== undefined && (
        <span data-room-offline={room.id} className="flex-none flex items-center gap-1 text-[11px] text-emerald-500"
          title={`A copy is on this device (saved ${new Date(offlineAt).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}), so it opens with no signal`}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M3 13h10" /></svg>
          Offline
        </span>
      )}

      {/* Dimensions summary (only when set) */}
      {dim && <span className="text-xs shrink-0 text-ink-muted">{dim}</span>}

      {/* Drawing status */}
      <RoomStatusSelect status={room.status ?? 'draft'} onChange={onStatus} />

      {/* Edit */}
      <button
        onClick={onEdit}
        className="flex-none text-ink-subtle hover:text-ink p-1.5 rounded hover:bg-surface-2 transition-colors"
        title="Edit room properties"
      >
        <PencilIcon />
      </button>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="flex-none text-ink-subtle hover:text-red-400 p-1.5 rounded hover:bg-surface-2 transition-colors"
        title="Delete room"
      >
        <TrashIcon />
      </button>
    </li>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────────

export default function ProjectCard({ project, initialRooms, defaultExpanded = false, forceExpanded = false, onStatusChange, onRoomsChange, onDeleted }: {
  project: Project
  initialRooms: Room[]
  defaultExpanded?: boolean
  /** Opens the card while true (dashboard search matched a room name), closes it again after. */
  forceExpanded?: boolean
  onStatusChange?: (status: ProjectStatus) => void
  /** Rooms changed here (status, add, delete, reorder) — keeps the dashboard tiles current. */
  onRoomsChange?: (rooms: Room[]) => void
  /** Job soft-deleted — the dashboard moves it to Deleted jobs. */
  onDeleted?: () => void
}) {
  const isAdmin = useIsAdmin()
  const [expanded, setExpanded] = useState(defaultExpanded || forceExpanded)
  const [prevForce, setPrevForce] = useState(forceExpanded)
  if (forceExpanded !== prevForce) {
    setPrevForce(forceExpanded)
    setExpanded(forceExpanded || defaultExpanded)
  }
  const [rooms, setRooms] = useState<Room[]>(initialRooms)
  const offlineRooms = useOfflineRooms(project.id)
  const firstRooms = useRef(true)
  useEffect(() => {
    if (firstRooms.current) { firstRooms.current = false; return }
    onRoomsChange?.(rooms)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms])
  const [editRoom, setEditRoom] = useState<Room | null>(null)

  // Add Room inline form
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCeiling, setNewCeiling] = useState('')
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Delete Room flow
  const [deleteRoom, setDeleteRoom] = useState<Room | null>(null)
  const [deleteCounts, setDeleteCounts] = useState<RoomCounts | null>(null)
  const [deleteBlocked, setDeleteBlocked] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  // Delete Project flow
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false)
  const [projectCounts, setProjectCounts] = useState<ProjectCounts | null>(null)
  const [deletingProject, setDeletingProject] = useState(false)
  const [deleteProjectError, setDeleteProjectError] = useState<string | null>(null)
  const [projectRemoved, setProjectRemoved] = useState<'fading' | 'gone' | null>(null)

  const cfg = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.draft

  async function handleSaveRoom(updates: Partial<Room>) {
    if (!editRoom) return
    const targetId = editRoom.id
    setRooms(prev => prev.map(r => (r.id === targetId ? { ...r, ...updates } : r)))
    const { error } = await supabase.from('rooms').update(updates).eq('id', targetId)
    if (error) console.error('Failed to save room:', error)
  }

  async function handleRoomStatus(roomId: string, status: RoomStatus) {
    const prev = rooms
    setRooms(rs => rs.map(r => (r.id === roomId ? { ...r, status } : r)))
    const { error } = await supabase.from('rooms').update({ status }).eq('id', roomId)
    if (error) {
      console.error('Failed to update room status:', error)
      setRooms(prev)
    }
  }

  function cancelAdd() {
    setAdding(false)
    setNewName('')
    setNewCeiling('')
    setAddError(null)
  }

  async function handleCreateRoom() {
    const name = newName.trim()
    if (!name || saving) return
    setSaving(true)
    setAddError(null)
    // Next available sort_order = max existing + 1 (0 for the first room)
    const nextSort = rooms.length ? Math.max(...rooms.map(r => r.sort_order)) + 1 : 0
    // Ceiling height maps to room_dy (room_dy = ceiling height in the data model;
    // the spec labels this column room_dz, but room_dz is room depth here).
    const ceiling = newCeiling.trim() === '' ? null : Number(newCeiling)
    const { data, error } = await supabase
      .from('rooms')
      .insert({ project_id: project.id, name, sort_order: nextSort, room_dy: ceiling })
      .select()
      .single()
    setSaving(false)
    if (error || !data) {
      console.error('Failed to create room:', error)
      setAddError('Could not create room. Please try again.')
      return
    }
    setRooms(prev => [...prev, data as Room])
    // Reset and keep the form open so the operator can add another room
    setNewName('')
    setNewCeiling('')
    nameInputRef.current?.focus()
  }

  function openDelete(room: Room) {
    setDeleteRoom(room)
    setDeleteError(null)
    setDeleteCounts(null)
    // Single-room guard — a project must always have at least one room
    if (rooms.length <= 1) {
      setDeleteBlocked(true)
      return
    }
    setDeleteBlocked(false)
    // Fetch cascade counts before showing the confirmation
    void (async () => {
      const [cab, wal, ben, fix] = await Promise.all([
        supabase.from('cabinet_instances').select('*', { count: 'exact', head: true }).eq('room_id', room.id),
        supabase.from('walls').select('*', { count: 'exact', head: true }).eq('room_id', room.id),
        supabase.from('benchtop_instances').select('*', { count: 'exact', head: true }).eq('room_id', room.id),
        supabase.from('room_fixtures').select('*', { count: 'exact', head: true }).eq('room_id', room.id),
      ])
      setDeleteCounts({ cabinets: cab.count ?? 0, walls: wal.count ?? 0, benchtops: ben.count ?? 0, fixtures: fix.count ?? 0 })
    })()
  }

  function closeDelete() {
    setDeleteRoom(null)
    setDeleteBlocked(false)
    setDeleteCounts(null)
    setDeleteError(null)
  }

  async function confirmDelete() {
    if (!deleteRoom || deleting) return
    const targetId = deleteRoom.id
    setDeleting(true)
    setDeleteError(null)
    // Soft delete: the room is hidden (RLS) but nothing is erased; restore
    // from "Deleted rooms" below the room list.
    const { error } = await supabase.rpc('soft_delete_room', { p_room_id: targetId })
    setDeleting(false)
    if (error) {
      console.error('Failed to delete room:', error)
      setDeleteError('Could not delete room. Please try again.')
      return
    }
    closeDelete()
    // Fade the row out, then drop it from local state — card stays expanded
    setRemovingId(targetId)
    window.setTimeout(() => {
      setRooms(prev => prev.filter(r => r.id !== targetId))
      setRemovingId(null)
      void loadDeleted()
    }, 200)
  }

  // ── Archived + deleted rooms ──
  const liveRooms = rooms.filter(r => r.status !== 'archived')
  const archivedRooms = rooms.filter(r => r.status === 'archived')
  const [showArchived, setShowArchived] = useState(false)
  const [deletedRooms, setDeletedRooms] = useState<{ id: string; name: string; deleted_at: string }[]>([])
  const [showDeleted, setShowDeleted] = useState(false)

  async function loadDeleted() {
    const { data, error } = await supabase.rpc('deleted_rooms', { p_project_id: project.id })
    if (error) { console.error('Failed to load deleted rooms:', error); return }
    setDeletedRooms((data ?? []) as { id: string; name: string; deleted_at: string }[])
  }

  useEffect(() => {
    if (expanded) void loadDeleted()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, project.id])

  const [purgeArm, setPurgeArm] = useState<string | null>(null)
  async function purgeRoom(id: string) {
    if (purgeArm !== id) { setPurgeArm(id); return }   // second click confirms
    const { error } = await supabase.rpc('purge_room', { p_room_id: id })
    setPurgeArm(null)
    if (error) { console.error('Failed to permanently delete room:', error); return }
    setDeletedRooms(prev => prev.filter(r => r.id !== id))
  }

  async function restoreRoom(id: string) {
    const { error } = await supabase.rpc('restore_room', { p_room_id: id })
    if (error) { console.error('Failed to restore room:', error); return }
    const { data } = await supabase.from('rooms').select('*').eq('id', id).single()
    if (data) setRooms(prev => [...prev, data as Room].sort((a, b) => a.sort_order - b.sort_order))
    setDeletedRooms(prev => prev.filter(r => r.id !== id))
  }

  // Small activation distance so clicking the handle (or name) isn't read as a drag
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = liveRooms.findIndex(r => r.id === active.id)
    const newIndex = liveRooms.findIndex(r => r.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const prev = rooms
    // Live rooms in their new order, archived rooms after them.
    const reordered = [...arrayMove(liveRooms, oldIndex, newIndex), ...archivedRooms].map((r, i) => ({ ...r, sort_order: i }))
    setRooms(reordered) // optimistic

    // Single batch upsert — id is the conflict target; project_id + name satisfy
    // the NOT NULL columns so the INSERT candidate is valid (conflict → update).
    const payload = reordered.map(r => ({
      id: r.id, project_id: r.project_id, name: r.name, sort_order: r.sort_order,
    }))
    const { error } = await supabase.from('rooms').upsert(payload, { onConflict: 'id' })
    if (error) {
      console.error('Failed to reorder rooms:', error)
      setRooms(prev) // roll back
    }
  }

  const [archiving, setArchiving] = useState(false)

  async function toggleArchive() {
    if (archiving) return
    setArchiving(true)
    // Unarchive restores to draft — the operator can set the real status
    // afterwards via Job Properties in the canvas.
    const next: ProjectStatus = project.status === 'archived' ? 'draft' : 'archived'
    const { error } = await supabase.from('projects').update({ status: next }).eq('id', project.id)
    setArchiving(false)
    if (error) {
      console.error('Failed to update project status:', error)
      return
    }
    onStatusChange?.(next)
  }

  function openDeleteProject() {
    setDeleteProjectOpen(true)
    setDeleteProjectError(null)
    setProjectCounts(null)
    // Fetch cascade counts before showing the confirmation
    void (async () => {
      const roomIds = rooms.map(r => r.id)
      let cabinets = 0
      if (roomIds.length) {
        const { count } = await supabase
          .from('cabinet_instances')
          .select('*', { count: 'exact', head: true })
          .in('room_id', roomIds)
        cabinets = count ?? 0
      }
      setProjectCounts({ rooms: roomIds.length, cabinets })
    })()
  }

  function closeDeleteProject() {
    setDeleteProjectOpen(false)
    setProjectCounts(null)
    setDeleteProjectError(null)
  }

  async function confirmDeleteProject() {
    if (deletingProject) return
    setDeletingProject(true)
    setDeleteProjectError(null)
    // Soft delete — hidden by RLS, restorable from Deleted jobs; only an
    // admin can purge it (purge_project).
    const { error } = await supabase.rpc('soft_delete_project', { p_project_id: project.id })
    setDeletingProject(false)
    if (error) {
      console.error('Failed to delete project:', error)
      setDeleteProjectError('Could not delete project. Please try again.')
      return
    }
    setDeleteProjectOpen(false)
    // Fade the card out, then drop it entirely (server list catches up on next load)
    setProjectRemoved('fading')
    window.setTimeout(() => { setProjectRemoved('gone'); onDeleted?.() }, 200)
  }

  if (projectRemoved === 'gone') return null

  return (
    <div className={`relative bg-surface border border-edge hover:border-edge-strong rounded-lg overflow-hidden transition-all duration-200 group ${
      projectRemoved === 'fading' ? 'opacity-0 scale-95' : 'opacity-100'
    }`}>
      {/* Status bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${cfg.bar}`} />

      {/* ── Card header ── */}
      <div className="flex items-center gap-4 px-5 py-3.5 pl-6">

        <span className="flex-none text-ink-subtle group-hover:text-ink-muted transition-colors">
          <FolderIcon />
        </span>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            {project.job_number && !project.name.includes(project.job_number) && (
              <span className="text-xs font-mono text-ink-subtle">{project.job_number}</span>
            )}
            <span className="font-semibold text-ink text-sm">{project.name}</span>
            <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              {project.status.replace('_', ' ')}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {project.client_name && (
              <span className="flex items-center gap-1 text-xs text-ink-muted">
                <ClientIcon />
                {project.client_name}
              </span>
            )}
            {project.client_address && (
              <span className="flex items-center gap-1 text-xs text-ink-subtle">
                <LocationIcon />
                {project.client_address}
              </span>
            )}
          </div>
        </div>

        {/* Right side: date + room count + chevron */}
        <div className="flex items-center gap-5 shrink-0">
          <span className="flex items-center gap-1.5 text-[11px] text-ink-subtle">
            <CalendarIcon />
            {new Date(project.created_at).toLocaleDateString('en-AU', {
              day: 'numeric', month: 'short', year: 'numeric',
            })}
          </span>

          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-2 text-xs font-medium text-ink-muted hover:text-ink px-2 py-1.5 rounded-lg hover:bg-surface-2 transition-colors"
            aria-expanded={expanded}
          >
            <span>{liveRooms.length} {liveRooms.length === 1 ? 'room' : 'rooms'}</span>
            <ChevronIcon expanded={expanded} />
          </button>

          {liveRooms.length > 0 && <TakeOfflineButton rooms={liveRooms} saved={offlineRooms} />}

          <button
            onClick={toggleArchive}
            disabled={archiving}
            className="flex-none text-ink-subtle hover:text-ink disabled:opacity-40 p-1.5 rounded hover:bg-surface-2 transition-colors"
            title={project.status === 'archived' ? 'Unarchive project' : 'Archive project'}
          >
            {project.status === 'archived' ? <UnarchiveIcon /> : <ArchiveIcon />}
          </button>

          {(
            <button
              onClick={openDeleteProject}
              className="flex-none text-ink-subtle hover:text-red-400 p-1.5 rounded hover:bg-surface-2 transition-colors"
              title="Delete project"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </div>

      {/* ── Expanded room list ── */}
      {expanded && (
        <div className="border-t border-edge bg-surface-2/40 px-3 py-2">
          {rooms.length === 0 && !adding && (
            <p className="text-xs text-ink-subtle italic px-3 py-3">No rooms in this project yet</p>
          )}
          {liveRooms.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={liveRooms.map(r => r.id)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-1">
                  {liveRooms.map((r) => (
                    <SortableRoomRow
                      key={r.id}
                      room={r}
                      removing={removingId === r.id}
                      offlineAt={offlineRooms.get(r.id)}
                      onEdit={() => setEditRoom(r)}
                      onDelete={() => openDelete(r)}
                      onStatus={s => handleRoomStatus(r.id, s)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}

          {/* ── Archived rooms (folded away) ── */}
          {archivedRooms.length > 0 && (
            <div className="mt-1">
              <button
                onClick={() => setShowArchived(v => !v)}
                className="flex items-center gap-1.5 text-[11px] font-medium text-ink-subtle hover:text-ink-muted px-2 py-1 transition-colors"
              >
                <ChevronIcon expanded={showArchived} />
                Archived rooms ({archivedRooms.length})
              </button>
              {showArchived && (
                <ul className="space-y-1 opacity-70">
                  {archivedRooms.map(r => (
                    <li key={r.id} className="flex items-center gap-2 px-2 py-1.5 pl-7 rounded-md hover:bg-surface">
                      <Link href={`/canvas/${r.id}`} className="flex-1 min-w-0 text-sm text-ink-muted hover:text-accent-ink truncate">{r.name}</Link>
                      <RoomStatusSelect status="archived" onChange={st => handleRoomStatus(r.id, st)} />
                      <button onClick={() => openDelete(r)} className="flex-none text-ink-subtle hover:text-red-400 p-1.5 rounded hover:bg-surface-2 transition-colors" title="Delete room">
                        <TrashIcon />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── Deleted rooms (soft delete, restorable) ── */}
          {deletedRooms.length > 0 && (
            <div className="mt-1">
              <button
                onClick={() => setShowDeleted(v => !v)}
                className="flex items-center gap-1.5 text-[11px] font-medium text-ink-subtle hover:text-ink-muted px-2 py-1 transition-colors"
              >
                <ChevronIcon expanded={showDeleted} />
                Deleted rooms ({deletedRooms.length})
              </button>
              {showDeleted && (
                <ul className="space-y-1">
                  {deletedRooms.map(r => (
                    <li key={r.id} className="flex items-center gap-2 px-2 py-1.5 pl-7 rounded-md hover:bg-surface">
                      <span className="flex-1 min-w-0 text-sm text-ink-subtle line-through truncate">{r.name}</span>
                      <span className="text-[11px] text-ink-subtle shrink-0">
                        deleted {new Date(r.deleted_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      </span>
                      <button onClick={() => restoreRoom(r.id)} className="text-[11px] font-medium text-accent-ink hover:text-accent-hover px-2 py-1 rounded hover:bg-surface-2 transition-colors">
                        Restore
                      </button>
                      {isAdmin && (
                        <button onClick={() => purgeRoom(r.id)} onBlur={() => setPurgeArm(null)}
                          className={`text-[11px] font-medium px-2 py-1 rounded transition-colors ${purgeArm === r.id ? 'text-white bg-red-600 hover:bg-red-500' : 'text-ink-subtle hover:text-red-400 hover:bg-surface-2'}`}
                          title="Admin only — erases the room and everything in it">
                          {purgeArm === r.id ? 'Click again to erase' : 'Delete permanently'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── Optimise / CNC ── */}
          {rooms.length > 0 && (
            <div className="mt-1.5 pt-1.5 border-t border-edge/60">
              <Link
                href={`/projects/${project.id}/optimiser`}
                className="flex items-center gap-1.5 text-xs font-medium text-accent-ink hover:text-accent-hover px-2 py-2 rounded-md transition-colors"
              >
                <CncIcon />
                Optimise / CNC
              </Link>
            </div>
          )}

          {/* ── Add Room ── */}
          <div className="mt-1">
            {adding ? (
              <form
                onSubmit={e => { e.preventDefault(); handleCreateRoom() }}
                onKeyDown={e => { if (e.key === 'Escape') cancelAdd() }}
                className="flex flex-wrap items-center gap-2 px-2 py-2 rounded-md border border-edge bg-surface"
              >
                <input
                  ref={nameInputRef}
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Room name"
                  className="flex-1 min-w-[140px] bg-surface-2 border border-edge rounded px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:border-accent"
                />
                <input
                  value={newCeiling}
                  onChange={e => setNewCeiling(e.target.value.replace(/[^0-9.]/g, ''))}
                  inputMode="numeric"
                  placeholder="Ceiling height (mm)"
                  className="w-40 bg-surface-2 border border-edge rounded px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={!newName.trim() || saving}
                  className="text-xs font-semibold text-white bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-colors"
                >
                  {saving ? 'Saving…' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={cancelAdd}
                  className="text-xs font-medium text-ink-muted hover:text-ink px-3 py-1.5 rounded-lg hover:bg-surface-2 transition-colors"
                >
                  Cancel
                </button>
                {addError && <span className="w-full text-xs text-red-400">{addError}</span>}
              </form>
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-accent-ink hover:text-accent-hover px-2 py-2 rounded-md transition-colors"
              >
                <PlusIcon />
                Add Room
              </button>
            )}
          </div>
        </div>
      )}

      {/* Delete project confirmation modal */}
      {deleteProjectOpen && (
        <DeleteProjectModal
          project={project}
          counts={projectCounts}
          busy={deletingProject}
          error={deleteProjectError}
          onCancel={closeDeleteProject}
          onConfirm={confirmDeleteProject}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteRoom && (
        <DeleteRoomModal
          room={deleteRoom}
          counts={deleteCounts}
          blocked={deleteBlocked}
          busy={deleting}
          error={deleteError}
          onCancel={closeDelete}
          onConfirm={confirmDelete}
        />
      )}

      {/* Edit modal */}
      {editRoom && (
        <RoomPropertiesModal
          room={editRoom}
          project={project}
          initialTab="details"
          onClose={() => setEditRoom(null)}
          onSave={handleSaveRoom}
        />
      )}
    </div>
  )
}
