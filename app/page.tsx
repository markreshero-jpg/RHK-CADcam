import Link from 'next/link'
import { createServerClient } from '@/src/lib/supabase-server'
import { SignOutButton } from './SignOutButton'
import { ThemeToggle } from './ThemeToggle'
import { Project, Room } from '@/src/lib/types'
import ProjectCard from './ProjectCard'

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

// ── Data ──────────────────────────────────────────────────────────────────────

async function getProjectsWithRooms(): Promise<(Project & { rooms: Room[] })[]> {
  const supabase = await createServerClient()

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  if (!projects?.length) return []

  const { data: rooms } = await supabase
    .from('rooms')
    .select('*')
    .in('project_id', projects.map((p) => p.id))
    .order('sort_order', { ascending: true })

  const roomsByProject: Record<string, Room[]> = {}
  for (const r of (rooms ?? []) as Room[]) {
    (roomsByProject[r.project_id] ??= []).push(r)
  }

  return projects.map((p) => ({ ...p, rooms: roomsByProject[p.id] ?? [] }))
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function HomePage({ searchParams }: {
  searchParams: Promise<{ expand?: string }>
}) {
  const { expand } = await searchParams
  const projects = await getProjectsWithRooms()

  return (
    <div className="min-h-screen bg-canvas text-ink">

      {/* Header */}
      <header className="border-b border-edge px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-accent-ink">
            <LogoIcon />
          </span>
          <div>
            <h1 className="text-sm font-bold text-ink tracking-tight leading-none">RHK CADcam</h1>
            <p className="text-[10px] text-ink-subtle mt-0.5">Cabinet Design & Manufacturing</p>
          </div>
          <ThemeToggle className="ml-1" />
        </div>

        <nav className="flex items-center gap-1">
          <Link
            href="/settings"
            className="flex items-center gap-2 text-ink-muted hover:text-ink text-sm px-3 py-2 rounded-lg hover:bg-surface-2 transition-colors"
          >
            <SettingsIcon />
            Settings
          </Link>
          <div className="w-px h-5 bg-edge mx-1" />
          <Link
            href="/projects/new"
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <PlusIcon />
            New Project
          </Link>
          <SignOutButton />
        </nav>
      </header>

      {/* Content */}
      <main className="px-6 py-6 max-w-5xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-ink-subtle uppercase tracking-wider">
            Projects
            {projects.length > 0 && (
              <span className="ml-2 text-ink-subtle normal-case font-normal tracking-normal">
                {projects.length} total
              </span>
            )}
          </h2>
        </div>

        {projects.length === 0 ? (
          <div className="border border-dashed border-edge rounded-xl p-16 text-center">
            <span className="inline-flex text-ink-subtle mb-4">
              <FolderIcon />
            </span>
            <p className="text-ink-subtle text-sm mb-1">No projects yet</p>
            <p className="text-ink-subtle text-xs mb-5">Create your first cabinet design project to get started</p>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 text-accent-ink hover:text-accent-hover text-sm font-medium transition-colors"
            >
              <PlusIcon />
              Create your first project
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} initialRooms={p.rooms} defaultExpanded={p.id === expand} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
