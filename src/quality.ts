/**
 * Quality tiers, per PRD section 6.
 *
 * Each tier is a set of compile-time defines, so the light, order and layer
 * loops all unroll and nothing in the hot path is dynamically bounded.
 */

export type QualityTierName = 'low' | 'medium' | 'high';
export type QualitySetting = QualityTierName | 'auto';

export interface QualityTier {
  /** Upper bound on the layer count, not a replacement for it. */
  maxLayers: number;
  lights: number;
  orders: number;
  maxPixelRatio: number;
}

/**
 * The PRD states these as layer counts of 3, 5 and 8. They are caps here
 * instead, because the authored look is 4 layers and a tier is a performance
 * budget rather than an art direction: a fast machine should render the piece
 * as designed, not add layers nobody asked for.
 */
export const QUALITY_TIERS: Record<QualityTierName, QualityTier> = {
  low: { maxLayers: 3, lights: 1, orders: 2, maxPixelRatio: 1 },
  medium: { maxLayers: 5, lights: 2, orders: 3, maxPixelRatio: 1.5 },
  high: { maxLayers: 8, lights: 3, orders: 3, maxPixelRatio: 2 },
};

const ORDER: QualityTierName[] = ['low', 'medium', 'high'];

/** Frames slower than this mean vsync is being missed. */
const SLOW_FRAME_MS = 20;
const SAMPLE_SECONDS = 2;
const MIN_SAMPLES = 30;

/**
 * Picks a tier by watching frame times.
 *
 * It only ever steps down. Frame time is capped by vsync, so a machine with
 * plenty of headroom reports the same 16.7 ms as one with none, and there is no
 * signal to step up on. The starting guess therefore comes from the platform,
 * and sustained slow frames walk it down from there.
 */
export class QualityProbe {
  private samples: number[] = [];
  private elapsed = 0;
  private current: QualityTierName;
  private settled = false;

  constructor(isMobile: boolean) {
    this.current = isMobile ? 'medium' : 'high';
  }

  /** The tier to render at right now. */
  get tier(): QualityTierName {
    return this.current;
  }

  /** True once probing has stopped, either by settling or by hitting the floor. */
  get isSettled(): boolean {
    return this.settled;
  }

  /** Feed one frame. Returns true when the tier changed. */
  update(dt: number): boolean {
    if (this.settled) return false;

    this.elapsed += dt;
    this.samples.push(dt * 1000);
    if (this.elapsed < SAMPLE_SECONDS || this.samples.length < MIN_SAMPLES) return false;

    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    this.samples = [];
    this.elapsed = 0;

    if (median <= SLOW_FRAME_MS) {
      this.settled = true;
      return false;
    }

    const index = ORDER.indexOf(this.current);
    if (index <= 0) {
      this.settled = true;   // already at the floor, nothing left to give up
      return false;
    }
    this.current = ORDER[index - 1];
    return true;
  }

  /** Stops probing, for when the user picks a tier by hand. */
  freeze(tier: QualityTierName): void {
    this.current = tier;
    this.settled = true;
  }
}
