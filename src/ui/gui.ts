import { Pane } from 'tweakpane';
import { DEFAULT_PARAMS, VIEW_MODES, type Params } from '../params';

interface GuiHooks {
  onRecalibrate: () => void;
  onCameraChange: () => void;
}

/** Builds the Tweakpane UI. Folders track the PRD's parameter groups. */
export function createGui(params: Params, hooks: GuiHooks): Pane {
  const pane = new Pane({ title: 'Obsidian Opal Digits' });

  pane.addBinding(params, 'viewMode', {
    label: 'view',
    options: Object.fromEntries(Object.keys(VIEW_MODES).map((k) => [k, k])),
  });

  const grid = pane.addFolder({ title: 'Digit grid' });
  grid.addBinding(params, 'gridScale', { label: 'grid scale', min: 2, max: 80, step: 0.5 });
  grid.addBinding(params, 'cellAspect', { label: 'cell aspect', min: 1, max: 2.5, step: 0.01 });
  grid.addBinding(params, 'glyphFillX', { label: 'glyph fill X', min: 0.4, max: 1, step: 0.01 });
  grid.addBinding(params, 'glyphFillY', { label: 'glyph fill Y', min: 0.4, max: 1, step: 0.01 });
  grid.addBinding(params, 'density', { label: 'front density', min: 0, max: 1, step: 0.01 });
  grid.addBinding(params, 'deepDensity', { label: 'deep density', min: 0, max: 1, step: 0.01 });
  grid.addBinding(params, 'skew', { label: 'skew', min: -0.2, max: 0.2, step: 0.005 });
  grid.addBinding(params, 'warpAmount', { label: 'warp', min: 0, max: 0.05, step: 0.001 });
  grid.addBinding(params, 'warpScale', { label: 'warp scale', min: 0.05, max: 4, step: 0.05 });
  grid.addBinding(params, 'digitSpeed', { label: 'digit speed', min: 0, max: 4, step: 0.05 });

  const glyph = pane.addFolder({ title: 'Segments' });
  glyph.addBinding(params, 'segThickness', { label: 'thickness', min: 0.05, max: 0.4, step: 0.005 });
  glyph.addBinding(params, 'segGap', { label: 'mitre gap', min: 0, max: 1, step: 0.02 });
  glyph.addBinding(params, 'segRounding', { label: 'rounding', min: 0, max: 1, step: 0.02 });
  glyph.addBinding(params, 'rimWidth', { label: 'rim width', min: 0, max: 1.5, step: 0.05 });
  glyph.addBinding(params, 'rimIntensity', { label: 'rim boost', min: 0, max: 2, step: 0.05 });
  glyph.addBinding(params, 'ghostIntensity', { label: 'ghost', min: 0, max: 0.5, step: 0.005 });
  glyph.addBinding(params, 'ghostColor', { label: 'ghost colour' });
  glyph.addBinding(params, 'mediumColor', { label: 'medium' });

  const cam = pane.addFolder({ title: 'Camera' });
  cam.addBinding(params, 'cameraFov', { label: 'fov deg', min: 8, max: 60, step: 0.5 })
    .on('change', hooks.onCameraChange);

  const depth = pane.addFolder({ title: 'Depth' });
  depth.addBinding(params, 'layers', { label: 'layers', min: 1, max: 8, step: 1 });
  depth.addBinding(params, 'layerSpacing', { label: 'spacing', min: 0, max: 0.4, step: 0.005 });
  depth.addBinding(params, 'layerOffsetCells', { label: 'lattice offset', min: 0, max: 1.5, step: 0.05 });
  depth.addBinding(params, 'depthSoftness', { label: 'depth blur', min: 0, max: 1, step: 0.01 });
  depth.addBinding(params, 'deepDim', { label: 'deep dim', min: 0, max: 1, step: 0.01 });
  depth.addBinding(params, 'absorptionSigma', { label: 'absorption', min: 0, max: 12, step: 0.05 });
  depth.addBinding(params, 'absorptionTintR', { label: 'absorb R', min: 0, max: 3, step: 0.05 });
  depth.addBinding(params, 'absorptionTintG', { label: 'absorb G', min: 0, max: 3, step: 0.05 });
  depth.addBinding(params, 'absorptionTintB', { label: 'absorb B', min: 0, max: 3, step: 0.05 });

  const diff = pane.addFolder({ title: 'Diffraction' });
  diff.addBinding(params, 'pitchMin', { label: 'pitch min nm', min: 300, max: 2500, step: 10 });
  diff.addBinding(params, 'pitchMax', { label: 'pitch max nm', min: 300, max: 2500, step: 10 });
  diff.addBinding(params, 'pitchBias', { label: 'pitch bias', min: 0.3, max: 5, step: 0.05 });
  diff.addBinding(params, 'ior', { label: 'IOR', min: 1, max: 2.4, step: 0.01 });
  diff.addBinding(params, 'blazeCentre', { label: 'blaze nm', min: 400, max: 700, step: 2 });
  diff.addBinding(params, 'blazeWidth', { label: 'blaze width nm', min: 10, max: 300, step: 2 });
  diff.addBinding(params, 'blazeJitter', { label: 'blaze jitter nm', min: 0, max: 400, step: 5 });
  diff.addBinding(params, 'blazeFloor', { label: 'blaze floor', min: 0, max: 0.6, step: 0.01 });
  diff.addBinding(params, 'gratingSigma', { label: 'roughness', min: 0.05, max: 2, step: 0.01 });
  diff.addBinding(params, 'orderWeight1', { label: 'order 1', min: 0, max: 2, step: 0.01 });
  diff.addBinding(params, 'orderWeight2', { label: 'order 2', min: 0, max: 2, step: 0.01 });
  diff.addBinding(params, 'orderWeight3', { label: 'order 3', min: 0, max: 2, step: 0.01 });
  diff.addBinding(params, 'angleBase', { label: 'angle base deg', min: -90, max: 90, step: 1 });
  diff.addBinding(params, 'angleSpread', { label: 'angle spread', min: 0, max: 1, step: 0.01 });
  diff.addBinding(params, 'angleNoise', { label: 'angle noise', min: 0, max: 3, step: 0.02 });
  diff.addBinding(params, 'angleNoiseScale', { label: 'angle noise scale', min: 0.2, max: 30, step: 0.2 });
  diff.addBinding(params, 'lightIntensity', { label: 'light', min: 0, max: 4, step: 0.02 });
  diff.addBinding(params, 'lightElevMin', { label: 'light elev min', min: 5, max: 88, step: 1 });
  diff.addBinding(params, 'lightElevMax', { label: 'light elev max', min: 5, max: 88, step: 1 });
  diff.addBinding(params, 'fillIntensity', { label: 'ambient fill', min: 0, max: 0.5, step: 0.005 });
  diff.addBinding(params, 'bodyIntensity', { label: 'opal body', min: 0, max: 0.5, step: 0.005 });
  diff.addBinding(params, 'bodyNoiseScale', { label: 'body scale', min: 0.1, max: 8, step: 0.1 });
  diff.addBinding(params, 'bodyLambdaMin', { label: 'body nm min', min: 380, max: 750, step: 5 });
  diff.addBinding(params, 'bodyLambdaMax', { label: 'body nm max', min: 380, max: 750, step: 5 });
  diff.addBinding(params, 'saturation', { label: 'saturation', min: 0, max: 1.5, step: 0.01 });
  diff.addBinding(params, 'exposure', { label: 'exposure', min: 0.05, max: 6, step: 0.05 });

  const tilt = pane.addFolder({ title: 'Tilt' });
  tilt.addBinding(params, 'tiltSource', {
    label: 'source',
    options: { auto: 'auto', gyro: 'gyro', pointer: 'pointer', 'auto-drift': 'auto-drift' },
  });
  tilt.addBinding(params, 'slabRotationDeg', { label: 'slab rot deg', min: 0, max: 45, step: 0.5 });
  tilt.addBinding(params, 'lightRotationDeg', { label: 'light rot deg', min: 0, max: 45, step: 0.5 });
  tilt.addBinding(params, 'tiltRangeDeg', { label: 'range deg', min: 5, max: 90, step: 1 });
  tilt.addBinding(params, 'springStiffness', { label: 'spring', min: 0.01, max: 1, step: 0.01 });
  tilt.addBinding(params, 'recenterRate', { label: 'recentre', min: 0, max: 0.05, step: 0.001 });
  tilt.addBinding(params, 'deadzoneDeg', { label: 'deadzone deg', min: 0, max: 10, step: 0.25 });
  tilt.addBinding(params, 'invertX', { label: 'invert X' });
  tilt.addBinding(params, 'invertY', { label: 'invert Y' });
  tilt.addButton({ title: 'Recalibrate' }).on('click', hooks.onRecalibrate);

  const io = pane.addFolder({ title: 'Settings JSON', expanded: false });
  io.addButton({ title: 'Copy to clipboard' }).on('click', () => {
    void navigator.clipboard?.writeText(JSON.stringify(params, null, 2));
  });
  io.addButton({ title: 'Paste from clipboard' }).on('click', async () => {
    try {
      Object.assign(params, JSON.parse(await navigator.clipboard.readText()));
      pane.refresh();
    } catch {
      /* invalid JSON or clipboard denied: leave the current settings alone */
    }
  });
  io.addButton({ title: 'Reset to defaults' }).on('click', () => {
    Object.assign(params, DEFAULT_PARAMS);
    pane.refresh();
  });

  return pane;
}
