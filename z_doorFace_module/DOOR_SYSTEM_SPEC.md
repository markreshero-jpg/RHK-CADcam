# Door System Spec — CADcam RHK
## Door Catalogue + Material Schedules + Profile Builder + Door Styles

This document specifies the full door system to be built in Supabase.
It sits within the existing CADcam hierarchy (5 levels) and connects to the Face Module.

---

## Context

The Face Module already exists with:
- `face_zones` — grid cells with type: door | drawer_face | false_panel | open
- `face_rows` / `face_cols` — grid geometry
- Reveal logic, neighbour-aware gaps, material override support

The door system adds identity and construction detail to face zones of type `door`.

---

## Overview of 4 New Systems

1. **Door Catalogue** — door families (e.g. 18mm MDF Door, 16mm Colour Door)
2. **Door Material Schedules** — brand/colour libraries linked to catalogue entries
3. **Door Profile Builder** — named routing profiles with parametric CNC operations
4. **Door Styles** — named bundles of catalogue + schedule + profile for fast job-level assignment

---

## 1. DOOR CATALOGUE

```sql
create table door_catalogue (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,                  -- "18mm MDF Door", "16mm Colour Door"
  thickness_mm      numeric not null,               -- 18, 16, etc — drives face zone DZ
  construction      text not null                   -- see values below
                    check (construction in (
                      'solid_panel',                -- plain flat door, no frame
                      'frame_and_panel',            -- stile & rail construction
                      'profile_routed'              -- flat door with CNC face routing
                    )),
  substrate         text,                           -- "MDF", "particleboard", "plywood"
  description       text,
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
```

**Seed data examples:**

| name | thickness_mm | construction | substrate |
|---|---|---|---|
| 18mm MDF Door | 18 | solid_panel | MDF |
| 16mm Colour Door | 16 | solid_panel | particleboard |
| 16mm Colour Grain Door | 16 | solid_panel | particleboard |
| 18mm MDF Profile Door | 18 | profile_routed | MDF |

---

## 2. DOOR MATERIAL SCHEDULES

### 2a. Schedule Definition

```sql
create table door_material_schedules (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,                  -- "Polytec Colour Range", "Laminex Colour"
  brand             text,                           -- "Polytec", "Laminex", "Polyec", "Custom"
  description       text,
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
```

### 2b. Linking Schedules to Catalogue Entries (many-to-many)

One door catalogue entry can have multiple schedules.
One schedule can be shared across multiple catalogue entries.

```sql
create table door_catalogue_schedules (
  id                    uuid primary key default gen_random_uuid(),
  door_catalogue_id     uuid not null references door_catalogue(id) on delete cascade,
  door_material_schedule_id uuid not null references door_material_schedules(id) on delete cascade,
  is_default            boolean not null default false,  -- which schedule shows first
  unique (door_catalogue_id, door_material_schedule_id)
);
```

### 2c. Materials within a Schedule

```sql
create table door_schedule_materials (
  id                uuid primary key default gen_random_uuid(),
  schedule_id       uuid not null references door_material_schedules(id) on delete cascade,

  -- Material identity
  colour_name       text not null,                  -- "Sepia Umber", "Aspen", "Arctic"
  colour_code       text,                           -- manufacturer's code e.g. "U961 ST9"
  brand             text,                           -- "Polytec", "Laminex", "Polyec"
  finish            text,                           -- "Matt", "Gloss", "Suede", "Texture"

  -- Grain
  grain_direction   text not null default 'none'
                    check (grain_direction in ('vertical', 'horizontal', 'none')),
  grain_match_required boolean not null default false,

  -- Link to base materials table if it exists
  material_id       uuid references materials(id),  -- nullable — may be a door-only entry

  -- Defaults
  is_default        boolean not null default false,
  is_active         boolean not null default true,
  sort_order        integer not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
```

**Seed data example — "Polytec Colour Range":**

| colour_name | colour_code | finish | grain_direction |
|---|---|---|---|
| Sepia Umber | PTC-SU-M | Matt | none |
| Aspen | PTC-AS-M | Matt | none |
| Arctic | PTC-AR-G | Gloss | none |
| Warm White | PTC-WW-G | Gloss | none |

**Seed data example — "Polytec Colour Grain Range":**

| colour_name | colour_code | finish | grain_direction |
|---|---|---|---|
| Classic Walnut | PTC-CW-M | Matt | vertical |
| Nordic Ash | PTC-NA-M | Matt | vertical |
| Blackened Timber | PTC-BT-S | Suede | vertical |

---

## 3. DOOR PROFILE BUILDER

Profiles are named routing designs applied to the face of a door.
Each profile contains one or more parametric CNC operations.
The formula approach (`_eq` columns) matches the existing joints system.

### 3a. Profile Definition

```sql
create table door_profiles (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,                  -- "Shaker", "VJ Board", "Beaded", "Colonial"
  profile_type      text not null
                    check (profile_type in (
                      'perimeter_route',            -- single route around the perimeter
                      'vj_lines',                   -- parallel vertical/horizontal lines
                      'panel_raise',                -- raised centre panel effect
                      'bead',                       -- beaded profile
                      'custom'                      -- free-form, operations define everything
                    )),
  description       text,
  preview_svg       text,                           -- small SVG string for UI thumbnail
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
```

### 3b. Profile Operations

Each operation is a single CNC routing or drilling pass.
Dimensions and positions are stored as formula strings (same pattern as joint_type_operations).

```sql
create table door_profile_operations (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references door_profiles(id) on delete cascade,

  -- Operation identity
  operation_type    text not null
                    check (operation_type in ('route', 'drill', 'pocket')),
  tool_id           uuid references tools(id),      -- FK to tools table
  tool_diameter_mm  numeric,                        -- fallback if no tool_id
  description       text,

  -- Parametric dimensions — fixed values OR formula strings
  -- If _eq column is populated it overrides the fixed column at resolve time
  -- Formula variables available: @door.DX, @door.DY, @door.DZ, @tool.diameter

  depth_mm          numeric,
  depth_eq          text,                           -- e.g. "8" or "@door.DZ * 0.4"

  width_mm          numeric,                        -- route width (cutter diameter or wider)
  width_eq          text,

  -- Offset from nearest edge (for perimeter routes)
  offset_from_edge_mm   numeric,
  offset_from_edge_eq   text,                       -- e.g. "70" or "@door.DX * 0.08"

  -- For repeating operations (VJ lines etc.)
  repeat_axis       text check (repeat_axis in ('none', 'x', 'y')),
  spacing_mm        numeric,
  spacing_eq        text,                           -- e.g. "100"

  -- Which face of the door
  face              text not null default 'front'
                    check (face in ('front', 'back')),

  -- Lead-in / lead-out for routing
  lead_in_mm        numeric default 0,
  lead_out_mm       numeric default 0,

  -- Pass strategy
  pass_depth_mm     numeric,                        -- depth per pass (CNC safety)
  feed_rate         numeric,                        -- mm/min override (null = machine default)
  spindle_speed     integer,                        -- RPM override

  sort_order        integer not null default 0,
  created_at        timestamptz not null default now()
);
```

**Seed data — Shaker profile:**

Profile: "Shaker" (`perimeter_route`)

Operations (1):
- route, offset_from_edge_eq: `"70"`, depth_eq: `"8"`, width_eq: `"12"`, face: front, repeat_axis: none

**Seed data — VJ Board profile:**

Profile: "VJ Board" (`vj_lines`)

Operations (1):
- route, depth_eq: `"5"`, width_eq: `"6"`, repeat_axis: `"x"`, spacing_eq: `"100"`, face: front
- Start position: offset_from_edge_eq: `"0"` (full door width, lines start at left edge)

**Seed data — Beaded profile:**

Profile: "Beaded" (`bead`)

Operations (1):
- route, depth_eq: `"4"`, width_eq: `"4"`, offset_from_edge_eq: `"50"`, face: front, repeat_axis: none

---

## 4. DOOR STYLES (the bundle wrapper)

A Door Style bundles catalogue + schedule + profile into one named entity.
This is what gets assigned at Job / Room / Assembly level.

```sql
create table door_styles (
  id                            uuid primary key default gen_random_uuid(),
  name                          text not null,      -- "Shaker in Polytec Matt", "Flat VJ MDF"

  -- The three components
  door_catalogue_id             uuid not null references door_catalogue(id),
  door_material_schedule_id     uuid references door_material_schedules(id),   -- nullable
  default_material_id           uuid references door_schedule_materials(id),   -- nullable — pre-selects a colour
  door_profile_id               uuid references door_profiles(id),             -- null = flat door

  description                   text,
  is_active                     boolean not null default true,
  sort_order                    integer not null default 0,

  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);
```

**Seed data examples:**

| name | catalogue | schedule | profile |
|---|---|---|---|
| Shaker — Polytec Colour | 18mm MDF Door | Polytec Colour Range | Shaker |
| Flat — Polytec Colour | 16mm Colour Door | Polytec Colour Range | null |
| Flat Grain — Polytec | 16mm Colour Grain Door | Polytec Colour Grain | null |
| VJ Board — MDF | 18mm MDF Profile Door | null (painted on site) | VJ Board |

---

## 5. FACE ZONE — ADDITIONS

Add door system references to the existing `face_zones` table:

```sql
alter table face_zones add column
  door_style_id               uuid references door_styles(id);         -- primary assignment

alter table face_zones add column
  door_catalogue_override_id  uuid references door_catalogue(id);      -- Part-level override

alter table face_zones add column
  door_material_override_id   uuid references door_schedule_materials(id); -- Part-level override

alter table face_zones add column
  door_profile_override_id    uuid references door_profiles(id);       -- Part-level override

alter table face_zones add column
  profile_operation_overrides jsonb;   -- Operation-level overrides: { op_id: { depth_mm: 6 } }
```

**Resolution order (mirrors CADcam hierarchy):**

```
profile_operation_overrides (Level 5 — Operation)
  ↓
door_profile_override_id    (Level 4 — Part)
door_material_override_id   (Level 4 — Part)
door_catalogue_override_id  (Level 4 — Part)
  ↓
door_style_id on face_zone  (Level 3 — Assembly via cabinet_instance)
  ↓
door_style_id on room       (Level 2 — Room)
  ↓
door_style_id on job        (Level 1 — Job)
```

---

## 6. JOB & ROOM — DEFAULT DOOR STYLE

Add door style defaults to existing tables:

```sql
-- Job level default
alter table jobs add column
  default_door_style_id uuid references door_styles(id);

-- Room level override
alter table rooms add column
  door_style_override_id uuid references door_styles(id);
```

---

## 7. RLS POLICIES

Enable RLS on all new tables and apply authenticated-user-only policies:

```sql
-- Enable RLS
alter table door_catalogue enable row level security;
alter table door_material_schedules enable row level security;
alter table door_catalogue_schedules enable row level security;
alter table door_schedule_materials enable row level security;
alter table door_profiles enable row level security;
alter table door_profile_operations enable row level security;
alter table door_styles enable row level security;

-- Policies — authenticated read/write
create policy "auth_all" on door_catalogue for all to authenticated using (true) with check (true);
create policy "auth_all" on door_material_schedules for all to authenticated using (true) with check (true);
create policy "auth_all" on door_catalogue_schedules for all to authenticated using (true) with check (true);
create policy "auth_all" on door_schedule_materials for all to authenticated using (true) with check (true);
create policy "auth_all" on door_profiles for all to authenticated using (true) with check (true);
create policy "auth_all" on door_profile_operations for all to authenticated using (true) with check (true);
create policy "auth_all" on door_styles for all to authenticated using (true) with check (true);
```

---

## 8. INDEXES

```sql
create index on door_catalogue_schedules (door_catalogue_id);
create index on door_catalogue_schedules (door_material_schedule_id);
create index on door_schedule_materials (schedule_id);
create index on door_profile_operations (profile_id);
create index on door_styles (door_catalogue_id);
create index on face_zones (door_style_id);
```

---

## 9. UPDATED_AT TRIGGERS

Apply `updated_at` auto-update trigger to all tables that have the column:

```sql
-- Assumes a trigger function `handle_updated_at()` already exists in the project.
-- If not, create it:
create or replace function handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on door_catalogue
  for each row execute function handle_updated_at();

create trigger set_updated_at before update on door_material_schedules
  for each row execute function handle_updated_at();

create trigger set_updated_at before update on door_schedule_materials
  for each row execute function handle_updated_at();

create trigger set_updated_at before update on door_profiles
  for each row execute function handle_updated_at();

create trigger set_updated_at before update on door_styles
  for each row execute function handle_updated_at();
```

---

## 10. SUMMARY — TABLE LIST

| Table | Purpose |
|---|---|
| `door_catalogue` | Door family definitions (thickness, construction, substrate) |
| `door_material_schedules` | Brand/colour range definitions |
| `door_catalogue_schedules` | Links schedules to catalogue entries (many-to-many) |
| `door_schedule_materials` | Individual colour/finish entries within a schedule |
| `door_profiles` | Named face routing profiles (Shaker, VJ, Beaded, etc.) |
| `door_profile_operations` | Parametric CNC operations belonging to a profile |
| `door_styles` | Bundle: catalogue + schedule + profile — assigned at Job/Room/Assembly level |

**Existing tables modified:**
- `face_zones` — add door_style_id + override columns
- `jobs` — add default_door_style_id
- `rooms` — add door_style_override_id

---

## 11. NOTES FOR CLAUDE CODE

- `depth_eq`, `width_eq`, `offset_from_edge_eq`, `spacing_eq` are formula strings resolved at cut-list generation time. The existing formula resolver handles these — same pattern as `joint_type_operations`.
- `profile_operation_overrides` in `face_zones` is a JSONB map: `{ "operation_uuid": { "depth_mm": 6, "offset_from_edge_mm": 80 } }`. Only fields present in the map are overridden; all other operation params fall through to the profile defaults.
- Door thickness (`thickness_mm` from `door_catalogue`) overrides the face zone DZ in the resolver. The assembly material schedule `door_face` role is superseded once a `door_style_id` is set.
- Do NOT remove the existing `material_override_id` on `face_zones` — it handles non-door face parts (drawer faces, false panels). The new `door_material_override_id` is door-specific.
- All new tables get RLS enabled with authenticated-only policies (see section 7).
