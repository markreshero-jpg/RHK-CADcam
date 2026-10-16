'use client'

// Edge tab on a phone side drawer (z_mobile/MOBILE-SPEC.md). Styled like the
// app's floating toolbars (SnapToolbar popover): frosted gray-900, gray-700 edge,
// line-icon chevron that turns to point the way the drawer will move.
export default function PhoneDrawerTab({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      title={hidden ? 'Show panel' : 'Hide panel'}
      aria-label={hidden ? 'Show panel' : 'Hide panel'}
      aria-expanded={!hidden}
      className="mt-3 w-6 h-12 flex-none flex items-center justify-center rounded-l-lg
        bg-gray-900/90 backdrop-blur-sm border border-r-0 border-gray-700 shadow-xl
        text-gray-400 hover:text-gray-100 active:bg-gray-800 transition-colors">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
        className={`transition-transform duration-200 ${hidden ? 'rotate-180' : ''}`}>
        <path d="M6 3.5 10.5 8 6 12.5" />
      </svg>
    </button>
  )
}
