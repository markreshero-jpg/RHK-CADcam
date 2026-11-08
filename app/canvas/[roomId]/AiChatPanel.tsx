'use client'

// AI helper chat panel (z_ai_helper AI1 + AI2): docked on the right of the canvas.
// Scope follows the canvas: cabinets selected → Selection (small edits apply
// straight away, Undo on the message), nothing selected → Room (changes wait for
// Apply). A job has several chats (one per subject, Mark 2026-11-08): ☰ lists and
// searches them, ＋ New chat starts one, and each runs on its own — one can be working
// while you carry on in another. A message asked in another room is tagged with it.
// 🎤 is the browser's voice to text.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '@/src/lib/supabase'
import { useTutorial } from '@/src/lib/tutorial/store'

interface Msg {
  id: string; role: 'user' | 'assistant'; text: string; room_id: string | null
  cost_usd?: number | null; ms?: number | null; model?: string | null
  question?: { text: string; options: string[]; items?: { text: string; options: string[] }[] } | null
  /** Set on a drawing's question (AI4): answering it carries that drawing on. */
  draw?: unknown
  proposal?: { lines: string[]; description: string } | null
  proposal_status?: 'pending' | 'applied' | 'cancelled' | null
  batch_id?: string | null
  changed?: string[] | null
  undone_at?: string | null
}

const SUGGESTIONS = ['What is the total kick length?', 'Which cabinets are TBC?', 'List the overheads and their sizes']
const COLS = 'id, role, text, room_id, cost_usd, ms, model, draw, question, proposal, proposal_status, batch_id, changed, undone_at'

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

/** A drawing's questions: one row of buttons per question, then Send answers. */
function DrawQuestions({ items, live, got, onPick, onSend }: {
  items: { text: string; options: string[] }[]; live: boolean; got: Record<number, string>
  onPick: (k: number, option: string) => void; onSend: (answer: string) => void
}) {
  const all = items.every((_, k) => got[k])
  return (
    <div className="mt-2 space-y-2">
      {items.map((it, k) => (
        <div key={k}>
          <div className="text-xs text-gray-400 mb-1">{k + 1}. {it.text}</div>
          <div className="flex flex-wrap gap-1.5">
            {it.options.map(o => (
              <button key={o} disabled={!live} onClick={() => onPick(k, o)}
                className={`px-2 py-1 rounded border text-xs disabled:opacity-40 ${got[k] === o ? 'border-blue-400 bg-blue-600/30 text-white' : 'border-blue-500/50 text-blue-200 hover:bg-blue-600/20'}`}>{o}</button>
            ))}
          </div>
        </div>
      ))}
      {live && (
        <div className="flex items-center gap-2">
          <button disabled={!all} onClick={() => onSend(items.map((it, k) => `${k + 1}. ${it.text} → ${got[k]}`).join('\n'))}
            className="px-3 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-500 disabled:opacity-40">Send answers</button>
          <span className="text-[10px] text-gray-500">or type your answers below</span>
        </div>
      )}
    </div>
  )
}

interface Conv { id: string; title: string; last_message_at: string }

// Voice to text: the browser's own speech recognition (Chrome, Edge, Safari incl.
// iPhone). Not typed in every DOM lib, so the bits used are declared here.
interface SpeechRec {
  lang: string; interimResults: boolean; continuous: boolean
  start(): void; stop(): void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}
function speechCtor(): (new () => SpeechRec) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const Paperclip = ({ cls = 'w-4 h-4' }: { cls?: string }) => (
  <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
)
const MicIcon = ({ cls = 'w-4 h-4' }: { cls?: string }) => (
  <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1" /><path d="M12 18v4" />
  </svg>
)

const when = (iso: string) => {
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}
/** The bit of a message around the search words. */
function snippet(text: string, q: string) {
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return text.slice(0, 110)
  const from = Math.max(0, i - 40)
  return `${from ? '…' : ''}${text.slice(from, i + q.length + 70)}${i + q.length + 70 < text.length ? '…' : ''}`
}

const localId = (suffix = '') => `local-${Date.now()}${suffix}`

/** Key for a new chat that hasn't been saved yet (it is, on its first message). */
const NEW = '__new'

export default function AiChatPanel({ projectId, roomId, roomName, phone = false, selectedIds, selectedLabels, onChanged, onClose }: {
  projectId: string; roomId: string; roomName: string
  /** Phone (z_mobile): the panel covers the screen instead of docking on the right. */
  phone?: boolean
  /** Cabinets selected on the canvas — non-empty = Selection scope. */
  selectedIds: string[]; selectedLabels: string[]
  /** After an apply / undo: the cabinets the server changed, for the canvas to reload. */
  onChanged: (cabinetIds: string[]) => void
  onClose: () => void
}) {
  const [convs, setConvs] = useState<Conv[]>([])
  const [convId, setConvId] = useState<string | null>(null)
  // Per chat, so one can be working while you carry on in another.
  const [byConv, setByConv] = useState<Record<string, Msg[]>>({})
  const [busyBy, setBusyBy] = useState<Record<string, string>>({})   // 'Thinking…' / 'Applying…' / …
  const [errBy, setErrBy] = useState<Record<string, string>>({})
  const [roomNames, setRoomNames] = useState<Map<string, string>>(new Map())
  const [input, setInput] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<{ convId: string; msgId: string | null; text: string }[]>([])
  const [flash, setFlash] = useState<string | null>(null)
  // The panel only mounts on a click (never server-rendered), so the browser can be asked straight away.
  const [canTalk] = useState(() => !!speechCtor())
  const [listening, setListening] = useState(false)
  const recRef = useRef<SpeechRec | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // A drawing's questions: the button picked per question, per message.
  const [picks, setPicks] = useState<Record<string, Record<number, string>>>({})

  const key = convId ?? NEW
  const msgs = byConv[key] ?? []
  const busy = busyBy[key] ?? null
  const error = errBy[key] ?? null
  const current = convs.find(c => c.id === convId)
  const othersBusy = Object.keys(busyBy).filter(k => k !== key).length

  const setBusyFor = (k: string, v: string | null) => setBusyBy(b => { const n = { ...b }; if (v) n[k] = v; else delete n[k]; return n })
  const setErrFor = (k: string, v: string | null) => setErrBy(b => { const n = { ...b }; if (v) n[k] = v; else delete n[k]; return n })
  const addMsg = (k: string, m: Msg) => setByConv(c => ({ ...c, [k]: [...(c[k] ?? []), m] }))

  async function loadConvs() {
    const { data } = await supabase.from('ai_conversations').select('id, title, last_message_at')
      .eq('project_id', projectId).order('last_message_at', { ascending: false }).limit(200)
    const list = (data ?? []) as Conv[]
    setConvs(list)
    return list
  }
  async function loadMsgs(id: string) {
    const { data } = await supabase.from('ai_messages').select(COLS).eq('conversation_id', id).order('created_at', { ascending: false }).limit(200)
    const rows = ((data ?? []) as Msg[]).reverse()   // outside the updater: React may run that twice
    setByConv(c => ({ ...c, [id]: rows }))
  }

  // Open on the job's latest chat.
  useEffect(() => {
    void (async () => {
      const [list, r] = await Promise.all([loadConvs(), supabase.from('rooms').select('id, name').eq('project_id', projectId)])
      setRoomNames(new Map((r.data ?? []).map(x => [x.id as string, x.name as string])))
      if (list[0]) { setConvId(list[0].id); await loadMsgs(list[0].id) }
    })()
  }, [projectId])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => recRef.current?.stop(), [])

  useEffect(() => { if (!flash) endRef.current?.scrollIntoView({ block: 'end' }) }, [key, msgs.length, busy, flash])
  // A search hit: scroll to that message and light it up for a moment.
  useEffect(() => {
    if (!flash) return
    document.getElementById(`aimsg-${flash}`)?.scrollIntoView({ block: 'center' })
    const t = setTimeout(() => setFlash(null), 2500)
    return () => clearTimeout(t)
  }, [flash, msgs.length])

  // Search: chat names, and the words in every message on the job.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    const t = setTimeout(async () => {
      const { data } = await supabase.from('ai_messages').select('id, conversation_id, text')
        .eq('project_id', projectId).ilike('text', `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`)
        .order('created_at', { ascending: false }).limit(40)
      const titled = convs.filter(c => c.title.toLowerCase().includes(q.toLowerCase())).map(c => ({ convId: c.id, msgId: null, text: '' }))
      const inText = ((data ?? []) as { id: string; conversation_id: string | null; text: string }[])
        .filter(m => m.conversation_id).map(m => ({ convId: m.conversation_id!, msgId: m.id, text: snippet(m.text, q) }))
      setHits([...titled, ...inText])
      useTutorial.getState().emit('ai_chat_search')
    }, 250)
    return () => clearTimeout(t)
  }, [query, projectId, convs])

  async function openConv(id: string, jumpTo?: string | null) {
    setListOpen(false)
    setConvId(id)
    if (jumpTo) setFlash(jumpTo)
    if (!byConv[id] || jumpTo) await loadMsgs(id)
  }
  function newChat() {
    setListOpen(false); setQuery('')
    setConvId(null)
    setByConv(c => ({ ...c, [NEW]: [] }))
    setErrFor(NEW, null)
    useTutorial.getState().emit('ai_chat_new')
  }
  async function rename() {
    if (!current) return
    const title = window.prompt('Name this chat', current.title)?.trim()
    if (!title || title === current.title) return
    await supabase.from('ai_conversations').update({ title: title.slice(0, 80) }).eq('id', current.id)
    await loadConvs()
  }

  /** The chat to write to: this one, or save the new chat now (so it can run alongside others). */
  async function ensureConv(): Promise<string> {
    if (convId) return convId
    const { data, error } = await supabase.from('ai_conversations').insert({ project_id: projectId }).select('id, title, last_message_at').single()
    if (error || !data) throw new Error(`Couldn't start a new chat: ${error?.message}`)
    const row = data as Conv
    setConvs(c => [row, ...c])
    setByConv(c => ({ ...c, [row.id]: c[NEW] ?? [], [NEW]: [] }))
    setConvId(row.id)
    return row.id
  }

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
    const latest = msgs[msgs.length - 1]
    if (latest?.role === 'assistant' && latest.draw && latest.question && !strong) return continueDraw(latest, message)
    recRef.current?.stop()
    setInput('')
    let k = key
    try {
      k = await ensureConv()
      setErrFor(k, null); setBusyFor(k, strong ? 'Trying harder…' : 'Thinking…')
      addMsg(k, { id: localId(), role: 'user', text: message, room_id: roomId })
      const data = await post('/api/ai/chat', { roomId, message, selectedIds, strong, conversationId: k })
      addMsg(k, {
        id: data.messageId ?? localId('-a'), role: 'assistant', text: data.reply, room_id: roomId,
        cost_usd: data.costUsd, ms: data.ms, model: data.model, question: data.question ?? null,
        proposal: data.proposal ?? null, proposal_status: data.proposal ? 'pending' : null,
        batch_id: data.batchId ?? null, changed: data.changed ?? null,
      })
      if (data.cabinetIds?.length) { onChanged(data.cabinetIds); useTutorial.getState().emit('ai_chat_edit') }
      useTutorial.getState().emit(strong ? 'ai_chat_harder' : 'ai_chat_asked')
    } catch (e) {
      setErrFor(k, (e as Error).message)
    } finally {
      setBusyFor(k, null)
      void loadConvs()   // the new chat's name, and the order
    }
  }

  function addDrawReply(k: string, data: { messageId?: string; reply: string; costUsd?: number; ms?: number; model?: string; proposal?: Msg['proposal']; question?: Msg['question'] }) {
    addMsg(k, {
      id: data.messageId ?? localId('-a'), role: 'assistant', text: data.reply, room_id: roomId,
      cost_usd: data.costUsd, ms: data.ms, model: data.model,
      question: data.question ?? null, draw: data.question ? true : null,
      proposal: data.proposal ?? null, proposal_status: data.proposal ? 'pending' : null,
    })
  }

  /** The user's answers to a drawing's questions → the drawing carries on (reads the plan again with them). */
  async function continueDraw(m: Msg, answer: string) {
    if (busy) return
    const k = key
    recRef.current?.stop()
    setInput(''); setErrFor(k, null); setBusyFor(k, 'Reading the plan… (a minute or two)')
    addMsg(k, { id: localId(), role: 'user', text: answer, room_id: roomId })
    try {
      addDrawReply(k, await post('/api/ai/draw', { roomId, continueFrom: m.id, answer, conversationId: convId }))
      useTutorial.getState().emit('ai_draw_read')
    } catch (e) {
      setErrFor(k, (e as Error).message)
    } finally {
      setBusyFor(k, null)
      void loadConvs()
    }
  }

  /** AI4: a plan PDF / sketch photo → straight to the job's private upload folder, then the drawing route. */
  async function drawFrom(file: File) {
    if (busy) return
    if (file.size > 20 * 1024 * 1024) { setErrFor(key, 'That file is over 20 MB — export the plan pages you need, or a smaller photo.'); return }
    const message = input.trim()
    recRef.current?.stop()
    setInput('')
    let k = key
    try {
      k = await ensureConv()
      setErrFor(k, null); setBusyFor(k, 'Uploading the plan…')
      addMsg(k, { id: localId(), role: 'user', text: `📎 ${file.name}${message ? `\n${message}` : ''}`, room_id: roomId })
      const path = `${projectId}/${localId().slice(6)}-${file.name.replace(/[^\w.-]+/g, '_')}`
      const up = await supabase.storage.from('ai-uploads').upload(path, file, { contentType: file.type || undefined })
      if (up.error) throw new Error(`Upload failed: ${up.error.message}`)
      setBusyFor(k, 'Reading the plan… (a minute or two)')
      addDrawReply(k, await post('/api/ai/draw', { roomId, path, fileName: file.name, message, conversationId: k }))
      useTutorial.getState().emit('ai_draw_read')
    } catch (e) {
      setErrFor(k, (e as Error).message)
    } finally {
      setBusyFor(k, null)
      void loadConvs()
    }
  }

  async function act(m: Msg, kind: 'apply' | 'cancel' | 'undo') {
    if (busy || !convId) return
    const k = convId
    setErrFor(k, null); setBusyFor(k, kind === 'undo' ? 'Undoing…' : kind === 'apply' ? 'Applying…' : 'Cancelling…')
    try {
      const data = kind === 'undo'
        ? await post('/api/ai/undo', { messageId: m.id })
        : await post('/api/ai/apply', { messageId: m.id, cancel: kind === 'cancel' })
      if (data.cabinetIds?.length) onChanged(data.cabinetIds)
      if (kind !== 'cancel') useTutorial.getState().emit(kind === 'undo' ? 'ai_chat_undo' : 'ai_chat_edit')
      const warn = [...(data.warnings ?? []), ...(data.errors ?? [])]
      if (warn.length) setErrFor(k, warn.join('\n'))
      await loadMsgs(k)
    } catch (e) {
      setErrFor(k, (e as Error).message)
    } finally {
      setBusyFor(k, null)
    }
  }

  /** 🎤 Talk instead of typing: the words go into the box (added to anything typed), you check them and Send. */
  function toggleMic() {
    if (recRef.current) { recRef.current.stop(); return }
    const Ctor = speechCtor()
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = 'en-AU'; rec.interimResults = true; rec.continuous = true
    const before = input.trim() ? `${input.trimEnd()} ` : ''
    rec.onresult = e => {
      let said = ''
      for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript
      setInput(before + said.trimStart())
    }
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setErrFor(key, 'The microphone is blocked — allow it for this site (the padlock or "aA" by the address), then try again.')
      else if (e.error !== 'no-speech' && e.error !== 'aborted') setErrFor(key, `The microphone stopped: ${e.error}`)
    }
    rec.onend = () => { recRef.current = null; setListening(false) }
    recRef.current = rec
    setListening(true)
    try { rec.start() } catch { recRef.current = null; setListening(false) }
    useTutorial.getState().emit('ai_chat_mic')
  }

  const lastId = msgs[msgs.length - 1]?.id
  // The question "Try harder" re-asks: the latest user message.
  const lastQuestion = [...msgs].reverse().find(m => m.role === 'user')?.text
  const scopeText = selectedIds.length
    ? `Selection: ${selectedLabels.slice(0, 6).join(', ')}${selectedLabels.length > 6 ? ` +${selectedLabels.length - 6}` : ''}`
    : `Room: ${roomName}`
  const convTitle = (id: string) => convs.find(c => c.id === id)?.title ?? 'Chat'
  const attachTitle = 'Draw this room from a plan PDF or a site sketch photo (type any notes first, e.g. which page or wall)'

  return (
    <aside className={phone
      ? 'fixed inset-0 z-50 flex flex-col bg-gray-950 text-sm text-gray-200 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'
      : 'order-last w-[380px] flex-none flex flex-col border-l border-gray-800 bg-gray-950 text-sm text-gray-200'}>
      <div className="flex items-center gap-1.5 px-2 py-2 border-b border-gray-800">
        <button onClick={() => setListOpen(o => !o)} title="Your chats on this job: search them, switch, or start a new one"
          className={`flex items-center gap-1.5 min-w-0 px-1.5 py-1 rounded hover:bg-gray-800 ${listOpen ? 'bg-gray-800' : ''}`}>
          <span className="text-gray-400 text-xs flex-none">☰</span>
          <span className="font-medium text-gray-100 truncate">{current?.title ?? 'New chat'}</span>
          <span className="text-gray-500 text-[10px] flex-none">▾</span>
          {othersBusy > 0 && <span title="Another chat is still working" className="w-2 h-2 flex-none rounded-full bg-amber-400 animate-pulse" />}
        </button>
        {current && !listOpen && (
          <button onClick={() => void rename()} title="Rename this chat" aria-label="Rename this chat"
            className="flex-none w-6 h-6 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-800 text-xs">✎</button>
        )}
        <button onClick={newChat} title="Start a new chat (new subject); the others stay in ☰"
          className="ml-auto flex-none px-2 py-1 rounded border border-gray-700 text-xs text-gray-300 hover:bg-gray-800">＋ New chat</button>
        <button onClick={onClose} title="Close" aria-label="Close AI chat"
          className="w-6 h-6 flex-none rounded text-gray-400 hover:text-gray-100 hover:bg-gray-800">✕</button>
      </div>
      <div className="px-3 py-1 border-b border-gray-800 flex">
        <span title={selectedIds.length ? 'Changes only touch the selected cabinets; up to 3 apply straight away.' : 'Nothing selected: changes to this room wait for you to press Apply.'}
          className={`text-[11px] px-1.5 py-0.5 rounded truncate ${selectedIds.length ? 'bg-blue-600/25 text-blue-200 border border-blue-500/40' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}>
          {scopeText}
        </span>
      </div>

      <div className="relative flex-1 min-h-0 flex flex-col">
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {!msgs.length && !busy && (
            <div className="text-gray-400 space-y-2">
              <p>Ask about this room — sizes, colours, kicks, what&apos;s TBC — or ask for a change: sizes, position, colours, scribes, handles, add an end panel, delete a cabinet. Select cabinets to keep it to those.</p>
              <p className="text-xs text-gray-500">Each subject can have its own chat (＋ New chat); they keep going while you work in another. ☰ finds old ones.</p>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => void send(s)}
                  className="block w-full text-left px-2 py-1.5 rounded border border-gray-800 hover:border-gray-600 hover:bg-gray-900 text-gray-300">{s}</button>
              ))}
            </div>
          )}
          {msgs.map(m => m.role === 'user' ? (
            <div key={m.id} id={`aimsg-${m.id}`} className="ml-8">
              <div className={`rounded-lg bg-blue-600/20 border px-3 py-2 whitespace-pre-wrap transition-colors ${flash === m.id ? 'border-amber-400' : 'border-blue-500/30'}`}>{m.text}</div>
              {m.room_id && m.room_id !== roomId && <div className="text-[10px] text-gray-600 text-right mt-0.5">in {roomNames.get(m.room_id) ?? 'another room'}</div>}
            </div>
          ) : (
            <div key={m.id} id={`aimsg-${m.id}`} className="mr-4">
              <div className={`rounded-lg bg-gray-900 border px-3 py-2 leading-relaxed transition-colors ${flash === m.id ? 'border-amber-400' : 'border-gray-800'}`}>
                {renderReply(m.text)}

                {/* A drawing's questions: one row of buttons per question, then Send answers */}
                {m.question?.items?.length ? (
                  <DrawQuestions items={m.question.items} live={m.id === lastId && !busy} got={picks[m.id] ?? {}}
                    onPick={(k, o) => setPicks(p => ({ ...p, [m.id]: { ...(p[m.id] ?? {}), [k]: o } }))}
                    onSend={answer => void continueDraw(m, answer)} />
                ) : null}

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
                {m.room_id && m.room_id !== roomId && <span>in {roomNames.get(m.room_id) ?? 'another room'}</span>}
                {m.cost_usd != null && <span>{cents(Number(m.cost_usd))}{m.ms ? ` · ${(m.ms / 1000).toFixed(1)}s` : ''}{m.model?.includes('opus') && !m.draw && !m.proposal?.description?.startsWith('Draw from') ? ' · tried harder' : ''}</span>}
                {/* Try harder: the latest answer only, and not once it changed something */}
                {/* (not on a drawing — that already ran on the top model) */}
                {m.id === lastId && lastQuestion && !m.model?.includes('opus') && !m.draw && !m.changed?.length && m.proposal_status !== 'applied' && (
                  <button disabled={!!busy} onClick={() => void send(lastQuestion, true)}
                    title="Ask the same again on the strongest model (Opus): a few cents"
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
          {phone && (
            <button type="button" disabled={!!busy} onClick={() => fileRef.current?.click()} title={attachTitle}
              className="w-full mb-2 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-gray-600 text-gray-100 text-sm active:bg-gray-800 disabled:opacity-40">
              <Paperclip cls="w-5 h-5" /> Attach plan or photo — draw this room
            </button>
          )}
          <textarea value={input} onChange={e => setInput(e.target.value)} rows={2} disabled={!!busy}
            placeholder={listening ? 'Listening… talk, then check it and Send'
              : selectedIds.length ? `Ask about or change ${selectedLabels.length === 1 ? selectedLabels[0] : `these ${selectedLabels.length}`}…` : `Ask about ${roomName}…`}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input) } }}
            className={`w-full resize-none rounded bg-gray-900 border px-2 py-1.5 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 ${listening ? 'border-red-500/70' : 'border-gray-700'} ${phone ? 'text-base' : ''}`} />
          <div className="flex items-center gap-2 mt-1">
            {!phone && (
              <button type="button" disabled={!!busy} onClick={() => fileRef.current?.click()} title={attachTitle}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-gray-600 text-gray-100 text-xs hover:bg-gray-800 hover:border-gray-500 disabled:opacity-40">
                <Paperclip /> Attach plan
              </button>
            )}
            {!phone && <span className="text-[10px] text-gray-600">Enter to send</span>}
            {canTalk && (
              <button type="button" onClick={toggleMic} disabled={!!busy}
                title={listening ? 'Stop listening' : 'Talk instead of typing — the words go in the box for you to check, then Send'}
                aria-label={listening ? 'Stop listening' : 'Voice to text'}
                className={`ml-auto flex-none flex items-center justify-center rounded-full disabled:opacity-40 ${phone ? 'w-10 h-10' : 'w-8 h-8'} ${listening ? 'bg-red-600 text-white animate-pulse' : 'border border-gray-600 text-gray-200 hover:bg-gray-800'}`}>
                <MicIcon cls={phone ? 'w-5 h-5' : 'w-4 h-4'} />
              </button>
            )}
            <button type="submit" disabled={!!busy || !input.trim()}
              className={`${canTalk ? '' : 'ml-auto'} rounded bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-500 ${phone ? 'px-4 py-2 text-sm' : 'px-3 py-1 text-xs'}`}>Send</button>
          </div>
        </form>

        {/* ☰ The job's chats: search, switch, new */}
        {listOpen && (
          <div className="absolute inset-0 z-10 flex flex-col bg-gray-950">
            <div className="p-2 border-b border-gray-800">
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search this job's chats…"
                onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') setListOpen(false) }}
                className={`w-full rounded bg-gray-900 border border-gray-700 px-2 py-1.5 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 ${phone ? 'text-base' : ''}`} />
            </div>
            <div className="flex-1 overflow-y-auto">
              {query.trim().length >= 2 ? (
                hits.length ? hits.map((h, i) => (
                  <button key={`${h.convId}-${h.msgId ?? 't'}-${i}`} onClick={() => void openConv(h.convId, h.msgId)}
                    className="block w-full text-left px-3 py-2 border-b border-gray-900 hover:bg-gray-900">
                    <div className="text-xs font-medium text-gray-200 truncate">{convTitle(h.convId)}</div>
                    {h.text && <div className="text-xs text-gray-400 line-clamp-2">{h.text}</div>}
                  </button>
                )) : <div className="px-3 py-3 text-gray-500 text-xs">Nothing found.</div>
              ) : (
                <>
                  <button onClick={newChat} className="block w-full text-left px-3 py-2 border-b border-gray-900 text-blue-300 hover:bg-gray-900">＋ New chat</button>
                  {convs.map(c => (
                    <button key={c.id} onClick={() => void openConv(c.id)}
                      className={`flex items-center gap-2 w-full text-left px-3 py-2 border-b border-gray-900 hover:bg-gray-900 ${c.id === convId ? 'bg-gray-900' : ''}`}>
                      <span className="flex-1 min-w-0 truncate text-gray-200">{c.title}</span>
                      {busyBy[c.id] && <span title={busyBy[c.id]} className="w-2 h-2 flex-none rounded-full bg-amber-400 animate-pulse" />}
                      <span className="flex-none text-[10px] text-gray-500">{when(c.last_message_at)}</span>
                    </button>
                  ))}
                  {!convs.length && <div className="px-3 py-3 text-gray-500 text-xs">No chats on this job yet.</div>}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
