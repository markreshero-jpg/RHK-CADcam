import type { BenchtopInstance, BenchtopBuildMethod, BenchtopPartRole, BenchtopGrainDir, BenchtopScheduleRow } from '@/src/lib/types'

export type { BenchtopPartRole, BenchtopGrainDir }

export interface BenchtopResolverInput {
  benchtop:         BenchtopInstance
  method:           BenchtopBuildMethod
  scheduleRows:     BenchtopScheduleRow[]
  boardMaterials:   Map<string, { name: string; dz: number }>
  surfaceMaterials: Map<string, { name: string; dz: number }>
}

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
}
