precision highp float;

#include "common.glsl"
#include "segments.glsl"

// View modes, kept in sync with VIEW_MODES in src/params.ts.
#define VIEW_FINAL          0
#define VIEW_SEGMENT_MASK   1
#define VIEW_LAYER_ID       2
#define VIEW_GRATING_ANGLE  3
#define VIEW_DIFFRACTION    4
#define VIEW_FRESNEL        5
#define VIEW_COSINE_PALETTE 6

uniform float uTime;
uniform vec2  uTilt;
uniform int   uViewMode;

uniform float uGridScale;
uniform float uCellAspect;
uniform float uGlyphFillX;
uniform float uGlyphFillY;
uniform float uDensity;
uniform float uGhostIntensity;
uniform vec3  uGhostColor;
uniform float uSegThickness;
uniform float uSegGap;
uniform float uSegRounding;
uniform float uRimWidth;
uniform float uRimIntensity;
uniform float uCellLevelMin;
uniform float uCellLevelMax;
uniform float uCellLevelBias;
uniform float uSkew;
uniform float uWarpAmount;
uniform float uWarpScale;
uniform float uDigitSpeed;
uniform vec3  uMediumColor;

in vec2 vSurfUV;
in vec3 vPosW;
in vec3 vTangentW;
in vec3 vBitangentW;
in vec3 vNormalW;

out vec4 fragColor;

struct DigitHit {
  float body;   // coverage of the solid lit segments
  float rim;    // coverage of the brighter band just inside the segment edge
  float ghost;  // coverage of the unlit "ghost 8", off by default
  float level;  // per-cell brightness, a stand-in for phase 1 diffraction
  float lit;    // 1.0 if this cell carries a lit digit
  vec2  cell;
  int   mask;
};

// Skew plus a low-frequency warp. The reference lattice leans about 3 degrees.
vec2 gridWarp(vec2 p) {
  p.x += p.y * uSkew;
  if (uWarpAmount > 0.0) {
    p += uWarpAmount * (vec2(
      valueNoise(p * uWarpScale),
      valueNoise(p * uWarpScale + 19.73)
    ) - 0.5);
  }
  return p;
}

// The digit a cell shows. With uDigitSpeed at 0 this is a fixed per-cell value.
int cellDigit(vec2 cell, float layer) {
  float h = cellHash(cell, layer, 3.0);
  float n = floor(h * 10.0);
  if (uDigitSpeed > 0.0) {
    n = mod(n + floor(uTime * uDigitSpeed * (0.35 + h)), 10.0);
  }
  return int(n);
}

DigitHit sampleDigits(vec2 uv, float layer, float soft) {
  DigitHit hit;

  // Cells are taller than wide. Dividing y by the aspect makes one grid unit one
  // cell on both axes; the glyph is then evaluated in an undistorted space.
  vec2 g = gridWarp(uv) * vec2(uGridScale, uGridScale / uCellAspect);
  hit.cell = floor(g);
  vec2 local = fract(g) - 0.5;
  vec2 q = vec2(local.x, local.y * uCellAspect);

  // Cell is 1 wide by uCellAspect tall in q space. uGlyphFill* is the glyph's
  // OUTER size as a fraction of the cell, matching how the reference was
  // measured, while halfW/halfH are segment centre lines. The half-thickness
  // therefore has to come off both, or neighbouring rows overlap and fuse.
  float thick = 0.5 * uSegThickness * uGlyphFillX;
  float halfW = max(0.5 * uGlyphFillX - thick, 1e-3);
  float halfH = max(0.5 * uCellAspect * uGlyphFillY - thick, 1e-3);

  hit.lit = cellHash(hit.cell, layer, 7.0) < uDensity ? 1.0 : 0.0;
  hit.mask = digitMask(cellDigit(hit.cell, layer));

  float dLit, dAll;
  digitSdfPair(
    q, hit.mask, halfW, halfH, thick, uSegGap * thick, uSegRounding, dLit, dAll
  );

  // Segments are solid bars. The rim is a brighter band inside the edge, which
  // is what gives the reference strokes their piped look.
  hit.body = hit.lit * sdfCoverage(dLit, soft);
  hit.rim = hit.lit * max(
    sdfCoverage(dLit, soft) - sdfCoverage(dLit + uRimWidth * thick, soft),
    0.0
  );
  hit.ghost = uGhostIntensity > 0.0 ? sdfCoverage(dAll, soft) : 0.0;

  // Placeholder for the diffraction intensity that phase 1 computes. Stated in
  // display terms because that is how the reference was measured, and biased
  // because the reference is strongly skewed dim: stroke luminance runs p50
  // 0.14, p90 0.31, p99 0.52, not a flat spread.
  float j = pow(cellHash(hit.cell, layer, 13.0), uCellLevelBias);
  hit.level = srgbToLinear(mix(uCellLevelMin, uCellLevelMax, j));

  return hit;
}

void main() {
  vec3 V = normalize(cameraPosition - vPosW);

  // Phase 0: one layer, sampled straight on the surface.
  DigitHit hit = sampleDigits(vSurfUV, 0.0, 0.0);

  vec3 col;
  if (uViewMode == VIEW_SEGMENT_MASK) {
    // Occupancy and glyph shape only, with no brightness variation.
    col = vec3(0.0);
    col = max(col, vec3(0.05) * hit.ghost);  // ~0.25 after the sRGB encode
    col = max(col, vec3(0.55) * hit.body);
    col = max(col, vec3(1.0) * hit.rim);
  } else if (uViewMode == VIEW_LAYER_ID) {
    // Phase 2 gives this real depth; for now every hit is layer 0.
    float id = 0.0;
    col = mix(vec3(0.05), hash32(vec2(id, 1.0)), max(hit.ghost, hit.body));
  } else {
    col = uMediumColor;
    col = mix(col, uGhostColor, hit.ghost * uGhostIntensity);
    // Normalised so the brightest pixel of a stroke is exactly hit.level, which
    // keeps the cell-level parameters comparable with the measured reference.
    vec3 stroke = vec3(hit.level)
      * (1.0 + uRimIntensity * hit.rim) / (1.0 + uRimIntensity);
    col = mix(col, stroke, hit.body);
  }

  // Keeps the varyings and view vector live until the later phases consume them.
  col += 0.0 * (V + vTangentW + vBitangentW + vNormalW + vec3(uTilt, 0.0));

  fragColor = vec4(linearToSRGB(col), 1.0);
}
