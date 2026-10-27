# Gera o ícone do Amethyst (buraco de minhoca) em PNG e ICO, sem bibliotecas externas.
import math, struct, sys, zlib, os

def render(size):
    ss = 3  # supersampling
    S = size * ss
    px = [[(0, 0, 0, 0)] * S for _ in range(S)]
    r_corner = S * 0.22
    rings = []
    n = 6
    for i in range(n):
        t = i / (n - 1)
        k = (1 - t) ** 1.6
        rx = S * (0.05 + 0.36 * k)
        rings.append((S * (0.5 + 0.06 * t), S * (0.53 - 0.04 * t), rx, rx * 0.36, S * (0.015 - 0.007 * t), 1 - 0.55 * t))
    ang = math.radians(-14)
    ca, sa = math.cos(ang), math.sin(ang)
    for y in range(S):
        for x in range(S):
            # cantos arredondados
            dx = max(r_corner - x, 0, x - (S - 1 - r_corner))
            dy = max(r_corner - y, 0, y - (S - 1 - r_corner))
            if dx * dx + dy * dy > r_corner * r_corner:
                continue
            u, v = x / S, y / S
            # fundo: grafite com brilhos violeta e rosa
            base = [26, 27, 38]
            g1 = max(0, 1 - math.hypot(u - 0.85, v - 0.15) / 0.75)
            g2 = max(0, 1 - math.hypot(u - 0.15, v - 1.05) / 0.7)
            col = [base[c] + (g1 ** 1.5) * ([91, 44, 255][c] - base[c]) for c in range(3)]
            col = [col[c] + (g2 ** 1.5) * ([255, 45, 85][c] - col[c]) for c in range(3)]
            a = 0.0
            for (cx, cy, rx, ry, w, op) in rings:
                px_ = (x - cx) * ca + (y - cy) * sa
                py_ = -(x - cx) * sa + (y - cy) * ca
                d = math.hypot(px_ / rx, py_ / ry)
                dist = abs(d - 1) * min(rx, ry) * 1.6
                if dist < w:
                    a = max(a, op)
            # núcleo brilhante
            core = math.hypot(x - S * 0.56, y - S * 0.49)
            cr = S * 0.07
            if core < cr:
                a = max(a, (1 - core / cr) ** 0.8)
            col = [col[c] + a * (255 - col[c]) for c in range(3)]
            px[y][x] = (col[0], col[1], col[2], 255)
    out = []
    for y in range(size):
        row = []
        for x in range(size):
            acc = [0, 0, 0, 0]
            for j in range(ss):
                for i in range(ss):
                    p = px[y * ss + j][x * ss + i]
                    acc[3] += p[3]
                    for c in range(3):
                        acc[c] += p[c] * p[3]
            al = acc[3]
            if al:
                row.append(tuple(int(acc[c] / al) for c in range(3)) + (int(al / ss / ss),))
            else:
                row.append((0, 0, 0, 0))
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
    sizes = [256, 64, 48, 32, 16]
    blobs = [(s, png(render(s))) for s in sizes]
    open(os.path.join(outdir, 'icon.png'), 'wb').write(blobs[0][1])
    open(os.path.join(outdir, 'icon.ico'), 'wb').write(ico(blobs))
    print('ok')
