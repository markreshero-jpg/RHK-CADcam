import { useEffect, type Dispatch, type RefObject } from 'react'
import type { ViewAction } from './canvasTypes'

// Mouse right-button drag pans the 2D SVG views (plan, elevation).
//
// A right-click that stays within SLOP_PX still reaches the views untouched, so
// every right-click menu keeps working. Once it moves further the gesture becomes
// a pan: the svg captures the pointer, the moves / release are swallowed, and the
// contextmenu that follows the release (Windows fires it on mouseup) is cancelled
// before any cabinet / wall / benchtop menu handler sees it.

const SLOP_PX = 5

export function useRightDragPan(
  svgRef: RefObject<SVGSVGElement | null>,
  dispatchView: Dispatch<ViewAction>,
  enabled = true,
) {
  useEffect(() => {
    const svg = svgRef.current
    if (!enabled || !svg) return

    let press: { id: number; x: number; y: number; panning: boolean } | null = null
    let swallowMenu = false

    function onDown(e: PointerEvent) {
      swallowMenu = false
      press = e.button === 2 && e.pointerType === 'mouse'
        ? { id: e.pointerId, x: e.clientX, y: e.clientY, panning: false }
        : null
    }
    function onMove(e: PointerEvent) {
      if (!press || e.pointerId !== press.id) return
      if (!(e.buttons & 2)) { press = null; return }
      if (!press.panning) {
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) <= SLOP_PX) return
        press.panning = true
        svg!.setPointerCapture(e.pointerId)
      }
      dispatchView({ type: 'pan', dx: e.clientX - press.x, dy: e.clientY - press.y })
      press.x = e.clientX; press.y = e.clientY
      e.stopPropagation()
    }
    function onUp(e: PointerEvent) {
      if (!press || e.pointerId !== press.id) return
      if (press.panning) { swallowMenu = true; e.stopPropagation() }
      press = null
    }
    function onMenu(e: MouseEvent) {
      if (!swallowMenu) return
      swallowMenu = false
      e.preventDefault()
      e.stopPropagation()
    }

    svg.addEventListener('pointerdown', onDown, true)
    svg.addEventListener('pointermove', onMove, true)
    svg.addEventListener('pointerup', onUp, true)
    svg.addEventListener('contextmenu', onMenu, true)
    return () => {
      svg.removeEventListener('pointerdown', onDown, true)
      svg.removeEventListener('pointermove', onMove, true)
      svg.removeEventListener('pointerup', onUp, true)
      svg.removeEventListener('contextmenu', onMenu, true)
    }
  }, [svgRef, dispatchView, enabled])
}
