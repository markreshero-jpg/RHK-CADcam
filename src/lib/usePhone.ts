import { useSyncExternalStore } from 'react'

// Phone = touch-first device with a small screen, in either orientation. iPads
// and touchscreen laptops keep the desktop layout. See z_mobile/MOBILE-SPEC.md.
const PHONE_QUERY = '(pointer: coarse) and (max-width: 600px), (pointer: coarse) and (max-height: 600px)'

/** Line weight multiplier on phones: the canvas draws lines in screen pixels,
 *  which read heavy on a small, dense screen. */
export const PHONE_LINE_SCALE = 0.6

function subscribe(cb: () => void) {
  const mq = window.matchMedia(PHONE_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches, () => false)
}

/** Multiplier for canvas stroke widths (1 on desktop). Renderers divide by
 *  `zoom / lineScale` for strokes only — text and hit targets keep their size. */
export function useLineScale(): number {
  return useIsPhone() ? PHONE_LINE_SCALE : 1
}
