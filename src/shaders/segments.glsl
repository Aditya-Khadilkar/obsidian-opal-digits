// Procedural seven-segment digits. No font texture, so the glyphs stay crisp at
// any zoom and there are no atlas bleed artifacts.
//
// Segment bit order, a = bit 0 .. g = bit 6:
//
//        aaaa
//       f    b
//       f    b
//        gggg
//       e    c
//       e    c
//        dddd
//
// Proportions follow reference/MEASUREMENTS.md: segments are solid bars about
// 0.21 of the glyph width, joined continuously with heavy corner rounding.

#ifndef SEGMENTS_GLSL
#define SEGMENTS_GLSL

#include "common.glsl"

const int SEG_MASK_ALL = 0x7F;

// 0..9, from the PRD.
int digitMask(int d) {
  int masks[10] = int[10](0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F);
  return masks[clamp(d, 0, 9)];
}

float sdRoundBox(vec2 p, vec2 b, float r) {
  r = min(r, min(b.x, b.y));
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

// Glyph space: segment centre lines run from x in [-halfW, halfW] and y in
// [-halfH, halfH], with segment a on the top line, d on the bottom and g through
// the middle. `thick` is the segment half-thickness, so the glyph's outer extent
// is halfW + thick by halfH + thick.
//
// Bars run all the way to the centre lines they meet, so neighbouring segments
// OVERLAP at the joins and the union reads as one continuous ribbon. Stopping
// them tangent to each other instead leaves a visible notch once the ends are
// rounded. `gap` pulls them back from the join to open a mitre gap; the
// reference has none.
void segmentGeom(
  int i, float halfW, float halfH, float thick, float gap,
  out vec2 centre, out vec2 halfExtent
) {
  float vLen = max(halfH * 0.5 - gap, 1e-4); // vertical segment
  float hLen = max(halfW - gap, 1e-4);       // horizontal segment
  if (i == 0)      { centre = vec2(0.0,  halfH);          halfExtent = vec2(hLen, thick); }
  else if (i == 1) { centre = vec2( halfW,  halfH * 0.5); halfExtent = vec2(thick, vLen); }
  else if (i == 2) { centre = vec2( halfW, -halfH * 0.5); halfExtent = vec2(thick, vLen); }
  else if (i == 3) { centre = vec2(0.0, -halfH);          halfExtent = vec2(hLen, thick); }
  else if (i == 4) { centre = vec2(-halfW, -halfH * 0.5); halfExtent = vec2(thick, vLen); }
  else if (i == 5) { centre = vec2(-halfW,  halfH * 0.5); halfExtent = vec2(thick, vLen); }
  else             { centre = vec2(0.0, 0.0);             halfExtent = vec2(hLen, thick); }
}

// One evaluation pass gives both unions we need: the lit glyph and the full "8".
// `rounding` is a fraction of the segment half-thickness, so corner shape holds
// when thickness changes.
void digitSdfPair(
  vec2 q, int mask, float halfW, float halfH, float thick, float gap, float rounding,
  out float dLit, out float dAll
) {
  dLit = 1e5;
  dAll = 1e5;
  float r = rounding * thick;
  for (int i = 0; i < 7; i++) {
    vec2 centre, halfExtent;
    segmentGeom(i, halfW, halfH, thick, gap, centre, halfExtent);
    float d = sdRoundBox(q - centre, halfExtent, r);
    dAll = min(dAll, d);
    if ((mask & (1 << i)) != 0) dLit = min(dLit, d);
  }
}

#endif
