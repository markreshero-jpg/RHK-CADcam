# RHK6478 Buffet (Mark 2026-11-18): 3D-printed fridge vent for the BC-02 panel / BC-03 gable cut-outs
# (50 wide front-back x 220 high, upright, through 16.5 / 18 board).
#  - Sleeve pushes into the cut-out: 49.5 x 219.5 (0.25 clearance a side), 12 deep (less than 16.5 so it never pokes through).
#  - 5 flange all round: 60 x 230 x 2 thick, sits on the panel face.
#  - Straight-through blades running the long way (no louvre angle = most air), 1.6 thick, ~6.4 gaps,
#    tied by a 2 wide cross support at mid-height so they can't flap.
#  - Print flange-down, no supports.
# Mesh: every solid is a cell of one grid built from all the break lines, faces only where solid meets empty,
# so the STL is watertight with no overlapping shells.
# Run: python z_plan_automation/_tmp-6478-buf-vent-stl.py <out.stl>
import struct, sys

CUT_W, CUT_H = 50.0, 220.0          # cut-out in the board
CLR = 0.25                           # clearance a side
FLANGE, FLANGE_T, SLEEVE_D = 5.0, 2.0, 12.0
WALL, BLADE, N_BLADES, RIB = 1.6, 1.6, 5, 2.0

sw, sh = CUT_W - 2 * CLR, CUT_H - 2 * CLR            # sleeve outside 49.5 x 219.5
fw, fh = CUT_W + 2 * FLANGE, CUT_H + 2 * FLANGE      # flange 60 x 230
# everything centred on 0,0; z 0 = flange face (show face), +z into the board
inner_w = sw - 2 * WALL
gap = (inner_w - N_BLADES * BLADE) / (N_BLADES + 1)
x0 = -inner_w / 2
open_x = [(x0 + i * (gap + BLADE), x0 + i * (gap + BLADE) + gap) for i in range(N_BLADES + 1)]
iy = sh / 2 - WALL
open_y = [(-iy, -RIB / 2), (RIB / 2, iy)]

def solid(x, y, z):
    """x, y, z = cell centre"""
    if z < FLANGE_T:
        if abs(x) > fw / 2 or abs(y) > fh / 2: return False
    elif z < FLANGE_T + SLEEVE_D:
        if abs(x) > sw / 2 or abs(y) > sh / 2: return False
    else:
        return False
    in_open = any(a < x < b for a, b in open_x) and any(a < y < b for a, b in open_y)
    return not in_open

xs = sorted({-fw / 2, fw / 2, -sw / 2, sw / 2, *[v for p in open_x for v in p]})
ys = sorted({-fh / 2, fh / 2, -sh / 2, sh / 2, *[v for p in open_y for v in p]})
zs = [0.0, FLANGE_T, FLANGE_T + SLEEVE_D]
mid = lambda a, i: (a[i] + a[i + 1]) / 2
NX, NY, NZ = len(xs) - 1, len(ys) - 1, len(zs) - 1
S = [[[solid(mid(xs, i), mid(ys, j), mid(zs, k)) for k in range(NZ)] for j in range(NY)] for i in range(NX)]
at = lambda i, j, k: 0 <= i < NX and 0 <= j < NY and 0 <= k < NZ and S[i][j][k]

tris = []
def quad(n, a, b, c, d):  # a b c d counter-clockwise seen from outside (normal n)
    tris.append((n, a, b, c)); tris.append((n, a, c, d))

for i in range(NX):
    for j in range(NY):
        for k in range(NZ):
            if not S[i][j][k]: continue
            X0, X1, Y0, Y1, Z0, Z1 = xs[i], xs[i + 1], ys[j], ys[j + 1], zs[k], zs[k + 1]
            if not at(i - 1, j, k): quad((-1, 0, 0), (X0, Y0, Z0), (X0, Y0, Z1), (X0, Y1, Z1), (X0, Y1, Z0))
            if not at(i + 1, j, k): quad((1, 0, 0), (X1, Y0, Z0), (X1, Y1, Z0), (X1, Y1, Z1), (X1, Y0, Z1))
            if not at(i, j - 1, k): quad((0, -1, 0), (X0, Y0, Z0), (X1, Y0, Z0), (X1, Y0, Z1), (X0, Y0, Z1))
            if not at(i, j + 1, k): quad((0, 1, 0), (X0, Y1, Z0), (X0, Y1, Z1), (X1, Y1, Z1), (X1, Y1, Z0))
            if not at(i, j, k - 1): quad((0, 0, -1), (X0, Y0, Z0), (X0, Y1, Z0), (X1, Y1, Z0), (X1, Y0, Z0))
            if not at(i, j, k + 1): quad((0, 0, 1), (X0, Y0, Z1), (X1, Y0, Z1), (X1, Y1, Z1), (X0, Y1, Z1))

out = sys.argv[1] if len(sys.argv) > 1 else 'fridge-vent.stl'
with open(out, 'wb') as f:
    f.write(b'RHK6478 Buffet fridge vent 50x220 cut-out, 5 flange'.ljust(80, b' '))
    f.write(struct.pack('<I', len(tris)))
    for n, a, b, c in tris:
        f.write(struct.pack('<12fH', *n, *a, *b, *c, 0))

# checks: every edge used exactly twice (watertight), open area
from collections import Counter
edges = Counter()
for _, a, b, c in tris:
    for e in ((a, b), (b, c), (c, a)): edges[tuple(sorted(e))] += 1
bad = sum(1 for v in edges.values() if v != 2)
open_area = sum(b - a for a, b in open_x) * sum(b - a for a, b in open_y)
print(f'{out}: {len(tris)} triangles, non-manifold edges {bad}')
print(f'flange {fw} x {fh} x {FLANGE_T}, sleeve {sw} x {sh} x {SLEEVE_D}, overall depth {FLANGE_T + SLEEVE_D}')
print(f'{N_BLADES} blades {BLADE} thick, gaps {gap:.2f}, cross support {RIB} at mid-height')
print(f'open area {open_area:.0f} mm2 = {100 * open_area / (CUT_W * CUT_H):.0f}% of the {CUT_W:.0f} x {CUT_H:.0f} cut-out')
