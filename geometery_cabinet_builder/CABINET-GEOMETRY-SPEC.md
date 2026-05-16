# RHK-CADcam — Cabinet Geometry Specification
# For Claude Code — implement this exactly as described
# All measurements in millimetres

---

## COORDINATE SYSTEM

```
Cabinet origin = bottom-left-BACK corner (0, 0, 0)

+X = moves RIGHT
+Y = moves UP  
+Z = moves FORWARD (toward front of cabinet / toward viewer)

Cabinet front face sits at Z = Cabinet.DZ
Cabinet back face sits at  Z = 0
Cabinet left face sits at  X = 0
Cabinet right face sits at X = Cabinet.DX
Cabinet bottom sits at     Y = 0
Cabinet top sits at        Y = Cabinet.DY
```

Every part has 9 values:
```
DX  = extent in cabinet Z direction (depth of cabinet = width of panel on CNC sheet)
DY  = extent in cabinet X direction (width or height of panel)
DZ  = ALWAYS @material.DZ (material thickness — from material record, never hardcoded)
X   = cabinet X position of part's back-left-bottom corner
Y   = cabinet Y position
Z   = cabinet Z position (distance from back of cabinet)
AX  = rotation around X axis (degrees, usually 0)
AY  = rotation around Y axis (degrees, usually 0)
AZ  = rotation around Z axis (degrees, usually 0)
```

---

## MASTER VARIABLES

These are the cabinet-level inputs everything derives from:

```
Cabinet.DX  = overall width mm
Cabinet.DY  = overall height mm (INCLUDES toe kick)
Cabinet.DZ  = overall depth mm
T           = @material.DZ (carcass material thickness — from material record)
TF          = @toekick_face_material.DZ (toe kick face material thickness)
TI          = @toekick_interior_material.DZ (toe kick interior material thickness)
```

Construction method variables (defaults shown):
```
TOEH    = 150    toe kick height mm
TOE_TYPE = 'ladder'  'ladder' | 'leg' | 'none'
TOESP   = 450    spreader spacing mm
TOESCF  = 40     toe scribe front — how far kick is set back from cabinet front
TOESCB  = 0      toe scribe back
TOESCL  = 0      toe scribe left
TOESCR  = 0      toe scribe right
SCRBK   = 0      case scribe back
SCRBT   = 0      case scribe bottom
SCRL    = 0      case scribe left
SCRR    = 0      case scribe right
SCRT    = 0      case scribe top
TOP_TYPE = 'front_rail'  'full_top' | 'front_rail' | 'double_rail' | 'none'
RD      = 100    rail depth mm (front-to-back dimension of top rail)
ADJSB_F = 10     adjustable shelf setback front mm
ADJSB_B = 0      adjustable shelf setback back mm
ADJSL   = 1      adjustable shelf clearance left mm
ADJSR   = 1      adjustable shelf clearance right mm
FIXSB_F = 0      fixed shelf setback front mm
FIXSB_B = 0      fixed shelf setback back mm
IDCL    = 2      inner drawer clearance left mm
IDCR    = 2      inner drawer clearance right mm
IDRUN   = 450    inner drawer runner depth mm
REVT    = 4      reveal top mm
REVB    = 0      reveal bottom mm
REVL    = 1      reveal left (when adjacent to another cabinet)
REVR    = 1      reveal right (when adjacent to another cabinet)
REVENDL = 2      reveal left (when adjacent to wall or end panel)
REVENDR = 2      reveal right (when adjacent to wall or end panel)
GAPC    = 2      centre gap between face zones (total — 1mm each side)
GAPR    = 2      gap between face rows (vertical)
FACBUF  = 2      face buffer pad — door back face protrudes this far from carcass front
FACINS  = 0      face inset depth (0 = overlay mode, positive = inset)
```

---

## DERIVED REFERENCE DIMENSIONS

Calculate these before resolving any parts:

```typescript
// Toe kick height (0 for wall cabinets)
const TK = (assembly_class === 'wall' || toe_type === 'none') ? 0 : TOEH

// Internal opening dimensions
const intW = Cabinet.DX - (2 * T) - SCRL - SCRR          // internal width
const intH = Cabinet.DY - TK - (2 * T)                    // internal height (to underside of top rail)
const intD = Cabinet.DZ - SCRBK - T                       // internal depth

// Face opening dimensions
const revL_resolved = (left_neighbour === 'cabinet') ? REVL : REVENDL
const revR_resolved = (right_neighbour === 'cabinet') ? REVR : REVENDR
const faceW = Cabinet.DX - revL_resolved - revR_resolved  // face opening width
const faceH = Cabinet.DY - TK - REVT - REVB               // face opening height

// Face Z position
// Overlay mode (FACINS=0): door back face sits FACBUF proud of carcass front
// Inset mode (FACINS>0):   door front face sits FACINS inside carcass front
const faceZ = FACINS > 0
  ? Cabinet.DZ - FACINS - door_material.DZ   // inset
  : Cabinet.DZ + FACBUF                       // overlay (DEFAULT)
```

---

## MODULE 1 — CASE (CARCASS)

Construction method: sides sit OUTSIDE the bottom panel (frameless EU standard)

### LEFT SIDE
```
DX = Cabinet.DZ                    full cabinet depth
DY = Cabinet.DY - TK               full height less toe kick
DZ = T                             material thickness

X  = 0                             flush with left edge
Y  = TK                            sits above toe kick
Z  = 0                             flush with back of cabinet
AX = AY = AZ = 0
```

### RIGHT SIDE
```
DX = Cabinet.DZ
DY = Cabinet.DY - TK
DZ = T

X  = Cabinet.DX - T               offset from left by cabinet width less one thickness
Y  = TK
Z  = 0
AX = AY = AZ = 0
```

### BOTTOM PANEL
Sits BETWEEN the two sides (sides are outside):
```
DX = Cabinet.DZ                    full cabinet depth
DY = Cabinet.DX - (2 * T)         width between inner faces of sides
DZ = T

X  = T                             offset inward by left side thickness
Y  = TK                            sits at top of toe kick
Z  = 0
AX = AY = AZ = 0
```

### BACK PANEL
Butt jointed — NO dado. Full height between sides:
```
DX = Cabinet.DZ - SCRBK           depth less back scribe
DY = Cabinet.DX - (2 * T)         between sides
DZ = T                             (overridable for thin back)

X  = T
Y  = TK                            runs FULL HEIGHT — does not stop at top panel
Z  = SCRBK                         offset from back by scribe value (0 = flush with back)
AX = AY = AZ = 0
```

### TOP OPTIONS — resolved from TOP_TYPE variable

**full_top** — full panel between sides, inset from back:
```
DX = Cabinet.DZ - T - SCRBK       depth less back panel thickness and scribe
DY = Cabinet.DX - (2 * T)         between sides
DZ = T

X  = T
Y  = Cabinet.DY - T                at top of cabinet
Z  = T + SCRBK                     set forward of back panel
```

**front_rail** (DEFAULT) — single rail at front, open at back:
```
DX = RD                            rail depth (100mm default)
DY = Cabinet.DX - (2 * T)         between sides
DZ = T

X  = T
Y  = Cabinet.DY - T
Z  = Cabinet.DZ - RD               front edge flush with cabinet front
                                   (Z + DX = Cabinet.DZ ✓)
```

**double_rail** — front rail + back rail:
```
Front Rail:
  DX = RD
  DY = Cabinet.DX - (2 * T)
  DZ = T
  X  = T
  Y  = Cabinet.DY - T
  Z  = Cabinet.DZ - RD             flush with cabinet front

Back Rail:
  DX = RD
  DY = Cabinet.DX - (2 * T)
  DZ = T
  X  = T
  Y  = Cabinet.DY - T
  Z  = T + SCRBK                   aligns with back panel front face
```

---

## MODULE 2 — TOE KICK

### TOE_TYPE = 'leg' (plastic adjustable legs)
Single front face panel only:
```
Kick Front Face:
  DX = TOEH                        full kick height
  DY = Cabinet.DX                  full cabinet width
  DZ = TF                          face material thickness

  X  = 0
  Y  = 0                           sits at floor level
  Z  = Cabinet.DZ - TOESCF - TF   back face of panel
                                   front face at: Z + TF = Cabinet.DZ - TOESCF ✓
```

### TOE_TYPE = 'ladder' (DEFAULT) — full ladder frame

Key Z positions:
```typescript
const kickFrontZ = Cabinet.DZ - TOESCF - TF    // back face of kick front panel
const kickSubZ   = kickFrontZ - TI             // back face of kick sub front
const kickBackZ  = TOESCB                      // back face of kick back panel
const sprZ0      = kickBackZ + TI              // spreader Z start (inner face of kick back)
const sprZ1      = kickSubZ                    // spreader Z end (inner face of kick sub front)
const sprEZ      = sprZ1 - sprZ0              // spreader Z span
```

**Kick Front Face** — visible front panel, face material:
```
DX = TOEH                          full kick height
DY = Cabinet.DX                    full cabinet width
DZ = TF                            face material

X  = 0
Y  = 0                             floor level
Z  = kickFrontZ                    = Cabinet.DZ - TOESCF - TF
```

**Kick Sub Front** — structural panel behind front face, interior material:
```
DX = TOEH - TF                     height less front face thickness
DY = Cabinet.DX                    full width
DZ = TI                            interior material

X  = 0
Y  = TI                            sits at material thickness height
Z  = kickSubZ                      = kickFrontZ - TI
```

**Kick Back** — rear panel of ladder, interior material:
```
DX = TOEH - TF                     height less front face thickness
DY = Cabinet.DX                    full width
DZ = TI

X  = 0
Y  = TI
Z  = kickBackZ                     = TOESCB (0 by default)
```

**Vertical Spreaders** — run FRONT TO BACK (Z axis direction):
```
DX = TOEH - TF                     height of spreader
DY = TI                            material thickness (spreader is thin in X)
DZ = sprEZ                         = sprZ1 - sprZ0 (front to back span)

X  = (spreader X position)         see quantity/spacing below
Y  = TI                            sits at material thickness height
Z  = sprZ0                         = kickBackZ + TI
```

**Horizontal Braces** — 100mm wide, lay FLAT on top of each vertical spreader:
The 100mm is in the X direction, laying flat (thin in Y):
```
DX = 100                           fixed 100mm — does not vary with TOEH
DY = TI                            material thickness (thin in Y — lays flat)
DZ = sprEZ                         same Z span as vertical spreader

X  = braceX                        see below — offset so it doesn't clash with spreader
Y  = TOEH - TI                     sits on TOP of vertical spreader
Z  = sprZ0                         same Z as vertical spreader
```

**Spreader quantity and positions:**
```typescript
// End spreaders — always present, one at each end
const endPositions = [
  { x: 0,             isRight: false },   // left end
  { x: Cabinet.DX - TI, isRight: true  }, // right end
]

// Horizontal brace X offset — must not clash with spreader body
// Left end:  brace starts at x + TI (offset inward)
// Right end: brace starts at x - 100 (offset inward toward centre)
const braceX = isRight ? x - 100 : x + TI

// Internal spreaders at TOESP (450mm) centres
const internalQty = Math.max(0, Math.floor(Cabinet.DX / TOESP) - 1)
const spacing = Cabinet.DX / (internalQty + 1)
// Internal spreader positions: spacing * i - TI/2  for i = 1..internalQty
// Internal brace X: spreaderX + TI (always offset inward)
```

**Validation:**
```typescript
if (sprEZ <= 0) {
  throw new Error(`Spreader span is ${sprEZ}mm — check TOESCF and cabinet DZ`)
}
```

---

## MODULE 3 — INTERNAL

### ADJUSTABLE SHELF
Sits on shelf pins in side panels. Pins follow the shelf (master operations — defined separately).

```
DX = intD - ADJSB_F - ADJSB_B     internal depth less front and back setbacks
DY = intW - ADJSL - ADJSR          internal width less 1mm clearance each side
DZ = @shelf_material.DZ            shelf material thickness

X  = T + SCRL + ADJSL             left side + scribe + 1mm clearance
Y  = (calculated per shelf)        see equalise formula below
Z  = SCRBK + T + ADJSB_B          from back panel inner face + back setback
```

**Y position — equalised by default:**
```typescript
// N = total number of adj shelves in cabinet
// intH = Cabinet.DY - TK - (2 * T)  (internal height)
// For shelf index i (0-based):

const openingH = intH / (N + 1)
const shY = TK + T + (openingH * (i + 1)) - ((i + 1) * shelf_material.DZ / 2)

// Y is STORED as a resolved value in the database
// If y_locked = true, use the stored value (user has manually positioned it)
// Equalise button resets all y_locked = false and recalculates
```

Edge banding: front DY edge only (right edge in cabinet space)

### FIXED SHELF
No pin clearance — sits full internal width. Construction holes via Intellijoint (defined later).

```
DX = intD - FIXSB_F - FIXSB_B     internal depth less setbacks
DY = intW                          FULL internal width (no pin clearance)
DZ = @shelf_material.DZ

X  = T                             referenced from LEFT SIDE inner face (not own thickness)
Y  = TK + T + intH/2 - shelf_material.DZ/2   default mid-height, editable per part
Z  = SCRBK + T + FIXSB_B
```

Edge banding: front DY edge only, editable per part

### INNER DRAWER (pull-out shelf on runners)
Three parts per drawer: Front (face module), Bottom, Back

**Validation first:**
```typescript
if (IDRUN > intD) {
  throw new Error(`Runner depth ${IDRUN}mm exceeds cabinet internal depth ${intD}mm`)
}
```

**Inner Drawer Bottom:**
```
DX = IDRUN                         runner depth
DY = intW - (2 * slide_side_deduction) - IDCL - IDCR
DZ = T

X  = T + SCRL + slide_side_deduction
Y  = (face zone Y) + 10            10mm up from face zone Y (placeholder)
Z  = SCRBK + T                     flush with back panel inner face
```

**Inner Drawer Back:**
```
DX = 100 - T                       placeholder height (drawer box builder TBD)
DY = intW - (2 * slide_side_deduction) - IDCL - IDCR    same as bottom
DZ = T

X  = T + SCRL + slide_side_deduction
Y  = (face zone Y) + 10
Z  = SCRBK + T + IDRUN - T         back of runner depth less own thickness
```

No edge banding on inner drawer parts.

---

## MODULE 4 — FACE

### REVEAL RESOLUTION
```typescript
function resolveReveal(side: 'left' | 'right', neighbourType: string, rules: Rules): number {
  // Manual override always wins (stored on cabinet_instance)
  if (cabinet.rev_left_override !== null && side === 'left') return cabinet.rev_left_override
  if (cabinet.rev_right_override !== null && side === 'right') return cabinet.rev_right_override

  // Neighbour-aware
  if (neighbourType === 'cabinet') return side === 'left' ? REVL : REVR
  return side === 'left' ? REVENDL : REVENDR  // wall / end panel / freestanding
}
```

### FACE GRID SYSTEM
The face is divided into a grid of rows × columns.
Each cell = a face zone with a type.

```typescript
// Total face dimensions
const faceW = Cabinet.DX - revL - revR
const faceH = Cabinet.DY - TK - REVT - REVB

// Row heights — equalised by default, locked if manually set
// Available height = faceH - ((nRows - 1) * GAPR)
// Unlocked rows share remaining height equally

// Column widths — equalised by default
// Available width = faceW - ((nCols - 1) * (GAPC / 2))
// Unlocked cols share remaining width equally

// Row Y offsets (from bottom)
let yOffset = TK + REVB
for each row:
  rowYOffset[i] = yOffset
  yOffset += row.height + GAPR

// Col X offsets (from left)
let xOffset = revL
for each col:
  colXOffset[j] = xOffset
  xOffset += col.width + (GAPC / 2)
```

### FACE ZONE DIMENSIONS
```
DX = row.height                    zone height
DY = col.width                     zone width
DZ = @door_material.DZ             face material thickness

X  = colXOffset[col_index]         X position
Y  = rowYOffset[row_index]         Y position
Z  = faceZ                         see face Z position below
```

### FACE Z POSITION — CRITICAL
Doors protrude FORWARD of the carcass:
```typescript
// Overlay mode (DEFAULT — FACINS = 0):
// Door BACK face sits FACBUF mm proud of cabinet front face
faceZ = Cabinet.DZ + FACBUF        // = Cabinet.DZ + 2mm = e.g. 582mm for 580mm deep cabinet

// Inset mode (FACINS > 0):
// Door FRONT face sits FACINS mm inside cabinet front
faceZ = Cabinet.DZ - FACINS - door_material.DZ

// Per-zone override: zone.face_ins and zone.face_buf override cabinet-level FACINS/FACBUF
```

### FACE ZONE TYPES

**door** — hinged door:
```
hinge_side: 'left' | 'right'
edge_band: all four edges
material: door_material
```

**drawer_face** — drawer front panel:
```
edge_band: all four edges
material: door_material
children: inner_drawer_bottom + inner_drawer_back (in internal module)
```

**false_panel** — fixed decorative panel:
```
edge_band: all four edges
material: door_material
```

**open** — no face part generated

### COMMON FACE CONFIGURATIONS

**2 Door (default):**
```
1 row, 2 cols — equal width
zones: [{row:0, col:0, type:'door', hinge_side:'left'},
        {row:0, col:1, type:'door', hinge_side:'right'}]
```

**3 Drawer:**
```
3 rows equal height, 1 col
zones: [{row:0, col:0, type:'drawer_face'},
        {row:1, col:0, type:'drawer_face'},
        {row:2, col:0, type:'drawer_face'}]
```

**Drawer over 2 Doors:**
```
2 rows, 2 cols
Row 0 height = ~38% of faceH (drawer)
Row 1 height = ~62% of faceH (doors)
zones: [{row:0, col:0, type:'drawer_face', col_span:2},
        {row:1, col:0, type:'door', hinge_side:'left'},
        {row:1, col:1, type:'door', hinge_side:'right'}]
```

**1 Door:**
```
1 row, 1 col
zones: [{row:0, col:0, type:'door', hinge_side:'left'}]
```

---

## VALIDATED FORMULAS — 25 TESTS PASSING

These have been verified. Do not change them:

```
// 600mm wide, 900mm tall, 580mm deep, 18mm material, TOEH=150, TOESCF=40

Left side:   DX=580, DY=750, DZ=18, X=0, Y=150, Z=0             ✓
Right side:  DX=580, DY=750, DZ=18, X=582, Y=150, Z=0           ✓
Bottom:      DX=580, DY=564, DZ=18, X=18, Y=150, Z=0            ✓
Back:        DX=580, DY=564, DZ=18, X=18, Y=150, Z=0            ✓
Front rail:  DX=100, DY=564, DZ=18, X=18, Y=882, Z=480          ✓
             (Z + DX = 480 + 100 = 580 = Cabinet.DZ ✓)

Kick front:  DX=150, DY=600, DZ=18, X=0, Y=0, Z=522             ✓
             (= 580 - 40 - 18 = 522)
Kick sub:    DX=132, DY=600, DZ=18, X=0, Y=18, Z=504            ✓
             (= 522 - 18 = 504)
Kick back:   DX=132, DY=600, DZ=18, X=0, Y=18, Z=0              ✓
Spreader:    DX=132, DY=18, DZ=486, X=18, Y=18, Z=18            ✓
             (sprEZ = 504 - 18 = 486 ✓)

Adj shelf:   DX=552, DY=562, DZ=18                               ✓
             (DX = 580-0-18-10-0=552, DY = 564-1-1=562)
Fixed shelf: DX=562, DY=564, DZ=18                               ✓
             (DX = 580-0-18-0-0=562, DY = 564 full width)

2 door face: DY each door = 298.5mm                              ✓
             (faceW=598, gap=2mm, each=(598-2)/2=298)
Door height: DX = 746mm                                          ✓
             (faceH = 900-150-4-0=746)
Door Z:      582mm (= 580 + 2 = Cabinet.DZ + FACBUF)            ✓
```

---

## THREE MATERIAL SCHEDULES

### 1. Assembly Materials
Per assembly_class × material_role:
```
Roles: interior, exposed_interior, door_face, end_panel, shelf
```

### 2. Toe Kick Materials (independent)
```
Roles: face, interior
```

### 3. Drawer Box Materials (independent)
```
Roles: sides, bottom, back, internal_front
Note: drawer FACE is driven by face module material, NOT this schedule
```

### Material Cascade (resolver pattern):
```typescript
// Most specific wins — nullish coalescing down the chain
const material =
  part.material_override_id     // part level
  ?? cabinet.material_overrides[role]  // cabinet level
  ?? roomMaterials[role]        // room level
  ?? jobMaterials[role]         // job level
  ?? shopDefaults[role]         // system level
```

---

## ASSEMBLY CLASSES

```
base         floor cabinet, has toe kick, DY includes toe kick height
wall         wall-hung, NO toe kick (TK=0, TOE_TYPE='none')
tall         floor-to-ceiling, has toe kick
base_corner  corner base
wall_corner  corner wall
tall_corner  corner tall
```

End panels are NOT a separate class.
An end panel = base/wall/tall with has_carcass=false, single panel part only.

---

## FORMULA RESOLVER — HOW TO USE

Located at: `src/lib/resolver/resolver.ts`
DO NOT MODIFY — 25 tests passing.

```typescript
import { resolveCabinet } from '@/lib/resolver/resolver'
import { mergeRules }     from '@/lib/resolver/mergeRules'
import { DEFAULT_RULES }  from '@/lib/resolver/types'

// Merge rules from system → job → room → cabinet level
const rules = mergeRules(
  DEFAULT_RULES,          // system defaults
  jobRuleOverrides,       // job level (partial)
  roomRuleOverrides,      // room level (partial)
  cabinetRuleOverrides,   // cabinet level (partial)
)

// Build the cabinet input
const cabinetInput: CabinetInput = {
  id: cabinet.id,
  assembly_class: 'base',
  DX: 600, DY: 900, DZ: 580,
  has_carcass: true,
  has_internal: true,
  has_face: true,
  has_toekick: true,
  top_type: 'front_rail',
  toe_type: 'ladder',
  left_neighbour: 'cabinet',
  right_neighbour: 'wall',
  exposed_interior: false,
  material: whiteboard18,
  door_material: laminexWhite18,
  shelf_material: whiteboard18,
  toekick_face_material: laminexWhite18,
  toekick_interior_material: whiteboard18,
  slide_side_deduction: 13,
  rules,
  face_grid: {
    rows: [{ row_index: 0, height_locked: false }],
    cols: [
      { col_index: 0, width_locked: false },
      { col_index: 1, width_locked: false },
    ],
    zones: [
      { row_index: 0, col_index: 0, face_type: 'door', hinge_side: 'left' },
      { row_index: 0, col_index: 1, face_type: 'door', hinge_side: 'right' },
    ]
  },
  adj_shelves: [
    { sort_order: 0, y_locked: false },
    { sort_order: 1, y_locked: false },
  ],
  fixed_shelves: [],
  inner_drawers: [],
}

// Resolve all parts
const result = resolveCabinet(cabinetInput)

// result contains:
result.case_parts      // ResolvedCasePart[]
result.toekick_parts   // ResolvedToekickPart[]
result.internal_parts  // ResolvedInternalPart[]
result.face_rows       // ResolvedFaceRow[]
result.face_cols       // ResolvedFaceCol[]
result.face_zones      // ResolvedFaceZone[]
result.errors          // ResolverError[]
result.warnings        // ResolverError[]
```

---

## RENDERING — SVG

Parts are rendered as SVG rectangles in plan and elevation views.

**Plan view** (top-down, looking down Y axis):
```
Cabinet shown as rectangle: width=Cabinet.DX, depth=Cabinet.DZ
Position on wall: pos_x along wall (mm)
Scale: mm → pixels via scale factor
```

**Elevation view** (front-facing, looking in -Z direction):
```
Cabinet shown as rectangle: width=Cabinet.DX, height=Cabinet.DY
Face zones shown inside: doors, drawers with reveals
Dimension lines auto-generated from part positions
```

**Colour coding by module:**
```
Case parts:       #b8c8dc  (steel blue)
Top/rail:         #34d399  (green)
Adj shelf:        #818cf8  (indigo)
Fixed shelf:      #a78bfa  (violet)
Door/false panel: #60a5fa  (blue)
Drawer face:      #f472b6  (pink)
Kick front face:  #f59e0b  (amber)
Kick sub/back:    #d97706  (dark amber)
Kick back panel:  #ea580c  (orange)
Spreaders:        #dc2626  (red)
Inner drawer:     #fb7185  (rose)
```

**Selected cabinet:** blue outline #3b82f6, strokeWidth 2
**Dimension lines:** #fbbf24 (yellow), offset outside cabinet bounds
**Layer system:** each module group has visibility toggle

---

## SUPABASE TABLES — KEY ONES

```sql
-- Parts storage (resolved values written here after resolver runs)
case_parts        -- left_side, right_side, bottom, back, full_top, front_rail, back_rail
toekick_parts     -- kick_front_face, kick_sub_front, kick_back, spreader_vertical, spreader_horizontal
internal_parts    -- adj_shelf, fixed_shelf, inner_drawer_bottom, inner_drawer_back
face_rows         -- one per row in face grid
face_cols         -- one per column in face grid
face_zones        -- one per cell (door, drawer_face, false_panel, open)

-- Cabinet instances
cabinet_instances -- one per placed cabinet, stores DX/DY/DZ and all overrides

-- Materials
materials         -- DZ is the critical field (thickness)
```

---

## CRITICAL RULES — NEVER BREAK THESE

1. DZ always = @material.DZ — NEVER hardcode a thickness number
2. Doors protrude FORWARD: faceZ = Cabinet.DZ + FACBUF (NOT Cabinet.DZ - mat.DZ)
3. Cabinet origin = bottom-left-BACK corner. Positive Z = toward front
4. Toe kick recess = TOESCF (40mm default) — kick front face is set BACK from cabinet front
5. Internal height = DY - TOEH - (2 × T) — measured to UNDERSIDE of top rail
6. Sides sit OUTSIDE the bottom panel — bottom DY = Cabinet.DX - (2 × T)
7. Back panel runs FULL HEIGHT — does not stop at top panel/rail
8. Reveals are NEIGHBOUR-AWARE — 1mm adjacent cabinet, 2mm wall/end panel
9. Spreaders run FRONT TO BACK (Z axis) — not left to right
10. Never modify src/lib/resolver/ — it has 25 passing tests
