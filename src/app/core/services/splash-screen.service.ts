import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SplashScreenService {
  readonly active = signal(false);

  show(): void {
    // Reset signal first to restart animation if clicked multiple times
    this.active.set(false);
    requestAnimationFrame(() => {
      this.active.set(true);
    });
  }

  hide(): void {
    this.active.set(false);
  }
}
