import type { BtPartBands } from '@/src/lib/benchtopEdgeband'
import type { BenchtopInstance, BenchtopBuildMethod, BenchtopPartRole, BenchtopGrainDir, BenchtopScheduleRow, BenchtopEdgeProfile } from '@/src/lib/types'

export type { BenchtopPartRole, BenchtopGrainDir }

export interface BenchtopResolverInput {
  benchtop:         BenchtopInstance
  method:           BenchtopBuildMethod
  scheduleRows:     BenchtopScheduleRow[]
  boardMaterials:   Map<string, { name: string; dz: number }>
  surfaceMaterials: Map<string, { name: string; dz: number }>
  /** Edge-profile library by id (apron / waterfall generators, codes). */
  profiles?:        Map<string, BenchtopEdgeProfile>
  /** Base cabinet height cascade (room → job → shop); the top's underside unless height_mm overrides. */
  baseHeight?:      number
}

/** Order / quoting detail carried on a part (mainly outsourced supply items). */
export interface BenchtopPartMeta {
  area_m2?:     number
  shaped?:      boolean
  /** Lineal mm per edge profile code on this piece's exposed edges. */
  profiles?:    Record<string, number>
  cutouts?:     { w: number; h: number; round: boolean }[]
  waterfalls?:  number
  joins?:       BenchtopPartJoin[]
  /** Waterfall legs: how the leg meets the top. */
  waterfall_join?: 'butt' | 'mitre'
}
export interface BenchtopPartJoin { type: 'butt' | 'mitre'; length: number }

export interface ResolvedBenchtopPart {
  part_role:             BenchtopPartRole
  label:                 string
  length_mm:             number
  width_mm:              number
  thickness_mm:          number
  quantity:              number
  grain_direction:       BenchtopGrainDir | null
  material_id:           string | null
  material_name:         string | null
  benchtop_material_id:  string | null
  benchtop_material_name: string | null
  edgeband_id:           string | null
  supply_item:           boolean   // outsourced: report/order only, never cut list
  /** 1-based piece number when the top is split by joins (null = whole top / not per piece). */
  piece?:                number | null
  /** Shaped piece outline, mm, in the part's own frame (x = length, y = width). Null = plain rectangle. */
  outline?:              { x: number; y: number }[] | null
  meta?:                 BenchtopPartMeta | null
  /** Edge tape per side of the part (Phase 7). Null = no tape. */
  edgebands?:            BtPartBands | null
  /** Sink / cooktop cutouts, mm, part frame (as `outline`) — worktop + subtop panels. Null = none. */
  holes?:                { x: number; y: number }[][] | null
}
