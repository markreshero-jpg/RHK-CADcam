'use client'

import { useState } from 'react'
import Link from 'next/link'
import BenchtopMethodsClient from './BenchtopMethodsClient'
import EdgeProfilesClient from './EdgeProfilesClient'
import { ThemeToggle } from '../../ThemeToggle'

// Benchtop Builder settings: build methods + edge profile library.
// Embedded in Settings → Benchtop Builder, and standalone at /library/benchtop-methods.

const TABS = [
  { key: 'methods',  label: 'Build Methods' },
  { key: 'profiles', label: 'Edge Profiles' },
] as const
type TabKey = typeof TABS[number]['key']

export default function BenchtopBuilderClient({ embedded }: { embedded?: boolean }) {
  const [tab, setTab] = useState<TabKey>('methods')

  return (
    <div className={embedded ? 'flex-1 flex flex-col overflow-hidden' : 'h-screen bg-canvas text-ink flex flex-col overflow-hidden'}>
      {!embedded && (
        <div className="flex-none border-b border-edge px-6 py-3 flex items-center gap-3 text-sm">
          <ThemeToggle />
          <Link href="/settings?tab=benchtop_builder" className="text-ink-subtle hover:text-ink-muted transition-colors">← Settings</Link>
          <span className="text-ink-subtle">|</span>
          <span className="font-semibold text-ink">Benchtop Builder</span>
        </div>
      )}

      <div className="flex-none border-b border-edge px-4 flex gap-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2.5 text-xs border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-accent text-ink font-semibold'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'methods' ? <BenchtopMethodsClient embedded /> : <EdgeProfilesClient />}
    </div>
  )
}
