import type { Viewport } from 'next'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/src/lib/supabase-server'
import { Project, Room, Wall, CabinetInstance, BenchtopInstance, RoomFixture, RoomAnnotation } from '@/src/lib/types'
import { ensureJobCadLayers } from '@/src/lib/annotations/cadLayers'
import CanvasClient from './CanvasClient'

export const dynamic = 'force-dynamic'

// The canvas does its own pinch zoom (usePinchZoom). Pinning the page scale stops
// iOS zooming the whole app when a <16px panel input is focused, or when a pinch
// lands on a toolbar. See z_mobile/MOBILE-SPEC.md.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

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

  // Load project, walls, cabinets, benchtops in parallel
  const [{ data: project }, { data: walls }, { data: cabinets }, { data: benchtops }, { data: fixtures }, { data: annotations }, cadLayers] = await Promise.all([
    supabase.from('projects').select('*').eq('id', (room as Room).project_id).single(),
    supabase.from('walls').select('*').eq('room_id', roomId).order('sort_order'),
    supabase.from('cabinet_instances').select('*').eq('room_id', roomId).order('created_at'),
    supabase.from('benchtop_instances').select('*').eq('room_id', roomId).order('created_at'),
    supabase.from('room_fixtures').select('*').eq('room_id', roomId).order('created_at'),
    supabase.from('room_annotations').select('*').eq('room_id', roomId).order('sort_order'),
    // Named CAD layers (z_cad_layers): the job's copy of the shop list, made on first open.
    ensureJobCadLayers(supabase, (room as Room).project_id),
  ])

  return (
    <CanvasClient
      project={project as Project}
      room={room as Room}
      walls={(walls ?? []) as Wall[]}
      initialCabinets={(cabinets ?? []) as CabinetInstance[]}
      initialBenchtops={(benchtops ?? []) as BenchtopInstance[]}
      initialFixtures={(fixtures ?? []) as RoomFixture[]}
      initialAnnotations={(annotations ?? []) as RoomAnnotation[]}
      initialCadLayers={cadLayers}
    />
  )
}
