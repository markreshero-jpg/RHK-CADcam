"""Parametric drawer runner generator -> GLB + JSON sidecar.

Default product: DTC Dragon Pro (metal drawer side + undermount runner).
Cross-section taken from the shop's existing DTC_DragonPro_{95,127,178}x500.glb
(all three are one 16-point profile, extruded 500 deep; only the wall height
changes). This script rebuilds that profile for ANY length and height, split
into named parts so the app can slide the drawer side out.

Conventions (RHK-CADcam — same as z_bin_cabinet/build_bin.py):
  Built in mm, exported in metres (MM = 0.001).
  LEFT-hand runner only; the app mirrors it for the right.
  Origin = gable inner face, at the drawer-box bottom line, at the BACK of
  the runner.  X = in from the gable toward the drawer, Y = up, Z = toward the
  FRONT (Z = 0 back, Z = length front). glTF Y-up.

Cross-section (front view, left runner, mm). H = box height:

   y
   H  +--+            drawer side wall (moving)       x: 9..22
      |  |
   29 |  +----------+                                 ledge x: 22..41, y: 28..29
   28 +--+--+----+--+  runner block (fixed) x: 26.5..37.5, y: 20.5..28
      |  |  |    |                                     web   x: 34.5..37.5, y: 11.5..20.5
      |  |  +--+ |                                     foot  x: 34.5..54.5, y: 10.5..11.5
      |  |     | +---------+
    0 +--+     +-----------+
      9 10              54.5   x  (skin x: 9..10, y: 0..28, moving)

What moves with the inputs:
  length (NL) -> every part extrudes 0..NL in Z (end gaps keep the runner
                 inside the drawer side)
  height (H)  -> only the drawer side wall grows; the runner section is fixed
  extension   -> moving group (drawer side, ledge, skin, front bracket) slides +Z

Assumed (not in the source GLBs — check against the DTC catalogue):
  mount_flange : the cabinet member's flange screwed to the gable (x 0..2)
                 joined to the runner block by a web — the source profile stops
                 9mm short of the gable.
  front_bracket: the drawer-front fixing bracket on the drawer side.

Node tree in the GLB:
  drawer_runner
    fixed   (runner block, web, foot, mount flange)  -> screws to the gable
    moving  (skin, wall, ledge, front bracket)      -> animate along +Z

Gable drilling is NOT in here: the app drills from the product's drill ops.

Usage:
  python3 build_runner.py                          # Dragon Pro 500 x 127
  python3 build_runner.py --length 450 --height 178
  python3 build_runner.py --length 300 --height 95 --extension 1 --out dp_300x95.glb
"""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass, field

import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial

MM = 0.001


# ---------------------------------------------------------------- params
@dataclass
class ProductSpec:
    """Fixed data for one runner family (a library row's 'drawn as')."""
    name: str = "DTC Dragon Pro"
    generator: str = "drawer_runner_v1"
    # Supplier sizes (mm) — the hardware rows carry the real list
    lengths: tuple = (270, 300, 350, 400, 450, 500, 550)
    heights: tuple = (95, 127, 178)
    # --- drawer side (moving), from the source profile
    skin_x: tuple = (9.0, 10.0)        # outer skin, full height of the runner zone
    skin_top: float = 28.0
    wall_x: tuple = (9.0, 22.0)        # double-wall side, 28 .. H
    wall_bottom: float = 28.0
    ledge_x: tuple = (22.0, 41.0)      # drawer bottom sits on this
    ledge_y: tuple = (28.0, 29.0)
    # --- runner (fixed), from the source profile
    block_x: tuple = (26.5, 37.5)
    block_y: tuple = (20.5, 28.0)
    web_x: tuple = (34.5, 37.5)
    web_y: tuple = (11.5, 20.5)
    foot_x: tuple = (34.5, 54.5)
    foot_y: tuple = (10.5, 11.5)
    runner_end_gap: float = 10.0       # runner stops short of the side's ends
    # --- assumed parts
    mount_flange: bool = True
    flange_x: tuple = (0.0, 2.0)
    flange_y: tuple = (10.5, 28.0)
    flange_web_y: tuple = (20.5, 22.0)  # joins the flange to the runner block
    front_bracket: bool = True
    bracket_x: tuple = (10.0, 22.0)
    bracket_h: float = 60.0            # capped at H - 40
    bracket_d: float = 20.0
    travel_ratio: float = 0.95         # full extension as a fraction of length


@dataclass
class Placement:
    """Per-instance inputs: the product row's nominal length + box height."""
    length: float = 500.0
    height: float = 127.0
    extension: float = 0.0   # 0 = closed, 1 = fully open


@dataclass
class BuildResult:
    scene: trimesh.Scene
    clearance: dict
    warnings: list = field(default_factory=list)


# ---------------------------------------------------------------- helpers
def _mat(name, rgb, metal=0.0, rough=0.6):
    return PBRMaterial(name=name, baseColorFactor=[*rgb, 255],
                       metallicFactor=metal, roughnessFactor=rough)


MATS = {
    "side": _mat("side_steel_white", (232, 233, 235), 0.3, 0.45),  # powder-coated side
    "runner": _mat("runner_zinc", (160, 162, 166), 0.9, 0.3),
    "bracket": _mat("bracket_plastic", (70, 72, 76)),
}


def _box(x0, y0, z0, x1, y1, z1, m):
    b = trimesh.creation.box(extents=[x1 - x0, y1 - y0, z1 - z0])
    b.apply_translation([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2])
    b.visual = trimesh.visual.TextureVisuals(material=MATS[m])
    return b


# ---------------------------------------------------------------- generator
def build(p: Placement, s: ProductSpec = ProductSpec()) -> BuildResult:
    L, H = p.length, p.height
    warn = []

    if L not in s.lengths:
        warn.append(f"length {L:g} is not a stock {s.name} length {list(s.lengths)}")
    if H not in s.heights:
        warn.append(f"height {H:g} is not a stock {s.name} height {list(s.heights)}")
    if H <= s.ledge_y[1] + 10:
        warn.append(f"height {H:g} too low for the side wall")
    if L <= 2 * s.runner_end_gap + 20:
        warn.append(f"length {L:g} too short")

    ext = min(max(p.extension, 0.0), 1.0)
    travel = s.travel_ratio * L
    g = s.runner_end_gap

    fixed, moving = {}, {}

    # --- drawer side (moving): skin, wall, ledge — full length
    moving["side_skin"] = _box(s.skin_x[0], 0, 0, s.skin_x[1], s.skin_top, L, "side")
    moving["side_wall"] = _box(s.wall_x[0], s.wall_bottom, 0, s.wall_x[1], H, L, "side")
    moving["side_ledge"] = _box(s.ledge_x[0], s.ledge_y[0], 0, s.ledge_x[1], s.ledge_y[1], L, "side")
    if s.front_bracket:
        bh = min(s.bracket_h, H - 40)
        if bh > 0:
            y0 = s.ledge_y[1]
            moving["front_bracket"] = _box(s.bracket_x[0], y0, L - s.bracket_d,
                                           s.bracket_x[1], y0 + bh, L, "bracket")

    # --- runner (fixed): block, web, foot — inset from the ends
    fixed["runner_block"] = _box(s.block_x[0], s.block_y[0], g, s.block_x[1], s.block_y[1], L - g, "runner")
    fixed["runner_web"] = _box(s.web_x[0], s.web_y[0], g, s.web_x[1], s.web_y[1], L - g, "runner")
    fixed["runner_foot"] = _box(s.foot_x[0], s.foot_y[0], g, s.foot_x[1], s.foot_y[1], L - g, "runner")
    if s.mount_flange:
        fixed["mount_flange"] = _box(s.flange_x[0], s.flange_y[0], g, s.flange_x[1], s.flange_y[1], L - g, "runner")
        fixed["mount_web"] = _box(s.flange_x[1], s.flange_web_y[0], g, s.block_x[0], s.flange_web_y[1], L - g, "runner")

    # --- scene: drawer_runner -> fixed / moving
    scene = trimesh.Scene()
    eye = np.eye(4)
    slide = np.eye(4)
    slide[2, 3] = ext * travel * MM
    scene.graph.update(frame_from="world", frame_to="drawer_runner", matrix=eye)
    scene.graph.update(frame_from="drawer_runner", frame_to="fixed", matrix=eye)
    scene.graph.update(frame_from="drawer_runner", frame_to="moving", matrix=slide)
    for parent, group in (("fixed", fixed), ("moving", moving)):
        for n, m in group.items():
            m.apply_scale(MM)
            scene.add_geometry(m, node_name=n, geom_name=n, parent_node_name=parent)

    x_max = max(s.foot_x[1], s.ledge_x[1])
    clearance = {
        "closed_mm": {"min": [0, 0, 0], "max": [x_max, H, L]},
        "open_mm": {"min": [0, 0, 0], "max": [x_max, H, L + travel]},
        "travel_mm": round(travel, 1),
    }
    return BuildResult(scene, clearance, warn)


# ---------------------------------------------------------------- CLI
def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--length", type=float, default=500.0, help="nominal length (NL) mm")
    ap.add_argument("--height", type=float, default=127.0, help="box height mm")
    ap.add_argument("--extension", type=float, default=0.0, help="0 closed .. 1 open")
    ap.add_argument("--out", default=None, help="default: dragon_pro_<L>x<H>.glb")
    a = ap.parse_args()

    pl = Placement(a.length, a.height, a.extension)
    spec = ProductSpec()
    r = build(pl, spec)
    out = a.out or f"dragon_pro_{a.length:g}x{a.height:g}.glb"
    r.scene.export(out)

    sidecar = {
        "product": asdict(spec),
        "placement": asdict(pl),
        "units": "glb in metres; sidecar in mm",
        "origin": "left runner: gable inner face, drawer-box bottom line, back of runner; Y up, +Z front",
        "nodes": {"fixed": "fixed", "moving": "moving", "slide_axis": "+Z"},
        "clearance": r.clearance,
        "warnings": r.warnings,
    }
    side = out.rsplit(".", 1)[0] + ".json"
    with open(side, "w") as f:
        json.dump(sidecar, f, indent=2)

    print(f"wrote {out} and {side}")
    print("bounds (mm):", (r.scene.bounds / MM).round(1).tolist())
    for w in r.warnings:
        print("WARNING:", w)


if __name__ == "__main__":
    main()
