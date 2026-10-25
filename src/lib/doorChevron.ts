// Elevation door-swing chevron: the two legs start at the hinge edge's corners
// and meet at the middle of the opposite (opening) edge — so a bottom-hinged
// door's chevron points up and a top-hinged one points down.

type Rect = { x: number; y: number; w: number; h: number }   // SVG space, y down
export type HingeSide = 'left' | 'right' | 'top' | 'bottom'

export function doorChevronPoints(side: HingeSide, { x, y, w, h }: Rect): string {
  switch (side) {
    case 'left':   return `${x},${y} ${x + w},${y + h / 2} ${x},${y + h}`
    case 'right':  return `${x + w},${y} ${x},${y + h / 2} ${x + w},${y + h}`
    case 'top':    return `${x},${y} ${x + w / 2},${y + h} ${x + w},${y}`
    case 'bottom': return `${x},${y + h} ${x + w / 2},${y} ${x + w},${y + h}`
  }
}

/** The hinge edge as a line segment (drawn heavier on the elevation). */
export function hingeEdgeLine(side: HingeSide, { x, y, w, h }: Rect) {
  switch (side) {
    case 'left':   return { x1: x,     y1: y,     x2: x,     y2: y + h }
    case 'right':  return { x1: x + w, y1: y,     x2: x + w, y2: y + h }
    case 'top':    return { x1: x,     y1: y,     x2: x + w, y2: y }
    case 'bottom': return { x1: x,     y1: y + h, x2: x + w, y2: y + h }
  }
}
