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

// Per-cell randomness. `salt` lets one cell drive several independent values
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

// Coverage of an SDF, anti-aliased with the screen-space gradient. `soft` adds
// extra blur, which deeper parallax layers use as a cheap depth-of-field.
float sdfCoverage(float d, float soft) {
  float w = fwidth(d) * 0.75 + soft;
  return 1.0 - smoothstep(-w, w, d);
}

#endif
