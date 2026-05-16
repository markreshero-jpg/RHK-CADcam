'use client'
import { ContextMenuState, CabinetInstance } from './canvasTypes'

export default function CanvasContextMenu({ contextMenu, clipboard, canEqualize, onDeleteWall, onCopy, onPaste, onDelete, onEqualizeWidths }: {
  contextMenu: ContextMenuState
  clipboard: CabinetInstance | null
  canEqualize: boolean
  onDeleteWall: (id: string) => void
  onCopy: () => void
  onPaste: () => void
  onDelete: () => void
  onEqualizeWidths: () => void
}) {
  const btn = 'flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-700'
  return (
    <div
      className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl py-1 min-w-[180px]"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onPointerDown={e => e.stopPropagation()}
    >
      {contextMenu.wallId ? (
        <button onClick={() => onDeleteWall(contextMenu.wallId!)}
          className={btn + ' text-red-400 hover:text-red-300'}>
          Delete Wall
        </button>
      ) : (
        <>
          {canEqualize && (
            <>
              <button onClick={onEqualizeWidths}
                className={btn + ' text-amber-300 hover:text-amber-200'}>
                Equalise Widths
              </button>
              <div className="my-1 border-t border-gray-700/60" />
            </>
          )}
          <button onClick={onCopy} className={btn + ' text-gray-300 hover:text-white'}>
            Copy
          </button>
          <button onClick={onPaste} disabled={!clipboard}
            className={btn + ' text-gray-300 hover:text-white disabled:text-gray-600 disabled:cursor-not-allowed'}>
            Paste{clipboard ? ` (${clipboard.label ?? clipboard.assembly_class})` : ''}
          </button>
          <div className="my-1 border-t border-gray-700/60" />
          <button onClick={onDelete} className={btn + ' text-red-400 hover:text-red-300'}>
            Delete
          </button>
        </>
      )}
    </div>
  )
}
