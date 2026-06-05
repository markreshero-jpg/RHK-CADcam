# Hinge Hardware System — Implementation Spec
**Project:** RHK-CADcam (`xivrjteialwqmleahkfq`)
**Prepared for:** Claude Code
**Status:** Ready to implement

---

## Overview

This spec adds a complete hinge hardware system to the RHK-CADcam database and application. It builds on the existing `hardware_hinges` table (which is partially scaffolded but empty) and adds everything needed for:

- A fully configurable hinge library with cup geometry and anchor hole patterns
- A separate hinge plate library linked to hinges (one hinge, multiple possible plate types)
- Hinge placement instances per door (one record per physical hinge on a door)
- Auto-calculated hinge count driven by configurable shop-level rules
- Shelf-snap logic for top/bottom hinged doors
- Dual CNC operation generation — cup ops fire on the door part, plate ops fire on the resolved mounting surface
- 3D model support for both cup and plate (matching the existing `hardware_slides` pattern exactly)

Read the existing schema carefully before writing any SQL. The patterns to follow are already established — `hardware_slides` for the hardware library record structure, `slide_schedule_entries` for schedule-to-hardware mapping, `internal_parts` for instance records, and `joint_type_operations` / `door_profile_operations` for operation generation patterns.

---

## Section 1 — Fix `face_zones.hinge_side` Check Constraint

The current check constraint on `face_zones.hinge_side` only allows `'left'` and `'right'`. This must be extended to include `'top'` and `'bottom'` before any other hinge work proceeds.

```sql
ALTER TABLE public.face_zones
  DROP CONSTRAINT IF EXISTS face_zones_hinge_side_check;

ALTER TABLE public.face_zones
  ADD CONSTRAINT face_zones_hinge_side_check
  CHECK (hinge_side = ANY (ARRAY[
    'left'::text,
    'right'::text,
    'top'::text,
    'bottom'::text
  ]));
```

---

## Section 2 — Alter `hardware_hinges`

The existing `hardware_hinges` table has basic fields but is missing everything needed for full operation generation and 3D model display. Add the following columns. Do NOT drop or rename any existing columns.

```sql
ALTER TABLE public.hardware_hinges
  -- Cup geometry
  ADD COLUMN IF NOT EXISTS cup_x_from_edge_mm   numeric        NOT NULL DEFAULT 22,
  ADD COLUMN IF NOT EXISTS cup_depth_mm          numeric,

  -- Anchor holes: JSON array of objects, each with:
  --   { "offset_x": number, "offset_y": number, "diameter": number, "depth": number }
  -- offset_x and offset_y are measured from the cup centre in mm.
  -- Example (Blum standard): [{"offset_x": 0, "offset_y": 48, "diameter": 5, "depth": 12}]
  ADD COLUMN IF NOT EXISTS anchor_holes          jsonb          NOT NULL DEFAULT '[]'::jsonb,

  -- Hinge type / mounting edge
  -- 'euro' = standard euro concealed (clip-on plate to carcass side)
  -- 'pivot' = top/bottom pivot hinge
  ADD COLUMN IF NOT EXISTS hinge_type            text           NOT NULL DEFAULT 'euro'
    CONSTRAINT hardware_hinges_hinge_type_check
    CHECK (hinge_type = ANY (ARRAY['euro'::text, 'pivot'::text, 'other'::text])),

  -- Default mounting edge. Can be overridden per hinge instance.
  ADD COLUMN IF NOT EXISTS default_hinge_edge    text           NOT NULL DEFAULT 'left'
    CONSTRAINT hardware_hinges_default_hinge_edge_check
    CHECK (default_hinge_edge = ANY (ARRAY[
      'left'::text, 'right'::text, 'top'::text, 'bottom'::text
    ])),

  -- 3D model — cup (the part that bores into the door)
  -- Follows the same pattern as hardware_slides model columns exactly.
  ADD COLUMN IF NOT EXISTS model_cup_url         text,
  ADD COLUMN IF NOT EXISTS model_cup_format      text
    CONSTRAINT hardware_hinges_model_cup_format_check
    CHECK (model_cup_format = ANY (ARRAY['glb'::text, 'stl'::text, 'obj'::text])),
  ADD COLUMN IF NOT EXISTS model_cup_scale       numeric        NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS model_cup_anchor_x    numeric        NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS model_cup_anchor_y    numeric        NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS model_cup_anchor_z    numeric        NOT NULL DEFAULT 0,

  -- Supplier / ordering
  ADD COLUMN IF NOT EXISTS supplier_code         text,
  ADD COLUMN IF NOT EXISTS updated_at            timestamptz    NOT NULL DEFAULT now();

-- updated_at trigger (only add if handle_updated_at() already exists in the project)
-- Check first: SELECT proname FROM pg_proc WHERE proname = 'handle_updated_at';
-- If it exists:
CREATE TRIGGER hardware_hinges_updated_at
  BEFORE UPDATE ON public.hardware_hinges
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
```

### Column Reference — `hardware_hinges` (complete after migration)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, gen_random_uuid() |
| name | text | e.g. "Blum Clip Top 110°" |
| brand | text | e.g. "Blum" |
| hinge_type | text | 'euro' / 'pivot' / 'other' |
| default_hinge_edge | text | 'left' / 'right' / 'top' / 'bottom' |
| opening_angle | numeric | degrees |
| overlay | numeric | mm — full / half / inset |
| cup_diameter | numeric | mm — editable, NOT hardcoded |
| cup_depth_mm | numeric | mm boring depth of cup |
| cup_x_from_edge_mm | numeric | mm from door edge to cup centre |
| boring_depth | numeric | existing — kept for compatibility |
| anchor_holes | jsonb | array of {offset_x, offset_y, diameter, depth} |
| min_door_thickness | numeric | mm |
| soft_close | boolean | |
| clip_type | text | e.g. "clip-on", "screw-fix" |
| model_cup_url | text | GLB/STL/OBJ URL |
| model_cup_format | text | 'glb' / 'stl' / 'obj' |
| model_cup_scale | numeric | default 1.0 |
| model_cup_anchor_x/y/z | numeric | 3D positioning anchor |
| supplier_code | text | |
| cost_per_unit | numeric | existing — kept |
| active | boolean | existing — kept |
| notes | text | existing — kept |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

## Section 3 — New Table: `hardware_hinge_plates`

The hinge plate is a separate import and a separate physical part. One hinge (cup) can have multiple compatible plate types — standard, thick door, frame mount, zero protrusion. This table holds the plate library.

```sql
CREATE TABLE IF NOT EXISTS public.hardware_hinge_plates (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which hinge cup this plate is compatible with
  hinge_id              uuid          NOT NULL
    REFERENCES public.hardware_hinges(id) ON DELETE CASCADE,

  name                  text          NOT NULL,  -- e.g. "Standard Plate", "Thick Door Plate"
  brand                 text,

  plate_type            text          NOT NULL DEFAULT 'standard'
    CONSTRAINT hardware_hinge_plates_plate_type_check
    CHECK (plate_type = ANY (ARRAY[
      'standard'::text,
      'thick_door'::text,
      'frame_mount'::text,
      'zero_protrusion'::text,
      'other'::text
    ])),

  -- Distance from cup centre to plate mounting centre (mm).
  -- This is what keeps the cup and plate aligned in the 3D viewer —
  -- both models reference the same hinge_instance Y position;
  -- the plate is offset by this value inward from the door face.
  plate_offset_mm       numeric       NOT NULL DEFAULT 0,

  -- Mounting hole pattern for the plate on the carcass/shelf/top/bottom.
  -- JSON array of objects: [{ "offset_x": 0, "offset_y": 0, "diameter": 5, "depth": 12 }]
  -- offset_x and offset_y are measured from the plate centre in mm.
  mounting_hole_pattern jsonb         NOT NULL DEFAULT '[]'::jsonb,

  -- Which surfaces this plate can mount to.
  -- Drives the resolver — if 'side' only, it never tries shelf-snap.
  -- Array values: 'side', 'top', 'bottom', 'shelf'
  compatible_surfaces   jsonb         NOT NULL DEFAULT '["side"]'::jsonb,

  -- 3D model — the plate (mounts to carcass side / shelf / top / bottom)
  model_plate_url       text,
  model_plate_format    text
    CONSTRAINT hardware_hinge_plates_model_plate_format_check
    CHECK (model_plate_format = ANY (ARRAY['glb'::text, 'stl'::text, 'obj'::text])),
  model_plate_scale     numeric       NOT NULL DEFAULT 1.0,
  model_plate_anchor_x  numeric       NOT NULL DEFAULT 0,
  model_plate_anchor_y  numeric       NOT NULL DEFAULT 0,
  model_plate_anchor_z  numeric       NOT NULL DEFAULT 0,

  supplier_code         text,
  cost_per_unit         numeric,
  is_default            boolean       NOT NULL DEFAULT false,
  active                boolean       NOT NULL DEFAULT true,
  notes                 text,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

-- Only one default plate per hinge
CREATE UNIQUE INDEX IF NOT EXISTS hardware_hinge_plates_one_default
  ON public.hardware_hinge_plates (hinge_id)
  WHERE is_default = true;

-- RLS
ALTER TABLE public.hardware_hinge_plates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read hardware_hinge_plates"
  ON public.hardware_hinge_plates FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "authenticated write hardware_hinge_plates"
  ON public.hardware_hinge_plates FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE TRIGGER hardware_hinge_plates_updated_at
  BEFORE UPDATE ON public.hardware_hinge_plates
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
```

---

## Section 4 — New Table: `hinge_count_rules`

This is a shop-level lookup table that drives auto-calculation of how many hinges a door needs based on door height. It is user-editable from the UI (user preferences / shop settings section). The resolver walks the rules in ascending `max_height_mm` order and returns the `hinge_count` of the first rule where door height ≤ `max_height_mm`.

```sql
CREATE TABLE IF NOT EXISTS public.hinge_count_rules (
  id              uuid      PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Upper bound of door height for this rule (mm, inclusive)
  max_height_mm   numeric   NOT NULL,

  -- Number of hinges to use when door height ≤ max_height_mm
  hinge_count     integer   NOT NULL CHECK (hinge_count > 0),

  -- Inset from top of door to first hinge centre (mm)
  top_inset_mm    numeric   NOT NULL DEFAULT 100,

  -- Inset from bottom of door to last hinge centre (mm)
  bottom_inset_mm numeric   NOT NULL DEFAULT 100,

  sort_order      integer   NOT NULL DEFAULT 0,
  active          boolean   NOT NULL DEFAULT true,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Seed with the agreed defaults
INSERT INTO public.hinge_count_rules
  (max_height_mm, hinge_count, top_inset_mm, bottom_inset_mm, sort_order)
VALUES
  (900,  2, 100, 100, 10),
  (1800, 3, 100, 100, 20),
  (2400, 4, 100, 100, 30),
  (3000, 5, 100, 100, 40);

-- RLS
ALTER TABLE public.hinge_count_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read hinge_count_rules"
  ON public.hinge_count_rules FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "authenticated write hinge_count_rules"
  ON public.hinge_count_rules FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER hinge_count_rules_updated_at
  BEFORE UPDATE ON public.hinge_count_rules
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
```

---

## Section 5 — New Table: `hinge_instances`

One row per physical hinge on a door. This is the single source of truth for hinge position — both the cup model (on the door) and the plate model (on the carcass/shelf/top/bottom) read their Y position from this record. They can never go out of sync.

```sql
CREATE TABLE IF NOT EXISTS public.hinge_instances (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which door face zone this hinge belongs to
  face_zone_id                uuid        NOT NULL
    REFERENCES public.face_zones(id) ON DELETE CASCADE,

  -- Which hinge hardware record to use
  hinge_hardware_id           uuid        NOT NULL
    REFERENCES public.hardware_hinges(id),

  -- Which plate to use (defaults to is_default plate for this hinge)
  hinge_plate_id              uuid
    REFERENCES public.hardware_hinge_plates(id),

  -- Which edge of the door this hinge is on.
  -- Left/right = side-hung; top/bottom = pivot-hung.
  hinge_edge                  text        NOT NULL DEFAULT 'left'
    CONSTRAINT hinge_instances_hinge_edge_check
    CHECK (hinge_edge = ANY (ARRAY[
      'left'::text, 'right'::text, 'top'::text, 'bottom'::text
    ])),

  -- Y position of this hinge centre measured from the BOTTOM of the door (mm).
  -- Calculated by the resolver from hinge_count_rules, then stored.
  -- Once y_locked = true, the resolver will NOT recalculate this hinge's position.
  y_position_mm               numeric     NOT NULL,
  y_locked                    boolean     NOT NULL DEFAULT false,

  -- -------------------------------------------------------------------------
  -- Mounting surface resolution
  -- -------------------------------------------------------------------------
  -- 'auto'  = run shelf-snap logic then fall back to side/top/bottom
  -- 'side'  = always mount to carcass side panel (left or right)
  -- 'top'   = always mount to top panel
  -- 'bottom'= always mount to bottom panel
  -- 'shelf' = always mount to a specific shelf (use resolved_mounting_part_id)
  mounting_surface            text        NOT NULL DEFAULT 'auto'
    CONSTRAINT hinge_instances_mounting_surface_check
    CHECK (mounting_surface = ANY (ARRAY[
      'auto'::text, 'side'::text, 'top'::text, 'bottom'::text, 'shelf'::text
    ])),

  -- Shelf-snap tolerance in mm.
  -- If a shelf exists within this distance of y_position_mm AND
  -- hinge_edge is 'top' or 'bottom', the plate fires on the shelf instead.
  -- Default 3mm as agreed. Only applies when mounting_surface = 'auto'.
  shelf_snap_tolerance_mm     numeric     NOT NULL DEFAULT 3,

  -- These two columns are written by the resolver at resolve-time.
  -- They record which actual part the plate operations will fire on.
  -- resolved_mounting_part_table: 'case_parts' | 'internal_parts'
  -- resolved_mounting_part_id: UUID of the specific part row
  resolved_mounting_part_table text,
  resolved_mounting_part_id   uuid,

  -- -------------------------------------------------------------------------
  -- Sort order within the door (1 = topmost hinge for left/right edge,
  -- or leftmost hinge for top/bottom edge)
  -- -------------------------------------------------------------------------
  sort_order                  integer     NOT NULL DEFAULT 0,

  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookup of all hinges on a door
CREATE INDEX IF NOT EXISTS hinge_instances_face_zone_id_idx
  ON public.hinge_instances (face_zone_id);

-- RLS
ALTER TABLE public.hinge_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read hinge_instances"
  ON public.hinge_instances FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "authenticated write hinge_instances"
  ON public.hinge_instances FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER hinge_instances_updated_at
  BEFORE UPDATE ON public.hinge_instances
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
```

---

## Section 6 — Update `hinge_schedules`

The existing `hinge_schedules` table has a single `hinge_id` column. It needs to also reference a default plate so that the schedule carries a complete hinge + plate pairing.

```sql
ALTER TABLE public.hinge_schedules
  ADD COLUMN IF NOT EXISTS hinge_plate_id uuid
    REFERENCES public.hardware_hinge_plates(id);
```

---

## Section 7 — Fix Remaining RLS Issues

The following tables currently have RLS disabled. Enable it with authenticated-only policies. Do NOT enable without adding policies — that would lock everyone out.

```sql
-- shop_settings
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated all shop_settings"
  ON public.shop_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- drawer_box_methods
ALTER TABLE public.drawer_box_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated all drawer_box_methods"
  ON public.drawer_box_methods FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- benchtop_schedule_rows
ALTER TABLE public.benchtop_schedule_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated all benchtop_schedule_rows"
  ON public.benchtop_schedule_rows FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- job_benchtop_materials
ALTER TABLE public.job_benchtop_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated all job_benchtop_materials"
  ON public.job_benchtop_materials FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- room_benchtop_materials
ALTER TABLE public.room_benchtop_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated all room_benchtop_materials"
  ON public.room_benchtop_materials FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- benchtop_build_methods
ALTER TABLE public.benchtop_build_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated all benchtop_build_methods"
  ON public.benchtop_build_methods FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- slide_schedule_entries
ALTER TABLE public.slide_schedule_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated all slide_schedule_entries"
  ON public.slide_schedule_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- job_presets
ALTER TABLE public.job_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated all job_presets"
  ON public.job_presets FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- parts_library
ALTER TABLE public.parts_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated all parts_library"
  ON public.parts_library FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- cabinet_custom_parts
ALTER TABLE public.cabinet_custom_parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated all cabinet_custom_parts"
  ON public.cabinet_custom_parts FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

---

## Section 8 — Update `schema_versions`

```sql
INSERT INTO public.schema_versions (version, notes, breaking_change)
VALUES (
  '0.6',
  'Hinge system: extend hardware_hinges, add hardware_hinge_plates, hinge_count_rules, hinge_instances. Extend face_zones.hinge_side check constraint to include top/bottom. Add hinge_plate_id to hinge_schedules. Fix RLS on 10 tables.',
  false
);
```

---

## Section 9 — Application Logic to Implement

These are the resolver functions / business logic pieces that need to be written in the application layer (TypeScript / React). Claude Code should implement these alongside the migration.

### 9.1 Hinge Count Resolver

**Trigger:** When a `face_zone` with `face_type = 'door'` is created or its `dy` (height) changes.

**Logic:**
```
1. Fetch active hinge_count_rules ordered by max_height_mm ASC
2. Walk the rules — find the first where door_dy ≤ max_height_mm
3. That rule gives hinge_count, top_inset_mm, bottom_inset_mm
4. Calculate Y positions:
   - If hinge_count = 2:
       hinge[0].y = door_dy - top_inset_mm   (topmost hinge, measured from door bottom)
       hinge[1].y = bottom_inset_mm
   - If hinge_count = 3:
       hinge[0].y = door_dy - top_inset_mm
       hinge[1].y = door_dy / 2              (middle, equalised)
       hinge[2].y = bottom_inset_mm
   - If hinge_count ≥ 4:
       hinge[0].y = door_dy - top_inset_mm
       hinge[n-1].y = bottom_inset_mm
       middle hinges equally spaced between top and bottom
5. For each position, INSERT a hinge_instance record IF one does not already
   exist at that sort_order with y_locked = true.
   Locked instances are never recalculated — skip them.
6. Delete any hinge_instance rows for this face_zone whose sort_order
   exceeds the new hinge_count (i.e. reduce hinges if door gets shorter).
```

### 9.2 Mounting Surface Resolver

**Trigger:** When a `hinge_instance` is saved and `mounting_surface = 'auto'`, OR when shelves are added/moved on the same cabinet.

**Logic:**
```
1. Read hinge_instance.hinge_edge
2. If hinge_edge = 'left' or 'right':
   → mounting surface is always the carcass side panel
   → resolved_mounting_part_table = 'case_parts'
   → resolved_mounting_part_id = case_parts.id WHERE part_key = 'left_side'
     (or 'right_side' depending on hinge_edge)
   → STOP. No shelf-snap check for side-hung doors.

3. If hinge_edge = 'top' or 'bottom':
   a. Scan internal_parts WHERE cabinet_instance_id = this cabinet
      AND part_type IN ('adj_shelf', 'fixed_shelf')
      AND active = true
   b. For each shelf, calculate distance = ABS(shelf.y - hinge_instance.y_position_mm)
   c. If any shelf has distance ≤ hinge_instance.shelf_snap_tolerance_mm:
      → resolved_mounting_part_table = 'internal_parts'
      → resolved_mounting_part_id = that shelf's id
      → STOP (use first match if multiple within tolerance)
   d. If no shelf within tolerance:
      If hinge_edge = 'top':
        → check for case_parts WHERE part_key = 'full_top'
          (fall back to 'front_rail' if no full_top)
        → resolved_mounting_part_table = 'case_parts'
        → resolved_mounting_part_id = that part's id
      If hinge_edge = 'bottom':
        → resolved_mounting_part_table = 'case_parts'
        → resolved_mounting_part_id = case_parts WHERE part_key = 'bottom'

4. Write resolved_mounting_part_table and resolved_mounting_part_id
   back to the hinge_instance row.
```

### 9.3 Operation Generation

**Trigger:** At CNC/cut-list generation time. Two operation sets are generated per `hinge_instance`.

**Cup Operations (fire on the door part):**
```
Source:   hinge_instances JOIN hardware_hinges
Part:     face_zones row (the door)
Face:     back face of the door (the face that faces into the cabinet)

Operation 1 — Cup bore:
  type:     'drill' (forstner / spade)
  diameter: hardware_hinges.cup_diameter
  depth:    hardware_hinges.cup_depth_mm
  x:        hardware_hinges.cup_x_from_edge_mm
            (measured from the hinge_edge side of the door)
  y:        hinge_instances.y_position_mm
  tool:     resolved from materials.cnc_tool_id for this door's material,
            feed rate scaled by materials.feed_rate_pct

Operation 2..N — Anchor holes (one per entry in hardware_hinges.anchor_holes):
  For each anchor_hole in hardware_hinges.anchor_holes:
    type:     'drill'
    diameter: anchor_hole.diameter
    depth:    anchor_hole.depth
    x:        hardware_hinges.cup_x_from_edge_mm + anchor_hole.offset_x
    y:        hinge_instances.y_position_mm + anchor_hole.offset_y
    tool:     resolved from material (same as above)
```

**Plate Operations (fire on the resolved mounting surface):**
```
Source:   hinge_instances JOIN hardware_hinge_plates
Part:     resolved_mounting_part_table / resolved_mounting_part_id

For each hole in hardware_hinge_plates.mounting_hole_pattern:
  type:     'drill'
  diameter: hole.diameter
  depth:    hole.depth
  x:        (plate centre x on mounting surface) + hole.offset_x
             Plate centre x = distance inward from door face =
             hardware_hinge_plates.plate_offset_mm
  y:        hinge_instances.y_position_mm + hole.offset_y
  face:     the face of the mounting part that is visible to the door opening
  tool:     resolved from material of the mounting surface part
```

### 9.4 3D Viewer Positioning

The 3D viewer should render both models for each hinge_instance. The key positioning rules:

**Cup model:**
- Positioned on the door part
- X = `cup_x_from_edge_mm` from the hinge edge of the door
- Y = `hinge_instance.y_position_mm` from door bottom
- Z = on the back face of the door (door Z position - cup depth)
- Rotation: oriented so the cup faces into the cabinet

**Plate model:**
- Positioned on the resolved mounting surface
- Y = same `hinge_instance.y_position_mm` — this is the single source of truth
- X = `plate_offset_mm` inward from the door face (on the mounting part)
- Z = aligned to the mounting part face facing the door opening
- Both models move together because both read Y from the same `hinge_instance` row

---

## Section 10 — What NOT to Change

Do not modify any of the following — they are working and in use:

- `hardware_slides` and its model columns — the hinge model columns are modelled on this pattern, not replacing it
- `face_zones.hinge_hardware_id` — this stays as the job/room/assembly-level hinge assignment; `hinge_instances` is the part-level detail
- `face_zones.hinge_qty` — keep this column; it is used as a display count / override; the resolver writes the calculated count here when instances are generated
- `hinge_schedules` — only add `hinge_plate_id`, do not alter existing columns
- Any existing data in projects, rooms, cabinet_instances, case_parts, face_zones, etc.

---

## Section 11 — Migration Execution Order

Run in this exact order to avoid FK violations:

1. Check that `handle_updated_at()` function exists — if not, create it before anything else
2. Section 1 — fix `face_zones.hinge_side` constraint
3. Section 2 — alter `hardware_hinges`
4. Section 3 — create `hardware_hinge_plates`
5. Section 4 — create `hinge_count_rules` (includes seed data)
6. Section 5 — create `hinge_instances`
7. Section 6 — alter `hinge_schedules`
8. Section 7 — fix RLS on 10 tables
9. Section 8 — insert schema_versions record

---

## Section 13 — Combined Two-Part GLB Animation Support

### Background

The hinge 3D models in this system use a **single combined GLB file** containing two named meshes that animate relative to each other as the door swings open. This was established when the first model (`Blum_71B3590_split.glb`) was authored. All future hinge GLBs must follow the same convention.

The Blum 71B3590 file confirms the full pattern — it contains a `HingeSpec` metadata block in the scene extras with all positioning data baked in. Do not change this convention.

---

### Mesh Naming Convention — MANDATORY

Every combined hinge GLB **must** contain exactly two meshes with these exact names:

| Mesh name | What it is | Behaviour in viewer |
|-----------|-----------|---------------------|
| `HingePlate` | The mounting plate — screws to carcass side/shelf/top/bottom | **Stays fixed.** Never moves. Positioned at the resolved mounting surface. |
| `HingeCupArm` | The cup and arm assembly — bores into the door | **Rotates with the door.** Placed inside the door panel's transform group so it animates when the door opens/closes. |

The viewer splits the GLB on load by these names. If a GLB arrives without these exact mesh names it will not animate correctly. Document this requirement for anyone authoring future hinge models.

---

### Origin Convention — MANDATORY

The GLB coordinate origin (0, 0, 0) must be set to:

> **The centre of the plate face at the bore centre point.**

Specifically: Z=0 is the cabinet gable face at the bore centre. This is the physical pivot point of the hinge knuckle — both meshes share this origin so the cup arm rotates correctly around it when the door swings.

This is confirmed in the Blum 71B3590 `HingeSpec` extras:
```json
"origin": "plate_face_bore_centre",
"note": "Z=0 = cabinet gable face at bore centre. HingePlate stays fixed. HingeCupArm rotates with door (place inside DoorPanel group)."
```

Because the origin convention is fixed, **no separate pivot point columns are needed** on `hardware_hinges`. The viewer always rotates `HingeCupArm` around the model origin.

---

### Required HingeSpec Extras Block

Every hinge GLB must include this metadata in `scenes[0].extras.HingeSpec`. The viewer reads these values at load time rather than relying on separate database columns for positioning:

```json
{
  "HingeSpec": {
    "model": "Human-readable model name",
    "part_number": "Manufacturer part number",
    "bore_diameter_mm": 35,
    "bore_distance_mm": 5,
    "overlay": "full_overlay | half_overlay | inset",
    "open_angle_deg": 110,
    "origin": "plate_face_bore_centre",
    "bore_centre_to_door_face_mm": 51.3,
    "note": "Z=0 = cabinet gable face at bore centre. HingePlate stays fixed. HingeCupArm rotates with door (place inside DoorPanel group)."
  }
}
```

`bore_centre_to_door_face_mm` is the critical positioning value — it tells the viewer how far the cup arm extends from the plate face to the door face. This varies between hinge models (arm length differences between brands/types).

---

### Database Changes for Combined Model Support

Add the following columns to `hardware_hinges` as part of the Section 2 migration:

```sql
ALTER TABLE public.hardware_hinges
  -- Combined two-part GLB (preferred over separate cup/plate URLs)
  ADD COLUMN IF NOT EXISTS model_combined_url          text,
  ADD COLUMN IF NOT EXISTS model_combined_format       text
    CONSTRAINT hardware_hinges_model_combined_format_check
    CHECK (model_combined_format = ANY (ARRAY['glb'::text])),
    -- Only GLB is supported for combined animated models.
    -- STL and OBJ do not support scene hierarchy or extras metadata.

  ADD COLUMN IF NOT EXISTS model_combined_scale        numeric  NOT NULL DEFAULT 1.0,

  -- Cached from HingeSpec extras so the viewer doesn't need to
  -- parse the GLB binary to get this value at render time.
  ADD COLUMN IF NOT EXISTS bore_centre_to_door_face_mm numeric;
```

**Model URL priority rule for the viewer:**
If `model_combined_url` is set → use the combined GLB with two-mesh animation.
If only `model_cup_url` is set → use static cup + static plate as separate props (fallback for simple/legacy hinges).
Never use both simultaneously.

---

### Viewer Implementation — Animation Logic

The viewer must implement the following when rendering a `hinge_instance` that has `model_combined_url` set:

```
1. Load the GLB from model_combined_url
2. Split scene nodes by mesh name:
     plateNode = scene.getObjectByName('HingePlate')
     cupArmNode = scene.getObjectByName('HingeCupArm')
3. Read HingeSpec from scene.userData (parsed from GLB extras):
     boreOffset = HingeSpec.bore_centre_to_door_face_mm
     maxAngle   = HingeSpec.open_angle_deg  (in degrees, convert to radians)
4. Position plateNode:
     - Place at the resolved_mounting_part face position
     - Y = hinge_instance.y_position_mm from cabinet bottom
     - The plate origin aligns to the gable face at bore centre
     - plateNode stays in world space — never parented to the door
5. Position and parent cupArmNode:
     - Parent cupArmNode to the door panel's transform group
     - Local position within door group:
         x = hardware_hinges.cup_x_from_edge_mm from the hinge edge
         y = hinge_instance.y_position_mm (in door-local space)
         z = boreOffset inward from door back face
     - cupArmNode.rotation = 0 when door is closed
6. Door open animation:
     - When door open angle changes (user interaction or animation):
         cupArmNode.rotation.y = doorOpenAngle (radians)
         Clamped to [0, maxAngle * π/180]
     - plateNode does not move
7. Repeat for each hinge_instance on this door
```

---

### Testing the Combined Model

After implementing, verify using `Blum_71B3590_split.glb`:

- [ ] Both `HingePlate` and `HingeCupArm` meshes load and are visible
- [ ] `HingeSpec` metadata is read correctly — `bore_centre_to_door_face_mm` = 51.3, `open_angle_deg` = 110
- [ ] `HingePlate` does not move when door is opened
- [ ] `HingeCupArm` rotates with the door, pivoting around the model origin
- [ ] At 0° (closed) the cup arm sits flush against the plate — no gap or overlap
- [ ] At 110° (fully open) the cup arm has rotated correctly and does not clip through the door panel
- [ ] Multiple hinge instances on one door all animate together when door swings

---

## Section 12 — Testing Checklist

After migration, verify the following before marking complete:

- [ ] `face_zones.hinge_side` accepts 'top' and 'bottom' values
- [ ] A `hardware_hinges` record can be inserted with `cup_diameter = 26` (non-35mm to verify not hardcoded)
- [ ] A `hardware_hinge_plates` record can be inserted linked to the above hinge
- [ ] `hinge_count_rules` table has 4 seed rows
- [ ] A `hinge_instances` record can be inserted with `mounting_surface = 'auto'`
- [ ] `hinge_instances` with `mounting_surface = 'shelf'` saves without error
- [ ] All 10 previously-RLS-disabled tables now return rows for an authenticated user
- [ ] All 10 previously-RLS-disabled tables reject requests from the anon role
- [ ] `schema_versions` shows version '0.6'
- [ ] No existing cabinet_instance, face_zone, or case_parts data was altered
