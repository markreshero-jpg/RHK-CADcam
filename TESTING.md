# Testing Log

A running ledger of every feature we add, so nothing slips through untested.
You verify by **running the app by hand** (`npm run dev` → http://localhost:3001).

## How to use it

Each feature has a **status**. Move it along as you test:

| Status | Meaning |
| --- | --- |
| 🔲 **To test** | Added, not yet checked in the running app |
| 🧪 **Testing** | Currently trying it out |
| 🔧 **Needs change** | Tried it — something's wrong. Details in **Notes** |
| ✅ **Pass** | Tried it, works as intended |

**The loop:**
1. We ship a feature → I add a row here as 🔲 **To test**.
2. You run the app, try it, set the status.
3. If 🔧 **Needs change**, write what's wrong in Notes → I fix it → row resets to 🔲.
4. When it's right → ✅ **Pass**.

> Tip: when we change something, any **passed** feature near that code should drop back to 🔲 — a change can break what used to work. Flag those and I'll reset them.

---

## Custom parts (parametric fillers / panels / end panels)

| Feature | Added | Status | Notes |
| --- | --- | --- | --- |
| Formula engine + carry params to library (Stage 2) | — | 🔲 To test | |
| Formula-aware parts editor (Stage 3) | — | 🔲 To test | |
| Optimiser cut-list + `no_cnc` + material-by-role (Stage 5) | — | 🔲 To test | |
| `show_in_room` toggle + render in room 3D view | — | 🔲 To test | |
| Render in room elevation view (`show_in_room`) | — | 🔲 To test | |
| Render in room plan view (`show_in_room`) | — | 🔲 To test | |
| Orientation (flat/side/front) so panels stand upright | — | 🔲 To test | |
| Edge banding on custom parts (3D) | — | 🔲 To test | |
| Live-sync add/edit/delete to room views (no refresh) | — | 🔲 To test | |

## Cabinet library

| Feature | Added | Status | Notes |
| --- | --- | --- | --- |
| Redesign as category drop-downs / compact list view | — | 🔲 To test | |
| Nested categories — right-click "New category" | — | 🔲 To test | |
| Save modal — navigate nested category tree | — | 🔲 To test | |
| Save-to-library fails on cabinets with no face_grid (fix) | — | 🔲 To test | |
| Refresh sidebar after Save-to-library | — | 🔲 To test | |
| Right-click a cabinet to delete | — | 🔲 To test | |
| Move cabinet to another category | — | 🔲 To test | |
| Rename + Duplicate cabinet, Save toast | — | 🔲 To test | |
| Sidebar — name-only list with category + row separators | — | 🔲 To test | |
| Drag-and-drop placement from library onto plan canvas | — | 🔲 To test | |
| Management page — Excel-style editable cabinet table | — | 🔲 To test | |

## CNC / optimiser

| Feature | Added | Status | Notes |
| --- | --- | --- | --- |
| Emit gang drilling band-by-band | — | 🔲 To test | |
| Skip cabinets deleted after nesting (seam-drill sync) | — | 🔲 To test | |
| Machine axis/origin config, top-left nesting, hole face-mirroring | — | 🔲 To test | |
| Simulator — honour G41/G42 cutter comp | — | 🔲 To test | |
| Slide drilling editor — per-op tool picker | — | 🔲 To test | |

## 3D / inspector

| Feature | Added | Status | Notes |
| --- | --- | --- | --- |
| Edit part sizes inline from right-click inspector | — | 🔲 To test | |
| seamDrillSync — bridge shelf/divider-mounted hinge plates | — | 🔲 To test | |
| Add/Edit Part modal — fixed constant height | — | 🔲 To test | |

## Join Kicks (in progress)

The joined kick is a **standalone "kick assembly"** (its own labelled object,
toe-kick only) — not attached to a cabinet.

| Feature | Added | Status | Notes |
| --- | --- | --- | --- |
| `kick_runs` table + types | 2026-06-16 | 🔲 To test | Migrations `kick_runs_join_kicks` + `kick_run_separate_assembly` applied |
| Right-click "Join kicks in run" → standalone kick assembly | 2026-06-16 | 🔲 To test | Auto-detects the run; creates a separate "KICK n" object; members drop their own kicks |
| Kick assembly is selectable / movable / deletable on its own | 2026-06-16 | 🔲 To test | In **elevation + 3D** (hidden in plan). Right-click → only Separate + Delete |
| Right-click "Separate kicks" → back to per-cabinet | 2026-06-16 | 🔲 To test | From the assembly OR any member; deletes the assembly, members regain kicks |
| Mixed-depth run → warning, build kick to deepest | 2026-06-16 | 🔲 To test | OK/Cancel `confirm`; on OK kick spans to the deepest member's front line |
| Kick assembly is fully independent once detached | 2026-06-21 | 🔲 To test | Moving/resizing a member does NOT re-fit the assembly; it only changes when you move/resize it directly |
| Delete the kick assembly → kick GONE, members stay kick-less | 2026-06-21 | ✅ Pass | Detached, deleted, stretched — kick stays gone. Members remain raised carcases (no reattach). Confirmed by hand |
| Delete a member → assembly left alone (cleaned up if none left) | 2026-06-21 | 🔲 To test | |
| Kick assembly doesn't block dragging cabinets in the run | 2026-06-16 | 🔲 To test | Excluded from collision/slotting |
| Shows as its own labelled line in reports / cut-list | 2026-06-16 | 🔲 To test | "KICK n" assembly with toe-kick parts |
| Oversized run splits into equal segments | 2026-06-16 | 🔲 To test | Default = whole run unless a max segment length is set |
| "Kick split…" settings — max segment length + equal/exact | 2026-06-18 | 🔲 To test | Right-click kick assembly → set mm; live piece preview; kick re-segments on Save |
| Kick assembly resizes / moves freely over its own run | 2026-06-20 | 🔲 To test | Spans its run members; clamps against other cabinets/panels/kick runs in the way (can't overrun a cabinet that has its own kick) |
| Right-click kick assembly → Edit… opens the edit modal | 2026-06-20 | 🔲 To test | Structure tabs (Face/Interior/Joints/Tree) hidden; Parts/3D/Top/Elev/Side/Overrides shown |
| Kick scribes | 2026-06-20 | ✅ Pass | Confirmed working by hand |
| Detach a SINGLE cabinet's kick | 2026-06-21 | 🔲 To test | Right-click a floor cabinet → "Detach kick" (own assembly); "Join kicks in run" still does the whole run |
| Detached cabinet = carcase-only ("B" model) | 2026-06-21 | 🔲 To test | Member becomes kick-less: dy = carcase height, raised by kick height (pos_z), has_toekick=false. Carcase parts identical → cut-list unchanged |
| Editable DY of a detached cabinet = carcase height | 2026-06-21 | 🔲 To test | Panel DY field is the carcase height; adjust cabinet heights directly |
| Kick assembly height (DY) drives the kick height | 2026-06-21 | 🔲 To test | Resize the KICK assembly taller/shorter → toe height follows (face/ladder/spreaders) |
| Elevation Y-chain shows kick + gap + carcase | 2026-06-21 | 🔲 To test | Detached member: kick (assembly height) + gap (if kick shorter than the raise) + carcase. Kick excluded from the X chain |
| Legacy detached runs auto-migrate to "B" on load | 2026-06-21 | 🔲 To test | Old runs (kick still on cabinet) self-heal once when the room loads |
| Top/Elevation/Side views default ~20% more zoomed out | 2026-06-20 | 🔲 To test | Dimension chains no longer clipped at edges |

## Toe-kick scribes

| Feature | Added | Status | Notes |
| --- | --- | --- | --- |
| Left/right kick scribes inset the kick in the resolver | 2026-06-20 | ✅ Pass | TOESCL/TOESCR now applied (were config-only); kick face insets from the ends. Run kick insets at the run ends |
| Edit modal → sidebar → "Kick Scribes (mm)" (per-cabinet) | 2026-06-20 | ✅ Pass | In the right-hand properties panel under Scribes/Toe Kick. Front/Back/Left/Right editable; blank = inherited from CM; live re-resolve. Shows for any cabinet with a kick + the kick assembly |
