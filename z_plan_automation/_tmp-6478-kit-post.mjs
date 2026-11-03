// RHK6478 Kitchen post-draw (Mark Q&A 2026-11-03):
// room 2pac + sharknose, Timbergrain insides, oven tower kit (1 drawer, 2 x 60 ovens, cupboard), fridge / freezer no handle yet,
// kicks joined (D/W opening returns), overhead under panel set back 20, shadowlines (break on the carcass line, returns),
// tops (920: 20 + MA60), island seating back panel, fixtures (stand-ins renamed).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'dd6c9440-6664-4e87-8ea9-4d88b7a9b1b6', WIP = 'cb47d462-90eb-4ba0-8e6e-ca4d978628ae'
const PAC = 'bd2b9178-5b77-4a52-b7a1-cc3765ed4bb4', PAC_TBC = '827dfe38-7cb7-4c02-aa87-6916b09876f5', PAC_BOARD = 'b07a7e40-facd-4cdf-8856-60712e940b44'
const SHARK = '243a2e18-5966-409f-8fec-f056006d5a61', PTO = '9440a3f0-63db-4085-9042-1c728298b49a', MA60 = '59a7169d-761a-414d-82b0-bd8ea7123853'
const TEAK = '67ecbeff'   // LX Colour 16mm - Sublime Teak (Chalk) prefix, resolved below
const mode = process.argv[2] ?? 'all'
const cabsNow = async () => chk('cabs', await sb.from('cabinet_instances').select('id,label,hardware_overrides,face_grid,internal_grid,rule_overrides,pos_x,pos_y,pos_z,dx,dy,dz,cabinet_definition_id,created_at').eq('room_id', R))
const upd = async (label, patch) => { const c = (await cabsNow()).find(c => c.label === label); if (!c) throw new Error('no ' + label); chk(label, await sb.from('cabinet_instances').update(patch).eq('id', c.id)); return c }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1500); return r }
try {
  // ── 1. room: 2pac + sharknose, tall / wall class sizes for the kit ──
  if (mode === 'all' || mode === 'room') {
    const teak = chk('teak', await sb.from('materials').select('id,name').ilike('name', '%Sublime Teak%')).find(m => m.id.startsWith(TEAK))
    chk('room', await sb.from('rooms').update({ base_door_style_id: PAC, base_door_colour_id: PAC_TBC, tall_door_style_id: PAC, tall_door_colour_id: PAC_TBC,
      wall_door_style_id: PAC, wall_door_colour_id: PAC_TBC, handle_schedule_id: SHARK,
      class_dimension_defaults: { tall: { dy: 2672, dz: 630 }, base: { dy: 900, dz: 630 }, wall: { dy: 1142, dz: 400 } } }).eq('id', R))
    chk('rm del', await sb.from('room_materials').delete().eq('room_id', R))
    chk('rm', await sb.from('room_materials').insert(['base', 'tall', 'wall'].map(c => ({ room_id: R, assembly_class: c, material_role: 'exposed', material_id: PAC_BOARD }))))
    // Timbergrain insides: pocket unit, its overhead, the side unit open bay (exposed role -> Teak)
    for (const l of ['TC-07', 'WC-01', 'BC-11']) await upd(l, { material_overrides: { exposed: teak.id } })
    // PTO over the fridge; fridge / freezer doors: no handle until the Momo Barra DBR 288 is in the library
    await upd('WC-05', { hardware_overrides: { handle_schedule_id: PTO } })
    for (const l of ['TC-04', 'TC-05']) {
      const c = (await cabsNow()).find(c => c.label === l)
      const fg = structuredClone(c.face_grid); fg.zones = fg.zones.map(z => ({ ...z, handle_id: 'none' }))
      chk(l, await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', c.id))
    }
    console.log('room done, teak', teak.name)
  }
  await open()

  // ── 2. oven tower kit: TEPK | 600 | TEPK at 30, then 1 drawer 100-500, 2 x 60 ovens 500-1716.5, cupboard to 2672 ──
  if (mode === 'all' || mode === 'kit') {
    const before = new Set((await cabsNow()).map(c => c.id))
    console.log('kit', JSON.stringify(await api('placeCabinet', { def: 'WOT-COMBI', wall: 'Wall 2', offset: 30 })))
    await sleep(4000)
    const kit = (await cabsNow()).filter(c => !before.has(c.id)).sort((a, b) => a.created_at.localeCompare(b.created_at))
    console.log('kit members', kit.map(c => `${c.label} ${c.dx}x${c.dy} z${c.pos_z}`).join(' | '))
    const defs = chk('defs', await sb.from('cabinet_definitions').select('id,name').in('id', kit.map(c => c.cabinet_definition_id)))
    const nameOf = c => defs.find(d => d.id === c.cabinet_definition_id)?.name
    const dr = kit.find(c => nameOf(c) === 'D2-LL'), core = kit.find(c => nameOf(c) === 'WOT-COMBI'), up = kit.find(c => nameOf(c) === 'W2D')
    chk('dr', await sb.from('cabinet_instances').update({ dy: 500,
      face_grid: { cols: [{ col_index: 0, width_locked: false }], rows: [{ row_index: 0, height_locked: false }],
        zones: [{ col_index: 0, row_index: 0, face_type: 'drawer_face', hinge_side: 'left' }] },
      notes: '# 3 one drawer under the ovens, 100-500' }).eq('id', dr.id))
    const coreDy = 600 + 16.5 + 600
    chk('core', await sb.from('cabinet_instances').update({ pos_z: 500, dy: coreDy,
      notes: '# 3 oven core: Neff B69FS5CY0A + B69VS73Y0A 60 x 60 ovens stacked (Z912BDY0 120 FlexDesign kit), 500-1716.5, niches 600 (spec 585-595 x 560-568)' }).eq('id', core.id))
    for (const p of chk('core parts', await sb.from('cabinet_custom_parts').select('id,name,dy').eq('cabinet_instance_id', core.id)))
      if (/Combi Cleat/.test(p.name)) chk(p.name, await sb.from('cabinet_custom_parts').update({ dy: 600, name: p.name.replace('Combi', 'Oven 2') }).eq('id', p.id))
      else if (/Combi Shelf/.test(p.name)) chk(p.name, await sb.from('cabinet_custom_parts').update({ name: 'Oven 2 Shelf' }).eq('id', p.id))
    chk('up', await sb.from('cabinet_instances').update({ dy: 2672 - 500 - coreDy, notes: '# 13 cupboard over the ovens 1716.5-2672, PTO pair, 1 adj (under panel)',
      hardware_overrides: { ...(up.hardware_overrides ?? {}), handle_schedule_id: PTO } }).eq('id', up.id))
    await open()
    for (const c of [dr, core, up]) console.log(c.label, JSON.stringify(await api('updateCabinet', c.label, { dz: c.dz })))
  }

  // ── 3. kicks: join the runs of 2+; the D/W opening gets mitred returns ──
  if (mode === 'all' || mode === 'kick') {
    await open()
    for (const l of ['BC-02', 'TC-04', 'BC-05', 'BC-08', 'BC-10']) { console.log('join', l, JSON.stringify(await api('joinKicks', l))); await sleep(2500) }
    const cabs = await cabsNow()
    const kickOf = l => cabs.find(c => c.label === l)
    const runs = chk('runs', await sb.from('cabinet_instances').select('id,label,kick_run_id,rule_overrides,pos_x,dx').eq('room_id', R).eq('is_kick_assembly', true))
    console.log('kick assemblies', JSON.stringify(runs.map(r => [r.label, r.pos_x, r.dx])))
    // island: BC-05/06 run ends at the D/W (its high-offset end = right), BC-08/09 starts at it (left)
    const runFor = l => runs.find(r => r.kick_run_id && r.kick_run_id === kickOf(l)?.kick_run_id)
    // need kick_run_id on members
    const mem = chk('mem', await sb.from('cabinet_instances').select('label,kick_run_id').eq('room_id', R).in('label', ['BC-05', 'BC-08']))
    for (const [l, side] of [['BC-05', 'TOERETR'], ['BC-08', 'TOERETL']]) {
      const k = runs.find(r => r.kick_run_id === mem.find(m => m.label === l)?.kick_run_id)
      if (!k) { console.log('no kick run for', l); continue }
      chk(k.label, await sb.from('cabinet_instances').update({ rule_overrides: { ...(k.rule_overrides ?? {}), [side]: true } }).eq('id', k.id))
      console.log(k.label, side)
    }
    await open()
    for (const k of runs) console.log(k.label, JSON.stringify(await api('updateCabinet', k.label, { dz: 630 })))
  }

  // ── 4. overheads over the cooktop bench: one under panel, set back 20 ──
  if (mode === 'all' || mode === 'under') {
    await open()
    const before = new Set((await cabsNow()).map(c => c.label))
    console.log('under', JSON.stringify(await api('addUnderPanel', ['WC-02', 'WC-03', 'WC-04'])))
    await sleep(3000)
    const wup = (await cabsNow()).find(c => !before.has(c.label))
    console.log('wup', wup?.label, JSON.stringify(await api('updateCabinet', wup.label, { dz: 380 })))
    await upd(wup.label, { notes: '18 under panel under the cooktop overheads, set back 20 (finger grab); rangehood cut-out 824 x 330 TBC' })
  }

  // ── 5. shadowlines: 0-648 (630, R return 290) | 648-3648 (400) | 3648-4848 (630, L return 290 + R seen return 630) ──
  if (mode === 'all' || mode === 'sl') {
    await open()
    const before = new Set((await cabsNow()).map(c => c.label))
    for (const [off, dx, dz] of [[0, 648, 630], [648, 3000, 400], [3648, 1200, 630]]) {
      console.log('BHSL', off, JSON.stringify(await api('placeCabinet', { def: 'BHSL', wall: 'Wall 2', offset: off, dx })))
      await sleep(2500)
    }
    const sl = (await cabsNow()).filter(c => !before.has(c.label)).sort((a, b) => a.pos_x - b.pos_x)
    const bh = (dz, l, r) => ({ kind: 'shadowline', width: 60, front: 'carcase', cleat: false, auto_h: false,
      left: { on: !!l, depth: l || dz, joint: 'mitre' }, right: { on: !!r, depth: r || dz, joint: 'mitre' }, bottom: { on: false, depth: dz, joint: 'mitre' } })
    const spec = [[630, 0, 290, '18 2pac shadowline over the oven tower, 2672-2690, right return 290 (steps to 400)'],
      [400, 0, 0, '18 2pac shadowline over the pocket unit + overheads, runs over the panels, 2672-2690'],
      [630, 290, 630, '18 2pac shadowline over the fridge / freezer overhead, left return 290, right return full depth (seen end), 2672-2690']]
    for (const [i, c] of sl.entries()) {
      const [dz, l, r, note] = spec[i]
      chk(c.label, await sb.from('cabinet_instances').update({ dy: 18, dz, bulkhead: bh(dz, l, r), notes: note }).eq('id', c.id))
    }
    await open()
    for (const c of sl) console.log(c.label, JSON.stringify(await api('updateCabinet', c.label, { dy: 18 })))
  }

  // ── 6. island seating back panel: 18 substrate on its own island line 445 off the cabinet backs (1095 from the fronts) ──
  if (mode === 'all' || mode === 'back') {
    await open()
    const w = await api('drawWall', { x: 1290, y: 2845, length: 2542, angle: 0, type: 'island', detached: true })
    console.log('wall', JSON.stringify(w))
    await sleep(2000); await open()
    const st = await api('getState')
    const line = st.walls.find(x => Math.abs(x.y - 2845) < 1 && Math.abs(x.x - 1290) < 1)
    console.log('back line', JSON.stringify(line))
    const before = new Set((await cabsNow()).map(c => c.label))
    console.log(JSON.stringify(await api('placeCabinet', { def: 'IBPF', wall: line.id, offset: 0, dx: 2542 })))
    await sleep(3000)
    const ib = (await cabsNow()).find(c => !before.has(c.label))
    await upd(ib.label, { dy: 900, dz: 18, notes: 'Island seating-side back panel, 18 raw substrate for the tiler (tiled by others), 1095 behind the cabinet fronts, from the waterfall to the curved end. Curved substrate end R~300 into the BC-04 end panel: TO DETAIL' })
    await open(); console.log(ib.label, JSON.stringify(await api('updateCabinet', ib.label, { dy: 900 })))
  }

  // ── 7. tops: back run 666-3630 (cooktop), island 3200 x 1400 rounded SE corner R550, 60 mitred waterfall west ──
  if (mode === 'all' || mode === 'tops') {
    const sched = chk('sched', await sb.from('benchtop_instances').select('benchtop_schedule_id').eq('room_id', WIP).limit(1).single()).benchtop_schedule_id
    const walls = chk('walls', await sb.from('walls').select('id,name').eq('room_id', R)), W = Object.fromEntries(walls.map(w => [w.name, w.id]))
    chk('top del', await sb.from('benchtop_instances').delete().eq('room_id', R))
    const A = { wall: false, profile_id: MA60 }
    const line = (p0, p1, edge) => ({ type: 'line', p0, p1, edge })
    const ins = (label, wall, segs, notes) => sb.from('benchtop_instances').insert({ room_id: R, label, wall_id: wall, wall_side: 'face', height_mm: 900, benchtop_schedule_id: sched, notes,
      polygon: segs.map(s => s.p0), edge_tags: [], join_types: [], arc_segments: [], cutout_polygons: [], joins: [], segments: segs })
    const b = [{ x: 666, y: 0 }, { x: 3630, y: 0 }, { x: 3630, y: 650 }, { x: 666, y: 650 }]
    chk('top1', await ins('Benchtop 1', W['Wall 2'], [line(b[0], b[1], { wall: true }), line(b[1], b[2], { wall: true }), line(b[2], b[3], A), line(b[3], b[0], { wall: true })],
      '60 finished: 20mm stone TBA + 60 mitred apron, 2964 x 650 from the oven tower panel to the fridge panel, top 920 AFF. Neff T68YYY4C0H 80 induction (cut-out 750-780 x 490-500) centred on the drawer joint. Pocket-door unit stands on it 666-1666. Stone splashback TBC.'))
    const R5 = 550
    const segs = [
      line({ x: 1230, y: 1750 }, { x: 4430, y: 1750 }, A),
      line({ x: 4430, y: 1750 }, { x: 4430, y: 3150 - R5 }, A),
      { type: 'arc', p0: { x: 4430, y: 3150 - R5 }, p1: { x: 4430 - R5, y: 3150 }, rx: R5, ry: R5, largeArc: 0, sweep: 1, edge: A },
      line({ x: 4430 - R5, y: 3150 }, { x: 1230, y: 3150 }, A),
      line({ x: 1230, y: 3150 }, { x: 1230, y: 1750 }, { wall: false, profile_id: MA60, waterfall: true }),
    ]
    chk('top2', await ins('Island', W['Wall 5'], segs,
      '60 finished: 20mm stone TBA + 60 mitred apron all round, 3200 x 1400, top 920 AFF. 60 mitred WATERFALL END to the floor at the west end. Rounded corner R~550 at the seating / curved end (to confirm). Meir MKSP-S380440 380 x 440 U/M sink + Piccola MK17 mixer on the sink cupboard centre. 4 stools along 2700, ~300 overhang.'))
    console.log('tops done')
  }

  // ── 8. fixtures (catalogue stand-ins renamed to the scheduled models) ──
  if (mode === 'all' || mode === 'fx') {
    const walls = chk('walls', await sb.from('walls').select('id,name').eq('room_id', R)), W = Object.fromEntries(walls.map(w => [w.name, w.id]))
    const cabs = await cabsNow(), id = l => cabs.find(c => c.label === l)?.id
    const keep = Object.keys(chk('ds', await sb.from('room_fixtures').select('*').eq('room_id', WIP).limit(1))[0])
    const fromCat = async (catId, over) => {
      const c = chk('cat', await sb.from('fixture_catalog').select('*').eq('id', catId).single())
      const row = Object.fromEntries(Object.entries(c).filter(([k]) => keep.includes(k) && !['id', 'created_at', 'updated_at'].includes(k)))
      return { ...row, catalog_id: catId, room_id: R, link_x: 0, link_z: 0, link_rot: 0, cabinet_id: null, hinge_side: 'left', swing: 'in', ...over }
    }
    chk('fx del', await sb.from('room_fixtures').delete().eq('room_id', R))
    // island (rot 180: x = east edge, y = south / back edge); sink cupboard BC-08 x 1740-2640, centre 2190; cabinet backs y 2400
    const SX = 2190
    // back wall (rot 0: x = west edge, y = north / back edge)
    const rows = [
      await fromCat('ab1c3583-04c1-4105-aa8c-8cf2c54574a5', { name: 'Meir MKSP-S380440 380 x 440 U/M sink, brushed nickel (drawn as Abi Ohelu 380)', brand: 'Meir', model_no: 'MKSP-S380440-PVDBN', rotation: 180, wall_id: W['Wall 5'], x: SX + 190, y: 2400 - 325 + 220, z: 900 - 205, bench_drop: 225 }),
      await fromCat('c8170123-0e37-437c-a3d0-36e091b5c589', { name: 'Meir Piccola MK17 kitchen mixer, brushed nickel (drawn as Abi pull-out)', brand: 'Meir', model_no: 'MK17-PVDBN', rotation: 180, wall_id: W['Wall 5'], x: SX + 58.5, y: 2400 - 20, z: 920 }),
      await fromCat('e6e5b580-3602-4897-9f68-63b991f10d13', { name: 'Bosch SMV6HCX03A integrated D/W (drawn as generic 600) - 25 packer', brand: 'Bosch', model_no: 'SMV6HCX03A', rotation: 180, wall_id: W['Wall 5'], width: 598, depth: 550, height: 815, x: 4430 - 1190 - 1, y: 1770 + 550, z: 25 }),
      await fromCat('b018e3b6-2c86-4f69-b5ce-de4b567cecaa', { name: 'Neff T68YYY4C0H 80 Flex induction (drawn as induction 900)', brand: 'Neff', model_no: 'T68YYY4C0H', rotation: 0, wall_id: W['Wall 2'], width: 834, depth: 527, x: 2657 - 417, y: 650 - 50 - 527, z: 920 }),
      await fromCat('2d1a4f6c-d69d-4c06-8ea4-a430de4e6800', { name: 'Neff B69FS5CY0A 60 oven with steam (generic 600)', brand: 'Neff', model_no: 'B69FS5CY0A', rotation: 0, wall_id: W['Wall 2'], width: 596, depth: 548, height: 595, x: 50, y: 650 - 20 - 548, z: 500 }),
      await fromCat('2d1a4f6c-d69d-4c06-8ea4-a430de4e6800', { name: 'Neff B69VS73Y0A 60 oven with added steam (generic 600)', brand: 'Neff', model_no: 'B69VS73Y0A', rotation: 0, wall_id: W['Wall 2'], width: 596, depth: 548, height: 595, x: 50, y: 650 - 20 - 548, z: 500 + 600 + 16.5 }),
      await fromCat('b761a460-7496-4d25-bfcb-579e90840e61', { name: 'Microwave model TBC (generic 600 x 450) on the 1550 shelf', rotation: 0, wall_id: W['Wall 2'], width: 520, depth: 400, height: 310, x: 666 + 240, y: 418 - 20 - 400, z: 1550 }),
    ]
    for (const f of rows) console.log(JSON.stringify(chk('fx', await sb.from('room_fixtures').insert(f).select('id,name,x,y'))[0]))
    // link the D/W to its front (floor mount never auto-links): centre (2940.5, 2045) from BC-07 origin (pos), x (-1,0), perp (0,-1)
    const dw = (await cabsNow()).find(c => c.label === 'BC-07')
    const f = chk('dwf', await sb.from('room_fixtures').select('id,x,y,width,depth').eq('room_id', R).ilike('name', 'Bosch%').single())
    const cx = f.x - f.width / 2, cy = f.y - f.depth / 2
    chk('link', await sb.from('room_fixtures').update({ cabinet_id: dw.id, link_x: Math.round((dw.pos_x - cx) * 10) / 10, link_z: Math.round((dw.pos_y - cy) * 10) / 10, link_rot: 0 }).eq('id', f.id))
    await open()
    const st = await api('getState')
    console.log(JSON.stringify(st.fixtures.map(f => [f.name.slice(0, 24), f.x, f.y, f.cabinet, f.clash])))
  }

  await open()
  const st = await api('getState')
  for (const c of st.cabinets) console.log(c.label, c.wall, c.offset, c.dx, c.dy, c.dz, c.class)
  console.log('issues', JSON.stringify((await api('getIssues')).filter(i => i.errors.length || i.warnings.length)))
} finally { await browser.close() }
