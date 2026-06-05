'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Room } from '@/src/lib/types'
import { supabase } from '@/src/lib/supabase'

// Room name header + switcher dropdown, pinned at the top of the canvas sidebar.
// The room list is loaded fresh from Supabase each time the dropdown opens, so
// rooms created in other sessions show up (never relies on stale props).

export default function RoomSwitcher({ room, onOpenRoomProperties }: {
  room: Room
  onOpenRoomProperties: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Fresh-loaded room list (null = loading)
  const [rooms, setRooms] = useState<Room[] | null>(null)

  // Add New Room inline form
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCeiling, setNewCeiling] = useState('')
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Load rooms fresh whenever the dropdown opens. The "loading" reset to null is
  // done in openMenu (an event handler), so the effect only runs the async fetch.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    supabase
      .from('rooms')
      .select('*')
      .eq('project_id', room.project_id)
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { console.error('Failed to load rooms:', error); setRooms([]) }
        else setRooms((data ?? []) as Room[])
      })
    return () => { cancelled = true }
  }, [open, room.project_id])

  function openMenu() {
    setRooms(null) // show spinner until the fresh fetch resolves
    setOpen(true)
  }

  function close() {
    setOpen(false)
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
    const list = rooms ?? []
    const nextSort = list.length ? Math.max(...list.map(r => r.sort_order)) + 1 : 0
    // Ceiling height maps to room_dy (room_dy = ceiling height in the data model).
    const ceiling = newCeiling.trim() === '' ? null : Number(newCeiling)
    const { data, error } = await supabase
      .from('rooms')
      .insert({ project_id: room.project_id, name, sort_order: nextSort, room_dy: ceiling })
      .select()
      .single()
    setSaving(false)
    if (error || !data) {
      console.error('Failed to create room:', error)
      setAddError('Could not create room. Please try again.')
      return
    }
    setRooms([...list, data as Room])
    setNewName('')
    setNewCeiling('')
    nameInputRef.current?.focus()
  }

  return (
    <div ref={ref} className="flex-none border-b border-gray-800 p-2 relative">
      <button
        onClick={() => (open ? close() : openMenu())}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-800 transition-colors text-left"
        title={room.name}
        aria-expanded={open}
      >
        <span className="flex-1 truncate text-sm font-medium text-gray-200">{room.name}</span>
        <svg
          width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
          className={`flex-none text-gray-500 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
        >
          <polyline points="5,3 9,7 5,11" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-2 right-2 top-full z-40 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 text-sm">

          {/* ── Room list ── */}
          {rooms === null ? (
            <div className="flex items-center justify-center py-4">
              <svg className="animate-spin text-gray-500" width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {rooms.map(r => {
                const active = r.id === room.id
                return (
                  <Link
                    key={r.id}
                    href={`/canvas/${r.id}`}
                    onClick={close}
                    className={`flex items-center gap-2 px-3 py-2 transition-colors ${
                      active ? 'text-white bg-gray-700/60' : 'text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    <span className="flex-none w-3.5 text-blue-400">
                      {active && (
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="2.5,7.5 5.5,10.5 11.5,3.5" />
                        </svg>
                      )}
                    </span>
                    <span className="flex-1 truncate">{r.name}</span>
                  </Link>
                )
              })}
              {rooms.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-500 italic">No rooms</p>
              )}
            </div>
          )}

          <div className="border-t border-gray-700 my-1" />

          {/* ── Room Properties shortcut ── */}
          <button
            onClick={() => { onOpenRoomProperties(); close() }}
            className="w-full text-left px-3 py-2 text-gray-300 hover:bg-gray-700 transition-colors"
          >
            Room Properties
          </button>

          {/* ── Add New Room ── */}
          {adding ? (
            <div
              className="px-3 py-2"
              onKeyDown={e => { if (e.key === 'Escape') { setAdding(false); setNewName(''); setNewCeiling(''); setAddError(null) } }}
            >
              <input
                ref={nameInputRef}
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateRoom() }}
                placeholder="Room name"
                className="w-full mb-1.5 bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500"
              />
              <input
                value={newCeiling}
                onChange={e => setNewCeiling(e.target.value.replace(/[^0-9.]/g, ''))}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateRoom() }}
                inputMode="numeric"
                placeholder="Ceiling height (mm)"
                className="w-full mb-2 bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreateRoom}
                  disabled={!newName.trim() || saving}
                  className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded transition-colors"
                >
                  {saving ? 'Saving…' : 'Create'}
                </button>
                <button
                  onClick={() => { setAdding(false); setNewName(''); setNewCeiling(''); setAddError(null) }}
                  className="text-xs font-medium text-gray-400 hover:text-gray-200 px-2 py-1.5 transition-colors"
                >
                  Cancel
                </button>
              </div>
              {addError && <p className="mt-1.5 text-xs text-red-400">{addError}</p>}
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="w-full text-left px-3 py-2 text-gray-300 hover:bg-gray-700 transition-colors"
            >
              + Add New Room
            </button>
          )}

          <div className="border-t border-gray-700 my-1" />

          {/* ── Manage Rooms ── */}
          <Link
            href={`/?expand=${room.project_id}`}
            onClick={close}
            className="block px-3 py-2 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors"
          >
            Manage Rooms…
          </Link>
        </div>
      )}
    </div>
  )
}
