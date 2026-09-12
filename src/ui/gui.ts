import { Pane } from 'tweakpane';
import { DEFAULT_PARAMS, VIEW_MODES, type Params } from '../params';

interface GuiHooks {
  onRecalibrate: () => void;
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
  grid.addBinding(params, 'density', { label: 'lit density', min: 0, max: 1, step: 0.01 });
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
  glyph.addBinding(params, 'cellLevelMin', { label: 'cell level min', min: 0, max: 1, step: 0.01 });
  glyph.addBinding(params, 'cellLevelMax', { label: 'cell level max', min: 0, max: 1, step: 0.01 });
  glyph.addBinding(params, 'cellLevelBias', { label: 'cell level bias', min: 0.5, max: 5, step: 0.1 });
  glyph.addBinding(params, 'ghostIntensity', { label: 'ghost', min: 0, max: 0.5, step: 0.005 });
  glyph.addBinding(params, 'ghostColor', { label: 'ghost colour' });
  glyph.addBinding(params, 'mediumColor', { label: 'medium' });

  const tilt = pane.addFolder({ title: 'Tilt' });
  tilt.addBinding(params, 'tiltSource', {
    label: 'source',
    options: { auto: 'auto', gyro: 'gyro', pointer: 'pointer', 'auto-drift': 'auto-drift' },
  });
  tilt.addBinding(params, 'slabRotationDeg', { label: 'slab rot deg', min: 0, max: 45, step: 0.5 });
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
