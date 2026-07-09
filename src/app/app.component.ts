import { Component } from '@angular/core';
import { HeroComponent } from './features/hero/hero.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [HeroComponent],
  templateUrl: './app.component.html',
})
export class AppComponent {
  title = 'IMGWORK';
}
