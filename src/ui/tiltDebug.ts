import type { TiltSource } from '../input/TiltSource';

/**
 * The ?debugTilt=1 readout from PRD section 8. Gyro behaviour cannot be checked
 * headlessly, so this puts the raw angles, the captured neutral pose and the
 * resulting tilt on screen where an on-device check takes seconds.
 */
export class TiltDebugPanel {
  private readonly el: HTMLElement;

  constructor(parent: HTMLElement, private readonly source: TiltSource) {
    this.el = document.createElement('div');
    this.el.className = 'tilt-debug';
    parent.appendChild(this.el);
  }

  update(): void {
    const d = this.source.getDebugInfo();
    const pose = (p: { beta: number; gamma: number } | null) =>
      p ? `β ${p.beta.toFixed(1).padStart(6)}  γ ${p.gamma.toFixed(1).padStart(6)}` : '—';
    this.el.textContent = [
      `status    ${d.status}${d.gimbalHeld ? '  (gimbal held)' : ''}`,
      `events    ${d.events}`,
      `screen    ${d.screenAngleDeg.toFixed(0)}°`,
      `raw       ${pose(d.raw)}`,
      `screen-sp ${pose(d.screen)}`,
      `neutral   ${pose(d.base)}`,
      `target    x ${d.target.x.toFixed(3).padStart(6)}  y ${d.target.y.toFixed(3).padStart(6)}`,
      `tilt      x ${d.tilt.x.toFixed(3).padStart(6)}  y ${d.tilt.y.toFixed(3).padStart(6)}`,
    ].join('\n');
  }

  dispose(): void {
    this.el.remove();
  }
}
