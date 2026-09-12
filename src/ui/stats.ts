/** Small frame-time overlay, required by PRD section 8. */
export class FrameStats {
  private readonly el: HTMLElement;
  private frames = 0;
  private accumulated = 0;
  private extra = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'stats';
    this.el.textContent = '--';
    parent.appendChild(this.el);
  }

  /** Extra text appended to the readout, e.g. the current tilt source. */
  setNote(text: string): void {
    this.extra = text;
  }

  tick(dt: number): void {
    this.frames++;
    this.accumulated += dt;
    if (this.accumulated < 0.5) return;
    const ms = (this.accumulated / this.frames) * 1000;
    const fps = this.frames / this.accumulated;
    this.el.textContent = `${ms.toFixed(2)} ms · ${fps.toFixed(0)} fps${this.extra ? ` · ${this.extra}` : ''}`;
    this.frames = 0;
    this.accumulated = 0;
  }
}
