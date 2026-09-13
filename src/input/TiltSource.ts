import * as THREE from 'three';
import type { Params } from '../params';

export type TiltStatus =
  | 'idle'         // waiting for the tap-to-explore gesture
  | 'drift'        // no recent input, running the idle Lissajous path
  | 'pointer'      // mouse position or touch drag
  | 'gyro'         // device orientation
  | 'denied'       // permission refused, pointer takes over
  | 'unsupported'; // no sensor, or it never fired, pointer takes over

interface Pose {
  beta: number;
  gamma: number;
}

/** Everything ?debugTilt=1 shows. Nothing here is used for rendering. */
export interface TiltDebugInfo {
  status: TiltStatus;
  raw: Pose | null;
  screen: Pose | null;
  base: Pose | null;
  screenAngleDeg: number;
  events: number;
  gimbalHeld: boolean;
  target: THREE.Vector2;
  tilt: THREE.Vector2;
}

/** iOS 13+ adds a permission gate that is not in the standard lib types. */
type OrientationCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
};

const IDLE_SECONDS = 4;
const DRIFT_HZ = 0.1;
const DRIFT_AMPLITUDE = 0.4;
const FIRST_EVENT_TIMEOUT_MS = 1000;
const GIMBAL_LIMIT_DEG = 80;
const DOUBLE_TAP_MS = 350;

/**
 * Owns every input path and exposes one smoothed tilt vector in -1..1. Nothing
 * else in the app touches a raw pointer or sensor event. See PRD 5.10.
 *
 * Pointer and touch drag are wired up in every state, including after a denied
 * or missing sensor, so the material is always explorable.
 */
export class TiltSource {
  /** Smoothed tilt, -1..1 on both axes. Read this in the render loop. */
  readonly tilt = new THREE.Vector2();

  private readonly target = new THREE.Vector2();
  private readonly dragStart = new THREE.Vector2();
  private readonly dragBase = new THREE.Vector2();
  private status: TiltStatus = 'idle';
  private lastInputAt = -Infinity;
  private elapsed = 0;
  private dragging = false;
  private lastTapAt = -Infinity;

  // Device orientation state.
  private base: Pose | null = null;
  private raw: Pose | null = null;
  private screenPose: Pose | null = null;
  private events = 0;
  private gimbalHeld = false;
  private listeningToSensor = false;

  private readonly detach: Array<() => void> = [];

  constructor(
    private readonly element: HTMLElement,
    private readonly params: Params,
  ) {
    this.on(element, 'pointerdown', (e) => this.onPointerDown(e as PointerEvent));
    this.on(element, 'pointermove', (e) => this.onPointerMove(e as PointerEvent));
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
      this.on(element, type, () => { this.dragging = false; });
    }

    // Screen rotation invalidates both the axis remap and the neutral pose.
    this.on(window, 'orientationchange', () => this.recalibrate());
    if (screen.orientation) {
      this.on(screen.orientation, 'change', () => this.recalibrate());
    }
  }

  private on(target: EventTarget, type: string, handler: (e: Event) => void): void {
    target.addEventListener(type, handler, { passive: true });
    this.detach.push(() => target.removeEventListener(type, handler));
  }

  // ---------------------------------------------------------------- pointer

  private onPointerDown(e: PointerEvent): void {
    const now = performance.now();
    if (now - this.lastTapAt < DOUBLE_TAP_MS) this.recalibrate();
    this.lastTapAt = now;

    this.dragging = true;
    this.dragStart.set(e.clientX, e.clientY);
    this.dragBase.copy(this.target);
    this.notePointer();
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.params.tiltSource === 'gyro' && this.status === 'gyro') return;

    if (e.pointerType === 'mouse' && !this.dragging) {
      // Absolute pointer position on desktop: hovering is enough to explore.
      const rect = this.element.getBoundingClientRect();
      this.setTarget(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -(((e.clientY - rect.top) / rect.height) * 2 - 1),
      );
      this.notePointer();
      return;
    }
    if (!this.dragging) return;

    // Touch and pen drag relative to where the gesture started, scaled so a
    // swipe across a third of the viewport covers the full range.
    const span = Math.min(this.element.clientWidth, this.element.clientHeight) / 3;
    this.setTarget(
      this.dragBase.x + (e.clientX - this.dragStart.x) / span,
      this.dragBase.y - (e.clientY - this.dragStart.y) / span,
    );
    this.notePointer();
  }

  private notePointer(): void {
    this.lastInputAt = this.elapsed;
    // A drag always wins, even while the gyro is running, so a user who does
    // not want to wave their phone about can still explore the material.
    this.status = 'pointer';
  }

  // ------------------------------------------------------------------- gyro

  /** True when the platform might deliver orientation events at all. */
  static isPotentiallySupported(): boolean {
    return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  }

  /**
   * True when a user gesture is needed before the sensor will report. iOS 13+
   * gates the sensor behind an explicit prompt; Android does not.
   */
  static needsPermissionGesture(): boolean {
    const ctor = (window as { DeviceOrientationEvent?: OrientationCtor }).DeviceOrientationEvent;
    return typeof ctor?.requestPermission === 'function';
  }

  /**
   * Ask for the sensor and start listening. MUST be called synchronously from
   * inside a real user gesture handler: iOS rejects requestPermission otherwise,
   * which is why the tap-to-start button is required rather than optional.
   *
   * Resolves to the status the app ended up in. Never throws, and never leaves
   * the page in a state where the material cannot be explored.
   */
  async enableGyro(): Promise<TiltStatus> {
    const ctor = (window as { DeviceOrientationEvent?: OrientationCtor }).DeviceOrientationEvent;
    if (!ctor) {
      this.status = 'unsupported';
      return this.status;
    }

    if (typeof ctor.requestPermission === 'function') {
      // No await before this call, or the gesture will no longer be active.
      try {
        const result = await ctor.requestPermission();
        if (result !== 'granted') {
          this.status = 'denied';
          return this.status;
        }
      } catch {
        this.status = 'denied';
        return this.status;
      }
    }

    this.startListening();

    // Some desktops expose the API and never fire it, so a granted permission
    // is not proof of a sensor. Wait for evidence before trusting it.
    await new Promise((resolve) => setTimeout(resolve, FIRST_EVENT_TIMEOUT_MS));
    if (this.events === 0) {
      this.stopListening();
      this.status = 'unsupported';
      return this.status;
    }

    this.status = 'gyro';
    return this.status;
  }

  private startListening(): void {
    if (this.listeningToSensor) return;
    window.addEventListener('deviceorientation', this.onOrientation, { passive: true });
    this.listeningToSensor = true;
  }

  private stopListening(): void {
    if (!this.listeningToSensor) return;
    window.removeEventListener('deviceorientation', this.onOrientation);
    this.listeningToSensor = false;
  }

  /** Screen rotation in radians, measured clockwise from the natural pose. */
  private screenAngle(): number {
    const legacy = (window as { orientation?: number }).orientation;
    const deg = screen.orientation?.angle ?? legacy ?? 0;
    return THREE.MathUtils.degToRad(deg);
  }

  private deadzone(v: number): number {
    const d = Math.max(this.params.deadzoneDeg, 0);
    if (Math.abs(v) <= d) return 0;
    return v - Math.sign(v) * d;
  }

  private readonly onOrientation = (e: Event): void => {
    const event = e as DeviceOrientationEvent;
    if (event.beta === null || event.gamma === null) return;
    if (this.params.tiltSource === 'pointer' || this.params.tiltSource === 'auto-drift') return;

    this.events++;
    this.raw = { beta: event.beta, gamma: event.gamma };

    // Rotate the device axes into screen axes. One rotation handles all four
    // orientations: at 90 degrees it swaps the pair and negates one, at 180 it
    // negates both, which is what the PRD describes case by case.
    const angle = this.screenAngle();
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const beta = event.beta * cos + event.gamma * sin;   // front to back
    const gamma = event.gamma * cos - event.beta * sin;  // left to right
    this.screenPose = { beta, gamma };

    // Gimbal guard. Near vertical these Euler angles are ill-conditioned and
    // gamma flips sign past +-90, so hold the last good value rather than
    // tracking through a violent flip.
    if (Math.abs(beta) > GIMBAL_LIMIT_DEG) {
      this.gimbalHeld = true;
      return;
    }
    this.gimbalHeld = false;

    // Neutral pose: people hold phones 30 to 60 degrees off flat, so whatever
    // pose the first event reports becomes zero.
    if (!this.base) this.base = { beta, gamma };

    // Slow baseline drift, so the effect re-centres when posture changes
    // without feeling like it is fighting the user.
    const rate = THREE.MathUtils.clamp(this.params.recenterRate, 0, 1);
    this.base.beta += (beta - this.base.beta) * rate;
    this.base.gamma += (gamma - this.base.gamma) * rate;

    const range = Math.max(this.params.tiltRangeDeg, 1);
    // Tipping the right edge down turns the slab's right edge away; tipping the
    // top away tips the slab's top away, so beta is negated.
    this.setTarget(
      this.deadzone(gamma - this.base.gamma) / range,
      -this.deadzone(beta - this.base.beta) / range,
    );
    this.lastInputAt = this.elapsed;
    this.status = 'gyro';
  };

  // ------------------------------------------------------------------ frame

  private setTarget(x: number, y: number): void {
    this.target.set(
      THREE.MathUtils.clamp(this.params.invertX ? -x : x, -1, 1),
      THREE.MathUtils.clamp(this.params.invertY ? -y : y, -1, 1),
    );
  }

  /** Advance smoothing and the idle drift. Call once per frame. */
  update(dt: number): void {
    this.elapsed += dt;

    const forced = this.params.tiltSource;
    const idle = this.elapsed - this.lastInputAt > IDLE_SECONDS;
    const live = this.status === 'gyro' && !idle;

    if (forced === 'auto-drift' || (!live && idle)) {
      // Slow Lissajous path so the material is alive in a passive glance or a
      // screenshot. Any real input resets lastInputAt and cancels it at once.
      const t = this.elapsed * DRIFT_HZ * Math.PI * 2;
      this.target.set(
        Math.sin(t) * DRIFT_AMPLITUDE,
        Math.sin(t * 0.73 + 1.1) * DRIFT_AMPLITUDE,
      );
      if (this.status !== 'denied' && this.status !== 'unsupported') this.status = 'drift';
    }

    // Spring applied per frame, not per event, since event and frame rates
    // differ and a per-event spring would change speed with the sensor rate.
    const k = 1 - Math.pow(
      1 - THREE.MathUtils.clamp(this.params.springStiffness, 0.001, 1),
      dt * 60,
    );
    this.tilt.lerp(this.target, k);
  }

  /** Re-capture the neutral pose. Bound to the GUI button and a double tap. */
  recalibrate(): void {
    this.base = null;
    this.target.set(0, 0);
  }

  getStatus(): TiltStatus {
    return this.status;
  }

  getDebugInfo(): TiltDebugInfo {
    return {
      status: this.status,
      raw: this.raw,
      screen: this.screenPose,
      base: this.base,
      screenAngleDeg: THREE.MathUtils.radToDeg(this.screenAngle()),
      events: this.events,
      gimbalHeld: this.gimbalHeld,
      target: this.target,
      tilt: this.tilt,
    };
  }

  dispose(): void {
    this.stopListening();
    for (const off of this.detach) off();
    this.detach.length = 0;
  }
}
