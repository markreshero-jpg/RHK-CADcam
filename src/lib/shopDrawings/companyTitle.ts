// Company details for the shop drawings title block (z_shop_drawings S1).
// Read once per session from shop_settings; the logo is fetched into a data
// URL so svg2pdf can embed it (it can't fetch remote images itself).
'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase'

export interface CompanyTitleInfo {
  name:          string
  addressLines:  string[]
  phone:         string
  fax:           string
  email:         string
  website:       string
  /** PNG / JPEG data URL, or null when no logo is set (or it failed to load). */
  logoDataUrl:   string | null
  copyright:     string
  disclaimer:    string
  signatureLine: boolean
}

export const EMPTY_COMPANY: CompanyTitleInfo = {
  name: '', addressLines: [], phone: '', fax: '', email: '', website: '',
  logoDataUrl: null, copyright: '', disclaimer: 'Do not scale off this drawing.', signatureLine: true,
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise(resolve => {
      const r = new FileReader()
      r.onload = () => resolve(typeof r.result === 'string' ? r.result : null)
      r.onerror = () => resolve(null)
      r.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

async function loadCompany(): Promise<CompanyTitleInfo> {
  const { data } = await supabase.from('shop_settings').select(
    'company_name, company_address, company_phone, company_fax, company_email, company_website, ' +
    'company_logo_url, drawing_copyright, drawing_disclaimer, drawing_signature_line',
  ).limit(1).maybeSingle()
  if (!data) return EMPTY_COMPANY
  const s = data as unknown as Record<string, string | boolean | null>
  const str = (k: string) => (typeof s[k] === 'string' ? (s[k] as string).trim() : '')
  const logoUrl = str('company_logo_url')
  return {
    name:          str('company_name'),
    addressLines:  str('company_address').split(/\r?\n/).map(l => l.trim()).filter(Boolean),
    phone:         str('company_phone'),
    fax:           str('company_fax'),
    email:         str('company_email'),
    website:       str('company_website'),
    logoDataUrl:   logoUrl ? await toDataUrl(logoUrl) : null,
    copyright:     str('drawing_copyright'),
    disclaimer:    str('drawing_disclaimer') || EMPTY_COMPANY.disclaimer,
    signatureLine: s.drawing_signature_line !== false,
  }
}

let cache: Promise<CompanyTitleInfo> | null = null

/** Forget the cached company info (Settings → Company calls this after a save). */
export function invalidateCompanyTitle() { cache = null }

export function useCompanyTitle(): CompanyTitleInfo {
  const [info, setInfo] = useState<CompanyTitleInfo>(EMPTY_COMPANY)
  useEffect(() => {
    let live = true
    cache ??= loadCompany().catch(() => { cache = null; return EMPTY_COMPANY })
    cache.then(i => { if (live) setInfo(i) })
    return () => { live = false }
  }, [])
  return info
}

export function todayDdMmYy(d = new Date()): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`
}
