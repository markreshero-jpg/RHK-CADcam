import { getUserPrefs } from './userPrefs'

// Wheel → zoom, proportional to how far the wheel actually moved. A fixed step
// per event over-zooms on smooth-scroll mice and touchpads, which fire dozens of
// small events per notch. One standard mouse notch (deltaY ≈ 100px) ≈ 1.08×.
const ZOOM_PER_PX = Math.log(1.08) / 100
const CTRL_BOOST  = 3      // hold Ctrl: fast zoom
const SHIFT_BOOST = 0.25   // hold Shift: fine zoom

/** Magnification for one wheel event: > 1 zooms in, < 1 zooms out. Honours the
 *  invertScroll pref (read per event — it isn't reactive) and Ctrl = fast /
 *  Shift = fine. Callers must preventDefault, or Ctrl+wheel zooms the page.
 *  For viewBox-style views, where a larger box means zoomed out, divide the
 *  box size by it. */
export function wheelZoomFactor(e: WheelEvent): number {
  // Windows browsers turn Shift+wheel into a horizontal scroll: deltaY is 0 and
  // the notch arrives as deltaX.
  const raw = e.deltaY || (e.shiftKey ? e.deltaX : 0)
  const px = raw * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 800 : 1)
  const d = Math.max(-100, Math.min(100, px))   // cap one event at one notch
  const boost = e.ctrlKey ? CTRL_BOOST : e.shiftKey ? SHIFT_BOOST : 1
  return Math.exp((getUserPrefs().invertScroll ? d : -d) * ZOOM_PER_PX * boost)
}
