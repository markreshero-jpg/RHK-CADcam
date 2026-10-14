# Internal Dividers — Spec

**Status:** decisions locked 2026-10-14, nothing built. Next = V1.
**Owner module:** `z_dividers/`
**Touches:** internal section tree (`internal_grid`), `resolveInternal`,
`resolveDrawerStack`, `InternalGridEditor`, `FaceGridEditor`, cut list / 3D /
elevation (through the existing divider parts), finger rails (`z_handles` H5b).

---

## 1. Goal

A vertical divider can be **single** (one panel, as today) or **double** (two
panels back to back). Drawers side by side switch to a double divider on their
own, because each drawer needs its own panel for its runners (and, with finger
pulls, for its backing rail, see `z_handles` D15). The user can switch it back.

## 2. What exists today (2026-10-14)

- Dividers are the separators of a `vsplit` in the section tree
  (`SectionChild`, `src/lib/resolver/types.ts`). Each one is a single panel,
  `gapThickness` = matT, emitted by `resolveInternal` as `part_type: 'divider'`.
- The interior tree and the face grid are separate. Nothing ties a divider
  to the gap between two fronts.
- **Bug:** on a plain (non-shaped) cabinet, `resolveDrawerStack` sizes every
  drawer box across the whole carcass (`leftMemberX = T + SCRL`,
  `rightMemberX = DX − T − SCRR`) whatever column the front is in, so drawers
  side by side overlap. Only shaped cabinets work out a real opening span.

## 3. Locked decisions (user, 2026-10-14)

**V-D1. Single or double, chosen on the divider.** Clicking a divider in the
internal editor offers Single / Double.

**V-D2. Double = back to back.** Two panels touching, 2 × matT thick (36 on 18
board). Each drawer runs on its own panel's outer face. No gap rule.

**V-D3. Automatic for drawers side by side.** When drawer fronts sit in
neighbouring face-grid columns, the cabinet gets a double divider centred on
the gap between those fronts, running the full height of the drawer rows. It
is created if missing, or moved and converted if a divider is already near
the seam. A pop-up note explains why (each drawer needs its own panel for
its runners and finger rail), and says it can be switched back to single.

**V-D4. The user can override.** The divider's choice is stored on the child:
`divider?: 'single' | 'double'`. Undefined = automatic (double for drawers
side by side, otherwise single). An explicit value always wins, so
switching back to single sticks and the automatic rule never flips it again.

## 4. Data model

```ts
// SectionChild (vsplit only): the divider AFTER this child.
divider?: 'single' | 'double'   // undefined = automatic (V-D4)
```

Lives in `internal_grid` JSON, so no migration is needed. The resolver works out
the automatic value from the face grid each time, and that is what the editor shows.

## 5. Phases

| Phase | Scope | Status |
|---|---|---|
| **V1** | Model + resolver: `divider` field, double = two `divider` parts back to back, `gapThickness` 2 × matT (resolver + editor mirror), cut list / 3D / elevation / joint drilling on both panels | not started |
| **V2** | Drawer runners mount to their compartment: a drawer's box spans the side / divider faces of its own column (fixes the §2 bug) | not started |
| **V3** | Internal editor: click a divider → Single / Double / Automatic | not started |
| **V4** | Automatic rule (V-D3): drawers in neighbouring columns → double divider centred on the front gap, created or moved; pop-up note in the face grid editor; explicit override sticks; resolver warning for drawers side by side with no divider | not started |

After V4, `z_handles` H5b (rails per column) can split rails at the dividers.

## 6. Open questions

1. Doors beside drawers (one column of each): the automatic rule only covers
   drawer beside drawer. Single stays the default there.
2. Partial-height dividers where only some rows are drawers side by side:
   the double runs the height of the drawer rows (V-D3). Check what happens
   above them during V4.
