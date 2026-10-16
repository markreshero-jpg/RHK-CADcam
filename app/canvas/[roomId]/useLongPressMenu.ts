import { useEffect, type RefObject } from 'react'

// Touch long-press → right-click for views that own their own touch gestures
// (the 3D view: OrbitControls rotates/pans, so usePinchZoom can't be used).
// A finger held still LONG_PRESS_MS fires a synthetic `contextmenu` at the
// finger on the element it pressed, so the view's existing right-click handlers
// (react-three-fiber raycasts it like a real one) open the same menus. The lift's
// click is swallowed so it can't hit the menu that just opened under the finger.
// See z_mobile/MOBILE-SPEC.md.

const LONG_PRESS_MS = 500
const SLOP_PX = 10
const CLICK_GUARD_MS = 600

export function useLongPressMenu(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const el = ref.current
    if (!enabled || !el) return
    el.style.setProperty('-webkit-touch-callout', 'none')

    const touches = new Set<number>()
    let press: { id: number; x: number; y: number; target: EventTarget; timer: ReturnType<typeof setTimeout> } | null = null
    let ours: Event | null = null
    let guardUntil = 0

    const cancel = () => { if (press) clearTimeout(press.timer); press = null }

    function fire() {
      if (!press) return
      const { x, y, target } = press
      press = null
      const ev = new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 2, buttons: 0,
      })
      ours = ev
      window.getSelection()?.removeAllRanges()
      guardUntil = performance.now() + 5000   // until the finger lifts
      ;((target as Node).isConnected ? target : el!).dispatchEvent(ev)
      ours = null
      navigator.vibrate?.(10)
    }

    function onDown(e: PointerEvent) {
      if (e.pointerType !== 'touch') return
      touches.add(e.pointerId)
      if (touches.size === 1) {
        press = { id: e.pointerId, x: e.clientX, y: e.clientY, target: e.target!, timer: setTimeout(fire, LONG_PRESS_MS) }
      } else cancel()   // second finger → pinch / pan, not a press
    }
    function onMove(e: PointerEvent) {
      if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP_PX) cancel()
    }
    function onUp(e: PointerEvent) {
      if (!touches.delete(e.pointerId)) return
      if (press && e.pointerId === press.id) cancel()
      if (guardUntil > performance.now()) guardUntil = performance.now() + CLICK_GUARD_MS
    }
    function onClick(e: Event) {
      if (performance.now() > guardUntil) return
      e.stopPropagation(); e.preventDefault()
    }
    // A browser that raises its own long-press contextmenu (Android) wins; ours is skipped.
    function onNativeMenu(e: Event) {
      if (e === ours) return
      if (press) { cancel(); return }
      if (performance.now() < guardUntil) { e.stopPropagation(); e.preventDefault() }
    }

    // iOS starts a text selection on a held finger; never while a touch is down here.
    function onSelectStart(e: Event) { if (touches.size) e.preventDefault() }

    el.addEventListener('pointerdown', onDown, true)
    document.addEventListener('selectstart', onSelectStart, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)
    window.addEventListener('click', onClick, true)
    window.addEventListener('contextmenu', onNativeMenu, true)
    return () => {
      cancel()
      el.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('selectstart', onSelectStart, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onUp, true)
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('contextmenu', onNativeMenu, true)
    }
  }, [ref, enabled])
}
