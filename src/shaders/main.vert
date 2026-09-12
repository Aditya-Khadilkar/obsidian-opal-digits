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
