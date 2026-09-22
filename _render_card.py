import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1050, 600  # 3.5" x 2" at 300 dpi
OUT = r"C:/Users/bclar/OneDrive/Desktop/Amazon FBA/big-cs-fishing-co"
LOGO = os.path.join(OUT, "assets", "logo.png")
FDIR = r"C:/Windows/Fonts"

def font(name, size):
    p = os.path.join(FDIR, name)
    return ImageFont.truetype(p, size) if os.path.exists(p) else ImageFont.load_default()

CREAM = (230, 224, 212)
GOLD = (217, 158, 70)
DIM = (182, 173, 157)

# --- deep navy background so the logo colors pop ---
img = Image.new("RGB", (W, H), (10, 13, 18))
d = ImageDraw.Draw(img)

# --- full logo, large, left-center ---
logo = Image.open(LOGO).convert("RGBA")
ls = 520
logo = logo.resize((ls, ls), Image.LANCZOS)
img.paste(logo, (30, 40), logo)

# --- text block, right side ---
def fit_head(text, start, maxw):
    size = start
    while size > 30:
        f = font("arialbd.ttf", size)
        if d.textlength(text, font=f) <= maxw:
            return f
        size -= 2
    return font("arialbd.ttf", size)

tx = 585
maxw = W - tx - 20  # ~445
f_head = fit_head("FISHING WITH US", 60, maxw)

f_tag = font("georgiai.ttf", 26)
f_body = font("segoeui.ttf", 25)
f_foot = font("arial.ttf", 18)

d.text((tx, 150), "THANKS FOR", font=f_head, fill=CREAM)
d.text((tx, 240), "FISHING WITH US", font=f_head, fill=GOLD)
d.text((tx, 345), "BUILT TO CATCH.  MADE TO LAST.", font=f_tag, fill=CREAM)
d.text((tx, 412), "Hand-packed with a little extra", font=f_body, fill=DIM)
d.text((tx, 446), "in the box. A quick review means a lot.", font=f_body, fill=DIM)
d.text((tx, 528), "hello@bigcsfishing.com  \u00b7  bigcsfishing.com", font=f_foot, fill=GOLD)

# --- gold border ---
d.rectangle([8, 8, W - 9, H - 9], outline=GOLD, width=4)

print("headline size:", f_head.size, "| width:", int(d.textlength("FISHING WITH US", font=f_head)))
img.save(os.path.join(OUT, "thank-you-card.png"))
img.save(os.path.join(OUT, "thank-you-card-preview.jpg"), quality=92)
print("saved")
