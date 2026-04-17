"""
Regenerate the six Etapa brand-kit PNGs referenced by every ad brief.

Outputs (all 1080x1920, 9:16):
  brand-squiggle-01.png       — pink squiggle on black, wordmark top-left, AI chip bottom-left
  brand-squiggle-etapa.png    — squiggle + ETAPA wordmark lock-up
  brand-squiggle-tagline.png  — squiggle + ETAPA + 'train with purpose'
  brand-headline-poster.png   — sample headline poster (the reference-ad style anchor)
  brand-icon-72.png           — app icon copy (passthrough)
  brand-cta-card.png          — 'Read the full guide →' pill on black

The squiggle artwork is extracted from assets/splash.png (which is already text-free
after the earlier regen step — pure logo on black).

Run: python3 website/blog/ads/_library/regen.py
"""
from PIL import Image, ImageDraw, ImageFont
import os
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
ASSETS = os.path.join(ROOT, 'assets')
WEBSITE = os.path.join(ROOT, 'website')
OUT = HERE

W, H = 1080, 1920

# Colours
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
ROSA = (232, 69, 139)        # #E8458B
ROSA_A = (232, 69, 139, 255)
MID_GREY = (160, 160, 168)   # #A0A0A8
GRAPHITE = (26, 26, 30)      # #1A1A1E (pill fill)

FONT_DIR = os.path.join(ROOT, 'node_modules', '@expo-google-fonts', 'poppins')
POPPINS = {
    'semibold': os.path.join(FONT_DIR, '600SemiBold', 'Poppins_600SemiBold.ttf'),
    'medium':   os.path.join(FONT_DIR, '500Medium',   'Poppins_500Medium.ttf'),
    'regular':  os.path.join(FONT_DIR, '400Regular',  'Poppins_400Regular.ttf'),
    'light':    os.path.join(FONT_DIR, '300Light',    'Poppins_300Light.ttf'),
}


def _measure_tracked(font, text, tracking):
    w = 0
    for i, ch in enumerate(text):
        b = font.getbbox(ch)
        w += (b[2] - b[0])
        if i < len(text) - 1:
            w += tracking
    asc, desc = font.getmetrics()
    return w, asc + desc


def _draw_tracked(draw, xy, text, font, fill, tracking):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        b = font.getbbox(ch)
        x += (b[2] - b[0]) + tracking


def extract_squiggle():
    """Crop the icon artwork out of assets/splash.png."""
    im = Image.open(os.path.join(ASSETS, 'splash.png')).convert('RGBA')
    w, h = im.size
    px = im.load()
    xs, ys = [], []
    step = max(1, min(w, h) // 500)
    for y in range(0, h, step):
        for x in range(0, w, step):
            r, g, b, *_ = px[x, y][:4]
            if (r + g + b) // 3 > 20:
                xs.append(x); ys.append(y)
    if not xs:
        raise RuntimeError('Could not detect squiggle in splash.png')
    pad = 16
    bbox = (max(0, min(xs) - pad), max(0, min(ys) - pad),
            min(w, max(xs) + pad + 1), min(h, max(ys) + pad + 1))
    return im.crop(bbox)


def draw_ai_chip(canvas):
    """Bottom-left 'MADE WITH AI · ETAPA' pill."""
    text = 'MADE WITH AI · ETAPA'
    font = ImageFont.truetype(POPPINS['medium'], 22)
    tracking = 2
    tw, th = _measure_tracked(font, text, tracking)
    pad_x, pad_y = 22, 12
    pw, ph = tw + pad_x * 2, th + pad_y * 2
    margin = 42
    x0 = margin
    y0 = H - margin - ph
    # Pill using semi-transparent black on top of black canvas — effectively a subtle dark grey
    pill = Image.new('RGBA', (pw, ph), (0, 0, 0, 0))
    pdraw = ImageDraw.Draw(pill)
    pdraw.rounded_rectangle([0, 0, pw - 1, ph - 1], radius=ph // 2,
                            fill=(15, 15, 15, 235), outline=(40, 40, 44, 255), width=1)
    canvas.alpha_composite(pill, (x0, y0))
    d = ImageDraw.Draw(canvas)
    # vertical centre the text inside the pill
    asc, desc = font.getmetrics()
    text_y = y0 + (ph - (asc + desc)) // 2 - 2
    _draw_tracked(d, (x0 + pad_x, text_y), text, font, ROSA_A, tracking)


def draw_wordmark_tl(canvas, size=42):
    font = ImageFont.truetype(POPPINS['semibold'], size)
    d = ImageDraw.Draw(canvas)
    d.text((54, 48), 'Etapa', font=font, fill=WHITE + (255,))


def new_canvas():
    return Image.new('RGBA', (W, H), BLACK + (255,))


def paste_squiggle(canvas, squiggle, target_width, center=(W // 2, H // 2)):
    sw, sh = squiggle.size
    scale = target_width / sw
    new_size = (int(sw * scale), int(sh * scale))
    s = squiggle.resize(new_size, Image.LANCZOS)
    x = center[0] - new_size[0] // 2
    y = center[1] - new_size[1] // 2
    canvas.alpha_composite(s, (x, y))


# ──────────────────────────────────────────────────────────────────────────────
# Card generators
# ──────────────────────────────────────────────────────────────────────────────

def card_squiggle_01(squiggle):
    c = new_canvas()
    paste_squiggle(c, squiggle, target_width=620, center=(W // 2, H // 2))
    draw_wordmark_tl(c)
    draw_ai_chip(c)
    return c


def card_squiggle_etapa(squiggle):
    c = new_canvas()
    paste_squiggle(c, squiggle, target_width=560, center=(W // 2, int(H * 0.42)))
    # ETAPA wordmark, large and centred below the squiggle
    font = ImageFont.truetype(POPPINS['semibold'], 180)
    tracking = 16
    tw, th = _measure_tracked(font, 'ETAPA', tracking)
    x = (W - tw) // 2
    y = int(H * 0.66)
    d = ImageDraw.Draw(c)
    _draw_tracked(d, (x, y), 'ETAPA', font, WHITE + (255,), tracking)
    draw_wordmark_tl(c)
    draw_ai_chip(c)
    return c


def card_squiggle_tagline(squiggle):
    c = new_canvas()
    paste_squiggle(c, squiggle, target_width=520, center=(W // 2, int(H * 0.38)))
    # ETAPA wordmark
    font_big = ImageFont.truetype(POPPINS['semibold'], 170)
    tracking_big = 15
    tw, th = _measure_tracked(font_big, 'ETAPA', tracking_big)
    d = ImageDraw.Draw(c)
    y_big = int(H * 0.62)
    _draw_tracked(d, ((W - tw) // 2, y_big), 'ETAPA', font_big, WHITE + (255,), tracking_big)
    # Tagline
    font_tag = ImageFont.truetype(POPPINS['light'], 58)
    tag = 'train with purpose'
    tag_w = font_tag.getbbox(tag)[2]
    y_tag = y_big + 200
    d.text(((W - tag_w) // 2, y_tag), tag, font=font_tag, fill=MID_GREY + (255,))
    draw_wordmark_tl(c)
    draw_ai_chip(c)
    return c


def card_headline_poster(squiggle):
    c = new_canvas()
    d = ImageDraw.Draw(c)
    # Headline — break across 4 lines to match the reference-ad layout
    headline_lines = [
        'Cycling,',
        'for people',
        "who weren't",
        'always',
        'cyclists.',
    ]
    font_h = ImageFont.truetype(POPPINS['semibold'], 112)
    x_left = 92
    y = 220
    line_gap = 8
    asc, desc = font_h.getmetrics()
    for line in headline_lines:
        d.text((x_left, y), line, font=font_h, fill=WHITE + (255,))
        y += (asc + desc) + line_gap
    # Subhead
    font_sub = ImageFont.truetype(POPPINS['light'], 46)
    sub = 'An AI coach for the ride ahead.'
    d.text((x_left, y + 24), sub, font=font_sub, fill=MID_GREY + (255,))
    # Small squiggle, well below the subhead with clear breathing room
    paste_squiggle(c, squiggle, target_width=220, center=(int(W * 0.78), int(H * 0.9)))
    draw_wordmark_tl(c)
    draw_ai_chip(c)
    return c


def card_icon_72():
    """Pass-through of the app icon at 72px (referenced by name in briefs)."""
    src = os.path.join(WEBSITE, 'icon-72.png')
    if os.path.exists(src):
        im = Image.open(src).convert('RGBA')
        return im
    # Fallback: downscale the squiggle artwork
    return extract_squiggle().resize((72, 72), Image.LANCZOS)


def _draw_arrow(canvas, x, y, size, fill):
    """Draw a simple right-pointing arrow as polygon — font-independent."""
    d = ImageDraw.Draw(canvas)
    # Horizontal stem
    stem_h = max(2, size // 10)
    stem_x0 = x
    stem_x1 = x + int(size * 0.75)
    stem_y0 = y + size // 2 - stem_h // 2
    stem_y1 = stem_y0 + stem_h
    d.rectangle([stem_x0, stem_y0, stem_x1, stem_y1], fill=fill)
    # Arrowhead triangle
    head = [
        (stem_x1 - size // 4, y + size // 10),
        (x + size, y + size // 2),
        (stem_x1 - size // 4, y + size - size // 10),
    ]
    d.polygon(head, fill=fill)


def card_cta(squiggle):
    """Editorial end-card: squiggle hero, ETAPA lock-up, tracked uppercase CTA
    with a rosa underline and a drawn arrow. No giant web-button pill."""
    c = new_canvas()
    d = ImageDraw.Draw(c)

    # 1. Squiggle hero — similar scale to the wordmark card
    paste_squiggle(c, squiggle, target_width=460, center=(W // 2, int(H * 0.36)))

    # 2. ETAPA wordmark lock-up under the squiggle
    font_wm = ImageFont.truetype(POPPINS['semibold'], 124)
    tracking_wm = 10
    wm_w, wm_h = _measure_tracked(font_wm, 'ETAPA', tracking_wm)
    wm_x = (W - wm_w) // 2
    wm_y = int(H * 0.60)
    _draw_tracked(d, (wm_x, wm_y), 'ETAPA', font_wm, WHITE + (255,), tracking_wm)

    # 3. Tracked uppercase CTA with rosa underline
    cta_text = 'READ THE FULL GUIDE'
    font_cta = ImageFont.truetype(POPPINS['medium'], 46)
    tracking_cta = 4
    cta_w, cta_h = _measure_tracked(font_cta, cta_text, tracking_cta)
    arrow_size = 42
    arrow_gap = 28
    total_w = cta_w + arrow_gap + arrow_size
    cta_x = (W - total_w) // 2
    cta_y = int(H * 0.76)
    _draw_tracked(d, (cta_x, cta_y), cta_text, font_cta, WHITE + (255,), tracking_cta)
    # Arrow
    asc, desc = font_cta.getmetrics()
    arrow_y = cta_y + ((asc + desc) - arrow_size) // 2 + 2
    _draw_arrow(c, cta_x + cta_w + arrow_gap, arrow_y, arrow_size, ROSA + (255,))
    # Rosa underline under the CTA — 2px line spanning text + arrow, with breathing room
    underline_y = cta_y + (asc + desc) + 18
    d.rectangle([cta_x, underline_y, cta_x + total_w, underline_y + 3], fill=ROSA + (255,))

    # 4. Subtle destination hint below the rule
    font_hint = ImageFont.truetype(POPPINS['light'], 34)
    hint = 'on the Etapa blog'
    hint_w = font_hint.getbbox(hint)[2]
    d.text(((W - hint_w) // 2, underline_y + 28), hint, font=font_hint, fill=MID_GREY + (255,))

    draw_wordmark_tl(c)
    draw_ai_chip(c)
    return c


# ──────────────────────────────────────────────────────────────────────────────

def main():
    os.makedirs(OUT, exist_ok=True)
    sq = extract_squiggle()
    print(f'extracted squiggle: {sq.size}')

    targets = [
        ('brand-squiggle-01.png',      card_squiggle_01(sq)),
        ('brand-squiggle-etapa.png',   card_squiggle_etapa(sq)),
        ('brand-squiggle-tagline.png', card_squiggle_tagline(sq)),
        ('brand-headline-poster.png',  card_headline_poster(sq)),
        ('brand-cta-card.png',         card_cta(sq)),
    ]
    for name, im in targets:
        path = os.path.join(OUT, name)
        im.convert('RGB').save(path, format='PNG', optimize=True)
        print(f'wrote {name}  {im.size}')

    # icon-72 passthrough
    icon = card_icon_72()
    icon_path = os.path.join(OUT, 'brand-icon-72.png')
    icon.save(icon_path, format='PNG', optimize=True)
    print(f'wrote brand-icon-72.png  {icon.size}')


if __name__ == '__main__':
    main()
