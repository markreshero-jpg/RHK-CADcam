// z_html_export H6: public share link for a room's 3D model. No login (proxy.ts
// skips /share): the page only shows what was uploaded to the public `share-3d`
// bucket under this random token, and reads nothing from the database.
import { SHARE_BUCKET, viewerPageHtml, type ShareMeta } from '@/src/lib/export3d/roomHtml'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const page = (status: number, msg: string) => new Response(
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>3D model</title></head><body style="font-family:-apple-system,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#444;background:#eef0f2;text-align:center;padding:24px;box-sizing:border-box">${msg}</body></html>`,
  { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
)

export async function GET(_req: Request, { params }: { params: Promise<{ roomId: string; token: string }> }) {
  const { roomId, token } = await params
  if (!UUID.test(roomId) || !UUID.test(token)) return page(404, 'This 3D link is not valid.')
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${SHARE_BUCKET}/${roomId}/${token}`
  const r = await fetch(`${base}/meta.json`, { cache: 'no-store' })
  if (!r.ok) return page(404, 'This 3D link has expired or been removed. Ask for a new one.')
  const meta = await r.json() as ShareMeta
  const html = viewerPageHtml({
    title: meta.title, heading: meta.heading, sub: meta.sub, view: meta.view,
    model: { glbUrl: `${base}/model.glb` },
    viewerSrc: '/share3d/viewer.js',
    usdzUrl: meta.usdz ? `${base}/model.usdz` : undefined,
  })
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'x-robots-tag': 'noindex, nofollow',
      'referrer-policy': 'no-referrer',
    },
  })
}
