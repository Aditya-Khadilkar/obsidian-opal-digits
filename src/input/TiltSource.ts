import * as THREE from 'three';
import type { Params } from '../params';

export type TiltStatus =
  | 'idle'        // waiting for the tap-to-explore gesture
  | 'drift'       // no recent input, running the idle Lissajous path
  | 'pointer'     // mouse position or touch drag
  | 'gyro'        // device orientation
  | 'denied'      // permission refused, pointer takes over
  | 'unsupported'; // no sensor, pointer takes over

const IDLE_SECONDS = 4;
const DRIFT_HZ = 0.1;
const DRIFT_AMPLITUDE = 0.4;

/**
 * Owns every input path and exposes one smoothed tilt vector in -1..1. Nothing
 * else in the app touches raw pointer or sensor events. See PRD 5.10.
 *
 * Phase 0 wires pointer, touch drag and the auto-drift idle state. The gyro
 * path lands in phase 1.
 */
export class TiltSource {
  /** Smoothed tilt, -1..1 on both axes. Read this in the render loop. */
  readonly tilt = new THREE.Vector2();

  private readonly target = new THREE.Vector2();
  private readonly dragStart = new THREE.Vector2();
  private readonly dragBase = new THREE.Vector2();
  private status: TiltStatus = 'drift';
  private lastInputAt = -Infinity;
  private elapsed = 0;
  private dragging = false;
  private readonly detach: Array<() => void> = [];

  constructor(
    private readonly element: HTMLElement,
    private readonly params: Params,
  ) {
    this.listen('pointerdown', (e) => this.onPointerDown(e as PointerEvent));
    this.listen('pointermove', (e) => this.onPointerMove(e as PointerEvent));
    this.listen('pointerup', () => { this.dragging = false; });
    this.listen('pointercancel', () => { this.dragging = false; });
    this.listen('pointerleave', () => { this.dragging = false; });
  }

  private listen(type: string, handler: (e: Event) => void): void {
    this.element.addEventListener(type, handler, { passive: true });
    this.detach.push(() => this.element.removeEventListener(type, handler));
  }

  private onPointerDown(e: PointerEvent): void {
    this.dragging = true;
    this.dragStart.set(e.clientX, e.clientY);
    this.dragBase.copy(this.target);
    this.noteInput();
  }

  private onPointerMove(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && !this.dragging) {
      // Absolute pointer position on desktop: hovering is enough to explore.
      const rect = this.element.getBoundingClientRect();
      this.setTarget(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -(((e.clientY - rect.top) / rect.height) * 2 - 1),
      );
      this.noteInput();
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
    this.noteInput();
  }

  private setTarget(x: number, y: number): void {
    this.target.set(
      THREE.MathUtils.clamp(this.params.invertX ? -x : x, -1, 1),
      THREE.MathUtils.clamp(this.params.invertY ? -y : y, -1, 1),
    );
  }

  private noteInput(): void {
    this.lastInputAt = this.elapsed;
    if (this.status !== 'gyro') this.status = 'pointer';
  }

  /** Advance smoothing and the idle drift. Call once per frame. */
  update(dt: number): void {
    this.elapsed += dt;

    const forced = this.params.tiltSource;
    const idle = this.elapsed - this.lastInputAt > IDLE_SECONDS;
    const drifting =
      forced === 'auto-drift' || (forced !== 'pointer' && this.status !== 'gyro' && idle);

    if (drifting) {
      // Slow Lissajous path so the material is alive in a passive glance.
      const t = this.elapsed * DRIFT_HZ * Math.PI * 2;
      this.target.set(
        Math.sin(t) * DRIFT_AMPLITUDE,
        Math.sin(t * 0.73 + 1.1) * DRIFT_AMPLITUDE,
      );
      if (this.status === 'pointer' || this.status === 'drift') this.status = 'drift';
    }

    // Spring applied per frame, not per event, since event and frame rates differ.
    const k = 1 - Math.pow(1 - THREE.MathUtils.clamp(this.params.springStiffness, 0.001, 1), dt * 60);
    this.tilt.lerp(this.target, k);
  }

  /** Re-centres the neutral pose. Gyro recalibration arrives in phase 1. */
  recalibrate(): void {
    this.target.set(0, 0);
  }

  getStatus(): TiltStatus {
    return this.status;
  }

  dispose(): void {
    for (const off of this.detach) off();
    this.detach.length = 0;
  }
}
