from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "assets" / "scenes"
OUT.mkdir(parents=True, exist_ok=True)
W, H = 1080, 1920

NAVY = "#13213B"
INK = "#1A2944"
MUTED = "#64738C"
BLUE = "#3168F5"
VIOLET = "#7543F4"
MINT = "#20A983"
PALE = "#F7FAFF"
LINE = "#DDE6F4"
WHITE = "#FFFFFF"
ORANGE = "#E89A32"

FONT_REG = "C:/Windows/Fonts/segoeui.ttf"
FONT_SEMI = "C:/Windows/Fonts/seguisb.ttf"
FONT_BOLD = "C:/Windows/Fonts/segoeuib.ttf"


def font(size, bold=False, semibold=False):
    path = FONT_BOLD if bold else (FONT_SEMI if semibold else FONT_REG)
    if not Path(path).exists():
        path = "C:/Windows/Fonts/arial.ttf"
    return ImageFont.truetype(path, size)


def mix(a, b, t):
    a = tuple(int(a[i:i + 2], 16) for i in (1, 3, 5))
    b = tuple(int(b[i:i + 2], 16) for i in (1, 3, 5))
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def background(seed=0, warm=False):
    top = "#F9FBFF"
    bottom = "#EDF3FF" if not warm else "#F5F0FF"
    band = Image.new("RGB", (1, H))
    px = band.load()
    for y in range(H):
        px[0, y] = mix(top, bottom, y / (H - 1))
    im = band.resize((W, H))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    tint = (67, 129, 255, 34) if seed % 2 == 0 else (135, 91, 245, 26)
    gd.ellipse((W - 500, 110, W + 180, 790), fill=tint)
    gd.ellipse((-260, 1080, 390, 1770), fill=(63, 206, 181, 15))
    glow = glow.filter(ImageFilter.GaussianBlur(85))
    im = Image.alpha_composite(im.convert("RGBA"), glow)
    d = ImageDraw.Draw(im)
    for x in range(44, W, 52):
        for y in range(250, H - 170, 52):
            if ((x // 52) + (y // 52) + seed) % 4 == 0:
                d.ellipse((x, y, x + 2, y + 2), fill=(91, 125, 185, 22))
    return im.convert("RGB")


def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def shadow_card(im, box, radius=32, fill=WHITE, outline=LINE, blur=20, offset=12):
    x1, y1, x2, y2 = box
    shade = Image.new("RGBA", im.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    sd.rounded_rectangle((x1, y1 + offset, x2, y2 + offset), radius=radius,
                         fill=(36, 61, 106, 36))
    shade = shade.filter(ImageFilter.GaussianBlur(blur))
    im = Image.alpha_composite(im.convert("RGBA"), shade)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=2)
    return im


def label(draw, xy, text, fill="#EAF1FF", color=BLUE, pad_x=22, pad_y=12, size=25):
    f = font(size, semibold=True)
    x, y = xy
    b = draw.textbbox((0, 0), text, font=f)
    w, h = b[2] - b[0], b[3] - b[1]
    rounded(draw, (x, y, x + w + 2 * pad_x, y + h + 2 * pad_y),
            (h + 2 * pad_y) // 2, fill)
    draw.text((x + pad_x, y + pad_y - b[1]), text, font=f, fill=color)
    return (x + w + 2 * pad_x, y + h + 2 * pad_y)


def mic(draw, cx, cy, scale=1, color=WHITE, width=7):
    w = max(2, int(width * scale))
    draw.rounded_rectangle((cx - 13 * scale, cy - 29 * scale,
                            cx + 13 * scale, cy + 9 * scale),
                           radius=int(13 * scale), outline=color, width=w)
    draw.arc((cx - 24 * scale, cy - 3 * scale, cx + 24 * scale, cy + 31 * scale),
             0, 180, fill=color, width=w)
    draw.line((cx, cy + 30 * scale, cx, cy + 42 * scale), fill=color, width=w)
    draw.line((cx - 13 * scale, cy + 42 * scale, cx + 13 * scale, cy + 42 * scale),
              fill=color, width=w)


def gradient_mark(im, box, radius=28):
    x1, y1, x2, y2 = box
    ww, hh = x2 - x1, y2 - y1
    layer = Image.new("RGB", (ww, hh))
    p = layer.load()
    a, b = (49, 104, 245), (117, 67, 244)
    for x in range(ww):
        t = x / max(1, ww - 1)
        c = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
        for y in range(hh):
            p[x, y] = c
    mask = Image.new("L", (ww, hh), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, ww - 1, hh - 1), radius=radius, fill=255)
    im.paste(layer, (x1, y1), mask)
    return im


def brand_header(im, scene, footer=True):
    im = gradient_mark(im, (58, 56, 142, 140), 24)
    d = ImageDraw.Draw(im)
    mic(d, 100, 94, 0.73, WHITE, 4)
    d.text((164, 58), "e-Okul", font=font(39, bold=True), fill=NAVY)
    d.text((164, 102), "Spead", font=font(39, bold=True), fill=BLUE)
    d.text((330, 78), "v7.0 AI", font=font(21, semibold=True), fill=BLUE)
    rounded(d, (321, 68, 413, 108), 20, "#EAF1FF", outline="#CFDBFF", width=2)
    d.text((337, 77), "v7.0 AI", font=font(18, semibold=True), fill=BLUE)
    d.text((164, 145), "Sesli Öğretmen Not Asistanı", font=font(22), fill=MUTED)
    d.line((58, 190, 1022, 190), fill=(190, 204, 226, 150), width=2)
    # restrained scene progress marker
    if footer:
        d.rounded_rectangle((58, 1810, 1022, 1818), radius=4, fill="#DFE7F3")
        d.rounded_rectangle((58, 1810, 58 + int(964 * scene / 8), 1818), radius=4, fill=BLUE)
        d.text((58, 1841), "e-Okul Spead  •  Sesli Öğretmen Not Asistanı",
               font=font(20), fill=MUTED)
        d.text((936, 1841), f"{scene:02d} / 08", font=font(20, semibold=True), fill=MUTED)
    return im


def wave(draw, x, y, width=650, height=112, phase=0, color_a=BLUE, color_b=VIOLET):
    n = 42
    gap = 9
    bar_w = (width - (n - 1) * gap) / n
    mid = y + height / 2
    for i in range(n):
        env = 0.18 + 0.82 * (math.sin((i / (n - 1)) * math.pi) ** 0.65)
        val = abs(math.sin(i * 0.73 + phase) * 0.66 + math.sin(i * 0.29 + 1.1) * 0.34)
        bh = max(10, height * env * (0.2 + val * 0.72))
        xx = x + i * (bar_w + gap)
        col = color_a if i < n * 0.56 else color_b
        draw.rounded_rectangle((int(xx), int(mid - bh / 2), int(xx + bar_w), int(mid + bh / 2)),
                               radius=max(3, int(bar_w / 2)), fill=col)


def title_block(draw, title_lines, y=280, size=78, color=NAVY, leading=1.18):
    f = font(size, bold=True)
    line_h = int(size * leading)
    for i, line in enumerate(title_lines):
        draw.text((72, y + i * line_h), line, font=f, fill=color)
    return y + len(title_lines) * line_h


def scene1():
    im = brand_header(background(1), 1)
    d = ImageDraw.Draw(im)
    label(d, (72, 246), "ÖĞRETMENLER İÇİN SESLİ NOT GİRİŞİ")
    title_block(d, ["Notları tek tek", "girmek zaman", "alıyor mu?"], 358, 82)
    d.text((76, 667), "Aynı adımları tekrar tekrar yapmak yerine", font=font(31), fill=MUTED)
    d.text((76, 714), "konuşarak ilerleyin.", font=font(31, semibold=True), fill=INK)
    im = shadow_card(im, (72, 860, 1008, 1518), radius=38, fill="#FFFFFF")
    d = ImageDraw.Draw(im)
    d.text((116, 914), "TEK TEK GİRİŞ", font=font(22, semibold=True), fill=MUTED)
    for i in range(4):
        y = 1000 + i * 118
        rounded(d, (116, y, 964, y + 82), 20, "#F7F9FD", outline="#E7EDF7", width=2)
        d.ellipse((144, y + 25, 176, y + 57), fill="#E7EDFA")
        d.rounded_rectangle((204, y + 24, 490 if i % 2 == 0 else 546, y + 34),
                            radius=5, fill="#D9E2F0")
        d.rounded_rectangle((204, y + 45, 410, y + 54), radius=4, fill="#E7EDF7")
        rounded(d, (790, y + 17, 936, y + 64), 12, "#FFFFFF", outline="#D8E2F1", width=2)
        d.text((817, y + 22), "···", font=font(31, bold=True), fill=MUTED)
    label(d, (116, 1458), "TEKRAR EDEN ADIMLAR", fill="#F2F5FB", color=MUTED, size=19)
    return im


def scene2():
    im = brand_header(background(2, True), 2)
    d = ImageDraw.Draw(im)
    label(d, (72, 260), "SESLE NOT GİRİŞİ")
    im = shadow_card(im, (72, 434, 1008, 1326), radius=48, fill="#FFFFFF", outline="#D6DDFD", blur=26)
    im = gradient_mark(im, (390, 520, 690, 820), 58)
    d = ImageDraw.Draw(im)
    mic(d, 540, 654, 1.8, WHITE, 6)
    d.text((540, 904), "e-Okul Spead", font=font(68, bold=True), fill=NAVY, anchor="mm")
    rounded(d, (354, 976, 726, 1034), 28, "#EAF1FF")
    d.text((540, 989), "v7.0 AI  ·  Sesli Öğretmen Not Asistanı",
           font=font(21, semibold=True), fill=BLUE, anchor="mm")
    d.text((540, 1134), "Konuşun. Gözden geçirin. Aktarım akışına geçin.",
           font=font(27), fill=MUTED, anchor="mm")
    wave(d, 250, 1190, 580, 48, phase=1.4)
    d.text((540, 1480), "Öğretmenlerin not giriş akışına yardımcı olur.",
           font=font(31, semibold=True), fill=INK, anchor="mm")
    return im


def scene3():
    im = brand_header(background(3), 3)
    d = ImageDraw.Draw(im)
    label(d, (72, 246), "KURGUSAL ÖRNEK VERİ")
    title_block(d, ["Notları doğal", "Türkçenizle", "söyleyin"], 352, 75)
    # voice card
    im = shadow_card(im, (72, 818, 1008, 1540), radius=38, fill="#FFFFFF")
    d = ImageDraw.Draw(im)
    im = gradient_mark(im, (124, 882, 222, 980), 30)
    d = ImageDraw.Draw(im)
    mic(d, 173, 928, 0.92, WHITE, 4)
    d.text((254, 886), "SES GİRİŞİ", font=font(21, semibold=True), fill=MUTED)
    d.text((254, 920), "Örnek konuşma", font=font(31, bold=True), fill=NAVY)
    wave(d, 144, 1034, 790, 96, phase=0.6)
    rows = [("42 numara", BLUE), ("Soru 1: 15", VIOLET), ("Soru 2: 20", MINT)]
    for i, (txt, col) in enumerate(rows):
        y = 1190 + i * 94
        rounded(d, (145, y, 934, y + 68), 18, "#F5F8FE", outline="#E2E9F5", width=2)
        d.ellipse((170, y + 21, 195, y + 46), fill=col)
        d.text((220, y + 13), txt, font=font(30, semibold=True), fill=INK)
        d.text((868, y + 15), "✓", font=font(29, bold=True), fill=MINT)
    label(d, (145, 1494), "YALNIZCA DEMO VERİSİ", fill="#EAF8F3", color=MINT, size=18)
    return im


def scene4():
    im = brand_header(background(4, True), 4)
    d = ImageDraw.Draw(im)
    label(d, (72, 246), "CANLI ALGILAMA AKIŞI")
    title_block(d, ["Konuşma metne", "dönüşür; siz", "satırları izleyin"], 354, 70)
    im = shadow_card(im, (72, 820, 1008, 1516), radius=38, fill="#FFFFFF", outline="#D9E3F5")
    d = ImageDraw.Draw(im)
    d.text((120, 874), "NOT GİRİŞİ", font=font(21, semibold=True), fill=MUTED)
    rounded(d, (120, 928, 960, 1050), 24, "#F6F8FD", outline="#E4EBF5", width=2)
    rounded(d, (142, 951, 244, 1025), 20, "#EAF1FF")
    d.text((193, 988), "42", font=font(34, bold=True), fill=BLUE, anchor="mm")
    d.text((280, 950), "Öğrenci numarası", font=font(25, semibold=True), fill=INK)
    d.text((280, 990), "kurgusal kayıt", font=font(21), fill=MUTED)
    for i, (label_txt, value) in enumerate([("Soru 1", "15"), ("Soru 2", "20"), ("Toplam", "35")]):
        x = 120 + i * 278
        rounded(d, (x, 1100, x + 250, 1296), 22, "#FFFFFF", outline="#DFE8F5", width=2)
        d.text((x + 24, 1132), label_txt, font=font(23, semibold=True), fill=MUTED)
        d.text((x + 24, 1190), value, font=font(46, bold=True), fill=BLUE if i < 2 else MINT)
    d.line((144, 1384, 930, 1384), fill="#E4EAF4", width=2)
    wave(d, 204, 1430, 670, 44, phase=2.1)
    d.text((540, 1510), "Her kaydı kendi kontrolünüzde gözden geçirin.",
           font=font(24), fill=MUTED, anchor="mm")
    return im


def scene5():
    im = brand_header(background(5), 5)
    d = ImageDraw.Draw(im)
    label(d, (72, 246), "TOPLAM KONTROLÜ")
    title_block(d, ["Sonucu kayda", "almadan önce", "kontrol edin"], 354, 74)
    im = shadow_card(im, (72, 842, 1008, 1454), radius=40, fill="#FFFFFF")
    d = ImageDraw.Draw(im)
    d.text((122, 908), "KURGUSAL PUAN ÖRNEĞİ", font=font(21, semibold=True), fill=MUTED)
    rounded(d, (122, 980, 958, 1260), 30, "#F6F8FE", outline="#E2E8F3", width=2)
    d.text((208, 1025), "15", font=font(64, bold=True), fill=BLUE)
    d.text((365, 1021), "+", font=font(58), fill=MUTED)
    d.text((486, 1025), "20", font=font(64, bold=True), fill=VIOLET)
    d.text((664, 1021), "=", font=font(58), fill=MUTED)
    d.text((776, 1025), "35", font=font(64, bold=True), fill=MINT)
    d.line((162, 1174, 918, 1174), fill="#E1E8F4", width=2)
    d.text((540, 1210), "Soru puanları  ·  Örnek toplam", font=font(23), fill=MUTED, anchor="mm")
    label(d, (122, 1366), "GÖZDEN GEÇİR", fill="#EAF8F3", color=MINT, size=21)
    d.text((350, 1376), "Düzeltmeyi siz onaylayın.", font=font(26, semibold=True), fill=INK)
    return im


def scene6():
    im = brand_header(background(6, True), 6)
    d = ImageDraw.Draw(im)
    label(d, (72, 246), "ÜÇ BASİT ADIM")
    title_block(d, ["Yer iminden", "aktarım akışına"], 350, 77)
    # three steps
    steps = [
        ("01", "Yer imini", "ekleyin", BLUE),
        ("02", "Notları", "sesli okuyun", VIOLET),
        ("03", "Aktarım", "adımına geçin", MINT),
    ]
    for i, (num, a, b, col) in enumerate(steps):
        y = 590 + i * 170
        im = shadow_card(im, (82, y, 998, y + 132), radius=26, fill="#FFFFFF", outline="#E1E8F3", blur=14, offset=7)
        d = ImageDraw.Draw(im)
        rounded(d, (112, y + 28, 188, y + 104), 22, col)
        d.text((150, y + 66), num, font=font(27, bold=True), fill=WHITE, anchor="mm")
        d.text((224, y + 28), a, font=font(31, semibold=True), fill=INK)
        d.text((224, y + 70), b, font=font(31, semibold=True), fill=INK)
        if i < 2:
            d.line((150, y + 132, 150, y + 170), fill="#B9C8E2", width=4)
    # Clearly illustrative, not the official site
    im = shadow_card(im, (82, 1130, 998, 1608), radius=34, fill="#FFFFFF", outline="#CFE1F5")
    d = ImageDraw.Draw(im)
    label(d, (120, 1170), "TEMSİLİ AKTARIM TABLOSU", fill="#EEF3FF", color=BLUE, size=19)
    d.text((120, 1240), "Gerçek e-Okul ekranı değildir", font=font(22), fill=MUTED)
    headers = [("No", 150, 260), ("Soru 1", 285, 500), ("Soru 2", 515, 730), ("Toplam", 745, 930)]
    for title, x1, x2 in headers:
        d.text((x1, 1310), title, font=font(20, semibold=True), fill=MUTED)
    d.line((120, 1358, 958, 1358), fill="#E3E9F3", width=2)
    for i, row in enumerate([("42", "15", "20", "35"), ("43", "—", "—", "—")]):
        y = 1384 + i * 82
        for (text, x1, x2) in zip(row, [150, 285, 515, 745], [260, 500, 730, 930]):
            d.text((x1, y), text, font=font(27, semibold=True), fill=BLUE if i == 0 else MUTED)
        if i == 0:
            d.line((120, 1444, 958, 1444), fill="#EFF2F8", width=2)
    return im


def scene7():
    im = brand_header(background(7), 7)
    d = ImageDraw.Draw(im)
    label(d, (72, 246), "KONTROL SİZDE")
    title_block(d, ["Konuşun.", "Gözden geçirin.", "Sonra aktarın."], 350, 71)
    im = shadow_card(im, (72, 850, 1008, 1530), radius=40, fill="#FFFFFF", outline="#DDE5F2")
    d = ImageDraw.Draw(im)
    items = [
        ("01", "Konuşun", "Numarayı ve puanları söyleyin.", BLUE),
        ("02", "Gözden geçirin", "Satırları ve toplamları kontrol edin.", VIOLET),
        ("03", "Aktarım akışına geçin", "Hazır olduğunuzda devam edin.", MINT),
    ]
    for i, (n, title, sub, col) in enumerate(items):
        y = 920 + i * 178
        rounded(d, (122, y, 210, y + 82), 24, col)
        d.text((166, y + 41), n, font=font(26, bold=True), fill=WHITE, anchor="mm")
        d.text((250, y - 1), title, font=font(31, semibold=True), fill=INK)
        d.text((250, y + 48), sub, font=font(22), fill=MUTED)
        if i < 2:
            d.line((166, y + 82, 166, y + 146), fill="#C5D1E3", width=4)
    d.text((540, 1610), "Örnek ekranda yalnızca kurgusal puanlar kullanılır.",
           font=font(22), fill=MUTED, anchor="mm")
    return im


def scene8():
    im = brand_header(background(8, True), 8, footer=False)
    d = ImageDraw.Draw(im)
    # calm end-card with a generous brand lockup and readable CTA
    rounded(d, (178, 360, 902, 1084), 80, "#FFFFFF", outline="#DBE3F6", width=2)
    im = gradient_mark(im, (390, 470, 690, 770), 72)
    d = ImageDraw.Draw(im)
    mic(d, 540, 610, 1.85, WHITE, 6)
    d.text((540, 882), "e-Okul Spead", font=font(67, bold=True), fill=NAVY, anchor="mm")
    rounded(d, (407, 940, 673, 995), 27, "#EAF1FF")
    d.text((540, 967), "v7.0 AI", font=font(23, semibold=True), fill=BLUE, anchor="mm")
    d.text((540, 1192), "Notları konuşun.", font=font(50, bold=True), fill=NAVY, anchor="mm")
    d.text((540, 1258), "İş akışınızı sadeleştirin.", font=font(38, semibold=True), fill=BLUE, anchor="mm")
    rounded(d, (224, 1380, 856, 1472), 36, BLUE)
    d.text((540, 1426), "nsbl-eokul.vercel.app", font=font(30, semibold=True), fill=WHITE, anchor="mm")
    d.text((540, 1540), "Şimdi keşfedin", font=font(28, semibold=True), fill=VIOLET, anchor="mm")
    return im


SCENES = [scene1, scene2, scene3, scene4, scene5, scene6, scene7, scene8]

for index, render in enumerate(SCENES, start=1):
    image = render().convert("RGB")
    image.save(OUT / f"scene-{index:02d}.png", optimize=True)
    print(f"scene-{index:02d}.png  {image.width}x{image.height}")
