'use client'

// CAD ribbon (z_CAD_tool decision 9): shown under the Plan / Elevation / 3D tabs while
// F7 CAD mode is on. Tools on the left, then the style of whatever is being edited /
// selected (or the next new item's defaults), then the room's annotation scale.
// Buttons keep focus where it was (mousedown preventDefault), so styling text while
// typing doesn't close the inline editor.

import React from 'react'
import { ARROW_TYPES, TEXT_SIZES, type AnnotationStyle, type DashType } from '@/src/lib/annotations/style'
import { useTutorial } from '@/src/lib/tutorial/store'
import type { AnnotationTool, CadTool } from './useAnnotationTool'

const PALETTE = ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#111111', '#ffffff']
const WEIGHTS = [0.18, 0.25, 0.35, 0.5, 0.7, 1]
const DASHES: { id: DashType; label: string }[] = [
  { id: 'solid', label: 'Solid' }, { id: 'dashed', label: 'Dashed' }, { id: 'dotted', label: 'Dotted' }, { id: 'dashdot', label: 'Dash-dot' },
]
const SCALES = [5, 10, 20, 25, 50, 100]

const TOOLS: { id: CadTool; label: string; key: string; icon: React.ReactNode }[] = [
  { id: 'select',  label: 'Select',   key: 'S', icon: <path d="M4 2l9 6-4 1 2 5-2 1-2-5-3 3z" fill="currentColor" /> },
  { id: 'text',    label: 'Text',     key: 'T', icon: <path d="M3 3h10M8 3v10M6 13h4" /> },
  { id: 'textbox', label: 'Text box', key: 'B', icon: <><rect x="2" y="2.5" width="12" height="11" rx="1" /><path d="M5 6h6M5 8.5h6M5 11h4" /></> },
  { id: 'leader',  label: 'Leader note — click the tip, click where the text goes', key: 'Q', icon: <><path d="M3 13l6-6h5" /><path d="M3 13l1-3 2 2z" fill="currentColor" /></> },
  { id: 'line',    label: 'Line — click points; double-click, Enter or right-click to finish', key: 'L', icon: <path d="M3 13L13 3" /> },
  { id: 'arrow',   label: 'Arrow — click points; double-click, Enter or right-click to finish', key: 'A', icon: <><path d="M3 13L12 4" /><path d="M13 3l-1 4-3-3z" fill="currentColor" /></> },
  { id: 'rect',    label: 'Box — drag corner to corner', key: 'R', icon: <rect x="3" y="4" width="10" height="8" /> },
  { id: 'ellipse', label: 'Ellipse — drag out its frame', key: 'E', icon: <ellipse cx="8" cy="8" rx="5.5" ry="4" /> },
  { id: 'cloud',   label: 'Revision cloud — drag a rectangle, or click the corners of a freehand one (double-click / Enter to close)', key: 'C', icon: <path d="M4 11a2 2 0 010-4 2.5 2.5 0 014-2 2.5 2.5 0 014 1.5 2 2 0 010 4.5z" /> },
  { id: 'dim',     label: 'Dimension — click two points, then click where the dimension line sits', key: 'D', icon: <><path d="M2 8h12M2 5v6M14 5v6" /></> },
]

const keep = (e: React.MouseEvent) => e.preventDefault()

function Sep() { return <div className="w-px self-stretch my-1.5 bg-gray-700 shrink-0" /> }

function Btn({ on, title, onClick, children, disabled, wide, tour }: {
  on?: boolean; title: string; onClick?: () => void; children: React.ReactNode; disabled?: boolean; wide?: boolean
  /** Tutorial spotlight target (data-tour). */
  tour?: string
}) {
  return (
    <button title={title} disabled={disabled} onMouseDown={keep} onClick={onClick} data-tour={tour}
      className={`${wide ? 'px-2' : 'w-7'} h-7 shrink-0 rounded flex items-center justify-center text-xs transition-colors
        ${disabled ? 'text-gray-600 cursor-not-allowed'
          : on ? 'bg-rose-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`}>
      {children}
    </button>
  )
}

function Icon({ children }: { children: React.ReactNode }) {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
}

function Colour({ value, onChange, title }: { value: string; onChange: (c: string) => void; title: string }) {
  return (
    <label title={title} className="relative w-6 h-6 shrink-0 rounded border border-gray-500 cursor-pointer overflow-hidden"
      style={{ background: value }}>
      <input type="color" value={value} onChange={e => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
    </label>
  )
}

function Num({ value, onChange, title, step = 0.5, min, max, w = 'w-12', suffix }: {
  value: number; onChange: (n: number) => void; title: string; step?: number; min?: number; max?: number; w?: string; suffix?: string
}) {
  return (
    <label title={title} className="flex items-center gap-0.5 shrink-0">
      <input type="number" value={value} step={step} min={min} max={max}
        onChange={e => { const n = parseFloat(e.target.value); if (Number.isFinite(n)) onChange(n) }}
        className={`${w} h-6 bg-gray-800 border border-gray-700 rounded px-1 text-xs text-gray-100 outline-none focus:border-rose-500`} />
      {suffix && <span className="text-[10px] text-gray-500">{suffix}</span>}
    </label>
  )
}

function Pick<T extends string | number>({ value, options, onChange, title }: {
  value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; title: string
}) {
  return (
    <select title={title} value={String(value)}
      onChange={e => { const o = options.find(x => String(x.id) === e.target.value); if (o) onChange(o.id) }}
      className="h-6 shrink-0 bg-gray-800 border border-gray-700 rounded px-1 text-xs text-gray-100 outline-none focus:border-rose-500">
      {options.map(o => <option key={String(o.id)} value={String(o.id)}>{o.label}</option>)}
    </select>
  )
}

function Group({ label, children, tour }: { label: string; children: React.ReactNode; tour?: string }) {
  return (
    <div className="flex items-center gap-1 shrink-0" data-tour={tour}>
      <span className="text-[10px] uppercase tracking-wide text-gray-500 mr-0.5">{label}</span>
      {children}
    </div>
  )
}

export default function CadRibbon({ cad, viewSupported, scale, onScale, onClose }: {
  cad: AnnotationTool
  /** false on views annotations don't cover yet (elevation until A6). */
  viewSupported: boolean
  scale: number
  onScale: (n: number) => void
  onClose: () => void
}) {
  const s = cad.ribbonStyle
  // The tutorial (z_tutorial) counts a ribbon style change as one event.
  const set = (patch: AnnotationStyle) => { cad.applyStyle(patch); useTutorial.getState().emit('annot_style') }
  const kind = cad.ribbonKind
  const isText = kind === 'text'
  const shapeFill = kind === 'rect' || kind === 'ellipse' || kind === 'cloud'
  const arrows = kind === 'line' || kind === 'dim'
  const nSel = cad.selected.length
  const NEXT: Record<CadTool, string> = {
    select: 'text', text: 'text', textbox: 'text box', leader: 'leader note', line: 'line', arrow: 'arrow', rect: 'box', ellipse: 'ellipse', cloud: 'cloud', dim: 'dimension',
  }
  const what = cad.editing ? (cad.editing.isNew ? 'New text' : 'Editing text')
    : nSel > 1 ? `${nSel} selected` : nSel === 1 ? `Selected ${kind === 'text' && (cad.selected[0].geom as { width?: number }).width != null ? 'text box' : kind}`
    : `Next ${NEXT[cad.tool]}`
  const oneText = nSel === 1 && kind === 'text' && !cad.editing
  const drawHint = !cad.drawing ? null
    : cad.drawing.attachId ? 'Click where the leader points · Esc cancels'
    : cad.drawing.tool === 'leader' ? 'Click where the text goes · Esc cancels'
    : cad.drawing.tool === 'dim' ? (cad.drawing.pts.length < 2 ? 'Click the second point · Esc cancels'
      : 'Move to pull the dimension out · click (or Enter) to place · Esc cancels')
    : 'Click the next point · double-click / Enter / right-click finishes · Backspace steps back · Esc cancels'

  return (
    <div className="flex-none h-10 bg-gray-900 border-b border-rose-900/60 flex items-center gap-1.5 px-2 shrink-0 relative z-20 overflow-x-auto"
      onPointerDown={e => e.stopPropagation()}>
      <span className="text-[11px] font-semibold text-rose-300 shrink-0 mr-1" title="CAD annotations (F7)">CAD</span>

      {TOOLS.map(t => (
        <Btn key={t.id} on={cad.tool === t.id} title={`${t.label} (${t.key})`} onClick={() => cad.setTool(t.id)} disabled={!viewSupported} tour={`cad-${t.id}`}>
          <Icon>{t.icon}</Icon>
        </Btn>
      ))}

      {!viewSupported ? (
        <span className="text-xs text-gray-400 ml-2">Elevation annotations arrive in phase A6. Switch to Plan to annotate.</span>
      ) : (<>
        <Sep />
        <span className="text-[11px] text-gray-400 shrink-0 w-24 truncate" title={what}>{what}</span>
        {drawHint && <span className="text-[11px] text-rose-200 shrink-0">{drawHint}</span>}

        <Group label="Colour" tour="cad-colour">
          {PALETTE.map(c => (
            <button key={c} title={c} onMouseDown={keep} onClick={() => set({ color: c, borderColor: c, fillColor: c })}
              className={`w-4 h-4 shrink-0 rounded-sm border ${s.color.toLowerCase() === c ? 'border-white ring-1 ring-rose-400' : 'border-gray-600'}`}
              style={{ background: c }} />
          ))}
          <Colour value={s.color} title="Custom colour" onChange={c => set({ color: c })} />
        </Group>

        {isText && (<>
          <Sep />
          <Group label="Text">
            <Pick title="Text height (paper mm)" value={(TEXT_SIZES as readonly number[]).includes(s.size) ? s.size : 0}
              options={[...TEXT_SIZES.map(n => ({ id: n as number, label: `${n} mm` })), { id: 0, label: 'Custom' }]}
              onChange={n => { if (n) set({ size: n }) }} />
            <Num title="Custom text height (paper mm)" value={s.size} step={0.5} min={1} max={50} w="w-11" suffix="mm"
              onChange={n => set({ size: Math.max(1, Math.min(50, n)) })} />
            <Btn title="Bold" on={s.bold} onClick={() => set({ bold: !s.bold })}><b>B</b></Btn>
            <Btn title="Italic" on={s.italic} onClick={() => set({ italic: !s.italic })}><i className="font-serif">I</i></Btn>
            <Btn title="Underline" on={s.underline} onClick={() => set({ underline: !s.underline })}><u>U</u></Btn>
            {(['left', 'center', 'right'] as const).map(al => (
              <Btn key={al} title={`Align ${al}`} on={s.align === al} onClick={() => set({ align: al })}>
                <Icon><path d={al === 'left' ? 'M3 4h10M3 7h6M3 10h10M3 13h6' : al === 'center' ? 'M3 4h10M5 7h6M3 10h10M5 13h6' : 'M3 4h10M7 7h6M3 10h10M7 13h6'} /></Icon>
              </Btn>
            ))}
            <Num title="Line spacing (× text height)" value={s.lineSpacing} step={0.1} min={0.8} max={3} w="w-11" suffix="×"
              onChange={n => set({ lineSpacing: Math.max(0.8, Math.min(3, n)) })} />
            {cad.ribbonRot != null && (
              <Num title="Rotation (degrees)" value={cad.ribbonRot} step={1} w="w-12" suffix="°" onChange={n => cad.applyRotation(n)} />
            )}
          </Group>
          <Sep />
          <Group label="Leader">
            {cad.ribbonLeader && (<>
              <Pick title="Leader arrowhead" value={s.arrowStart} onChange={v => set({ arrowStart: v })} options={ARROW_TYPES} />
              <Num title="Arrowhead size (paper mm)" value={s.arrowSize} step={0.5} min={0.5} max={10} w="w-10" suffix="mm"
                onChange={n => set({ arrowSize: Math.max(0.5, n) })} />
              <Pick title="Leader line weight (paper mm)" value={s.weight} onChange={v => set({ weight: v })}
                options={WEIGHTS.map(w => ({ id: w, label: `${w}` }))} />
            </>)}
            {oneText && (cad.ribbonLeader
              ? <Btn title="Remove the leader" wide onClick={cad.removeLeader}>Remove</Btn>
              : <Btn title="Add a leader: click where it should point" wide onClick={cad.startAddLeader}>+ Add</Btn>)}
          </Group>
          <Sep />
          <Group label="Back">
            <Pick title="Text background" value={s.bg} onChange={v => set({ bg: v })}
              options={[{ id: 'none', label: 'None' }, { id: 'mask', label: 'Mask' }, { id: 'solid', label: 'Solid' }]} />
            {s.bg === 'solid' && <Colour value={s.bgColor} title="Background colour" onChange={c => set({ bgColor: c })} />}
            {s.bg !== 'none' || s.border !== 'none'
              ? <Num title="Padding (paper mm)" value={s.bgPad} step={0.5} min={0} max={20} w="w-10" suffix="mm" onChange={n => set({ bgPad: Math.max(0, n) })} />
              : null}
          </Group>
          <Sep />
          <Group label="Border">
            <Pick title="Border" value={s.border} onChange={v => set({ border: v })}
              options={[{ id: 'none', label: 'None' }, { id: 'box', label: 'Box' }, { id: 'round', label: 'Rounded' }]} />
            {s.border !== 'none' && (<>
              <Colour value={s.borderColor} title="Border colour" onChange={c => set({ borderColor: c })} />
              <Pick title="Border weight (paper mm)" value={s.borderWeight} onChange={v => set({ borderWeight: v })}
                options={WEIGHTS.map(w => ({ id: w, label: `${w}` }))} />
              <Pick title="Border dash" value={s.borderDash} onChange={v => set({ borderDash: v })} options={DASHES} />
            </>)}
          </Group>
        </>)}

        {!isText && (<>
          <Sep />
          <Group label="Line">
            <Pick title="Line weight (paper mm)" value={s.weight} onChange={v => set({ weight: v })}
              options={WEIGHTS.map(w => ({ id: w, label: `${w} mm` }))} />
            <Pick title="Line type" value={s.dash} onChange={v => set({ dash: v })} options={DASHES} />
          </Group>
          {kind === 'dim' && (<>
            <Sep />
            <Group label="Dim">
              <Pick title="Dimension type for new dims: linear = horizontal / vertical (from where you pull it), aligned = along the two points"
                value={cad.dimMode} onChange={v => cad.setDimMode(v)}
                options={[{ id: 'linear', label: 'Linear' }, { id: 'aligned', label: 'Aligned' }]} />
              <Pick title="Dimension text height (paper mm)" value={(TEXT_SIZES as readonly number[]).includes(s.size) ? s.size : 0}
                options={[...TEXT_SIZES.map(n => ({ id: n as number, label: `${n} mm` })), { id: 0, label: 'Custom' }]}
                onChange={n => { if (n) set({ size: n }) }} />
              {nSel === 1 && (
                <input title="Text override — blank shows the measured length; <> stands for it (e.g. '<> TBC')"
                  placeholder="Measured" value={cad.selected[0].text ?? ''} onChange={e => cad.applyDimText(e.target.value)}
                  className="w-24 h-6 shrink-0 bg-gray-800 border border-gray-700 rounded px-1 text-xs text-gray-100 outline-none focus:border-rose-500" />
              )}
            </Group>
          </>)}
          {arrows && (<>
            <Sep />
            <Group label="Ends">
              <Pick title="Start arrowhead" value={s.arrowStart} onChange={v => set({ arrowStart: v })} options={ARROW_TYPES} />
              <Pick title="End arrowhead" value={s.arrowEnd} onChange={v => set({ arrowEnd: v })} options={ARROW_TYPES} />
              <Num title="Arrowhead size (paper mm)" value={s.arrowSize} step={0.5} min={0.5} max={10} w="w-10" suffix="mm"
                onChange={n => set({ arrowSize: Math.max(0.5, n) })} />
            </Group>
          </>)}
          {shapeFill && (<>
            <Sep />
            <Group label="Fill">
              <Pick title="Fill" value={s.fill} onChange={v => set({ fill: v })}
                options={[{ id: 'none', label: 'None' }, { id: 'solid', label: 'Solid' }, { id: 'tint', label: 'Tint' }]} />
              {s.fill !== 'none' && <Colour value={s.fillColor} title="Fill colour" onChange={c => set({ fillColor: c })} />}
              {s.fill === 'tint' && (
                <Num title="Tint opacity (0–1)" value={s.fillOpacity} step={0.05} min={0.05} max={1} w="w-12"
                  onChange={n => set({ fillOpacity: Math.max(0.05, Math.min(1, n)) })} />
              )}
            </Group>
          </>)}
          {kind === 'cloud' && (
            <Group label="Arcs">
              <Num title="Cloud arc length (paper mm)" value={s.cloudBump} step={1} min={2} max={30} w="w-11" suffix="mm"
                onChange={n => set({ cloudBump: Math.max(2, Math.min(30, n)) })} />
            </Group>
          )}
          {cad.ribbonRot != null && (
            <Group label="Turn">
              <Num title="Rotation (degrees)" value={cad.ribbonRot} step={1} w="w-12" suffix="°" onChange={n => cad.applyRotation(n)} />
            </Group>
          )}
        </>)}

        <Sep />
        <Btn title="Bring to front" disabled={!nSel} onClick={() => cad.reorder('front')}>
          <Icon><rect x="5" y="5" width="8" height="8" fill="currentColor" fillOpacity="0.4" /><rect x="2.5" y="2.5" width="7" height="7" /></Icon>
        </Btn>
        <Btn title="Send to back" disabled={!nSel} onClick={() => cad.reorder('back')}>
          <Icon><rect x="2.5" y="2.5" width="7" height="7" fill="currentColor" fillOpacity="0.4" /><rect x="5" y="5" width="8" height="8" /></Icon>
        </Btn>
        <Btn title="Delete (Del)" disabled={!nSel} onClick={cad.deleteSelected}>
          <Icon><path d="M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5" /></Icon>
        </Btn>
        <Btn title="Reset style to defaults" wide onClick={cad.resetStyle}>Reset</Btn>
      </>)}

      <div className="ml-auto flex items-center gap-1.5 shrink-0 pl-2">
        <Group label="Scale">
          <span className="text-xs text-gray-400">1:</span>
          <Pick title="Annotation scale — the canvas shows paper sizes as they print at this scale"
            value={SCALES.includes(scale) ? scale : 0}
            options={[...SCALES.map(n => ({ id: n, label: String(n) })), ...(SCALES.includes(scale) ? [] : [{ id: 0, label: String(scale) }])]}
            onChange={n => { if (n) onScale(n) }} />
        </Group>
        <Btn title="Close CAD (F7 / Esc)" onClick={onClose}><Icon><path d="M4 4l8 8M12 4l-8 8" /></Icon></Btn>
      </div>
    </div>
  )
}
