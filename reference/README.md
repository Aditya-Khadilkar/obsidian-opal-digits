# Reference imagery

The photograph the material is modelled on is **not committed**. It is 4 MB, and
everything the implementation needs from it is written down in
`MEASUREMENTS.md`: lattice pitch, glyph proportions, segment thickness, cell
occupancy, depth cues and the colour distribution, along with the method used to
measure each one.

To re-run the analysis or regenerate the side-by-side comparisons, drop the image
in here as `reference.png`. The PRD calls it `IMG_9471.jpeg`; it is the same
image. Nothing in the app reads it, only the tooling.

Several of those measurements contradict the PRD's prose description of the same
photograph. Where they disagree, the measurement wins, and the PRD itself says to
treat the image as the thing to encode.
