import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { RouterLink } from '@angular/router';
import { toMessageKey } from '../../core/errors';
import { ImageStateService } from '../../core/services/image-state.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { TOOLS } from '../../core/tools/tools';
import { AlertComponent } from '../../shared/ui/alert.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';

@Component({
  selector: 'app-hero',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DropzoneComponent, IconComponent, AlertComponent],
  templateUrl: './hero.component.html',
})
export class HeroComponent {
  private readonly router = inject(Router);

  protected readonly state = inject(ImageStateService);
  protected readonly i18n = inject(TranslationService);
  protected readonly tools = TOOLS;

  protected readonly errorKey = signal<TranslationKey | null>(null);

  /** The home page had no uploader at all: you had to pick a tool before you could load anything. */
  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.state.load(file);
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  protected go(path: string): void {
    this.router.navigate(['/', path]);
  }
}
