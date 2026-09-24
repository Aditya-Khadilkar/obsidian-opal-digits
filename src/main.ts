import * as THREE from 'three';
import { ObsidianDigitsMaterial } from './material/ObsidianDigitsMaterial';
import { PostChain } from './post/composer';
import { TiltSource } from './input/TiltSource';
import { StartOverlay } from './ui/startOverlay';
import { TiltDebugPanel } from './ui/tiltDebug';
import { createGui } from './ui/gui';
import { FrameStats } from './ui/stats';
import { DEFAULT_PARAMS, type Params } from './params';
import { QUALITY_TIERS, QualityProbe } from './quality';

const SLAB = { width: 2.6, height: 1.9, depth: 0.42 };
const VIEWPORT_FILL = 0.8; // slab covers this fraction of the viewport

const query = new URLSearchParams(location.search);
/** Fixed tilt for deterministic screenshots, e.g. ?tilt=-0.6,0.3 */
const fixedTilt = parseTilt(query.get('tilt'));
const hideGui = query.has('nogui');
/** ?debugTilt=1 shows the live sensor readout; see PRD section 8. */
const showTiltDebug = query.has('debugTilt');

function parseTilt(raw: string | null): THREE.Vector2 | null {
  if (!raw) return null;
  const [x, y] = raw.split(',').map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return new THREE.Vector2(
    THREE.MathUtils.clamp(x, -1, 1),
    THREE.MathUtils.clamp(y, -1, 1),
  );
}

/**
 * Parameter overrides for screenshots and quick inspection, e.g.
 * ?set=gridScale:6,density:1,ghostIntensity:0.4
 */
function applyOverrides(target: Params, raw: string | null): void {
  if (!raw) return;
  const bag = target as unknown as Record<string, unknown>;
  for (const pair of raw.split(',')) {
    const [key, value] = pair.split(':');
    if (!key || value === undefined || !(key in bag)) continue;
    const current = bag[key];
    if (typeof current === 'number') {
      const n = Number(value);
      if (Number.isFinite(n)) bag[key] = n;
    } else if (typeof current === 'boolean') {
      bag[key] = value === 'true' || value === '1';
    } else {
      bag[key] = value;
    }
  }
}

const app = document.getElementById('app') as HTMLElement;

const params: Params = { ...DEFAULT_PARAMS };
applyOverrides(params, query.get('set'));
// Exposed so the test harness can drive presets without a GUI.
(window as unknown as { __params: Params }).__params = params;

const renderer = new THREE.WebGLRenderer({
  antialias: false, // the digit SDFs are analytically anti-aliased
  powerPreference: 'high-performance',
});
renderer.setClearColor(0x000000, 1);
// The material writes linear HDR; the post chain owns tone mapping and the
// output transform, so bloom sees the real highlight values first.
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const isMobile = matchMedia('(hover: none) and (pointer: coarse)').matches;
// Platform cap from PRD section 6; the quality tier can lower it further.
const platformDpr = isMobile ? 1.5 : 2;
const quality = new QualityProbe(isMobile);

function activeTier() {
  return params.quality === 'auto' ? quality.tier : params.quality;
}

function currentPixelRatio(): number {
  return Math.min(devicePixelRatio, platformDpr, QUALITY_TIERS[activeTier()].maxPixelRatio);
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(params.cameraFov, 1, 0.1, 100);

const material = new ObsidianDigitsMaterial();
const slab = new THREE.Mesh(
  new THREE.BoxGeometry(SLAB.width, SLAB.height, SLAB.depth),
  material,
);
scene.add(slab);

const post = new PostChain(renderer, scene, camera);

const tiltSource = new TiltSource(renderer.domElement, params);
const stats = new FrameStats(app);
const tiltDebug = showTiltDebug ? new TiltDebugPanel(app, tiltSource) : null;

// Skipped when the tilt is pinned for a screenshot, since there is no gesture to
// offer and nothing for the sensor to drive.
if (!fixedTilt) {
  new StartOverlay(app, tiltSource, () => {});
}
const pane = hideGui
  ? null
  : createGui(params, {
      onRecalibrate: () => tiltSource.recalibrate(),
      onCameraChange: () => resize(),
    });
if (hideGui) document.body.classList.add('nogui');

function resize(): void {
  // The element can measure zero while the page is hidden or still laying out.
  // Sizing the renderer to zero throws away the drawing buffer, so hold the
  // last good size until real dimensions arrive.
  const width = app.clientWidth;
  const height = app.clientHeight;
  if (width === 0 || height === 0) return;

  renderer.setPixelRatio(currentPixelRatio());
  renderer.setSize(width, height, false);

  camera.aspect = width / height;
  camera.fov = params.cameraFov;
  // Pull the camera back until the slab covers VIEWPORT_FILL on both axes.
  const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
  const distForHeight = SLAB.height / VIEWPORT_FILL / (2 * Math.tan(halfFov));
  const distForWidth = SLAB.width / VIEWPORT_FILL / (2 * Math.tan(halfFov) * camera.aspect);
  camera.position.set(0, 0, Math.max(distForHeight, distForWidth) + SLAB.depth);
  camera.updateProjectionMatrix();

  post.setSize(width, height, currentPixelRatio());
}
addEventListener('resize', resize);
// Catches the case where the element gains size without a window resize, e.g.
// an embedding panel being revealed.
new ResizeObserver(resize).observe(app);
resize();

const clock = new THREE.Clock();
const tilt = new THREE.Vector2();
const lightQuat = new THREE.Quaternion();
const lightEuler = new THREE.Euler();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const time = clock.getElapsedTime();

  if (fixedTilt) {
    tilt.copy(fixedTilt);
  } else {
    tiltSource.update(dt);
    tilt.copy(tiltSource.tilt);
  }

  // The camera never moves. The slab turns under lights that are fixed in world
  // space, which is what sweeps the hue.
  const r = THREE.MathUtils.degToRad(params.slabRotationDeg);
  slab.rotation.set(-tilt.y * r, tilt.x * r, 0);

  // Flashlight mode: turn the lights instead of, or as well as, the slab.
  let lightRotation: THREE.Quaternion | undefined;
  if (params.lightRotationDeg > 0) {
    const lr = THREE.MathUtils.degToRad(params.lightRotationDeg);
    lightEuler.set(tilt.y * lr, -tilt.x * lr, 0);
    lightQuat.setFromEuler(lightEuler);
    lightRotation = lightQuat;
  }

  if (params.quality === 'auto' && quality.update(dt)) resize();
  material.sync(params, time, tilt, activeTier(), lightRotation);
  post.sync(params, time);
  post.render();

  tiltDebug?.update();
  stats.tick(dt);
  stats.setNote(`${activeTier()} · ${fixedTilt ? 'fixed tilt' : tiltSource.getStatus()}`);
});

// Signals to the screenshot harness that the first frame has been drawn.
requestAnimationFrame(() => document.body.dataset.ready = '1');

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    renderer.setAnimationLoop(null);
    tiltSource.dispose();
    tiltDebug?.dispose();
    post.dispose();
    pane?.dispose();
    renderer.dispose();
  });
}
