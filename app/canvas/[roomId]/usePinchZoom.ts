import { useEffect, useCallback, type Dispatch, type MutableRefObject, type RefObject } from 'react'
import type { ViewAction } from './canvasTypes'
import { useIsPhone } from '@/src/lib/usePhone'

// Touchscreen two-finger pinch zoom + pan for the 2D SVG views (plan, elevation).
//
// The views' own pointer handlers act on the very first pointerdown (start a
// marquee, pick a cabinet, set a wall start point…), so a pinch would otherwise
// also fire a one-finger action. To avoid that, a lone touch pointerdown is held
// back for HOLD_MS:
//   - a second finger lands in that window → pinch; the first touch is never delivered
//   - the window expires, the finger moves > SLOP_PX, or it lifts → the held
//     pointerdown is replayed to its original target and the gesture proceeds normally.
// Mouse and pen are untouched. Touches that are part of a pinch (or a finger added
// after a one-finger gesture already started) are swallowed until lifted.
//
// Phones (z_mobile/MOBILE-SPEC.md) hold the touch until it resolves instead:
//   - finger moves > SLOP_PX → one-finger pan; the view never sees the touch
//   - finger lifts → tap: pointerdown replayed, pointerup let through
//   - finger stays put LONG_PRESS_MS → tap (select) + a synthetic contextmenu at
//     the finger, so every existing right-click menu opens; the rest of the touch
//     and the click that follows it are swallowed so the menu stays open.

const HOLD_MS = 120
const SLOP_PX = 10
const LONG_PRESS_MS = 500
const CLICK_GUARD_MS = 600

type Pt = { x: number; y: number }

export function usePinchZoom(
  svgRef: RefObject<SVGSVGElement | null>,
  dispatchView: Dispatch<ViewAction>,
  enabled = true,
) {
  const phone = useIsPhone()
  useEffect(() => {
    const svg = svgRef.current
    if (!enabled || !svg) return

    // Without this the browser claims the pinch as page zoom and cancels the pointers.
    // iOS also needs its long-press callout / text magnifier switched off.
    const prevTouchAction = svg.style.touchAction
    svg.style.touchAction = 'none'
    svg.style.setProperty('-webkit-touch-callout', 'none')
    svg.style.setProperty('-webkit-user-select', 'none')

    const replayed = new WeakSet<Event>()
    const touches = new Map<number, Pt>()
    let held: { e: PointerEvent; target: EventTarget; timer: ReturnType<typeof setTimeout> } | null = null
    let released: number | null = null   // touch delivered to the view as a normal one-finger gesture
    let pinching = false
    let last: { spread: number; mid: Pt } | null = null
    let panning: { id: number; at: Pt } | null = null   // phone one-finger pan
    let spent: number | null = null                     // phone long-press already handled this touch
    let guardUntil = 0                                  // swallow clicks / native menus until then

    const isOurs = (e: PointerEvent) => e.pointerType === 'touch' && !replayed.has(e)

    function measure() {
      const [a, b] = [...touches.values()]
      return { spread: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
    }

    function replay(type: 'pointerdown' | 'pointerup', e: PointerEvent, target: EventTarget) {
      const ev = new PointerEvent(type, {
        bubbles: true, cancelable: true, composed: true,
        clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY,
        pointerId: e.pointerId, pointerType: 'touch', isPrimary: e.isPrimary,
        button: 0, buttons: type === 'pointerdown' ? 1 : 0, width: e.width, height: e.height, pressure: e.pressure,
      })
      replayed.add(ev)
      ;((target as Node).isConnected ? target : svg!).dispatchEvent(ev)
    }

    function release() {
      if (!held) return
      clearTimeout(held.timer)
      const { e, target } = held
      held = null
      released = e.pointerId
      replay('pointerdown', e, target)
    }

    // Phone long-press: select what's under the finger (a tap), then open its menu.
    function longPress() {
      if (!held) return
      const { e, target } = held
      release()
      replay('pointerup', e, target)
      released = null
      spent = e.pointerId
      guardUntil = performance.now() + 5000   // cleared to CLICK_GUARD_MS when the finger lifts
      const menu = new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true, composed: true,
        clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY, button: 2, buttons: 0,
      })
      window.getSelection()?.removeAllRanges()
      replayed.add(menu)
      ;((target as Node).isConnected ? target : svg!).dispatchEvent(menu)
      navigator.vibrate?.(10)
    }

    function onDown(e: PointerEvent) {
      if (!isOurs(e)) return
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      e.stopPropagation()
      if (touches.size === 1 && !pinching) {
        held = { e, target: e.target!, timer: setTimeout(phone ? longPress : release, phone ? LONG_PRESS_MS : HOLD_MS) }
      } else if ((held || panning) && touches.size === 2) {
        if (held) clearTimeout(held.timer)
        held = null
        panning = null
        pinching = true
        last = measure()
      } else if (pinching && touches.size === 2) {
        last = measure()
      }
    }

    function onMove(e: PointerEvent) {
      if (!isOurs(e) || !touches.has(e.pointerId)) return
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (e.pointerId === released) return
      if (e.pointerId === spent) { e.stopPropagation(); return }
      if (held && held.e.pointerId === e.pointerId
          && Math.hypot(e.clientX - held.e.clientX, e.clientY - held.e.clientY) > SLOP_PX) {
        if (!phone) { release(); return }
        clearTimeout(held.timer)
        held = null
        panning = { id: e.pointerId, at: { x: e.clientX, y: e.clientY } }
      }
      e.stopPropagation()
      if (panning && panning.id === e.pointerId) {
        dispatchView({ type: 'pan', dx: e.clientX - panning.at.x, dy: e.clientY - panning.at.y })
        panning.at = { x: e.clientX, y: e.clientY }
        return
      }
      if (!pinching || touches.size !== 2 || !last) return

      const now = measure()
      if (now.spread <= 0 || last.spread <= 0) { last = now; return }
      const r = svg!.getBoundingClientRect()
      dispatchView({ type: 'pan', dx: now.mid.x - last.mid.x, dy: now.mid.y - last.mid.y })
      dispatchView({ type: 'zoom', factor: now.spread / last.spread, svgX: now.mid.x - r.left, svgY: now.mid.y - r.top })
      last = now
    }

    function onUp(e: PointerEvent) {
      if (!isOurs(e) || !touches.has(e.pointerId)) return
      touches.delete(e.pointerId)
      if (e.pointerId === released) { released = null; return }
      if (e.pointerId === spent) {
        spent = null
        guardUntil = performance.now() + CLICK_GUARD_MS
        e.stopPropagation()
        return
      }
      if (held && held.e.pointerId === e.pointerId) {
        if (e.type === 'pointerup') { release(); return }   // quick tap: deliver down, let this up through
        clearTimeout(held.timer)
        held = null
      }
      e.stopPropagation()
      if (panning && panning.id === e.pointerId) panning = null
      if (pinching) {
        last = touches.size === 2 ? measure() : null
        if (touches.size === 0) pinching = false
      }
    }

    // After a long-press: the lifting finger's click would land on the menu that
    // just opened under it, and some browsers raise their own contextmenu too.
    function onGuard(e: Event) {
      if (replayed.has(e) || performance.now() > guardUntil) return
      e.stopPropagation()
      e.preventDefault()
    }

    // iOS starts a text selection on a held finger; never while a touch is down here.
    function onSelectStart(e: Event) { if (touches.size) e.preventDefault() }

    // Move/up on window (capture) so a finger sliding off the SVG is still tracked,
    // and so stopPropagation runs ahead of React's root listeners.
    svg.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)
    document.addEventListener('selectstart', onSelectStart, true)
    if (phone) {
      window.addEventListener('click', onGuard, true)
      window.addEventListener('contextmenu', onGuard, true)
    }
    return () => {
      if (held) clearTimeout(held.timer)
      svg.style.touchAction = prevTouchAction
      svg.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onUp, true)
      document.removeEventListener('selectstart', onSelectStart, true)
      window.removeEventListener('click', onGuard, true)
      window.removeEventListener('contextmenu', onGuard, true)
    }
  }, [svgRef, dispatchView, enabled, phone])
}

// Pinch for the viewBox-zoomed SVGs inside the cabinet edit modal (resolved
// elevation/top/side, Part Editor ortho, face + internal grid editors). Same
// gesture handling as above; translates its screen-space pan/zoom into viewBox
// changes. `minW`/`maxW` match each view's wheel-zoom clamp.
type VB = { x: number; y: number; w: number; h: number }

export function useViewBoxPinch(
  svgRef: RefObject<SVGSVGElement | null>,
  vbRef: MutableRefObject<VB>,
  setVb: (vb: VB) => void,
  minW: number,
  maxW: number,
) {
  const dispatch = useCallback((a: ViewAction) => {
    const el = svgRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const { x, y, w, h } = vbRef.current
    if (!r.width || !r.height || !w || !h) return
    // Computed from the live vbRef (not getScreenCTM, which lags a render behind
    // during a fast pinch). preserveAspectRatio default = xMidYMid meet.
    const scale = Math.min(r.width / w, r.height / h)
    let next: VB
    if (a.type === 'pan') {
      next = { x: x - a.dx / scale, y: y - a.dy / scale, w, h }
    } else if (a.type === 'zoom') {
      const px = x + (a.svgX - (r.width - w * scale) / 2) / scale
      const py = y + (a.svgY - (r.height - h * scale) / 2) / scale
      const newW = Math.max(minW, Math.min(maxW, w / a.factor))
      const newH = h * (newW / w)
      next = { x: px - ((px - x) / w) * newW, y: py - ((py - y) / h) * newH, w: newW, h: newH }
    } else return
    vbRef.current = next
    setVb({ ...next })
  }, [svgRef, vbRef, setVb, minW, maxW])
  usePinchZoom(svgRef, dispatch)
}
