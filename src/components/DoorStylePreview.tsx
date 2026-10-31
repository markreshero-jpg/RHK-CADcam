'use client'

// ============================================================
// DoorStylePreview — live SVG preview of a door front.
//
// Draws a sample door (default 450×720mm) straight from the profile
// geometry (evaluateProfileOps → doorProfileCuts, the same cuts the CNC machines), filled with the
// linked board's face_colour and hatched with its grain direction. No
// stored images: previews always match what the resolver will cut.
//
// Also exports:
//   dbOpsToRawProfileOps — map door_profile_operations DB rows → RawProfileOp
//   useDoorStylePreviews — tiny data hook for pickers outside the Doors
//     Library (job/room properties): style id (+ optional colour id) → props.
// ============================================================

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/src/lib/supabase'
import { evaluateProfileOps, doorProfileCuts } from '@/src/lib/doorProfile'
import type { RawProfileOp, ResolvedDoorProfile } from '@/src/lib/resolver/types'

// Enlarged view reuses the Part Editor's 3D/ortho components (three.js) —
// loaded on demand so pickers don't pay for it until ⤢ is clicked.
const DoorStyleViewModal = dynamic(() => import('./DoorStyleViewModal'), { ssr: false })

export interface DoorStylePreviewProps {
  w?: number                 // sample door width (mm)
  h?: number                 // sample door height (mm)
  thickness?: number         // blank thickness — feeds the T formula variable
  profileType?: ResolvedDoorProfile['profile_type'] | null
  ops?: RawProfileOp[] | null
  faceColour?: string | null // linked board face_colour (hex); neutral grey when unset
  grain?: string | null      // 'vertical' | 'horizontal' | 'none'
  caption?: string | null
  className?: string         // sizes the SVG (e.g. "h-40")
  expandable?: boolean       // show the ⤢ button opening the Part-Editor-style modal
}

// Map raw door_profile_operations rows (DB shape) to the resolver's RawProfileOp.
// Same normalisation as loadCabinetInput so previews match production geometry.
export function dbOpsToRawProfileOps(rows: Array<Record<string, unknown>>): RawProfileOp[] {
  return rows.map(o => ({
    operation_type:      (o.operation_type as RawProfileOp['operation_type']) ?? 'route',
    depth_mm:            o.depth_mm != null ? Number(o.depth_mm) : null,
    width_mm:            o.width_mm != null ? Number(o.width_mm) : null,
    offset_from_edge_mm: o.offset_from_edge_mm != null ? Number(o.offset_from_edge_mm) : null,
    repeat_axis:         (o.repeat_axis as RawProfileOp['repeat_axis']) ?? 'none',
    spacing_mm:          o.spacing_mm != null ? Number(o.spacing_mm) : null,
    tool_diameter_mm:    o.tool_diameter_mm != null ? Number(o.tool_diameter_mm) : null,
    face:                (o.face as RawProfileOp['face']) ?? 'front',
    expressions:         (o.expressions as Record<string, string> | null) ?? null,
    sort_order:          (o.sort_order as number) ?? 0,
    router_tool_id:      (o.router_tool_id as string | null) ?? null,
    tool_set_id:         (o.tool_set_id as string | null) ?? null,
    offset_top_mm:       o.offset_top_mm != null ? Number(o.offset_top_mm) : null,
    offset_bottom_mm:    o.offset_bottom_mm != null ? Number(o.offset_bottom_mm) : null,
    offset_left_mm:      o.offset_left_mm != null ? Number(o.offset_left_mm) : null,
    offset_right_mm:     o.offset_right_mm != null ? Number(o.offset_right_mm) : null,
  }))
}

export function DoorStylePreview({
  w = 450, h = 720, thickness = 18,
  profileType = null, ops = null,
  faceColour = null, grain = null, caption = null, className = '',
  expandable = true,
}: DoorStylePreviewProps) {
  const [enlarged, setEnlarged] = useState(false)
  const pad = 20
  const resolved = evaluateProfileOps(ops ?? [], {
    w, h, thickness, toolDiameter: ops?.[0]?.tool_diameter_mm ?? 0,
  })
  // The same cuts the CNC machines (doorProfileCuts): pockets as a recess,
  // outline bands and grooves at their real width.
  const cuts = doorProfileCuts({ profile_type: profileType ?? 'custom', ops: resolved }, { w, h, thickness })
  // Face-local mm (origin bottom-left, +y up) → SVG (origin top-left, +y down).
  const mx = (lx: number) => pad + lx
  const my = (ly: number) => pad + h - ly

  const fill = faceColour || '#7b8494'

  // Grain hatching — sparse translucent lines in the board's grain direction.
  const grainLines: React.ReactNode[] = []
  if (grain === 'vertical') {
    for (let x = 55; x < w; x += 85) grainLines.push(
      <line key={`g${x}`} x1={mx(x)} y1={my(12)} x2={mx(x)} y2={my(h - 12)}
        stroke="rgba(255,255,255,0.10)" strokeWidth={x % 170 === 55 ? 3 : 1.5} />)
  } else if (grain === 'horizontal') {
    for (let y = 55; y < h; y += 85) grainLines.push(
      <line key={`g${y}`} x1={mx(12)} y1={my(y)} x2={mx(w - 12)} y2={my(y)}
        stroke="rgba(255,255,255,0.10)" strokeWidth={y % 170 === 55 ? 3 : 1.5} />)
  }

  return (
    <div className="relative inline-flex flex-col items-center gap-1 group/doorpv">
      {expandable && (
        <button
          onClick={e => { e.stopPropagation(); setEnlarged(true) }}
          title="Enlarge — 3D / Top / Front / Side"
          className="absolute top-0 right-0 z-10 px-1 py-0.5 rounded text-[11px] leading-none
                     text-ink-subtle hover:text-ink bg-surface-2/80 border border-edge
                     opacity-0 group-hover/doorpv:opacity-100 transition-opacity">
          ⤢
        </button>
      )}
      <svg viewBox={`0 0 ${w + 2 * pad} ${h + 2 * pad}`} className={className}
        role="img" aria-label={caption ?? 'Door preview'}>
        {/* Door blank */}
        <rect x={pad} y={pad} width={w} height={h} rx={6}
          fill={fill} stroke="rgba(0,0,0,0.55)" strokeWidth={3} />
        {/* Subtle top-light so a flat door doesn't read as a colour chip */}
        <rect x={pad} y={pad} width={w} height={h} rx={6}
          fill="url(#dsp-sheen)" stroke="none" />
        <defs>
          <linearGradient id="dsp-sheen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(255,255,255,0.10)" />
            <stop offset="0.5" stopColor="rgba(255,255,255,0)" />
            <stop offset="1" stopColor="rgba(0,0,0,0.10)" />
          </linearGradient>
        </defs>
        {grainLines}
        {/* Cuts, each with a thin highlight so it reads as a recess, not a printed border */}
        {cuts.map((c, i) => {
          if (c.kind === 'groove') {
            const gw = Math.max(2, c.width ?? 6)
            return (
              <g key={`c${i}`}>
                <line x1={mx(c.x1)} y1={my(c.y1)} x2={mx(c.x2)} y2={my(c.y2)}
                  stroke="rgba(0,0,0,0.35)" strokeWidth={gw} />
                <line x1={mx(c.x1) + 1.5} y1={my(c.y1)} x2={mx(c.x2) + 1.5} y2={my(c.y2)}
                  stroke="rgba(255,255,255,0.15)" strokeWidth={1.5} />
              </g>
            )
          }
          if (c.clear) {
            // Pocket: the whole area sits lower — shade it, highlight its bottom-left lip.
            return (
              <g key={`c${i}`}>
                <rect x={mx(c.x)} y={my(c.y + c.h)} width={c.w} height={c.h}
                  fill="rgba(0,0,0,0.22)" stroke="rgba(0,0,0,0.45)" strokeWidth={2} />
                <polyline points={`${mx(c.x) + 2},${my(c.y + c.h) + 2} ${mx(c.x) + 2},${my(c.y) - 2} ${mx(c.x + c.w) - 2},${my(c.y) - 2}`}
                  fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} />
              </g>
            )
          }
          // Outline band: c.band wide, just inside the rectangle.
          const k = c.band / 2
          return (
            <g key={`c${i}`}>
              <rect x={mx(c.x + k)} y={my(c.y + c.h - k)} width={Math.max(0, c.w - c.band)} height={Math.max(0, c.h - c.band)}
                fill="none" stroke="rgba(0,0,0,0.40)" strokeWidth={c.band} />
              <rect x={mx(c.x + c.band)} y={my(c.y + c.h - c.band)}
                width={Math.max(0, c.w - 2 * c.band)} height={Math.max(0, c.h - 2 * c.band)}
                fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} />
            </g>
          )
        })}
      </svg>
      {caption && <span className="text-[9px] text-ink-subtle leading-tight text-center">{caption}</span>}
      {enlarged && (
        <DoorStyleViewModal
          w={w} h={h} thickness={thickness}
          profileType={profileType} ops={ops} faceColour={faceColour} grain={grain}
          caption={caption}
          onClose={() => setEnlarged(false)}
        />
      )}
    </div>
  )
}

// ── Picker data hook ─────────────────────────────────────────────────────────
// Loads just enough of the door library to preview any style/colour combination
// in job & room properties: style → profile ops + blank thickness, colour →
// board face colour + grain. One fetch per mount; tables are tiny.

interface StyleRow {
  id: string
  door_profile_id: string | null
  default_material_id: string | null
  profile: { profile_type: string } | null
  catalogue: { thickness_mm: number } | null
}
interface ColourRow {
  id: string
  grain_direction: string | null
  material: { face_colour: string | null } | null
}

export function useDoorStylePreviews() {
  const [styles, setStyles]   = useState<Map<string, StyleRow>>(new Map())
  const [opsBy, setOpsBy]     = useState<Map<string, RawProfileOp[]>>(new Map())
  const [colours, setColours] = useState<Map<string, ColourRow>>(new Map())

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [stR, opR, colR] = await Promise.all([
        supabase.from('door_styles')
          .select('id,door_profile_id,default_material_id,profile:door_profiles(profile_type),catalogue:door_catalogue(thickness_mm)')
          .eq('is_active', true),
        supabase.from('door_profile_operations')
          .select('profile_id,operation_type,depth_mm,width_mm,offset_from_edge_mm,repeat_axis,spacing_mm,tool_diameter_mm,face,expressions,sort_order'),
        supabase.from('door_schedule_materials')
          .select('id,grain_direction,material:materials(face_colour)'),
      ])
      if (cancelled) return
      setStyles(new Map(((stR.data ?? []) as unknown as StyleRow[]).map(s => [s.id, s])))
      const by = new Map<string, RawProfileOp[]>()
      for (const o of (opR.data ?? []) as Array<Record<string, unknown>>) {
        const pid = o.profile_id as string
        by.set(pid, [...(by.get(pid) ?? []), ...dbOpsToRawProfileOps([o])])
      }
      setOpsBy(by)
      setColours(new Map(((colR.data ?? []) as unknown as ColourRow[]).map(c => [c.id, c])))
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Preview props for a style (+ explicit colour override). Null until loaded
  // or when the style id is unknown — callers just skip rendering.
  function forStyle(styleId: string | null | undefined, colourId?: string | null): DoorStylePreviewProps | null {
    if (!styleId) return null
    const st = styles.get(styleId)
    if (!st) return null
    const col = colours.get(colourId || st.default_material_id || '') ?? null
    return {
      thickness:   st.catalogue?.thickness_mm != null ? Number(st.catalogue.thickness_mm) : 18,
      profileType: (st.profile?.profile_type as ResolvedDoorProfile['profile_type']) ?? null,
      ops:         st.door_profile_id ? opsBy.get(st.door_profile_id) ?? [] : [],
      faceColour:  col?.material?.face_colour ?? null,
      grain:       col?.grain_direction ?? null,
    }
  }

  return { forStyle }
}
