import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import Cropper from 'cropperjs';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { formatBytes, suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { openFramePicker, type FramePicker } from '../../core/video/frames';
import { pixelBox, reencodeVideo, type CropRect } from '../../core/video/reencode';
import { availableRecorderFormats, type RecordingFormat } from '../../core/video/screen-recorder';
import { assertUsableVideo } from '../../core/video/video-file.util';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { WorkspaceService, hydrateFromWorkspace } from '../../core/services/workspace.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { SegmentedComponent, type SegmentOption } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';

/** Proporções que as pessoas de fato pedem, mais a livre. */
type AspectId = 'free' | '1:1' | '9:16' | '16:9' | '4:5';

const ASPECT: Record<Exclude<AspectId, 'free'>, number> = {
  '1:1': 1,
  '9:16': 9 / 16,
  '16:9': 16 / 9,
  '4:5': 4 / 5,
};

/**
 * De onde sai o quadro de referência quando o arquivo chega. Não do zero:
 * abertura preta e fade-in são comuns o bastante para que o primeiro quadro
 * não sirva para enquadrar nada.
 */
const FIRST_FRAME_AT = 0.1;

@Component({
  selector: 'app-crop-video',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
    SegmentedComponent,
    ButtonDirective,
  ],
  templateUrl: './crop-video.component.html',
})
export class CropVideoComponent implements OnDestroy {
  private readonly urls = inject(ObjectUrlScope);
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);
  protected readonly tool = toolById('crop-video');
  protected readonly i18n = inject(TranslationService);

  private readonly imageRef = viewChild<ElementRef<HTMLImageElement>>('frame');

  /**
   * A MESMA cropper.js do recortar imagem, e é isso que a decisão vale.
   *
   * O que estava aqui era o `app-region-overlay`, que desenha regiões à mão
   * livre — certo para o censurar, onde se marcam várias tarjas e se apagam
   * uma a uma, e errado para um recorte, que é UMA caixa com alças, que se
   * arrasta, se redimensiona e obedece a uma proporção ENQUANTO se arrasta. A
   * proporção era aplicada depois do arrasto, o que já era pior; e como o
   * overlay fala em porcentagem (0–100) e o `CropRect` em fração (0–1), o
   * componente entregava 40 onde o recorte esperava 0,4. Em "Livre" o
   * `clamp01` levava tudo para 1 e o recorte saía do quadro inteiro; com
   * proporção, o `1 - yPct` da conta de altura ficava negativo e a caixa
   * fechava em 2×2 — o defeito que aparece na tela. Nada disso sobrevive à
   * troca: a cropper.js devolve pixels do próprio quadro, e a conversão para
   * fração acontece num lugar só.
   */
  private cropper: Cropper | null = null;
  private picker: FramePicker | null = null;

  protected readonly file = signal<File | null>(null);
  protected readonly frameUrl = signal<string | null>(null);
  protected readonly frameTime = signal(0);
  protected readonly duration = signal(0);
  protected readonly sourceWidth = signal(0);
  protected readonly sourceHeight = signal(0);

  protected readonly aspect = signal<AspectId>('free');
  protected readonly format = signal<RecordingFormat>('webm');

  protected readonly busy = signal(false);
  protected readonly progress = signal(0);
  protected readonly secondsLeft = signal(0);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly resultExt = signal('webm');
  protected readonly errorKey = signal<TranslationKey | null>(null);

  /** O recorte em FRAÇÃO de cada eixo, que é o que `reencodeVideo` recebe. */
  protected readonly box = signal<CropRect | null>(null);

  private abort: AbortController | null = null;
  private seeking = false;

  /**
   * Lido no CONSTRUTOR e atrás de uma guarda de plataforma, nunca em escopo de
   * módulo: `MediaRecorder` não existe no Node da geração estática, e uma
   * chamada no carregamento derruba a rota antes de existir componente. É a
   * armadilha que o `TESSERACT_PATHS` já custou e que o gravador de tela
   * documenta.
   */
  protected readonly formats = signal<readonly { format: RecordingFormat; ext: string }[]>([]);

  protected readonly formatOptions = computed<SegmentOption<RecordingFormat>[]>(() =>
    this.formats().map((f) => ({ value: f.format, label: f.format.toUpperCase() })),
  );

  protected readonly onlyOneFormat = computed(() => this.formats().length === 1);

  /** As dimensões que o arquivo vai ter, com os lados pares já aplicados. */
  protected readonly outputBox = computed(() => {
    const box = this.box();
    const w = this.sourceWidth();
    const h = this.sourceHeight();
    if (!box || w === 0 || h === 0) return null;
    return pixelBox(box, w, h);
  });

  protected readonly aspectOptions = computed<SegmentOption<AspectId>[]>(() => [
    { value: 'free', label: this.i18n.t()['cropvid.free'] },
    { value: '1:1', label: '1:1' },
    { value: '9:16', label: '9:16' },
    { value: '16:9', label: '16:9' },
    { value: '4:5', label: '4:5' },
  ]);

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : '—';
  });

  protected readonly frameClock = computed(() => this.frameTime().toFixed(1));

  protected readonly canRun = computed(
    () => !!this.box() && !this.busy() && this.formats().length > 0,
  );

  /** Quanto tempo a operação vai levar: a duração do vídeo, e nada menos. */
  protected readonly estimate = computed(() => Math.ceil(this.duration()));

  private readonly ranSettings = signal<string | null>(null);

  private readonly settings = computed(() => {
    const box = this.outputBox();
    return [box?.x, box?.y, box?.w, box?.h, this.format()].join('|');
  });

  protected readonly stale = computed(() => this.ranSettings() !== this.settings());

  constructor() {
    if (typeof MediaRecorder !== 'undefined') {
      const found = availableRecorderFormats().map((f) => ({ format: f.format, ext: f.ext }));
      this.formats.set(found);
      if (found[0]) this.format.set(found[0].format);
    }

    // O <img> só existe depois que há quadro, então a cropper.js é montada
    // quando o filho aparece — e fica montada pelo resto da vida do
    // componente. Trocar o quadro é `replace()`, nunca uma instância nova:
    // remontar jogaria fora a caixa que a pessoa acabou de ajustar.
    effect(() => {
      const element = this.imageRef()?.nativeElement;
      const url = this.frameUrl();
      if (!element || !url || this.cropper) return;

      // Atribuído à mão além do binding: um efeito não tem ordem garantida
      // contra a atualização do template, e montar a cropper.js sobre o `src`
      // anterior mostraria o quadro do arquivo passado. Escrever o mesmo valor
      // duas vezes não custa nada.
      element.src = url;

      this.cropper = new Cropper(element, {
        viewMode: 1,
        background: false,
        autoCropArea: 0.8,
        responsive: true,
        // O quadro é referência, não conteúdo a editar: mover, girar e ampliar
        // deslocariam a caixa em relação aos pixels do arquivo sem que nada
        // disso chegasse ao vídeo recortado.
        movable: false,
        zoomable: false,
        rotatable: false,
        scalable: false,
        toggleDragModeOnDblclick: false,
      });

      element.addEventListener('crop', this.syncBox);
      this.syncBox();
    });

    hydrateFromWorkspace('crop-video', (file) => void this.load(file));
  }

  ngOnDestroy(): void {
    this.destroyCropper();
    this.picker?.release();
    this.picker = null;
    this.abort?.abort();
    this.pendingTransition.clear();
  }

  /**
   * A caixa vive no DOM da cropper.js, não num signal, então o evento `crop` é
   * a única forma de ouvir sobre ela. `getData(true)` arredonda para pixel
   * natural do quadro — que é pixel do vídeo, porque o quadro é capturado no
   * tamanho natural — e a divisão pelas dimensões da imagem é o ÚNICO lugar em
   * que se converte para fração.
   */
  private readonly syncBox = (): void => {
    const cropper = this.cropper;
    if (!cropper) return;

    const data = cropper.getData(true);
    const image = cropper.getImageData();
    const w = image.naturalWidth;
    const h = image.naturalHeight;
    if (!w || !h || !data.width || !data.height) {
      this.box.set(null);
      return;
    }

    this.box.set({
      x: clamp01(data.x / w),
      y: clamp01(data.y / h),
      w: clamp01(data.width / w),
      h: clamp01(data.height / h),
    });
    this.clearResult();
  };

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'crop-video');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  private async load(file: File | null): Promise<void> {
    this.clearResult();
    this.destroyCropper();
    this.picker?.release();
    this.picker = null;
    this.box.set(null);

    if (!file) {
      this.file.set(null);
      this.urls.revoke(this.frameUrl());
      this.frameUrl.set(null);
      this.duration.set(0);
      this.sourceWidth.set(0);
      this.sourceHeight.set(0);
      return;
    }

    try {
      assertUsableVideo(file);
      const picker = await openFramePicker(file);
      this.picker = picker;

      this.file.set(file);
      this.duration.set(picker.duration);
      this.sourceWidth.set(picker.width);
      this.sourceHeight.set(picker.height);

      const at = Math.min(FIRST_FRAME_AT, picker.duration / 2);
      this.frameTime.set(at);
      const frame = await picker.frameAt(at);
      this.frameUrl.set(this.urls.replace(this.frameUrl(), frame));
    } catch (err) {
      console.error('[CropVideo] could not read the video:', err);
      this.errorKey.set(toMessageKey(err));
      this.file.set(null);
    }
  }

  /**
   * A régua do quadro de referência.
   *
   * O recorte vale para o vídeo inteiro, mas o enquadramento se confere num
   * instante de cada vez — e é para isso que ela existe: pular para a cena que
   * importa e ver se a caixa ainda a contém. `replace(url, true)` mantém a
   * caixa, porque o quadro tem sempre o mesmo tamanho; remontar a cropper.js
   * apagaria o ajuste a cada milímetro de arrasto.
   *
   * A guarda de "busca em curso" existe porque um arrasto dispara dezenas de
   * eventos e cada um é um seek: sem ela a fila cresce e o quadro exibido
   * atrasa em relação à régua.
   */
  protected async setFrameTime(seconds: number): Promise<void> {
    const picker = this.picker;
    if (!picker || this.seeking) return;

    const at = Math.min(Math.max(0, seconds), picker.duration);
    this.frameTime.set(at);
    this.seeking = true;

    try {
      const frame = await picker.frameAt(at);
      const url = this.urls.replace(this.frameUrl(), frame);
      this.frameUrl.set(url);
      this.cropper?.replace(url, true);
    } catch (err) {
      console.error('[CropVideo] could not read the frame:', err);
    } finally {
      this.seeking = false;
    }
  }

  protected setAspect(id: AspectId): void {
    this.aspect.set(id);
    // A proporção trava a caixa ENQUANTO se arrasta, que é a diferença entre
    // esta ferramenta e o que ela era. A conta que ajustava a altura depois do
    // arrasto morreu junto — e com ela o defeito de unidade que fechava a
    // caixa em 2×2.
    this.cropper?.setAspectRatio(id === 'free' ? NaN : ASPECT[id]);
  }

  protected resetBox(): void {
    this.cropper?.reset();
  }

  protected async run(): Promise<void> {
    const file = this.file();
    const box = this.box();
    if (!file || !box || !this.canRun()) return;

    this.busy.set(true);
    this.progress.set(0);
    this.secondsLeft.set(this.estimate());
    this.errorKey.set(null);
    this.abort = new AbortController();

    try {
      const settings = this.settings();

      const result = await reencodeVideo({
        file,
        rect: box,
        format: this.format(),
        signal: this.abort.signal,
        onProgress: (percent, left) => {
          this.progress.set(percent);
          this.secondsLeft.set(Math.ceil(left));
        },
      });

      this.resultBlob.set(result.blob);
      this.resultExt.set(result.ext);
      this.ranSettings.set(settings);
      this.pendingTransition.registerResult('crop-video', result.blob, this.tool.suffix, result.ext);
    } catch (err) {
      console.error('[CropVideo] crop failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
      this.abort = null;
    }
  }

  protected cancel(): void {
    this.abort?.abort();
  }

  protected download(): void {
    const blob = this.resultBlob();
    const session = this.workspace.session();
    if (!blob || !session) return;

    saveBlob(blob, suffixedName(session.originalName, this.tool.suffix, this.resultExt()));
  }

  protected reset(): void {
    this.abort?.abort();
    this.destroyCropper();
    this.picker?.release();
    this.picker = null;
    this.urls.releaseAll();
    this.file.set(null);
    this.frameUrl.set(null);
    this.box.set(null);
    this.duration.set(0);
    this.sourceWidth.set(0);
    this.sourceHeight.set(0);
    this.clearResult();
    this.errorKey.set(null);
    this.workspace.clear();
  }

  private destroyCropper(): void {
    this.imageRef()?.nativeElement.removeEventListener('crop', this.syncBox);
    this.cropper?.destroy();
    this.cropper = null;
  }

  private clearResult(): void {
    this.resultBlob.set(null);
    this.ranSettings.set(null);
    this.pendingTransition.clear();
  }
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}
