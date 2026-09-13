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

// A soft-edged rectangle in angular space around direction `centre`. This is
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
