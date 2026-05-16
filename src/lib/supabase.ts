import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// url/key may be empty during static prerender — callers only run in the browser where they are always set
export const supabase = url && key ? createClient(url, key) : createClient('https://placeholder.supabase.co', 'placeholder')
