'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/src/lib/supabase'
import { useAppStore } from '@/src/lib/store'

export default function NewProjectPage() {
  const router = useRouter()
  const { setProject, setRoom } = useAppStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    client_name: '',
    name: '',
    client_address: '',
    notes: '',
    room_name: 'Kitchen',
    room_dy: 2700,  // ceiling height mm
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setForm((prev) => ({
      ...prev,
      [name]: name === 'room_dy' ? (parseInt(value) || 0) : value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data: project, error: projErr } = await supabase
        .from('projects')
        .insert({
          name: form.name,
          client_name: form.client_name || null,
          client_address: form.client_address || null,
          notes: form.notes || null,
          status: 'draft',
          schema_version: '0.4',
        })
        .select()
        .single()

      if (projErr || !project) throw projErr ?? new Error('Failed to create project')

      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .insert({
          project_id: project.id,
          name: form.room_name,
          room_dy: form.room_dy,
        })
        .select()
        .single()

      if (roomErr || !room) throw roomErr ?? new Error('Failed to create room')

      setProject(project)
      setRoom(room)
      router.push(`/canvas/${room.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  const inputCls =
    'w-full bg-surface-2 border border-edge-strong rounded px-3 py-2 text-sm text-ink placeholder-ink-subtle focus:outline-none focus:border-accent transition-colors'

  return (
    <div className="min-h-screen bg-canvas text-ink flex items-center justify-center p-6">
      <div className="w-full max-w-lg">

        <div className="mb-8">
          <Link href="/" className="text-xs text-ink-subtle hover:text-ink-muted mb-4 block">← Projects</Link>
          <h1 className="text-2xl font-bold text-ink tracking-tight">New Project</h1>
          <p className="text-ink-muted text-sm mt-1">Walls are drawn on the canvas after creation.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          <div className="bg-surface border border-edge rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider">Client</h2>
              <span className="text-xs text-accent-ink bg-accent/10 px-2 py-0.5 rounded">CRM link pending</span>
            </div>
            <div>
              <label className="block text-xs text-ink-muted mb-1.5">Client Name</label>
              <input name="client_name" value={form.client_name} onChange={handleChange}
                placeholder="e.g. Smith Residence" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-ink-muted mb-1.5">Project Address</label>
              <input name="client_address" value={form.client_address} onChange={handleChange}
                placeholder="e.g. 12 Main St, Brisbane" className={inputCls} />
            </div>
          </div>

          <div className="bg-surface border border-edge rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider">Project</h2>
            <div>
              <label className="block text-xs text-ink-muted mb-1.5">Project Name *</label>
              <input name="name" value={form.name} onChange={handleChange}
                placeholder="e.g. Smith Kitchen" required className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-ink-muted mb-1.5">Notes</label>
              <textarea name="notes" value={form.notes} onChange={handleChange}
                placeholder="Any job notes..." rows={2} className={inputCls + ' resize-none'} />
            </div>
          </div>

          <div className="bg-surface border border-edge rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider">First Room</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-1">
                <label className="block text-xs text-ink-muted mb-1.5">Room Name</label>
                <input name="room_name" value={form.room_name} onChange={handleChange}
                  placeholder="Kitchen" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-ink-muted mb-1.5">Ceiling Height (mm)</label>
                <input name="room_dy" type="number" value={form.room_dy} onChange={handleChange}
                  onFocus={(e) => e.target.select()} className={inputCls + ' text-right'} />
              </div>
            </div>
            <p className="text-xs text-ink-subtle">Draw walls on the canvas after creating the project.</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/40 rounded-lg p-4">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <button type="submit" disabled={loading || !form.name.trim()}
            className="w-full bg-accent hover:bg-accent-hover disabled:bg-surface-3 disabled:text-ink-subtle text-white font-semibold py-3 rounded-lg transition-colors text-sm">
            {loading ? 'Creating project...' : 'Create Project & Open Canvas →'}
          </button>
        </form>
      </div>
    </div>
  )
}
