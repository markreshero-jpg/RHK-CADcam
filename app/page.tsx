import Link from 'next/link'
import { createServerClient } from '@/src/lib/supabase-server'
import { Project, Room } from '@/src/lib/types'

export const dynamic = 'force-dynamic'

// ── Icons ─────────────────────────────────────────────────────────────────────

const LogoIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="10" width="22" height="15" rx="1.5" fill="currentColor" fillOpacity="0.1" stroke="currentColor"/>
    <path d="M3 14 L14 10 L25 14" strokeWidth="1.2"/>
    <line x1="14" y1="10" x2="14" y2="25"/>
    <line x1="3" y1="19" x2="25" y2="19" strokeWidth="0.8" strokeOpacity="0.5"/>
    <line x1="8.5" y1="14" x2="8.5" y2="19" strokeWidth="0.8" strokeOpacity="0.5"/>
    <line x1="19.5" y1="14" x2="19.5" y2="19" strokeWidth="0.8" strokeOpacity="0.5"/>
  </svg>
)

const MaterialsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="1.5" width="12" height="3" rx="0.6"/>
    <rect x="1.5" y="6" width="12" height="3" rx="0.6"/>
    <rect x="1.5" y="10.5" width="12" height="3" rx="0.6"/>
  </svg>
)

const SchedulesIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="1.5" width="12" height="12" rx="1"/>
    <line x1="1.5" y1="5.5" x2="13.5" y2="5.5"/>
    <line x1="6" y1="5.5" x2="6" y2="13.5"/>
  </svg>
)

const SettingsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7.5" cy="7.5" r="2"/>
    <path d="M7.5 1v1.5M7.5 12.5V14M14 7.5h-1.5M2.5 7.5H1M12.4 3.1l-1.1 1.1M3.7 11.3l-1.1 1.1M12.4 11.9l-1.1-1.1M3.7 3.7l-1.1-1.1"/>
  </svg>
)

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="7" y1="2" x2="7" y2="12"/>
    <line x1="2" y1="7" x2="12" y2="7"/>
  </svg>
)

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

const ArrowRightIcon = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="2" y1="6.5" x2="11" y2="6.5"/>
    <polyline points="7,3 11,6.5 7,10"/>
  </svg>
)

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { badge: string; bar: string; dot: string }> = {
  draft:         { badge: 'bg-gray-700/60 text-gray-400',           bar: 'bg-gray-600',    dot: 'bg-gray-500' },
  quoted:        { badge: 'bg-yellow-900/50 text-yellow-300',        bar: 'bg-yellow-600',  dot: 'bg-yellow-500' },
  approved:      { badge: 'bg-blue-900/50 text-blue-300',            bar: 'bg-blue-600',    dot: 'bg-blue-500' },
  in_production: { badge: 'bg-green-900/50 text-green-300',          bar: 'bg-green-600',   dot: 'bg-green-500' },
  completed:     { badge: 'bg-purple-900/50 text-purple-300',        bar: 'bg-purple-600',  dot: 'bg-purple-500' },
  archived:      { badge: 'bg-gray-800/60 text-gray-600',            bar: 'bg-gray-700',    dot: 'bg-gray-600' },
}

// ── Data ──────────────────────────────────────────────────────────────────────

async function getProjectsWithFirstRoom(): Promise<(Project & { first_room_id: string | null })[]> {
  const supabase = createServerClient()

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  if (!projects?.length) return []

  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, project_id')
    .in('project_id', projects.map((p) => p.id))
    .order('created_at', { ascending: true })

  const firstRoom: Record<string, string> = {}
  for (const r of (rooms ?? []) as Pick<Room, 'id' | 'project_id'>[]) {
    if (!firstRoom[r.project_id]) firstRoom[r.project_id] = r.id
  }

  return projects.map((p) => ({ ...p, first_room_id: firstRoom[p.id] ?? null }))
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const projects = await getProjectsWithFirstRoom()

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-blue-400">
            <LogoIcon />
          </span>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight leading-none">RHK CADcam</h1>
            <p className="text-[10px] text-gray-500 mt-0.5">Cabinet Design & Manufacturing</p>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          <Link
            href="/library/materials"
            className="flex items-center gap-2 text-gray-400 hover:text-gray-100 text-sm px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <MaterialsIcon />
            Materials
          </Link>
          <Link
            href="/library/schedules"
            className="flex items-center gap-2 text-gray-400 hover:text-gray-100 text-sm px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <SchedulesIcon />
            Schedules
          </Link>
          <Link
            href="/settings"
            className="flex items-center gap-2 text-gray-400 hover:text-gray-100 text-sm px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <SettingsIcon />
            Settings
          </Link>
          <div className="w-px h-5 bg-gray-800 mx-1" />
          <Link
            href="/projects/new"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <PlusIcon />
            New Project
          </Link>
        </nav>
      </header>

      {/* Content */}
      <main className="px-6 py-6 max-w-5xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Projects
            {projects.length > 0 && (
              <span className="ml-2 text-gray-600 normal-case font-normal tracking-normal">
                {projects.length} total
              </span>
            )}
          </h2>
        </div>

        {projects.length === 0 ? (
          <div className="border border-dashed border-gray-800 rounded-xl p-16 text-center">
            <span className="inline-flex text-gray-700 mb-4">
              <FolderIcon />
            </span>
            <p className="text-gray-500 text-sm mb-1">No projects yet</p>
            <p className="text-gray-700 text-xs mb-5">Create your first cabinet design project to get started</p>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
            >
              <PlusIcon />
              Create your first project
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => {
              const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.draft
              return (
                <div
                  key={p.id}
                  className="relative bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-lg overflow-hidden transition-all group"
                >
                  {/* Status bar */}
                  <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${cfg.bar}`} />

                  <div className="flex items-center gap-4 px-5 py-3.5 pl-6">

                    {/* Folder icon */}
                    <span className="flex-none text-gray-600 group-hover:text-gray-500 transition-colors">
                      <FolderIcon />
                    </span>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-semibold text-white text-sm">{p.name}</span>
                        <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {p.status.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {p.client_name && (
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <ClientIcon />
                            {p.client_name}
                          </span>
                        )}
                        {p.client_address && (
                          <span className="flex items-center gap-1 text-xs text-gray-600">
                            <LocationIcon />
                            {p.client_address}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-5 shrink-0">
                      <span className="flex items-center gap-1.5 text-[11px] text-gray-600">
                        <CalendarIcon />
                        {new Date(p.created_at).toLocaleDateString('en-AU', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </span>

                      {p.first_room_id ? (
                        <Link
                          href={`/canvas/${p.first_room_id}`}
                          className="flex items-center gap-2 text-xs font-medium text-blue-400 hover:text-white bg-blue-900/30 hover:bg-blue-600 border border-blue-800/60 hover:border-blue-500 px-3 py-1.5 rounded-lg transition-all"
                        >
                          Open Canvas
                          <ArrowRightIcon />
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-700 italic">No rooms</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
