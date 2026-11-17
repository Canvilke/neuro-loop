# -*- coding: utf-8 -*-
"""生成信件用的极淡背景：近白纸感 + 稀疏星点 + 右下角一点冷光。

输出 1240x1754（A4 @150dpi），透明度很低，印刷时几乎只看到一点层次。
"""
import math
import random

from PIL import Image, ImageDraw, ImageFilter

W, H = 1240, 1754
BASE_TOP = (253, 254, 255)
BASE_BOT = (243, 247, 252)


def gradient():
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        c = tuple(int(BASE_TOP[i] + (BASE_BOT[i] - BASE_TOP[i]) * t) for i in range(3))
        d.line([(0, y), (W, y)], fill=c)
    return img


def stars(img, n=720, seed=11):
    rnd = random.Random(seed)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for _ in range(n):
        x, y = rnd.randrange(W), rnd.randrange(H)
        r = rnd.choice([0.8, 0.8, 1.0, 1.2, 1.6])
        a = rnd.randint(5, 13)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(96, 138, 186, a))
    return Image.alpha_composite(img.convert("RGBA"), layer)


def glow(img):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy, rad = int(W * 0.84), int(H * 0.88), int(W * 0.66)
    for i in range(rad, 0, -6):
        a = int(9 * (1 - i / rad) ** 1.6)
        d.ellipse([cx - i, cy - i * 0.72, cx + i, cy + i * 0.72], fill=(118, 176, 224, a))
    layer = layer.filter(ImageFilter.GaussianBlur(46))
    return Image.alpha_composite(img, layer)


def ring(img):
    """左上角一段极淡的星环弧，呼应 Neuro-Loop。"""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = int(W * -0.04), int(H * 0.10)
    rx, ry = int(W * 0.46), int(W * 0.60)
    for w, a in ((2, 16), (1, 10)):
        d.arc([cx - rx, cy - ry, cx + rx, cy + ry], start=-72, end=44, fill=(120, 162, 205, a), width=w)
    layer = layer.filter(ImageFilter.GaussianBlur(1.2))
    return Image.alpha_composite(img, layer)


def main():
    img = gradient()
    img = stars(img)
    img = glow(img)
    out = img.convert("RGB")
    path = r"C:\Users\86152\Desktop\致远\neuro-loop\docs\assets\letter-bg.png"
    out.save(path, quality=92)
    print("bg:", path, out.size)


if __name__ == "__main__":
    main()
