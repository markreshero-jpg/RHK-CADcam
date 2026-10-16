"""Parametric pull-out bin generator -> GLB + JSON sidecar.

Default product: Nikpol Teramo 74L (2 x 37L), from supplier drawing:
  internal cabinet width 362-380, height 540, depth 520.

Conventions (RHK-CADcam):
  Built in mm, exported in metres (MM = 0.001).
  Origin = bottom-left-back of the cabinet INTERNAL space.
  X = width, Y = up, Z = toward front (glTF Y-up).

What moves with the inputs:
  width   -> frame plate, carrier rails stretch; runners stay on the sides;
             bins, rims, lids stay centred at fixed moulded size
  height  -> bin bodies stretch vertically; frame/runner/lid sizes fixed,
             everything above the bins rides on the top
  depth   -> frame, runners, carrier stretch; bins stay fixed size and are
             spaced evenly front/back
  extension (0..1) -> moving group (carrier, bins, lids) slides +Z

Node tree in the GLB:
  pullout_bin
    fixed_frame  (plate, skirts, back, runner bodies)  -> mounts to cabinet
    moving       (carrier, bins, rims, lids, handles)  -> animate along +Z

Usage:
  python3 build_bin.py                       # Teramo defaults
  python3 build_bin.py --width 370 --height 560 --depth 540 --extension 1
  python3 build_bin.py --width 400 --out custom.glb
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
    """Fixed data for one product (a library row). Not cabinet-dependent."""
    name: str = "Nikpol Teramo 74L (2 x 37L)"
    generator: str = "pullout_bin_v1"
    bin_count: int = 2
    litres_each: float = 37.0
    # Supplier fitting range (internal cabinet dims, mm)
    width_min: float = 362.0
    width_max: float = 380.0
    height_nominal: float = 540.0
    depth_min: float = 520.0
    # Fixed moulded bin sizes (W x D, mm)
    bin_top: tuple = (318.0, 242.0)
    bin_bottom: tuple = (292.0, 218.0)
    rim: tuple = (320.0, 246.0)
    lid: tuple = (316.0, 242.0)
    # Fixed hardware section sizes (mm)
    frame_drop: float = 130.0      # top frame skirt height
    plate_t: float = 2.0
    skirt_t: float = 1.5
    runner_w: float = 10.0
    runner_h: float = 35.0
    runner_top_gap: float = 3.0    # below the plate
    carrier_h: float = 25.0
    carrier_rail_w: float = 12.0
    rim_h: float = 12.0
    lid_h: float = 12.0
    handle: tuple = (100.0, 10.0, 20.0)  # W x H x D
    end_gap: float = 5.0           # front/back clearance
    travel_ratio: float = 0.9      # full extension as a fraction of depth
    # Fixing brackets (assumed - check against Nikpol install template)
    bracket_inset_z: float = 37.0
    bracket_hole_dy: float = 16.0
    bracket_hole_dia: float = 3.0
    bracket_hole_depth: float = 10.0


@dataclass
class Placement:
    """Per-instance inputs: the cabinet's resolved internal space."""
    width: float = 370.0
    height: float = 540.0
    depth: float = 520.0
    extension: float = 0.0   # 0 = closed, 1 = fully open


@dataclass
class BuildResult:
    scene: trimesh.Scene
    clearance: dict
    operations: list
    warnings: list = field(default_factory=list)


# ---------------------------------------------------------------- helpers
def _mat(name, rgb, metal=0.0, rough=0.6):
    return PBRMaterial(name=name, baseColorFactor=[*rgb, 255],
                       metallicFactor=metal, roughnessFactor=rough)


MATS = {
    "frame": _mat("frame_steel", (190, 192, 196), 0.8, 0.35),
    "runner": _mat("runner_zinc", (160, 162, 166), 0.9, 0.3),
    "carrier": _mat("carrier_plastic", (70, 72, 76)),
    "bin": _mat("bin_plastic", (90, 92, 96)),
    "lid": _mat("lid_plastic", (205, 207, 210)),
}


def _box(x0, y0, z0, x1, y1, z1, m):
    b = trimesh.creation.box(extents=[x1 - x0, y1 - y0, z1 - z0])
    b.apply_translation([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2])
    b.visual = trimesh.visual.TextureVisuals(material=MATS[m])
    return b


def _frustum(cx, cz, y0, y1, top_wd, bot_wd, m):
    (tw, td), (bw, bd) = top_wd, bot_wd
    pts = [[cx + sx * w / 2, y, cz + sz * d / 2]
           for y, w, d in ((y0, bw, bd), (y1, tw, td))
           for sx in (-1, 1) for sz in (-1, 1)]
    f = trimesh.convex.convex_hull(np.array(pts))
    f.visual = trimesh.visual.TextureVisuals(material=MATS[m])
    return f


# ---------------------------------------------------------------- generator
def build(p: Placement, s: ProductSpec = ProductSpec()) -> BuildResult:
    W, H, D = p.width, p.height, p.depth
    warn = []

    # --- validation against supplier range
    if not s.width_min <= W <= s.width_max:
        warn.append(f"width {W:g} outside supplier range "
                    f"{s.width_min:g}-{s.width_max:g}")
    if abs(H - s.height_nominal) > 0.5:
        warn.append(f"height {H:g} differs from nominal {s.height_nominal:g}; "
                    "bin bodies stretched - not a stock size")
    if D < s.depth_min:
        warn.append(f"depth {D:g} below minimum {s.depth_min:g}")
    if W < s.rim[0] + 2 * (s.runner_w + s.skirt_t):
        warn.append("width too narrow - bin rims clash with runners")
    bins_len = s.bin_count * s.rim[1]
    if D - 2 * s.end_gap < bins_len:
        warn.append("depth too short for bins - geometry overlaps")

    ext = min(max(p.extension, 0.0), 1.0)
    travel = s.travel_ratio * D
    g = s.end_gap

    # --- vertical stack, measured down from the top (fixed sizes)
    y_plate0 = H - s.plate_t
    y_run1 = y_plate0 - s.runner_top_gap
    y_run0 = y_run1 - s.runner_h
    y_car1 = y_run0
    y_car0 = y_car1 - s.carrier_h
    y_lid1 = y_car1 + s.lid_h - 5          # lid sits just proud of carrier
    y_lid0 = y_lid1 - s.lid_h
    y_bin1 = y_lid0                          # bin top/rim under lid
    y_bin0 = 0.0                             # bins reach the base -> stretch

    fixed, moving = {}, {}

    # --- fixed frame (stretches W, D)
    fixed["frame_top_plate"] = _box(0, y_plate0, 0, W, H, D, "frame")
    fixed["frame_skirt_L"] = _box(0, H - s.frame_drop, 0, s.skirt_t, y_plate0, D, "frame")
    fixed["frame_skirt_R"] = _box(W - s.skirt_t, H - s.frame_drop, 0, W, y_plate0, D, "frame")
    fixed["frame_back"] = _box(0, H - s.frame_drop, 0, W, y_plate0, s.skirt_t, "frame")
    xr0, xr1 = s.skirt_t, s.skirt_t + s.runner_w
    fixed["runner_L"] = _box(xr0, y_run0, g, xr1, y_run1, D - g, "runner")
    fixed["runner_R"] = _box(W - xr1, y_run0, g, W - xr0, y_run1, D - g, "runner")

    # --- moving carrier (stretches W, D)
    cx0 = xr1
    cx1 = W - xr1
    rw = s.carrier_rail_w
    moving["carrier_side_L"] = _box(cx0, y_car0, g, cx0 + rw, y_car1, D - g, "carrier")
    moving["carrier_side_R"] = _box(cx1 - rw, y_car0, g, cx1, y_car1, D - g, "carrier")
    moving["carrier_back"] = _box(cx0, y_car0, g, cx1, y_car1, g + 10, "carrier")
    moving["carrier_front"] = _box(cx0, y_car0, D - g - 10, cx1, y_car1, D - g, "carrier")

    # --- bins: fixed plan size, centred in X, evenly pitched in Z
    pitch = (D - 2 * g) / s.bin_count
    labels = ["back", "front"] if s.bin_count == 2 else [str(i) for i in range(s.bin_count)]
    for i, name in enumerate(labels):
        cz = g + pitch * (i + 0.5)
        cx = W / 2
        if i < s.bin_count - 1:
            zc = g + pitch * (i + 1)
            moving[f"carrier_mid_{i}"] = _box(cx0, y_car0, zc - 5, cx1, y_car1, zc + 5, "carrier")
        moving[f"bin_{name}"] = _frustum(cx, cz, y_bin0, y_bin1 - s.rim_h,
                                         s.bin_top, s.bin_bottom, "bin")
        rw_, rd_ = s.rim
        moving[f"bin_{name}_rim"] = _box(cx - rw_ / 2, y_bin1 - s.rim_h, cz - rd_ / 2,
                                         cx + rw_ / 2, y_bin1, cz + rd_ / 2, "bin")
        lw, ld = s.lid
        moving[f"lid_{name}"] = _box(cx - lw / 2, y_lid0, cz - ld / 2,
                                     cx + lw / 2, y_lid1, cz + ld / 2, "lid")
        hw, hh, hd = s.handle
        moving[f"lid_{name}_handle"] = _box(cx - hw / 2, y_lid1, cz + ld / 2 - 5 - hd,
                                            cx + hw / 2, y_lid1 + hh, cz + ld / 2 - 5, "lid")

    # --- assemble scene with node hierarchy
    scene = trimesh.Scene()
    eye = np.eye(4)
    slide = np.eye(4)
    slide[2, 3] = ext * travel * MM
    scene.graph.update(frame_from="world", frame_to="pullout_bin", matrix=eye)
    scene.graph.update(frame_from="pullout_bin", frame_to="fixed_frame", matrix=eye)
    scene.graph.update(frame_from="pullout_bin", frame_to="moving", matrix=slide)
    for parent, group in (("fixed_frame", fixed), ("moving", moving)):
        for n, m in group.items():
            m.apply_scale(MM)
            scene.add_geometry(m, node_name=n, geom_name=n, parent_node_name=parent)

    # --- clearance envelope (closed), plus swept volume when open
    clearance = {
        "closed_mm": {"min": [0, 0, 0], "max": [W, H, D]},
        "open_mm": {"min": [0, 0, 0], "max": [W, H, D + travel]},
        "travel_mm": round(travel, 1),
    }

    # --- fixing operations on host cabinet sides (assumed bracket positions)
    ops = []
    y_br = (y_run0 + y_run1) / 2
    for host, face_x in (("side_L", 0.0), ("side_R", W)):
        for z in (s.bracket_inset_z, D - s.bracket_inset_z):
            for dy in (-s.bracket_hole_dy / 2, s.bracket_hole_dy / 2):
                ops.append({
                    "host_part": host,
                    "type": "drill",
                    "face": "inside",
                    "pos_mm": [face_x, round(y_br + dy, 1), round(z, 1)],
                    "dia_mm": s.bracket_hole_dia,
                    "depth_mm": s.bracket_hole_depth,
                    "source": "hardware:" + s.generator,
                    "note": "assumed bracket position - verify with install template",
                })

    return BuildResult(scene, clearance, ops, warn)


# ---------------------------------------------------------------- CLI
def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--width", type=float, default=370.0, help="internal width mm")
    ap.add_argument("--height", type=float, default=540.0, help="internal height mm")
    ap.add_argument("--depth", type=float, default=520.0, help="internal depth mm")
    ap.add_argument("--extension", type=float, default=0.0, help="0 closed .. 1 open")
    ap.add_argument("--out", default="nikpol-teramo-74L.glb")
    a = ap.parse_args()

    pl = Placement(a.width, a.height, a.depth, a.extension)
    spec = ProductSpec()
    r = build(pl, spec)
    r.scene.export(a.out)

    sidecar = {
        "product": asdict(spec),
        "placement": asdict(pl),
        "units": "glb in metres; sidecar in mm",
        "origin": "bottom-left-back of cabinet internal space, Y up, +Z front",
        "nodes": {"fixed": "fixed_frame", "moving": "moving", "slide_axis": "+Z"},
        "clearance": r.clearance,
        "operations": r.operations,
        "warnings": r.warnings,
    }
    side = a.out.rsplit(".", 1)[0] + ".json"
    with open(side, "w") as f:
        json.dump(sidecar, f, indent=2)

    print(f"wrote {a.out} and {side}")
    print("bounds (mm):", (r.scene.bounds / MM).round(1).tolist())
    for w in r.warnings:
        print("WARNING:", w)


if __name__ == "__main__":
    main()
