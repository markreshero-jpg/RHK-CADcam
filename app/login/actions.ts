'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function signIn(_prevState: { error: string } | null, formData: FormData) {
  const email = (formData.get('email') as string).trim().toLowerCase()
  const password = formData.get('password') as string

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

  if (authError) {
    return { error: 'Invalid email or password.' }
  }

  const { data: allowed } = await supabase
    .from('allowed_emails')
    .select('email')
    .eq('email', email)
    .maybeSingle()

  if (!allowed) {
    await supabase.auth.signOut()
    return { error: 'Your account is not authorised to access this application.' }
  }

  redirect('/')
}
