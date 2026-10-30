import { describe, it, expect } from 'vitest'
import { buildCutStickers, cutStickersPdf } from '../cutStickers'
import { DEFAULT_LABEL_SETTINGS } from '../../optimiser/labels'
import type { HardwareLine } from '../hardware'

const rail: HardwareLine = {
  key: 'r', group: 'Hanging rails', name: 'Finista oval hanging rail 15 x 30 Chrome 3.6m', brand: null, code: '7104016',
  qty: 3, unit: 'ea', lengths: [961, 920, 920], cabinets: [], cuts: [{ label: 'TC-02', length: 920 }, { label: 'TC-02', length: 920 }, { label: 'TC-05', length: 961 }],
}
const hinge: HardwareLine = { key: 'h', group: 'Hinges', name: 'Clip top', brand: null, code: null, qty: 4, unit: 'ea', cabinets: [] }

describe('cut stickers', () => {
  it('one sticker per cut piece, numbered across the rooms', () => {
    const s = buildCutStickers('RHK6581 Lee Smith', [{ name: 'Bed 1', lines: [hinge] }, { name: 'WIR J11', lines: [hinge, rail] }])
    expect(s.map(x => [x.room, x.cab, x.length, x.no, x.of])).toEqual([
      ['WIR J11', 'TC-02', 920, 1, 3], ['WIR J11', 'TC-02', 920, 2, 3], ['WIR J11', 'TC-05', 961, 3, 3],
    ])
    expect(s[0].group).toBe('Hanging rail')
  })
  it('makes a page per sticker on a label printer', async () => {
    const s = buildCutStickers('Job', [{ name: 'WIR', lines: [rail] }])
    const doc = await cutStickersPdf(s, DEFAULT_LABEL_SETTINGS)
    expect(doc.getNumberOfPages()).toBe(3)
    if (process.env.STICKER_OUT) (await import('fs')).writeFileSync(process.env.STICKER_OUT, Buffer.from(doc.output('arraybuffer')))
  })
})
