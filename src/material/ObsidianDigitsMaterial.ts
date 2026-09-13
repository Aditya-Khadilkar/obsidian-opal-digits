import * as THREE from 'three';
import vertexShader from '../shaders/main.vert';
import fragmentShader from '../shaders/main.frag';
import { VIEW_MODES, type Params } from '../params';

/** Azimuths of the three virtual softboxes, spread around the slab. */
const LIGHT_AZIMUTHS_DEG = [60, 190, 310];

/**
 * Three virtual softbox directions, fixed in world space. The slab turns under
 * them, which is what sweeps the hue; see the note on uLightDirs in main.frag.
 *
 * Their ELEVATIONS have to differ, and by a lot. The wavelength a grating sends
 * to the eye is proportional to the tangential part of the half-vector, so three
 * lights at the same elevation all land on the same diffraction order and the
 * material comes out mono-hued. Spreading them from near-normal to near-grazing
 * puts one light in the blue while another is in the red, and the sum of the two
 * is what produces the non-spectral magentas and pinks the reference shows.
 */
export function worldLightDirs(elevMinDeg: number, elevMaxDeg: number): THREE.Vector3[] {
  return LIGHT_AZIMUTHS_DEG.map((azDeg, i) => {
    const t = LIGHT_AZIMUTHS_DEG.length > 1 ? i / (LIGHT_AZIMUTHS_DEG.length - 1) : 0;
    const elev = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(elevMaxDeg, elevMinDeg, t));
    const az = THREE.MathUtils.degToRad(azDeg);
    return new THREE.Vector3(
      Math.cos(elev) * Math.cos(az),
      Math.cos(elev) * Math.sin(az),
      Math.sin(elev),
    ).normalize();
  });
}

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
        uSkew: { value: 0.054 },
        uWarpAmount: { value: 0.004 },
        uWarpScale: { value: 0.6 },
        uDigitSpeed: { value: 0 },
        uMediumColor: { value: new THREE.Color('#050607') },

        uLightDirs: { value: worldLightDirs(40, 44) },
        uLightIntensities: { value: [1.0, 0.6, 0.45] },
        uLightIntensity: { value: 1 },
        uFillIntensity: { value: 0.013 },

        uPitchMin: { value: 817 },
        uPitchMax: { value: 1323 },
        uPitchBias: { value: 1 },
        uGratingSigma: { value: 1.21 },
        uIor: { value: 1.49 },
        uBlazeCentre: { value: 456 },
        uBlazeWidth: { value: 60 },
        uBlazeJitter: { value: 25 },
        uBlazeFloor: { value: 0.02 },
        uOrderWeights: { value: new THREE.Vector3(1, 0.55, 0.28) },
        uAngleBase: { value: 0 },
        uAngleSpread: { value: 1 },
        uAngleNoise: { value: 0.61 },
        uAngleNoiseScale: { value: 6 },
        uBodyIntensity: { value: 0.025 },
        uBodyNoiseScale: { value: 1.4 },
        uBodyLambdaMin: { value: 440 },
        uBodyLambdaMax: { value: 560 },
        uSaturation: { value: 0.68 },
        uExposure: { value: 1.4 },
      },
    });
  }

  /**
   * Copies GUI state into uniforms. Called once per frame.
   *
   * `lightRotation` turns the softboxes in world space. It is zero by default,
   * because the slab turning under fixed lights already sweeps the hue: the
   * tangent basis comes from the model matrix, so no CPU-side counter-rotation
   * is needed. It drives the flashlight mode of PRD 5.1, where the pointer moves
   * the light and leaves the slab still, and it is how PRD 5.10.4 says to verify
   * that the sweep comes from the half-vector rather than from parallax: set the
   * slab rotation to zero, leave this on, and the colours must still move.
   */
  sync(
    params: Params,
    time: number,
    tilt: THREE.Vector2,
    lightRotation?: THREE.Quaternion,
  ): void {
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
    u.uSkew.value = params.skew;
    u.uWarpAmount.value = params.warpAmount;
    u.uWarpScale.value = params.warpScale;
    u.uDigitSpeed.value = params.digitSpeed;
    (u.uMediumColor.value as THREE.Color).set(params.mediumColor);

    u.uLightIntensity.value = params.lightIntensity;
    const dirs = u.uLightDirs.value as THREE.Vector3[];
    const fresh = worldLightDirs(params.lightElevMin, params.lightElevMax);
    for (let i = 0; i < dirs.length; i++) {
      dirs[i].copy(fresh[i]);
      if (lightRotation) dirs[i].applyQuaternion(lightRotation);
    }
    u.uFillIntensity.value = params.fillIntensity;
    u.uPitchMin.value = params.pitchMin;
    u.uPitchMax.value = Math.max(params.pitchMax, params.pitchMin);
    u.uPitchBias.value = params.pitchBias;
    u.uGratingSigma.value = params.gratingSigma;
    u.uIor.value = params.ior;
    u.uBlazeCentre.value = params.blazeCentre;
    u.uBlazeWidth.value = params.blazeWidth;
    u.uBlazeJitter.value = params.blazeJitter;
    u.uBlazeFloor.value = params.blazeFloor;
    (u.uOrderWeights.value as THREE.Vector3).set(
      params.orderWeight1, params.orderWeight2, params.orderWeight3,
    );
    u.uAngleBase.value = THREE.MathUtils.degToRad(params.angleBase);
    u.uAngleSpread.value = params.angleSpread;
    u.uAngleNoise.value = params.angleNoise;
    u.uAngleNoiseScale.value = params.angleNoiseScale;
    u.uBodyIntensity.value = params.bodyIntensity;
    u.uBodyNoiseScale.value = params.bodyNoiseScale;
    u.uBodyLambdaMin.value = params.bodyLambdaMin;
    u.uBodyLambdaMax.value = params.bodyLambdaMax;
    u.uSaturation.value = params.saturation;
    u.uExposure.value = params.exposure;
  }
}
