import { Material } from '@/src/lib/resolver/types'

// Placeholder materials — replace with DB-sourced values once material library is built

export const MAT_INTERIOR: Material = {
  id: 'default-interior',
  name: '18mm Whiteboard',
  DZ: 18,
  sheet_dx: 2400,
  sheet_dy: 1200,
  has_grain: false,
}

export const MAT_EXPOSED_INTERIOR: Material = {
  id: 'default-exposed-interior',
  name: '18mm Laminex White',
  DZ: 18,
  sheet_dx: 2400,
  sheet_dy: 1200,
  has_grain: false,
}

export const MAT_DOOR_FACE: Material = {
  id: 'default-door-face',
  name: '18mm Laminex White',
  DZ: 18,
  sheet_dx: 2400,
  sheet_dy: 1200,
  has_grain: true,
  grain_direction: 'vertical',
}

export const MAT_SHELF: Material = {
  id: 'default-shelf',
  name: '18mm Whiteboard',
  DZ: 18,
  sheet_dx: 2400,
  sheet_dy: 1200,
  has_grain: false,
}

export const MAT_TOEKICK_FACE: Material = {
  id: 'default-toekick-face',
  name: '18mm Laminex White',
  DZ: 18,
  sheet_dx: 2400,
  sheet_dy: 1200,
  has_grain: false,
}

export const MAT_TOEKICK_INTERIOR: Material = {
  id: 'default-toekick-interior',
  name: '18mm Whiteboard',
  DZ: 18,
  sheet_dx: 2400,
  sheet_dy: 1200,
  has_grain: false,
}

export const MAT_DRAWERBOX: Material = {
  id: 'default-drawerbox',
  name: '12mm HMR White',
  DZ: 12,
  sheet_dx: 2400,
  sheet_dy: 1200,
  has_grain: false,
}

export const DEFAULT_SLIDE_SIDE_DEDUCTION = 13  // Blum Legrabox
