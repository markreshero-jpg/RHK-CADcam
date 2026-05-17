export interface UserPrefs {
  invertScroll: boolean
}

const KEY = 'rhk_user_prefs'
const DEFAULTS: UserPrefs = { invertScroll: false }

export function getUserPrefs(): UserPrefs {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULTS
  }
}

export function setUserPrefs(prefs: Partial<UserPrefs>): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify({ ...getUserPrefs(), ...prefs }))
}
