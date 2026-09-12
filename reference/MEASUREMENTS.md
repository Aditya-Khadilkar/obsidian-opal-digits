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

## What the colour measurements imply for the model

Mapping the reference's hue bands back through the spectrum fit puts its palette
in a band roughly 460 to 545 nm wide, centred near 500 nm, with a tail into the
blue. That is narrow, and it is the single hardest thing to reproduce.

The obstacle is that the spectrum is not evenly distributed in hue. Under the
Zucconi fit, uniform sampling of wavelength gives:

| Hue band | Wavelengths | Share of 380-780 nm |
| --- | --- | --- |
| red and orange | 584-700 nm | 36 % |
| teal | 490-518 nm | 9 % |
| cyan | 476-488 nm | 4 % |
| azure | 462-474 nm | 4 % |

Teal is the reference's largest band at 24.9%, and it occupies a 28 nm window,
while red occupies 116 nm. A diffraction model that spreads energy evenly across
wavelength therefore comes out orange no matter how the light and grating
geometry are arranged. Sweeping pitch, light elevation, grating roughness and
per-cell angle spread never brought red below about 15% of stroke pixels.

The fix is the blaze: a real grating is ruled with a facet angle that throws
most of its energy at one design wavelength. Adding that envelope, centred at
456 nm with a 60 nm width, drops red and yellow to essentially zero and brings
the whole distribution within about 35 of the reference across the tilt range.

Two consequences worth recording:

- **A long lens matters.** With a wide field of view the view vector swings
  across the slab, which swings the half-vector and sends the edges into the
  red. The reference is a macro crop with a near-constant view angle, and 14
  degrees reproduces that. Tilt, not field of view, supplies the parallax.
- **Magenta and pink are not reachable in one layer.** Non-spectral purples need
  red and blue in the same pixel, and one cell under one light emits one
  wavelength per order. Orders one and two can never both be visible at once,
  since that needs the path difference to be under 750 nm and over 760 nm
  simultaneously. Per-cell blaze variation produces scattered warm cells but
  still no magenta. It should arrive with phase 2, when a red front-layer digit
  composites over a blue deeper one.
