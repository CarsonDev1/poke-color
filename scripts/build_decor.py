"""Chon loc + nen tai nguyen trang tri tu mot thu muc nguon vao public/decor/.

    python scripts/build_decor.py "D:/ss/poke-image"

VI SAO CO SCRIPT NAY chu khong copy tay:
  * Nguon la 45 MB PNG tho. Ship nguyen la khong the — script thu nho + doi WebP
    xuong con duoi 1 MB.
  * public/decor/ CO commit, nhung van can duong TAI TAO: doi danh sach asset
    (them stamp, doi so background) thi phai sinh lai, va khong co script thi
    khong ai biet lay lai tu dau.
  * Viec chon 16 background theo do PHU MAU la thuat toan, khong phai gu tham my
    — chay lai cho ket qua giong nhau.

Yeu cau: Pillow (pip install pillow).
"""
import colorsys
import glob
import json
import os
import shutil
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit('Can Pillow: pip install pillow')

# --- stamp duoc chon, theo so trong ten file stamp_XXXX.png -------------------
# Chon bang mat tu contact sheet co so (scripts khong the tu doan y nghia icon).

# Bung ra khi to xong mot buc tranh.
CELEBRATE = [
    '0001', '0004', '0006', '0007', '0008', '0010', '0018', '0019',
    '0020', '0021', '0023', '0024', '0025', '0027', '0134', '0170', '0185',
]

# Diem nhan nho rai rac trong giao dien.
ACCENT = [
    '0011', '0012', '0015', '0016', '0017', '0029', '0030', '0031',
    '0146', '0148', '0151', '0152', '0153', '0154', '0155', '0156', '0157', '0158',
]

# 18 huy hieu he Pokemon (vong tron). Lien tuc 0033..0050.
TYPES = ['%04d' % n for n in range(33, 51)]

BG_COUNT = 16
BG_SIZE = 640      # nen bi lam mo va toi di, khong can hon
STAMP_SIZE = 96
CELEBRATE_SIZE = 128


def avg_hue(im):
    """Hue trung binh (0..1) cua anh, bo qua pixel gan xam."""
    small = im.convert('RGB').resize((32, 32))
    # duyet bang getpixel thay vi getdata(): getdata da deprecated tu Pillow 12
    px = [small.getpixel((x, y)) for y in range(32) for x in range(32)]
    hs = []
    for r, g, b in px:
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if s > 0.18 and v > 0.12:
            hs.append(h)
    if not hs:
        return 0.0
    return sum(hs) / len(hs)


def pick_spread(items, n):
    """Chon n phan tu phu deu pho hue.

    Chia vong hue thanh n cung roi lay mot dai dien moi cung — nen bo nen thu
    duoc da mau thay vi 16 canh rung xanh gan giong nhau.
    """
    buckets = [[] for _ in range(n)]
    for path, hue in items:
        buckets[min(n - 1, int(hue * n))].append((path, hue))
    out = []
    for b in buckets:
        if b:
            out.append(sorted(b)[len(b) // 2][0])   # giua cung, on dinh
    # cung nao rong thi bu bang phan tu chua dung
    used = set(out)
    for path, _ in items:
        if len(out) >= n:
            break
        if path not in used:
            out.append(path)
            used.add(path)
    return out[:n]


def save_webp(im, path, size, quality):
    im = im.copy()
    im.thumbnail((size, size), Image.LANCZOS)
    if im.mode == 'RGBA':
        im.save(path, 'WEBP', quality=quality, method=6)
    else:
        im.convert('RGB').save(path, 'WEBP', quality=quality, method=6)
    return os.path.getsize(path)


def main():
    if len(sys.argv) < 2:
        sys.exit('Dung: python scripts/build_decor.py <thu-muc-nguon>')
    src = sys.argv[1]
    if not os.path.isdir(src):
        sys.exit('Khong thay thu muc: ' + src)

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, 'public', 'decor')
    if os.path.isdir(out):
        shutil.rmtree(out)
    for sub in ('bg', 'celebrate', 'accent', 'type'):
        os.makedirs(os.path.join(out, sub), exist_ok=True)

    total = 0
    manifest = {'bg': [], 'celebrate': [], 'accent': [], 'type': []}

    # ---------------------------------------------------------------- background
    locs = sorted(glob.glob(os.path.join(src, '**', 'Locations', '*.png'), recursive=True))
    if not locs:
        print('CANH BAO: khong thay Locations/*.png')
    scored = []
    for p in locs:
        try:
            scored.append((p, avg_hue(Image.open(p))))
        except Exception as e:
            print('  bo qua', os.path.basename(p), e)
    chosen = pick_spread(scored, BG_COUNT)
    for i, p in enumerate(chosen):
        name = 'bg%02d.webp' % i
        total += save_webp(Image.open(p), os.path.join(out, 'bg', name), BG_SIZE, 72)
        manifest['bg'].append(name)
    print('background: %d file' % len(manifest['bg']))

    # ---------------------------------------------------------------- stamp
    def do_stamps(numbers, sub, size, quality):
        got = 0
        for num in numbers:
            matches = glob.glob(os.path.join(src, 'stamp_%s.png' % num))
            if not matches:
                continue
            im = Image.open(matches[0]).convert('RGBA')
            bb = im.split()[3].getbbox()
            if bb is None:
                continue                    # stamp rong hoan toan
            im = im.crop(bb)                # crop sat noi dung: bot pixel trong suot vo ich
            name = '%s.webp' % num
            nonlocal_total[0] += save_webp(im, os.path.join(out, sub, name), size, quality)
            manifest[sub].append(name)
            got += 1
        print('%s: %d file' % (sub, got))

    nonlocal_total = [total]
    do_stamps(CELEBRATE, 'celebrate', CELEBRATE_SIZE, 88)
    do_stamps(ACCENT, 'accent', STAMP_SIZE, 88)
    do_stamps(TYPES, 'type', STAMP_SIZE, 88)
    total = nonlocal_total[0]

    with open(os.path.join(out, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)

    # Sinh luon manifest TypeScript. Viet tay hai danh sach o hai noi la chac
    # chan co ngay chung lech nhau — va lech thi UI im lang mat mot nhom asset
    # chu khong bao loi. File nay CO commit (chi la ten file); anh thi khong, va
    # component tu an khi anh 404.
    ts_path = os.path.join(root, 'src', 'ui', 'decor-manifest.ts')
    with open(ts_path, 'w', encoding='utf-8') as f:
        f.write('// SINH TU DONG boi scripts/build_decor.py — DUNG SUA TAY.\n')
        f.write('//\n')
        f.write('// Anh thuc nam o public/decor/ (co commit). Thieu anh thi cac\n')
        f.write('// component trang tri tu an — xem src/ui/components/decor.tsx.\n')
        f.write('//\n')
        f.write('// Tai tao: python scripts/build_decor.py "<thu-muc-nguon>"\n\n')
        for key in ('bg', 'celebrate', 'accent', 'type'):
            names = manifest[key]
            f.write('export const DECOR_%s: readonly string[] = [\n' % key.upper())
            for n in names:
                f.write("  '/decor/%s/%s',\n" % (key, n))
            f.write(']\n\n')
    print('viet', ts_path)

    print('TONG: %.2f MB tai %s' % (total / 1e6, out))


if __name__ == '__main__':
    main()
