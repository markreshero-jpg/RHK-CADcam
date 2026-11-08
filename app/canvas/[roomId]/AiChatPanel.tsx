'use client'

// AI helper chat panel (z_ai_helper AI1 + AI2): docked on the right of the canvas.
// Scope follows the canvas: cabinets selected → Selection (small edits apply
// straight away, Undo on the message), nothing selected → Room (changes wait for
// Apply). The thread is the job's (one per job), so it shows questions asked in
// any room; each one is tagged with its room.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '@/src/lib/supabase'
import { useTutorial } from '@/src/lib/tutorial/store'

interface Msg {
  id: string; role: 'user' | 'assistant'; text: string; room_id: string | null
  cost_usd?: number | null; ms?: number | null; model?: string | null
  question?: { text: string; options: string[] } | null
  proposal?: { lines: string[]; description: string } | null
  proposal_status?: 'pending' | 'applied' | 'cancelled' | null
  batch_id?: string | null
  changed?: string[] | null
  undone_at?: string | null
}

const SUGGESTIONS = ['What is the total kick length?', 'Which cabinets are TBC?', 'List the overheads and their sizes']
const COLS = 'id, role, text, room_id, cost_usd, ms, model, question, proposal, proposal_status, batch_id, changed, undone_at'

const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
  part.startsWith('**') && part.endsWith('**') ? <strong key={i} className="text-white">{part.slice(2, -2)}</strong> : part)

const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line)
const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())

/** **bold**, "- " bullets and | tables | — all the replies use. */
function renderReply(text: string): ReactNode {
  const lines = text.split('\n')
  const out: ReactNode[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (isTableRow(line)) {
      const rows: string[] = []
      while (i < lines.length && isTableRow(lines[i])) rows.push(lines[i++])
      i--
      const body = rows.filter(r => !/^\s*\|[\s:|-]+\|\s*$/.test(r))   // drop the |---| divider
      const [head, ...rest] = body
      out.push(
        <div key={i} className="overflow-x-auto my-1">
          <table className="text-xs border-collapse">
            <thead><tr>{cells(head).map((c, j) => <th key={j} className="text-left font-medium text-gray-300 border-b border-gray-700 px-1.5 py-0.5">{inline(c)}</th>)}</tr></thead>
            <tbody>{rest.map((r, k) => <tr key={k}>{cells(r).map((c, j) => <td key={j} className="border-b border-gray-800 px-1.5 py-0.5 align-top">{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      )
      continue
    }
    const bullet = /^\s*[-•*]\s+/.test(line)
    out.push(bullet
      ? <div key={i} className="pl-3 -indent-3">• {inline(line.replace(/^\s*[-•*]\s+/, ''))}</div>
      : <div key={i} className={line.trim() ? '' : 'h-2'}>{inline(line)}</div>)
  }
  return out
}

const cents = (usd: number) => `${(usd * 100).toFixed(usd < 0.01 ? 2 : 1)}¢`

function ChangeList({ lines, tone }: { lines: string[]; tone: 'pending' | 'done' | 'muted' }) {
  const cls = tone === 'pending' ? 'border-amber-500/40 bg-amber-500/5' : tone === 'done' ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-gray-700 opacity-60'
  return (
    <ul className={`mt-2 rounded border ${cls} px-2 py-1.5 text-xs space-y-0.5 font-mono max-h-72 overflow-y-auto`}>
      {lines.map((l, i) => <li key={i}>{l}</li>)}
    </ul>
  )
}

export default function AiChatPanel({ projectId, roomId, roomName, selectedIds, selectedLabels, onChanged, onClose }: {
  projectId: string; roomId: string; roomName: string
  /** Cabinets selected on the canvas — non-empty = Selection scope. */
  selectedIds: string[]; selectedLabels: string[]
  /** After an apply / undo: the cabinets the server changed, for the canvas to reload. */
  onChanged: (cabinetIds: string[]) => void
  onClose: () => void
}) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [roomNames, setRoomNames] = useState<Map<string, string>>(new Map())
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState<string | null>(null)   // what's running: 'Thinking…' / 'Applying…' / 'Undoing…'
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function loadThread() {
    const [m, r] = await Promise.all([
      supabase.from('ai_messages').select(COLS).eq('project_id', projectId).order('created_at', { ascending: false }).limit(60),
      supabase.from('rooms').select('id, name').eq('project_id', projectId),
    ])
    setMsgs(((m.data ?? []) as Msg[]).reverse())
    setRoomNames(new Map((r.data ?? []).map(x => [x.id as string, x.name as string])))
  }
  useEffect(() => { void loadThread() }, [projectId])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [msgs, busy])

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
    return data
  }

  /** strong = "Try harder": the same question again on the stronger model. */
  async function send(text: string, strong = false) {
    const message = text.trim()
    if (!message || busy) return
    setInput(''); setError(null); setBusy(strong ? 'Trying harder…' : 'Thinking…')
    setMsgs(m => [...m, { id: `local-${Date.now()}`, role: 'user', text: message, room_id: roomId }])
    try {
      const data = await post('/api/ai/chat', { roomId, message, selectedIds, strong })
      setMsgs(m => [...m, {
        id: data.messageId ?? `local-${Date.now()}-a`, role: 'assistant', text: data.reply, room_id: roomId,
        cost_usd: data.costUsd, ms: data.ms, model: data.model, question: data.question ?? null,
        proposal: data.proposal ?? null, proposal_status: data.proposal ? 'pending' : null,
        batch_id: data.batchId ?? null, changed: data.changed ?? null,
      }])
      if (data.cabinetIds?.length) { onChanged(data.cabinetIds); useTutorial.getState().emit('ai_chat_edit') }
      useTutorial.getState().emit(strong ? 'ai_chat_harder' : 'ai_chat_asked')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  /** AI4: a plan PDF / sketch photo → straight to the job's private upload folder, then the drawing route. */
  async function drawFrom(file: File) {
    if (busy) return
    if (file.size > 20 * 1024 * 1024) { setError('That file is over 20 MB — export the plan pages you need, or a smaller photo.'); return }
    const message = input.trim()
    setInput(''); setError(null); setBusy('Uploading the plan…')
    setMsgs(m => [...m, { id: `local-${Date.now()}`, role: 'user', text: `📎 ${file.name}${message ? `\n${message}` : ''}`, room_id: roomId }])
    try {
      const path = `${projectId}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`
      const up = await supabase.storage.from('ai-uploads').upload(path, file, { contentType: file.type || undefined })
      if (up.error) throw new Error(`Upload failed: ${up.error.message}`)
      setBusy('Reading the plan… (a minute or two)')
      const data = await post('/api/ai/draw', { roomId, path, fileName: file.name, message })
      setMsgs(m => [...m, {
        id: data.messageId ?? `local-${Date.now()}-a`, role: 'assistant', text: data.reply, room_id: roomId,
        cost_usd: data.costUsd, ms: data.ms, model: data.model,
        proposal: data.proposal ?? null, proposal_status: data.proposal ? 'pending' : null,
      }])
      useTutorial.getState().emit('ai_draw_read')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function act(m: Msg, kind: 'apply' | 'cancel' | 'undo') {
    if (busy) return
    setError(null); setBusy(kind === 'undo' ? 'Undoing…' : kind === 'apply' ? 'Applying…' : 'Cancelling…')
    try {
      const data = kind === 'undo'
        ? await post('/api/ai/undo', { messageId: m.id })
        : await post('/api/ai/apply', { messageId: m.id, cancel: kind === 'cancel' })
      if (data.cabinetIds?.length) onChanged(data.cabinetIds)
      if (kind !== 'cancel') useTutorial.getState().emit(kind === 'undo' ? 'ai_chat_undo' : 'ai_chat_edit')
      const warn = [...(data.warnings ?? []), ...(data.errors ?? [])]
      if (warn.length) setError(warn.join('\n'))
      await loadThread()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const lastId = msgs[msgs.length - 1]?.id
  // The question "Try harder" re-asks: the latest user message.
  const lastQuestion = [...msgs].reverse().find(m => m.role === 'user')?.text
  const scopeText = selectedIds.length
    ? `Selection: ${selectedLabels.slice(0, 6).join(', ')}${selectedLabels.length > 6 ? ` +${selectedLabels.length - 6}` : ''}`
    : `Room: ${roomName}`

  return (
    <aside className="order-last w-[380px] flex-none flex flex-col border-l border-gray-800 bg-gray-950 text-sm text-gray-200">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
        <span className="font-medium text-gray-100">Ask AI</span>
        <span title={selectedIds.length ? 'Changes only touch the selected cabinets; up to 3 apply straight away.' : 'Nothing selected: changes to this room wait for you to press Apply.'}
          className={`text-[11px] px-1.5 py-0.5 rounded truncate ${selectedIds.length ? 'bg-blue-600/25 text-blue-200 border border-blue-500/40' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}>
          {scopeText}
        </span>
        <button onClick={onClose} title="Close" aria-label="Close AI chat"
          className="ml-auto w-6 h-6 flex-none rounded text-gray-400 hover:text-gray-100 hover:bg-gray-800">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {!msgs.length && !busy && (
          <div className="text-gray-400 space-y-2">
            <p>Ask about this room — sizes, colours, kicks, what&apos;s TBC — or ask for a change: sizes, position, colours, scribes, handles, add an end panel, delete a cabinet. Select cabinets to keep it to those.</p>
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => void send(s)}
                className="block w-full text-left px-2 py-1.5 rounded border border-gray-800 hover:border-gray-600 hover:bg-gray-900 text-gray-300">{s}</button>
            ))}
          </div>
        )}
        {msgs.map(m => m.role === 'user' ? (
          <div key={m.id} className="ml-8">
            <div className="rounded-lg bg-blue-600/20 border border-blue-500/30 px-3 py-2 whitespace-pre-wrap">{m.text}</div>
            {m.room_id && m.room_id !== roomId && <div className="text-[10px] text-gray-600 text-right mt-0.5">in {roomNames.get(m.room_id) ?? 'another room'}</div>}
          </div>
        ) : (
          <div key={m.id} className="mr-4">
            <div className="rounded-lg bg-gray-900 border border-gray-800 px-3 py-2 leading-relaxed">
              {renderReply(m.text)}

              {/* ask_user: answer buttons, live on the latest message only */}
              {m.question?.options?.length ? (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {m.question.options.map(o => (
                    <button key={o} disabled={m.id !== lastId || !!busy} onClick={() => void send(o)}
                      className="px-2 py-1 rounded border border-blue-500/50 text-blue-200 text-xs hover:bg-blue-600/20 disabled:opacity-40 disabled:hover:bg-transparent">{o}</button>
                  ))}
                </div>
              ) : null}

              {/* A change waiting for Apply */}
              {m.proposal && (
                <>
                  <ChangeList lines={m.proposal_status === 'applied' && m.changed?.length ? m.changed : m.proposal.lines}
                    tone={m.proposal_status === 'pending' ? 'pending' : m.proposal_status === 'applied' && !m.undone_at ? 'done' : 'muted'} />
                  {m.proposal_status === 'pending' && (
                    <div className="flex gap-1.5 mt-2">
                      <button disabled={!!busy} onClick={() => void act(m, 'apply')}
                        className="px-3 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-500 disabled:opacity-40">Apply</button>
                      <button disabled={!!busy} onClick={() => void act(m, 'cancel')}
                        className="px-3 py-1 rounded border border-gray-700 text-gray-300 text-xs hover:bg-gray-800 disabled:opacity-40">Cancel</button>
                    </div>
                  )}
                  {m.proposal_status === 'cancelled' && <div className="text-[11px] text-gray-500 mt-1">Cancelled — nothing changed.</div>}
                </>
              )}

              {/* Applied straight away (small selection edit) */}
              {!m.proposal && m.changed?.length ? <ChangeList lines={m.changed} tone={m.undone_at ? 'muted' : 'done'} /> : null}

              {m.batch_id && (
                m.undone_at
                  ? <div className="text-[11px] text-gray-500 mt-1">Undone.</div>
                  : <button disabled={!!busy} onClick={() => void act(m, 'undo')}
                      className="mt-2 px-3 py-1 rounded border border-gray-700 text-gray-300 text-xs hover:bg-gray-800 disabled:opacity-40">↶ Undo</button>
              )}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-600 mt-0.5">
              {m.cost_usd != null && <span>{cents(Number(m.cost_usd))}{m.ms ? ` · ${(m.ms / 1000).toFixed(1)}s` : ''}{m.model?.includes('sonnet') ? ' · tried harder' : ''}</span>}
              {/* Try harder: the latest answer only, and not once it changed something */}
              {m.id === lastId && lastQuestion && !m.model?.includes('sonnet') && !m.changed?.length && m.proposal_status !== 'applied' && (
                <button disabled={!!busy} onClick={() => void send(lastQuestion, true)}
                  title="Ask the same again on a stronger model: a few cents instead of a fraction of one"
                  className="text-blue-400 hover:text-blue-300 disabled:opacity-40">↻ Try harder</button>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="text-gray-500 italic">{busy}</div>}
        {error && <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-red-300 whitespace-pre-wrap">{error}</div>}
        <div ref={endRef} />
      </div>

      <form className="border-t border-gray-800 p-2" onSubmit={e => { e.preventDefault(); void send(input) }}>
        <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void drawFrom(f) }} />
        <textarea value={input} onChange={e => setInput(e.target.value)} rows={2} disabled={!!busy}
          placeholder={selectedIds.length ? `Ask about or change ${selectedLabels.length === 1 ? selectedLabels[0] : `these ${selectedLabels.length}`}…` : `Ask about ${roomName}…`}
          onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input) } }}
          className="w-full resize-none rounded bg-gray-900 border border-gray-700 px-2 py-1.5 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500" />
        <div className="flex items-center mt-1">
          <button type="button" disabled={!!busy} onClick={() => fileRef.current?.click()}
            title="Draw this room from a plan PDF or a site sketch photo (type any notes first, e.g. which page or wall)"
            className="mr-2 px-2 py-0.5 rounded border border-gray-700 text-gray-300 text-xs hover:bg-gray-800 disabled:opacity-40">📎 Draw from plan</button>
          <span className="text-[10px] text-gray-600">Enter to send</span>
          <button type="submit" disabled={!!busy || !input.trim()}
            className="ml-auto px-3 py-1 rounded bg-blue-600 text-white text-xs disabled:opacity-40 hover:bg-blue-500">Send</button>
        </div>
      </form>
    </aside>
  )
}
