"""Fine-drawing rendering shared by the sprite generators (creatures,
objects, accessories, bubbles).

Drawing happens in the coordinates of a logical grid (the sprite's display
size), with the same pixel semantics as ImageDraw (inclusive bounds, pixel
centers), but every shape is traced at high resolution; `finish` adds a
soft outline and shrinks the image to `out` pixels per grid unit, which
smooths the edges.
"""

from PIL import Image, ImageChops, ImageDraw, ImageFilter

SUPERSAMPLE = 4  # high-resolution pixels per output pixel
OUTLINE = 0.625  # outline thickness, in grid units


def _flat(coords):
    """Accepts [(x, y), ...] or (x0, y0, x1, y1, ...) and returns a list of (x, y)."""
    coords = list(coords)
    if coords and isinstance(coords[0], (tuple, list)):
        return [(float(x), float(y)) for x, y in coords]
    return [(float(coords[i]), float(coords[i + 1])) for i in range(0, len(coords), 2)]


class Canvas:
    """High-resolution `w` x `h` grid-unit canvas, rendered at `out` px per unit."""

    def __init__(self, w, h=None, out=2):
        self.w, self.h, self.out = w, h or w, out
        self.k = out * SUPERSAMPLE
        self.img = Image.new("RGBA", (self.w * self.k, self.h * self.k), (0, 0, 0, 0))
        self._d = ImageDraw.Draw(self.img)

    # grid-aligned shapes (ImageDraw semantics: inclusive bounds)
    def _box(self, box):
        k = self.k
        x0, y0, x1, y1 = box
        return (x0 * k, y0 * k, (x1 + 1) * k - 1, (y1 + 1) * k - 1)

    def _pts(self, coords):
        k = self.k
        return [((x + 0.5) * k, (y + 0.5) * k) for x, y in _flat(coords)]

    def ellipse(self, box, fill=None, outline=None, width=1):
        self._d.ellipse(self._box(box), fill=fill, outline=outline, width=max(1, round(width * self.k)))

    def rectangle(self, box, fill):
        self._d.rectangle(self._box(box), fill=fill)

    def rounded(self, box, radius, fill):
        self._d.rounded_rectangle(self._box(box), radius=radius * self.k, fill=fill)

    def polygon(self, coords, fill):
        self._d.polygon(self._pts(coords), fill=fill)

    def poly(self, pts, fill):
        """Polygon in continuous grid coordinates."""
        k = self.k
        self._d.polygon([(x * k, y * k) for x, y in pts], fill=fill)

    def line(self, coords, fill, width=1):
        pts = self._pts(coords)
        self._d.line(pts, fill=fill, width=max(1, round(width * self.k)), joint="curve")
        for x, y in (pts[0], pts[-1]):  # rounded ends
            r = width * self.k / 2
            self._d.ellipse((x - r, y - r, x + r, y + r), fill=fill)

    def point(self, xy, fill):
        k = self.k
        x, y = xy
        self._d.ellipse((x * k, y * k, (x + 1) * k - 1, (y + 1) * k - 1), fill=fill)

    # continuous shapes (fractional grid coordinates), for fine details
    def oval(self, x0, y0, x1, y1, fill):
        k = self.k
        self._d.ellipse((x0 * k, y0 * k, x1 * k, y1 * k), fill=fill)

    def stroke(self, pts, width, fill):
        k = self.k
        pts = [(x * k, y * k) for x, y in pts]
        self._d.line(pts, fill=fill, width=max(1, round(width * k)), joint="curve")
        r = width * k / 2
        for x, y in (pts[0], pts[-1]):
            self._d.ellipse((x - r, y - r, x + r, y + r), fill=fill)

    # gradient shading
    def _mask(self, shape, geom):
        mask = Image.new("L", self.img.size, 0)
        d = ImageDraw.Draw(mask)
        if shape == "ellipse":
            d.ellipse(self._box(geom), fill=255)
        elif shape == "polygon":
            d.polygon(self._pts(geom), fill=255)
        elif shape == "poly":
            d.polygon([(x * self.k, y * self.k) for x, y in geom], fill=255)
        else:  # rounded: (box, radius)
            box, radius = geom
            d.rounded_rectangle(self._box(box), radius=radius * self.k, fill=255)
        return mask

    def shaded(self, shape, geom, base, dark, light):
        """Gradient-shaded shape: shadow at the bottom, soft highlight at the top left.
        shape: "ellipse" (box), "polygon" (grid points), "poly" (continuous
        points), or "rounded" ((box, radius))."""
        if shape in ("polygon", "poly"):
            pts = _flat(geom)
            x0, y0 = min(p[0] for p in pts), min(p[1] for p in pts)
            x1, y1 = max(p[0] for p in pts), max(p[1] for p in pts)
            if shape == "poly":  # continuous bounds -> inclusive-bounds box
                x1, y1 = x1 - 1, y1 - 1
        else:
            x0, y0, x1, y1 = geom if shape == "ellipse" else geom[0]
        w, h = x1 - x0, y1 - y0
        k = self.k
        mask = self._mask(shape, geom)
        layer = Image.new("RGBA", self.img.size, dark)

        def tone(ellipse, color, blur, strength=255):
            m = Image.new("L", self.img.size, 0)
            ImageDraw.Draw(m).ellipse(ellipse, fill=strength)
            m = m.filter(ImageFilter.GaussianBlur(blur))
            layer.paste(Image.new("RGBA", self.img.size, color), (0, 0), m)

        tone(self._box((x0, y0, x1 - max(1, w // 8), y1 - max(1, h // 5))), base, k * 0.9)
        tone(self._box((x0 + w * 0.2, y0 + h * 0.12, x0 + w * 0.48, y0 + h * 0.36)), light, k * 1.1, 230)
        layer.putalpha(mask)
        self.img.alpha_composite(layer)

    def blob(self, box, base, dark, light):
        """Gradient-shaded ellipse."""
        self.shaded("ellipse", box, base, dark, light)

    def composite(self, other, clip=None):
        """Pastes another same-size canvas, clipped by a shape (shape, geom) if `clip`."""
        layer = other.img
        if clip:
            layer = layer.copy()
            layer.putalpha(ImageChops.multiply(layer.getchannel("A"), self._mask(*clip)))
        self.img.alpha_composite(layer)

    def rotate(self, angle, center):
        k = self.k
        self.img = self.img.rotate(angle, resample=Image.BICUBIC, center=((center[0] + 0.5) * k, (center[1] + 0.5) * k))
        self._d = ImageDraw.Draw(self.img)

    def finish(self, outline_color=None):
        """Soft outline around the silhouette (unless `outline_color` is None), then downscale."""
        out = self.img
        if outline_color is not None:
            radius = round(OUTLINE * self.k)
            mask = self.img.getchannel("A").point(lambda a: 255 if a > 64 else 0)
            ring = ImageChops.subtract(mask.filter(ImageFilter.MaxFilter(2 * radius + 1)), mask)
            out = Image.new("RGBA", self.img.size, outline_color[:3] + (0,))
            out.putalpha(ring)
            out.alpha_composite(self.img)
        return out.resize((self.w * self.out, self.h * self.out), Image.BOX)
