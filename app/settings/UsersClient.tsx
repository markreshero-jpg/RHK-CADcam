'use client'

// ── UsersClient ───────────────────────────────────────────────────────────────
// Settings → Users (admins only). Per login: can-sign-in (allowed_emails),
// role (user_roles) and, for testers, which jobs they can open
// (project_access). Logins themselves are created in the Supabase dashboard.
// See z_access_control/ACCESS-CONTROL-SPEC.md.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { UserRole } from '@/src/lib/role'

interface UserRow {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  role: UserRole | null
  allowed: boolean
}

interface Job {
  id: string
  name: string
  job_number: string | null
  client_name: string | null
  status: string | null
}

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never'

export default function UsersClient() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [access, setAccess] = useState<Set<string>>(new Set())   // `${userId}:${projectId}`
  const [me, setMe] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [jobFilter, setJobFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.rpc('admin_list_users'),
      supabase.from('projects').select('id, name, job_number, client_name, status').order('created_at', { ascending: false }),
      supabase.from('project_access').select('user_id, project_id'),
      supabase.auth.getUser(),
    ]).then(([u, p, a, auth]) => {
      if (cancelled) return
      const err = u.error ?? p.error ?? a.error
      if (err) setError(err.message)
      setUsers((u.data ?? []) as UserRow[])
      setJobs((p.data ?? []) as Job[])
      setAccess(new Set((a.data ?? []).map(r => `${r.user_id}:${r.project_id}`)))
      setMe(auth.data.user?.id ?? null)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  async function setRole(u: UserRow, role: UserRole) {
    setError(null)
    const { error } = await supabase.from('user_roles').upsert({ user_id: u.id, role })
    if (error) { setError(error.message); return }
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, role } : x))
  }

  async function setAllowed(u: UserRow, allowed: boolean) {
    setError(null)
    const { error } = allowed
      ? await supabase.from('allowed_emails').insert({ email: u.email.toLowerCase() })
      : await supabase.from('allowed_emails').delete().in('email', [u.email, u.email.toLowerCase()])
    if (error) { setError(error.message); return }
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, allowed } : x))
  }

  async function toggleJob(userId: string, projectId: string, on: boolean) {
    setError(null)
    const key = `${userId}:${projectId}`
    const { error } = on
      ? await supabase.from('project_access').insert({ user_id: userId, project_id: projectId })
      : await supabase.from('project_access').delete().eq('user_id', userId).eq('project_id', projectId)
    if (error) { setError(error.message); return }
    setAccess(prev => { const n = new Set(prev); if (on) n.add(key); else n.delete(key); return n })
  }

  const filteredJobs = useMemo(() => {
    const q = jobFilter.trim().toLowerCase()
    if (!q) return jobs
    return jobs.filter(j => [j.name, j.job_number, j.client_name].some(v => v?.toLowerCase().includes(q)))
  }, [jobs, jobFilter])

  const jobCount = (userId: string) => jobs.filter(j => access.has(`${userId}:${j.id}`)).length

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 max-w-4xl">
      <p className="text-xs text-ink-subtle mb-4 max-w-2xl leading-relaxed">
        <span className="text-ink-muted font-medium">Admins</span> see every job and can change the library and settings.{' '}
        <span className="text-ink-muted font-medium">Testers</span> only see the jobs ticked for them, and can view but not
        change the library. To add someone, create their login in Supabase → Authentication → Users (tick
        “Auto Confirm User”), then refresh this page.
      </p>

      {error && <div className="text-xs text-red-400 mb-3">{error}</div>}

      {loading ? (
        <p className="text-xs text-ink-subtle">Loading…</p>
      ) : (
        <div className="border border-edge-strong rounded-lg overflow-hidden">
          <div className="flex items-center bg-surface-2/60 border-b border-edge-strong text-[9px] text-ink-subtle uppercase tracking-wide">
            <div className="px-3 py-2 flex-1">Email</div>
            <div className="px-3 py-2" style={{ width: 110 }}>Last sign-in</div>
            <div className="px-3 py-2" style={{ width: 90 }}>Can sign in</div>
            <div className="px-3 py-2" style={{ width: 110 }}>Role</div>
            <div className="px-3 py-2" style={{ width: 120 }}>Jobs</div>
          </div>

          {users.map(u => {
            const isMe = u.id === me
            const isTester = u.role !== 'admin'
            const open = openId === u.id && isTester
            return (
              <div key={u.id} className="border-b border-edge last:border-b-0">
                <div className="flex items-center text-xs">
                  <div className="px-3 py-2 flex-1 text-ink truncate">
                    {u.email}{isMe && <span className="text-ink-subtle"> (you)</span>}
                  </div>
                  <div className="px-3 py-2 text-ink-muted" style={{ width: 110 }}>{fmtDate(u.last_sign_in_at)}</div>
                  <div className="px-3 py-2" style={{ width: 90 }}>
                    <input type="checkbox" checked={u.allowed} disabled={isMe}
                      onChange={e => setAllowed(u, e.target.checked)}
                      title={isMe ? 'You can’t block your own login' : 'On the login allowlist'} />
                  </div>
                  <div className="px-3 py-2" style={{ width: 110 }}>
                    <select value={u.role ?? ''} disabled={isMe}
                      onChange={e => setRole(u, e.target.value as UserRole)}
                      title={isMe ? 'You can’t change your own role' : undefined}
                      className="bg-surface-2 border border-edge-strong rounded px-1.5 py-1 text-xs text-ink disabled:opacity-50">
                      {u.role === null && <option value="" disabled>— none —</option>}
                      <option value="admin">Admin</option>
                      <option value="tester">Tester</option>
                    </select>
                  </div>
                  <div className="px-3 py-2" style={{ width: 120 }}>
                    {isTester ? (
                      <button onClick={() => setOpenId(open ? null : u.id)}
                        className="text-accent-ink hover:text-accent-hover transition-colors">
                        {jobCount(u.id)} of {jobs.length} {open ? '▴' : '▾'}
                      </button>
                    ) : (
                      <span className="text-ink-subtle">All jobs</span>
                    )}
                  </div>
                </div>

                {open && (
                  <div className="bg-surface-2/40 border-t border-edge px-4 py-3">
                    <input value={jobFilter} onChange={e => setJobFilter(e.target.value)}
                      placeholder="Filter jobs…"
                      className="mb-2 w-64 bg-surface-2 border border-edge-strong rounded px-2 py-1 text-xs text-ink placeholder-ink-subtle focus:outline-none focus:border-accent" />
                    <div className="max-h-72 overflow-y-auto space-y-0.5">
                      {filteredJobs.map(j => {
                        const on = access.has(`${u.id}:${j.id}`)
                        return (
                          <label key={j.id} className="flex items-center gap-2 text-xs py-1 px-1 rounded hover:bg-surface-2 cursor-pointer">
                            <input type="checkbox" checked={on} onChange={e => toggleJob(u.id, j.id, e.target.checked)} />
                            <span className="text-ink">{j.name}</span>
                            {j.job_number && <span className="text-ink-subtle">#{j.job_number}</span>}
                            {j.client_name && <span className="text-ink-subtle">· {j.client_name}</span>}
                            {j.status === 'archived' && <span className="text-ink-subtle italic">· archived</span>}
                          </label>
                        )
                      })}
                      {filteredJobs.length === 0 && <p className="text-xs text-ink-subtle italic">No jobs match.</p>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
