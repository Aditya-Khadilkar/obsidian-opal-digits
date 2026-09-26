# Opal Digits — Framer component

A port of the Three.js scene in `../src/` into a self-contained Framer code
component. It is kept out of the main Vite build on purpose: nothing in
here is imported by `../src/`, and nothing in `../src/` is imported by this
folder, so the two can drift and be edited independently.

## Files

- `OpalDigits.tsx` — the component Framer will list on the canvas. Owns the
  React lifecycle (mount/resize/unmount) and the property controls.
- `ObsidianDigitsMaterial.ts`, `PostChain.ts`, `TiltSource.ts` — ported
  from `src/material/`, `src/post/composer.ts`, `src/input/TiltSource.ts`.
  Logic is unchanged; only import paths and the three.js version pin differ.
- `params.ts`, `presets.ts`, `quality.ts` — ported unchanged from `src/`.
- `shaders.ts` — the five `.glsl` modules plus `main.vert`/`main.frag` from
  `src/shaders/`, inlined as strings, with a small `#include` resolver that
  runs once at module load. The real build uses `vite-plugin-glsl-include.ts`
  for this; Framer has no equivalent build hook, so the resolution happens
  in plain JS instead.

## Getting it into Framer

Framer projects are a set of "code files"; one with a default-exported
component and an `addPropertyControls` call becomes a component you can drag
onto the canvas, and the rest are ordinary modules it can import by relative
path, same as `./params` here.

Two ways to bring this folder in:

1. **Framer's local project sync / VS Code extension.** If your Framer plan
   has this enabled, point it at this `framer/` folder (or copy the folder
   into the synced project directory Framer gives you) and it picks up all
   seven files, wiring up the relative imports automatically. This is the
   easiest path since nothing needs re-typing.
2. **Paste by hand.** In Framer, add a new code file for each of the seven
   files above (Insert → Code → New Code File, or the `⌘K` command palette),
   name each file to match the filename here exactly (`params`, `quality`,
   `presets`, `shaders`, `TiltSource`, `PostChain`, `ObsidianDigitsMaterial`,
   `OpalDigits`), and paste the matching contents. The relative imports
   (`from "./params"`, etc.) only resolve if the file names match.

Either way, only `OpalDigits.tsx` shows up as a draggable component; the rest
are invisible helper modules, same as in this repo's own `src/`.

## Property controls

| Control | What it does |
| --- | --- |
| Preset | `Reference`, `Opal`, `Deep Obsidian` — same three looks as the app's GUI presets |
| Quality | `auto` probes frame time and steps down; `low`/`medium`/`high` pin a tier |
| Tilt input | `auto` picks gyro or pointer/drag depending on what's available; `pointer` and `auto-drift` force one behaviour |
| Camera FOV, Fill | Framing — how tight the lens is and how much of the frame the slab covers |
| Tilt range | How far the slab rotates at the tilt/drag extremes |
| Bloom, Exposure, Grain | Post-processing knobs from the same post chain as the main app |
| Glass color | The base medium color the digits sit in |

Everything else (grid density, segment shape, diffraction physics, etc.)
stays at the preset's value. If you want more of it exposed, add entries to
the `addPropertyControls` call in `OpalDigits.tsx` and thread them through
`buildParams` — the full list of tunables is in `params.ts`.

## Notes and caveats

- **Version pin.** Every `three` import here is written as
  `"three@0.169.0"` (matching `../package.json`), including the
  `three@0.169.0/examples/jsm/postprocessing/...` subpath imports in
  `PostChain.ts`. Framer resolves npm imports per version string, so pinning
  consistently across every file avoids two different copies of three.js
  loading into the same page. If you bump the version, change it everywhere
  in this folder (a project-wide find/replace on `three@0.169.0`).
- **No GUI, no fullscreen toggle, no debug views.** Those belong to the
  standalone app (`src/ui/gui.ts`, `fullscreen.ts`, `tiltDebug.ts`) and don't
  make sense embedded in a page. The Framer component reads its tunables from
  property controls instead. The `?tilt=`, `?set=`, `?nogui`, `?debugTilt`
  URL-param tricks from `src/main.ts` aren't ported either — those existed
  for the screenshot test harness in `../tests/`.
- **iOS gyro permission.** On a device that gates `DeviceOrientationEvent`
  behind a permission prompt, a "Tap to explore" button appears until it's
  answered, exactly like the standalone app. This only shows outside the
  Framer canvas (i.e. in Preview or on the published site) — there's no real
  user gesture to answer the prompt with inside the design canvas.
- **Keeping the shaders in sync.** `shaders.ts` is a hand-copied snapshot of
  `../src/shaders/*.glsl`. If you tune the look in the main app, re-paste the
  changed file's contents into the matching entry in `MODULES` (or into
  `mainVertexShader` for `main.vert`, or `MAIN_FRAG_SRC` for `main.frag`).
  There's no automated sync between the two.
- **Performance in the Framer canvas.** The design canvas renders many
  layers at once; a full WebGL scene with bloom can be heavier there than in
  a published page with just this component. `quality="auto"` should step
  itself down if frames start dropping, but pinning `quality="low"` while
  laying out a page and switching back before publishing is a reasonable
  workaround if the canvas feels sluggish.
