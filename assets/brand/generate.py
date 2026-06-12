#!/usr/bin/env python3
"""Generate all OroQ brand-derived assets from the source logo zip."""
import os
from PIL import Image, ImageDraw, ImageFont

SRC = "/tmp/oroqlogos"
ROOT = "/Users/apple/Desktop/Projects/oroq"

ICON   = Image.open(f"{SRC}/Oroq-logo-Iicon.png").convert("RGBA")        # 1080 full squircle icon
Q_MIST = Image.open(f"{SRC}/Oroq-logo-fav-icon-mist.png").convert("RGBA")# 1080 light Q, transparent
Q_NAVY = Image.open(f"{SRC}/Oroq-logo-fav-icon-navy.png").convert("RGBA")# 1080 navy Q, transparent
TYPE_MIST = Image.open(f"{SRC}/Oroq-logo-type-mist.png").convert("RGBA") # 612x176 light wordmark

def ensure(p): os.makedirs(p, exist_ok=True)

def trim(im):
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im

def fit_center(content, canvas_px, content_frac):
    """Place trimmed content centered on a transparent square canvas at given fraction."""
    c = trim(content)
    target = int(canvas_px * content_frac)
    scale = min(target / c.width, target / c.height)
    nw, nh = max(1, round(c.width * scale)), max(1, round(c.height * scale))
    c = c.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (canvas_px, canvas_px), (0, 0, 0, 0))
    canvas.paste(c, ((canvas_px - nw) // 2, (canvas_px - nh) // 2), c)
    return canvas

def resize(im, px):
    return im.resize((px, px), Image.LANCZOS)

def round_mask(im):
    px = im.width
    mask = Image.new("L", (px, px), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, px - 1, px - 1), fill=255)
    out = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    return out

# ---------------------------------------------------------------- SITE
site = f"{ROOT}/site/assets"
ensure(site)
# header / inline marks served with the site
resize(Q_MIST, 256).save(f"{site}/logo-q-mist.png")
resize(Q_NAVY, 256).save(f"{site}/logo-q-navy.png")
trim(TYPE_MIST).save(f"{site}/logo-type-mist.png")
# favicons (navy Q reads on light browser tabs)
fav = trim(Q_NAVY)
resize(fav, 32).save(f"{site}/favicon-32.png")
resize(fav, 16).save(f"{site}/favicon-16.png")
# multi-size .ico
resize(fav, 48).save(f"{site}/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
# apple touch icon — full squircle icon, iOS adds its own corners
resize(ICON, 180).save(f"{site}/apple-touch-icon.png")
print("site assets done")

# ---------------------------------------------------------------- ANDROID
res = f"{ROOT}/android/app/src/main/res"
LEGACY = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
ADAPT  = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
for d, px in LEGACY.items():
    folder = f"{res}/mipmap-{d}"
    ensure(folder)
    sq = resize(ICON, px)
    sq.save(f"{folder}/ic_launcher.png")
    round_mask(sq).save(f"{folder}/ic_launcher_round.png")
for d, px in ADAPT.items():
    folder = f"{res}/mipmap-{d}"
    ensure(folder)
    # adaptive content lives in the inner safe zone (~0.62 of the 108 canvas)
    fit_center(Q_MIST, px, 0.62).save(f"{folder}/ic_launcher_fg.png")
print("android icons done")

# ---------------------------------------------------------------- PLAY STORE
store = f"{ROOT}/assets/store/android"
ensure(store)
resize(ICON, 512).save(f"{store}/icon-512.png")

# Feature graphic 1024x500 — navy gradient + OROQ wordmark + tagline
W, H = 1024, 500
fg = Image.new("RGBA", (W, H), (10, 20, 32, 255))  # #0A1420
# diagonal navy glow from bottom-left
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
for i in range(H):
    t = i / H
    # blend toward #12305B near the bottom
    r = int(10 + (18 - 10) * t)
    g = int(20 + (48 - 20) * t)
    b = int(32 + (91 - 32) * t)
    gd.line([(0, i), (W, i)], fill=(r, g, b, 255))
fg = Image.alpha_composite(fg, glow)
# wordmark (mist), scaled to ~46% width, left-aligned block
wm = trim(TYPE_MIST)
wm_w = int(W * 0.42)
wm_h = int(wm.height * (wm_w / wm.width))
wm = wm.resize((wm_w, wm_h), Image.LANCZOS)
x0 = 80
y0 = int(H * 0.30)
fg.alpha_composite(wm, (x0, y0))
# tagline
draw = ImageDraw.Draw(fg)
font = None
for fp in ["/System/Library/Fonts/SFNSDisplay.ttf",
           "/System/Library/Fonts/Helvetica.ttc",
           "/Library/Fonts/Arial.ttf",
           "/System/Library/Fonts/Supplemental/Arial.ttf"]:
    if os.path.exists(fp):
        try:
            font = ImageFont.truetype(fp, 40)
            break
        except Exception:
            continue
if font is None:
    font = ImageFont.load_default()
draw.text((x0 + 4, y0 + wm_h + 28), "See Risk. Act With Confidence.",
          fill=(214, 224, 240, 255), font=font)
# Q mark accent on the right
qm = fit_center(Q_MIST, 360, 0.86)
fg.alpha_composite(qm, (W - 380, (H - 360) // 2))
fg.convert("RGB").save(f"{store}/feature-graphic-1024x500.png")
print("play store assets done")
print("ALL DONE")
