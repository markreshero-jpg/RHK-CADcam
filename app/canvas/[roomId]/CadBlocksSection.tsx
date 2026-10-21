'use client'

// CAD panel sections for blocks + live fields (z_CAD_tool phase C): save the
// selection as a shop-wide block, drop a block in (right of the walls, clear of other
// notes), and insert {field} tokens into the text being typed.

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { RoomAnnotation, Wall } from '@/src/lib/types'
import type { Box } from '@/src/lib/annotations/geometry'
import {
  type CadBlock, type CadFieldValues, CAD_FIELDS,
  toBlockItems, placeBlockItems, blockInsertPoint, annotationsBounds,
} from '@/src/lib/annotations/blocks'
import type { AnnotationTool } from './useAnnotationTool'

function wallsBox(walls: Wall[]): Box | null {
  const ws = walls.filter(w => w.wall_type !== 'island')
  if (!ws.length) return null
  const t = Math.max(0, ...ws.map(w => w.thickness))
  const xs = ws.flatMap(w => [w.pos_x, w.pos_x + w.length * Math.cos(w.angle * Math.PI / 180)])
  const ys = ws.flatMap(w => [w.pos_y, w.pos_y + w.length * Math.sin(w.angle * Math.PI / 180)])
  return { minX: Math.min(...xs) - t, minY: Math.min(...ys) - t, maxX: Math.max(...xs) + t, maxY: Math.max(...ys) + t }
}

export function CadBlocksSection({ cad, annotations, walls, paper, saveReq, Section }: {
  cad:         AnnotationTool
  annotations: RoomAnnotation[]
  walls:       Wall[]
  /** frame mm per paper mm */
  paper:       number
  /** Bumped by the right-click "Save as CAD block…" to open the name box. */
  saveReq:     number
  Section:     (p: { title: string; children: React.ReactNode }) => React.ReactNode
}) {
  const [blocks, setBlocks] = useState<CadBlock[]>([])
  const [naming, setNaming] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    const { data, error } = await supabase.from('cad_blocks').select('id,name,description,items,sort_order').order('sort_order').order('name')
    if (error) setErr(error.message); else setBlocks((data ?? []) as CadBlock[])
  }
  useEffect(() => { void load() }, [])
  useEffect(() => { if (saveReq > 0 && cad.selected.length) setNaming('') }, [saveReq]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (naming === '') nameRef.current?.focus() }, [naming])

  const save = async () => {
    const name = (naming ?? '').trim()
    const items = toBlockItems(cad.selected, paper)
    if (!name || !items.length) return
    const { error } = await supabase.from('cad_blocks').insert({ name, items })
    if (error) { setErr(error.message.includes('row-level') ? 'Only admins can save blocks.' : error.message); return }
    setErr(null); setNaming(null); void load()
  }

  const insert = (b: CadBlock) => {
    const wb = wallsBox(walls) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 }
    const existing = annotations.map(a => annotationsBounds([a], paper)).filter((x): x is Box => !!x)
    const at = blockInsertPoint(b.items, wb, existing, paper)
    cad.insertItems(placeBlockItems(b.items, at, paper))
  }

  const remove = async (id: string) => {
    const { error } = await supabase.from('cad_blocks').delete().eq('id', id)
    if (error) setErr(error.message); else { setConfirmDel(null); void load() }
  }

  return (
    <Section title={`CAD blocks (${blocks.length})`}>
      {naming != null ? (
        <div className="flex flex-col gap-1.5">
          <input ref={nameRef} value={naming} onChange={e => setNaming(e.target.value)} placeholder="Block name, e.g. Spec block"
            onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setNaming(null); e.stopPropagation() }}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white" />
          <div className="flex gap-1.5">
            <button onClick={() => void save()} disabled={!naming.trim()} className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-xs text-white">Save {cad.selected.length} item{cad.selected.length === 1 ? '' : 's'}</button>
            <button onClick={() => setNaming(null)} className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs text-gray-300">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setNaming('')} disabled={!cad.selected.length}
          title={cad.selected.length ? 'Save the selected notes / markup as a shop-wide block' : 'Select some notes or markup first'}
          className="w-full px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-xs text-gray-200">Save selection as block…</button>
      )}
      {err && <div className="mt-1.5 text-[11px] text-red-400">{err}</div>}
      <div className="mt-2 flex flex-col">
        {!blocks.length && <div className="text-xs text-gray-500">No blocks saved yet.</div>}
        {blocks.map(b => (
          <div key={b.id} className="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-gray-800">
            <button onClick={() => insert(b)} title="Insert — drops in right of the walls, clear of other notes"
              className="flex-1 min-w-0 text-left text-xs text-gray-200 truncate">{b.name}</button>
            {confirmDel === b.id
              ? <button onClick={() => void remove(b.id)} className="text-[11px] text-red-400 hover:text-red-300 px-1">Delete?</button>
              : <button onClick={() => setConfirmDel(b.id)} title="Delete this block from the library" className="text-gray-600 hover:text-red-400 text-sm leading-none px-1">×</button>}
          </div>
        ))}
      </div>
    </Section>
  )
}

/** Field tokens: click one while typing a text note to insert it at the caret. */
export function CadFieldsSection({ cad, values, Section }: {
  cad:     AnnotationTool
  values:  CadFieldValues
  Section: (p: { title: string; children: React.ReactNode }) => React.ReactNode
}) {
  const insertToken = (key: string) => {
    if (!cad.editing) return
    const el = document.activeElement instanceof HTMLTextAreaElement ? document.activeElement : null
    const text = cad.editing.text, token = `{${key}}`
    const s = el?.selectionStart ?? text.length, e = el?.selectionEnd ?? text.length
    cad.setEditText(text.slice(0, s) + token + text.slice(e))
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(s + token.length, s + token.length) } })
  }
  return (
    <Section title="Fields">
      <div className="text-[11px] text-gray-500 mb-1.5">{cad.editing
        ? 'Click a field to put it in the note. It always shows this job’s current value.'
        : 'Edit a text note, then click a field to put it in. Values follow the job.'}</div>
      <div className="flex flex-col">
        {CAD_FIELDS.map(f => (
          <button key={f.key} disabled={!cad.editing}
            // Keep focus in the text box (a blur would finish the edit).
            onMouseDown={e => e.preventDefault()} onClick={() => insertToken(f.key)}
            className="flex items-center justify-between gap-2 px-1.5 py-0.5 rounded text-left text-xs text-gray-300 enabled:hover:bg-gray-800 disabled:opacity-60">
            <span className="font-mono text-rose-300 shrink-0">{`{${f.key}}`}</span>
            <span className="text-gray-500 truncate" title={values[f.key] || f.label}>{values[f.key]?.split('\n')[0] || f.label}</span>
          </button>
        ))}
      </div>
    </Section>
  )
}
