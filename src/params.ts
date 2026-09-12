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

  // Digit grid
  gridScale: number;
  cellAspect: number;
  glyphFill: number;
  density: number;
  ghostIntensity: number;
  ghostColor: string;
  strokeWidth: number;
  segThickness: number;
  segGap: number;
  segRounding: number;
  innerFill: number;
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

  gridScale: 22,
  cellAspect: 1.6,
  glyphFill: 0.88,
  density: 0.35,
  ghostIntensity: 0.16,
  ghostColor: '#12514b',
  strokeWidth: 0.012,
  segThickness: 0.05,
  segGap: 0.012,
  segRounding: 0.02,
  innerFill: 0.06,
  skew: 0.03,
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
