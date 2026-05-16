import Link from 'next/link'
import { createServerClient } from '@/src/lib/supabase-server'
import { Project, Room } from '@/src/lib/types'

export const dynamic = 'force-dynamic'

const STATUS_COLOURS: Record<string, string> = {
  draft:         'bg-gray-700 text-gray-300',
  quoted:        'bg-yellow-900/50 text-yellow-300',
  approved:      'bg-blue-900/50 text-blue-300',
  in_production: 'bg-green-900/50 text-green-300',
  completed:     'bg-purple-900/50 text-purple-300',
  archived:      'bg-gray-800 text-gray-500',
}

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

export default async function HomePage() {
  const projects = await getProjectsWithFirstRoom()

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="border-b border-gray-800 px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">RHK CADcam</h1>
          <p className="text-xs text-gray-500">Cabinet Design & Manufacturing</p>
        </div>
        <Link
          href="/projects/new"
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          + New Project
        </Link>
      </div>

      <div className="px-8 py-6 max-w-5xl">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Projects
        </h2>

        {projects.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-12 text-center">
            <p className="text-gray-500 text-sm mb-4">No projects yet</p>
            <Link
              href="/projects/new"
              className="text-blue-400 hover:text-blue-300 text-sm font-medium"
            >
              Create your first project →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => (
              <div
                key={p.id}
                className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-lg px-5 py-4 transition-all group flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-white">{p.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLOURS[p.status] ?? STATUS_COLOURS.draft}`}>
                      {p.status.replace('_', ' ')}
                    </span>
                  </div>
                  {p.client_name && (
                    <p className="text-sm text-gray-400 mt-0.5">{p.client_name}</p>
                  )}
                  {p.client_address && (
                    <p className="text-xs text-gray-600 mt-0.5">{p.client_address}</p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <p className="text-xs text-gray-600">
                    {new Date(p.created_at).toLocaleDateString('en-AU', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </p>
                  {p.first_room_id ? (
                    <Link
                      href={`/canvas/${p.first_room_id}`}
                      className="text-sm text-blue-400 hover:text-blue-300 px-3 py-1.5 border border-blue-800 hover:border-blue-600 rounded transition-colors"
                    >
                      Open Canvas →
                    </Link>
                  ) : (
                    <span className="text-xs text-gray-600 italic">No rooms</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
