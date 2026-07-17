import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  ViewEncapsulation,
  signal,
} from '@angular/core';

/**
 * Controla se o splash já foi exibido nesta carga de página.
 * Variável de módulo: zera em todo reload (F5), mas sobrevive à
 * navegação Angular (sem reload), evitando re-exibição entre rotas.
 */
let splashShown = false;

/**
 * Splash screen exibida uma única vez por carregamento de página.
 *
 * Sequência:
 *   0 – 400ms   → corpo do cartão teal aparece (scale-in com bounce)
 *   150 – 900ms → setas brancas surgem e giram 360° sobre o teal
 *   750 – 1200ms→ círculo aro aparece completando a logo
 *   1700 – 2150ms → tudo some (fade-out)
 */
@Component({
  selector: 'app-splash-screen',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .splash-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #e9edf3;
      animation: splash-fade-out 0.45s ease-in 1.7s forwards;
    }

    .splash-logo {
      width: 148px;
      height: 148px;
      filter: drop-shadow(0 8px 24px rgba(5, 105, 129, 0.28));
    }

    /* ── Fase 1: corpo do cartão ────────────────────────────────────────── */
    .logo-card {
      opacity: 0;
      animation: logo-pop-in 0.38s cubic-bezier(0.34, 1.56, 0.64, 1) 0s forwards;
    }

    /* ── Fase 1B: setas giram sobre o fundo teal ───────────────────────── */
    .logo-arrows {
      transform-origin: 165px 188px;
      opacity: 0;
      animation:
        logo-arrows-appear 0.3s ease-out 0.15s forwards,
        logo-arrows-spin   0.75s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.15s 1;
    }

    /* ── Fase 2: aro do círculo completa a logo ─────────────────────────── */
    .logo-circle {
      opacity: 0;
      animation: logo-fade-in 0.45s ease-out 0.75s forwards;
    }

    /* ── Keyframes ──────────────────────────────────────────────────────── */
    @keyframes splash-fade-out {
      to { opacity: 0; pointer-events: none; }
    }

    @keyframes logo-pop-in {
      from { opacity: 0; transform: scale(0.86); }
      to   { opacity: 1; transform: scale(1); }
    }

    @keyframes logo-arrows-appear {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    @keyframes logo-arrows-spin {
      0%   { transform: rotate(0deg);   }
      65%  { transform: rotate(375deg); }
      82%  { transform: rotate(352deg); }
      100% { transform: rotate(360deg); }
    }

    @keyframes logo-fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
  `,
  template: `
    @if (visible()) {
      <div
        class="splash-overlay"
        aria-hidden="true"
        (animationend)="onOverlayAnimEnd($event)"
      >
        <svg
          class="splash-logo"
          viewBox="0 0 339 339"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <!--
            Fase 1A: corpo inteiro do cartão teal.
            Inclui o triângulo do canto (linha 11 do SVG original),
            pois faz parte da silhueta principal do cartão.
          -->
          <g class="logo-card">
            <path d="M46 41C46 30.5066 54.5066 22 65 22H168V319H65C54.5066 319 46 310.493 46 300V41Z" fill="#056981"/>
            <path d="M233.5 95H290.5V298.5C290.5 305.5 286.5 311.667 283 314C279.5 316.333 273 319 267.5 319H168V22H217V77.5C218.5 87 223 92.5 233.5 95Z" fill="#086279"/>
            <path d="M233.5 95H290.5L217 22V77.5C218.5 87.5 223.5 93.5 233.5 95Z" fill="#30959A"/>
          </g>

          <!-- Fase 1B: 4 setas brancas girando sobre o fundo teal -->
          <g class="logo-arrows">
            <path d="M175 250C209.265 239.361 220.737 227.287 228 195L216 206L206 195C199.435 213.53 192.646 220.333 175 226V215.5C166.401 224.909 161.377 229.753 152 237.5L175 260V250Z" fill="white" stroke="white"/>
            <path d="M155 126C120.735 136.639 109.263 148.713 102 181L114 170L124 181C130.565 162.47 137.354 155.667 155 150V160.5L178 137.5L155 116V126Z" fill="white" stroke="white"/>
            <path d="M228 186.5C228.5 161 204 130 173.5 126L185 139L174.5 148.5C194 155.5 203.5 166.5 206 186.5L216.5 197L228 186.5Z" fill="white" stroke="white"/>
            <path d="M101.007 189.66C100.512 215.514 124.784 246.944 155 251L144.598 236.806L155 227.174C135.682 220.076 126.27 208.924 123.793 188.646L113.391 178L101.007 189.66Z" fill="white" stroke="white"/>
          </g>

          <!-- Fase 2: aro do círculo completa a identidade visual -->
          <g class="logo-circle">
            <circle cx="165" cy="188" r="87" stroke="#32959B" stroke-width="14"/>
          </g>
        </svg>
      </div>
    }
  `,
})
export class SplashScreenComponent implements OnInit {
  protected readonly visible = signal(true);

  ngOnInit(): void {
    if (splashShown) {
      this.visible.set(false);
    }
  }

  protected onOverlayAnimEnd(event: AnimationEvent): void {
    if ((event.target as Element).classList.contains('splash-overlay')) {
      splashShown = true;
      this.visible.set(false);
    }
  }
}
