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
uniform float uGlyphFill;
uniform float uDensity;
uniform float uGhostIntensity;
uniform vec3  uGhostColor;
uniform float uStrokeWidth;
uniform float uSegThickness;
uniform float uSegGap;
uniform float uSegRounding;
uniform float uInnerFill;
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
  float stroke;  // coverage of the lit outline
  float fill;    // coverage of the lit glyph interior
  float ghost;   // coverage of the unlit "ghost 8" outline
  float lit;     // 1.0 if this cell carries a lit digit
  vec2  cell;
  int   mask;
};

// Skew plus a low-frequency warp, so the lattice reads as hand-made glass
// rather than a perfect screen.
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

  // Cells are taller than wide. Dividing y by the aspect makes one grid unit
  // one cell on both axes; the glyph is then evaluated in an undistorted space.
  vec2 g = gridWarp(uv) * vec2(uGridScale, uGridScale / uCellAspect);
  hit.cell = floor(g);
  vec2 local = fract(g) - 0.5;
  vec2 q = vec2(local.x, local.y * uCellAspect);

  float halfW = 0.5 * uGlyphFill;
  float halfH = 0.5 * uCellAspect * uGlyphFill;

  hit.lit = cellHash(hit.cell, layer, 7.0) < uDensity ? 1.0 : 0.0;
  hit.mask = digitMask(cellDigit(hit.cell, layer));

  float dLit, dAll;
  digitSdfPair(
    q, hit.mask, halfW, halfH, uSegThickness, uSegGap, uSegRounding, dLit, dAll
  );

  // Lit segments read as outlined strokes, not flat fills.
  hit.stroke = hit.lit * sdfCoverage(abs(dLit) - uStrokeWidth, soft);
  hit.fill   = hit.lit * sdfCoverage(dLit + uStrokeWidth, soft);
  // Every cell shows its ghost 8, whether or not it carries a lit digit.
  hit.ghost  = sdfCoverage(abs(dAll) - uStrokeWidth, soft);

  return hit;
}

void main() {
  vec3 V = normalize(cameraPosition - vPosW);

  // Phase 0: one layer, sampled straight on the surface.
  DigitHit hit = sampleDigits(vSurfUV, 0.0, 0.0);

  vec3 col;
  if (uViewMode == VIEW_SEGMENT_MASK) {
    // Ghost segments in dim grey, lit strokes white, lit interiors mid grey.
    col = vec3(0.0);
    col = max(col, vec3(0.05) * hit.ghost);  // ~0.25 after the sRGB encode
    col = max(col, vec3(0.22) * hit.fill);   // ~0.51
    col = max(col, vec3(1.0) * hit.stroke);
  } else if (uViewMode == VIEW_LAYER_ID) {
    // Phase 2 gives this real depth; for now every hit is layer 0.
    float id = 0.0;
    col = mix(vec3(0.05), hash32(vec2(id, 1.0)), max(hit.ghost, hit.stroke));
  } else {
    col = uMediumColor;
    col = mix(col, uGhostColor, hit.ghost * uGhostIntensity);
    col += vec3(1.0) * hit.fill * uInnerFill;
    col = mix(col, vec3(1.0), hit.stroke);
  }

  // Keeps the varyings and view vector live until the later phases consume them.
  col += 0.0 * (V + vTangentW + vBitangentW + vNormalW + vec3(uTilt, 0.0));

  fragColor = vec4(linearToSRGB(col), 1.0);
}
