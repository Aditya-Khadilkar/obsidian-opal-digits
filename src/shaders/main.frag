precision highp float;

#include "common.glsl"
#include "segments.glsl"
#include "spectrum.glsl"
#include "diffraction.glsl"
#include "obsidian.glsl"

// View modes, kept in sync with VIEW_MODES in src/params.ts.
#define VIEW_FINAL          0
#define VIEW_SEGMENT_MASK   1
#define VIEW_LAYER_ID       2
#define VIEW_GRATING_ANGLE  3
#define VIEW_DIFFRACTION    4
#define VIEW_FRESNEL        5
#define VIEW_COSINE_PALETTE 6

#define LIGHTS 3

// Layer count is a compile-time define so the parallax loop unrolls and there
// are no texture fetches or dynamic bounds in the hot path. The material sets it
// from the quality tier; changing it recompiles the shader.
#ifndef LAYERS
  #define LAYERS 4
#endif

uniform float uTime;
uniform vec2  uTilt;
uniform int   uViewMode;

uniform float uGridScale;
uniform float uCellAspect;
uniform float uGlyphFillX;
uniform float uGlyphFillY;
uniform float uDensity;
uniform float uDeepDensity;
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

// Parallax layers, see PRD 5.3.
uniform float uLayerSpacing;
uniform float uLayerOffsetCells;
uniform float uDepthSoftness;
uniform float uAbsorptionSigma;
uniform vec3  uAbsorptionTint;
uniform float uDeepDim;

// Obsidian surface, see PRD 5.5.
uniform float uF0;
uniform float uEnvAmbient;
uniform float uEnvBoxIntensity;
uniform float uEnvBoxSoftness;
uniform vec2  uEnvBoxSize;
uniform float uEnvStrength;
uniform float uSurfaceWaviness;
uniform float uWavinessScale;

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

DigitHit sampleDigits(vec2 uv, float layer, float soft, float density) {
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

  hit.lit = cellHash(hit.cell, layer, 7.0) < density ? 1.0 : 0.0;
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

// Depth of layer k below the surface, in the same object-space units as the
// surface coordinate. Spacing widens with depth, as in the PRD's example
// progression, so the near layers stay legible while the far ones separate.
float layerDepth(int k) {
  float t = float(k) / float(max(LAYERS - 1, 1));
  return uLayerSpacing * t * (1.0 + t);
}

// Each layer's lattice is shifted, or every layer would put its digits in the
// same cells and the stack would read as one thick layer rather than several.
vec2 layerOffset(int k) {
  if (k == 0) return vec2(0.0);
  vec2 h = hash22(vec2(float(k) * 7.13, 3.77)) - 0.5;
  return h * uLayerOffsetCells / uGridScale;
}

// Only the front layer is fully occupied. The reference shows one dense lattice,
// so the deeper layers are sparse: they supply parallax and the sense of a solid
// volume without turning the surface into a thicket.
float layerDensity(int k) {
  return k == 0 ? uDensity : uDeepDensity;
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

/** One layer's contribution: its colour, and how much of the view it covers. */
struct LayerSample {
  vec3  colour;
  float alpha;
  float angle;   // grating angle, for the debug view
  float body;    // stroke coverage before the depth dimming
};

LayerSample sampleLayer(int k, vec2 uv, vec3 viewMedium, mat3 tbn) {
  LayerSample out_;

  // Walk the refracted view ray down to this layer's depth. The ray travels
  // against the direction pointing back out to the eye.
  float h = layerDepth(k);
  float t = h / max(viewMedium.z, 1e-3);
  vec2 p = uv - viewMedium.xy * t + layerOffset(k);

  // Edge softness grows with depth, which is depth of field for free. The
  // reference shows no such blur, so the default is slight; see
  // reference/MEASUREMENTS.md.
  float soft = uDepthSoftness * h;

  DigitHit hit = sampleDigits(p, float(k), soft, layerDensity(k));
  out_.body = hit.body;
  out_.angle = 0.0;
  out_.alpha = 0.0;
  out_.colour = vec3(0.0);
  if (hit.body <= 0.0) return out_;

  vec3 spectrum = digitSpectrum(p, hit.cell, float(k), tbn, out_.angle);

  // Beer-Lambert along the path in and back out again. The tint is per-channel,
  // which is what gives the glass its smoky cast rather than a neutral grey.
  float pathLength = 2.0 * t;
  vec3 transmission = exp(-uAbsorptionSigma * uAbsorptionTint * pathLength);

  vec3 stroke = spectrum * uExposure * transmission;
  float y = dot(stroke, vec3(0.2126, 0.7152, 0.0722));
  stroke = mix(vec3(y), stroke, uSaturation);
  stroke *= (1.0 + uRimIntensity * hit.rim) / (1.0 + uRimIntensity);
  if (k > 0) stroke *= uDeepDim;

  out_.colour = stroke;
  out_.alpha = hit.body;
  return out_;
}

void main() {
  // Columns are the tangent basis, so `v * tbn` projects a world vector into
  // tangent space, and `tbn * v` lifts a tangent vector back into world space.
  mat3 tbn = mat3(normalize(vTangentW), normalize(vBitangentW), normalize(vNormalW));
  vec3 Vw = normalize(cameraPosition - vPosW);
  vec3 Vt = normalize(Vw * tbn);
  vec3 viewMedium = intoMedium(Vt, uIor);

  // Surface: a slightly wavy normal, its Fresnel term, and what it reflects.
  vec3 nTangent = wavySurfaceNormal(vSurfUV, uSurfaceWaviness, uWavinessScale);
  vec3 nWorld = normalize(tbn * nTangent);
  float fresnel = schlickFresnel(max(dot(nTangent, Vt), 0.0), uF0);
  vec3 reflection = studioEnvironment(
    reflect(-Vw, nWorld), uLightDirs[0], uLightDirs[1], uLightDirs[2],
    uEnvAmbient, uEnvBoxIntensity, uEnvBoxSoftness, uEnvBoxSize
  ) * uEnvStrength;

  // Front to back, so a near digit occludes the ones behind it and the loop can
  // stop contributing once the view is opaque.
  vec3 col = vec3(0.0);
  float acc = 0.0;
  float frontBody = 0.0;
  float frontGhost = 0.0;
  float frontAngle = 0.0;
  float topLayer = -1.0;

  for (int k = 0; k < LAYERS; k++) {
    LayerSample s = sampleLayer(k, vSurfUV, viewMedium, tbn);
    if (k == 0) {
      frontBody = s.body;
      frontAngle = s.angle;
    }
    if (s.alpha <= 0.0) continue;
    if (topLayer < 0.0) {
      topLayer = float(k);
      if (k > 0) frontAngle = s.angle;
    }
    col += (1.0 - acc) * s.alpha * s.colour;
    acc += (1.0 - acc) * s.alpha;
  }

  // Ghost glyphs, when enabled, belong to the front layer only.
  if (uGhostIntensity > 0.0) {
    DigitHit front = sampleDigits(vSurfUV, 0.0, 0.0, layerDensity(0));
    frontGhost = front.ghost;
  }

  vec3 medium = uMediumColor;
  if (frontGhost > 0.0) medium = mix(medium, uGhostColor, frontGhost * uGhostIntensity);
  vec3 interior = medium * (1.0 - acc) + col;

  // What the eye gets: the reflected room, plus whatever survives transmission
  // through the surface.
  vec3 finalColour = fresnel * reflection + (1.0 - fresnel) * interior;

  if (uViewMode == VIEW_SEGMENT_MASK) {
    DigitHit front = sampleDigits(vSurfUV, 0.0, 0.0, layerDensity(0));
    finalColour = vec3(0.0);
    finalColour = max(finalColour, vec3(0.05) * front.ghost);
    finalColour = max(finalColour, vec3(0.55) * front.body);
    finalColour = max(finalColour, vec3(1.0) * front.rim);
  } else if (uViewMode == VIEW_LAYER_ID) {
    // Which layer the eye actually lands on, at every pixel.
    finalColour = topLayer < 0.0
      ? vec3(0.02)
      : srgbToLinear(cosinePalette(topLayer / float(LAYERS)));
  } else if (uViewMode == VIEW_GRATING_ANGLE) {
    float a = fract(frontAngle / PI);
    finalColour = srgbToLinear(cosinePalette(a)) * max(acc, 0.15);
  } else if (uViewMode == VIEW_DIFFRACTION) {
    float angle;
    finalColour = digitSpectrum(vSurfUV, floor(vSurfUV * uGridScale), 0.0, tbn, angle)
      * uExposure;
  } else if (uViewMode == VIEW_FRESNEL) {
    // Surface only, with the interior removed, so highlights can be watched
    // sliding across the slab independently of the digits.
    finalColour = fresnel * reflection;
  } else if (uViewMode == VIEW_COSINE_PALETTE) {
    // The stylised comparison the PRD asks for: same geometry and the same
    // per-cell parameter, but a smooth palette instead of a grating.
    DigitHit front = sampleDigits(vSurfUV, 0.0, 0.0, layerDensity(0));
    float t = fract(frontAngle / PI + 0.35 * cellHash(front.cell, 0.0, 31.0));
    vec3 stroke = srgbToLinear(cosinePalette(t)) * uExposure * 0.35;
    finalColour = mix(uMediumColor, stroke, front.body);
  }

  // Keeps the tilt uniform live until a later phase consumes it.
  finalColour += 0.0 * vec3(uTilt, 0.0) + 0.0 * frontBody;

  // Linear HDR out. Tone mapping and the sRGB encode happen at the end of the
  // post chain, after bloom has had a chance to see the real highlight values.
  fragColor = vec4(finalColour, 1.0);
}
