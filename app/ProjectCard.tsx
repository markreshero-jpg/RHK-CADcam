'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Project, Room } from '@/src/lib/types'
import { supabase } from '@/src/lib/supabase'
import RoomPropertiesModal from './canvas/[roomId]/RoomPropertiesModal'
import DeleteRoomModal from './DeleteRoomModal'

type RoomCounts = { cabinets: number; walls: number; benchtops: number }

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

// ── Helpers ─────────────────────────────────────────────────────────────────────

function dimSummary(r: Room): { text: string; set: boolean } {
  if (r.room_dx != null && r.room_dz != null && r.room_dy != null) {
    return { text: `${r.room_dx} × ${r.room_dz} × ${r.room_dy}mm`, set: true }
  }
  return { text: '— dimensions not set', set: false }
}

// ── Sortable room row ───────────────────────────────────────────────────────────

function SortableRoomRow({ room, removing, onEdit, onDelete }: {
  room: Room
  removing: boolean
  onEdit: () => void
  onDelete: () => void
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

      {/* Dimensions summary */}
      <span className={`text-xs shrink-0 ${dim.set ? 'text-ink-muted' : 'text-ink-subtle italic'}`}>
        {dim.text}
      </span>

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

export default function ProjectCard({ project, initialRooms, defaultExpanded = false }: {
  project: Project
  initialRooms: Room[]
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [rooms, setRooms] = useState<Room[]>(initialRooms)
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

  const cfg = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.draft

  async function handleSaveRoom(updates: Partial<Room>) {
    if (!editRoom) return
    const targetId = editRoom.id
    setRooms(prev => prev.map(r => (r.id === targetId ? { ...r, ...updates } : r)))
    const { error } = await supabase.from('rooms').update(updates).eq('id', targetId)
    if (error) console.error('Failed to save room:', error)
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
      const [cab, wal, ben] = await Promise.all([
        supabase.from('cabinet_instances').select('*', { count: 'exact', head: true }).eq('room_id', room.id),
        supabase.from('walls').select('*', { count: 'exact', head: true }).eq('room_id', room.id),
        supabase.from('benchtop_instances').select('*', { count: 'exact', head: true }).eq('room_id', room.id),
      ])
      setDeleteCounts({ cabinets: cab.count ?? 0, walls: wal.count ?? 0, benchtops: ben.count ?? 0 })
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
    // FKs referencing rooms are ON DELETE CASCADE, so this removes all walls,
    // cabinets, benchtops and room material rows in one statement.
    const { error } = await supabase.from('rooms').delete().eq('id', targetId)
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
    }, 200)
  }

  // Small activation distance so clicking the handle (or name) isn't read as a drag
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = rooms.findIndex(r => r.id === active.id)
    const newIndex = rooms.findIndex(r => r.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const prev = rooms
    const reordered = arrayMove(rooms, oldIndex, newIndex).map((r, i) => ({ ...r, sort_order: i }))
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

  return (
    <div className="relative bg-surface border border-edge hover:border-edge-strong rounded-lg overflow-hidden transition-all group">
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
            <span>{rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}</span>
            <ChevronIcon expanded={expanded} />
          </button>
        </div>
      </div>

      {/* ── Expanded room list ── */}
      {expanded && (
        <div className="border-t border-edge bg-surface-2/40 px-3 py-2">
          {rooms.length === 0 && !adding && (
            <p className="text-xs text-ink-subtle italic px-3 py-3">No rooms in this project yet</p>
          )}
          {rooms.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={rooms.map(r => r.id)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-1">
                  {rooms.map((r) => (
                    <SortableRoomRow
                      key={r.id}
                      room={r}
                      removing={removingId === r.id}
                      onEdit={() => setEditRoom(r)}
                      onDelete={() => openDelete(r)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
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
