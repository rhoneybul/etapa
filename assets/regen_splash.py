"""
Regenerate splash PNGs with Poppins to match the in-app typography.
App heading  = Poppins_600SemiBold (white)      letter-spacing ~2-6
App subtitle = Poppins_300Light    (muted grey) letter-spacing ~1

Strategy: for each splash PNG:
  1. Open the *.original.png (preserved copy of the artwork).
  2. Detect the vertical span of the existing text by finding the rows
     at the bottom half that contain bright white pixels (ETAPA) and
     the grey pixels (subtitle).
  3. Black out those rows.
  4. Re-draw both strings using the Poppins fonts bundled in node_modules,
     sized relative to image height to preserve the original proportions.
  5. Save back to the non-original PNG.
"""

from PIL import Image, ImageDraw, ImageFont
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
POPPINS_SEMIBOLD = os.path.join(
    HERE, '..', 'node_modules', '@expo-google-fonts', 'poppins',
    '600SemiBold', 'Poppins_600SemiBold.ttf'
)
POPPINS_LIGHT = os.path.join(
    HERE, '..', 'node_modules', '@expo-google-fonts', 'poppins',
    '300Light', 'Poppins_300Light.ttf'
)

TITLE = 'ETAPA'
SUBTITLE = 'train with purpose'

# Colours — from src/theme/index.js
WHITE = (255, 255, 255)
MUTED = (160, 160, 168)  # colors.textMid from the app theme
BLACK = (0, 0, 0)


def draw_tracked(draw, xy, text, font, fill, tracking_px):
    """Draw text with per-character letter-spacing (tracking) in px."""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        bbox = font.getbbox(ch)
        ch_width = bbox[2] - bbox[0]
        x += ch_width + tracking_px


def measure_tracked(font, text, tracking_px):
    w = 0
    for i, ch in enumerate(text):
        bbox = font.getbbox(ch)
        w += (bbox[2] - bbox[0])
        if i < len(text) - 1:
            w += tracking_px
    asc, desc = font.getmetrics()
    return w, asc + desc


def detect_text_band(img):
    """Return (y_top, y_bottom) of the region that looks like text.
    Looks only in the bottom 55% of the image to avoid the logo."""
    w, h = img.size
    start = int(h * 0.45)
    px = img.load()
    rows_with_text = []
    for y in range(start, h):
        for x in range(0, w, max(1, w // 256)):
            r, g, b = px[x, y][:3]
            brightness = (r + g + b) // 3
            if brightness > 120:  # white text or grey subtitle
                rows_with_text.append(y)
                break
    if not rows_with_text:
        return None
    return min(rows_with_text), max(rows_with_text)


def regen(src_path, dst_path, layout='portrait'):
    im = Image.open(src_path).convert('RGB')
    w, h = im.size

    band = detect_text_band(im)
    if band is None:
        print(f'  !! no text detected in {src_path}, skipping')
        return
    y_top, y_bottom = band
    print(f'  detected text band y={y_top}..{y_bottom}')

    # Paint the detected text band — with a small margin on each side —
    # back to solid black so the new text draws over a clean surface.
    pad = max(8, int(h * 0.01))
    draw = ImageDraw.Draw(im)
    draw.rectangle([0, max(0, y_top - pad), w, min(h, y_bottom + pad)], fill=BLACK)

    # Font sizing based on image dimensions. Scale factor tuned to
    # approximate the typography weight/size of the original splash.
    if layout == 'wide':
        title_px = int(h * 0.085)
        subtitle_px = int(h * 0.035)
        tracking_title = max(2, int(title_px * 0.05))
        tracking_sub = 1
    else:
        title_px = int(h * 0.048)
        subtitle_px = int(h * 0.020)
        tracking_title = max(3, int(title_px * 0.08))
        tracking_sub = 1

    title_font = ImageFont.truetype(POPPINS_SEMIBOLD, title_px)
    sub_font = ImageFont.truetype(POPPINS_LIGHT, subtitle_px)

    title_w, title_h = measure_tracked(title_font, TITLE, tracking_title)
    sub_w, sub_h = measure_tracked(sub_font, SUBTITLE, tracking_sub)

    # Vertically centre both lines inside the original text band.
    gap = int(title_h * 0.35)
    total_h = title_h + gap + sub_h
    band_center = (y_top + y_bottom) // 2
    title_y = band_center - total_h // 2
    sub_y = title_y + title_h + gap

    title_x = (w - title_w) // 2
    sub_x = (w - sub_w) // 2

    draw_tracked(draw, (title_x, title_y), TITLE, title_font, WHITE, tracking_title)
    draw_tracked(draw, (sub_x, sub_y), SUBTITLE, sub_font, MUTED, tracking_sub)

    im.save(dst_path, format='PNG', optimize=True)
    print(f'  wrote {dst_path}  title={title_px}px sub={subtitle_px}px')


def main():
    files = [
        ('splash.original.png', 'splash.png', 'portrait'),
        ('splash-android.original.png', 'splash-android.png', 'portrait'),
        ('splash-wide.original.png', 'splash-wide.png', 'wide'),
    ]
    for src, dst, layout in files:
        src_full = os.path.join(HERE, src)
        dst_full = os.path.join(HERE, dst)
        if not os.path.exists(src_full):
            print(f'skip {src} — not found')
            continue
        print(f'processing {src} -> {dst} ({layout})')
        regen(src_full, dst_full, layout=layout)


if __name__ == '__main__':
    main()
