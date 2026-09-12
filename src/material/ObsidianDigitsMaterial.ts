import * as THREE from 'three';
import vertexShader from '../shaders/main.vert';
import fragmentShader from '../shaders/main.frag';
import { VIEW_MODES, type Params } from '../params';

/**
 * The single-pass shader material. Everything the look needs lives in the
 * fragment shader; this class only owns uniform plumbing.
 */
export class ObsidianDigitsMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uTilt: { value: new THREE.Vector2() },
        uViewMode: { value: 0 },

        uGridScale: { value: 13.5 },
        uCellAspect: { value: 1.22 },
        uGlyphFillX: { value: 0.89 },
        uGlyphFillY: { value: 0.96 },
        uDensity: { value: 1 },
        uGhostIntensity: { value: 0 },
        uGhostColor: { value: new THREE.Color('#12514b') },
        uSegThickness: { value: 0.22 },
        uSegGap: { value: 0 },
        uSegRounding: { value: 0.7 },
        uRimWidth: { value: 0.55 },
        uRimIntensity: { value: 0.5 },
        uCellLevelMin: { value: 0.08 },
        uCellLevelMax: { value: 0.58 },
        uCellLevelBias: { value: 2.6 },
        uSkew: { value: 0.054 },
        uWarpAmount: { value: 0.004 },
        uWarpScale: { value: 0.6 },
        uDigitSpeed: { value: 0 },
        uMediumColor: { value: new THREE.Color('#050607') },
      },
    });
  }

  /** Copies GUI state into uniforms. Called once per frame. */
  sync(params: Params, time: number, tilt: THREE.Vector2): void {
    const u = this.uniforms;
    u.uTime.value = time;
    u.uTilt.value.copy(tilt);
    u.uViewMode.value = VIEW_MODES[params.viewMode];

    u.uGridScale.value = params.gridScale;
    u.uCellAspect.value = params.cellAspect;
    u.uGlyphFillX.value = params.glyphFillX;
    u.uGlyphFillY.value = params.glyphFillY;
    u.uDensity.value = params.density;
    u.uGhostIntensity.value = params.ghostIntensity;
    (u.uGhostColor.value as THREE.Color).set(params.ghostColor);
    u.uSegThickness.value = params.segThickness;
    u.uSegGap.value = params.segGap;
    u.uSegRounding.value = params.segRounding;
    u.uRimWidth.value = params.rimWidth;
    u.uRimIntensity.value = params.rimIntensity;
    u.uCellLevelMin.value = params.cellLevelMin;
    u.uCellLevelMax.value = params.cellLevelMax;
    u.uCellLevelBias.value = params.cellLevelBias;
    u.uSkew.value = params.skew;
    u.uWarpAmount.value = params.warpAmount;
    u.uWarpScale.value = params.warpScale;
    u.uDigitSpeed.value = params.digitSpeed;
    (u.uMediumColor.value as THREE.Color).set(params.mediumColor);
  }
}
