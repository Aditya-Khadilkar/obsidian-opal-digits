# Obsidian Opal Digits

A real-time WebGL material: black volcanic glass with seven-segment digits
embedded at several depths. The digits take their colour from **diffraction**,
so the hue shifts with viewing angle and several colours appear at once, with
gradients inside a single digit. Tilt the slab with the mouse, a touch drag or
the phone gyroscope and the colours sweep while the layers move in parallax.

The full specification is in [the PRD](PRD-obsidian-opal-digits-shader_1.md).

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 0 | Scaffold, procedural seven-segment digits, GUI, debug views | done, matched to the reference |
| 1 | Diffraction, spectrum, world-fixed lights, tilt input | done |
| 2 | Parallax layers, refraction, absorption, depth softening | done, 4 layers |
| 3 | Fresnel, procedural studio reflections, surface waviness, bloom, tone mapping | done |
| 4 | Quality tiers, presets, digit animation, auto-drift idle state | done |
| 5 | Arbitrary mesh (stretch) | not started |

## The PRD's description of the reference is wrong in four places

Section 2 of the PRD describes the reference photograph in prose. Four of those
claims do not survive measurement. `reference/MEASUREMENTS.md` has the numbers
and the method; the implementation follows the measurements.

| PRD section 2 says | The image shows |
| --- | --- |
| Cells about 1 : 1.6, taller than wide | 1 : 1.22. Column pitch 37 px, row pitch 45 px |
| Unlit segments visible as dark teal ghost 8s, "essential to the look" | No ghost glyphs at all. Every cell holds an ordinary digit; 0.2% of cells are empty |
| Lit segments are outlined strokes, not flat fills | Solid bars, 0.23 of glyph width, joined with no mitre gap |
| Deeper digits are dimmer **and softer** | Edge sharpness is flat across brightness quartiles, so the variation is diffraction intensity, not depth |

The cell aspect error comes from reading the strongest vertical autocorrelation
peak, at 31 px, as the row pitch. It is the segment a to segment d self-match
inside one glyph.

Two further corrections are matters of degree rather than fact. The palette is
much bluer than "mostly green/teal with scattered magenta, blue, yellow and
pink" suggests: green through blue is 87% of stroke pixels and yellow is 0.6%.
And hue tracks brightness, dim cells reading blue and bright cells green, which
is a useful constraint on the diffraction model in phase 1.

## Quality and presets

Three tiers, each a set of compile-time defines so the light, order and layer
loops all unroll:

| Tier | Layers | Lights | Orders | Pixel ratio |
| --- | --- | --- | --- | --- |
| low | up to 3 | 1 | 2 | 1.0 |
| medium | up to 5 | 2 | 3 | 1.5 |
| high | up to 8 | 3 | 3 | 2.0 |

The PRD states those layer numbers as counts. They are **caps** here, because the
authored look is four layers and a tier is a performance budget rather than an
art direction: a fast machine should render the piece as designed, not add
layers nobody asked for.

The room always has three softboxes. A tier bounds how many the diffraction sum
can afford; the surface reflection still sees all of them.

On `auto`, the tier starts from the platform, high on desktop and medium on
touch, and steps **down** on sustained slow frames. It never steps up, because
frame time is capped by vsync: a machine with plenty of headroom reports the
same 16.7 ms as one with none, so there is no signal to climb on. The overlay in
the corner shows the tier in force.

Three presets sit at the top of the GUI. **Reference** is the defaults, fitted to
measurements of the photograph rather than chosen by eye. **Opal** widens the
blaze and the pitch spread so more of the spectrum arrives at once. **Deep
Obsidian** leans on absorption and the surface instead of the digits.

## The glass

Schlick Fresnel at F0 0.04 against a studio environment computed in the shader,
so no HDR asset is needed: a dark room gradient plus one soft-edged rectangular
highlight per virtual softbox. The softboxes are the same ones that light the
diffraction gratings, so a highlight sliding across the surface and a band of
colour sweeping through the digits are the same room light seen two ways.

The surface normal carries low-amplitude fbm, because obsidian fractures
conchoidally and a real piece is never optically flat. That waviness is what
makes the highlights visible at all: with a 14 degree lens the slab is viewed
almost head-on, and a perfectly flat surface reflects nothing back to the eye
from softboxes at 40 degrees elevation. Only the reflection uses the perturbed
normal. Letting it perturb the refraction would ripple the digit grid, and the
reference's lattice is clean.

The reflection is deliberately faint. Section 2 of the PRD calls for black glossy
glass with faint surface reflections, and at full strength the sheen washes the
digits out.

### Post

The material writes linear HDR and the post chain owns the output: bloom runs on
those values so only genuinely bright spectral hits glow, then tone mapping and
the sRGB encode, then film grain at about 1.5%. Tone mapping is ACES by default,
with AgX, Khronos Neutral and none in the GUI.

Not implemented: the optional micro-inclusion sparkle in the deepest layer from
section 5.5.

## Depth

Four layers, faked entirely in the fragment shader: the refracted view ray is
walked down to each layer's depth, the digit grid is sampled there, and the
results are composited front to back so a near digit occludes the ones behind
it. Absorption is Beer-Lambert along the path in and back out, with a
per-channel tint, which is what gives the glass its smoky cast.

Only the front layer is fully occupied. The reference shows one dense lattice
and no second offset copy, so the deeper layers are sparse: they supply parallax
and the sense of a solid volume without turning the surface into a thicket. The
same absorption tint also reproduces something measured in the reference, that
dim cells read blue and bright ones green, because red is absorbed hardest with
depth.

Layer count is a compile-time define so the loop unrolls; changing it in the GUI
recompiles the shader. Measured frame times at 1280x800 in headless Chromium:

| Layers | Median frame time |
| --- | --- |
| 1 | 16.7 ms, at vsync |
| 4 | 16.8 ms, at vsync |
| 8 | 31.1 ms |

Depth blur is deliberately slight. The PRD asks for edge softness that grows
with depth, but the reference's edge sharpness is flat across every brightness
quartile, so a strong depth blur would move away from it rather than towards it.

## Colour

The digits are coloured by a diffraction grating, after Jos Stam's shader in GPU
Gems 1 chapter 8. Each cell has its own grating direction and line pitch, and a
low-frequency noise field perturbs the direction across the surface, which is
what puts a colour gradient inside a single digit rather than flat-shading each
one. Three virtual softboxes are fixed in **world** space while the tangent basis
comes from the model matrix, so turning the slab moves it relative to the lights
by itself and the hue sweeps. No CPU-side counter-rotation is needed.

Two departures from the PRD's section 5.4, both recorded with their reasoning in
`reference/MEASUREMENTS.md`:

- **A blaze envelope.** Without it the model spreads energy evenly across
  wavelength, and since red occupies 116 nm of the visible band against teal's
  28 nm, the material comes out orange under every geometry. A real grating is
  ruled to favour one design wavelength. Adding that brings the palette to
  within about 35 of the reference's hue distribution, from about 160.
- **Refraction on entry.** The digits sit under glass, so the light and view
  directions are refracted into the medium before the half-vector is formed.
  Phase 2 reuses the same function to walk the parallax layers.

## Run it

```bash
npm install
npm run dev
```

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on http://localhost:5173 |
| `npm run dev:https` | Same, over TLS, for on-device testing |
| `npm run build` | Typecheck, then production build into `dist/` |
| `npm run typecheck` | Typecheck only |
| `npm run shots` | Playwright screenshots into `screenshots/phase-N/`, which is untracked |
| `npm run deploy` | Build, then publish `dist/` to Cloudflare Pages |

## Debug flags

Append these to the URL. They exist so screenshots are deterministic and
on-device checks take seconds.

| Flag | Effect |
| --- | --- |
| `?tilt=x,y` | Pins tilt to a fixed value in −1..1, bypassing all input |
| `?nogui=1` | Hides the Tweakpane panel and the frame-time overlay |
| `?set=key:value,key:value` | Overrides any parameter, e.g. `?set=gridScale:6,density:1` |
| `?debugTilt=1` | Live sensor readout: raw angles, neutral pose, resulting tilt |

Digit animation is off by default; `?set=digitSpeed:2` starts the cells counting.
Each counts at its own rate, and the grating angle is drawn from a different
per-cell hash than the digit, so a cell's colour stays put as its digit changes.

The GUI also has a **view** dropdown for the debug render modes, and a
**Settings JSON** folder that copies and pastes the whole parameter set.

## Tilt

`src/input/TiltSource.ts` owns every input path and exposes one smoothed tilt
vector in −1..1. Nothing else touches a raw pointer or sensor event. Pointer and
touch drag stay wired up in every state, so a refused or missing sensor never
leaves the material unexplorable, and a drag always overrides a running gyro.

Raw `beta` and `gamma` are unusable as they arrive, so they go through, in order:
neutral pose capture on the first event, slow baseline drift so the effect
re-centres when posture changes, a deadzone and clamp, a gimbal guard that holds
the last good value past 80 degrees rather than tracking through the flip, and
a spring applied per frame rather than per event. Screen rotation is handled by
one rotation of the device axes into screen axes, which covers all four
orientations; the neutral pose is re-captured on rotation. Recalibrating is a
double tap or the GUI button.

### Verifying it

The permission dialog and a real gyroscope both need a phone, but everything
they feed into is tested headlessly in `tests/tilt.spec.ts` with synthetic
orientation events: the permission branches including a thrown request, the
silent-sensor timeout, the neutral pose, deadzone, clamp, gimbal guard, baseline
drift, recalibration, both screen rotations, and the idle drift.

That file also carries the check the PRD asks for in section 5.10.4. Hold the
slab still, turn only the lights, and the colours must still sweep, which proves
the hue comes from the half-vector rather than from geometry sliding. The same
control drives the flashlight mode of section 5.1: set `slabRotationDeg` to 0
and `lightRotationDeg` above it.

## On-device testing over HTTPS

iOS and Android deliver **no** `deviceorientation` events over plain HTTP.
`http://192.168.x.x` fails silently, so the gyro must be tested over TLS.

```bash
npm run dev:https
```

That serves over TLS with a self-signed certificate, printed as a LAN address.
Safari and Chrome both warn about the certificate; accept it once per device.
If the warning cannot be bypassed, tunnel instead:

```bash
cloudflared tunnel --url http://localhost:5173
```

iOS 13 and later also require `DeviceOrientationEvent.requestPermission()` from
inside a real user gesture, which is why the page has a tap-to-start button.
Android Chrome needs no prompt. Neither path can be exercised headlessly;
Chrome DevTools' sensor override panel simulates orientation on desktop but does
not go through the iOS permission flow.

## Embedding in an iframe

Sensors are gated twice. The iframe needs the attribute and the parent page
needs the matching header.

```html
<iframe
  src="https://…"
  allow="accelerometer; gyroscope; magnetometer"
></iframe>
```

```
Permissions-Policy: accelerometer=*, gyroscope=*, magnetometer=*
```

This project already sends that header, from `public/_headers` in production and
from `vite.config.ts` in development.

## Deploying to Cloudflare Pages

The repo is at
[Aditya-Khadilkar/obsidian-opal-digits](https://github.com/Aditya-Khadilkar/obsidian-opal-digits).
Connect it once in the dashboard and every push to `main` redeploys.

At **dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git**,
pick the repo and set:

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | leave empty |

Nothing else is needed. `.node-version` pins Node to 22.16, which Vite 7
requires, and `public/_headers` is copied into `dist` by the build, so the
sensor permissions policy and the asset caching rules ship with the site.

To upload a build straight from here instead, authorise once and deploy:

```bash
npx wrangler login
```

```bash
npm run deploy
```

### The gyroscope on the deployed site

Pages serves over HTTPS, which is the hard requirement for orientation events,
so the sensor works once the site is live.

- **iOS**, 13 and later: tapping **Tap to explore** raises the system prompt
  asking to allow motion and orientation access. Allow it and the gyro drives
  the tilt. Refuse it and a toast says so, and drag keeps working.
- **Android Chrome**: no prompt. The button still appears and tapping it starts
  the sensor immediately.
- **Desktop**: no button at all. The pointer drives the tilt, and the material
  drifts on its own when left alone.

Add `?debugTilt=1` to watch the raw angles and the captured neutral pose while
testing on a real device.

## Layout

```
src/
  main.ts                      scene, camera, render loop, URL flags
  params.ts                    every tunable value and its default
  input/TiltSource.ts          gyro + pointer -> one smoothed tilt vector
  material/ObsidianDigitsMaterial.ts
  ui/gui.ts                    Tweakpane panel
  ui/stats.ts                  frame-time overlay
  shaders/
    common.glsl                hash, noise, fbm, sRGB encode, SDF coverage
    segments.glsl              seven-segment SDF + digit bitmasks
    main.vert / main.frag
tests/screenshots.spec.ts      Playwright capture harness
reference/                     measurements taken from the photograph
screenshots/phase-N/           captured output per phase, not committed
```

### Quality and presets

Three tiers, each a set of compile-time defines so the light, order and layer
loops all unroll:

| Tier | Layers | Lights | Orders | Pixel ratio |
| --- | --- | --- | --- | --- |
| low | up to 3 | 1 | 2 | 1.0 |
| medium | up to 5 | 2 | 3 | 1.5 |
| high | up to 8 | 3 | 3 | 2.0 |

The PRD states those layer numbers as counts. They are **caps** here, because the
authored look is four layers and a tier is a performance budget rather than an
art direction: a fast machine should render the piece as designed, not add
layers nobody asked for.

The room always has three softboxes. A tier bounds how many the diffraction sum
can afford; the surface reflection still sees all of them.

On `auto`, the tier starts from the platform, high on desktop and medium on
touch, and steps **down** on sustained slow frames. It never steps up, because
frame time is capped by vsync: a machine with plenty of headroom reports the
same 16.7 ms as one with none, so there is no signal to climb on. The overlay in
the corner shows the tier in force.

Three presets sit at the top of the GUI. **Reference** is the defaults, fitted to
measurements of the photograph rather than chosen by eye. **Opal** widens the
blaze and the pitch spread so more of the spectrum arrives at once. **Deep
Obsidian** leans on absorption and the surface instead of the digits.

## The glass

Schlick Fresnel at F0 0.04 against a studio environment computed in the shader,
so no HDR asset is needed: a dark room gradient plus one soft-edged rectangular
highlight per virtual softbox. The softboxes are the same ones that light the
diffraction gratings, so a highlight sliding across the surface and a band of
colour sweeping through the digits are the same room light seen two ways.

The surface normal carries low-amplitude fbm, because obsidian fractures
conchoidally and a real piece is never optically flat. That waviness is what
makes the highlights visible at all: with a 14 degree lens the slab is viewed
almost head-on, and a perfectly flat surface reflects nothing back to the eye
from softboxes at 40 degrees elevation. Only the reflection uses the perturbed
normal. Letting it perturb the refraction would ripple the digit grid, and the
reference's lattice is clean.

The reflection is deliberately faint. Section 2 of the PRD calls for black glossy
glass with faint surface reflections, and at full strength the sheen washes the
digits out.

### Post

The material writes linear HDR and the post chain owns the output: bloom runs on
those values so only genuinely bright spectral hits glow, then tone mapping and
the sRGB encode, then film grain at about 1.5%. Tone mapping is ACES by default,
with AgX, Khronos Neutral and none in the GUI.

Not implemented: the optional micro-inclusion sparkle in the deepest layer from
section 5.5.

## Depth

Four layers, faked entirely in the fragment shader: the refracted view ray is
walked down to each layer's depth, the digit grid is sampled there, and the
results are composited front to back so a near digit occludes the ones behind
it. Absorption is Beer-Lambert along the path in and back out, with a
per-channel tint, which is what gives the glass its smoky cast.

Only the front layer is fully occupied. The reference shows one dense lattice
and no second offset copy, so the deeper layers are sparse: they supply parallax
and the sense of a solid volume without turning the surface into a thicket. The
same absorption tint also reproduces something measured in the reference, that
dim cells read blue and bright ones green, because red is absorbed hardest with
depth.

Layer count is a compile-time define so the loop unrolls; changing it in the GUI
recompiles the shader. Measured frame times at 1280x800 in headless Chromium:

| Layers | Median frame time |
| --- | --- |
| 1 | 16.7 ms, at vsync |
| 4 | 16.8 ms, at vsync |
| 8 | 31.1 ms |

Depth blur is deliberately slight. The PRD asks for edge softness that grows
with depth, but the reference's edge sharpness is flat across every brightness
quartile, so a strong depth blur would move away from it rather than towards it.

## Colour management

The fragment shader is a raw `ShaderMaterial`, so three.js injects none of its
output transforms. The shader therefore owns the linear-to-sRGB encode itself,
and tone mapping will go in the same place in phase 3. Everything upstream of
that, uniform colours included, is linear light.
