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
| 2 | Parallax layers, refraction, absorption, depth softening | not started |
| 3 | Fresnel, procedural studio reflections, surface waviness, bloom, tone mapping | not started |
| 4 | Quality tiers, presets, digit animation, auto-drift idle state | not started |
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
| `npm run shots` | Playwright screenshots into `screenshots/phase-N/` |
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

`wrangler.toml` sets `pages_build_output_dir = "dist"`, so a direct upload is:

```bash
npx wrangler pages deploy dist
```

For a Git-connected project, set the build command to `npm run build` and the
output directory to `dist`. `public/_headers` ships the sensor permissions
policy and long-lived caching for hashed assets.

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
reference/                     reference imagery, see reference/README.md
screenshots/phase-N/           captured output per phase
```

### Colour management

The fragment shader is a raw `ShaderMaterial`, so three.js injects none of its
output transforms. The shader therefore owns the linear-to-sRGB encode itself,
and tone mapping will go in the same place in phase 3. Everything upstream of
that, uniform colours included, is linear light.
