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

// Iñigo Quílez's cosine palette. Only used by the debug comparison view, to show
// what a stylised palette looks like next to the real grating term.
vec3 cosinePalette(float t) {
  return 0.5 + 0.5 * cos(TAU * (vec3(1.0, 1.0, 1.0) * t + vec3(0.0, 0.33, 0.67)));
}

#endif
