'use client'

// Shop custom CAD colours (z_CAD_tool CC1, Mark 2026-11-08): saved swatches shown after the
// built-in palette in the CAD tools Colour group. One list for the whole shop, kept on
// shop_settings.cad_custom_colours, so every PC / phone shows the same swatches.
// Read by everyone; saving needs admin (shop_settings RLS).

import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase'

export const MAX_CUSTOM_COLOURS = 24

let cache: string[] | null = null
let settingsId: string | null = null
let loading: Promise<void> | null = null
const subs = new Set<(c: string[]) => void>()
const emit = () => { for (const f of subs) f(cache ?? []) }

export function normaliseHex(raw: string): string | null {
  let s = raw.trim().toLowerCase()
  if (!s.startsWith('#')) s = '#' + s
  if (/^#[0-9a-f]{3}$/.test(s)) s = '#' + s.slice(1).split('').map(c => c + c).join('')
  return /^#[0-9a-f]{6}$/.test(s) ? s : null
}

function load(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      const { data } = await supabase.from('shop_settings').select('id, cad_custom_colours').limit(1).maybeSingle()
      settingsId = (data?.id as string | undefined) ?? null
      cache = Array.isArray(data?.cad_custom_colours) ? (data!.cad_custom_colours as string[]) : []
      emit()
    })().catch(() => { cache = cache ?? []; loading = null; emit() })
  }
  return loading
}

async function save(next: string[]): Promise<string | null> {
  await load()
  if (!settingsId) return 'No shop settings row'
  const prev = cache
  cache = next; emit()
  const { error } = await supabase.from('shop_settings').update({ cad_custom_colours: next }).eq('id', settingsId)
  if (error) { cache = prev; emit(); return error.message }
  return null
}

/** Add a colour to the front of the shop list (moved there if it's already saved). */
export function addCustomColour(c: string): Promise<string | null> {
  const hex = normaliseHex(c)
  if (!hex) return Promise.resolve('Not a colour')
  return save([hex, ...(cache ?? []).filter(x => x !== hex)].slice(0, MAX_CUSTOM_COLOURS))
}

export function removeCustomColour(c: string): Promise<string | null> {
  return save((cache ?? []).filter(x => x !== c))
}

export function useCustomColours(): string[] {
  const [list, setList] = useState<string[]>(cache ?? [])
  useEffect(() => {
    subs.add(setList)
    if (cache) setList(cache); else void load()
    return () => { subs.delete(setList) }
  }, [])
  return list
}
