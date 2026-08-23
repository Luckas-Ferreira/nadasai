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
import { canvasToBlob, formatBytes, suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import {
  PRINT_DPI,
  formatById,
  mmToPx,
  sheetById,
  sheetLayout,
  type PhotoFormatId,
  type SheetId,
} from '../../core/photo/id-photo';
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
import { IdPhotoService, type SheetOutput } from './services/id-photo.service';

@Component({
  selector: 'app-id-photo',
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
  templateUrl: './id-photo.component.html',
})
export class IdPhotoComponent implements OnDestroy {
  private readonly urls = inject(ObjectUrlScope);
  private readonly composer = inject(IdPhotoService);
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);
  protected readonly tool = toolById('id-photo');
  protected readonly i18n = inject(TranslationService);

  private readonly imageRef = viewChild<ElementRef<HTMLImageElement>>('photo');

  /**
   * A MESMA cropper.js do recortar imagem e do recortar vídeo, e aqui ela é
   * obrigatória por um motivo que as outras duas não têm: a proporção precisa
   * ficar travada ENQUANTO se enquadra o rosto. Um enquadramento livre
   * seguido de ajuste depois é o que produz uma foto de documento com a cabeça
   * cortada.
   */
  private cropper: Cropper | null = null;

  protected readonly sourceUrl = signal<string | null>(null);
  protected readonly format = signal<PhotoFormatId>('3x4');
  protected readonly sheet = signal<SheetId>('10x15');
  protected readonly output = signal<SheetOutput>('pdf');

  protected readonly busy = signal(false);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly resultExt = signal('pdf');
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly file = computed(() => this.workspace.fileFor('id-photo'));

  protected readonly formatOptions = computed<SegmentOption<PhotoFormatId>[]>(() => [
    { value: '3x4', label: '3 × 4 cm' },
    { value: '5x7', label: '5 × 7 cm' },
    { value: '35x45', label: '35 × 45 mm' },
    { value: '2x2', label: '2 × 2 pol' },
  ]);

  protected readonly sheetOptions = computed<SegmentOption<SheetId>[]>(() => [
    { value: 'single', label: this.i18n.t()['idphoto.single'] },
    { value: '10x15', label: this.i18n.t()['idphoto.sheet_10x15'] },
    { value: 'a4', label: this.i18n.t()['idphoto.sheet_a4'] },
  ]);

  protected readonly outputOptions = computed<SegmentOption<SheetOutput>[]>(() => [
    { value: 'pdf', label: 'PDF' },
    { value: 'jpg', label: 'JPG' },
  ]);

  protected readonly currentFormat = computed(() => formatById(this.format()));

  protected readonly layout = computed(() =>
    sheetLayout(this.currentFormat(), sheetById(this.sheet())),
  );

  /** O tamanho em pixel que a foto recortada vai ter, a 300 DPI. */
  protected readonly photoPixels = computed(() => ({
    w: mmToPx(this.currentFormat().widthMm, PRINT_DPI),
    h: mmToPx(this.currentFormat().heightMm, PRINT_DPI),
  }));

  protected readonly physicalLabel = computed(() => {
    const f = this.currentFormat();
    return `${trim(f.widthMm)} × ${trim(f.heightMm)} mm`;
  });

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : '—';
  });

  /**
   * O resultado é PDF quando a folha sai em PDF, e a barra de ações precisa
   * saber: oferecer "cortar imagem" para um PDF é pior do que não oferecer
   * nada. Mesma razão do zip do dividir PDF.
   */
  protected readonly resultKind = computed(() => (this.output() === 'pdf' ? 'pdf' : 'image'));

  private readonly boxKey = signal('');
  private readonly ranSettings = signal<string | null>(null);

  private readonly settings = computed(() =>
    [this.boxKey(), this.format(), this.sheet(), this.output()].join('|'),
  );

  protected readonly stale = computed(() => this.ranSettings() !== this.settings());

  protected readonly canRun = computed(
    () => !!this.file() && !this.busy() && this.layout().count > 0,
  );

  constructor() {
    hydrateFromWorkspace('id-photo', (file) => this.hydrate(file));

    effect(() => {
      const element = this.imageRef()?.nativeElement;
      const url = this.sourceUrl();
      if (!element || !url || this.cropper) return;

      element.src = url;

      this.cropper = new Cropper(element, {
        viewMode: 1,
        background: false,
        responsive: true,
        autoCropArea: 0.9,
        aspectRatio: this.ratio(),
        // O retrato é o conteúdo; girar ou ampliar aqui só desalinharia a caixa
        // em relação aos pixels do arquivo.
        rotatable: false,
        scalable: false,
        zoomable: false,
        movable: false,
        toggleDragModeOnDblclick: false,
      });

      element.addEventListener('crop', this.syncBox);
    });
  }

  ngOnDestroy(): void {
    this.destroyCropper();
    this.pendingTransition.clear();
  }

  private ratio(): number {
    const f = this.currentFormat();
    return f.widthMm / f.heightMm;
  }

  private readonly syncBox = (): void => {
    this.boxKey.set(JSON.stringify(this.cropper?.getData(true) ?? null));
  };

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'id-photo');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  private hydrate(file: File | null): void {
    this.clearResult();
    this.destroyCropper();

    if (!file) {
      this.urls.revoke(this.sourceUrl());
      this.sourceUrl.set(null);
      return;
    }

    this.sourceUrl.set(this.urls.replace(this.sourceUrl(), file));
  }

  protected setFormat(id: PhotoFormatId): void {
    this.format.set(id);
    // A proporção da caixa acompanha o formato NA HORA. Aplicá-la só na
    // exportação deixaria a pessoa enquadrando um retângulo e recebendo outro.
    this.cropper?.setAspectRatio(this.ratio());
    this.clearResult();
  }

  protected setSheet(id: SheetId): void {
    this.sheet.set(id);
    this.clearResult();
  }

  protected setOutput(value: SheetOutput): void {
    this.output.set(value);
    this.clearResult();
  }

  protected resetBox(): void {
    this.cropper?.reset();
  }

  protected async run(): Promise<void> {
    const file = this.file();
    if (!file || !this.cropper || !this.canRun()) return;

    this.busy.set(true);
    this.errorKey.set(null);

    try {
      const settings = this.settings();
      const { w, h } = this.photoPixels();

      // O recorte já sai NA MEDIDA de impressão: a cropper.js reamostra para o
      // tamanho pedido, então nada depois precisa redimensionar de novo.
      const canvas = this.cropper.getCroppedCanvas({
        width: w,
        height: h,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
        fillColor: '#ffffff',
      });

      const photo = await canvasToBlob(canvas, 'image/jpeg', 0.95);

      const composed = await this.composer.compose(
        photo,
        this.currentFormat(),
        sheetById(this.sheet()),
        this.output(),
      );

      this.resultBlob.set(composed.blob);
      this.resultExt.set(composed.ext);
      this.ranSettings.set(settings);
      this.pendingTransition.registerResult(
        'id-photo',
        composed.blob,
        this.tool.suffix,
        composed.ext,
      );
    } catch (err) {
      console.error('[IdPhoto] compose failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected download(): void {
    const blob = this.resultBlob();
    const session = this.workspace.session();
    if (!blob || !session) return;

    saveBlob(blob, suffixedName(session.originalName, this.tool.suffix, this.resultExt()));
  }

  protected reset(): void {
    this.destroyCropper();
    this.urls.releaseAll();
    this.sourceUrl.set(null);
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

/** 50.8 → "50,8"; 30 → "30". Evita "30.0 mm" no painel. */
function trim(mm: number): string {
  return Number.isInteger(mm) ? String(mm) : mm.toFixed(1);
}
