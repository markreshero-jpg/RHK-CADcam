'use client'

// Delete lives at the foot of a properties panel, labelled — never as the header ✕,
// which closes the panel (users hit it expecting "close" and lost cabinets).
export default function PanelDeleteButton({ label, onDelete }: { label: string; onDelete: () => void }) {
  return (
    <div className="px-4 py-3 border-t border-gray-800">
      <button onClick={onDelete}
        className="w-full py-1.5 text-xs rounded border border-red-900/70 text-red-400 hover:bg-red-950/50 hover:text-red-300 transition-colors">
        {label}
      </button>
    </div>
  )
}

/** Header close button for a properties panel (deselects; deletes nothing). */
export function PanelCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button onClick={onClose} title="Close" aria-label="Close"
      className="text-gray-500 hover:text-white text-sm leading-none px-1">✕</button>
  )
}
