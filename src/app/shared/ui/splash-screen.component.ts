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
 * Splash screen com animação em 6 fases:
 *
 *   0ms         → SVG surge com fade+scale leve
 *   0–450ms     → painel esquerdo escala de dentro para fora
 *   120–570ms   → painel direito escala de dentro para fora
 *   250–585ms   → triângulo do canto dobra no lugar
 *   480–1180ms  → círculo se desenha via stroke-dashoffset
 *   720–1475ms  → cada seta aparece individualmente (pop com overshoot, stagger 140ms)
 *   1380–1930ms → todas as setas giram 360° juntas (finalização)
 *   2050–2500ms → overlay some em fade-out
 */
@Component({
  selector: 'app-splash-screen',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    /* ── Overlay ──────────────────────────────────────────────────────────── */
    .splash-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #e9edf3;
      animation: splash-fade-out 0.45s ease-in 2.05s forwards;
    }

    /* ── SVG wrapper ──────────────────────────────────────────────────────── */
    .splash-logo {
      width: 152px;
      height: 152px;
      overflow: visible;
      filter: drop-shadow(0 10px 28px rgba(5, 105, 129, 0.3));
      opacity: 0;
      animation: svg-entrance 0.35s cubic-bezier(0.34, 1.3, 0.64, 1) 0ms forwards;
    }

    /* ── Painel esquerdo ─────────────────────────────────────────────────── */
    .logo-left {
      transform-box: fill-box;
      transform-origin: center;
      opacity: 0;
      animation: panel-scale-in 0.45s cubic-bezier(0.34, 1.4, 0.64, 1) 0ms forwards;
    }

    /* ── Painel direito ──────────────────────────────────────────────────── */
    .logo-right {
      transform-box: fill-box;
      transform-origin: center;
      opacity: 0;
      animation: panel-scale-in 0.45s cubic-bezier(0.34, 1.4, 0.64, 1) 120ms forwards;
    }

    /* ── Triângulo do canto ──────────────────────────────────────────────── */
    .logo-corner {
      transform-box: fill-box;
      transform-origin: top right;
      opacity: 0;
      animation: corner-fold-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) 250ms forwards;
    }

    /* ── Círculo: desenha-se via stroke-dashoffset ───────────────────────── */
    .logo-circle-path {
      stroke-dasharray: 547;
      stroke-dashoffset: 547;
      animation: draw-circle 0.7s cubic-bezier(0.37, 0, 0.63, 1) 480ms forwards;
    }

    /* ── Grupo das setas: aplica o giro final sobre as setas já visíveis ─── */
    .logo-arrows-group {
      transform-origin: 165px 188px;
      animation: group-spin 0.55s cubic-bezier(0.25, 0.46, 0.45, 0.94) 1380ms both;
    }

    /* ── Setas individuais: stagger de 140ms ─────────────────────────────── */
    .logo-arrow {
      transform-box: fill-box;
      transform-origin: center;
      opacity: 0;
    }

    .logo-arrow-1 { animation: arrow-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)  720ms both; }
    .logo-arrow-2 { animation: arrow-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)  860ms both; }
    .logo-arrow-3 { animation: arrow-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) 1000ms both; }
    .logo-arrow-4 { animation: arrow-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) 1140ms both; }

    /* ── Keyframes ───────────────────────────────────────────────────────── */
    @keyframes splash-fade-out {
      to { opacity: 0; pointer-events: none; }
    }

    @keyframes svg-entrance {
      from { opacity: 0; transform: scale(0.9); }
      to   { opacity: 1; transform: scale(1);   }
    }

    @keyframes panel-scale-in {
      from { opacity: 0; transform: scale(0.65); }
      to   { opacity: 1; transform: scale(1);    }
    }

    @keyframes corner-fold-in {
      from { opacity: 0; transform: scale(0);    }
      to   { opacity: 1; transform: scale(1);    }
    }

    @keyframes draw-circle {
      to { stroke-dashoffset: 0; }
    }

    @keyframes arrow-pop {
      0%   { opacity: 0; transform: scale(0);    }
      55%  { opacity: 1; transform: scale(1.25); }
      80%  { transform: scale(0.95); }
      100% { opacity: 1; transform: scale(1);    }
    }

    @keyframes group-spin {
      0%   { transform: rotate(0deg);   }
      65%  { transform: rotate(375deg); }
      82%  { transform: rotate(352deg); }
      100% { transform: rotate(360deg); }
    }

    /* ── Nome da marca ───────────────────────────────────────────────────── */
    .splash-brand {
      margin-top: 20px;
      font-family: 'Nunito', ui-sans-serif, -apple-system, sans-serif;
      font-size: 1.375rem;
      font-weight: 600;
      letter-spacing: -0.015em;
      color: #0f172a;
      opacity: 0;
      animation: brand-appear 0.5s cubic-bezier(0.34, 1.3, 0.64, 1) 1350ms forwards;
    }

    @keyframes brand-appear {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0);   }
    }
  `,
  template: `
    @if (visible()) {
      <div
        class="splash-overlay"
        aria-hidden="true"
        style="flex-direction: column;"
        (animationend)="onOverlayAnimEnd($event)"
      >
        <svg
          class="splash-logo"
          viewBox="0 0 339 339"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <!-- Fase 1A: painel esquerdo (escala do centro para fora) -->
          <g class="logo-left">
            <path d="M46 41C46 30.5066 54.5066 22 65 22H168V319H65C54.5066 319 46 310.493 46 300V41Z" fill="#056981"/>
          </g>

          <!-- Fase 1B: painel direito (escala com 120ms de atraso) -->
          <g class="logo-right">
            <path d="M233.5 95H290.5V298.5C290.5 305.5 286.5 311.667 283 314C279.5 316.333 273 319 267.5 319H168V22H217V77.5C218.5 87 223 92.5 233.5 95Z" fill="#086279"/>
          </g>

          <!-- Fase 1C: triângulo do canto dobra no lugar (250ms) -->
          <g class="logo-corner">
            <path d="M233.5 95H290.5L217 22V77.5C218.5 87.5 223.5 93.5 233.5 95Z" fill="#30959A"/>
          </g>

          <!-- Fase 2: círculo se desenha via stroke-dashoffset (480ms) -->
          <circle
            class="logo-circle-path"
            cx="165" cy="188" r="87"
            stroke="#32959B"
            stroke-width="14"
            fill="none"
          />

          <!-- Fase 3: setas aparecem em stagger + giro final do grupo -->
          <g class="logo-arrows-group">
            <g class="logo-arrow logo-arrow-1">
              <path d="M175 250C209.265 239.361 220.737 227.287 228 195L216 206L206 195C199.435 213.53 192.646 220.333 175 226V215.5C166.401 224.909 161.377 229.753 152 237.5L175 260V250Z" fill="white" stroke="white"/>
            </g>
            <g class="logo-arrow logo-arrow-2">
              <path d="M155 126C120.735 136.639 109.263 148.713 102 181L114 170L124 181C130.565 162.47 137.354 155.667 155 150V160.5L178 137.5L155 116V126Z" fill="white" stroke="white"/>
            </g>
            <g class="logo-arrow logo-arrow-3">
              <path d="M228 186.5C228.5 161 204 130 173.5 126L185 139L174.5 148.5C194 155.5 203.5 166.5 206 186.5L216.5 197L228 186.5Z" fill="white" stroke="white"/>
            </g>
            <g class="logo-arrow logo-arrow-4">
              <path d="M101.007 189.66C100.512 215.514 124.784 246.944 155 251L144.598 236.806L155 227.174C135.682 220.076 126.27 208.924 123.793 188.646L113.391 178L101.007 189.66Z" fill="white" stroke="white"/>
            </g>
          </g>
        </svg>

        <p class="splash-brand">Nada Sai</p>
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
