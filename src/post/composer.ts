import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { Params, ToneMappingName } from '../params';

const TONE_MAPPING: Record<ToneMappingName, THREE.ToneMapping> = {
  none: THREE.NoToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
};

/**
 * Film grain, applied after the output transform so the amount means what it
 * says in display terms. A percent or two keeps large dark areas from banding,
 * which black glass is otherwise prone to.
 */
const GrainShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uAmount: { value: 0.015 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uAmount;
    uniform float uTime;
    varying vec2 vUv;

    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (uAmount > 0.0) {
        float n = fract(sin(dot(vUv * 1024.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453);
        c.rgb += (n - 0.5) * uAmount;
      }
      gl_FragColor = c;
    }
  `,
};

/**
 * Render path for phase 3. The material writes linear HDR, bloom runs on those
 * values so only genuinely bright spectral hits glow, and the output pass
 * applies tone mapping and the sRGB encode at the very end.
 */
export class PostChain {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly grain: ShaderPass;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    // Half float, so highlights can exceed 1 and bloom has something to find.
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      colorSpace: THREE.LinearSRGBColorSpace,
      samples: 0,
    });
    this.composer = new EffectComposer(renderer, target);

    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.35, 0.5, 0.9);
    this.composer.addPass(this.bloom);

    this.composer.addPass(new OutputPass());

    this.grain = new ShaderPass(GrainShader);
    this.composer.addPass(this.grain);
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  sync(params: Params, time: number): void {
    this.bloom.enabled = params.bloomStrength > 0;
    this.bloom.strength = params.bloomStrength;
    this.bloom.radius = params.bloomRadius;
    this.bloom.threshold = params.bloomThreshold;

    this.renderer.toneMapping = TONE_MAPPING[params.toneMapping];
    this.renderer.toneMappingExposure = params.toneExposure;

    this.grain.enabled = params.grainAmount > 0;
    this.grain.uniforms.uAmount.value = params.grainAmount;
    this.grain.uniforms.uTime.value = time;
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
  }
}
