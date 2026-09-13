// Single source of truth for every tunable value. The GUI binds to this object
// and the material copies it into uniforms once per frame.

/** Debug views. The numeric values must match the VIEW_* defines in main.frag. */
export const VIEW_MODES = {
  'final': 0,
  'segment mask': 1,
  'layer id': 2,
  'grating angle': 3,
  'diffraction only': 4,
  'fresnel / reflection only (phase 3)': 5,
  'cosine-palette comparison': 6,
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
  skew: number;
  warpAmount: number;
  warpScale: number;
  digitSpeed: number;
  mediumColor: string;

  // Camera. A long lens keeps the view vector nearly constant across the slab,
  // which is the condition the reference photograph was shot under. A wide one
  // swings the half-vector at the edges and sends those cells into the red.
  cameraFov: number;

  // Diffraction, see PRD 5.4
  pitchMin: number;
  pitchMax: number;
  pitchBias: number;
  gratingSigma: number;
  ior: number;
  blazeCentre: number;
  blazeWidth: number;
  blazeJitter: number;
  blazeFloor: number;
  orderWeight1: number;
  orderWeight2: number;
  orderWeight3: number;
  angleBase: number;
  angleSpread: number;
  angleNoise: number;
  angleNoiseScale: number;
  lightIntensity: number;
  lightElevMin: number;
  lightElevMax: number;
  fillIntensity: number;
  bodyIntensity: number;
  bodyNoiseScale: number;
  bodyLambdaMin: number;
  bodyLambdaMax: number;
  saturation: number;
  exposure: number;

  // Input and tilt, see PRD 5.10
  tiltSource: TiltSourceName;
  tiltRangeDeg: number;
  slabRotationDeg: number;
  lightRotationDeg: number;
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
  skew: 0.054,
  warpAmount: 0.004,
  warpScale: 0.6,
  digitSpeed: 0,
  mediumColor: '#050607',

  cameraFov: 14,

  pitchMin: 817,
  pitchMax: 1323,
  pitchBias: 1.0,
  gratingSigma: 1.21,
  ior: 1.49,
  blazeCentre: 456,
  blazeWidth: 60,
  blazeJitter: 25,
  blazeFloor: 0.02,
  orderWeight1: 1.0,
  orderWeight2: 0.55,
  orderWeight3: 0.28,
  angleBase: 0,
  angleSpread: 1,
  angleNoise: 0.61,
  angleNoiseScale: 6,
  lightIntensity: 1.0,
  lightElevMin: 40,
  lightElevMax: 44,
  fillIntensity: 0.013,
  bodyIntensity: 0.025,
  bodyNoiseScale: 1.4,
  bodyLambdaMin: 440,
  bodyLambdaMax: 560,
  saturation: 0.68,
  exposure: 1.4,

  tiltSource: 'auto',
  tiltRangeDeg: 30,
  slabRotationDeg: 15,
  lightRotationDeg: 0,
  springStiffness: 0.1,
  recenterRate: 0.002,
  deadzoneDeg: 1,
  invertX: false,
  invertY: false,
};

export function clonePreset(p: Params): Params {
  return { ...p };
}
