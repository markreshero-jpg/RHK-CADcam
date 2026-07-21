'use client'

// ============================================================
// Part Editor — left zone: the ordered operations list
// (generated + hand-added, origin-classified) with the + Add
// menu and drag-to-reorder (order = execution order).
// ============================================================

import { useState } from 'react'
import { fmtMm } from '@/src/lib/format'
import type { PartOp } from '../CabinetRoutesPanel'
import { classify, toolLabel, type AddKind, type Issue } from './partEditorCore'

export default function PartOpsList({ ops, loading, selectedId, onSelect, levels, issuesById, allGenerated, onAdd, onReorder, width }: {
  width: number
  ops: PartOp[]; loading: boolean
  selectedId: string | null; onSelect: (id: string) => void
  levels: Record<string, 'error' | 'warn' | undefined>
  issuesById: Record<string, Issue[]>
  allGenerated: boolean
  onAdd: (kind: AddKind) => void
  onReorder: (fromId: string, toId: string) => void
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  return (
    <div style={{ width }} className="flex-none bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="flex-none px-3 py-2 border-b border-gray-800 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
          Operations{ops.length ? ` (${ops.length})` : ''}
        </span>
        <div className="relative">
          <button onClick={() => setAddOpen(o => !o)}
            className="text-[11px] px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors">+ Add ▾</button>
          {addOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setAddOpen(false)} />
              <div className="absolute right-0 mt-1 z-20 w-40 bg-gray-800 border border-gray-700 rounded shadow-xl py-1">
                {([['single', 'Single operation'], ['toolset', 'Tool set'], ['drill', 'Drill pattern'], ['groove', 'Groove']] as [AddKind, string][]).map(([k, lbl]) => (
                  <button key={k} onClick={() => { setAddOpen(false); onAdd(k) }}
                    className="w-full text-left px-3 py-1.5 text-[11px] text-gray-300 hover:bg-gray-700 transition-colors">{lbl}</button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      {ops.length > 0 && (
        <div className="flex-none px-3 py-1 text-[9px] text-gray-600 border-b border-gray-800/60">
          Order = execution (drill before route) · drag ⠿ to reorder
        </div>
      )}
      {!loading && allGenerated && (
        <div className="flex-none px-3 py-1.5 text-[10px] text-amber-400/80 bg-amber-950/20 border-b border-gray-800 leading-snug">
          All operations are generated (locked). Add a hand operation, or select one and “Convert to manual override” to edit.
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-xs text-gray-500">Loading…</div>
        ) : ops.length === 0 ? (
          <div className="p-4 text-xs text-gray-500">
            No operations on this part yet.
            <div className="mt-1 text-gray-600">Use <span className="text-blue-400">+ Add</span> to place one.</div>
          </div>
        ) : ops.map((op, i) => {
          const o = classify(op)
          const isSel = op.id === selectedId
          return (
            <button
              key={op.id}
              draggable
              onDragStart={() => setDragId(op.id)}
              onDragOver={e => { e.preventDefault(); if (overId !== op.id) setOverId(op.id) }}
              onDrop={e => { e.preventDefault(); if (dragId) onReorder(dragId, op.id); setDragId(null); setOverId(null) }}
              onDragEnd={() => { setDragId(null); setOverId(null) }}
              onClick={() => onSelect(op.id)}
              className={`w-full text-left px-3 py-2 border-b border-gray-800/60 transition-colors ${
                dragId && overId === op.id && dragId !== op.id ? 'border-t-2 border-t-blue-500' : ''
              } ${dragId === op.id ? 'opacity-40' : ''} ${isSel ? 'bg-blue-600/20' : 'hover:bg-gray-800/60'}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-600 shrink-0 cursor-grab select-none" title="Drag to reorder">⠿</span>
                <span className="text-[10px] font-mono text-gray-600 w-4 shrink-0">{i + 1}</span>
                <span className="text-xs text-gray-200 flex-1 truncate">
                  {op.operation_type}
                  {op.operation_action ? <span className="text-gray-400"> · {op.operation_action}</span> : null}
                </span>
                {levels[op.id] && (
                  <span title={(issuesById[op.id] ?? []).map(is => is.msg).join('\n')}
                    className={`text-[11px] leading-none ${levels[op.id] === 'error' ? 'text-red-400' : 'text-amber-400'}`}>⚠</span>
                )}
                {!op.output_to_cnc && <span title="Excluded from CNC output" className="text-[10px] text-gray-600">⊘</span>}
                <span className={`text-[8px] px-1 py-0.5 rounded font-bold tracking-wide ${
                  o.generated ? 'bg-amber-900/60 text-amber-300' : 'bg-emerald-900/50 text-emerald-300'
                }`}>{o.label}</span>
              </div>
              <div className="flex items-center gap-2 pl-6 mt-0.5">
                <span className="text-[10px] text-gray-500">{toolLabel(op)}</span>
                {op.diameter != null && <span className="text-[10px] text-gray-600 font-mono">⌀{fmtMm(op.diameter)}</span>}
                {op.output_face && <span className="text-[10px] text-gray-600">{op.output_face}</span>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
