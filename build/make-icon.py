# Gera o ícone do Amethyst (ametista com anel, em linhas) em PNG e ICO, sem bibliotecas externas.
# O desenho segue o logotipo da interface: viewBox 48x48, ametista lapidada e anel inclinado -20°.
import math, struct, sys, zlib, os

GEM = [(17, 13), (31, 13), (37, 21), (24, 37), (11, 21)]
FACETS = [((11, 21), (37, 21)), ((17, 13), (21, 21)), ((21, 21), (24, 37)), ((31, 13), (27, 21)), ((27, 21), (24, 37)),
          ((21, 21), (24, 13)), ((24, 13), (27, 21))]
EDGES = [(GEM[i], GEM[(i + 1) % len(GEM)]) for i in range(len(GEM))]
ANG = math.radians(-20)
CA, SA = math.cos(ANG), math.sin(ANG)

def seg_dist(px, py, a, b):
    ax, ay = a; bx, by = b
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)

def inside(px, py, poly):
    c = False
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % len(poly)]
        if (y1 > py) != (y2 > py) and px < (x2 - x1) * (py - y1) / (y2 - y1) + x1:
            c = not c
    return c

def ring(px, py):
    # coordenadas no referencial do anel (desfaz a rotação de -20°)
    x, y = px - 24, py - 24
    u, v = x * CA + y * SA, -x * SA + y * CA
    # distância aproximada à elipse 21x6 (gradiente da função implícita)
    f = (u / 21) ** 2 + (v / 6) ** 2 - 1
    g = 2 * math.hypot(u / 441, v / 36) or 1e-6
    return abs(f) / g, v  # v < 0: metade de trás (em cima)

def coverage(px, py, sw):
    """Quanto este ponto (em unidades 48x48) é traço branco: 0..1."""
    a = 0.0
    rd, v = ring(px, py)
    near_front = rd < 3 and v > 0
    # ametista: some onde o anel da frente passa (o "vão" do logotipo)
    if not near_front:
        if min(seg_dist(px, py, *e) for e in EDGES) < sw / 2: a = 1
        elif min(seg_dist(px, py, *f) for f in FACETS) < sw * 0.32: a = .75
    # anel: a metade de trás fica escondida atrás da pedra
    if rd < sw / 2 and not (v < 0 and (inside(px, py, GEM) or min(seg_dist(px, py, *e) for e in EDGES) < 1.5)):
        a = 1
    return a

def render(size):
    ss = 3
    S = size * ss
    corner = S * 0.22
    scale = S * 0.74 / 48
    off = (S - 48 * scale) / 2
    sw = 2.6 if size >= 48 else 3.4  # traço mais grosso nos tamanhos pequenos
    out = []
    for y in range(size):
        row = []
        for x in range(size):
            acc = [0.0, 0.0, 0.0, 0.0]
            for j in range(ss):
                for i in range(ss):
                    X, Y = x * ss + i + .5, y * ss + j + .5
                    dx = max(corner - X, 0, X - (S - corner)); dy = max(corner - Y, 0, Y - (S - corner))
                    if dx * dx + dy * dy > corner * corner:
                        continue
                    u, v = X / S, Y / S
                    base = [20, 21, 30]
                    g1 = max(0, 1 - math.hypot(u - .82, v - .18) / .75) ** 1.6
                    g2 = max(0, 1 - math.hypot(u - .15, v - 1.05) / .7) ** 1.6
                    col = [base[c] + g1 * ([91, 44, 255][c] - base[c]) for c in range(3)]
                    col = [col[c] + g2 * ([255, 45, 85][c] - col[c]) for c in range(3)]
                    a = coverage((X - off) / scale, (Y - off) / scale, sw)
                    col = [col[c] + a * (255 - col[c]) for c in range(3)]
                    for c in range(3): acc[c] += col[c]
                    acc[3] += 1
            n = ss * ss
            row.append((int(acc[0] / acc[3]), int(acc[1] / acc[3]), int(acc[2] / acc[3]), int(255 * acc[3] / n)) if acc[3] else (0, 0, 0, 0))
        out.append(row)
    return out

def png(pixels):
    h, w = len(pixels), len(pixels[0])
    raw = b''.join(b'\x00' + bytes(v for p in row for v in p) for row in pixels)
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')

def ico(pngs):
    head = struct.pack('<HHH', 0, 1, len(pngs))
    entries, data = b'', b''
    offset = 6 + 16 * len(pngs)
    for size, blob in pngs:
        entries += struct.pack('<BBBBHHII', size % 256, size % 256, 0, 0, 1, 32, len(blob), offset)
        data += blob
        offset += len(blob)
    return head + entries + data

if __name__ == '__main__':
    outdir = sys.argv[1]
    os.makedirs(outdir, exist_ok=True)
    blobs = [(s, png(render(s))) for s in [256, 64, 48, 32, 16]]
    open(os.path.join(outdir, 'icon.png'), 'wb').write(blobs[0][1])
    open(os.path.join(outdir, 'icon.ico'), 'wb').write(ico(blobs))
    print('ok')
