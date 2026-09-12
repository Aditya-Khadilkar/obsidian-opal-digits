# PRD: Obsidian Opal Digits — WebGL Shader Material

## 1. Summary

A real-time web shader material: black volcanic glass (obsidian) with seven-segment digits embedded at several depths. The digits behave like holographic foil / opal. Their color comes from **diffraction**, so it shifts with viewing angle and shows several colors at once, with gradients inside a single digit. The user tilts the material (mouse, touch, or phone gyroscope) and watches the colors move and the layers shift in parallax.

Reference image: `reference/IMG_9471.jpeg` (add it to the repo). Look at it before starting each phase.

## 2. What the reference actually shows (encode these)

- A tight grid of **seven-segment (LCD-style) digits** with almost no gutter. Cells are taller than wide (about 1 : 1.6).
- **Unlit segments are faintly visible** as dark teal "ghost 8s". This is essential to the look.
- Lit segments look like **outlined strokes**, not flat fills.
- Color is **spectral**: mostly green/teal, with scattered magenta, blue, yellow, and pink. Neighboring digits differ, so each patch behaves like its own grating orientation.
- Digits sit at **different depths**. Deeper ones are dimmer and softer, and the grid is slightly skewed.
- The medium is a **black, glossy, slightly smoky** glass with faint surface reflections.

## 3. Key technical decisions (do not deviate without flagging)

1. **Color model = diffraction grating, not thin-film.** Holographic foil and opal get their play-of-color from diffraction. A thin-film or cosine-palette approach looks like a soap bubble. Implement a stylized cosine-palette mode only as a debug comparison.
2. **Layers are faked in the fragment shader** (tangent-space parallax planes with refraction). They are not separate geometry and use no transparency sorting.
3. **Digits are procedural SDFs.** There is no font texture, so resolution is unlimited and there are no atlas artifacts.
4. **Single-pass fragment shader** on a Three.js `ShaderMaterial`, with optional bloom as post-processing.

## 4. Stack

- Vite + TypeScript + Three.js (WebGL2, `glslVersion: THREE.GLSL3`)
- Tweakpane for parameters
- Three.js `EffectComposer` with a subtle `UnrealBloomPass`, plus ACES or AgX tone mapping
- No React and no WebGPU for v1

### Structure
```
src/
  main.ts                      scene, camera, GUI
  input/TiltSource.ts          gyro + pointer -> one smoothed tilt vector
  material/ObsidianDigitsMaterial.ts
  shaders/
    common.glsl                hash, noise, fbm
    segments.glsl              seven-segment SDF + digit bitmasks
    spectrum.glsl              wavelength -> RGB
    diffraction.glsl           grating term
    obsidian.glsl              fresnel, env, absorption, surface normal
    main.vert / main.frag
reference/IMG_9471.jpeg
```

## 5. Technical spec

### 5.1 Scene
- Default object: a slab (rounded box or a plane with bevelled edge fill), filling about 80% of the viewport and slightly tilted.
- A single normalised `tilt` vector in the range −1..1 on both axes drives everything. Pointer position feeds it on desktop and device orientation feeds it on mobile. See §5.10.
- `tilt` maps to ±15° of slab rotation **and** an equal and opposite rotation of the virtual lights. See §5.10.4.
- Optional "flashlight" mode: the pointer controls light direction only, leaving the slab still.

### 5.2 Digit grid (segments.glsl)
- Cell UV: `cell = floor(p * gridScale)`, `local = fract(...)`. Use `hash(cell, layerIndex)` for per-cell randomness.
- Digit bitmask (a=bit0 … g=bit6): `0:0x3F 1:0x06 2:0x5B 3:0x4F 4:0x66 5:0x6D 6:0x7D 7:0x07 8:0x7F 9:0x6F`
- Build each segment from an SDF box or hexagon. Evaluate all 7 segments.
  - Lit: outline stroke (`abs(sdf) - strokeWidth`) plus an optional faint inner fill
  - Unlit: same shape at `ghostIntensity` (default 0.06)
- Anti-alias with `fwidth`. Edge softness grows with layer depth, which gives cheap depth blur.
- Per-cell occupancy: only a fraction of cells (`density`, default 0.35 per layer) contain a lit digit. Every cell in the front layer still shows ghost segments.
- Optional: apply a slight global skew and low-frequency warp to the grid.

### 5.3 Parallax layers with refraction
In tangent space, with view vector `V` pointing from the surface to the camera and surface normal `(0,0,1)`:
```glsl
vec3 r = refract(-V, vec3(0,0,1), 1.0/ior);   // ior default 1.49
for k in 0..LAYERS-1:
    float h = layerDepth[k];                   // e.g. 0.00, 0.04, 0.09, 0.15, 0.22, 0.30
    vec2 pk = uv + r.xy * (h / -r.z) + layerOffset[k];
    // sample digits at pk, composite front-to-back with occlusion
```
- `LAYERS` defaults to 6, with a range of 1–8 set by a compile-time define per quality tier.
- Composite front to back: `col += (1-acc) * a * c; acc += (1-acc) * a;`
- Absorption (Beer–Lambert): `exp(-sigma * pathLen)`, with a slightly per-channel `sigma` for a smoky tint.

### 5.4 Diffraction (diffraction.glsl)
Based on Jos Stam's diffraction shader (GPU Gems 1, ch. 8), simplified.
- Each lit patch has a grating tangent `t = (cos φ, sin φ, 0)`, where `φ = hash(cell) * PI` plus low-frequency noise across the digit. The noise is what creates gradients inside one digit.
- Grating pitch `d` in nm (default range 900–1600, varied per cell).
- For each virtual light `L_j` (tangent space, toward the light):
```glsl
vec3 H = L + V;
float u = abs(dot(t, H)) * d;
vec3 b = cross(vec3(0,0,1), t);
float spread = exp(-pow(dot(b, H), 2.0) / (sigma*sigma));   // grating roughness
for m in 1..ORDERS:                                          // ORDERS = 3
    float lambda = u / float(m);
    if (lambda > 380.0 && lambda < 750.0)
        c += spectrum(lambda) * spread * orderWeight[m];
```
- `spectrum()`: use Zucconi's `spectral_zucconi6` fit.
- Lights: 3 virtual softbox directions plus a weak broad fill. They are fixed in **world space**, so tilting rotates the slab relative to them, exactly as a real card turns relative to room lights. See §5.10.4 for how tilt reaches the shader.
- **Opal body term**: a low-intensity hue from `spectrum(mix(420,680, noise(cell, V)))`. This keeps digits from going fully black when no light aligns.
- Early-out: skip diffraction wherever the segment mask is 0.

### 5.5 Obsidian surface (obsidian.glsl)
- Schlick Fresnel with `F0 = 0.04`.
- Reflection from a **procedural studio environment** computed in the shader: dark gradient plus 2–3 soft rectangular highlights. No HDR asset is needed.
- Surface normal perturbation: low-amplitude fbm for the wavy conchoidal feel (`surfaceWaviness`, default subtle).
- Final: `color = F * envReflection + (1 - F) * interior`.
- Optional: sparse micro-inclusion sparkle in the deepest layer.

### 5.6 Post
- Bloom: threshold high, strength low, so only the brightest spectral hits glow.
- Tone mapping ACES or AgX, output in sRGB.
- Optional film grain at 1–2%.

### 5.7 Debug view modes (required, selectable in GUI)
`final | segment mask | layer id | grating angle | diffraction only | fresnel/reflection only | cosine-palette comparison`

### 5.8 Parameters (Tweakpane)
Grid scale, cell aspect, density per layer, ghost intensity, stroke width, layer count, layer depth spacing, IOR, absorption sigma + tint, grating pitch min/max, grating roughness (sigma), orders, light intensity, body-term intensity, surface waviness, env reflection strength, bloom strength, tilt range, digit animation speed. Presets: **Reference**, **Opal**, **Deep Obsidian**. Include JSON copy/paste of the current settings.

### 5.9 Animation (optional, phase 4)
Each cell's digit can count at its own rate, off by default, using `floor(time * rate + hash)`. When a digit changes, the grating angle stays fixed so the color doesn't jump.

### 5.10 Input and device orientation (`src/input/TiltSource.ts`)

One module owns all input and exposes a single smoothed `tilt: vec2` in −1..1. Nothing else in the app touches raw sensor or pointer events.

#### 5.10.1 Platform requirements
- **HTTPS is mandatory** on iOS and Android. `http://192.168.x.x` will silently deliver no events. Configure Vite with `server.https` via `@vitejs/plugin-basic-ssl`, or document a tunnel (ngrok / Cloudflare Tunnel) in the README for on-device testing.
- **iOS 13+ Safari** requires `DeviceOrientationEvent.requestPermission()`, called synchronously from inside a real user gesture handler. A tap-to-start button is therefore required, not optional. The promise resolves to `'granted'` or `'denied'`; treat anything else as denied.
- **Android Chrome** fires events without a prompt.
- **Iframes** need `allow="accelerometer; gyroscope; magnetometer"` on the iframe plus a matching `Permissions-Policy` header from the parent. Note this in the README, since the demo may get embedded.
- Feature-detect by waiting for the first event: if no `deviceorientation` event arrives within 1000 ms of a granted permission, fall back to pointer input and hide the tilt UI. Some desktops expose the API but never fire.

#### 5.10.2 Permission flow (UI states)
```
idle → "Tap to explore" button over a static, slowly auto-drifting slab
     → (tap) requestPermission
     → granted  : button fades out, gyro drives tilt
     → denied   : toast "Tilt unavailable — drag instead", pointer/drag drives tilt
     → unsupported : same as denied, no toast
```
Denial must never break the page. Pointer and touch-drag input remain wired up in every state, so the effect is always explorable.

#### 5.10.3 Calibration and smoothing
Raw `beta`/`gamma` are unusable as-is. Apply, in order:

1. **Neutral pose capture.** People hold phones roughly 30–60° off flat, not flat. On the first event after permission, store `base = { beta, gamma }` and treat that pose as zero.
2. **Slow baseline drift.** Ease `base` toward the current reading at about `0.002` per event so the effect re-centres when the user changes posture (sits up, lies down) without feeling like it's fighting them. Expose this as `recenterRate`; `0` disables it.
3. **Deadzone and clamp.** Small deadzone (about 1°) to kill idle jitter, then map ±`tiltRangeDeg` (default 30°) to −1..1 and clamp. Clamping matters because `beta`/`gamma` become ill-conditioned near vertical and `gamma` flips sign past ±90°.
4. **Gimbal guard.** When `|beta|` exceeds about 80°, hold the last good value rather than tracking, to avoid a violent flip as the phone approaches vertical.
5. **Spring smoothing.** Critically damped spring (or `tilt += (target - tilt) * 0.1` per frame) applied in the render loop, not in the event handler, since event rate and frame rate differ.
6. **Screen rotation.** Read `screen.orientation.angle` (fall back to `window.orientation`) and remap axes: at 90° swap beta/gamma and negate as appropriate; at 180° negate both. Re-capture the neutral pose on `orientationchange`.

A manual "Recalibrate" control should exist in the GUI and as a double-tap gesture.

#### 5.10.4 How tilt reaches the shader
Physically, tilting a holographic card leaves your eye and the room lights in place while the card's surface turns. Reproduce that:

- Rotate the **slab** by `tilt * 15°` for visible parallax and silhouette change.
- Rotate the **light directions by the inverse** of that same rotation before passing them into the shader, so they stay fixed in world space.
- The camera does **not** move.

Because diffraction depends on the half-vector between light and view in tangent space, this is what makes the hue sweep across the digits instead of merely sliding the parallax layers. Verify by setting the slab rotation to zero while leaving the light counter-rotation active: colors must still sweep.

#### 5.10.5 Parameters
`tiltRangeDeg` (default 30), `slabRotationDeg` (default 15), `springStiffness`, `recenterRate`, `deadzoneDeg`, `invertX`, `invertY`, `source: auto | gyro | pointer | auto-drift`.

#### 5.10.6 Reference implementation sketch
```ts
async function startGyro(): Promise<boolean> {
  const DOE = window.DeviceOrientationEvent as any;
  if (typeof DOE?.requestPermission === 'function') {
    try { if (await DOE.requestPermission() !== 'granted') return false; }
    catch { return false; }
  }
  let base: { b: number; g: number } | null = null;
  let got = false;

  addEventListener('deviceorientation', (e) => {
    if (e.beta == null || e.gamma == null) return;
    got = true;
    let [b, g] = remapForScreenOrientation(e.beta, e.gamma);
    if (Math.abs(b) > 80) return;                  // gimbal guard
    base ??= { b, g };                             // neutral pose
    base.b += (b - base.b) * recenterRate;         // slow drift
    base.g += (g - base.g) * recenterRate;
    target.x = clamp(deadzone(b - base.b) / tiltRangeDeg, -1, 1);
    target.y = clamp(deadzone(g - base.g) / tiltRangeDeg, -1, 1);
  });

  await delay(1000);
  return got;                                      // false => fall back to pointer
}

// render loop
tilt.lerp(target, 0.1);
slab.rotation.set(tilt.x * R, tilt.y * R, 0);
const inv = slab.quaternion.clone().invert();
uniforms.uLightDirs.value = worldLightDirs.map(d => d.clone().applyQuaternion(inv));
```

#### 5.10.7 Auto-drift idle state
Before permission is granted, and whenever no input has arrived for 4 s on desktop, drive `tilt` with a slow Lissajous path (about 0.1 Hz, 40% amplitude) so the material is visibly alive in a screenshot or a passive glance. Any real input cancels it immediately.

## 6. Performance
- Target: 60 fps on a 2021 mid-range phone and 120 fps on a desktop iGPU at 1080p.
- Cap DPR at 2 on desktop and 1.5 on mobile.
- Quality tiers (auto-selected by frame-time sampling over the first 2s, with manual override):
  - Low: 3 layers, 1 light, 2 orders
  - Med: 5 layers, 2 lights, 3 orders
  - High: 8 layers, 3 lights, 3 orders
- No texture fetches in the hot loop. Tier settings are `#define`s, so loops are unrolled at compile time.

## 7. Phases (build and verify one at a time; stop after each for review)

**Phase 0: Scaffold and digits**
Vite/Three setup, slab, single layer, white seven-segment digits with ghost segments, GUI, debug views stub.
*Accept:* crisp, anti-aliased digits at any zoom, and ghost 8s visible in the segment-mask view.

**Phase 1: Diffraction and tilt**
Grating term, spectrum, per-cell orientation with intra-digit noise, world-fixed virtual lights, and the full `TiltSource` module from §5.10 including gyro. Build input once, here, rather than bolting it on later — the diffraction look cannot be judged without it.
*Accept:* at a fixed tilt, several distinct hues appear on screen at once, with gradients inside individual digits, and tilting visibly sweeps colors. Diffraction-only view is available. On a real phone over HTTPS: the iOS prompt appears on tap, denial falls back to drag without breaking, the neutral pose matches however the phone is being held, rotating to landscape keeps the axes correct, and there is no jitter when the phone is held still.

**Phase 2: Depth**
Parallax layers, refraction, front-to-back compositing, absorption, depth softening.
*Accept:* tilting produces clear layer parallax, deeper layers are dimmer and softer, and there are no swimming or stretching artifacts at the ±15° tilt limits.

**Phase 3: Obsidian**
Fresnel, procedural env reflections, surface waviness, bloom, tone mapping.
*Accept:* the slab reads as glossy black glass, highlights slide across the surface independently of the digits, and the result sits side by side with the reference convincingly.

**Phase 4: Polish**
Quality tiers, presets, digit animation, auto-drift idle state, and a README covering HTTPS setup for on-device testing and iframe permission headers.

**Phase 5 (stretch): Arbitrary mesh**
Apply the material to a rock-shaped mesh (needs tangents; fall back to triplanar-style cell mapping).

## 8. Verification
- Use Playwright to screenshot the page at 5 fixed tilt states. For WebGL in headless Chromium, use SwiftShader or ANGLE flags.
- Save screenshots to `screenshots/phase-N/` and compare them against `reference/` before declaring a phase done.
- Log frame time in a small on-screen overlay.
- Gyro cannot be verified headlessly. Add a `?debugTilt=1` query flag that shows live raw `beta`/`gamma`, the captured neutral pose, and the resulting normalised tilt, so on-device checks take seconds. Chrome DevTools' sensor override panel can simulate orientation on desktop but does not exercise the iOS permission path — that needs a real device.

## 9. Non-goals (v1)
Path tracing, true volumetric refraction through arbitrary geometry, physically exact spectral rendering, WebGPU/TSL, and a framework wrapper.
