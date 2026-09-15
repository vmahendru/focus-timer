#!/usr/bin/env python3
"""Draws the poster scenes as SVG masks.

Each scene is up to four silhouette layers (far, peak, mid, near) on a 2400 x 600
canvas with the ground at the bottom edge. The page colours each layer from
the active scheme, so the files hold only black shapes. Keep the subject
inside x 850..1550: phones show only the middle of the canvas.

Run from the repository root:  python3 tools/scenes.py
"""
import io
import math
import os

W, H = 2400, 600
OUT = os.path.join(os.path.dirname(__file__), '..', 'art')


# ---------- primitives ----------

def poly(points):
    return '<polygon points="%s"/>' % ' '.join('%.0f,%.0f' % p for p in points)


def rect(x, y, w, h, r=0):
    return '<rect x="%.0f" y="%.0f" width="%.0f" height="%.0f" rx="%.0f"/>' % (x, y, w, h, r)


def circle(cx, cy, r):
    return '<circle cx="%.0f" cy="%.0f" r="%.0f"/>' % (cx, cy, r)


def ring(cx, cy, r, w):
    return '<circle cx="%.0f" cy="%.0f" r="%.0f" fill="none" stroke="#000" stroke-width="%.0f"/>' % (cx, cy, r, w)


def ellipse(cx, cy, rx, ry):
    return '<ellipse cx="%.0f" cy="%.0f" rx="%.0f" ry="%.0f"/>' % (cx, cy, rx, ry)


def path(d, stroke=0, fill=True):
    if stroke:
        return '<path d="%s" fill="none" stroke="#000" stroke-width="%.0f" stroke-linecap="round"/>' % (d, stroke)
    return '<path d="%s"/>' % d


def line(x1, y1, x2, y2, w):
    return '<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f" stroke="#000" stroke-width="%.0f" stroke-linecap="round"/>' % (x1, y1, x2, y2, w)


def ground(y=560):
    return rect(0, y, W, H - y)


def ridge(points, base=H):
    """A mountain range: list of (x, y) peaks, closed to the ground."""
    return poly([(points[0][0], base)] + list(points) + [(points[-1][0], base)])


def fir(x, base, h, hw=None):
    hw = hw or h * 0.32
    tiers = []
    for i, (top_f, w_f) in enumerate([(0.0, 0.42), (0.28, 0.72), (0.56, 1.0)]):
        top = base - h + h * top_f
        bottom = base - h + h * (top_f + 0.42)
        tiers.append(poly([(x, top), (x + hw * w_f, bottom), (x - hw * w_f, bottom)]))
    trunk = rect(x - hw * 0.12, base - h * 0.12, hw * 0.24, h * 0.12)
    return ''.join(tiers) + trunk


def spruce(x, base, h):
    """Thin northern spruce."""
    return poly([(x, base - h), (x + h * 0.14, base - h * 0.15), (x + h * 0.06, base), (x - h * 0.06, base), (x - h * 0.14, base - h * 0.15)])


def round_tree(x, base, h, r=None):
    r = r or h * 0.42
    return rect(x - h * 0.05, base - h * 0.5, h * 0.1, h * 0.5) + circle(x, base - h + r, r) + \
        circle(x - r * 0.7, base - h + r * 1.5, r * 0.75) + circle(x + r * 0.7, base - h + r * 1.5, r * 0.75)


def palm(x, base, h, lean=1):
    top_x = x + lean * h * 0.22
    top_y = base - h
    trunk = path('M%.0f,%.0f Q%.0f,%.0f %.0f,%.0f' % (x, base, x + lean * h * 0.05, base - h * 0.55, top_x, top_y), stroke=h * 0.07)
    fronds = []
    for ang in (-160, -130, -95, -60, -25, 5, 40):
        a = math.radians(ang)
        ex, ey = top_x + math.cos(a) * h * 0.42, top_y + math.sin(a) * h * 0.42
        cx, cy = top_x + math.cos(a - 0.5) * h * 0.25, top_y + math.sin(a - 0.5) * h * 0.25 - h * 0.12
        fronds.append(path('M%.0f,%.0f Q%.0f,%.0f %.0f,%.0f' % (top_x, top_y, cx, cy, ex, ey), stroke=h * 0.055))
    return trunk + ''.join(fronds) + circle(top_x, top_y, h * 0.05)


def tower(x, base, w, h, top='flat'):
    s = rect(x - w / 2, base - h, w, h)
    if top == 'spire':
        s += poly([(x - w * 0.18, base - h), (x + w * 0.18, base - h), (x, base - h - h * 0.22)])
    if top == 'antenna':
        s += rect(x - w * 0.05, base - h - h * 0.2, w * 0.1, h * 0.2)
    if top == 'twin':
        s += rect(x - w * 0.34, base - h - h * 0.16, w * 0.06, h * 0.16) + rect(x + w * 0.28, base - h - h * 0.16, w * 0.06, h * 0.16)
    return s


def dome(cx, base, r, drum_h):
    return rect(cx - r * 0.82, base - drum_h, r * 1.64, drum_h) + \
        path('M%.0f,%.0f A%.0f,%.0f 0 0 1 %.0f,%.0f Z' % (cx - r, base - drum_h, r, r, cx + r, base - drum_h)) + \
        rect(cx - r * 0.12, base - drum_h - r - r * 0.36, r * 0.24, r * 0.4) + circle(cx, base - drum_h - r - r * 0.4, r * 0.08)


def columns(x, base, w, h, n, roof_h):
    s = rect(x, base - h - roof_h, w, roof_h)
    gap = w / n
    for i in range(n):
        s += rect(x + gap * i + gap * 0.3, base - h, gap * 0.4, h)
    s += rect(x - w * 0.04, base - h * 0.06, w * 1.08, h * 0.06)
    return s


def suspension_bridge(x1, x2, deck_y, tower_h, tower_w, sag, n_hangers=18, twin_leg=True):
    s = ''
    for tx in (x1, x2):
        if twin_leg:
            s += rect(tx - tower_w / 2, deck_y - tower_h, tower_w * 0.28, tower_h + 40)
            s += rect(tx + tower_w / 2 - tower_w * 0.28, deck_y - tower_h, tower_w * 0.28, tower_h + 40)
            for f in (0.15, 0.45, 0.75):
                s += rect(tx - tower_w / 2, deck_y - tower_h + tower_h * f, tower_w, tower_h * 0.08)
        else:
            s += rect(tx - tower_w / 2, deck_y - tower_h, tower_w, tower_h + 40)
    s += rect(x1 - 500, deck_y, (x2 - x1) + 1000, 16)
    top = deck_y - tower_h
    mid = (x1 + x2) / 2
    s += path('M%.0f,%.0f Q%.0f,%.0f %.0f,%.0f' % (x1, top, mid, top + sag * 2, x2, top), stroke=9)
    s += path('M%.0f,%.0f Q%.0f,%.0f %.0f,%.0f' % (x1 - 500, deck_y - 10, x1 - 250, top - 20, x1, top), stroke=9)
    s += path('M%.0f,%.0f Q%.0f,%.0f %.0f,%.0f' % (x2, top, x2 + 250, top - 20, x2 + 500, deck_y - 10), stroke=9)
    for i in range(1, n_hangers):
        t = i / n_hangers
        hx = x1 + (x2 - x1) * t
        hy = (1 - t) ** 2 * top + 2 * (1 - t) * t * (top + sag * 2) + t ** 2 * top
        s += line(hx, hy, hx, deck_y, 3)
    return s


def star(cx, cy, r, points=5, inner=0.382):
    pts = []
    for i in range(points * 2):
        rad = r if i % 2 == 0 else r * inner
        a = math.radians(-90 + i * 180 / points)
        pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
    return poly(pts)


def fireworks(cx, cy, r, rays=14):
    s = ''
    for i in range(rays):
        a = math.radians(i * 360 / rays)
        s += line(cx + math.cos(a) * r * 0.25, cy + math.sin(a) * r * 0.25, cx + math.cos(a) * r, cy + math.sin(a) * r, 5)
        s += circle(cx + math.cos(a) * r * 1.12, cy + math.sin(a) * r * 1.12, 5)
    return s


def write(name, layers):
    for layer, shapes in layers.items():
        body = '<g fill="#000">%s</g>' % ''.join(shapes)
        svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" preserveAspectRatio="xMidYMax slice">%s</svg>\n' % (W, H, body)
        with io.open(os.path.join(OUT, '%s-%s.svg' % (name, layer)), 'w', encoding='utf-8') as f:
            f.write(svg)


# ---------- scenes ----------

def spirit_of_76():
    far = [
        dome(1200, 420, 95, 70),
        rect(870, 350, 660, 70), rect(830, 420, 740, 140),
        rect(900, 300, 120, 50), rect(1380, 300, 120, 50),
        fireworks(640, 150, 90), fireworks(1760, 120, 110), fireworks(1000, 90, 60),
    ]
    mid = [
        poly([(1000, 560), (1008, 160), (1016, 140), (1024, 160), (1032, 560)]),
        ground(548),
    ] + [round_tree(x, 520, 110) for x in range(80, 800, 150)] + [round_tree(x, 520, 110) for x in range(1660, 2400, 150)]
    near = [
        ground(),
        # A field cannon, for the revolutionary war.
        circle(1000, 530, 40), circle(1000, 530, 10),
        path('M960,520 L1130,470 L1140,490 L985,545 Z'),
        rect(940, 525, 70, 10),
    ] + [round_tree(x, 570, 90) for x in (140, 330, 560, 1560, 1800, 2040, 2260)]
    write('spirit', {'far': far, 'mid': mid, 'near': near})


def mountain_is_out():
    # Mount Rainier: a broad volcanic cone with shoulders.
    body = [(300, 600), (620, 470), (900, 330), (1060, 240), (1160, 190), (1210, 176), (1260, 188), (1340, 230), (1480, 320), (1720, 450), (2100, 600)]
    far = [ridge(body)]
    # Snowfields as a lighter layer sitting on the cone.
    snow = [poly([(1000, 300), (1060, 240), (1160, 190), (1210, 176), (1260, 188), (1340, 230), (1420, 290), (1380, 320), (1300, 300), (1250, 340), (1180, 310), (1120, 350), (1050, 320)])]
    mid = [ridge([(0, 600), (200, 520), (420, 470), (640, 500), (860, 450), (1000, 480), (1180, 430), (1420, 470), (1640, 440), (1900, 490), (2140, 460), (2400, 520)], base=600)]
    # Space Needle, then Seattle's towers, then firs.
    needle_x = 1300
    needle = [
        path('M%d,560 L%d,300 L%d,300 L%d,560 Z' % (needle_x - 46, needle_x - 12, needle_x + 12, needle_x + 46)),
        path('M%d,560 L%d,300 L%d,300 Z' % (needle_x - 14, needle_x - 4, needle_x + 4)),
        ellipse(needle_x, 300, 60, 16), ellipse(needle_x, 282, 84, 26), ellipse(needle_x, 265, 60, 12),
        rect(needle_x - 6, 200, 12, 70), rect(needle_x - 2, 170, 4, 40),
        rect(needle_x - 50, 540, 100, 20),
    ]
    towers = [tower(1000, 560, 60, 210, 'flat'), tower(1060, 560, 40, 160), tower(1130, 560, 70, 250, 'antenna'),
              tower(1200, 560, 50, 190), tower(1420, 560, 66, 230, 'flat'), tower(1490, 560, 44, 170), tower(1550, 560, 58, 200)]
    near = [ground()] + towers + needle + [fir(x, 600, 150 + (x * 7) % 60) for x in range(40, 940, 70)] + [fir(x, 600, 150 + (x * 7) % 60) for x in range(1600, 2400, 70)] + [fir(x, 600, 90) for x in range(980, 1600, 90)]
    write('rainier', {'far': far, 'peak': snow, 'mid': mid, 'near': near})


def fog_over_the_gate():
    far = [ridge([(0, 600), (200, 480), (500, 420), (760, 460), (980, 400), (1200, 440), (1500, 390), (1800, 450), (2100, 410), (2400, 470)])]
    mid = [suspension_bridge(960, 1440, 470, 250, 46, 90)]
    near = [ground(575)] + [fir(x, 600, 120 + (x * 3) % 50, hw=22) for x in range(30, 780, 44)] + [fir(x, 600, 120 + (x * 3) % 50, hw=22) for x in range(1640, 2400, 44)]
    write('gate', {'far': far, 'mid': mid, 'near': near})


def endless_summer():
    far = [ridge([(0, 600), (300, 470), (700, 420), (1000, 460), (1300, 400), (1700, 450), (2100, 410), (2400, 480)], base=520), rect(0, 520, W, 80)]
    # Pier with a ferris wheel.
    wheel_x, wheel_y = 1400, 430
    pier = [rect(1180, 520, 480, 14)] + [rect(x, 534, 10, 66) for x in range(1190, 1660, 60)] + \
        [ring(wheel_x, wheel_y, 72, 12)] + \
        [line(wheel_x, wheel_y, wheel_x + math.cos(math.radians(a)) * 78, wheel_y + math.sin(math.radians(a)) * 78, 4) for a in range(0, 360, 30)] + \
        [poly([(wheel_x - 40, 520), (wheel_x, wheel_y), (wheel_x + 40, 520)])]
    mid = pier + [rect(0, 540, W, 60)]
    near = [ground(570), palm(1000, 600, 260, 1), palm(1120, 600, 200, -1), palm(1700, 600, 240, -1), palm(1780, 600, 180, 1),
            palm(300, 600, 220, 1), palm(2150, 600, 230, -1)]
    write('summer', {'far': far, 'peak': [circle(1560, 300, 80)], 'mid': mid, 'near': near})


def purple_mountain_majesty():
    far = [ridge([(0, 600), (150, 420), (330, 300), (450, 360), (620, 230), (760, 300), (900, 200), (1040, 260), (1200, 120), (1330, 220), (1470, 170), (1600, 280), (1760, 210), (1900, 300), (2060, 250), (2250, 340), (2400, 300)])]
    snow = [poly([(1130, 200), (1200, 120), (1270, 190), (1250, 210), (1220, 190), (1190, 215), (1160, 195)]),
            poly([(1430, 210), (1470, 170), (1520, 220), (1490, 230), (1460, 215)]),
            poly([(860, 250), (900, 200), (950, 245), (920, 255), (890, 240)])]
    mid = [ridge([(0, 600), (200, 470), (480, 400), (720, 450), (960, 380), (1200, 420), (1440, 360), (1700, 430), (1960, 380), (2200, 440), (2400, 400)])]
    near = [ground(580)] + [fir(x, 600, 170 + (x * 5) % 90) for x in range(20, 2400, 62)]
    # A cabin with a chimney.
    near += [poly([(1230, 600), (1230, 500), (1300, 440), (1370, 500), (1370, 600)]), rect(1330, 440, 18, 40)]
    write('rockies', {'far': far, 'peak': snow, 'mid': mid, 'near': near})


def deep_in_the_heart():
    far = [ridge([(0, 600), (300, 520), (600, 470), (800, 480), (1000, 440), (1250, 460), (1500, 430), (1750, 470), (2000, 450), (2400, 500)], base=540), rect(0, 540, W, 60)]
    # The Alamo facade.
    ax = 1200
    alamo = [
        rect(ax - 190, 400, 380, 160),
        path('M%d,400 L%d,400 L%d,372 Q%d,330 %d,372 L%d,400 Z' % (ax - 190, ax - 60, ax - 60, ax, ax + 60, ax + 60)),
        rect(ax - 190, 380, 60, 20), rect(ax + 130, 380, 60, 20),
    ]
    mid = alamo + [rect(0, 555, W, 45)]
    # Windmill, pumpjack, fence, prickly pear.
    wm_x = 760
    windmill = [poly([(wm_x - 30, 600), (wm_x - 8, 380), (wm_x + 8, 380), (wm_x + 30, 600)]), circle(wm_x, 372, 8)] + \
        [line(wm_x, 372, wm_x + math.cos(math.radians(a)) * 60, 372 + math.sin(math.radians(a)) * 60, 5) for a in range(0, 360, 30)] + \
        [line(wm_x - 24, 470, wm_x + 24, 470, 6), line(wm_x - 18, 530, wm_x + 18, 530, 6)]
    pj_x = 1680
    pumpjack = [poly([(pj_x - 40, 600), (pj_x - 8, 440), (pj_x + 8, 440), (pj_x + 40, 600)]),
                path('M%d,440 L%d,400 L%d,480 L%d,470 Z' % (pj_x - 120, pj_x - 130, pj_x + 100, pj_x + 100)),
                circle(pj_x + 20, 560, 24), rect(pj_x - 135, 400, 30, 60)]
    fence = [line(0, 560, 900, 560, 6), line(0, 585, 900, 585, 6), line(1500, 560, 2400, 560, 6), line(1500, 585, 2400, 585, 6)] + \
        [rect(x, 540, 8, 60) for x in range(40, 900, 120)] + [rect(x, 540, 8, 60) for x in range(1540, 2400, 120)]
    cactus = [ellipse(1060, 580, 34, 24), ellipse(1030, 545, 24, 30), ellipse(1085, 548, 20, 26), ellipse(1500, 585, 40, 26), ellipse(1470, 550, 26, 32)]
    near = [ground(590)] + windmill + pumpjack + fence + cactus
    write('texas', {'far': far, 'peak': [star(1200, 170, 92)], 'mid': mid, 'near': near})


def leaf_peeper():
    far = [ridge([(0, 600), (300, 500), (600, 440), (900, 470), (1200, 420), (1500, 460), (1800, 430), (2100, 480), (2400, 450)])]
    # A white church steeple and a barn.
    cx = 1120
    church = [rect(cx - 60, 440, 120, 120), poly([(cx - 70, 440), (cx, 400), (cx + 70, 440)]),
              rect(cx - 16, 330, 32, 110), poly([(cx - 20, 330), (cx, 250), (cx + 20, 330)])]
    barn = [rect(1340, 470, 160, 90), path('M1330,470 L1340,430 L1420,400 L1500,430 L1510,470 Z'), rect(1460, 405, 16, 30)]
    # A lighthouse on the rocks.
    lx = 1760
    lighthouse = [poly([(lx - 30, 560), (lx - 20, 380), (lx + 20, 380), (lx + 30, 560)]), rect(lx - 28, 370, 56, 14), rect(lx - 18, 330, 36, 40),
                  poly([(lx - 24, 330), (lx, 300), (lx + 24, 330)]), rect(lx - 60, 555, 120, 10)]
    mid = church + barn + lighthouse + [rect(0, 540, W, 60)]
    near = [ground(575)] + [round_tree(x, 600, 150 + (x * 3) % 70) for x in range(60, 1000, 130)] + [round_tree(x, 600, 150 + (x * 3) % 70) for x in range(1900, 2400, 130)] + \
        [round_tree(x, 600, 110) for x in (1220, 1300, 1560, 1640)] + [poly([(1720, 600), (1800, 540), (1900, 560), (1980, 600)])]
    write('foliage', {'far': far, 'mid': mid, 'near': near})


def empire():
    # Midtown, then the Brooklyn Bridge.
    esb_x = 1220
    esb = [tower(esb_x, 560, 110, 260), tower(esb_x, 560, 76, 340), tower(esb_x, 560, 46, 400), rect(esb_x - 5, 100, 10, 60)]
    chrysler_x = 1400
    chrysler = [tower(chrysler_x, 560, 80, 280)] + \
        [poly([(chrysler_x - 40 + i * 6, 280 - i * 12), (chrysler_x + 40 - i * 6, 280 - i * 12), (chrysler_x + 34 - i * 6, 268 - i * 12), (chrysler_x - 34 + i * 6, 268 - i * 12)]) for i in range(6)] + \
        [rect(chrysler_x - 3, 170, 6, 40)]
    others = [tower(x, 560, w, h, t) for x, w, h, t in [(900, 70, 220, 'flat'), (960, 50, 300, 'flat'), (1040, 90, 250, 'flat'), (1120, 60, 190, 'flat'),
                                                        (1310, 60, 230, 'flat'), (1500, 70, 200, 'flat'), (1560, 90, 320, 'flat'), (1640, 50, 240, 'flat'),
                                                        (700, 80, 180, 'flat'), (780, 60, 240, 'flat'), (1740, 70, 210, 'flat'), (1820, 90, 170, 'flat')]]
    far = esb + chrysler + others + [rect(0, 540, W, 60)]
    bridge = [suspension_bridge(980, 1420, 500, 190, 70, 70, twin_leg=False)]
    # Gothic arches in the towers.
    for tx in (980, 1420):
        bridge.append('<path fill="#000" d="M%d,540 L%d,540 L%d,400 A22,22 0 0 0 %d,400 Z"/>' % (tx - 22, tx + 22, tx + 22, tx - 22))
    mid = bridge + [rect(0, 560, W, 40)]
    near = [ground(580)] + [rect(0, 570 + (i % 3) * 8, W, 3) for i in range(3)]
    write('empire', {'far': far, 'mid': mid, 'near': near})


def sunshine_state():
    # Space Coast: a rocket lifting off on the horizon, then Art Deco Miami, then palms and flamingos.
    rx = 1440
    rocket = [rect(rx - 18, 250, 36, 170), poly([(rx - 18, 250), (rx, 200), (rx + 18, 250)]), poly([(rx - 18, 420), (rx - 40, 450), (rx - 18, 400)]),
              poly([(rx + 18, 420), (rx + 40, 450), (rx + 18, 400)]), ellipse(rx, 500, 70, 60), ellipse(rx, 560, 120, 50)]
    deco = [tower(960, 560, 90, 150), rect(915, 405, 90, 12), tower(1060, 560, 60, 200), rect(1030, 350, 60, 10), tower(1130, 560, 80, 130),
            tower(1220, 560, 50, 170), rect(1195, 380, 50, 10), tower(1290, 560, 70, 110)]
    far = rocket + deco + [rect(0, 540, W, 60)]
    # A pelican gliding.
    pelican = [path('M700,300 Q740,270 790,300 L820,296 Q780,320 740,312 Z')]
    mid = pelican + [rect(0, 550, W, 50)]

    def flamingo(x, base, h, flip=1):
        return path('M%d,%d Q%d,%d %d,%d Q%d,%d %d,%d' % (x, base - h * 0.3, x + flip * h * 0.1, base - h * 0.9, x + flip * h * 0.3, base - h * 0.85,
                                                          x + flip * h * 0.42, base - h * 0.8, x + flip * h * 0.5, base - h * 0.88), stroke=h * 0.08) + \
            ellipse(x - flip * h * 0.02, base - h * 0.3, h * 0.28, h * 0.16) + line(x, base - h * 0.2, x + flip * h * 0.05, base, h * 0.04)
    near = [ground(585), palm(980, 600, 240, 1), palm(1700, 600, 260, -1), palm(1820, 600, 190, 1), palm(320, 600, 230, 1), palm(2200, 600, 220, -1),
            flamingo(1230, 590, 130, 1), flamingo(1330, 590, 110, -1)]
    write('sunshine', {'far': far, 'mid': mid, 'near': near})


def windy_city_noir():
    willis = [tower(1200, 560, 110, 300), tower(1200, 560, 70, 400), tower(1205, 560, 40, 440), rect(1178, 60, 6, 70), rect(1216, 40, 6, 90)]
    hancock = [poly([(1380, 560), (1400, 170), (1460, 170), (1480, 560)]), rect(1408, 110, 6, 60), rect(1446, 110, 6, 60)]
    others = [tower(x, 560, w, h) for x, w, h in [(940, 80, 240), (1020, 60, 300), (1090, 70, 260), (1300, 60, 280), (1550, 90, 250), (1630, 60, 310), (1700, 80, 220),
                                                  (760, 70, 200), (840, 50, 160), (1800, 60, 180), (1880, 80, 220)]]
    far = willis + hancock + others + [rect(0, 540, W, 60)]
    # The Bean on its plaza.
    mid = [ellipse(1200, 520, 120, 44), rect(0, 556, W, 44)]
    # The El: elevated track with a train.
    track = [rect(0, 470, W, 12), rect(0, 500, W, 6)] + [rect(x, 482, 10, 118) for x in range(60, 2400, 140)] + \
        [line(x + 5, 482, x + 60, 470, 5) for x in range(60, 2400, 140)] + [line(x + 5, 482, x - 50, 470, 5) for x in range(60, 2400, 140)]
    def car(x):
        holes = ' '.join('M%d,432 h22 v18 h-22 Z' % (x + 18 + i * 34) for i in range(4))
        return '<path fill-rule="evenodd" d="M%d,420 h160 v50 h-160 Z %s"/>' % (x, holes)
    train = [car(x) for x in (700, 870, 1040, 1210)]
    near = [ground(590)] + track + train
    write('windy', {'far': far, 'peak': [star(1080 + i * 80, 120, 26, points=6, inner=0.5) for i in range(4)], 'mid': mid, 'near': near})


def mauka_to_makai():
    # Diamond Head in the distance.
    far = [ridge([(0, 600), (700, 520), (980, 440), (1140, 380), (1260, 370), (1400, 400), (1560, 470), (1800, 530), (2400, 600)], base=540), rect(0, 540, W, 60)]
    # Rolling surf.
    waves = []
    for y in (548, 566):
        d = 'M0,%d ' % y + ' '.join('q40,-22 80,0' for _ in range(30))
        waves.append(path(d, stroke=6))
    # An outrigger canoe.
    canoe = [path('M1040,560 Q1180,592 1320,560 L1300,576 Q1180,600 1060,576 Z'), rect(1140, 520, 8, 44), rect(1215, 520, 8, 44),
             line(1090, 545, 1300, 545, 6), path('M1000,586 Q1160,610 1360,586 L1360,594 Q1160,618 1000,594 Z')]
    mid = waves + canoe + [rect(0, 590, W, 10)]
    near = [ground(585), palm(900, 600, 280, 1), palm(980, 600, 200, -1), palm(1560, 600, 270, -1), palm(1640, 600, 190, 1), palm(240, 600, 240, 1), palm(2200, 600, 250, -1)]
    write('aloha', {'far': far, 'mid': mid, 'near': near})


def last_frontier():
    # Denali, the tallest thing in the picture.
    far = [ridge([(0, 600), (200, 460), (500, 360), (760, 400), (960, 300), (1120, 200), (1200, 100), (1290, 180), (1400, 260), (1560, 330), (1760, 380), (2000, 330), (2200, 420), (2400, 380)])]
    snow = [poly([(1080, 230), (1120, 200), (1200, 100), (1290, 180), (1350, 230), (1310, 250), (1270, 225), (1230, 260), (1190, 230), (1150, 265), (1110, 240)])]
    glacier = [path('M900,600 L1000,420 Q1100,380 1200,430 L1320,600 Z')]
    mid = [ridge([(0, 600), (300, 520), (600, 470), (900, 500), (1500, 500), (1800, 460), (2100, 510), (2400, 480)])] + glacier
    near = [ground(585)] + [spruce(x, 600, 160 + (x * 7) % 110) for x in range(20, 2400, 34)]
    # A cabin with smoke.
    near += [rect(1150, 520, 120, 80), poly([(1140, 520), (1210, 470), (1280, 520)]), rect(1250, 480, 14, 30),
             circle(1264, 455, 10), circle(1280, 432, 13), circle(1300, 405, 16)]
    dipper = [circle(x, y, r) for x, y, r in [(1800, 60, 9), (1560, 200, 6), (1596, 172, 6), (1634, 154, 6), (1672, 148, 6), (1712, 164, 6), (1702, 212, 6), (1660, 206, 6)]]
    write('frontier', {'far': far, 'peak': snow + dipper, 'mid': mid, 'near': near})


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for fn in (spirit_of_76, mountain_is_out, fog_over_the_gate, endless_summer, purple_mountain_majesty, deep_in_the_heart,
               leaf_peeper, empire, sunshine_state, windy_city_noir, mauka_to_makai, last_frontier):
        fn()
    print('wrote', sorted(f for f in os.listdir(OUT) if f.count('-') and f.endswith('.svg')))
