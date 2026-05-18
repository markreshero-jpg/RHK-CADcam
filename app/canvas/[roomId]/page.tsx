import { notFound } from 'next/navigation'
import { createServerClient } from '@/src/lib/supabase-server'
import { Project, Room, Wall, CabinetInstance } from '@/src/lib/types'
import CanvasClient from './CanvasClient'

export const dynamic = 'force-dynamic'

export default async function CanvasPage({
  params,
}: {
  params: Promise<{ roomId: string }>
}) {
  const { roomId } = await params
  const supabase = await createServerClient()

  // Load room
  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single()

  if (!room) notFound()

  // Load project, walls, cabinets in parallel
  const [{ data: project }, { data: walls }, { data: cabinets }] = await Promise.all([
    supabase.from('projects').select('*').eq('id', (room as Room).project_id).single(),
    supabase.from('walls').select('*').eq('room_id', roomId).order('sort_order'),
    supabase.from('cabinet_instances').select('*').eq('room_id', roomId).order('created_at'),
  ])

  return (
    <CanvasClient
      project={project as Project}
      room={room as Room}
      walls={(walls ?? []) as Wall[]}
      initialCabinets={(cabinets ?? []) as CabinetInstance[]}
    />
  )
}
