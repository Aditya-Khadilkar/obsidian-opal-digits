import { TiltSource, type TiltStatus } from '../input/TiltSource';

/**
 * The tap-to-explore gate from PRD 5.10.2.
 *
 * It exists because iOS will only grant the orientation sensor from inside a
 * real user gesture, so the button is required rather than optional. Every
 * outcome, including a refusal, leaves pointer and drag input working.
 */
export class StartOverlay {
  private readonly root: HTMLElement | null = null;

  constructor(
    parent: HTMLElement,
    private readonly tiltSource: TiltSource,
    private readonly onResolved: (status: TiltStatus) => void,
  ) {
    if (!StartOverlay.shouldPrompt()) {
      // Desktop: no sensor worth asking about, so go straight to the material.
      queueMicrotask(() => onResolved('pointer'));
      return;
    }

    this.root = document.createElement('div');
    this.root.className = 'start-overlay';
    this.root.innerHTML = `
      <button type="button" class="start-button">Tap to explore</button>
      <p class="start-hint">or drag to tilt</p>
    `;
    parent.appendChild(this.root);

    const button = this.root.querySelector('.start-button') as HTMLButtonElement;
    button.addEventListener('click', () => {
      // enableGyro must be reached synchronously from here, or iOS treats the
      // permission request as having no user gesture behind it.
      button.disabled = true;
      void this.tiltSource.enableGyro().then((status) => this.finish(status));
    });
  }

  /**
   * Only prompt where a sensor is plausible: iOS exposes the permission gate,
   * and other touch devices report a coarse pointer. A desktop browser exposes
   * DeviceOrientationEvent and never fires it, so prompting there is noise.
   */
  static shouldPrompt(): boolean {
    if (!TiltSource.isPotentiallySupported()) return false;
    if (TiltSource.needsPermissionGesture()) return true;
    return matchMedia('(pointer: coarse)').matches;
  }

  private finish(status: TiltStatus): void {
    if (this.root) {
      this.root.classList.add('is-hidden');
      setTimeout(() => this.root?.remove(), 400);
    }
    if (status === 'denied') {
      // Refusal is a valid choice, not an error. Say what still works.
      showToast('Tilt unavailable — drag instead');
    }
    this.onResolved(status);
  }
}

function showToast(text: string): void {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-visible'));
  setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 400);
  }, 3600);
}
