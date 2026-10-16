import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Pages that edit the shared library / shop settings, or create jobs — admins
// only. The database blocks the writes anyway (RLS); this keeps testers off
// screens they can't use. See z_access_control/ACCESS-CONTROL-SPEC.md.
const ADMIN_ONLY = ['/settings', '/library', '/projects/new', '/shape-editor-test']

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refreshes the session and checks auth — must not be removed
  let { data: { user } } = await supabase.auth.getUser()

  // Dev-only login for local automation scripts (headless Chrome sends this
  // header): signs in as the automation account from .env.local so the
  // browser gets a real session — the database has no anonymous access.
  // Inert in production builds.
  if (
    !user &&
    process.env.NODE_ENV === 'development' &&
    request.headers.get('x-dev-automation') === '1' &&
    process.env.AUTOMATION_EMAIL && process.env.AUTOMATION_PASSWORD
  ) {
    ({ data: { user } } = await supabase.auth.signInWithPassword({
      email: process.env.AUTOMATION_EMAIL,
      password: process.env.AUTOMATION_PASSWORD,
    }))
  }

  const isLoginPage = request.nextUrl.pathname.startsWith('/login')

  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  const path = request.nextUrl.pathname
  if (user && ADMIN_ONLY.some(p => path === p || path.startsWith(p + '/'))) {
    const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
    if (data?.role !== 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      url.search = ''
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|glb)$).*)',
  ],
}
