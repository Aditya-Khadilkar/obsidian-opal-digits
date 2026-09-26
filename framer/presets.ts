// Ported unchanged from src/presets.ts.

import { DEFAULT_PARAMS, type Params } from "./params"

export type PresetName = "Reference" | "Opal" | "Deep Obsidian"

/**
 * The three presets from PRD section 5.8, as overrides on the defaults.
 *
 * Reference is the defaults themselves, which were fitted to measurements of
 * the photograph rather than chosen by eye; see reference/MEASUREMENTS.md.
 */
export const PRESETS: Record<PresetName, Partial<Params>> = {
  Reference: {},

  // Wider blaze and a longer pitch spread, so more of the spectrum reaches the
  // eye at once and cells disagree more. Less absorption keeps the deep layers
  // in play, which is where the play-of-colour comes from.
  Opal: {
    blazeCentre: 512,
    blazeWidth: 135,
    blazeJitter: 120,
    blazeFloor: 0.12,
    pitchMin: 620,
    pitchMax: 1680,
    saturation: 0.82,
    absorptionSigma: 0.9,
    absorptionTintR: 1.5,
    absorptionTintB: 0.7,
    deepDim: 0.85,
    deepDensity: 0.62,
    bodyIntensity: 0.06,
    fillIntensity: 0.03,
    toneExposure: 1.15,
    bloomStrength: 0.55,
    bloomThreshold: 0.8,
  },

  // Heavier glass: strong absorption, sparse deep layers, and a surface that
  // does more of the talking.
  "Deep Obsidian": {
    absorptionSigma: 6.5,
    absorptionTintR: 2.6,
    absorptionTintB: 0.75,
    deepDim: 0.4,
    deepDensity: 0.3,
    layerSpacing: 0.24,
    saturation: 0.5,
    envStrength: 0.85,
    envBoxIntensity: 3.0,
    surfaceWaviness: 0.16,
    wavinessScale: 0.8,
    mediumColor: "#030405",
    toneExposure: 0.92,
    bloomStrength: 0.22,
    bloomThreshold: 1.1,
    grainAmount: 0.022,
  },
}

/** Applies a preset in place, resetting anything it does not mention. */
export function applyPreset(target: Params, name: PresetName): void {
  Object.assign(target, DEFAULT_PARAMS, PRESETS[name])
}
