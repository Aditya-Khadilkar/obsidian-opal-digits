// Single source of truth for every tunable value. The GUI binds to this object
// and the material copies it into uniforms once per frame.

/** Debug views. The numeric values must match the VIEW_* defines in main.frag. */
export const VIEW_MODES = {
  'final': 0,
  'segment mask': 1,
  'layer id': 2,
  'grating angle (phase 1)': 3,
  'diffraction only (phase 1)': 4,
  'fresnel / reflection only (phase 3)': 5,
  'cosine-palette comparison (phase 1)': 6,
} as const;

export type ViewModeName = keyof typeof VIEW_MODES;

export type TiltSourceName = 'auto' | 'gyro' | 'pointer' | 'auto-drift';

export interface Params {
  viewMode: ViewModeName;

  // Digit grid. Defaults come from reference/MEASUREMENTS.md.
  gridScale: number;
  cellAspect: number;
  glyphFillX: number;
  glyphFillY: number;
  density: number;
  ghostIntensity: number;
  ghostColor: string;
  segThickness: number;
  segGap: number;
  segRounding: number;
  rimWidth: number;
  rimIntensity: number;
  cellLevelMin: number;
  cellLevelMax: number;
  cellLevelBias: number;
  skew: number;
  warpAmount: number;
  warpScale: number;
  digitSpeed: number;
  mediumColor: string;

  // Input and tilt, see PRD 5.10
  tiltSource: TiltSourceName;
  tiltRangeDeg: number;
  slabRotationDeg: number;
  springStiffness: number;
  recenterRate: number;
  deadzoneDeg: number;
  invertX: boolean;
  invertY: boolean;
}

export const DEFAULT_PARAMS: Params = {
  viewMode: 'final',

  gridScale: 13.5,   // about 35 cells across the slab, as the reference shows
  cellAspect: 1.22,  // row pitch 45 px over column pitch 37 px
  glyphFillX: 0.89,
  glyphFillY: 0.96,
  density: 1.0,      // every cell carries a digit
  ghostIntensity: 0, // the reference has no unlit ghost glyphs
  ghostColor: '#12514b',
  segThickness: 0.22, // fraction of glyph width
  segGap: 0,          // segments join continuously
  segRounding: 0.7,   // fraction of segment half-thickness; 1 = capsule ends
  rimWidth: 0.55,
  rimIntensity: 0.5,
  cellLevelMin: 0.08, // per-cell brightness in display terms, fitted to the
  cellLevelMax: 0.58, // reference's stroke-luminance distribution
  cellLevelBias: 2.6,
  skew: 0.054,
  warpAmount: 0.004,
  warpScale: 0.6,
  digitSpeed: 0,
  mediumColor: '#050607',

  tiltSource: 'auto',
  tiltRangeDeg: 30,
  slabRotationDeg: 15,
  springStiffness: 0.1,
  recenterRate: 0.002,
  deadzoneDeg: 1,
  invertX: false,
  invertY: false,
};

export function clonePreset(p: Params): Params {
  return { ...p };
}
