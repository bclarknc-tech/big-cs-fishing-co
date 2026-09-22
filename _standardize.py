import os
from PIL import Image

PRODUCTS = r"C:/Users/bclar/OneDrive/Desktop/Amazon FBA/big-cs-fishing-co/assets/products"
BIG = r"C:/Users/bclar/OneDrive/Desktop/Amazon FBA/Big Cs Fishing"

S = 900      # output square size
PAD = 0.05   # padding fraction

def standardize(src, out):
    im = Image.open(src).convert("RGB")
    w, h = im.size
    corners = [im.getpixel((2, 2)), im.getpixel((w - 3, 2)),
               im.getpixel((2, h - 3)), im.getpixel((w - 3, h - 3))]
    lum = sum(c[0] + c[1] + c[2] for c in corners) / (12.0 * 255)
    bg = "white" if lum > 0.75 else "dark"
    g = im.convert("L")
    mask = g.point(lambda p: 0 if p > 238 else 255) if bg == "white" \
        else g.point(lambda p: 0 if p < 28 else 255)
    bbox = mask.getbbox()
    if not bbox:
        bbox = (0, 0, w, h)
    crop = im.crop(bbox)
    cw, ch = crop.size
    maxside = S * (1 - 2 * PAD)
    scale = min(maxside / cw, maxside / ch)
    nw, nh = max(1, int(cw * scale)), max(1, int(ch * scale))
    crop = crop.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGB", (S, S), (255, 255, 255))
    canvas.paste(crop, ((S - nw) // 2, (S - nh) // 2))
    canvas.save(out, quality=92)
    return bg, bbox, (nw, nh)

jobs = [
    ("braided-line",       os.path.join(PRODUCTS, "braided-line.jpg")),
    ("mono-line",          os.path.join(PRODUCTS, "mono-line.jpg")),
    ("bottle-opener",      os.path.join(PRODUCTS, "bottle-opener.jpg")),
    ("rod-strap",          os.path.join(PRODUCTS, "rod-strap.jpg")),
    ("crankbait-keychains", os.path.join(BIG, "Crank Bait Keychain", "CB 1.jpg")),
    ("spoon-set",          os.path.join(BIG, "10pc Spinner Lure", "Images", "Whole Set.jpg")),
    ("pencil-lure",        os.path.join(PRODUCTS, "pencil-lure.jpg")),
    ("knot-card",          os.path.join(PRODUCTS, "knot-card.jpg")),
]

for name, src in jobs:
    try:
        bg, bbox, size = standardize(src, os.path.join(PRODUCTS, name + ".jpg"))
        print(f"{name}: bg={bg} src_bbox={bbox} fitted={size}")
    except Exception as e:
        print(f"{name}: ERROR {e}")
