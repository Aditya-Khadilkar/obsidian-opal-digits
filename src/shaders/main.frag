precision highp float;

#include "common.glsl"
#include "segments.glsl"
#include "spectrum.glsl"
#include "diffraction.glsl"

// View modes, kept in sync with VIEW_MODES in src/params.ts.
#define VIEW_FINAL          0
#define VIEW_SEGMENT_MASK   1
#define VIEW_LAYER_ID       2
#define VIEW_GRATING_ANGLE  3
#define VIEW_DIFFRACTION    4
#define VIEW_FRESNEL        5
#define VIEW_COSINE_PALETTE 6

#define LIGHTS 3

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
uniform float uSkew;
uniform float uWarpAmount;
uniform float uWarpScale;
uniform float uDigitSpeed;
uniform vec3  uMediumColor;

// Lights are given in WORLD space and the tangent basis is built from the model
// matrix, so turning the slab moves it relative to the lights on its own. That
// is what a real holographic card does, and it removes the need to counter-
// rotate the light directions on the CPU.
uniform vec3  uLightDirs[LIGHTS];
uniform float uLightIntensities[LIGHTS];
uniform float uLightIntensity;
uniform float uFillIntensity;

uniform float uPitchMin;
uniform float uPitchMax;
uniform float uPitchBias;
uniform float uGratingSigma;
uniform float uIor;
uniform float uBlazeCentre;
uniform float uBlazeWidth;
uniform float uBlazeJitter;
uniform float uBlazeFloor;
uniform vec3  uOrderWeights;
uniform float uAngleBase;
uniform float uAngleSpread;
uniform float uAngleNoise;
uniform float uAngleNoiseScale;
uniform float uBodyIntensity;
uniform float uBodyNoiseScale;
uniform float uBodyLambdaMin;
uniform float uBodyLambdaMax;
uniform float uSaturation;
uniform float uExposure;

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

  return hit;
}

// Sum of every virtual light's grating response, plus the opal body term that
// keeps a digit from going fully black when no order lands in the visible range.
vec3 digitSpectrum(vec2 uv, vec2 cell, float layer, mat3 tbn, out float angle) {
  Grating g = gratingAt(
    uv, cell, layer, uAngleBase, uAngleSpread, uAngleNoise, uAngleNoiseScale,
    uPitchMin, uPitchMax, uPitchBias, uBlazeCentre, uBlazeJitter
  );
  angle = atan(g.tangent.y, g.tangent.x);

  vec3 Vw = normalize(cameraPosition - vPosW);
  vec3 Vt = normalize(Vw * tbn);

  vec3 sum = vec3(0.0);
  for (int i = 0; i < LIGHTS; i++) {
    vec3 Lt = normalize(uLightDirs[i] * tbn);
    // Soft rather than hard cull, so a light crossing the horizon at the tilt
    // limits fades out instead of popping.
    float facing = smoothstep(0.0, 0.25, Lt.z);
    if (facing <= 0.0) continue;
    sum += uLightIntensities[i] * facing
         * diffractionColor(
           Lt, Vt, g, uGratingSigma, uOrderWeights, uIor,
           uBlazeWidth, uBlazeFloor);
  }
  sum *= uLightIntensity;

  // Broad ambient fill: a weak, angle-independent response so cells are never
  // entirely unlit. Its wavelength range is narrower than the visible band; a
  // full 420-680 rainbow here swamps the grating's own hue statistics with warm
  // cells wherever the diffraction term happens to be weak.
  sum += uFillIntensity * spectralLinear(
    mix(uBodyLambdaMin, uBodyLambdaMax, cellHash(cell, layer, 41.0))
  );

  // Opal body colour, varying slowly across the surface rather than per cell.
  float t = valueNoise(uv * uBodyNoiseScale + cell * 0.37);
  sum += uBodyIntensity * spectralLinear(mix(uBodyLambdaMin, uBodyLambdaMax, t));

  return sum;
}

void main() {
  // Columns are the tangent basis, so `v * tbn` projects a world vector into
  // tangent space.
  mat3 tbn = mat3(normalize(vTangentW), normalize(vBitangentW), normalize(vNormalW));

  // Phase 0: one layer, sampled straight on the surface.
  DigitHit hit = sampleDigits(vSurfUV, 0.0, 0.0);

  float gratingAngle;
  vec3 spectrum = digitSpectrum(vSurfUV, hit.cell, 0.0, tbn, gratingAngle);

  vec3 col;
  if (uViewMode == VIEW_SEGMENT_MASK) {
    col = vec3(0.0);
    col = max(col, vec3(0.05) * hit.ghost);  // ~0.25 after the sRGB encode
    col = max(col, vec3(0.55) * hit.body);
    col = max(col, vec3(1.0) * hit.rim);
  } else if (uViewMode == VIEW_LAYER_ID) {
    float id = 0.0;
    col = mix(vec3(0.05), hash32(vec2(id, 1.0)), max(hit.ghost, hit.body));
  } else if (uViewMode == VIEW_GRATING_ANGLE) {
    // Angle wraps at PI, so map it onto a full hue circle for legibility.
    float a = fract(gratingAngle / PI);
    col = srgbToLinear(cosinePalette(a)) * max(hit.body, 0.15);
  } else if (uViewMode == VIEW_DIFFRACTION) {
    col = spectrum * uExposure;
  } else if (uViewMode == VIEW_COSINE_PALETTE) {
    // The stylised comparison the PRD asks for: same geometry and the same
    // per-cell parameter, but a smooth palette instead of a grating.
    float t = fract(gratingAngle / PI + 0.35 * cellHash(hit.cell, 0.0, 31.0));
    vec3 stroke = srgbToLinear(cosinePalette(t)) * uExposure * 0.35;
    col = mix(uMediumColor, stroke, hit.body);
  } else {
    vec3 stroke = spectrum * uExposure;
    // The reference sits at a median saturation of 0.42, so the raw spectral
    // colours need pulling back towards their own luminance.
    float y = dot(stroke, vec3(0.2126, 0.7152, 0.0722));
    stroke = mix(vec3(y), stroke, uSaturation);
    // Normalised so the brightest pixel of a stroke is the stroke colour itself.
    stroke *= (1.0 + uRimIntensity * hit.rim) / (1.0 + uRimIntensity);

    col = uMediumColor;
    col = mix(col, uGhostColor, hit.ghost * uGhostIntensity);
    col = mix(col, stroke, hit.body);
  }

  // Keeps the tilt uniform live until the input module consumes it.
  col += 0.0 * vec3(uTilt, 0.0);

  fragColor = vec4(linearToSRGB(col), 1.0);
}
