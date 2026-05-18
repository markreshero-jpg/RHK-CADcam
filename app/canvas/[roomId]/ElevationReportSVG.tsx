// B&W elevation report drawing — one wall.
// All layout constants are in physical mm × scale = model mm.
// This means the SVG viewBox is always in model mm, and when printed at the
// chosen scale the fonts/dims will be the correct physical mm on paper.
import type { RefObject } from 'react'
import type { Wall, Room, CabinetInstance } from '@/src/lib/types'
import { cabT } from '@/src/lib/geometry'

function wallCabTopH(wall: Wall, room: Room): number {
  if (wall.soffit_height != null) return (wall.height ?? room.room_dy ?? 2400) - wall.soffit_height
  return room.soffit_height ?? room.wall_cabinet_top ?? 2100
}

function cabFloorH(cab: CabinetInstance, wall: Wall, room: Room): number {
  if (cab.assembly_class === 'wall' || cab.assembly_class === 'wall_corner') {
    return wallCabTopH(wall, room) - cab.dy
  }
  return 0
}

function widthChain(cabs: CabinetInstance[], wall: Wall): { from: number; to: number; len: number }[] {
  const sorted = [...cabs].sort((a, b) => cabT(a, wall) - cabT(b, wall))
  const segs: { from: number; to: number; len: number }[] = []
  let cursor = 0
  for (const cab of sorted) {
    const t = cabT(cab, wall)
    if (t > cursor + 1) segs.push({ from: cursor, to: t, len: Math.round(t - cursor) })
    segs.push({ from: t, to: t + cab.dx, len: Math.round(cab.dx) })
    cursor = t + cab.dx
  }
  if (cursor < wall.length - 1) segs.push({ from: cursor, to: wall.length, len: Math.round(wall.length - cursor) })
  return segs
}

export default function ElevationReportSVG({ wall, cabinets, room, scale = 20, svgRef }: {
  wall: Wall
  cabinets: CabinetInstance[]
  room: Room
  scale?: number
  svgRef?: RefObject<SVGSVGElement | null> | ((el: SVGSVGElement | null) => void)
}) {
  const roomH  = room.room_dy ?? 2400
  const cabTop = wallCabTopH(wall, room)

  // All sizes: physical_mm × scale = model_mm
  // These will therefore print at the correct physical mm regardless of scale.
  const P        = scale            // 1 physical mm in model mm
  const DIM_GAP  = 10 * P          // floor → dim row 1
  const DIM_ROW  = 17 * P          // vertical space per dim row
  const LEFT_W   = 22 * P          // left margin (height scale markers)
  const RIGHT_W  = 5 * P
  const TOP_PAD  = 8 * P
  const TITLE_H  = 10 * P

  const FS       = 4 * P            // cabinet label
  const DFS      = 3 * P            // dimension text
  const TITLE_FS = 5.5 * P          // wall name
  const SW       = 0.45 * P         // main stroke
  const THIN     = 0.22 * P         // thin / witness stroke
  const TICK     = 3 * P            // tick half-height on dim line

  // Skip dim text if segment physical width < this many mm
  const MIN_TEXT_SEG = 8 * P

  const chain = widthChain(cabinets, wall)

  // All unique X positions that need a witness line
  const witnessXs = new Set<number>([0, wall.length])
  chain.forEach(s => { witnessXs.add(s.from); witnessXs.add(s.to) })

  // ViewBox — origin at (0, 0) = floor-left corner of wall.
  // Up = negative Y (ceiling at Y = -roomH), dim zone = positive Y (below floor).
  const vbX = -LEFT_W
  const vbY = -(TOP_PAD + TITLE_H)
  const vbW =  wall.length + LEFT_W + RIGHT_W
  const vbH =  TOP_PAD + TITLE_H + roomH + DIM_GAP + DIM_ROW * 2

  // Coordinate helpers
  const sy = (h: number) => -h    // height-from-floor → SVG Y

  // Left-side height dimension
  const leftDimX = -LEFT_W * 0.58
  function heightMarker(h1: number, h2: number, label: string, offsetX = 0) {
    const x = leftDimX + offsetX
    const y1 = sy(h1), y2 = sy(h2)
    const my = (y1 + y2) / 2
    return (
      <g key={`hm-${h1}-${h2}-${offsetX}`}>
        <line x1={x - TICK} y1={y1} x2={x + TICK} y2={y1} stroke="#333" strokeWidth={THIN} />
        <line x1={x - TICK} y1={y2} x2={x + TICK} y2={y2} stroke="#333" strokeWidth={THIN} />
        <line x1={x}        y1={y1} x2={x}        y2={y2} stroke="#333" strokeWidth={THIN} />
        <text
          x={x - TICK * 2} y={my}
          textAnchor="middle" dominantBaseline="central"
          fontSize={DFS} fill="#333" fontFamily="Arial, Helvetica, sans-serif"
          transform={`rotate(-90, ${x - TICK * 2}, ${my})`}
        >
          {label}
        </text>
      </g>
    )
  }

  return (
    <svg
      ref={svgRef as RefObject<SVGSVGElement>}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      xmlns="http://www.w3.org/2000/svg"
      data-vb-w={vbW} data-vb-h={vbH}
      style={{ width: '100%', height: 'auto', display: 'block', background: 'white' }}
    >
      {/* Wall name */}
      <text
        x={wall.length / 2} y={-(TOP_PAD * 0.45 + TITLE_H * 0.3)}
        textAnchor="middle" dominantBaseline="central"
        fontSize={TITLE_FS} fontWeight="bold" fill="#111"
        fontFamily="Arial, Helvetica, sans-serif"
      >
        {wall.name}
      </text>

      {/* Ceiling line */}
      <line
        x1={0} y1={sy(roomH)} x2={wall.length} y2={sy(roomH)}
        stroke="#aaa" strokeWidth={THIN}
        strokeDasharray={`${SW * 6} ${SW * 3}`}
      />
      {/* Ceiling label */}
      <text x={wall.length + THIN * 4} y={sy(roomH)} textAnchor="start" dominantBaseline="central" fontSize={DFS * 0.85} fill="#888" fontFamily="Arial, Helvetica, sans-serif">
        C {roomH}
      </text>

      {/* Soffit / wall-cab top (if below ceiling) */}
      {cabTop < roomH - 20 && (
        <>
          <line
            x1={0} y1={sy(cabTop)} x2={wall.length} y2={sy(cabTop)}
            stroke="#ccc" strokeWidth={THIN}
            strokeDasharray={`${SW * 3} ${SW * 2}`}
          />
          <text x={wall.length + THIN * 4} y={sy(cabTop)} textAnchor="start" dominantBaseline="central" fontSize={DFS * 0.85} fill="#aaa" fontFamily="Arial, Helvetica, sans-serif">
            WC {cabTop}
          </text>
        </>
      )}

      {/* Cabinets */}
      {cabinets.map(cab => {
        const t      = cabT(cab, wall)
        const floorH = cabFloorH(cab, wall, room)
        const top    = sy(floorH + cab.dy)
        const ht     = cab.dy
        const wd     = cab.dx
        const inset  = Math.min(SW * 4, wd * 0.05, ht * 0.05)
        return (
          <g key={cab.id}>
            <rect x={t} y={top} width={wd} height={ht}
              fill="white" stroke="#111" strokeWidth={SW}
            />
            <rect
              x={t + inset} y={top + inset}
              width={wd - inset * 2} height={ht - inset * 2}
              fill="none" stroke="#ccc" strokeWidth={THIN}
            />
            {cab.label && (
              <text
                x={t + wd / 2} y={top + ht / 2}
                textAnchor="middle" dominantBaseline="central"
                fontSize={FS} fill="#111" fontFamily="Arial, Helvetica, sans-serif"
              >
                {cab.label}
              </text>
            )}
          </g>
        )
      })}

      {/* Floor line */}
      <line x1={-THIN} y1={0} x2={wall.length + THIN} y2={0}
        stroke="#111" strokeWidth={SW * 3} />
      {/* Floor label */}
      <text x={-THIN * 4} y={DFS * 0.6} textAnchor="end" dominantBaseline="central" fontSize={DFS * 0.85} fill="#555" fontFamily="Arial, Helvetica, sans-serif">
        ±0
      </text>

      {/* ── Width dimension chain ── */}

      {/* Witness lines (dashed, floor down to below row 1) */}
      {[...witnessXs].map(x => (
        <line key={`wl-${x}`}
          x1={x} y1={SW}
          x2={x} y2={DIM_GAP + DIM_ROW * 1.15}
          stroke="#777" strokeWidth={THIN * 0.8}
          strokeDasharray={`${SW * 2.5} ${SW * 1.2}`}
        />
      ))}

      {/* Row 1 — individual segments */}
      {chain.map((seg, i) => {
        const y  = DIM_GAP + DIM_ROW * 0.52
        const mx = (seg.from + seg.to) / 2
        const showText = (seg.to - seg.from) >= MIN_TEXT_SEG
        return (
          <g key={`dr1-${i}`}>
            <line x1={seg.from} y1={y} x2={seg.to} y2={y} stroke="#333" strokeWidth={THIN} />
            <line x1={seg.from} y1={y - TICK} x2={seg.from} y2={y + TICK} stroke="#333" strokeWidth={THIN} />
            <line x1={seg.to}   y1={y - TICK} x2={seg.to}   y2={y + TICK} stroke="#333" strokeWidth={THIN} />
            {showText && (
              <text x={mx} y={y - DFS * 0.65}
                textAnchor="middle" dominantBaseline="auto"
                fontSize={DFS} fill="#111" fontFamily="Arial, Helvetica, sans-serif"
              >
                {seg.len}
              </text>
            )}
          </g>
        )
      })}

      {/* Row 2 — overall wall width */}
      {(() => {
        const y  = DIM_GAP + DIM_ROW * 1.55
        const mx = wall.length / 2
        return (
          <g>
            <line x1={0} y1={y} x2={wall.length} y2={y} stroke="#111" strokeWidth={SW * 0.9} />
            <line x1={0}           y1={y - TICK * 1.4} x2={0}           y2={y + TICK * 1.4} stroke="#111" strokeWidth={SW * 0.9} />
            <line x1={wall.length} y1={y - TICK * 1.4} x2={wall.length} y2={y + TICK * 1.4} stroke="#111" strokeWidth={SW * 0.9} />
            <text x={mx} y={y - DFS * 0.85}
              textAnchor="middle" dominantBaseline="auto"
              fontSize={DFS * 1.1} fontWeight="bold" fill="#111" fontFamily="Arial, Helvetica, sans-serif"
            >
              {Math.round(wall.length)}
            </text>
          </g>
        )
      })()}

      {/* ── Height markers (left side) ── */}
      {/* Full room height */}
      {heightMarker(0, roomH, `${roomH}`)}

      {/* Soffit drop */}
      {cabTop < roomH - 20 && heightMarker(cabTop, roomH, `${Math.round(roomH - cabTop)}`, -4 * P)}
    </svg>
  )
}
