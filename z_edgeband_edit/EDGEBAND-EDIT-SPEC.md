# Edge-band edit — see and toggle tape on the part's edges

> **Purpose**: the living spec for editing edge banding straight on the 3D parts
> in the Cabinet Edit modal. Update status lines and decisions in the same
> change as the code.
>
> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked
>
> **RESUME HERE** → EB1 built 2026-10-26, headless-checked, in-app check pending.
> EB2 (paint across parts) only if Mark asks for it after using EB1.

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

## Phases

| Phase | Scope | Status |
|---|---|---|
| EB1 | Edges on the picked part, click to toggle (decisions 1–5) | [x] built 2026-10-26, in-app check pending |
| EB2 | Optional: right-click → "Edit edge banding" paint mode across every part (all parts show their edges; Edge / No edge chips; bulk "all front edges") | [ ] only if asked |

## Known gaps

- The first click after a right-click closes the part menu (it doesn't toggle) —
  same as any click while that menu is open.
- Tape colour isn't shown per tape type (exposed vs carcass) — cyan = taped.
