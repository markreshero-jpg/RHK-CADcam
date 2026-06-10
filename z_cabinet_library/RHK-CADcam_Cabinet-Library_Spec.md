# RHK-CADcam — Cabinet Library Implementation Spec

**Target repo:** `markreshero-jpg/RHK-CADcam` (branch `main`)
**Supabase project:** `xivrjteialwqmleahkfq`
**Status:** Approved for build. Spec-first; build one stage at a time with a check-in after each.

---

## 0. Instructions to Claude Code (read first)

1. **Read the existing codebase before writing anything.** Key files this spec touches:
   - `app/canvas/[roomId]/CanvasSidebar.tsx` — current sidebar (to be replaced)
   - `app/canvas/[roomId]/CanvasClient.tsx` — `placeCabinet`, `handleInsertAdjacent`, ghost/elevation placement
   - `app/canvas/[roomId]/useCabinetOps.ts`, `canvasDB.ts` — instance insert + resolve/persist
   - `app/canvas/[roomId]/canvasTypes.ts` — `Mode`, `modeAssemblyClass`
   - `src/lib/types.ts` — `CabinetDefinition`, `AssemblyClass`, `DEFAULT_DIMS`
   - `src/lib/resolver/*` — the cascade (do **not** modify; see §1)
   - existing library pages under `app/library/*` — match their page/list/CRUD pattern
2. **Infer schema patterns from the live DB; do not hand-write rigid SQL from memory.** Where this spec gives DDL, treat column **types/defaults for `carcase_joints`, `part_pos_overrides`, and the four `*_overrides` columns as "mirror whatever `cabinet_instances` uses"** — read `information_schema.columns` and match exactly.
3. **All mutation/build logic goes in a callable service layer, not in components.** Placement-from-definition and save-to-library are service functions the UI calls. (Agent-readiness invariant.)
4. Stop at each **CHECK-IN** and report before proceeding.

---

## 1. Architecture context (why this is shaped the way it is)

- **The table already exists.** `cabinet_definitions` is live, empty (0 rows), RLS enabled, and the FK `cabinet_instances.cabinet_definition_id → cabinet_definitions.id` is already wired. We are finishing scaffolding, not inventing it.
- **Copy-not-link.** A library definition is a *placement-time template only*. At placement, its fields are copied into a new `cabinet_instances` row and the instance becomes fully independent. The `cabinet_definition_id` on the instance is an **audit/origin pointer only**.
- **The resolver is not touched.** `loadCabinetInput` reads everything (dims, `has_*`, `face_grid`, `internal_grid`, joints, overrides) from the **instance**, never from the definition. So once placement copies the fields in, resolution is unchanged. Do not make the resolver consult `cabinet_definitions`.
- **Freeze vs cascade.** A definition **freezes geometry + part composition**: dims, `has_*` flags, `top_type`, `toe_type`, `face_grid`, `internal_grid`, `carcase_joints`, `construction_method_id`. It **does not freeze** materials/hardware/door-style by default — those resolve through the Job → Room → Assembly cascade at placement, so bulk hierarchy changes keep working on placed library cabinets. Door style is carried inside `face_grid`, so it travels with geometry automatically.
- **Preservation = opt-in assembly-level overrides.** The Save-As modal's preservation tab lets the user tick cascade-resolved properties (e.g. a specific drawer slide, carcase material) to *remember*. Ticked items are written into override columns on the definition and, at placement, copied into the instance's existing assembly-level override columns — the lowest, highest-priority cascade layer the resolver already honours. Tick nothing → pure cascade.

---

## 2. Schema migration (Stage 1)

### 2.1 New taxonomy tables (normalized, global subcategories)

```sql
create table public.cabinet_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  accent_color text,            -- optional sidebar accent (nullable)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cabinet_subcategories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- Subcategories are **global** (defined once, rendered under every category). Confirmed.
- Bind `handle_updated_at()` to both (the function exists project-wide).
- **RLS:** read the existing policy on `cabinet_definitions` and replicate the same policy shape on both new tables.

### 2.2 Columns to ADD to `cabinet_definitions`

It currently has: `id, name, assembly_class, construction_method_id, default_dx/dy/dz, has_carcass/internal/face/toekick, top_type, toe_type, face_grid (jsonb), rule_overrides (jsonb), is_library_item, active, created_at, updated_at`.

Add:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `category_id` | uuid | null | FK → `cabinet_categories(id)` `ON DELETE RESTRICT` |
| `subcategory_id` | uuid | null | FK → `cabinet_subcategories(id)` `ON DELETE RESTRICT` |
| `internal_grid` | jsonb | null | **Missing today** — lets a definition carry shelf/drawer layout (mirror `cabinet_instances.internal_grid`) |
| `carcase_joints` | *mirror instance* | *mirror* | Freeze joinery (mirror `cabinet_instances.carcase_joints`) |
| `material_overrides` | *mirror instance* | `{}` | Preservation target |
| `hardware_overrides` | *mirror instance* | `{}` | Preservation target |
| `toekick_overrides` | *mirror instance* | `{}` | Preservation target |
| `drawerbox_overrides` | *mirror instance* | `{}` | Preservation target |
| `exposed_interior` | boolean | false | Preservable finished-end flag |
| `description` | text | null | UI metadata |
| `thumbnail_svg` | text | null | Optional override thumbnail (default thumbnails auto-render; see §5) |
| `sort_order` | int | 0 | Ordering within subcategory |

> `RESTRICT` on the taxonomy FKs enforces "can't delete a category/subcategory that still has definitions" at the DB level; the UI handles reassignment before delete (§5).
> Do **not** add `part_pos_overrides` to definitions — it's instance-specific positioning; placement leaves it null.
> Do **not** add min/max dimensions in this build — defaults only. (Noted as a future addition.)

### 2.3 Fix the audit FK (delete rule)

The FK `cabinet_instances_cabinet_definition_id_fkey` is currently `NO ACTION`, which blocks deleting a library item after it's been placed — this fights copy-not-link. Drop and recreate as:

```sql
alter table public.cabinet_instances
  drop constraint cabinet_instances_cabinet_definition_id_fkey;
alter table public.cabinet_instances
  add constraint cabinet_instances_cabinet_definition_id_fkey
  foreign key (cabinet_definition_id)
  references public.cabinet_definitions(id) on delete set null;
```

Deleting a library definition then leaves placed cabinets fully intact; they just lose the backward origin tag.

### 2.4 Bind updated_at trigger

`cabinet_definitions` has `updated_at` but **no trigger** attached. Bind `handle_updated_at()` to `cabinet_definitions`, `cabinet_categories`, `cabinet_subcategories`.

### 2.5 Seed data

**Categories:** `Base` (sort 0), `Wall` (1), `Tall` (2).
**Subcategories (global):** `Cabinets` (0), `Corners` (1), `Panels` (2), `Fillers` (3).

**Three seed definitions**, each `category → Cabinets`, `is_library_item=true`, `active=true`, **all overrides empty / `exposed_interior=false` (pure cascade)**:

| Name | assembly_class | W × H × D | toekick | Face | Internal |
|---|---|---|---|---|---|
| Base Cabinet | base | 600 × 900 × 580 | on | 2-door | 1 adjustable shelf |
| Wall Unit | wall | 600 × 700 × 350 | off | 2-door | 1 shelf |
| Tall Cabinet | tall | 600 × 2100 × 580 | on | doors | shelves |

> **Source the `face_grid` / `internal_grid` / `carcase_joints` JSON from a known-good existing `cabinet_instances` row of the same `assembly_class`** (there are 74 instances) rather than hand-writing JSON. Copy a representative row's geometry fields into the seed definition. Confirm the W/H/D → `default_dx`/`default_dy`/`default_dz` axis mapping against `DEFAULT_DIMS` in `src/lib/types.ts` before writing values.

**CHECK-IN 1:** Migration applied, trigger/FK/RLS verified, four subcategories + three categories present, three seed definitions present and each one places + resolves without error.

---

## 3. Definition-driven placement (Stage 2)

Today `placeCabinet(wall, x, y, cls, ep, flip)` hardcodes dims (`DEFAULT_DIMS` + `class_dimension_defaults`), sets `face_grid: null`, `internal_grid: null`, and `cabinet_definition_id: null`.

Add a **service-layer** function (not in a component):

```
placeCabinetFromDefinition(definitionId, wall, x, y, flip) → cabinetInstanceId
```

It must:
1. Load the definition.
2. Insert a `cabinet_instances` row copying: `assembly_class`; `default_dx/dy/dz → dx/dy/dz`; `has_carcass/internal/face/toekick`; `top_type`; `toe_type`; `construction_method_id`; `face_grid`; `internal_grid`; `carcase_joints`; `rule_overrides`; the four `*_overrides`; `exposed_interior`.
3. **Stamp `cabinet_definition_id = definitionId`** (audit pointer).
4. Run the existing `dbResolveAndPersistCabinet` exactly as the current path does.

Position/neighbour logic (`pos_x/pos_y`, `left/right_neighbour`, label via `nextLabel`) stays identical to `placeCabinet`. Keep the existing `placeCabinet` for the non-library adjacency/quick-insert paths (see §4 note).

**CHECK-IN 2:** Placing the seed "Base Cabinet" via `placeCabinetFromDefinition` produces an instance that resolves **identically** to one placed via the old hardcoded base path (same parts, dims, materials from cascade), plus a non-null `cabinet_definition_id`.

---

## 4. DB-backed sidebar (Stage 3)

Replace the `CanvasSidebar.tsx` `CAB_GROUPS` constant **and the localStorage system** (`rhk-cab-groups`, `rhk-cab-subgroups`) entirely. **Discard the localStorage custom groups — do not migrate them** (they were temporary cosmetic shells that couldn't hold items).

New sidebar reads from the DB:
- `cabinet_categories` (active, by `sort_order`) → category pills.
- `cabinet_subcategories` (active, by `sort_order`) → accordion sections, shown under each category, with a count of matching definitions.
- `cabinet_definitions` (active, `is_library_item=true`) grouped by `category_id` then `subcategory_id`, by `sort_order` → thumbnails.

Interaction:
- Click a definition → **arm placement carrying `definition_id`** (replaces arming a `Mode`); the ghost/elevation placement calls `placeCabinetFromDefinition`.
- Drag-to-canvas supported (`@dnd-kit` already in stack).
- Search + a scope filter (All / This Job) header.

> **Adjacency note:** `handleInsertAdjacent` (quick end-panel/filler insert) stays as-is for now — it's an adjacency action, not library placement. Fillers/panels also exist as library definitions for palette placement (§6). Don't rip out adjacency.

**CHECK-IN 3:** Sidebar renders categories/subcategories/definitions from the DB; placing from it works for all three seeds; no localStorage group code remains.

---

## 5. Management page + Save-As-to-library modal (Stage 4)

### 5.1 Management page `app/library/cabinets/`

Match the existing `app/library/*` page pattern (doors/joints/materials). Provides:
- List grouped by category → subcategory.
- **Taxonomy CRUD:** add/rename/reorder/activate categories & subcategories; delete blocked (FK `RESTRICT`) unless empty — UI offers **reassign-then-delete** when definitions exist.
- Per-definition: rename, move (category/subcategory), set `description`, `sort_order`, activate/deactivate, delete.
- Deep geometry editing is **not** rebuilt here — the authoring path for geometry is "place → configure on canvas → Save to library" (§5.2), reusing the existing canvas inspector.

### 5.2 Save-As-to-library modal (from a placed/configured cabinet)

Three parts:
1. **Name** (text).
2. **Pathway picker** — navigate the Category → Subcategory tree to choose where it lands.
3. **Preservation tab** — checklist of cascade-resolved properties to remember (e.g. carcase material, drawer slide, hinge, handle, toekick material, `exposed_interior`). Door style is preserved automatically via `face_grid`, so it isn't a checkbox.

Service-layer function:
```
saveCabinetToLibrary(cabinetInstanceId, { name, categoryId, subcategoryId, preserve: {...} }) → definitionId
```
- Snapshots the instance's **frozen-geometry** fields (dims → `default_*`, `has_*`, `top_type`, `toe_type`, `face_grid`, `internal_grid`, `carcase_joints`, `construction_method_id`) into a new `cabinet_definitions` row, `is_library_item=true`.
- For each ticked preservation item, copy the resolved value into the matching definition `*_overrides` column (and `exposed_interior` if ticked). Unticked → leave `{}` / false.

> The exact set of *preservable* properties is itself a list we'll extend over time (same as subcategories). Start with: carcase material, drawer slide, hinge, handle, toekick material, `exposed_interior`. Each must map to an assembly-level override channel the resolver already reads.

**CHECK-IN 4:** Configure a cabinet (e.g. set a specific drawer slide), Save to library with that one item preserved, place the new definition into a *different* job → it adopts the new job's materials/hardware **except** the preserved drawer slide, which arrives as a clearable assembly-level override.

---

## 6. Fillers / panels / bulkheads / under-panels (folded into the above)

These are **not new resolvers** and **not new tables**. Each is a normal `cabinet_definitions` row with `has_carcass=false`, `has_internal=false`, `has_toekick=false`, `has_face=true`, and a single `false_panel` face zone (the face system already supports `face_type: 'false_panel'`, edgebanded all four sides, pulling door material — exactly how end panels already work).

- They still carry an `assembly_class` (base/wall/tall) so material schedules and the cascade resolve correctly; the library **subcategory** (Panels/Fillers) is purely organisational and independent of class. Example: a bulkhead over a wall run = `assembly_class: 'wall'`, library location `Wall → Panels`.
- **Material:** fillers and applied panels ride the **door material** (confirmed) — `false_panel` already does this, so **no material-role toggle is built**. The rare exception uses the existing `material_overrides` channel manually.
- **Cutouts** (e.g. downlight holes in an under-panel) are drill/pocket **operations** on the panel part — never baked into geometry. Same model as sink cutouts and hinge bores.

No extra work beyond seeding a couple of face-only definitions under Panels/Fillers when desired.

---

## 7. Out of scope (separate tickets)

- **`exposed_interior` resolver consumption audit.** The schedule already carries the right material roles (`interior`, `exposed_interior`, `end_panel`, `door_face`, `shelf`) and the instance has the `exposed_interior` boolean (loaded into resolver input) — i.e. the Cabinet-Vision interior/exterior model is ~80% scaffolded already. **Verify how completely the resolver actually swaps materials onto exposed gables when the flag is set**, and finish it if partial. Independent of this build; the library already treats `exposed_interior` as preservable so no library rework is needed later.
- Min/max dimension constraints on definitions.
- Expanded preservable-properties and subcategory lists (to be worked through together).

---

## 8. Stage summary

| Stage | Deliverable | Check-in |
|---|---|---|
| 1 | Schema migration + seed | Schema/FK/trigger/RLS verified; 3 seeds place + resolve |
| 2 | `placeCabinetFromDefinition` service fn | Seed places identically to old path + audit FK stamped |
| 3 | DB-backed sidebar; localStorage removed | Palette renders from DB; placement works |
| 4 | Management page + Save-As modal + preservation | Preserved item lands as clearable assembly override in a new job |

Build sequentially. Resolver untouched throughout.
