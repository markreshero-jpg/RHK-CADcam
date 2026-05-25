'use client'

import { useActionState } from 'react'
import { signIn } from './actions'

export default function LoginForm() {
  const [state, action, pending] = useActionState(signIn, null)

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-xs font-medium text-ink-muted mb-1.5">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full bg-surface-2 border border-edge-strong text-ink text-sm rounded-lg px-3.5 py-2.5 placeholder-ink-subtle focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-xs font-medium text-ink-muted mb-1.5">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full bg-surface-2 border border-edge-strong text-ink text-sm rounded-lg px-3.5 py-2.5 placeholder-ink-subtle focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
          placeholder="••••••••"
        />
      </div>

      {state?.error && (
        <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/30 rounded-lg px-3.5 py-2.5">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors mt-2"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
