# Edge-band edit — see and toggle tape on the part's edges

> **Purpose**: the living spec for editing edge banding straight on the 3D parts
> in the Cabinet Edit modal. Update status lines and decisions in the same
> change as the code.
>
> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked
>
> **RESUME HERE** → EB1 + EB2 built 2026-10-26, headless-checked, in-app checks pending.
> Possible later: bulk picks ("all front edges", "all visible edges").

## Asked for (Mark, 2026-10-26)

"When editing edge banding we can see each edge that has banding applied … it
would have to be in the cabinet edit modal so you can see the parts. Once you
click on a part you can right click on it and edit edge banding, or the edge
banding tool shows straight away when you're on a part, but edged sides would
have to be a different colour."

## Locked decisions

1. **In the Cabinet Edit modal's 3D view**, on the picked part (parts are picked
   with a right-click there, as before).
2. **Shows straight away** (Mark's second option): picking a part draws its four
   edges on the 3D part — **taped = cyan, untaped = rose**, white on hover. A
   click on an edge toggles its tape. No extra menu step.
3. **Same data as the properties panel's edge ticks** — the two stay in step:
   the part row is updated and the hand edit recorded in
   `cabinet_instances.edge_overrides` (`saveSVGEdge`), so it survives re-resolves;
   added parts keep their edges on their own row. No schema change.
4. **Board parts only**: case, kick, internal, fronts (zones) and added parts —
   the set the panel's ticks save. Hardware (runners, hinges, handles, bins) and
   shaped parts (their tape is cut from the outline) show no edge targets.
5. Works in solid and wire.
6. **Paint mode (EB2, Mark 2026-10-26 "lets try")**: an **Edge banding** button
   (bottom right of the 3D view) or right-click a part → **Edit edge banding (all
   parts)** turns it on. Every board part shows its edges at once. A bar at the top
   picks the brush: **Toggle** (flip), **Edge** (tape), **No edge** (bare);
   **Shift+click** applies it to all four edges of that part. Done / Esc leaves the
   mode (Esc no longer closes the modal while painting). Each click saves at once
   through the same path as decision 3 (edge_overrides saves are chained per cabinet,
   so fast clicks don't lose each other).

## Build

- `src/components/three/PartViewer.tsx`: `EdgeEditContext` ({ partId, onToggle });
  `Part` draws `edgeTargetMeshes` for the matching part — each edge's
  `edgeStrips` band (≤ 4 mm into the panel), grown 1 mm proud of every face so it
  reads over the part and takes the click; drag-guarded like part picks.
- `app/canvas/[roomId]/Cabinet3DView.tsx`: provides the context around
  `CabinetScene` for the selected board part; the toggle goes through
  `handleEdgeChange` (the panel's own path). Hint line explains the colours.
- Check: `z_plan_automation/verify-edgeband-edit.mjs` (Test Kitchen BC-01: open the
  modal, 3D, Wire off, right-click the left door → four cyan edges; click its left
  edge → Left tick clears, edge turns rose; click again → back). Passed 2026-10-26;
  BC-01 left as it was.
- EB2: `EdgeEditContext` grew `all(meta)` (paint mode: which parts show targets) and
  `onToggle(meta, side, whole)`; `Cabinet3DView` holds `ebPaint` (brush) and
  `saveEdge(part, edge)` for any part. Tutorial lesson `edgeband_edit` (events
  `edgeband_part_edge`, `edgeband_paint`, `edgeband_paint_edge`).
  Check: `z_plan_automation/verify-edgeband-paint.mjs` (BRUSH=tape SHIFT=1 CLICKS=867,396
  ESC=1 → BC-01 right side all four edges taped in the DB, Esc leaves the mode with
  the modal open). Passed 2026-10-26; BC-01 restored.

## Phases

| Phase | Scope | Status |
|---|---|---|
| EB1 | Edges on the picked part, click to toggle (decisions 1–5) | [x] built 2026-10-26, in-app check pending |
| EB2 | Paint mode across every part (decision 6): Toggle / Edge / No edge brush, Shift+click = whole part | [x] built 2026-10-26, in-app check pending |
| EB3 | Optional: bulk picks ("all front edges", "all visible edges") | [ ] only if asked |

## Known gaps

- The first click after a right-click closes the part menu (it doesn't toggle) —
  same as any click while that menu is open.
- Tape colour isn't shown per tape type (exposed vs carcass) — cyan = taped.
