// ============================================================
// Face Module Resolver
// Resolves face grid rows, columns, and zones (doors/drawers)
// ============================================================

import {
  CabinetInput, ConstructionRules, ResolverError,
  ResolvedFaceRow, ResolvedFaceCol, ResolvedFaceZone, ResolvedDoorProfile,
  FaceRowInput, FaceColInput, FaceZoneInput,
  edgeSidesToBanding, DEFAULT_EDGING, EdgingDefaults
} from './types'
import { resolveReveal, resolveFaceZ } from './mergeRules'
import { evaluateProfileOps } from '../doorProfile'

export interface FaceResolution {
  rows:   ResolvedFaceRow[]
  cols:   ResolvedFaceCol[]
  zones:  ResolvedFaceZone[]
  errors: ResolverError[]
}

// Locked sizes arrive as user-entered mm but reveals/gaps can be fractional,
// so compare fit with a tolerance rather than exactly.
const EPS = 1e-6
const round1 = (n: number) => Math.round(n * 10) / 10

export function resolveFace(
  cab: CabinetInput,
  r: ConstructionRules
): FaceResolution {
  const edging: Required<EdgingDefaults> = { ...DEFAULT_EDGING, ...(r.EDGING ?? {}) }
  const ebId = cab.door_edgeband_id

  const errors: ResolverError[] = []
  // Faces sit above the toe kick — but only when this cabinet actually has its own
  // kick. A kick-detached member (has_toekick=false) carries no kick, so its faces
  // run flush to the carcase bottom (its kick lives in the standalone kick assembly).
  const TK  = (cab.assembly_class === 'wall' || cab.assembly_class === 'wall_corner' || !cab.has_toekick) ? 0 : r.TOEH
  const DX  = cab.DX
  const DY  = cab.DY
  const DZ  = cab.DZ
  const fid = cab.door_material.id
  const FT  = cab.door_material.DZ   // face material thickness

  // ── Resolve reveals ───────────────────────────────────────────
  const revL = resolveReveal('left',  cab.left_neighbour,  r)
  const revR = resolveReveal('right', cab.right_neighbour, r)
  const revT = r.REVT
  const revB = r.REVB

  // ── Face opening total dimensions ─────────────────────────────
  const faceW = DX - revL - revR
  const faceH = DY - TK - revT - revB

  if (faceW <= 0) {
    errors.push({ code: 'FACE_TOO_NARROW', message: `Face opening width is ${faceW}mm`, part: 'face' })
    return { rows: [], cols: [], zones: [], errors }
  }
  if (faceH <= 0) {
    errors.push({ code: 'FACE_TOO_SHORT', message: `Face opening height is ${faceH}mm`, part: 'face' })
    return { rows: [], cols: [], zones: [], errors }
  }

  const grid = cab.face_grid
  const nRows = grid.rows.length
  const nCols = grid.cols.length

  if (nRows === 0 || nCols === 0) {
    errors.push({ code: 'FACE_GRID_EMPTY', message: 'Face grid has no rows or columns defined', part: 'face' })
    return { rows: [], cols: [], zones: [], errors }
  }

  // ── Resolve row heights ───────────────────────────────────────
  // Total height available after gaps between rows
  const totalRowGaps = (nRows - 1) * r.GAPR
  const availableH   = faceH - totalRowGaps

  // Sum of locked heights
  const lockedH = grid.rows
    .filter(row => row.height_locked && row.height !== undefined)
    .reduce((sum, row) => sum + row.height!, 0)

  // Number of unlocked rows
  const unlockedRowCount = grid.rows.filter(row => !row.height_locked || row.height === undefined).length
  const equalRowH = unlockedRowCount > 0
    ? (availableH - lockedH) / unlockedRowCount
    : 0

  // Test the locked total directly rather than the derived equal share: when every
  // row is locked there is no share to go negative, so `equalRowH < 0` would never
  // fire and the rows would stack straight past the top of the cabinet.
  if (lockedH > availableH + EPS) {
    errors.push({
      code: 'FACE_ROWS_OVERFLOW',
      message: `Locked row heights (${round1(lockedH)}mm) exceed the ${round1(availableH)}mm available face height`,
      part: 'face_rows',
    })
    return { rows: [], cols: [], zones: [], errors }
  }

  const resolvedRows: ResolvedFaceRow[] = grid.rows.map(row => ({
    row_index:     row.row_index,
    height:        (row.height_locked && row.height !== undefined) ? row.height : equalRowH,
    height_locked: row.height_locked,
  }))

  // ── Resolve column widths ─────────────────────────────────────
  // Total width available after gaps between columns
  const totalColGaps  = (nCols - 1) * (r.GAPC / 2)   // GAPC is total gap, shared between adjacent zones
  const availableW    = faceW - totalColGaps

  const lockedW = grid.cols
    .filter(col => col.width_locked && col.width !== undefined)
    .reduce((sum, col) => sum + col.width!, 0)

  const unlockedColCount = grid.cols.filter(col => !col.width_locked || col.width === undefined).length
  const equalColW = unlockedColCount > 0
    ? (availableW - lockedW) / unlockedColCount
    : 0

  // Same reasoning as the row guard above — an all-locked grid never produces a
  // negative equal share, so test the locked total against what's available.
  if (lockedW > availableW + EPS) {
    errors.push({
      code: 'FACE_COLS_OVERFLOW',
      message: `Locked column widths (${round1(lockedW)}mm) exceed the ${round1(availableW)}mm available face width`,
      part: 'face_cols',
    })
    return { rows: [], cols: [], zones: [], errors }
  }

  const resolvedCols: ResolvedFaceCol[] = grid.cols.map(col => ({
    col_index:     col.col_index,
    width:         (col.width_locked && col.width !== undefined) ? col.width : equalColW,
    width_locked:  col.width_locked,
  }))

  // ── Build row/col offset maps ─────────────────────────────────
  // Y offsets (from cabinet bottom, working upward from faceY0)
  const rowOffsets: number[] = []
  let yOffset = TK + revB
  for (const row of resolvedRows) {
    rowOffsets.push(yOffset)
    yOffset += row.height + r.GAPR
  }

  // X offsets (from cabinet left, working rightward from revL)
  const colOffsets: number[] = []
  let xOffset = revL
  for (const col of resolvedCols) {
    colOffsets.push(xOffset)
    xOffset += col.width + r.GAPC / 2
  }

  // ── Resolve zones ─────────────────────────────────────────────
  const resolvedZones: ResolvedFaceZone[] = []

  for (const zone of grid.zones) {
    const row = resolvedRows.find(r => r.row_index === zone.row_index)
    const col = resolvedCols.find(c => c.col_index === zone.col_index)

    if (!row || !col) {
      errors.push({
        code: 'ZONE_MISSING_ROW_COL',
        message: `Zone [${zone.row_index},${zone.col_index}] references missing row or column`,
        part: 'face_zone',
      })
      continue
    }

    // Skip 'open' zones — no part generated
    if (zone.face_type === 'open') continue

    const zoneW  = col.width
    const zoneH  = row.height
    const zoneX  = colOffsets[zone.col_index]
    const zoneY  = rowOffsets[zone.row_index]

    // Door style (zone → room → job cascade resolved in loadCabinetInput).
    // Applies to doors, drawer fronts and false panels alike; a blank's
    // catalogue thickness overrides the face material thickness.
    const door = cab.resolved_doors?.[`${zone.row_index}_${zone.col_index}`]
    const ft   = door ? door.thickness_mm : FT

    // Evaluate the routing profile against the resolved panel dimensions.
    let doorProfile: ResolvedDoorProfile | null = null
    if (door?.profile_type && door.ops.length > 0) {
      doorProfile = {
        profile_type: door.profile_type,
        ops: evaluateProfileOps(door.ops, {
          w: zoneW, h: zoneH, thickness: ft,
          toolDiameter: door.ops[0]?.tool_diameter_mm ?? 0,
        }),
      }
    }

    // Face Z position — per-zone override takes priority
    const zoneZ = resolveFaceZ(DZ, ft, r, zone.face_ins, zone.face_buf)

    resolvedZones.push({
      row_index:   zone.row_index,
      col_index:   zone.col_index,
      face_type:   zone.face_type,
      hinge_side:  zone.hinge_side,

      // Dimensions — a front panel reads naturally: DX = width (left↔right,
      // cabinet X), DY = height (up↕down, cabinet Y), DZ = thickness. Every
      // face-zone consumer follows this (see partFootprint.zoneFrame).
      DX: zoneW,    // width of zone (X extent)
      DY: zoneH,    // height of zone (Y extent)
      DZ: ft,       // face/door material thickness (door catalogue overrides face material)

      // Position
      X:  zoneX,
      Y:  zoneY,
      Z:  zoneZ,

      AX: 0, AY: 0, AZ: 0,

      // Door colour's linked board wins over the carcass schedule's door_face
      // material; colours without a board link fall back to the schedule.
      material_id: door?.colour_material_id ?? fid,
      // Door style (when assigned) supplies colour-matched tape + which edges to
      // band; otherwise fall back to the carcass schedule + construction EDGING.
      edge_band:   edgeSidesToBanding(door?.edge_band_sides ?? edging[zone.face_type], door?.edgeband_id ?? ebId),

      // Door style results (undefined/null on non-door or unstyled zones)
      door_style_id:   door?.style_id ?? null,
      door_profile_id: door?.profile_id ?? null,
      door_profile:    doorProfile,
    })
  }

  // ── Validation ────────────────────────────────────────────────
  // Check that all zones are accounted for
  const expectedZoneCount = nRows * nCols
  const definedZoneCount  = grid.zones.length
  if (definedZoneCount < expectedZoneCount) {
    errors.push({
      code: 'FACE_GRID_INCOMPLETE',
      message: `Grid has ${expectedZoneCount} cells but only ${definedZoneCount} zones defined`,
      part: 'face_grid',
    })
  }

  return {
    rows:   resolvedRows,
    cols:   resolvedCols,
    zones:  resolvedZones,
    errors,
  }
}
