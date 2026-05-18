import { createServerClient } from '@/src/lib/supabase-server'
import SettingsClient, { type ShopSettings, type SchedKey, type SchedListMap } from './SettingsClient'

export const dynamic = 'force-dynamic'

const SCHED_TABLES: { key: SchedKey; table: string }[] = [
  { key: 'assembly',        table: 'assembly_schedules'        },
  { key: 'toekick',         table: 'toekick_schedules'         },
  { key: 'front',           table: 'front_schedules'           },
  { key: 'drawerbox',       table: 'drawerbox_schedules'       },
  { key: 'inner_drawerbox', table: 'inner_drawerbox_schedules' },
  { key: 'hinge',           table: 'hinge_schedules'           },
  { key: 'slide',           table: 'slide_schedules'           },
  { key: 'handle',          table: 'handle_schedules'          },
  { key: 'benchtop',        table: 'benchtop_schedules'        },
]

export default async function SettingsPage() {
  const supabase = await createServerClient()

  const settingsRes = await supabase.from('shop_settings').select('*').single()

  const schedResults = await Promise.all(
    SCHED_TABLES.map(t => supabase.from(t.table).select('id, name').order('name'))
  )

  const schedLists = Object.fromEntries(
    SCHED_TABLES.map((t, i) => [t.key, (schedResults[i].data ?? []) as { id: string; name: string }[]])
  ) as SchedListMap

  return (
    <SettingsClient
      settings={(settingsRes.data ?? null) as ShopSettings | null}
      schedLists={schedLists}
    />
  )
}
