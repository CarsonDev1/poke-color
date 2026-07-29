"""Chon loc + nen ANH NEN tu mot thu muc nguon vao public/decor/bg/.

    python scripts/build_decor.py "D:/ss/poke-image"

VI SAO CO SCRIPT NAY chu khong copy tay:
  * Nguon la 45 MB PNG tho. Ship nguyen la khong the — script thu nho + doi WebP
    xuong con duoi 1 MB.
  * public/decor/ CO commit, nhung van can duong TAI TAO: doi danh sach asset
    (them stamp, doi so background) thi phai sinh lai, va khong co script thi
    khong ai biet lay lai tu dau.
  * Thu tu anh nen sap theo do PHU MAU la thuat toan, khong phai gu tham my
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

# 0 = DUNG HET. Nen doi moi 5 phut, nen so luong anh chinh la do dai mot vong:
# 12 anh x 5 phut = mot vong 1 tieng.
BG_COUNT = 0
BG_SIZE = 1280     # nen full man: 640 bi keo gian se thay ro net nhoe

EXTS = ('.png', '.webp', '.jpg', '.jpeg')

# Sprite sheet dang luoi: ten file -> (rong tile, cao tile).
# CHI liet ke o day nhung file thuc su la luoi thumbnail; anh thuong khong can.
# Do bang tay tu crop 1:1, khong doan.
SHEETS = {
    'Mobile - Pokemon Masters - Backgrounds - Regular.png': (512, 512),
}

# Anh nho hon nguong nay bi bo: keo mot anh 200px len full man, du co blur, van
# ra mot khoi nhoe be bet.
MIN_SOURCE_W = 380


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


HUE_BUCKETS = 12


def order_by_hue_spread(items, limit=0):
    """Sap thu tu XEN KE MAU, tuy chon gioi han so luong.

    Chia vong hue thanh 12 cung roi lay vong tron qua cac cung. Quan trong voi
    tinh nang doi nen dinh ky: xep theo ten file thi cac canh cua cung mot khu
    vuc nam lien nhau, va hai lan doi lien tiep trong gan giong nhau — nguoi dung
    tuong nen khong doi. Xen ke mau thi lan nao cung thay khac ro.

    `limit=0` nghia la lay HET.
    """
    buckets = [[] for _ in range(HUE_BUCKETS)]
    for path, hue in items:
        buckets[min(HUE_BUCKETS - 1, int(hue * HUE_BUCKETS))].append(path)
    for b in buckets:
        b.sort()                      # trong moi cung: theo ten, de deterministic

    out = []
    i = 0
    while any(buckets):
        b = buckets[i % HUE_BUCKETS]
        if b:
            out.append(b.pop(0))
        i += 1
    return out[:limit] if limit else out


def trim_flat_bottom(im, tol=6):
    """Cat bo dai mau PHANG o day tile.

    Moi cell trong sheet cao 512 nhung anh that chi ~410px tren; phan con lai la
    mot dai mau phang. Khong cat thi moi anh nen co mot vet mau tron chiem 20%
    chieu cao — rat lo khi dung lam nen full man.

    Cach do: so tung hang voi hang CUOI. Hang nao con giong hang cuoi (trong nguong
    `tol`) thi con thuoc dai dem; hang dau tien KHAC han la day anh that.
    """
    g = im.convert('RGB')
    w, h = g.size
    px = g.load()
    step = max(1, w // 24)
    ref = [px[x, h - 1] for x in range(0, w, step)]

    def like_ref(y):
        for i, x in enumerate(range(0, w, step)):
            p = px[x, y]
            if (abs(p[0] - ref[i][0]) + abs(p[1] - ref[i][1]) + abs(p[2] - ref[i][2])) > tol * 3:
                return False
        return True

    y = h - 1
    while y > h // 3 and like_ref(y):     # khong bao gio cat qua 2/3 anh
        y -= 1
    return im.crop((0, 0, w, y + 1)) if y + 1 < h else im


def is_blank(im, tol=4):
    """Tile gan nhu mot mau tron -> bo (o trong trong luoi)."""
    g = im.convert('RGB').resize((16, 16))
    px = [g.getpixel((x, y)) for y in range(16) for x in range(16)]
    lo = [min(c[i] for c in px) for i in range(3)]
    hi = [max(c[i] for c in px) for i in range(3)]
    return all(hi[i] - lo[i] <= tol for i in range(3))


def slice_sheet(path, tw, th):
    """Cat sheet thanh cac tile, bo tile trong, cat dai mau phang o day."""
    im = Image.open(path).convert('RGB')
    w, h = im.size
    out = []
    for row in range(h // th):
        for col in range(w // tw):
            cell = im.crop((col * tw, row * th, (col + 1) * tw, (row + 1) * th))
            if is_blank(cell):
                continue
            out.append(trim_flat_bottom(cell))
    return out


def save_webp(im, path, size, quality):
    im = im.copy()
    # Gioi han theo CHIEU RONG, khong dung thumbnail vuong: anh nen la anh ngang,
    # thumbnail((640,640)) se ep anh 1920x961 xuong con 640x320 — mat nua do phan
    # giai theo chieu cao mot cach vo ich.
    if im.size[0] > size:
        h = round(im.size[1] * size / im.size[0])
        im = im.resize((size, h), Image.LANCZOS)
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
    os.makedirs(os.path.join(out, 'bg'), exist_ok=True)

    total = 0
    manifest = {'bg': []}

    # ---- gom nguon: MOI anh trong thu muc (de quy) --------------------------
    # Quet chung thay vi bam mot cau truc thu muc cu the: thu muc nguon do nguoi
    # dung tu sap, va da doi vai lan. Bam cau truc thi moi lan doi la script im
    # lang tra ve 0 file.
    pool = []   # (anh, hue)
    files = []
    for dirpath, _d, fs in os.walk(src):
        for fn in sorted(fs):
            if fn.lower().endswith(EXTS):
                files.append(os.path.join(dirpath, fn))

    n_sheet = n_plain = n_small = 0
    for p in files:
        fn = os.path.basename(p)
        try:
            if fn in SHEETS:
                tw, th = SHEETS[fn]
                tiles = slice_sheet(p, tw, th)
                for im in tiles:
                    pool.append((im, avg_hue(im)))
                n_sheet += len(tiles)
                print('  sheet %s -> %d tile' % (fn[:40], len(tiles)))
                continue

            im = Image.open(p).convert('RGB')
            if im.size[0] < MIN_SOURCE_W:
                n_small += 1
                print('  bo (qua nho %dx%d): %s' % (im.size[0], im.size[1], fn))
                continue
            pool.append((im, avg_hue(im)))
            n_plain += 1
        except Exception as e:
            print('  bo qua', fn, e)

    print('anh thuong: %d, tile tu sheet: %d, bo vi qua nho: %d' % (n_plain, n_sheet, n_small))
    if not pool:
        sys.exit('KHONG tim thay anh nen nao trong ' + src)

    # ---- sap xen ke mau roi ghi ra -----------------------------------------
    # Sap theo hue de hai lan doi nen lien tiep trong khac ro; xep theo thu tu
    # nguon thi cac canh cung mot khu vuc nam lien nhau va nguoi dung tuong nen
    # khong doi.
    indexed = [(i, hue) for i, (_im, hue) in enumerate(pool)]
    order = order_by_hue_spread(indexed, BG_COUNT)
    for n, i in enumerate(order):
        fname = 'bg%03d.webp' % n
        total += save_webp(pool[i][0], os.path.join(out, 'bg', fname), BG_SIZE, 72)
        manifest['bg'].append(fname)
    print('background: %d file' % len(manifest['bg']))

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
        for key in ('bg',):
            names = manifest[key]
            f.write('export const DECOR_%s: readonly string[] = [\n' % key.upper())
            for n in names:
                f.write("  '/decor/%s/%s',\n" % (key, n))
            f.write(']\n\n')
    print('viet', ts_path)

    print('TONG: %.2f MB tai %s' % (total / 1e6, out))


if __name__ == '__main__':
    main()
