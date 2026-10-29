#!/usr/bin/env python3
"""生成 README hero 卡片底图（960x360，渐变 + 标题 + 宠物右侧留白）。

依赖 Pillow。输出 docs/assets/hero-card.png，供 ffmpeg 叠加透明宠物动画。
"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "assets" / "hero-card.png"
FONT_PATH = ROOT / "assets" / "fonts" / "上首软糖体.ttf"
W, H = 960, 360

def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_PATH), size)

# 纵向渐变
img = Image.new("RGB", (W, H), "#070b16")
px = img.load()
top = (7, 11, 22)
bottom = (23, 37, 64)
for y in range(H):
    t = y / (H - 1)
    r = int(top[0] + (bottom[0] - top[0]) * t)
    g = int(top[1] + (bottom[1] - top[1]) * t)
    b = int(top[2] + (bottom[2] - top[2]) * t)
    for x in range(W):
        px[x, y] = (r, g, b)

# 右侧柔光
glow = Image.new("RGB", (W, H), "#070b16")
gd = ImageDraw.Draw(glow)
gd.ellipse((520, -80, 1120, 460), fill=(56, 89, 160))
glow = glow.filter(ImageFilter.GaussianBlur(90))
img = Image.blend(img, glow, 0.45)

d = ImageDraw.Draw(img)
# 小标签
tag_font = font(15)
tag = "DSH PLUGIN  ·  OPEN SOURCE"
tw = d.textlength(tag, font=tag_font)
d.rounded_rectangle((48, 42, 48 + tw + 28, 74), radius=16, fill=(59, 130, 246, 40), outline=(96, 165, 250))
d.text((62, 48), tag, font=tag_font, fill=(191, 219, 254))

# 标题
d.text((46, 94), "dsh-pet-plus", font=font(56), fill=(248, 250, 252))
# 中文副标题
d.text((48, 170), "会记住你的桌宠", font=font(30), fill=(199, 210, 254))
# 特性行
d.text((48, 218), "四层记忆  ·  微信 / QQ  ·  内容副驾  ·  三候选输入", font=font(18), fill=(148, 163, 184))
# 底部
d.text((48, 312), "MIT  ·  github.com/ZhengYitong2333/dsh-pet-plus", font=font(14), fill=(100, 116, 139))

# 左下装饰线
d.line((48, 292, 300, 292), fill=(59, 130, 246), width=2)

OUT.parent.mkdir(parents=True, exist_ok=True)
img.save(OUT, "PNG")
print(OUT)
