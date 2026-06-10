'use client'

import type { ResolvedCabinet, ResolverError } from '@/src/lib/resolver/types'

type FixView = 'interior' | 'face'

// Friendly guidance + a suggested editor to jump to, per resolver error code.
// Unknown codes fall back to a humanised code + best-guess editor from the part.
function guidanceFor(err: ResolverError): { title: string; hint: string; fix?: FixView } {
  const part = err.part ?? ''
  const isFace = err.code.startsWith('FACE') || part.startsWith('face')
  const isInterior =
    /SHELF|DRAWER|FITTING|PULL_OUT/.test(err.code) ||
    ['inner_drawer', 'pull_out', 'adj_shelf', 'fixed_shelf', 'accessory', 'divider'].includes(part)

  switch (err.code) {
    case 'INNER_DRAWER_DEPTH_INVALID':
    case 'PULL_OUT_DEPTH_INVALID':
      return {
        title: 'Not deep enough for this fitting',
        hint: 'The cabinet is too shallow to fit a drawer/pull-out runner here. Increase the cabinet depth (right-hand panel), or remove the fitting in the Interior tab.',
        fix: 'interior',
      }
    case 'FITTING_OVERFLOW':
      return {
        title: 'Fitting taller than its compartment',
        hint: 'Lower the fitting height or give it a taller compartment in the Interior tab.',
        fix: 'interior',
      }
    case 'ADJ_SHELF_DEPTH_INVALID':
    case 'FIXED_SHELF_DEPTH_INVALID':
      return { title: 'Shelf depth invalid', hint: 'The shelf depth resolves to an unusable value — check the cabinet depth and shelf setback in the Interior tab.', fix: 'interior' }
    case 'ADJ_SHELF_TOO_NARROW':
      return { title: 'Shelf too narrow', hint: 'The compartment is too narrow for a shelf. Widen the cabinet or the column in the Interior tab.', fix: 'interior' }
    case 'TOO_MANY_ADJ_SHELVES':
      return { title: 'Too many shelves for the height', hint: 'Reduce the shelf count in the Interior tab.', fix: 'interior' }
    case 'FACE_TOO_NARROW':
      return { title: 'Face opening too narrow', hint: 'The cabinet (minus reveals) leaves no room for a face. Widen the cabinet in the right-hand panel.', fix: 'face' }
    case 'FACE_TOO_SHORT':
      return { title: 'Face opening too short', hint: 'The cabinet height (minus toe kick + reveals) leaves no room for a face. Increase the height.', fix: 'face' }
    case 'FACE_GRID_EMPTY':
      return { title: 'Face grid is empty', hint: 'Add at least one row and column in the Face Grid tab.', fix: 'face' }
    case 'FACE_ROWS_OVERFLOW':
      return { title: 'Locked row heights overflow', hint: 'The locked row heights exceed the available face height. Adjust them in the Face Grid tab.', fix: 'face' }
    case 'FACE_COLS_OVERFLOW':
      return { title: 'Locked column widths overflow', hint: 'The locked column widths exceed the available face width. Adjust them in the Face Grid tab.', fix: 'face' }
    case 'CASE_TOO_NARROW':
      return { title: 'Cabinet too narrow', hint: 'The cabinet is narrower than its two side panels. Increase the width in the right-hand panel.' }
    default:
      return {
        title: err.code.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()),
        hint: '',
        fix: isFace ? 'face' : isInterior ? 'interior' : undefined,
      }
  }
}

function ErrorCard({ err, severity, onGoToView }: {
  err: ResolverError
  severity: 'error' | 'warning'
  onGoToView: (v: FixView) => void
}) {
  const g = guidanceFor(err)
  const accent = severity === 'error' ? 'border-red-700/60 bg-red-950/40' : 'border-amber-700/60 bg-amber-950/30'
  const dot    = severity === 'error' ? 'bg-red-500' : 'bg-amber-500'
  const fixLabel = g.fix === 'face' ? 'Fix in Face Grid' : g.fix === 'interior' ? 'Fix in Interior' : null

  return (
    <div className={`rounded-lg border px-3.5 py-3 ${accent}`}>
      <div className="flex items-start gap-2.5">
        <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${dot}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-100">{g.title}</span>
            <code className="text-[10px] font-mono text-gray-500 bg-gray-800/70 rounded px-1.5 py-0.5">{err.code}</code>
            {err.part && (
              <span className="text-[10px] text-gray-400 bg-gray-800/70 rounded px-1.5 py-0.5">{err.part}</span>
            )}
          </div>
          <p className="text-xs text-gray-300 mt-1 font-mono">{err.message}</p>
          {g.hint && <p className="text-xs text-gray-400 mt-1.5">{g.hint}</p>}
          {fixLabel && g.fix && (
            <button
              onClick={() => onGoToView(g.fix!)}
              className="mt-2 text-[11px] font-medium text-blue-300 hover:text-blue-200 bg-blue-900/40 hover:bg-blue-900/60 border border-blue-800/60 rounded px-2.5 py-1 transition-colors"
            >
              {fixLabel} →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CabinetErrorsPanel({ rp, onGoToView }: {
  rp: ResolvedCabinet | undefined
  onGoToView: (v: FixView) => void
}) {
  if (!rp) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-gray-500 p-6 text-center">
        Resolver data isn&apos;t available yet — open another tab to resolve the cabinet, then check back.
      </div>
    )
  }

  const errors = rp.errors ?? []
  const warnings = rp.warnings ?? []

  if (errors.length === 0 && warnings.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-center p-6">
        <div className="h-9 w-9 rounded-full bg-emerald-900/50 border border-emerald-700/60 flex items-center justify-center text-emerald-400 text-lg">✓</div>
        <p className="text-sm text-gray-300">No errors — this cabinet resolves cleanly.</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {errors.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-red-400 font-semibold">
            {errors.length} {errors.length === 1 ? 'error' : 'errors'}
          </p>
          {errors.map((err, i) => (
            <ErrorCard key={`e${i}`} err={err} severity="error" onGoToView={onGoToView} />
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-amber-400 font-semibold">
            {warnings.length} {warnings.length === 1 ? 'warning' : 'warnings'}
          </p>
          {warnings.map((err, i) => (
            <ErrorCard key={`w${i}`} err={err} severity="warning" onGoToView={onGoToView} />
          ))}
        </div>
      )}
    </div>
  )
}
