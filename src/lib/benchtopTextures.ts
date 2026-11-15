// Stone slab photos (z_benchtop_colours C4): one full-slab photo per stone colour in
// the public `benchtop-textures` bucket, laid on a top at true size
// (benchtop_materials.texture_w_mm × texture_h_mm = the slab the photo shows).
import { supabase } from '@/src/lib/supabase'

export const BENCHTOP_TEXTURE_BUCKET = 'benchtop-textures'

/** Public URL of a bucket path (null-safe). */
export function benchtopTextureUrl(path: string | null | undefined): string | null {
  if (!path) return null
  return supabase.storage.from(BENCHTOP_TEXTURE_BUCKET).getPublicUrl(path).data.publicUrl
}

/** What a top needs to draw its slab photo. */
export type SlabTexture = { url: string; wMm: number; hMm: number }

/** Browser-side: shrink an image file to ≤ maxW px wide JPEG (+ average colour). */
export async function prepareSlabImage(file: File, maxW: number): Promise<{ blob: Blob; w: number; h: number; hex: string }> {
  const bmp = await createImageBitmap(file)
  const w = Math.min(maxW, bmp.width), h = Math.round(bmp.height * w / bmp.width)
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')!; g.drawImage(bmp, 0, 0, w, h)
  const s = document.createElement('canvas'); s.width = 16; s.height = 8
  const sg = s.getContext('2d')!; sg.drawImage(c, 0, 0, 16, 8)
  const px = sg.getImageData(0, 0, 16, 8).data
  let r = 0, gg = 0, b = 0
  for (let i = 0; i < px.length; i += 4) { r += px[i]; gg += px[i + 1]; b += px[i + 2] }
  const n = px.length / 4, hx = (v: number) => Math.round(v / n).toString(16).padStart(2, '0')
  const blob = await new Promise<Blob>((res, rej) => c.toBlob(bl => bl ? res(bl) : rej(new Error('encode failed')), 'image/jpeg', 0.82))
  return { blob, w, h, hex: `#${hx(r)}${hx(gg)}${hx(b)}` }
}
