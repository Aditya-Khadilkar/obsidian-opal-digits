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

        uGridScale: { value: 22 },
        uCellAspect: { value: 1.6 },
        uGlyphFill: { value: 0.88 },
        uDensity: { value: 0.35 },
        uGhostIntensity: { value: 0.06 },
        uGhostColor: { value: new THREE.Color('#0d3d3a') },
        uStrokeWidth: { value: 0.012 },
        uSegThickness: { value: 0.05 },
        uSegGap: { value: 0.012 },
        uSegRounding: { value: 0.02 },
        uInnerFill: { value: 0.06 },
        uSkew: { value: 0.03 },
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
    u.uGlyphFill.value = params.glyphFill;
    u.uDensity.value = params.density;
    u.uGhostIntensity.value = params.ghostIntensity;
    (u.uGhostColor.value as THREE.Color).set(params.ghostColor);
    u.uStrokeWidth.value = params.strokeWidth;
    u.uSegThickness.value = params.segThickness;
    u.uSegGap.value = params.segGap;
    u.uSegRounding.value = params.segRounding;
    u.uInnerFill.value = params.innerFill;
    u.uSkew.value = params.skew;
    u.uWarpAmount.value = params.warpAmount;
    u.uWarpScale.value = params.warpScale;
    u.uDigitSpeed.value = params.digitSpeed;
    (u.uMediumColor.value as THREE.Color).set(params.mediumColor);
  }
}
