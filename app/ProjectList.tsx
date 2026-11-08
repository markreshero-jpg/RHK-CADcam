'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Project, Room, ProjectStatus } from '@/src/lib/types'
import ProjectCard from './ProjectCard'

/** Room plus its latest edit time across everything drawn in it (room_last_activity RPC). */
export type RoomWithActivity = Room & { last_activity_at?: string }
type ProjectWithRooms = Project & { rooms: RoomWithActivity[] }

// ── Status tiles ────────────────────────────────────────────────────────────────

type StatusFilter = 'active' | ProjectStatus

const STATUS_TILES: { key: StatusFilter; label: string; dot: string }[] = [
  { key: 'active',        label: 'Active jobs',   dot: 'bg-accent' },
  { key: 'draft',         label: 'Draft',         dot: 'bg-gray-500' },
  { key: 'quoted',        label: 'Quoted',        dot: 'bg-yellow-500' },
  { key: 'approved',      label: 'Approved',      dot: 'bg-blue-500' },
  { key: 'in_production', label: 'In production', dot: 'bg-green-500' },
  { key: 'completed',     label: 'Completed',     dot: 'bg-purple-500' },
  { key: 'archived',      label: 'Archived',      dot: 'bg-gray-600' },
]

type SortKey = 'newest' | 'updated' | 'job'

// ── Quick links (admin pages — the proxy blocks them for testers) ───────────────

const LIBRARY_LINKS: { href: string; label: string }[] = [
  { href: '/library/cabinets',             label: 'Cabinets' },
  { href: '/library/doors',                label: 'Doors' },
  { href: '/library/materials',            label: 'Materials' },
  { href: '/library/fixtures',             label: 'Fixtures' },
  { href: '/library/joints',               label: 'Joints' },
  { href: '/library/drawer-boxes',         label: 'Drawer boxes' },
  { href: '/library/construction-methods', label: 'Construction methods' },
  { href: '/library/benchtop-methods',     label: 'Benchtop methods' },
  { href: '/library/schedules',            label: 'Schedules' },
]

// ── Icons ───────────────────────────────────────────────────────────────────────

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <circle cx="7" cy="7" r="4.5"/>
    <line x1="10.4" y1="10.4" x2="14" y2="14"/>
  </svg>
)

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    className={`transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}>
    <polyline points="5,3 9,7 5,11"/>
  </svg>
)

// ── Helpers ─────────────────────────────────────────────────────────────────────

/** Latest edit to the job or anything in its rooms — "last touched". */
function lastActivity(p: ProjectWithRooms): number {
  let t = Date.parse(p.updated_at) || 0
  for (const r of p.rooms) t = Math.max(t, Date.parse(r.last_activity_at ?? r.updated_at) || 0)
  return t
}

/** Rooms most recently worked on first. */
function roomsByActivity(rooms: RoomWithActivity[]): RoomWithActivity[] {
  return [...rooms].sort((a, b) =>
    (Date.parse(b.last_activity_at ?? b.updated_at) || 0) - (Date.parse(a.last_activity_at ?? a.updated_at) || 0))
}

function haystack(p: ProjectWithRooms): string {
  return [
    p.job_number, p.name, p.client_name, p.client_address, p.notes,
    ...p.rooms.map(r => r.name),
  ].filter(Boolean).join(' ').toLowerCase()
}

/** Leading number in a job name/number ("RHK6595 - Parkedge" → 6595) for sorting. */
function jobNum(p: Project): number {
  const m = (p.job_number ?? p.name).match(/(\d{3,})/)
  return m ? Number(m[1]) : -1
}

function timeAgo(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 14) return `${Math.floor(s / 86400)}d ago`
  return new Date(ms).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

// ── Component ───────────────────────────────────────────────────────────────────

export default function ProjectList({ initialProjects, expand, isAdmin = false }: {
  initialProjects: ProjectWithRooms[]
  expand?: string
  isAdmin?: boolean
}) {
  const [projects, setProjects] = useState(initialProjects)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('active')
  const [sort, setSort] = useState<SortKey>('newest')
  const [showArchived, setShowArchived] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // "/" or Ctrl+K jumps to the search box from anywhere on the page
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function handleStatusChange(id: string, status: ProjectStatus) {
    setProjects(prev => prev.map(p => (p.id === id ? { ...p, status } : p)))
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { active: 0 }
    for (const p of projects) {
      c[p.status] = (c[p.status] ?? 0) + 1
      if (p.status !== 'archived') c.active++
    }
    return c
  }, [projects])

  const recent = useMemo(
    () => projects
      .filter(p => p.status !== 'archived')
      .map(p => ({ p, t: lastActivity(p) }))
      .sort((a, b) => b.t - a.t)
      .slice(0, 6),
    [projects],
  )

  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  const searching = tokens.length > 0

  const sorted = useMemo(() => {
    const list = [...projects]
    if (sort === 'updated') list.sort((a, b) => lastActivity(b) - lastActivity(a))
    else if (sort === 'job') list.sort((a, b) => jobNum(b) - jobNum(a))
    else list.sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0))
    return list
  }, [projects, sort])

  // Search looks through every job (archived too) so old jobs can be found;
  // otherwise the status tile picks the list.
  const shown = sorted.filter(p => {
    if (searching) {
      const h = haystack(p)
      if (!tokens.every(t => h.includes(t))) return false
      return filter === 'active' ? true : p.status === filter
    }
    return filter === 'active' ? p.status !== 'archived' : p.status === filter
  })

  // Rooms whose name matches the search — those cards open so the room shows
  function roomHit(p: ProjectWithRooms): boolean {
    if (!searching) return false
    return p.rooms.some(r => tokens.some(t => t.length >= 3 && r.name.toLowerCase().includes(t)))
  }

  const archivedTail = !searching && filter === 'active'
    ? sorted.filter(p => p.status === 'archived')
    : []

  const filterLabel = STATUS_TILES.find(s => s.key === filter)?.label ?? ''

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { setQuery(''); return }
    // Enter on a single job with a single room jumps straight into the canvas
    if (e.key === 'Enter' && shown.length === 1 && shown[0].rooms.length === 1) {
      window.location.href = `/canvas/${shown[0].rooms[0].id}`
    }
  }

  return (
    <div className="space-y-6">

      {/* ── Search ── */}
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none">
          <SearchIcon />
        </span>
        <input
          ref={searchRef}
          autoFocus
          type="text"
          aria-label="Search jobs"
          data-tour="job-search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
          placeholder="Search jobs — job number, name, client, address or room…"
          className="w-full bg-surface border border-edge-strong rounded-xl pl-11 pr-24 py-3 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-colors"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {query ? (
            <button
              onClick={() => { setQuery(''); searchRef.current?.focus() }}
              className="text-xs text-ink-subtle hover:text-ink px-1.5 py-0.5 rounded hover:bg-surface-2"
            >
              Clear
            </button>
          ) : (
            <kbd className="text-[10px] text-ink-subtle border border-edge rounded px-1.5 py-0.5 font-mono">/</kbd>
          )}
        </span>
      </div>

      {/* ── Status tiles ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {STATUS_TILES.map(s => {
          const on = filter === s.key
          return (
            <button
              key={s.key}
              onClick={() => setFilter(on && s.key !== 'active' ? 'active' : s.key)}
              className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                on ? 'border-accent bg-accent/10' : 'border-edge bg-surface hover:border-edge-strong'
              }`}
              aria-pressed={on}
            >
              <div className="text-xl font-semibold text-ink tabular-nums leading-none">{counts[s.key] ?? 0}</div>
              <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-ink-muted">
                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                {s.label}
              </div>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6 items-start">

        {/* ── Job list ── */}
        <section>
          <div className="flex items-center justify-between mb-3 gap-3">
            <h2 className="text-xs font-semibold text-ink-subtle uppercase tracking-wider">
              {searching ? 'Search results' : filterLabel}
              <span className="ml-2 normal-case font-normal tracking-normal">
                {shown.length} {shown.length === 1 ? 'job' : 'jobs'}
              </span>
            </h2>
            <label className="flex items-center gap-2 text-xs text-ink-subtle">
              Sort
              <select
                value={sort}
                onChange={e => setSort(e.target.value as SortKey)}
                className="bg-surface border border-edge rounded px-2 py-1 text-xs text-ink focus:outline-none focus:border-accent"
              >
                <option value="newest">Newest</option>
                <option value="updated">Recently updated</option>
                <option value="job">Job number</option>
              </select>
            </label>
          </div>

          {shown.length === 0 && (
            <div className="border border-dashed border-edge rounded-lg p-8 text-center text-sm text-ink-subtle">
              {searching ? <>No jobs match “{query}”</> : 'No jobs here'}
            </div>
          )}
          <div className="space-y-2">
            {shown.map(p => (
              <ProjectCard
                key={p.id}
                project={p}
                initialRooms={p.rooms}
                defaultExpanded={p.id === expand}
                forceExpanded={roomHit(p)}
                onStatusChange={s => handleStatusChange(p.id, s)}
              />
            ))}
          </div>

          {archivedTail.length > 0 && (
            <div className="mt-8">
              <button
                onClick={() => setShowArchived(v => !v)}
                className="flex items-center gap-2 text-xs font-semibold text-ink-subtle uppercase tracking-wider hover:text-ink-muted transition-colors mb-4"
                aria-expanded={showArchived}
              >
                <ChevronIcon expanded={showArchived} />
                Archived
                <span className="normal-case font-normal tracking-normal">
                  {archivedTail.length} {archivedTail.length === 1 ? 'project' : 'projects'}
                </span>
              </button>
              {showArchived && (
                <div className="space-y-2 opacity-75">
                  {archivedTail.map(p => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      initialRooms={p.rooms}
                      defaultExpanded={p.id === expand}
                      onStatusChange={s => handleStatusChange(p.id, s)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Side panel ── */}
        <aside className="space-y-4">
          <div className="bg-surface border border-edge rounded-lg">
            <h3 className="px-4 pt-3 pb-2 text-xs font-semibold text-ink-subtle uppercase tracking-wider">
              Recently worked on
            </h3>
            {recent.length === 0 && <p className="px-4 pb-3 text-xs text-ink-subtle italic">Nothing yet</p>}
            <ul className="pb-2">
              {recent.map(({ p, t }) => (
                <li key={p.id} className="px-4 py-2 border-t border-edge/60 first:border-t-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-ink truncate" title={p.name}>{p.name}</span>
                    <span className="text-[10px] text-ink-subtle shrink-0">{timeAgo(t)}</span>
                  </div>
                  {p.rooms.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {roomsByActivity(p.rooms).slice(0, 6).map(r => (
                        <Link
                          key={r.id}
                          href={`/canvas/${r.id}`}
                          className="text-[11px] text-ink-muted hover:text-white hover:bg-accent bg-surface-2 rounded px-1.5 py-0.5 transition-colors"
                        >
                          {r.name}
                        </Link>
                      ))}
                      {p.rooms.length > 6 && (
                        <button
                          onClick={() => setQuery(p.job_number || p.name)}
                          className="text-[11px] text-ink-subtle hover:text-ink px-1 py-0.5"
                        >
                          +{p.rooms.length - 6} more
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {isAdmin && (
            <div className="bg-surface border border-edge rounded-lg pb-2">
              <h3 className="px-4 pt-3 pb-2 text-xs font-semibold text-ink-subtle uppercase tracking-wider">Library</h3>
              <ul className="grid grid-cols-2 gap-x-2 px-2">
                {LIBRARY_LINKS.map(l => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="block text-xs text-ink-muted hover:text-ink hover:bg-surface-2 rounded px-2 py-1.5 transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="border-t border-edge/60 mt-2 pt-2 px-2">
                <Link
                  href="/settings"
                  className="block text-xs text-ink-muted hover:text-ink hover:bg-surface-2 rounded px-2 py-1.5 transition-colors"
                >
                  Shop settings
                </Link>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
