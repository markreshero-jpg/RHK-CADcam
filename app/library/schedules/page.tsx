import { redirect } from 'next/navigation'

// The schedules editor lives in Settings (with the sidebar nav) as the
// Material Schedules tab — this bare route only exists for old links.
export default function SchedulesPage() {
  redirect('/settings?tab=materials_schedule')
}
