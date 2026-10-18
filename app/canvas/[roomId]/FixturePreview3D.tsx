'use client'
// Sidebar preview of the armed fixture (F6) — the fixture counterpart of
// CabinetPreview3D: the catalogue item's fitted 3D model (box at its size when
// it has none; doors / windows draw their frame) with its size underneath.
import type { FixtureCatalogItem, RoomFixture } from '@/src/lib/types'
import { PreviewCanvas } from '@/src/components/three/PartViewer'
import { FixtureModel } from '@/src/components/three/FixtureModel'
import { OpeningModel } from './Fixtures3D'

export default function FixturePreview3D({ item, canvasWidth }: { item: FixtureCatalogItem; canvasWidth: number }) {
  const W = Math.max(80, canvasWidth)
  const H = Math.round(W * 0.85)
  // Openings take their depth from the wall when placed; preview at a typical 100.
  const d = item.category === 'opening' ? Math.min(item.depth, 150) : item.depth
  return (
    <div className="rounded-lg bg-gray-950 border border-gray-800 hover:border-sky-500 overflow-hidden select-none transition-colors">
      <div style={{ width: W, height: H }} className="relative">
        <PreviewCanvas key={item.id} dx={item.width} dy={item.height} dz={d} bgColor="#030712" hint="">
          <group position={[-item.width / 2, -item.height / 2, -d / 2]}>
            {item.category === 'opening' && !item.model_url
              ? <OpeningModel f={{ ...item, depth: d } as unknown as RoomFixture} colour={item.colour} />
              : <FixtureModel f={item} />}
          </group>
        </PreviewCanvas>
      </div>
      <div className="px-2 pb-2 pt-1.5 border-t border-gray-800">
        <div className="text-[11px] font-semibold text-white/80 truncate">{item.name}</div>
        <div className="text-[10px] text-gray-500 mt-0.5 font-mono">
          {item.width} × {item.category === 'opening' ? 'wall' : item.depth} × {item.height} mm
          {item.brand || item.model_no ? <span className="font-sans"> · {[item.brand, item.model_no].filter(Boolean).join(' ')}</span> : null}
        </div>
      </div>
    </div>
  )
}
