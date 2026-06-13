# -*- coding: utf-8 -*-
"""Иконки приложения в клубном стиле (зелёное сукно + золотой глобус). PIL."""
import os, math
from PIL import Image, ImageDraw

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "assets", "icons")
os.makedirs(OUT, exist_ok=True)

S = 1024
GOLD = (201, 162, 39)
GOLD_LT = (232, 205, 128)
CREAM = (243, 234, 214)


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def make():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # фон: вертикальный градиент тёмно-зелёного
    top = (37, 66, 58)      # #25423a
    bot = (10, 28, 22)      # #0a1c16
    for y in range(S):
        t = y / S
        r = int(top[0] + (bot[0] - top[0]) * t)
        g = int(top[1] + (bot[1] - top[1]) * t)
        b = int(top[2] + (bot[2] - top[2]) * t)
        d.line([(0, y), (S, y)], fill=(r, g, b, 255))
    # золотая рамка-кант
    d.rounded_rectangle([28, 28, S - 28, S - 28], radius=180,
                        outline=GOLD, width=10)
    d.rounded_rectangle([46, 46, S - 46, S - 46], radius=160,
                        outline=(201, 162, 39, 90), width=3)

    # глобус
    cx, cy, R = S // 2, S // 2 + 6, 300
    # окружность
    d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=GOLD_LT, width=16)
    # параллели
    for dy in (-170, -90, 0, 90, 170):
        w = math.sqrt(max(0, R * R - dy * dy))
        d.line([(cx - w, cy + dy), (cx + w, cy + dy)], fill=(232, 205, 128, 220), width=9)
    # меридианы (эллипсы)
    for rx in (R, 165):
        d.ellipse([cx - rx, cy - R, cx + rx, cy + R], outline=(232, 205, 128, 220), width=9)
    # центральный меридиан
    d.line([(cx, cy - R), (cx, cy + R)], fill=(232, 205, 128, 220), width=9)
    # отметка-точка (как «локация»)
    px, py = cx + 95, cy - 120
    d.ellipse([px - 26, py - 26, px + 26, py + 26], fill=(255, 95, 162, 255))
    d.ellipse([px - 26, py - 26, px + 26, py + 26], outline=CREAM, width=6)

    # скруглить углы (маской)
    mask = rounded_mask(S, 200)
    img.putalpha(mask)
    return img


def main():
    icon = make()
    # квадратные (с прозрачными углами) — для manifest / Android / Mac
    for sz in (1024, 512, 192, 180, 167, 152, 120):
        icon.resize((sz, sz), Image.LANCZOS).save(os.path.join(OUT, "icon-%d.png" % sz))
    # apple-touch-icon: Apple сам скругляет, фон должен быть непрозрачным
    flat = Image.new("RGB", (S, S), (20, 40, 34))
    flat.paste(icon, (0, 0), icon)
    flat.resize((180, 180), Image.LANCZOS).save(os.path.join(OUT, "apple-touch-icon.png"))
    # maskable (с запасом полей) 512
    pad = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    inner = icon.resize((int(S * 0.78), int(S * 0.78)), Image.LANCZOS)
    pad.paste(inner, ((S - inner.width) // 2, (S - inner.height) // 2), inner)
    pad.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "icon-maskable-512.png"))
    print("icons ->", OUT, sorted(os.listdir(OUT)))


if __name__ == "__main__":
    main()
