// ============================================================
// Headless optimiser run — Stages 1-6 without the browser.
// Skipped unless OPTI_RUN is set, so `npm test` never touches the DB.
//
//   OPTI_RUN='{"project":"<id>","rooms":["Entry J01"],"materials":["Whiteboard 16.5mm"],"out":"z_nc_output/x"}' \
//     npx vitest run src/lib/optimiser/__tests__/headlessRun.test.ts --silent=false
//
// Optional: "cabinets": ["BC-08"], "quality": "fast"|"balanced"|"best".
// Mirrors OptimiserClient Stage 4 run() + Stage6Gcode generate() and signs in
// as the automation account from .env.local. Writes one program per sheet,
// sheets.pdf (one page per sheet + a parts list), labels.pdf (102x48) and
// summary.json into <out>/<yyyymmdd-hhmmss>/.
// ============================================================

import { describe, it, vi } from 'vitest'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/src/lib/supabase', async () => {
  const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { error } = await supabase.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
  if (error) throw error
  return { supabase }
})

interface RunCfg { project: string; rooms?: string[]; cabinets?: string[]; materials?: string[]; out: string; quality?: 'fast' | 'balanced' | 'best' }
const CFG: RunCfg | null = process.env.OPTI_RUN ? JSON.parse(process.env.OPTI_RUN) : null

describe.skipIf(!CFG)('headless optimiser run', () => {
  it('nests, drills and posts', async () => {
    const cfg = CFG!
    const { supabase } = await import('@/src/lib/supabase')
    const { loadProjectParts } = await import('../loadClient')
    const { materialGroupKey, buildMargins } = await import('../types')
    const { nest } = await import('../nest')
    const { buildGrainBlocks, expandGrainBlocks, blockRectOn, grainMatchTags, grainMatchLine } = await import('../grainBlocks')
    const { grainMatchColour } = await import('../../grainMatch')
    const { cutBlank, placedOutline, placedHoles } = await import('../shapes')
    const { loadSheetDrills, nestedParts } = await import('../sheetDrills')
    const { generateSheetGcode, postFromProfile, gcodeFileName } = await import('../gcode')
    const { validateGcode, errorsOf, warningsOf, formatFinding } = await import('../gcodeValidate')
    type NestPartInput = import('../nest').NestPartInput
    type GroupStock = import('../nest').GroupStock
    type SheetStock = import('../nest').SheetStock
    type NestedSheet = import('../nest').NestedSheet
    type OptiSnapshot = import('../types').OptiSnapshot
    type OptiMaterial = import('../types').OptiMaterial
    type DrillBlockConfig = import('../gangDrill').DrillBlockConfig
    type PostProfile = import('../gcode').PostProfile

    const t0 = Date.now()
    const lap = (m: string) => console.log(`[run ${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)

    // ── Snapshot (page.tsx) ──
    const { data: project } = await supabase.from('projects').select('id,name,job_number').eq('id', cfg.project).single()
    if (!project) throw new Error('project not found')
    const norm = await loadProjectParts(cfg.project)
    const [matR, machR, profR, toolR] = await Promise.all([
      supabase.from('materials').select('id,name,dz,sheet_dx,sheet_dy,has_grain,grain_direction,trim_top,trim_bottom,trim_left,trim_right,pad,cnc_tool_id,feed_rate_pct').eq('active', true).order('name'),
      supabase.from('cnc_machines').select('id,name,brand,model,table_dx,table_dy,gcode_dialect,is_default').eq('active', true).order('name'),
      supabase.from('cnc_machine_profiles').select('id,cnc_machine_id,name,is_default,nest_pad,tool_entry_offset,margin_use_tool_dia,margin_use_entry_offset,deduct_edgeband'),
      supabase.from('cnc_tools').select('id,diameter').eq('active', true),
    ])
    const snap: OptiSnapshot = {
      projectId: project.id, projectName: project.name, jobNumber: project.job_number ?? null,
      rooms: norm.rooms, cabinets: norm.cabinets, parts: norm.parts,
      materials: (matR.data ?? []) as OptiMaterial[], machines: (machR.data ?? []) as OptiSnapshot['machines'],
      profiles: (profR.data ?? []) as OptiSnapshot['profiles'], tools: (toolR.data ?? []) as OptiSnapshot['tools'], allProjects: [],
    }
    lap(`snapshot: ${snap.parts.length} parts`)

    // ── Stage 1 defaults (store.init) ──
    const machine = snap.machines.find(m => m.is_default) ?? snap.machines[0] ?? null
    const prof = snap.profiles.find(p => p.cnc_machine_id === machine?.id && p.is_default)
      ?? snap.profiles.find(p => p.cnc_machine_id === machine?.id) ?? null
    const machineId = machine?.id ?? null, profileId = prof?.id ?? null

    // ── Stage 2 selection: output_to_cnc parts passing the filters ──
    const nameIn = (list: string[] | undefined, v: string | null | undefined) =>
      !list?.length || list.some(n => n.toLowerCase() === (v ?? '').toLowerCase())
    const matName = (id: string | null) => id ? snap.materials.find(m => m.id === id)?.name ?? null : null
    const runParts = snap.parts.filter(p => p.output_to_cnc && nameIn(cfg.rooms, p.room_name)
      && nameIn(cfg.cabinets, p.cabinet_label) && nameIn(cfg.materials, matName(p.material_id)))
    if (!runParts.length) throw new Error('no parts match the filters')

    // ── Stage 4 run() ──
    const deductEb = prof?.deduct_edgeband === true
    const notes: string[] = []
    const staleShapes = runParts.filter(p => p.shape_stale)
    const nestableParts = runParts.filter(p => !p.shape_stale)
    for (const p of staleShapes) notes.push(`STALE SHAPE, not nested: ${p.cabinet_label} ${p.label}`)
    if (deductEb) for (const p of runParts.filter(p => p.eb_missing)) notes.push(`edgeband thickness unknown: ${p.cabinet_label} ${p.label}`)
    if (deductEb) for (const p of nestableParts.filter(p => p.shape && cutBlank(p, true).failed)) notes.push(`shape offset failed, cut at finished size: ${p.cabinet_label} ${p.label}`)
    const cabById = new Map(snap.cabinets.map(c => [c.id, c]))
    for (const id of new Set(nestableParts.map(p => p.cabinet_instance_id))) {
      const c = cabById.get(id)
      if (c?.hand_fix?.length) notes.push(`hand-fix joints: ${c.label}`)
      if (c?.colour_warnings?.length) notes.push(`colour fallback: ${c.label}`)
    }

    const matById = new Map(snap.materials.map(m => [m.id, m]))
    const seedStock = (materialId: string | null): SheetStock => {
      const m = materialId ? matById.get(materialId) : null
      return {
        w: m?.sheet_dx ?? 2400, h: m?.sheet_dy ?? 1200,
        trimTop: m?.trim_top ?? 5, trimBottom: m?.trim_bottom ?? 5, trimLeft: m?.trim_left ?? 5, trimRight: m?.trim_right ?? 5,
        isOffcut: false, label: null, grainAlong: m?.grain_direction === 'width' ? 'h' : 'w',
      }
    }
    const parts: NestPartInput[] = []
    const index: Record<string, NestPartInput> = {}
    const stockForRun: Record<string, GroupStock> = {}
    for (const p of nestableParts) {
      const grainLock = !!(p.material_id && matById.get(p.material_id)?.has_grain)
      const gk = materialGroupKey(p.material_id, p.thickness)
      if (!stockForRun[gk]) stockForRun[gk] = { standard: seedStock(p.material_id), offcuts: [] }
      const dims = cutBlank(p, deductEb)
      const inst: NestPartInput = { uid: `${p.uid}#0`, baseUid: p.uid, label: p.label, w: dims.w, h: dims.h, thickness: p.thickness, materialId: p.material_id, grainLock, grainAcross: p.grain_across, priority: p.nest_priority }
      parts.push(inst); index[inst.uid] = inst
    }
    const margins = buildMargins(snap, profileId)
    // Grain match blocks (z_grain_match G4) — same path as Stage 4 run().
    const groupFrontCount = new Map<string, number>()
    for (const p of snap.parts) {
      const gid = p.wall_rect && p.output_to_cnc ? cabById.get(p.cabinet_instance_id)?.grain_match?.id : undefined
      if (gid) groupFrontCount.set(gid, (groupFrontCount.get(gid) ?? 0) + 1)
    }
    const gm = buildGrainBlocks({
      instances: parts, partByUid: new Map(snap.parts.map(p => [p.uid, p])), cabById, groupFrontCount,
      stockFor: (m, t) => stockForRun[materialGroupKey(m, t)]?.standard,
      gapFor: m => (m != null ? margins.byMaterial[m] : undefined) ?? margins.fallback,
      allowRotation: true,
    })
    const nestResult = expandGrainBlocks(nest(gm.parts, stockForRun, {
      quality: cfg.quality ?? 'balanced', allowRotation: true,
      marginByMaterial: margins.byMaterial, defaultMargin: margins.fallback,
    }), gm.blocks, index, gm.warnings)
    for (const w of nestResult.warnings ?? []) notes.push(`grain match: ${w}`)
    for (const u of nestResult.unplaced) notes.push(`UNPLACED (too big): ${u.label} ${u.w}x${u.h}`)
    lap(`nested ${parts.length} parts → ${nestResult.sheets.length} sheet(s)`)

    // ── Stage 6 generate() ──
    const { data: profileRow } = profileId
      ? await supabase.from('cnc_machine_profiles').select('*').eq('id', profileId).single() : { data: null }
    const profile = profileRow as Record<string, unknown> | null
    const post0 = postFromProfile(profile)
    const { data: toolRows } = await supabase.from('cnc_tools')
      .select('id,name,tool_number,diameter,max_depth_per_pass,base_feed_rate,base_spindle_speed,plunge_feed_rate').eq('active', true)
    const toolById = new Map((toolRows ?? []).map(t => [t.id as string, t]))
    const toolNum = (tn: unknown) => { const d = String(tn ?? '').replace(/\D/g, ''); return d ? Number(d) : 1 }
    const toolNames: Record<number, string | null> = {}
    for (const t of toolRows ?? []) { const n = toolNum(t.tool_number); if (n) toolNames[n] = (t.name as string | null) ?? null }

    let drillBlock: DrillBlockConfig | undefined
    if (machineId) {
      const { data: blkRow } = await supabase.from('cnc_drill_blocks')
        .select('*').eq('cnc_machine_id', machineId).eq('is_active', true).order('created_at').limit(1).maybeSingle()
      if (blkRow) {
        const blk = blkRow as Record<string, unknown>
        const { data: spRows } = await supabase.from('cnc_drill_block_spindles').select('bank,position,drill_id').eq('drill_block_id', blk.id as string)
        const spindles = (spRows ?? []) as { bank: string; position: number; drill_id: string | null }[]
        if (spindles.some(s => s.drill_id)) {
          const { data: drillRows } = await supabase.from('cnc_drills').select('id,diameter')
          const diaById = new Map((drillRows ?? []).map(d => [d.id as string, (d.diameter as number | null) ?? null]))
          const xCount = Number(blk.bank_x_count ?? 12), yCount = Number(blk.bank_y_count ?? 8)
          const xDiameters: (number | null)[] = Array(xCount).fill(null)
          const yDiameters: (number | null)[] = Array(yCount).fill(null)
          for (const s of spindles) {
            const arr = s.bank === 'x' ? xDiameters : yDiameters
            if (s.position >= 1 && s.position <= arr.length) arr[s.position - 1] = s.drill_id ? diaById.get(s.drill_id) ?? null : null
          }
          drillBlock = {
            bankXCount: xCount, bankYCount: yCount, spacingMm: Number(blk.spacing_mm ?? 32),
            xBankMcode: String(blk.x_bank_mcode ?? 'M88'), yBankMcode: String(blk.y_bank_mcode ?? 'M89'),
            sharedCorner: Boolean(blk.shared_corner ?? true),
            headOffsetXMm: Number(blk.head_offset_x_mm ?? 0), headOffsetYMm: Number(blk.head_offset_y_mm ?? -128),
            workOffsetCode: String(blk.work_offset_code ?? 'G54'), xDiameters, yDiameters,
          }
        }
      }
    }
    const blockDiameters = drillBlock ? [...drillBlock.xDiameters, ...drillBlock.yDiameters].filter((d): d is number => d != null) : undefined
    const routerTools = (toolRows ?? []).filter(t => t.diameter != null && Number(t.diameter) > 0)
      .map(t => ({ id: t.id as string, diameter: Number(t.diameter), tool_number: toolNum(t.tool_number), name: (t.name as string | null) ?? null }))
    const preferredPocketToolNumber = profile?.pocket_router_tool_number != null ? Number(profile.pocket_router_tool_number) : null
    const { bySheet: sheetDrills, routesBySheet: sheetRoutes, warnings: drillWarnings } =
      await loadSheetDrills(nestedParts(snap.parts, index), nestResult.sheets, { sync: true, blockDiameters, routerTools, preferredPocketToolNumber, deductEdgeband: deductEb })
    lap(`drilling synced + loaded`)

    const jobInt = parseInt((snap.jobNumber ?? '').match(/\d+/)?.[0] ?? '', 10)
    const oBase = Number.isFinite(jobInt) ? jobInt : 0
    const partByUid = new Map(snap.parts.map(p => [p.uid, p]))
    const outlinesFor = (sheet: NestedSheet) => {
      const out: Record<string, { x: number; y: number }[]> = {}
      for (const pl of sheet.placements) {
        const part = partByUid.get(pl.baseUid)
        const local = part ? placedOutline(part, pl, deductEb) : null
        if (local) out[pl.uid] = local.map(q => ({ x: pl.x + q.x, y: pl.y + q.y }))
      }
      return out
    }
    const holesFor = (sheet: NestedSheet) => {
      const out: Record<string, { x: number; y: number }[][]> = {}
      for (const pl of sheet.placements) {
        const part = partByUid.get(pl.baseUid)
        const hs = part ? placedHoles(part, pl, deductEb) : []
        if (hs.length) out[pl.uid] = hs.map(h => h.map(q => ({ x: pl.x + q.x, y: pl.y + q.y })))
      }
      return out
    }
    const holeSkinsFor = (sheet: NestedSheet) => {
      const out: Record<string, number[]> = {}
      for (const pl of sheet.placements) {
        const skins = partByUid.get(pl.baseUid)?.cut_hole_skins
        if (skins?.some(s => s > 0)) out[pl.uid] = skins
      }
      return out
    }
    const d = new Date()
    const ds = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const gen = nestResult.sheets.map((sheet, i) => {
      const drills = sheetDrills.get(sheet.index) ?? []
      const routes = sheetRoutes.get(sheet.index) ?? []
      const mat = sheet.materialId ? matById.get(sheet.materialId) : undefined
      const tool = mat?.cnc_tool_id ? toolById.get(mat.cnc_tool_id) : undefined
      const post: PostProfile = postFromProfile(profile, tool
        ? { base_feed_rate: tool.base_feed_rate as number | null, base_spindle_speed: tool.base_spindle_speed as number | null, plunge_feed_rate: tool.plunge_feed_rate as number | null }
        : undefined)
      if (mat?.feed_rate_pct && mat.feed_rate_pct > 0) post.base_feed_rate = Math.round(post.base_feed_rate * mat.feed_rate_pct / 100)
      const gcode = generateSheetGcode({
        sheet, thickness: sheet.thickness, profile: post, drills, routes,
        toolNumber: toolNum(tool?.tool_number), drillToolNumber: 2,
        toolDiameter: tool?.diameter != null ? Number(tool.diameter) : undefined,
        maxDepthPerPass: tool?.max_depth_per_pass != null ? Number(tool.max_depth_per_pass) : undefined,
        jobNumber: snap.jobNumber, materialName: mat?.name ?? null,
        toolName: (tool?.name as string | null) ?? null, toolNames,
        programNumber: `O${String(oBase + i).padStart(4, '0')}`,
        drillBlock, outlines: outlinesFor(sheet), holes: holesFor(sheet), holeSkins: holeSkinsFor(sheet),
      })
      const fileName = gcodeFileName({ batch: false, jobNumber: snap.jobNumber, dateStr: ds, materialCode: mat?.name ?? 'MAT', sheetNumber: i + 1, ext: post.file_extension })
      return { sheet, fileName, gcode, drills, routes, findings: validateGcode(gcode, { maxCommentLength: post.max_comment_length }) }
    })
    const blocking = gen.flatMap(g => errorsOf(g.findings).map(f => `${g.fileName}  ${formatFinding(f)}`))
    const warned = gen.flatMap(g => warningsOf(g.findings).map(f => `${g.fileName}  ${formatFinding(f)}`))
    void post0

    // ── Write files ──
    // Each run gets its own folder: the nest differs run to run, so programs,
    // sheets and labels must never mix across runs (or hit a PDF left open).
    const outDir = join(cfg.out, `${ds}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`)
    mkdirSync(outDir, { recursive: true })
    if (!blocking.length) for (const g of gen) {
      const bytes = new Uint8Array(g.gcode.length)
      for (let i = 0; i < g.gcode.length; i++) bytes[i] = g.gcode.charCodeAt(i) & 0x7f
      writeFileSync(join(outDir, g.fileName), bytes)
    }

    // Holes per placement (a hole belongs to the part whose rect holds it).
    const holesIn = (pl: NestedSheet['placements'][number], drills: { x: number; y: number }[]) =>
      drills.filter(h => h.x >= pl.x - 0.01 && h.x <= pl.x + pl.w + 0.01 && h.y >= pl.y - 0.01 && h.y <= pl.y + pl.h + 0.01)

    // Part numbers: sheet-major, in placement order — printed on the sheet + list.
    const gmTags = grainMatchTags(nestResult)
    const rows: { no: number; sheet: number; cab: string; part: string; w: number; h: number; finW: number; finH: number; rotated: boolean; holes: number; comment: string | null; gm: string | null }[] = []
    const noByUid = new Map<string, number>()
    gen.forEach((g, si) => g.sheet.placements.forEach(pl => {
      const p = partByUid.get(pl.baseUid)!
      const no = rows.length + 1
      noByUid.set(pl.uid, no)
      rows.push({ no, sheet: si + 1, cab: p.cabinet_label, part: p.label, w: pl.rotated ? pl.h : pl.w, h: pl.rotated ? pl.w : pl.h,
        finW: p.w, finH: p.h, rotated: pl.rotated, holes: holesIn(pl, g.drills).length, comment: p.comment,
        gm: gmTags.has(pl.uid) ? grainMatchLine(gmTags.get(pl.uid)!) : null })
    }))

    // ── PDF ──
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const PW = 297, PH = 210, M = 10
    const roomsTxt = cfg.rooms?.join(', ') ?? 'All rooms'
    gen.forEach((g, si) => {
      if (si) doc.addPage()
      const { sheet } = g
      const { w: W, h: H } = sheet.stock
      const mat = sheet.materialId ? matById.get(sheet.materialId)?.name ?? '' : ''
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
      doc.text(`${snap.jobNumber ?? ''} ${snap.projectName.replace(snap.jobNumber ?? '', '').trim()}  ·  ${roomsTxt}`, M, M + 4)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5)
      const eff = (sheet.efficiency * 100).toFixed(0)
      doc.text(`${mat}  ·  Sheet ${si + 1} of ${gen.length}  ·  ${W} × ${H}  ·  ${sheet.placements.length} parts  ·  ${g.drills.length} holes  ·  ${eff}% used  ·  ${g.fileName}`, M, M + 10)
      doc.text(ds.replace(/(\d{4})(\d\d)(\d\d)/, '$3/$2/$1'), PW - M, M + 4, { align: 'right' })

      const top = M + 15
      const s = Math.min((PW - 2 * M) / W, (PH - top - M - 6) / H)
      const ox = M, oy = top
      const X = (x: number) => ox + x * s, Y = (y: number) => oy + (H - y) * s
      doc.setDrawColor(40); doc.setLineWidth(0.4); doc.rect(ox, oy, W * s, H * s, 'S')
      doc.setLineDashPattern([1.2, 1], 0); doc.setLineWidth(0.15); doc.setDrawColor(140)
      doc.rect(X(sheet.stock.trimLeft), Y(H - sheet.stock.trimTop), (W - sheet.stock.trimLeft - sheet.stock.trimRight) * s, (H - sheet.stock.trimTop - sheet.stock.trimBottom) * s, 'S')
      doc.setLineDashPattern([], 0)
      // Machine origin hint (sheet bottom-left).
      doc.setFontSize(6.5); doc.setTextColor(120); doc.text('0,0', ox + 0.6, oy + H * s - 0.8); doc.setTextColor(0)

      const outlines = outlinesFor(sheet)
      for (const pl of sheet.placements) {
        const p = partByUid.get(pl.baseUid)!
        const poly = outlines[pl.uid]
        doc.setDrawColor(20); doc.setLineWidth(0.3); doc.setFillColor(236, 240, 245)
        if (poly) {
          doc.setLineDashPattern([0.8, 0.8], 0); doc.setLineWidth(0.1); doc.rect(X(pl.x), Y(pl.y + pl.h), pl.w * s, pl.h * s, 'S')
          doc.setLineDashPattern([], 0); doc.setLineWidth(0.3)
          const pts = poly.map(q => [X(q.x), Y(q.y)] as [number, number])
          doc.lines(pts.slice(1).map((q, i) => [q[0] - pts[i][0], q[1] - pts[i][1]]), pts[0][0], pts[0][1], [1, 1], 'FD', true)
        } else doc.rect(X(pl.x), Y(pl.y + pl.h), pl.w * s, pl.h * s, 'FD')
        // Holes as small circles (true size, min 0.35 mm so 5 mm pins show).
        doc.setDrawColor(200, 40, 40); doc.setLineWidth(0.12)
        for (const hd of holesIn(pl, g.drills)) doc.circle(X(hd.x), Y(hd.y), Math.max(0.35, (hd as unknown as { diameter: number }).diameter / 2 * s), 'S')
        doc.setDrawColor(20)
        // Label: number big, then cabinet + part + cut size when it fits.
        const cx = X(pl.x + pl.w / 2), cy = Y(pl.y + pl.h / 2)
        const bw = pl.w * s - 1.5, bh = pl.h * s
        const no = String(noByUid.get(pl.uid))
        const cutW = pl.rotated ? pl.h : pl.w, cutH = pl.rotated ? pl.w : pl.h
        const lines = [`${p.cabinet_label}  ${p.label}`, `${Math.round(cutH * 10) / 10} × ${Math.round(cutW * 10) / 10}${pl.rotated ? '  ⟲' : ''}${p.grain_across ? ' grain across' : ''}`]
        const fit = (txt: string, max: number, min: number) => {
          let fs = max
          doc.setFontSize(fs)
          while (fs > min && doc.getTextWidth(txt) > bw) { fs -= 0.5; doc.setFontSize(fs) }
          return doc.getTextWidth(txt) <= bw ? fs : 0
        }
        doc.setFont('helvetica', 'bold')
        const nfs = Math.min(fit(no, 11, 5), bh / 0.3528 * 0.55)
        const detail = bh > 9 ? lines.map(l => { doc.setFont('helvetica', 'normal'); return fit(l.replace('  ⟲', ' (R)'), 7, 4.5) }) : [0, 0]
        const shown = detail.filter(f => f > 0).length
        const blockH = (nfs > 0 ? nfs * 0.3528 : 0) + shown * 2.8
        let ty = cy - blockH / 2 + (nfs > 0 ? nfs * 0.3528 * 0.8 : 0)
        if (nfs > 0) { doc.setFont('helvetica', 'bold'); doc.setFontSize(nfs); doc.text(no, cx, ty, { align: 'center' }) }
        doc.setFont('helvetica', 'normal')
        lines.forEach((l, i) => {
          if (!detail[i]) return
          ty += 2.8
          doc.setFontSize(detail[i]); doc.text(l.replace('  ⟲', ' (R)'), cx, ty, { align: 'center' })
        })
      }
      // Grain match blocks (z_grain_match G5): dashed outline in the group colour + tag.
      for (const b of nestResult.blocks ?? []) {
        const r = blockRectOn(sheet, b)
        if (!r) continue
        const hex = grainMatchColour(b).slice(1)
        const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
        const pad = 1.2
        doc.setDrawColor(...rgb); doc.setLineWidth(0.5); doc.setLineDashPattern([2, 1], 0)
        doc.rect(X(r.x) - pad, Y(r.y + r.h) - pad, r.w * s + 2 * pad, r.h * s + 2 * pad, 'S')
        doc.setLineDashPattern([], 0)
        const tag = `${b.name} ${b.direction === 'horizontal' ? 'grain across' : 'grain up'}${b.pieces > 1 ? `  ${b.piece}/${b.pieces}` : ''}`
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
        const tw = doc.getTextWidth(tag) + 2
        doc.setFillColor(...rgb); doc.rect(X(r.x) - pad, Y(r.y + r.h) - pad, tw, 3.4, 'F')
        doc.setTextColor(255); doc.text(tag, X(r.x) - pad + 1, Y(r.y + r.h) - pad + 2.5); doc.setTextColor(0)
        doc.setDrawColor(40); doc.setLineWidth(0.3); doc.setFont('helvetica', 'normal')
      }
      doc.setFontSize(7); doc.setTextColor(110)
      doc.text('Sizes are cut size, length (grain) × width.  (R) = turned 90° on the sheet.  "grain across" = grain runs along the width (horizontal grain match).  Red circles = drilling.', M, PH - M + 3)
      doc.setTextColor(0)
    })

    // Parts list.
    doc.addPage()
    const head = ['#', 'Sheet', 'Cabinet', 'Part', 'Cut L × W', 'Finished L × W', 'Holes', 'Grain match', 'Comment']
    const colX = [M, M + 10, M + 24, M + 54, M + 124, M + 160, M + 198, M + 212, M + 238]
    let y = M + 4
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
    doc.text(`Parts list — ${snap.jobNumber ?? ''}  ·  ${roomsTxt}  ·  ${rows.length} parts on ${gen.length} sheet(s)`, M, y)
    y += 8
    const header = () => { doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); head.forEach((h, i) => doc.text(h, colX[i], y)); doc.setLineWidth(0.2); doc.line(M, y + 1.2, PW - M, y + 1.2); y += 5.5; doc.setFont('helvetica', 'normal') }
    header()
    const r1 = (n: number) => String(Math.round(n * 10) / 10)
    for (const r of rows) {
      if (y > PH - M) { doc.addPage(); y = M + 4; header() }
      const cells = [String(r.no), String(r.sheet), r.cab, r.part, `${r1(r.h)} × ${r1(r.w)}`, `${r1(r.finH)} × ${r1(r.finW)}`, String(r.holes), r.gm ?? '', r.comment ?? '']
      cells.forEach((c, i) => doc.text(doc.splitTextToSize(c, (colX[i + 1] ?? PW - M) - colX[i] - 2)[0] ?? '', colX[i], y))
      y += 5
    }
    writeFileSync(join(outDir, 'sheets.pdf'), Buffer.from(doc.output('arraybuffer')))

    // ── Part labels (shared with optimiser Stage 7 — labels.ts) ──
    const { loadLabelLookups, buildAllLabels, labelsPdf, DEFAULT_LABEL_SETTINGS } = await import('../labels')
    const look = await loadLabelLookups(supabase, nestableParts, snap.projectName, matName)
    const drillsBySheet = new Map(gen.map(g => [g.sheet.index, g.drills]))
    const lab = await labelsPdf(buildAllLabels(nestResult, partByUid, drillsBySheet, deductEb, look, 'cut'), DEFAULT_LABEL_SETTINGS)
    writeFileSync(join(outDir, 'labels.pdf'), Buffer.from(lab.output('arraybuffer')))

    const summary = {
      job: snap.jobNumber, rooms: cfg.rooms, materials: cfg.materials, profile: prof?.name, deductEdgeband: deductEb,
      parts: rows.length, sheets: gen.map((g, i) => ({ n: i + 1, file: g.fileName, parts: g.sheet.placements.length, holes: g.drills.length, routes: g.routes.length, efficiency: Math.round(g.sheet.efficiency * 100) })),
      unplaced: nestResult.unplaced.map(u => u.label), notes, drillWarnings, gcodeErrors: blocking, gcodeWarnings: warned,
      zeroHoleParts: rows.filter(r => r.holes === 0).map(r => `${r.cab} ${r.part}`), rowsList: rows,
      grainBlocks: (nestResult.blocks ?? []).map(b => ({ name: b.name, piece: `${b.piece}/${b.pieces}`, fronts: b.memberUids.length, sheet: gen.findIndex(g => g.sheet.placements.some(p => b.memberUids.includes(p.uid))) + 1 })),
    }
    writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2))
    const { rowsList: _r, ...brief } = summary
    void _r
    console.log(JSON.stringify(brief, null, 2))
    lap(`done → ${outDir}`)
  }, 600_000)
})
