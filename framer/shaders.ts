// Inlined copies of src/shaders/*.glsl, resolved the same way
// vite-plugin-glsl-include.ts resolves them for the main build.
//
// Framer's bundler has no build-time hook to run that plugin, so the
// `#include` directives are resolved once, at module load, by the tiny
// resolver below instead of by Vite.
//
// If the shaders in src/shaders/ change, copy the updated file contents
// into the matching entry here.

const MODULES: Record<string, string> = {
  "common.glsl": `
// Hash, noise and fbm helpers shared by every shader module.
// Hashes are the integer-free variants from Dave Hoskins' "Hash without Sine".

#ifndef COMMON_GLSL
#define COMMON_GLSL

#define PI 3.14159265359
#define TAU 6.28318530718

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash12(vec2 p) {
  vec3 p3 = fract(p.xyx * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(p.xyx * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

vec3 hash32(vec2 p) {
  vec3 p3 = fract(p.xyx * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

// Per-cell randomness. \`salt\` lets one cell drive several independent values
// (digit, occupancy, grating angle, pitch) without correlating them.
//
// The large offset matters: cell coordinates are small signed integers, and the
// multiply-fract hashes mix them poorly near the origin, which shows up as
// diagonal streaks in the lit-cell scatter.
float cellHash(vec2 cell, float layer, float salt) {
  return hash13(vec3(cell + 311.7, layer * 19.0 + salt * 7.3) + 0.5);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < octaves; i++) {
    sum += amp * valueNoise(p);
    norm += amp;
    p *= 2.02;
    amp *= 0.5;
  }
  return sum / max(norm, 1e-5);
}

// A raw ShaderMaterial gets none of three.js' built-in output transforms, so
// this shader owns the linear -> sRGB encode. Everything above it, including
// uniform colours (three converts hex strings to linear), is linear light.
// Phase 3 inserts tone mapping just before this step.
vec3 linearToSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(
    c * 12.92,
    1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055,
    step(vec3(0.0031308), c)
  );
}

vec3 srgbToLinear(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

float srgbToLinear(float c) {
  return srgbToLinear(vec3(c)).x;
}

// Coverage of an SDF, anti-aliased with the screen-space gradient. \`soft\` adds
// extra blur, which deeper parallax layers use as a cheap depth-of-field.
float sdfCoverage(float d, float soft) {
  float w = fwidth(d) * 0.75 + soft;
  return 1.0 - smoothstep(-w, w, d);
}

#endif
`,

  "segments.glsl": `
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
// the middle. \`thick\` is the segment half-thickness, so the glyph's outer extent
// is halfW + thick by halfH + thick.
//
// Bars run all the way to the centre lines they meet, so neighbouring segments
// OVERLAP at the joins and the union reads as one continuous ribbon. Stopping
// them tangent to each other instead leaves a visible notch once the ends are
// rounded. \`gap\` pulls them back from the join to open a mitre gap; the
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
// \`rounding\` is a fraction of the segment half-thickness, so corner shape holds
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
`,

  "spectrum.glsl": `
// Wavelength to colour.

#ifndef SPECTRUM_GLSL
#define SPECTRUM_GLSL

#include "common.glsl"

vec3 bump3y(vec3 x, vec3 yoffset) {
  vec3 y = 1.0 - x * x;
  return clamp(y - yoffset, 0.0, 1.0);
}

// Alan Zucconi's sixth-order fit to the visible spectrum, from "Improving the
// Rainbow". Cheaper and smoother than a CIE table lookup, and it has no texture
// fetch, which matters inside the per-order loop.
//
// The fit was tuned against sRGB output, so it returns display-referred colour.
vec3 spectralZucconi6(float wavelength) {
  float x = clamp((wavelength - 400.0) / 300.0, 0.0, 1.0);
  const vec3 c1 = vec3(3.54585104, 2.93225262, 2.41593945);
  const vec3 x1 = vec3(0.69549072, 0.49228336, 0.27699880);
  const vec3 y1 = vec3(0.02312639, 0.15225084, 0.52607955);
  const vec3 c2 = vec3(3.90307140, 3.21182957, 3.96587128);
  const vec3 x2 = vec3(0.11748627, 0.86755042, 0.66077860);
  const vec3 y2 = vec3(0.84897130, 0.88445281, 0.73949448);
  return bump3y(c1 * (x - x1), y1) + bump3y(c2 * (x - x2), y2);
}

// Linear-light spectrum, which is what the diffraction sum needs: orders add as
// radiance, so they must be summed before the output transform, not after.
vec3 spectralLinear(float wavelength) {
  return srgbToLinear(spectralZucconi6(wavelength));
}

// Inigo Quilez's cosine palette. Only used by the debug comparison view, to show
// what a stylised palette looks like next to the real grating term.
vec3 cosinePalette(float t) {
  return 0.5 + 0.5 * cos(TAU * (vec3(1.0, 1.0, 1.0) * t + vec3(0.0, 0.33, 0.67)));
}

#endif
`,

  "diffraction.glsl": `
// Diffraction grating colour, after Jos Stam's shader in GPU Gems 1 chapter 8,
// simplified.
//
// Why a grating and not thin film: holographic foil and opal get their
// play-of-colour from diffraction off a periodic structure, which puts several
// orders on screen at once and gives the hue a hard dependence on the angle
// between the grating and the half-vector. Thin film or a cosine palette gives a
// soap-bubble sweep instead, smooth and monotonic, which reads as plastic.

#ifndef DIFFRACTION_GLSL
#define DIFFRACTION_GLSL

#include "common.glsl"
#include "spectrum.glsl"

// Diffraction orders summed per light. A compile-time define so the loop
// unrolls; the quality tier sets it.
#ifndef ORDERS
  #define ORDERS 3
#endif

struct Grating {
  vec2  tangent;  // grating direction in tangent space, unit length
  float pitch;    // line spacing in nm
  float blaze;    // design wavelength of this cell's facet, nm
};

// Per-cell grating orientation and pitch. The low-frequency noise is added on
// the continuous surface coordinate rather than per cell, which is what puts a
// colour gradient inside a single digit instead of flat-shading each one.
Grating gratingAt(
  vec2 uv, vec2 cell, float layer,
  float angleBase, float angleSpread, float angleNoise, float angleNoiseScale,
  float pitchMin, float pitchMax, float pitchBias,
  float blazeCentre, float blazeJitter
) {
  // Grating direction. \`angleSpread\` of 1 is the fully random per-cell tangent;
  // lower values cluster the cells around a shared direction.
  //
  // This one control decides the character of the whole material. The
  // wavelength a cell returns is proportional to the half-vector's component
  // ALONG its grating, so with fully random directions every cell samples a
  // different point of the spectrum and the field covers the entire visible
  // range at any tilt, red included. Clustering the directions makes the cells
  // sweep together, pitch alone sets how far they spread, and the field keeps a
  // single hue character that tilt then moves as a body. The reference is
  // clearly the second case: neighbouring digits differ, but within a band.
  float phi = angleBase + (cellHash(cell, layer, 23.0) - 0.5) * PI * angleSpread;
  phi += angleNoise * (fbm(uv * angleNoiseScale, 2) - 0.5);

  Grating g;
  g.tangent = vec2(cos(phi), sin(phi));
  // Biased rather than uniform: most cells cluster near the short end, which is
  // the green-blue the reference is dominated by, while a thin tail reaches the
  // long pitches that put order one into the red. That tail is what scatters a
  // few warm and magenta cells through an otherwise cool field.
  float h = pow(cellHash(cell, layer, 31.0), pitchBias);
  g.pitch = mix(pitchMin, pitchMax, h);

  // Blaze wavelength varies between cells, heavily biased so that the great
  // majority sit at the design wavelength and a thin tail is ruled much longer.
  // Foil is made in domains and they are not identical. This tail is what puts
  // the reference's scattered magenta and pink digits in an otherwise cool
  // field: a long-blazed cell passes red in one order while a shorter one beside
  // it passes blue, and neither is reachable from a single blaze.
  g.blaze = blazeCentre + blazeJitter * pow(cellHash(cell, layer, 53.0), 4.0);
  return g;
}

// Refract a tangent-space direction that points away from the surface into the
// air, giving the corresponding direction inside the medium. The surface normal
// is (0,0,1) here, so Snell's law acts on the tangential part alone.
//
// The digits sit under the glass, so this is the geometry the grating actually
// sees. Phase 2 reuses it to walk the parallax layers.
vec3 intoMedium(vec3 d, float ior) {
  vec2 t = d.xy / ior;
  return vec3(t, sqrt(max(1.0 - dot(t, t), 0.0)));
}

// L and V are unit vectors in tangent space pointing towards the light and the
// camera, in AIR. Returns linear radiance.
// Blaze efficiency. A real grating is ruled with a facet angle that throws most
// of its energy at one design wavelength, and falls away on either side; it is
// why holographic foils have a colour signature rather than an even rainbow.
//
// Without it the model spreads energy evenly over lambda, and since the red end
// of the visible band is nearly four times wider than the teal the field comes
// out orange no matter how the geometry is set. The reference's palette lives in
// a roughly 80 nm window around 500 nm, which is one blaze.
float blazeEfficiency(float lambda, float centre, float width) {
  float t = (lambda - centre) / max(width, 1e-3);
  return exp(-t * t);
}

vec3 diffractionColor(
  vec3 L, vec3 V, Grating g, float sigma, vec3 orderWeights, float ior,
  float blazeWidth, float blazeFloor
) {
  vec3 H = intoMedium(L, ior) + intoMedium(V, ior);

  // Path difference along the grating direction. The grating equation puts the
  // m-th order at wavelength u / m.
  float u = abs(dot(g.tangent, H.xy)) * g.pitch;

  // Across the grating lines the structure is smooth, so energy falls off with
  // the perpendicular component of the half-vector. sigma is grating roughness.
  vec2 across = vec2(-g.tangent.y, g.tangent.x);
  float perp = dot(across, H.xy);
  float spread = exp(-(perp * perp) / max(sigma * sigma, 1e-4));

  vec3 c = vec3(0.0);
  for (int m = 1; m <= ORDERS; m++) {
    float lambda = u / float(m);
    // Fade rather than clip at the ends of the visible range, or cells pop in
    // and out as the tilt moves lambda across the boundary.
    float inRange =
      smoothstep(360.0, 400.0, lambda) * (1.0 - smoothstep(720.0, 780.0, lambda));
    if (inRange <= 0.0) continue;
    float blaze = mix(blazeFloor, 1.0, blazeEfficiency(lambda, g.blaze, blazeWidth));
    c += spectralLinear(lambda) * inRange * blaze * orderWeights[m - 1];
  }
  return c * spread;
}

#endif
`,

  "obsidian.glsl": `
// The black glass the digits are embedded in: Fresnel reflection off a slightly
// wavy surface, against a studio environment computed in the shader rather than
// loaded as an HDR.

#ifndef OBSIDIAN_GLSL
#define OBSIDIAN_GLSL

#include "common.glsl"

// Schlick's approximation. F0 of 0.04 is the usual figure for glass at normal
// incidence, which is what makes the slab read as glossy rather than metallic:
// almost everything reflects at grazing angles and almost nothing head-on.
float schlickFresnel(float cosTheta, float f0) {
  float m = clamp(1.0 - cosTheta, 0.0, 1.0);
  float m2 = m * m;
  return f0 + (1.0 - f0) * m2 * m2 * m;
}

// A soft-edged rectangle in angular space around direction \`centre\`. This is
// what gives a reflection the shape of a real softbox, with straight edges that
// slide across the surface, instead of the round blob a point light leaves.
float softbox(vec3 dir, vec3 centre, vec2 halfAngles, float softness) {
  float facing = dot(dir, centre);
  if (facing <= 0.0) return 0.0;

  vec3 up = abs(centre.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 t = normalize(cross(up, centre));
  vec3 b = cross(centre, t);

  vec2 angles = vec2(atan(dot(dir, t), facing), atan(dot(dir, b), facing));
  vec2 d = abs(angles) - halfAngles;
  return 1.0 - smoothstep(-softness, softness, max(d.x, d.y));
}

/**
 * Reflected radiance from a dark studio: a soft vertical gradient for the room,
 * plus one rectangular highlight per virtual softbox.
 *
 * The softboxes are the same ones that light the diffraction gratings, so a
 * highlight sliding across the surface and a band of colour sweeping through the
 * digits are the same room light seen two different ways.
 */
vec3 studioEnvironment(
  vec3 dir, vec3 l0, vec3 l1, vec3 l2,
  float ambient, float boxIntensity, float boxSoftness, vec2 boxSize
) {
  // Dark room, a little brighter above the horizon.
  vec3 col = mix(vec3(0.35, 0.38, 0.42), vec3(1.0, 1.02, 1.1), smoothstep(-0.4, 0.9, dir.y))
    * ambient;

  col += vec3(1.00, 1.00, 1.00) * softbox(dir, l0, boxSize, boxSoftness) * boxIntensity;
  col += vec3(0.86, 0.92, 1.00) * softbox(dir, l1, boxSize * 0.8, boxSoftness) * boxIntensity * 0.6;
  col += vec3(1.00, 0.95, 0.88) * softbox(dir, l2, boxSize * 1.2, boxSoftness) * boxIntensity * 0.4;
  return col;
}

/**
 * Tangent-space normal for the surface, perturbed by low-amplitude fbm.
 *
 * Obsidian fractures conchoidally, so a real piece is never optically flat: its
 * surface carries broad shallow waves. Only the reflection uses this. Letting it
 * perturb the refraction too would ripple the digit grid, and the reference's
 * lattice is clean.
 */
vec3 wavySurfaceNormal(vec2 uv, float amount, float scale) {
  if (amount <= 0.0) return vec3(0.0, 0.0, 1.0);
  float e = 0.35 / max(scale, 1e-3);
  float h = fbm(uv * scale, 3);
  float dx = fbm((uv + vec2(e, 0.0)) * scale, 3) - h;
  float dy = fbm((uv + vec2(0.0, e)) * scale, 3) - h;
  return normalize(vec3(-dx * amount / e, -dy * amount / e, 1.0));
}

#endif
`,
};

const MAIN_FRAG_SRC = `
precision highp float;

#include "common.glsl"
#include "segments.glsl"
#include "spectrum.glsl"
#include "diffraction.glsl"
#include "obsidian.glsl"

// View modes, kept in sync with VIEW_MODES in params.ts.
#define VIEW_FINAL          0
#define VIEW_SEGMENT_MASK   1
#define VIEW_LAYER_ID       2
#define VIEW_GRATING_ANGLE  3
#define VIEW_DIFFRACTION    4
#define VIEW_FRESNEL        5
#define VIEW_COSINE_PALETTE 6

// Virtual softboxes. A compile-time define, like the orders and the layers, so
// the loop unrolls and the quality tier can trade them away.
//
// The room always HAS three. LIGHTS bounds how many the diffraction sum can
// afford; the reflection still sees all of them, because a tier is a budget for
// computation rather than a different studio.
#define MAX_LIGHTS 3
#ifndef LIGHTS
  #define LIGHTS 3
#endif

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
uniform vec3  uLightDirs[MAX_LIGHTS];
uniform float uLightIntensities[MAX_LIGHTS];
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

// Grid coordinate of a surface point, and the cell it falls in.
vec2 gridCoord(vec2 uv) {
  return gridWarp(uv) * vec2(uGridScale, uGridScale / uCellAspect);
}

vec2 cellAt(vec2 uv) {
  return floor(gridCoord(uv));
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
  vec2 g = gridCoord(uv);
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
  // Columns are the tangent basis, so \`v * tbn\` projects a world vector into
  // tangent space, and \`tbn * v\` lifts a tangent vector back into world space.
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
    // The grating field itself, read at the front layer's cell whether or not a
    // digit covers it. Taking the angle from whichever layer happened to win
    // made the view flicker while digits animated, which hid the very thing it
    // is for: the angle does not depend on the digit.
    Grating g = gratingAt(
      vSurfUV, cellAt(vSurfUV), 0.0, uAngleBase, uAngleSpread, uAngleNoise,
      uAngleNoiseScale, uPitchMin, uPitchMax, uPitchBias, uBlazeCentre, uBlazeJitter
    );
    DigitHit front = sampleDigits(vSurfUV, 0.0, 0.0, layerDensity(0));
    float a = fract(atan(g.tangent.y, g.tangent.x) / PI);
    finalColour = srgbToLinear(cosinePalette(a)) * mix(0.3, 1.0, front.body);
  } else if (uViewMode == VIEW_DIFFRACTION) {
    float angle;
    finalColour = digitSpectrum(vSurfUV, cellAt(vSurfUV), 0.0, tbn, angle) * uExposure;
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
`;

const INCLUDE = /^[ \t]*#include[ \t]+["<]([^">]+)[">].*$/gm;

function resolveIncludes(source: string, stack: string[] = []): string {
  return source.replace(INCLUDE, (_line, rel: string) => {
    const body = MODULES[rel];
    if (body === undefined) {
      throw new Error(`Unknown shader include: ${rel}`);
    }
    if (stack.includes(rel)) {
      throw new Error(`Circular shader include: ${[...stack, rel].join(" -> ")}`);
    }
    return resolveIncludes(body, [...stack, rel]);
  });
}

export const mainVertexShader = `
precision highp float;

out vec2 vSurfUV;
out vec3 vPosW;
out vec3 vTangentW;
out vec3 vBitangentW;
out vec3 vNormalW;

void main() {
  vec3 n = normalize(normal);

  // Deterministic per-face tangent basis derived from the normal rather than
  // from mesh UVs. Cell size then stays identical on the face and on the bevel
  // edges, and the same code works on an arbitrary mesh in phase 5.
  vec3 ref = abs(n.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
  vec3 t = normalize(cross(ref, n));
  vec3 b = cross(n, t);

  // Object-space projection onto the tangent plane: the grid is anchored to the
  // slab, so tilting slides the lattice under the lights instead of with them.
  vSurfUV = vec2(dot(position, t), dot(position, b));

  vec4 posW = modelMatrix * vec4(position, 1.0);
  vPosW = posW.xyz;
  vNormalW = normalize(mat3(modelMatrix) * n);
  vTangentW = normalize(mat3(modelMatrix) * t);
  vBitangentW = normalize(mat3(modelMatrix) * b);

  gl_Position = projectionMatrix * viewMatrix * posW;
}
`;

export const mainFragmentShader = resolveIncludes(MAIN_FRAG_SRC);
