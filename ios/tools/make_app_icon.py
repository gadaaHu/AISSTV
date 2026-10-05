#!/usr/bin/env python3
"""Generate the 1024x1024 iOS app icon.

The asset catalog needs a real image: an `AppIcon` set with no file makes
`actool` warn (and fails App Store validation). This draws a simple flat icon
using Pillow so the icon can be regenerated or restyled without a design tool.

    python tools/make_app_icon.py

Writes AISSTV/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png
(mode RGB, no alpha - the App Store rejects transparency in app icons).
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:  # pragma: no cover
    print("Pillow is required: pip install Pillow", file=sys.stderr)
    raise SystemExit(2)

SIZE = 1024
# Matches the AccentColor asset (sRGB 0.145 / 0.427 / 0.902).
ACCENT = (37, 109, 230)
WHITE = (255, 255, 255)


def draw_icon() -> Image.Image:
    image = Image.new("RGB", (SIZE, SIZE), ACCENT)
    draw = ImageDraw.Draw(image)

    # Camera body.
    draw.rounded_rectangle([224, 336, 672, 688], radius=56, fill=WHITE)

    # Lens barrel, angled away to the right.
    draw.polygon([(672, 470), (808, 392), (808, 632), (672, 554)], fill=WHITE)

    # Concentric lens: accent ring around a white core.
    centre_x, centre_y = 432, 512
    draw.ellipse(
        [centre_x - 92, centre_y - 92, centre_x + 92, centre_y + 92],
        fill=ACCENT,
    )
    draw.ellipse(
        [centre_x - 46, centre_y - 46, centre_x + 46, centre_y + 46],
        fill=WHITE,
    )

    return image


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    target_dir = root / "AISSTV" / "Resources" / "Assets.xcassets" / "AppIcon.appiconset"
    if not target_dir.is_dir():
        print(f"error: {target_dir} does not exist", file=sys.stderr)
        return 1

    target = target_dir / "AppIcon-1024.png"
    image = draw_icon()
    image.save(target, format="PNG", optimize=True)

    with Image.open(target) as check:
        print(f"wrote {target.relative_to(root)} ({check.size[0]}x{check.size[1]}, {check.mode})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
