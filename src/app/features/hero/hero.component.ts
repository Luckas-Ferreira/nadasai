import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslationService } from '../../core/services/translation.service';
import { ImageStateService } from '../../core/services/image-state.service';

@Component({
  selector: 'app-hero',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './hero.component.html',
})
export class HeroComponent {
  public i18n = inject(TranslationService);
  public imageState = inject(ImageStateService);

  clearImage() {
    this.imageState.clear();
  }
}
