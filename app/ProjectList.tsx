'use client'

import { useState } from 'react'
import { Project, Room, ProjectStatus } from '@/src/lib/types'
import ProjectCard from './ProjectCard'

type ProjectWithRooms = Project & { rooms: Room[] }

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    className={`transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}>
    <polyline points="5,3 9,7 5,11"/>
  </svg>
)

export default function ProjectList({ initialProjects, expand }: {
  initialProjects: ProjectWithRooms[]
  expand?: string
}) {
  const [projects, setProjects] = useState(initialProjects)
  const [showArchived, setShowArchived] = useState(false)

  function handleStatusChange(id: string, status: ProjectStatus) {
    setProjects(prev => prev.map(p => (p.id === id ? { ...p, status } : p)))
  }

  const active = projects.filter(p => p.status !== 'archived')
  const archived = projects.filter(p => p.status === 'archived')

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-ink-subtle uppercase tracking-wider">
          Projects
          {active.length > 0 && (
            <span className="ml-2 text-ink-subtle normal-case font-normal tracking-normal">
              {active.length} total
            </span>
          )}
        </h2>
      </div>

      {active.length === 0 && (
        <p className="text-sm text-ink-subtle italic mb-2">No active projects</p>
      )}
      <div className="space-y-2">
        {active.map(p => (
          <ProjectCard
            key={p.id}
            project={p}
            initialRooms={p.rooms}
            defaultExpanded={p.id === expand}
            onStatusChange={s => handleStatusChange(p.id, s)}
          />
        ))}
      </div>

      {archived.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowArchived(v => !v)}
            className="flex items-center gap-2 text-xs font-semibold text-ink-subtle uppercase tracking-wider hover:text-ink-muted transition-colors mb-4"
            aria-expanded={showArchived}
          >
            <ChevronIcon expanded={showArchived} />
            Archived
            <span className="normal-case font-normal tracking-normal">
              {archived.length} {archived.length === 1 ? 'project' : 'projects'}
            </span>
          </button>
          {showArchived && (
            <div className="space-y-2 opacity-75">
              {archived.map(p => (
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
    </>
  )
}
