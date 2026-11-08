'use client'

// AI helper chat panel (z_ai_helper AI1): docked on the right of the canvas.
// Room scope, read-only Q&A. The thread is the job's (one per job), so it shows
// questions asked in any room; each one is tagged with its room.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '@/src/lib/supabase'
import { useTutorial } from '@/src/lib/tutorial/store'

interface Msg { id: string; role: 'user' | 'assistant'; text: string; room_id: string | null; cost_usd?: number | null; ms?: number | null }

const SUGGESTIONS = ['What is the total kick length?', 'Which cabinets are TBC?', 'List the overheads and their sizes']

/** **bold** and "- " bullets — all the replies use. */
function renderReply(text: string): ReactNode {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i} className="text-white">{part.slice(2, -2)}</strong> : part)
  return text.split('\n').map((line, i) => {
    const bullet = /^\s*[-•*]\s+/.test(line)
    return bullet
      ? <div key={i} className="pl-3 -indent-3">• {inline(line.replace(/^\s*[-•*]\s+/, ''))}</div>
      : <div key={i} className={line.trim() ? '' : 'h-2'}>{inline(line)}</div>
  })
}

const cents = (usd: number) => `${(usd * 100).toFixed(usd < 0.01 ? 2 : 1)}¢`

export default function AiChatPanel({ projectId, roomId, roomName, onClose }: {
  projectId: string; roomId: string; roomName: string; onClose: () => void
}) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [roomNames, setRoomNames] = useState<Map<string, string>>(new Map())
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    void Promise.all([
      supabase.from('ai_messages').select('id, role, text, room_id, cost_usd, ms')
        .eq('project_id', projectId).order('created_at', { ascending: false }).limit(60),
      supabase.from('rooms').select('id, name').eq('project_id', projectId),
    ]).then(([m, r]) => {
      if (!live) return
      setMsgs(((m.data ?? []) as Msg[]).reverse())
      setRoomNames(new Map((r.data ?? []).map(x => [x.id as string, x.name as string])))
    })
    return () => { live = false }
  }, [projectId])

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [msgs, busy])

  async function send(text: string) {
    const message = text.trim()
    if (!message || busy) return
    setInput(''); setError(null); setBusy(true)
    setMsgs(m => [...m, { id: `local-${Date.now()}`, role: 'user', text: message, room_id: roomId }])
    try {
      const res = await fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId, message }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
      setMsgs(m => [...m, { id: `local-${Date.now()}-a`, role: 'assistant', text: data.reply, room_id: roomId, cost_usd: data.costUsd, ms: data.ms }])
      useTutorial.getState().emit('ai_chat_asked')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="order-last w-[380px] flex-none flex flex-col border-l border-gray-800 bg-gray-950 text-sm text-gray-200">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
        <span className="font-medium text-gray-100">Ask AI</span>
        <span className="text-xs text-gray-500 truncate">· {roomName} · read-only</span>
        <button onClick={onClose} title="Close" aria-label="Close AI chat"
          className="ml-auto w-6 h-6 rounded text-gray-400 hover:text-gray-100 hover:bg-gray-800">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {!msgs.length && !busy && (
          <div className="text-gray-400 space-y-2">
            <p>Ask about this room — sizes, colours, kicks, what&apos;s TBC. It can&apos;t change anything yet.</p>
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
            <div className="rounded-lg bg-gray-900 border border-gray-800 px-3 py-2 leading-relaxed">{renderReply(m.text)}</div>
            {m.cost_usd != null && <div className="text-[10px] text-gray-600 mt-0.5">{cents(Number(m.cost_usd))}{m.ms ? ` · ${(m.ms / 1000).toFixed(1)}s` : ''}</div>}
          </div>
        ))}
        {busy && <div className="text-gray-500 italic">Thinking…</div>}
        {error && <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-red-300">{error}</div>}
        <div ref={endRef} />
      </div>

      <form className="border-t border-gray-800 p-2" onSubmit={e => { e.preventDefault(); void send(input) }}>
        <textarea value={input} onChange={e => setInput(e.target.value)} rows={2} disabled={busy}
          placeholder={`Ask about ${roomName}…`}
          onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input) } }}
          className="w-full resize-none rounded bg-gray-900 border border-gray-700 px-2 py-1.5 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500" />
        <div className="flex items-center mt-1">
          <span className="text-[10px] text-gray-600">Enter to send · Shift+Enter new line</span>
          <button type="submit" disabled={busy || !input.trim()}
            className="ml-auto px-3 py-1 rounded bg-blue-600 text-white text-xs disabled:opacity-40 hover:bg-blue-500">Send</button>
        </div>
      </form>
    </aside>
  )
}
