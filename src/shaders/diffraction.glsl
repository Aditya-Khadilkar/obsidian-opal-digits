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
  // Grating direction. `angleSpread` of 1 is the fully random per-cell tangent;
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
