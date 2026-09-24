/**
 * Fullscreen toggle.
 *
 * Only rendered where the browser can actually do it. iPhone Safari does not
 * implement the Fullscreen API for ordinary elements, only for video, so the
 * button would sit there doing nothing; there, Add to Home Screen gives a
 * chromeless view instead, which the meta tags in index.html enable.
 */
export class FullscreenToggle {
  private readonly button: HTMLButtonElement | null = null;

  constructor(parent: HTMLElement) {
    if (!document.fullscreenEnabled) return;

    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'fullscreen-toggle';
    this.button.title = 'Fullscreen';
    this.button.setAttribute('aria-label', 'Toggle fullscreen');
    this.button.textContent = '⤢';
    parent.appendChild(this.button);

    this.button.addEventListener('click', () => {
      void (document.fullscreenElement
        ? document.exitFullscreen()
        : document.documentElement.requestFullscreen()
      ).catch(() => {
        // A refusal is not worth interrupting anyone over.
      });
    });

    document.addEventListener('fullscreenchange', () => this.syncLabel());
    this.syncLabel();
  }

  private syncLabel(): void {
    if (!this.button) return;
    const on = document.fullscreenElement !== null;
    this.button.textContent = on ? '⤡' : '⤢';
    this.button.title = on ? 'Exit fullscreen' : 'Fullscreen';
  }

  dispose(): void {
    this.button?.remove();
  }
}
