"""Parametric curved vanity end / curved cabinet -> S2M Center DXFs (one per part).

Plan coords: x across, d = depth from front (0 = front face, D = wall).
hand: RH / LH  = one curved end beside a vanity (fixing panel on the vanity side, x = 0)
      DOUBLE   = one cabinet curved on both front corners (no fixing panel)
Loops are lists of (x, d, bulge); bulge = tan(sweep/4) of the arc to the next vertex, + = anticlockwise.
Matches the Vanity Curved End artifact page.
"""
import math, os, sys, json
import ezdxf

DEFAULTS = dict(W=170, D=500, H=500, R=150, FT=18, SK=2, T=16.5, hand="RH", lighten=0, B=60, OS=0, OL=0, OR=0, OG=0, SBK=0, SBT=0, STP=0, blkS=0, blkF=0)
POCK_EXT, OVER, HOLE_D = 3, 8, 5
INSET, BACK_INSET, MAX_PITCH = 50, 40, 250
BLOCK_WIDE, BLOCK_NARROW = 100, 60   # fixing block width: 100 if the straight allows, else 60
THROUGH_EXTRA = 0.2    # through-holes 0.2 mm past the board
OUTLINE_EXTRA = 0      # outlines cut to exactly the board thickness
TB = math.tan(math.pi / 8)


def spread(length, inset, max_pitch):
    span = length - 2 * inset
    if span <= 0:
        return [length / 2]
    n = max(1, math.ceil(span / max_pitch - 1e-9))
    return [inset + span * i / n for i in range(n + 1)]


def corner_arc(x0, x1, d0, d1, CX, CD, r):
    cl = lambda v: max(-1.0, min(1.0, v))
    if r <= 0 or x1 <= CX:
        return None
    a = (x0 - CX) / r
    if a >= 1:
        return {"cut_front": True}
    t_front = math.asin(cl((d0 - CD) / r))
    t_left = -math.inf if a <= -1 else -math.acos(a)
    ts, te = max(t_front, t_left), -math.acos(cl((x1 - CX) / r))
    if te <= ts:
        return None
    return dict(ts=ts, te=te, b=math.tan((te - ts) / 4), on_left=t_left > t_front,
                ps=(CX + r * math.cos(ts), CD + r * math.sin(ts)), pe=(x1, CD + r * math.sin(te)))


def rib_cutout(p, c):
    W, D, FT, T, B = p["W"], p["D"], p["FT"], p["T"], p["B"]
    r = c["RI"] - B
    if c["double"]:
        sT, fT = (T if c["blk_side"] else 0), (T if c["blk_front"] else 0)
        x0, x1, d0, d1 = FT + B + sT, W - FT - B - sT, FT + B + fT, c["Dc"] - T - B
        if x1 - x0 < 30 or d1 - d0 < 30:
            return None
        k = corner_arc(W / 2, x1, d0, d1, c["CX"], c["CD"], r)
        if not k:
            return [(x0, d0, 0), (x1, d0, 0), (x1, d1, 0), (x0, d1, 0)]
        if k.get("cut_front"):
            return None
        ps, pe = k["ps"], k["pe"]
        mps, mpe = (W - ps[0], ps[1]), (W - pe[0], pe[1])
        L = [(x0, d1, 0), (mpe[0], mpe[1], k["b"])]
        if abs(mps[0] - ps[0]) > 0.01:
            L.append((mps[0], mps[1], 0))
        L += [(ps[0], ps[1], k["b"]), (pe[0], pe[1], 0), (x1, d1, 0)]
        return L
    x0 = T + B
    x1 = W - FT - B - (T if c["blk_side"] else 0)
    d0 = FT + B + (T if c["blk_front"] else 0)
    d1 = c["Dc"] - T - B
    if x1 - x0 < 30 or d1 - d0 < 30:
        return None
    rect = lambda d0_: [(x0, d0_, 0), (x1, d0_, 0), (x1, d1, 0), (x0, d1, 0)]
    k = corner_arc(x0, x1, d0, d1, c["CX"], c["CD"], r)
    if not k:
        return rect(d0)
    if k.get("cut_front"):
        d0 = max(d0, c["CD"])
        return None if d1 - d0 < 30 else rect(d0)
    L = [] if k["on_left"] else [(x0, d0, 0)]
    L += [(k["ps"][0], k["ps"][1], k["b"]), (k["pe"][0], k["pe"][1], 0), (x1, d1, 0), (x0, d1, 0)]
    return L


def calc(p):
    W, D, H, R, FT, SK, T = (p[k] for k in ("W", "D", "H", "R", "FT", "SK", "T"))
    E = POCK_EXT
    c = dict(p)
    # scribes: face board keeps D x H; carcass finishes SBK short of the wall, sits SBT up off the floor
    # and stops STP below the top of the face board
    Dc, Hc = D - p.get("SBK", 0), H - p.get("SBT", 0) - p.get("STP", 0)
    c["Dc"], c["Hc"], c["y0"] = Dc, Hc, p.get("SBT", 0)
    c["double"] = p.get("hand") == "DOUBLE"
    c["CX"], c["CD"], c["RI"] = W - R, R, R - SK
    CX = c["CX"]
    c["max_gap"] = 170 if SK <= 2 else 250
    g = 1
    while (Hc - (g + 1) * T) / g >= c["max_gap"] and g < 60:
        g += 1
    c["gaps"], c["pitch"], c["clear"] = g, (Hc - T) / g, (Hc - (g + 1) * T) / g
    c["levels"] = [i * c["pitch"] for i in range(g + 1)]
    c["hole_y"] = [y + T / 2 for y in c["levels"]]
    c["arc"] = math.pi / 2 * R
    if c["double"]:
        side, flat = D - R, W - 2 * R
        OL, OR = p.get("OL", 0), p.get("OR", 0)       # back overhangs; X0 = left wall end
        c["wrap_len"] = OL + 2 * side + 2 * c["arc"] + flat + OR
        pk = [(OL + side - E, OL + side + c["arc"] + E), (OL + side + c["arc"] + flat - E, OL + side + 2 * c["arc"] + flat + E)]
        c["pockets"] = [(pk[0][0], pk[1][1])] if pk[0][1] >= pk[1][0] else pk
        c.update(fix_depth=0, back_w=W - 2 * FT, former_x0=SK, former_w=W - 2 * SK, former_d=Dc - T - SK,
                 fix_to_former_x=[], fix_to_back_y=[])
        if flat > 0.01:
            c["former_loop"] = [(FT, Dc - T, 0), (FT, R, 0), (SK, R, TB), (R, SK, 0), (R, FT, 0), (W - R, FT, 0),
                                (W - R, SK, TB), (W - SK, R, 0), (W - FT, R, 0), (W - FT, Dc - T, 0)]
        else:   # half-round front: no flat, no front shoulders
            c["former_loop"] = [(FT, Dc - T, 0), (FT, R, 0), (SK, R, TB), (R, SK, TB), (W - SK, R, 0),
                                (W - FT, R, 0), (W - FT, Dc - T, 0)]
    else:
        OV = p.get("OL", 0) if p.get("hand") == "LH" else p.get("OR", 0)   # wall-end overhang; X0 = front end
        OG = p.get("OG", 0)   # gable overhang on the front (vanity-side) end, X0
        c["wrap_len"] = OG + CX + c["arc"] + (D - R) + OV
        c["pockets"] = [(OG + CX - E, OG + CX + c["arc"] + E)]
        c.update(fix_depth=Dc - FT, back_w=W - FT - T, former_x0=T, former_w=W - SK - T, former_d=Dc - T - SK,
                 fix_to_former_x=spread(Dc - T - FT, INSET, MAX_PITCH),
                 fix_to_back_x=Dc - T / 2 - FT, fix_to_back_y=spread(Hc, INSET, MAX_PITCH))
        c["former_loop"] = [(T, FT, 0), (CX, FT, 0), (CX, SK, TB), (W - SK, R, 0), (W - FT, R, 0),
                            (W - FT, Dc - T, 0), (T, Dc - T, 0)]
    c["back_to_former_x"] = spread(c["back_w"], BACK_INSET, MAX_PITCH)
    # fixing blocks (see the page): full carcass height, flat against the face board straights, notched into the formers
    warn, notes = [], []   # notes are reported but do not block the export
    c["notes"] = notes
    c["blocks"], c["blk_side"], c["blk_front"] = [], False, False
    pick = lambda avail: next((v for v in (BLOCK_WIDE, BLOCK_NARROW) if v <= avail + 1e-9), None)
    L = c["former_loop"] = [list(v) for v in c["former_loop"]]
    if p.get("blkS"):
        wb = pick((Dc - T) - (R + E))
        if not wb:
            notes.append("No room for a side fixing block.")
        else:
            c["blk_side"] = True
            d0, d1 = Dc - T - wb, Dc - T
            c["blocks"].append(dict(name="Block_SideR" if c["double"] else "Block_Side", wb=wb, x0=W - FT - T, x1=W - FT, d0=d0, d1=d1))
            i = next(k for k, v in enumerate(L) if v[0] == W - FT and v[1] == Dc - T)
            L[i:i + 1] = [[W - FT, d0, 0], [W - FT - T, d0, 0], [W - FT - T, d1, 0]]
            if c["double"]:
                c["blocks"].append(dict(name="Block_SideL", wb=wb, x0=FT, x1=FT + T, d0=d0, d1=d1))
                j = next(k for k, v in enumerate(L) if v[0] == FT and v[1] == Dc - T)
                L[j:j + 1] = [[FT + T, d1, 0], [FT + T, d0, 0], [FT, d0, 0]]
    if p.get("blkF"):
        avail = (W - R - E) - (R + E) if c["double"] else (CX - E) - T
        wb = pick(avail)
        if not wb:
            notes.append("No room for a front fixing block.")
        else:
            c["blk_front"] = True
            if c["double"]:
                a, b = W / 2 - wb / 2, W / 2 + wb / 2
                c["blocks"].append(dict(name="Block_Front", wb=wb, x0=a, x1=b, d0=FT, d1=FT + T))
                i = next(k for k, v in enumerate(L) if v[0] == R and v[1] == FT)
                L[i + 1:i + 1] = [[a, FT, 0], [a, FT + T, 0], [b, FT + T, 0], [b, FT, 0]]
            else:
                c["blocks"].append(dict(name="Block_Front", wb=wb, x0=T, x1=T + wb, d0=FT, d1=FT + T))
                i = next(k for k, v in enumerate(L) if v[0] == T and v[1] == FT)
                L[i:i + 1] = [[T, FT + T, 0], [T + wb, FT + T, 0], [T + wb, FT, 0]]
    c["former_loop"] = [tuple(v) for v in L]
    c["block_hole_y"] = spread(Hc, INSET, MAX_PITCH)
    c["cut"] = rib_cutout(p, c) if p.get("lighten") else None
    c["cut_depth"] = T - (p.get("OS") or 0)
    if c["double"]:
        if W < 2 * R:
            warn.append(f"Radius too big for the width: two R{R:g} corners need at least {2*R:g} wide.")
    elif CX - E < T:
        warn.append(f"Radius too big for the width: pocket would start over the fixing panel; need {T+E:g} mm of flat front (have {CX:g}).")
    if R + E > Dc - T - 20:
        warn.append("Radius too big for the depth (after the back scribe).")
    if Hc < 3 * T + 40:
        warn.append("The top and bottom scribes leave too little carcass height.")
    if SK >= FT:
        warn.append("Skin must be thinner than the face board.")
    c["warnings"] = warn
    return c


def fmt(v):
    return f"{v:.2f}".rstrip("0").rstrip(".").replace(".", "P")


def rev_loop(L):
    n = len(L)
    return [(L[(n - i) % n][0], L[(n - i) % n][1], -L[((n - i) % n - 1) % n][2]) for i in range(n)]


def mir_loop(L, w):
    return rev_loop([(w - x, y, -b) for x, y, b in L])


def _new(layers):
    doc = ezdxf.new("R12")
    for l in layers:
        doc.layers.add(l)
    return doc, doc.modelspace()


def _poly(m, pts, layer):
    pl = m.add_polyline2d([(x, y) for x, y, *_ in pts], close=True, dxfattribs={"layer": layer})
    for v, pt in zip(pl.vertices, pts):
        if len(pt) > 2 and pt[2]:
            v.dxf.bulge = pt[2]


def _rect_part(m, L, H, outline_layer):
    _poly(m, [(0, 0), (L, 0), (L, H), (0, H)], "PART")
    _poly(m, [(0, 0), (0, H), (L, H), (L, 0)], outline_layer)   # clockwise: left comp = outside


def build(p, outdir, prefix="CurvedEnd"):
    c = calc(p)
    H, FT, SK, T = p["H"], p["FT"], p["SK"], p["T"]
    hand = p.get("hand", "RH")
    tag = "2E" if c["double"] else hand
    r2 = lambda v: math.floor(v * 100 + 0.5) / 100   # half-up, same as the page
    os.makedirs(outdir, exist_ok=True)
    parts = {}
    lo, lp = f"OUTLINEZ{fmt(FT + OUTLINE_EXTRA)}L", f"PKZ{fmt(FT - SK)}"
    lo16, lb = f"OUTLINEZ{fmt(T + OUTLINE_EXTRA)}L", f"VBOREZ{fmt(T + THROUGH_EXTRA)}"

    # Face board, back face up (single: front end at X0; double: a wall end at X0)
    doc, m = _new(["PART", lo, lp])
    L = r2(c["wrap_len"])
    _rect_part(m, L, H, lo)
    for a, b in c["pockets"]:
        _poly(m, [(r2(a), -OVER), (r2(b), -OVER), (r2(b), H + OVER), (r2(a), H + OVER)], lp)
    parts["FaceBoard"] = (doc, dict(L=L, H=H))

    if not c["double"]:
        doc, m = _new(["PART", lo16, lb])
        _rect_part(m, r2(c["fix_depth"]), r2(c["Hc"]), lo16)
        holes = [(x, y) for y in c["hole_y"] for x in c["fix_to_former_x"]] + [(c["fix_to_back_x"], y) for y in c["fix_to_back_y"]]
        for x, y in holes:
            m.add_circle((r2(x), r2(y)), HOLE_D / 2, dxfattribs={"layer": lb})
        parts["FixingPanel"] = (doc, dict(L=r2(c["fix_depth"]), H=H))

    doc, m = _new(["PART", lo16, lb])
    _rect_part(m, r2(c["back_w"]), r2(c["Hc"]), lo16)
    for y in c["hole_y"]:
        for x in c["back_to_former_x"]:
            m.add_circle((r2(x), r2(y)), HOLE_D / 2, dxfattribs={"layer": lb})
    parts["Back"] = (doc, dict(L=r2(c["back_w"]), H=H))

    # Formers: top view, front at Y0; outline clockwise, cut-out anticlockwise
    fw, fd = r2(c["former_w"]), r2(c["former_d"])
    tx = lambda L_: [(x - c["former_x0"], d - SK, b) for x, d, b in L_]
    ccw = tx(c["former_loop"])
    if hand == "LH":
        ccw = mir_loop(ccw, fw)
    cut = None
    if c["cut"]:
        cut = tx(c["cut"])
        if hand == "LH":
            cut = mir_loop(cut, fw)
    lr = f"ROUTEZ{fmt(c['cut_depth'])}L"
    names = ["Bottom"] + [f"Rib{i}" for i in range(1, c["gaps"])] + ["Top"]
    for nm in names:
        is_rib = nm.startswith("Rib") and cut
        doc, m = _new(["PART", lo16] + ([lr] if is_rib else []))
        _poly(m, [(0, 0), (fw, 0), (fw, fd), (0, fd)], "PART")
        _poly(m, rev_loop(ccw), lo16)
        if is_rib:
            _poly(m, cut, lr)
        parts[nm] = (doc, dict(L=fw, H=fd))

    for k in c["blocks"]:
        doc, m = _new(["PART", lo16, lb])
        _rect_part(m, r2(k["wb"]), r2(c["Hc"]), lo16)
        # face holes up the centre (into the face board) + end holes on the top/bottom former centrelines
        ex = [25, k["wb"] - 25] if k["wb"] >= 80 else [k["wb"] / 2]
        fh = [(x, y) for y in c["hole_y"] for x in ex]              # into every former (top, bottom, ribs)
        face = [(k["wb"] / 2, y) for y in c["block_hole_y"]
                if all(math.hypot(a - k["wb"] / 2, b - y) >= 20 for a, b in fh)]   # out into the face board
        holes = face + fh
        for x, y in holes:
            m.add_circle((r2(x), r2(y)), HOLE_D / 2, dxfattribs={"layer": lb})
        parts[k["name"]] = (doc, dict(L=k["wb"], H=c["Hc"]))

    files = []
    for nm, (doc, meta) in parts.items():
        # part name = file name: ext_ for the face board (external), int_ for carcass parts (internal)
        f = os.path.join(outdir, f"{'ext_' if nm == 'FaceBoard' else 'int_'}{nm}.dxf")
        doc.saveas(f)
        files.append(f)
    return c, parts, files


if __name__ == "__main__":
    # e.g.  python curved_end.py W=1000 D=500 H=720 R=150 hand=DOUBLE lighten=1 OS=0.3
    p = dict(DEFAULTS)
    for a in sys.argv[1:]:
        k, v = a.split("=")
        p[k] = v if k == "hand" else float(v)
    c, parts, files = build(p, "dxf_out")
    print("\n".join(c["warnings"]) or "ok")
    print("\n".join(files))
