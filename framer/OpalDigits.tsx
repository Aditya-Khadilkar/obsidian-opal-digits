// The Framer code component. This is the file Framer will list as a
// draggable component (it has a default-exported function component and
// calls addPropertyControls). Everything else in this folder is a plain
// helper module it imports.
//
// See README.md in this folder for how to bring the whole folder into a
// Framer project, and for the tradeoffs of embedding a raw Three.js scene in
// a Framer canvas.

import { useEffect, useRef, useState } from "react"
import * as THREE from "three@0.169.0"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

import { DEFAULT_PARAMS, type Params, type TiltSourceName } from "./params"
import { applyPreset, type PresetName } from "./presets"
import { QUALITY_TIERS, QualityProbe, type QualitySetting } from "./quality"
import { ObsidianDigitsMaterial } from "./ObsidianDigitsMaterial"
import { PostChain } from "./PostChain"
import { TiltSource } from "./TiltSource"

/**
 * The slab takes its proportions from the container rather than being a
 * fixed landscape block, so it fills a portrait Framer frame as well as a
 * landscape one. Surface area is held constant as the aspect changes, so the
 * number of cells on screen stays in the same range either way.
 */
const SLAB_AREA = 2.6 * 1.9
const SLAB_DEPTH = 0.42
const SLAB_MIN_ASPECT = 0.42
const SLAB_MAX_ASPECT = 2.4

interface OpalDigitsProps {
  preset: PresetName
  quality: QualitySetting
  tiltSource: TiltSourceName
  cameraFov: number
  viewportFill: number
  slabRotationDeg: number
  bloomStrength: number
  toneExposure: number
  grainAmount: number
  mediumColor: string
}

function buildParams(props: OpalDigitsProps): Params {
  const params: Params = { ...DEFAULT_PARAMS }
  applyPreset(params, props.preset)
  params.quality = props.quality
  params.tiltSource = props.tiltSource
  params.cameraFov = props.cameraFov
  params.viewportFill = props.viewportFill
  params.slabRotationDeg = props.slabRotationDeg
  params.bloomStrength = props.bloomStrength
  params.toneExposure = props.toneExposure
  params.grainAmount = props.grainAmount
  params.mediumColor = props.mediumColor
  return params
}

/** Mirrors StartOverlay.shouldPrompt from the original app: only prompt where
 * a sensor is plausible, so a desktop browser that exposes the orientation
 * API but never fires it does not get an unnecessary button. */
function shouldPromptForGyro(): boolean {
  if (!TiltSource.isPotentiallySupported()) return false
  if (TiltSource.needsPermissionGesture()) return true
  return matchMedia("(pointer: coarse)").matches
}

/**
 * The Obsidian Opal Digits material, rendered into a Three.js canvas sized to
 * fill this component's frame. Drag/hover always works; on a touch device
 * that gates its orientation sensor behind a permission prompt (iOS) a "tap
 * to explore" button appears first, since the prompt has to be answered from
 * inside a real user gesture.
 */
export default function OpalDigits(props: OpalDigitsProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const tiltSourceRef = useRef<TiltSource | null>(null)
  const paramsRef = useRef<Params>(buildParams(props))
  const [needsGesture, setNeedsGesture] = useState(false)

  // The render loop reads paramsRef every frame, so a prop change is picked
  // up live without tearing down and recreating the WebGL context.
  paramsRef.current = buildParams(props)

  const isCanvas = RenderTarget.current() === RenderTarget.canvas

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new THREE.WebGLRenderer({
      antialias: false, // the digit SDFs are analytically anti-aliased
      powerPreference: "high-performance",
    })
    renderer.setClearColor(0x000000, 1)
    // The material writes linear HDR; the post chain owns tone mapping and
    // the output transform, so bloom sees the real highlight values first.
    renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(renderer.domElement)
    renderer.domElement.style.display = "block"

    const isMobile = matchMedia("(hover: none) and (pointer: coarse)").matches
    const platformDpr = isMobile ? 1.5 : 2
    const quality = new QualityProbe(isMobile)

    function activeTier() {
      const setting = paramsRef.current.quality
      return setting === "auto" ? quality.tier : setting
    }

    function currentPixelRatio(): number {
      return Math.min(devicePixelRatio, platformDpr, QUALITY_TIERS[activeTier()].maxPixelRatio)
    }

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(paramsRef.current.cameraFov, 1, 0.1, 100)

    const material = new ObsidianDigitsMaterial()
    let slabWidth = 2.6
    let slabHeight = 1.9
    const slab = new THREE.Mesh(new THREE.BoxGeometry(slabWidth, slabHeight, SLAB_DEPTH), material)
    scene.add(slab)

    /** Reshapes the slab to the container. Cheap, and only runs on resize. */
    function fitSlabToViewport(aspect: number): void {
      const a = THREE.MathUtils.clamp(aspect, SLAB_MIN_ASPECT, SLAB_MAX_ASPECT)
      const height = Math.sqrt(SLAB_AREA / a)
      const width = height * a
      if (Math.abs(width - slabWidth) < 1e-3 && Math.abs(height - slabHeight) < 1e-3) return

      slabWidth = width
      slabHeight = height
      slab.geometry.dispose()
      slab.geometry = new THREE.BoxGeometry(width, height, SLAB_DEPTH)
    }

    const post = new PostChain(renderer, scene, camera)
    const tiltSource = new TiltSource(renderer.domElement, paramsRef.current)
    tiltSourceRef.current = tiltSource

    if (!isCanvas && shouldPromptForGyro()) {
      setNeedsGesture(true)
    }

    function resize(): void {
      // The element can measure zero while the frame is hidden or still
      // laying out. Sizing the renderer to zero throws away the drawing
      // buffer, so hold the last good size until real dimensions arrive.
      const width = container!.clientWidth
      const height = container!.clientHeight
      if (width === 0 || height === 0) return

      renderer.setPixelRatio(currentPixelRatio())
      renderer.setSize(width, height, false)

      camera.aspect = width / height
      camera.fov = paramsRef.current.cameraFov
      fitSlabToViewport(camera.aspect)

      // Pull the camera back until the slab covers viewportFill on both axes.
      const fill = THREE.MathUtils.clamp(paramsRef.current.viewportFill, 0.3, 1)
      const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2
      const distForHeight = slabHeight / fill / (2 * Math.tan(halfFov))
      const distForWidth = slabWidth / fill / (2 * Math.tan(halfFov) * camera.aspect)
      camera.position.set(0, 0, Math.max(distForHeight, distForWidth) + SLAB_DEPTH)
      camera.updateProjectionMatrix()

      post.setSize(width, height, currentPixelRatio())
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()

    const clock = new THREE.Clock()
    const tilt = new THREE.Vector2()
    const lightQuat = new THREE.Quaternion()
    const lightEuler = new THREE.Euler()

    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.1)
      const time = clock.getElapsedTime()
      const params = paramsRef.current

      tiltSource.update(dt)
      tilt.copy(tiltSource.tilt)

      // The camera never moves. The slab turns under lights that are fixed in
      // world space, which is what sweeps the hue.
      const r = THREE.MathUtils.degToRad(params.slabRotationDeg)
      slab.rotation.set(-tilt.y * r, tilt.x * r, 0)

      let lightRotation: THREE.Quaternion | undefined
      if (params.lightRotationDeg > 0) {
        const lr = THREE.MathUtils.degToRad(params.lightRotationDeg)
        lightEuler.set(tilt.y * lr, -tilt.x * lr, 0)
        lightQuat.setFromEuler(lightEuler)
        lightRotation = lightQuat
      }

      if (params.quality === "auto" && quality.update(dt)) resize()

      material.sync(params, time, tilt, activeTier(), lightRotation)
      post.sync(params, time)
      post.render()
    })

    return () => {
      renderer.setAnimationLoop(null)
      resizeObserver.disconnect()
      tiltSource.dispose()
      tiltSourceRef.current = null
      post.dispose()
      material.dispose()
      slab.geometry.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
    }
    // Deliberately just [isCanvas]: prop changes are picked up through
    // paramsRef on the next animation frame, not by recreating the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCanvas])

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: "#000",
      }}
    >
      {needsGesture && (
        <button
          type="button"
          onClick={() => {
            void tiltSourceRef.current?.enableGyro().then(() => setNeedsGesture(false))
          }}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            padding: "12px 20px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.35)",
            background: "rgba(0,0,0,0.55)",
            color: "#fff",
            font: "500 14px system-ui, sans-serif",
            cursor: "pointer",
          }}
        >
          Tap to explore
        </button>
      )}
    </div>
  )
}

OpalDigits.defaultProps = {
  preset: "Reference",
  quality: "auto",
  tiltSource: "auto",
  cameraFov: DEFAULT_PARAMS.cameraFov,
  viewportFill: DEFAULT_PARAMS.viewportFill,
  slabRotationDeg: DEFAULT_PARAMS.slabRotationDeg,
  bloomStrength: DEFAULT_PARAMS.bloomStrength,
  toneExposure: DEFAULT_PARAMS.toneExposure,
  grainAmount: DEFAULT_PARAMS.grainAmount,
  mediumColor: DEFAULT_PARAMS.mediumColor,
} satisfies OpalDigitsProps

addPropertyControls(OpalDigits, {
  preset: {
    type: ControlType.Enum,
    title: "Preset",
    options: ["Reference", "Opal", "Deep Obsidian"],
    optionTitles: ["Reference", "Opal", "Deep Obsidian"],
    defaultValue: "Reference",
  },
  quality: {
    type: ControlType.Enum,
    title: "Quality",
    options: ["auto", "low", "medium", "high"],
    optionTitles: ["Auto", "Low", "Medium", "High"],
    defaultValue: "auto",
  },
  tiltSource: {
    type: ControlType.Enum,
    title: "Tilt input",
    options: ["auto", "gyro", "pointer", "auto-drift"],
    optionTitles: ["Auto", "Gyro only", "Pointer only", "Idle drift"],
    defaultValue: "auto",
  },
  cameraFov: {
    type: ControlType.Number,
    title: "Camera FOV",
    min: 6,
    max: 45,
    step: 1,
    defaultValue: DEFAULT_PARAMS.cameraFov,
  },
  viewportFill: {
    type: ControlType.Number,
    title: "Fill",
    min: 0.3,
    max: 1,
    step: 0.01,
    defaultValue: DEFAULT_PARAMS.viewportFill,
  },
  slabRotationDeg: {
    type: ControlType.Number,
    title: "Tilt range",
    min: 0,
    max: 45,
    step: 1,
    defaultValue: DEFAULT_PARAMS.slabRotationDeg,
  },
  bloomStrength: {
    type: ControlType.Number,
    title: "Bloom",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: DEFAULT_PARAMS.bloomStrength,
  },
  toneExposure: {
    type: ControlType.Number,
    title: "Exposure",
    min: 0.2,
    max: 3,
    step: 0.01,
    defaultValue: DEFAULT_PARAMS.toneExposure,
  },
  grainAmount: {
    type: ControlType.Number,
    title: "Grain",
    min: 0,
    max: 0.05,
    step: 0.001,
    defaultValue: DEFAULT_PARAMS.grainAmount,
  },
  mediumColor: {
    type: ControlType.Color,
    title: "Glass color",
    defaultValue: DEFAULT_PARAMS.mediumColor,
  },
})
