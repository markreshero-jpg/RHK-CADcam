# Stone colour import tools (z_benchtop_colours C2 / C4)

Rebuilds `../stone-colours.json` and the slab photos from the supplier sites.
Work in a scratch folder `<W>` (≈ 1.4 GB of downloads); run with `python -I`.

1. **YDL list** — `curl -s https://www.ydlstone.com.au/product-sitemap.xml -o <W>/ydl_sitemap.xml`,
   then `python -I ydl_list.py <W>` → `ydl_all.json` (name, range, slab size, finish,
   "High-Resolution Slab Image" PDF per colour).
2. **YDL slabs** — `python -I ydl_process.py <W>` downloads each PDF (curl; Python's
   default user agent is refused) and pulls the slab image out → `ydl_manifest.json`.
   Mineral (20mm, silica free) only. Builder colours Jasmine / Mondo Sand / Silver Star
   White / Star Burst publish no slab image (swatch hex from the sample photo, if any).
3. **Stone Ambassador list** — `curl -s "https://stoneambassador.com.au/wp-json/wp/v2/colours?per_page=100" -o <W>/sa_colours1.json`
   and `.../colour_category?per_page=100` → `sa_cats.json`; filter to 20mm into
   `sa_20mm.json` (slug, name, link, cats, spec). Their pages refuse plain HTTP
   clients (Cloudflare), so the slab image URL of each colour (`…Website-Slab-Images-lightb-ox-…webp`,
   8000 × 4500) was read from each page with a web-fetch tool into
   `sa_slabs.json` (`{slug: {slab, product}}`) and the images downloaded with curl into `<W>/sa_dl/<slug>.webp`.
4. **Crop + size** — `python -I crop_all.py <W>` → `<W>/out/<key>.jpg` (≤ 4096 px) + `-thumb.jpg`.
   YDL: trim the border, then crop to the slab's proportion from the top (drops the
   stand shadow). Stone Ambassador: every photo is the same staged template, so a fixed
   box (12.15–87.75 % × 10.45–79.75 %); Le Taj / Dulce de Leche slabs are narrower (own box).
   Pearl White and Carrara Mist photos are over-exposed → swatch only, no photo.
5. **Manifest** — `python -I manifest.py <W> ../stone-colours.json`. WA-only and
   discontinued (Enchanted White) colours are skipped.
6. **Import** — from the repo root: `node z_benchtop_colours/import-stone-colours.mjs <W>/out`
   (signs in as the automation admin, uploads to the `benchtop-textures` bucket,
   upserts the child rows under "20mm Stone").

The images are the suppliers' published marketing photos — used inside the app to
show clients their stone, not republished.
