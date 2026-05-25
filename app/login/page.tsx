import LoginForm from './LoginForm'
import { ThemeToggle } from '../ThemeToggle'

const LogoIcon = () => (
  <svg width="32" height="32" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="10" width="22" height="15" rx="1.5" fill="currentColor" fillOpacity="0.1" stroke="currentColor"/>
    <path d="M3 14 L14 10 L25 14" strokeWidth="1.2"/>
    <line x1="14" y1="10" x2="14" y2="25"/>
    <line x1="3" y1="19" x2="25" y2="19" strokeWidth="0.8" strokeOpacity="0.5"/>
    <line x1="8.5" y1="14" x2="8.5" y2="19" strokeWidth="0.8" strokeOpacity="0.5"/>
    <line x1="19.5" y1="14" x2="19.5" y2="19" strokeWidth="0.8" strokeOpacity="0.5"/>
  </svg>
)

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4 relative">
      <div className="absolute top-4 left-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <span className="inline-flex text-accent-ink mb-4">
            <LogoIcon />
          </span>
          <h1 className="text-lg font-bold text-ink tracking-tight">RHK CADcam</h1>
          <p className="text-ink-subtle text-sm mt-1">Cabinet Design & Manufacturing</p>
        </div>

        <div className="bg-surface border border-edge rounded-xl p-6">
          <h2 className="text-sm font-semibold text-ink mb-5">Sign in to your account</h2>
          <LoginForm />
        </div>

      </div>
    </div>
  )
}
