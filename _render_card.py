import os, math
from PIL import Image, ImageDraw, ImageFont

W, H = 1800, 1200  # 6" x 4" postcard (landscape) at 300 dpi
OUT = r"C:/Users/bclar/OneDrive/Desktop/Amazon FBA/big-cs-fishing-co"
LOGO = os.path.join(OUT, "assets", "logo.png")
FDIR = r"C:/Windows/Fonts"

def font(name, size):
    p = os.path.join(FDIR, name)
    return ImageFont.truetype(p, size) if os.path.exists(p) else ImageFont.load_default()

NAVY = (2, 6, 10)
GOLD = (255, 196, 0)
DIM = (160, 160, 160)
STAR = (255, 164, 28)
BLACK = (0, 0, 0)

img = Image.new("RGB", (W, H), (255, 255, 255))
d = ImageDraw.Draw(img)

logo = Image.open(LOGO).convert("RGBA")
ls = 820
logo = logo.resize((ls, ls), Image.LANCZOS)
img.paste(logo, (60, 190), logo)

def script_font(size):
    for name in ("segoescb.ttf", "BRUSHSCI.TTF", "segoesc.ttf", "FREESCPT.TTF", "LHANDW.TTF"):
        p = os.path.join(FDIR, name)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def fit_script(text, start, maxw):
    size = start
    while size > 40:
        f = script_font(size)
        if d.textlength(text, font=f) <= maxw:
            return f
        size -= 2
    return script_font(size)

tx = 960
maxw = W - tx - 40
col_center = tx + maxw // 2
f_head = fit_script("fishing with us.", 150, maxw)
f_tag = font("georgiai.ttf", 40)
f_body = font("segoeui.ttf", 44)
f_contact = font("arialbd.ttf", 46)

# headline — two lines close
y = 235
bb = d.textbbox((tx, y), "Thanks for", font=f_head)
d.text((tx, y), "Thanks for", font=f_head, fill=NAVY)
y = bb[3] + 22
bb = d.textbbox((tx, y), "fishing with us.", font=f_head)
d.text((tx, y), "fishing with us.", font=f_head, fill=GOLD)
y = bb[3] + 80

# body
d.text((tx, y), "Hand-packed with a little extra", font=f_body, fill=DIM)
bb = d.textbbox((tx, y), "Hand-packed with a little extra", font=f_body)
y = bb[3] + 12
d.text((tx, y), "in the box. A quick review means a lot.", font=f_body, fill=DIM)
bb = d.textbbox((tx, y), "in the box. A quick review means a lot.", font=f_body)
y = bb[3] + 48  # stars closer to the paragraph

# stars centered
star_cy = y + 56
def draw_star(cx, cy, r_out, r_in):
    pts = []
    for i in range(10):
        r = r_out if i % 2 == 0 else r_in
        ang = -math.pi / 2 + i * math.pi / 5
        pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
    d.line(pts + [pts[0]], fill=STAR, width=6)

spacing = 112
for i in range(5):
    draw_star(col_center + (i - 2) * spacing, star_cy, 50, 20)
y = star_cy + 62 + 68

# contact — two lines, moved up so the tagline has clearance
d.text((tx, y), "hello@bigcsfishing.com", font=f_contact, fill=GOLD)
bb = d.textbbox((tx, y), "hello@bigcsfishing.com", font=f_contact)
y = bb[3] + 12
d.text((tx, y), "bigcsfishing.com", font=f_contact, fill=GOLD)
bb = d.textbbox((tx, y), "bigcsfishing.com", font=f_contact)

# tagline at the very bottom, clearly below the contact
tag = "BUILT TO CATCH  \u2022  MADE TO LAST"
tw = d.textlength(tag, font=f_tag)
d.text(((W - tw) / 2, 1130), tag, font=f_tag, fill=NAVY)

d.rectangle([10, 10, W - 11, H - 11], outline=BLACK, width=6)

print("headline:", f_head.size, "px | contact bottom:", bb[3])
img.save(os.path.join(OUT, "thank-you-card.png"))
img.save(os.path.join(OUT, "thank-you-card-preview.jpg"), quality=92)
print("saved")
