import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslationService } from '../../../core/services/translation.service';
import type { TranslationKey } from '../../../core/services/translation.service';
import { toMessageKey } from '../../../core/errors';
import { PendingTransitionService } from '../../../core/services/pending-transition.service';
import { WorkspaceService, hydrateFromWorkspace } from '../../../core/services/workspace.service';
import { toolById } from '../../../core/tools/tools';
import type { RedactMode, Region } from '../../../core/geometry/region';
import { ObjectUrlScope } from '../../../core/image/object-url';
import { saveBlob } from '../../../core/image/download';
import { ImageRedactorService, type RedactImageOutcome } from './services/image-redactor.service';
import { ToolPageComponent } from '../../../shared/ui/tool-page.component';
import { DropzoneComponent } from '../../../shared/ui/dropzone.component';
import { PanelComponent } from '../../../shared/ui/panel.component';
import { AlertComponent } from '../../../shared/ui/alert.component';
import { ActionBarComponent } from '../../../shared/ui/action-bar.component';
import { RegionOverlayComponent } from '../../../shared/ui/region-overlay.component';
import { SegmentedComponent, type SegmentOption } from '../../../shared/ui/segmented.component';
import { ButtonDirective } from '../../../shared/ui/button.directive';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

@Component({
  selector: 'app-redact-image',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    AlertComponent,
    ActionBarComponent,
    RegionOverlayComponent,
    SegmentedComponent,
    ButtonDirective,
    IconComponent,
  ],
  templateUrl: './redact-image.component.html',
})
export class RedactImageComponent {
  protected readonly i18n = inject(TranslationService);
  private readonly redactor = inject(ImageRedactorService);
  private readonly urls = inject(ObjectUrlScope);

  protected readonly file = signal<File | null>(null);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly regions = signal<readonly Region[]>([]);
  /** Black is the default because it is the only mode that is a guarantee. */
  protected readonly mode = signal<RedactMode>('black');

  protected readonly busy = signal(false);
  protected readonly errorKey = signal<TranslationKey | null>(null);
  protected readonly result = signal<RedactImageOutcome | null>(null);

  private readonly ranRegions = signal<readonly Region[] | null>(null);

  protected readonly modeOptions = computed<readonly SegmentOption<RedactMode>[]>(() => [
    { value: 'black', label: this.i18n.t()['redact.mode_black'] },
    { value: 'pixelate', label: this.i18n.t()['redact.mode_blur'] },
  ]);

  /** Moving or adding a box has to bring the export button back. */
  protected readonly stale = computed(() => !this.result() || this.regions() !== this.ranRegions());

  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);
  private readonly tool = toolById('redact-image');

  constructor() {
    hydrateFromWorkspace('redact-image', (file) => this.openFile(file));
  }

  protected onFileSelected(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'redact-image');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  private openFile(file: File | null): void {
    this.regions.set([]);
    this.result.set(null);
    this.errorKey.set(null);
    this.pendingTransition.clear();

    if (!file) {
      this.file.set(null);
      this.urls.revoke(this.previewUrl());
      this.previewUrl.set(null);
      return;
    }

    this.file.set(file);
    // Was a raw createObjectURL that leaked one URL per file for the tab's
    // lifetime — reset() did not even revoke it.
    this.previewUrl.set(this.urls.replace(this.previewUrl(), file));
  }

  protected addRegion(region: Region): void {
    this.regions.update((list) => [...list, region]);
    this.result.set(null);
  }

  protected removeRegion(id: string): void {
    this.regions.update((list) => list.filter((r) => r.id !== id));
    this.result.set(null);
  }

  protected undo(): void {
    this.regions.update((list) => list.slice(0, -1));
    this.result.set(null);
  }

  protected clearRegions(): void {
    this.regions.set([]);
    this.result.set(null);
  }

  protected async run(): Promise<void> {
    const file = this.file();
    const regions = this.regions();
    if (!file || regions.length === 0 || this.busy()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    try {
      const outcome = await this.redactor.redact({ file, regions });
      this.result.set(outcome);
      this.pendingTransition.registerResult(
        'redact-image',
        outcome.blob,
        this.tool.suffix,
        outcome.filename.split('.').pop() ?? 'png',
      );
      this.ranRegions.set(regions);
    } catch (err) {
      // There was no try/catch here at all before.
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected download(): void {
    const r = this.result();
    if (r) saveBlob(r.blob, r.filename);
  }

  protected reset(): void {
    this.pendingTransition.clear();
    this.workspace.clear();
    this.urls.revoke(this.previewUrl());
    this.previewUrl.set(null);
    this.file.set(null);
    this.regions.set([]);
    this.result.set(null);
    this.ranRegions.set(null);
    this.errorKey.set(null);
  }
}
