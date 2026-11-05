'use client'

// ============================================================
// Cut stickers print modal (z_takeoff T5) — Hardware Pick List → Cut stickers.
// One sticker per cut piece (hanging rails, linear handle strips). Same print
// panel as the optimiser's Stage 7 labels (LabelPrintPanel): label size,
// printer, offset, preview, Print / Download PDF. Pick by room, by type, or
// by sticker number; numbers stay "n of N" of the whole job so a reprint
// matches the first print.
// ============================================================

import { useMemo, useState } from 'react'
import { cutStickersPdf, type CutSticker } from '@/src/lib/takeoff/cutStickers'
import { LabelPrintPanel, PickChip, labelSel, parseNumberList, useLabelSettings } from '@/src/components/labels/LabelPrintPanel'

/** Toggle one key in an all-on (null) / some-on set. */
function toggle(prev: Set<string> | null, all: string[], k: string): Set<string> | null {
  const next = new Set(prev ?? all)
  if (next.has(k)) next.delete(k); else next.add(k)
  return next.size === all.length ? null : next
}

export default function CutStickersModal({ stickers, fileBase, onClose }: {
  stickers: CutSticker[]
  fileBase: string        // "RHK6581 Bed 1" — the PDF name adds "cut stickers 102x48"
  onClose: () => void
}) {
  const [st, update] = useLabelSettings()
  const [roomsOn, setRoomsOn] = useState<Set<string> | null>(null)   // null = all
  const [groupsOn, setGroupsOn] = useState<Set<string> | null>(null)
  const [numText, setNumText] = useState('')

  const count = (key: (s: CutSticker) => string) => {
    const m = new Map<string, number>()
    for (const s of stickers) m.set(key(s), (m.get(key(s)) ?? 0) + 1)
    return [...m]
  }
  const rooms = useMemo(() => count(s => s.room), [stickers])     // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => count(s => s.group), [stickers])   // eslint-disable-line react-hooks/exhaustive-deps

  const picked = useMemo(() => {
    const nos = parseNumberList(numText)
    return stickers.filter(s => (!roomsOn || roomsOn.has(s.room)) && (!groupsOn || groupsOn.has(s.group)) && (!nos || nos.has(s.no)))
  }, [stickers, roomsOn, groupsOn, numText])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70" onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-surface border border-edge rounded-xl shadow-2xl w-[min(1200px,95vw)] h-[88vh] flex flex-col overflow-hidden">
        <div className="flex-none flex items-center justify-between px-5 py-3 border-b border-edge">
          <h2 className="text-sm font-semibold text-ink">Cut stickers <span className="text-ink-subtle font-normal">— {stickers.length} cut piece{stickers.length === 1 ? '' : 's'}</span></h2>
          <button onClick={onClose} className="text-ink-subtle hover:text-ink text-lg leading-none px-2" title="Close">×</button>
        </div>
        <div className="flex-1 overflow-hidden">
          <LabelPrintPanel items={picked} st={st} update={update} makePdf={cutStickersPdf} noun="sticker"
            fileName={`${fileBase} cut stickers ${st.w}x${st.h}.pdf`}>
            <section className="space-y-2">
              <h3 className="text-xs font-semibold text-ink">Which stickers</h3>
              {rooms.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  <span className="w-full text-[10px] text-ink-subtle">Rooms</span>
                  {rooms.map(([r, n]) => (
                    <PickChip key={r} on={!roomsOn || roomsOn.has(r)} onClick={() => setRoomsOn(p => toggle(p, rooms.map(x => x[0]), r))}>
                      {r} <span className="text-ink-subtle">({n})</span>
                    </PickChip>
                  ))}
                </div>
              )}
              {groups.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  <span className="w-full text-[10px] text-ink-subtle mt-1">Type</span>
                  {groups.map(([g, n]) => (
                    <PickChip key={g} on={!groupsOn || groupsOn.has(g)} onClick={() => setGroupsOn(p => toggle(p, groups.map(x => x[0]), g))}>
                      {g} <span className="text-ink-subtle">({n})</span>
                    </PickChip>
                  ))}
                </div>
              )}
              <input className={`${labelSel} w-full`} placeholder={`Sticker numbers, e.g. 3, 7-9 (blank = all ${stickers.length})`}
                value={numText} onChange={e => setNumText(e.target.value)} />
              <p className="text-[11px] text-ink-subtle">Numbers are &ldquo;n of {stickers.length}&rdquo; across the whole list, so a reprint matches the first print.</p>
            </section>
          </LabelPrintPanel>
        </div>
      </div>
    </div>
  )
}
