import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  booleanAttribute,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TranslationService } from '../../core/services/translation.service';
import { IconComponent } from './icon/icon.component';

/**
 * Antes/depois com divisor e INSPEÇÃO POR ZOOM.
 *
 * POR QUE O ZOOM É REDIMENSIONAMENTO E NÃO `transform: scale`
 *
 * A primeira versão ampliava com `scale-[2.2]` no CSS, e isso é exatamente o que
 * não pode ser feito aqui. Um `<img>` que aponta para um SVG é rasterizado pelo
 * navegador no tamanho de LAYOUT do elemento; um `transform` posterior estica
 * esse raster já pronto. Ou seja: a ferramenta cuja tese é "isto agora é curva,
 * não pixel" mostrava, no botão chamado "ver detalhes", o vetor BORRADO — a
 * única coisa que o zoom não podia fazer.
 *
 * Mudando `width`/`height` o navegador refaz o desenho a cada nível, e aí o
 * lado direito continua nítido em 16x enquanto o esquerdo vira o quadriculado do
 * raster. Essa diferença é o produto inteiro numa imagem só, e não custa nada
 * além de não usar `scale`.
 *
 * O DIVISOR CONTINUA SENDO O GESTO PRINCIPAL EM 100%
 *
 * Arrastar em qualquer lugar move o divisor enquanto não há zoom — é o que a
 * pessoa espera de um comparador, e é o que os testes de ponta a ponta exercem.
 * Ampliado, arrastar passa a ARRASTAR A IMAGEM (não há outra forma de alcançar o
 * canto de um desenho em 8x) e o divisor ganha uma alça própria, que funciona
 * nos dois casos. O `input[type=range]` invisível segue sendo o caminho de
 * teclado.
 */
@Component({
  selector: 'app-compare-slider',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <!-- touch-none: sem isso um arraste de toque rola a página em vez de mover
         o divisor ou a imagem. -->
    <div
      #frame
      class="relative touch-none select-none overflow-hidden rounded-xl border border-stage-line bg-stage"
      [class.cursor-ew-resize]="zoom() === 1"
      [class.cursor-grab]="zoom() > 1 && !panning()"
      [class.cursor-grabbing]="zoom() > 1 && panning()"
      [style.min-height.px]="minHeight()"
      (pointerdown)="startDrag($event)"
      (pointermove)="drag($event)"
      (pointerup)="endDrag($event)"
      (pointercancel)="endDrag($event)"
      (dblclick)="zoomStep(2, $event)"
      (wheel)="onWheel($event)"
    >
      <div class="absolute inset-0 flex items-center justify-center" [class.checkerboard]="checkerboard()">
        <img
          [src]="after()"
          [alt]="i18n.t()['common.result']"
          draggable="false"
          (load)="onResultLoad($event)"
          class="max-w-none"
          [style.width.px]="boxWidth()"
          [style.height.px]="boxHeight()"
          [style.transform]="panTransform()"
        />
      </div>

      <!-- O "antes" é recortado, e não deslocado: as duas camadas ficam presas à
           mesma caixa, com o mesmo zoom e o mesmo deslocamento. -->
      <div class="absolute inset-0 overflow-hidden" [style.clip-path]="'inset(0 ' + (100 - position()) + '% 0 0)'">
        <div class="absolute inset-0 flex items-center justify-center bg-stage">
          <img
            [src]="before()"
            [alt]="i18n.t()['common.original']"
            draggable="false"
            class="max-w-none"
            [style.width.px]="boxWidth()"
            [style.height.px]="boxHeight()"
            [style.transform]="panTransform()"
          />
        </div>
      </div>

      <div class="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90 shadow-sm" [style.left.%]="position()">
        <!-- A alça é o único jeito de mexer no divisor quando o arraste da moldura
             virou pan, então ela PRECISA receber ponteiro (o resto da linha não). -->
        <button
          type="button"
          class="pointer-events-auto absolute top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize
                 items-center justify-center rounded-full border-2 border-white bg-accent-fill text-2xs text-white"
          [attr.aria-label]="i18n.t()['common.original'] + ' / ' + i18n.t()['common.result']"
          (pointerdown)="startDividerDrag($event)"
        >
          ‹›
        </button>
      </div>

      <input
        type="range"
        min="0"
        max="100"
        [value]="position()"
        (input)="onRange($event)"
        [attr.aria-label]="i18n.t()['common.original'] + ' / ' + i18n.t()['common.result']"
        class="absolute inset-x-0 bottom-4 mx-auto w-[60%] cursor-ew-resize opacity-0 focus-visible:opacity-100"
      />

      <span class="pointer-events-none absolute left-4 top-4 rounded-sm bg-black/60 px-2 py-1 text-2xs font-medium uppercase text-white/80">
        {{ i18n.t()['common.original'] }}
      </span>
      <span class="pointer-events-none absolute right-4 top-4 rounded-sm bg-black/60 px-2 py-1 text-2xs font-medium uppercase text-white/80">
        {{ i18n.t()['common.result'] }}
      </span>

      @if (zoom() > 1) {
        <span class="pointer-events-none absolute left-4 bottom-4 rounded-sm bg-black/60 px-2 py-1 text-2xs text-white/70">
          {{ i18n.t()['compare.pan_hint'] }}
        </span>
      }

      <div class="absolute bottom-4 right-4 z-10 flex items-center gap-px overflow-hidden rounded-md bg-black/75 text-white shadow-pop">
        <button
          type="button"
          class="flex h-7 w-7 items-center justify-center hover:bg-white/15 disabled:opacity-40"
          [disabled]="zoom() <= 1"
          [attr.aria-label]="i18n.t()['compare.zoom_out']"
          [title]="i18n.t()['compare.zoom_out']"
          (pointerdown)="$event.stopPropagation()"
          (click)="zoomStep(0.5)"
        >
          <app-icon name="minus" [size]="13" />
        </button>

        <button
          type="button"
          class="flex h-7 items-center gap-1 px-2 font-mono text-2xs tabular hover:bg-white/15"
          [attr.aria-label]="i18n.t()['compare.zoom_fit']"
          [title]="i18n.t()['compare.zoom_fit']"
          (pointerdown)="$event.stopPropagation()"
          (click)="resetZoom()"
        >
          <app-icon name="search" [size]="12" />
          {{ zoomLabel() }}
        </button>

        <button
          type="button"
          class="flex h-7 w-7 items-center justify-center hover:bg-white/15 disabled:opacity-40"
          [disabled]="zoom() >= MAX_ZOOM"
          [attr.aria-label]="i18n.t()['compare.zoom_in']"
          [title]="i18n.t()['compare.zoom_in']"
          (pointerdown)="$event.stopPropagation()"
          (click)="zoomStep(2)"
        >
          <app-icon name="plus" [size]="13" />
        </button>
      </div>
    </div>
  `,
})
export class CompareSliderComponent {
  protected readonly i18n = inject(TranslationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly before = input.required<string>();
  readonly after = input.required<string>();
  readonly checkerboard = input(false, { transform: booleanAttribute });
  readonly minHeight = input(420);

  private readonly frame = viewChild.required<ElementRef<HTMLElement>>('frame');

  protected readonly position = signal(50);

  /**
   * 16x é o teto por um motivo concreto: acima disso um pixel do original ocupa
   * mais que a moldura inteira e não sobra referência nenhuma para comparar. O
   * piso é 1 — reduzir abaixo do "cabe na tela" não mostra detalhe, só espaço
   * vazio, e o comparador já entra ajustado.
   */
  protected readonly MAX_ZOOM = 16;

  protected readonly zoom = signal(1);
  protected readonly panning = signal(false);
  private readonly pan = signal({ x: 0, y: 0 });
  private readonly frameSize = signal({ w: 0, h: 0 });
  private readonly natural = signal({ w: 0, h: 0 });

  /** Respiro entre a imagem e a borda da moldura, em 100%. */
  private readonly PAD = 24;

  private dragging: 'none' | 'divider' | 'pan' = 'none';
  private panStart = { x: 0, y: 0, panX: 0, panY: 0 };

  constructor() {
    // `afterNextRender` em vez do construtor: o prerender roda em Node, onde não
    // existe ResizeObserver nem elemento medido — e uma exceção aqui derrubaria a
    // rota inteira na geração estática.
    afterNextRender(() => {
      const el = this.frame().nativeElement;
      const measure = (): void => this.frameSize.set({ w: el.clientWidth, h: el.clientHeight });
      measure();

      const ro = new ResizeObserver(measure);
      ro.observe(el);
      this.destroyRef.onDestroy(() => ro.disconnect());
    });
  }

  /** Tamanho em que a imagem cabe na moldura em 100%. Nunca AMPLIA aqui: uma
   *  imagem pequena é mostrada no tamanho dela, e o zoom é que a amplia. */
  private readonly fit = computed(() => {
    const n = this.natural();
    const f = this.frameSize();
    if (!n.w || !n.h || !f.w || !f.h) return { w: 0, h: 0 };

    const scale = Math.min((f.w - this.PAD * 2) / n.w, (f.h - this.PAD * 2) / n.h, 1);
    return { w: Math.max(1, n.w * scale), h: Math.max(1, n.h * scale) };
  });

  protected readonly boxWidth = computed(() => this.fit().w * this.zoom() || null);
  protected readonly boxHeight = computed(() => this.fit().h * this.zoom() || null);

  protected readonly panTransform = computed(() => {
    const p = this.pan();
    return `translate(${p.x}px, ${p.y}px)`;
  });

  protected readonly zoomLabel = computed(() => `${Math.round(this.zoom() * 100)}%`);

  /** O tamanho natural sai do RESULTADO, e as duas camadas usam a mesma caixa:
   *  comparar exige que os dois lados apareçam do mesmo tamanho na tela — é o
   *  caso do upscale, em que o resultado tem quatro vezes mais pixels. */
  protected onResultLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    this.natural.set({ w: img.naturalWidth, h: img.naturalHeight });
    // Um resultado novo recomeça ajustado: manter 8x de um cálculo anterior
    // mostraria um pedaço arbitrário do desenho novo.
    this.resetZoom();
  }

  protected resetZoom(): void {
    this.zoom.set(1);
    this.pan.set({ x: 0, y: 0 });
  }

  /**
   * Amplia mantendo fixo o ponto sob o cursor — sem isso, ampliar joga para
   * longe justamente o detalhe que a pessoa estava olhando.
   */
  protected zoomStep(factor: number, event?: MouseEvent): void {
    const from = this.zoom();
    const to = Math.min(this.MAX_ZOOM, Math.max(1, from * factor));
    if (to === from) return;

    const rect = this.frame().nativeElement.getBoundingClientRect();
    const cx = event ? event.clientX - rect.left - rect.width / 2 : 0;
    const cy = event ? event.clientY - rect.top - rect.height / 2 : 0;

    const p = this.pan();
    this.zoom.set(to);
    this.setPan(cx - ((cx - p.x) / from) * to, cy - ((cy - p.y) / from) * to);
  }

  /** Ctrl/⌘ + roda amplia (é o gesto de pinça no trackpad). A roda sozinha
   *  continua rolando a página: sequestrá-la prenderia a rolagem em cima do
   *  comparador, que ocupa metade da tela. */
  protected onWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    this.zoomStep(event.deltaY < 0 ? 1.25 : 0.8, event);
  }

  protected startDrag(event: PointerEvent): void {
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);

    if (this.zoom() > 1) {
      this.dragging = 'pan';
      this.panning.set(true);
      const p = this.pan();
      this.panStart = { x: event.clientX, y: event.clientY, panX: p.x, panY: p.y };
      return;
    }

    this.dragging = 'divider';
    this.moveDivider(event);
  }

  /** A alça move o divisor mesmo ampliado, onde o arraste da moldura é pan. */
  protected startDividerDrag(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.frame().nativeElement.setPointerCapture?.(event.pointerId);
    this.dragging = 'divider';
  }

  protected drag(event: PointerEvent): void {
    if (this.dragging === 'divider') {
      this.moveDivider(event);
      return;
    }
    if (this.dragging === 'pan') {
      this.setPan(
        this.panStart.panX + (event.clientX - this.panStart.x),
        this.panStart.panY + (event.clientY - this.panStart.y),
      );
    }
  }

  protected endDrag(event: PointerEvent): void {
    this.dragging = 'none';
    this.panning.set(false);
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  }

  protected onRange(event: Event): void {
    this.position.set(Number((event.target as HTMLInputElement).value));
  }

  private moveDivider(event: PointerEvent): void {
    const rect = this.frame().nativeElement.getBoundingClientRect();
    const pct = ((event.clientX - rect.left) / rect.width) * 100;
    this.position.set(Math.min(100, Math.max(0, pct)));
  }

  /** O deslocamento é limitado à sobra da imagem: arrastar não pode deixar a
   *  moldura vazia, e em 100% não há sobra nenhuma, então o pan fica em zero. */
  private setPan(x: number, y: number): void {
    const f = this.frameSize();
    const maxX = Math.max(0, (this.boxWidth() ?? 0) - f.w) / 2;
    const maxY = Math.max(0, (this.boxHeight() ?? 0) - f.h) / 2;

    this.pan.set({
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    });
  }
}
