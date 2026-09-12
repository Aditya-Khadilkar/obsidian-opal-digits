# Measured properties of `reference.png`

Everything below was measured from the image, not estimated by eye. The image is
1282 x 1992 px, a macro crop with no object silhouette in frame.

## Lattice

Recovered from the first-ring peaks of the 2D autocorrelation of a 1024 px
interior block, then confirmed by overlaying the lattice on a 5 x 4 cell crop.

| Quantity | Value |
| --- | --- |
| Column pitch | 37 px |
| Row pitch | 45 px |
| Cell aspect (height : width) | **1.22** |
| Row skew | 2 px rise per 37 px, about **3.1 deg** |
| Cells across the frame | about 35 x 44 |

The strongest autocorrelation peak is at a 31 px vertical lag, which is the
segment a to segment d self-match inside one glyph, not the row pitch. Reading
it as the pitch is what makes the cell look far taller than it is.

## Glyph

Bounding boxes of bright connected components, upper quartile in both axes, over
three luminance thresholds (n = 10 to 37 per threshold; the three agree to 3%).

| Quantity | Value |
| --- | --- |
| Glyph size | 33 x 43 px |
| Glyph aspect (height : width) | 1.31 |
| Fill of its cell | 0.89 wide, 0.96 tall |
| Segment thickness | 7 to 9 px, so **0.21 to 0.27 of glyph width** |

Segments are **solid filled bars**, not hollow outlines. A luminance cut across a
glyph reads bright, then about 18 px of near-black, then bright: two solid
strokes with the glyph interior between them. A cut along a horizontal segment is
flat-topped across its whole width.

Segments **join continuously** with heavy corner rounding. There is no mitre gap
between neighbouring segments.

## Occupancy

Sampled 1200 cells on the recovered lattice.

| Peak luminance below | Share of cells |
| --- | --- |
| 30 / 255 | 0.2 % |
| 45 / 255 | 1.9 % |
| 60 / 255 | 10.3 % |
| 80 / 255 | 28.3 % |

Effectively **every cell carries a digit**. Cells differ in brightness, not in
whether they are occupied. There is no separate population of unlit "ghost 8"
glyphs: the faint cells hold ordinary varied digits.

## Depth

Normalised edge sharpness, as peak luminance gradient over peak luminance,
by per-cell brightness quartile:

| Quartile | Mean peak | Sharpness |
| --- | --- | --- |
| Q1 dimmest | 61 | 0.197 |
| Q2 | 89 | 0.186 |
| Q3 | 116 | 0.191 |
| Q4 brightest | 146 | 0.197 |

Sharpness is flat. **Dim cells are not blurrier than bright ones**, so the
brightness variation is diffraction intensity, not depth-of-field. The
autocorrelation also shows only one lattice, with no second offset copy.

## Colour

Hue distribution of stroke pixels, the brightest 20% of the image:

| Band | Share |
| --- | --- |
| green, 100-150 deg | 19.9 % |
| spring and teal, 150-175 deg | 22.7 % |
| cyan, 175-195 deg | 12.5 % |
| azure, 195-225 deg | 18.9 % |
| blue, 225-255 deg | 13.2 % |
| violet through pink, 255-345 deg | 9.1 % |
| yellow through red, 345-100 deg | 3.7 % |

Saturation is **moderate, median 0.42**, and flat across brightness. These are
not neon strokes.

Hue tracks brightness, which is the useful constraint for the diffraction model:

| Brightness quintile | Mean luminance | Green and teal | Cyan and blue | Warm |
| --- | --- | --- | --- | --- |
| dimmest | 0.17 | 32 % | 64 % | 2 % |
| 2 | 0.20 | 36 % | 59 % | 3 % |
| 3 | 0.23 | 42 % | 52 % | 4 % |
| 4 | 0.30 | 49 % | 43 % | 5 % |
| brightest | 0.44 | 50 % | 33 % | 11 % |

Dim digits are blue, bright digits are green, and warm hues appear only in the
brightest cells.
