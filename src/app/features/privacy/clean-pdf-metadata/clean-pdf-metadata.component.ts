import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslationService, type TranslationKey } from '../../../core/services/translation.service';
import { toMessageKey } from '../../../core/errors';
import { saveBlob } from '../../../core/image/download';
import { formatBytes } from '../../../core/image/image-file.util';
import { PdfMetadataService, type CleanPdfOutcome, type PdfMetadataReport } from './services/pdf-metadata.service';
import { ToolPageComponent } from '../../../shared/ui/tool-page.component';
import { DropzoneComponent } from '../../../shared/ui/dropzone.component';
import { PanelComponent } from '../../../shared/ui/panel.component';
import { AlertComponent } from '../../../shared/ui/alert.component';
import { ActionBarComponent } from '../../../shared/ui/action-bar.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

interface Finding {
  readonly label: string;
  readonly value: string;
}

@Component({
  selector: 'app-clean-pdf-metadata',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    AlertComponent,
    ActionBarComponent,
    IconComponent,
  ],
  templateUrl: './clean-pdf-metadata.component.html',
})
export class CleanPdfMetadataComponent {
  protected readonly i18n = inject(TranslationService);
  private readonly metadata = inject(PdfMetadataService);
  protected readonly formatBytes = formatBytes;

  protected readonly file = signal<File | null>(null);
  protected readonly report = signal<PdfMetadataReport | null>(null);
  protected readonly result = signal<CleanPdfOutcome | null>(null);

  protected readonly removeInfo = signal(true);
  protected readonly removeXmp = signal(true);
  protected readonly removePageMetadata = signal(true);
  protected readonly removeAttachments = signal(false);

  protected readonly busy = signal(false);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  private readonly ranFile = signal<File | null>(null);
  private readonly ranFlags = signal<string | null>(null);

  protected readonly options = [
    { key: 'cleanpdf.opt_info' as const, value: this.removeInfo, set: (v: boolean) => this.set(this.removeInfo, v) },
    { key: 'cleanpdf.opt_xmp' as const, value: this.removeXmp, set: (v: boolean) => this.set(this.removeXmp, v) },
    { key: 'cleanpdf.opt_pages' as const, value: this.removePageMetadata, set: (v: boolean) => this.set(this.removePageMetadata, v) },
    { key: 'cleanpdf.opt_attachments' as const, value: this.removeAttachments, set: (v: boolean) => this.set(this.removeAttachments, v) },
  ];

  private readonly flagKey = computed(() =>
    [this.removeInfo(), this.removeXmp(), this.removePageMetadata(), this.removeAttachments()].join(','),
  );

  protected readonly stale = computed(() =>
    !this.result() || this.file() !== this.ranFile() || this.flagKey() !== this.ranFlags(),
  );

  /**
   * Showing what is in there before removing it is the tool's whole
   * differentiator — `pagesWithMetadata` and the attachment list in particular
   * are findings nobody expects a PDF to be carrying.
   */
  protected readonly findings = computed<Finding[]>(() => {
    const r = this.report();
    if (!r) return [];

    const t = this.i18n.t();
    const out: Finding[] = [];
    const push = (label: string, value: string | undefined): void => {
      if (value) out.push({ label, value });
    };

    push(t['cleanpdf.f_title'], r.info.title);
    push(t['cleanpdf.f_author'], r.info.author);
    push(t['cleanpdf.f_subject'], r.info.subject);
    push(t['cleanpdf.f_keywords'], r.info.keywords);
    push(t['cleanpdf.f_creator'], r.info.creator);
    push(t['cleanpdf.f_producer'], r.info.producer);
    push(t['cleanpdf.f_created'], r.info.creationDate);
    push(t['cleanpdf.f_modified'], r.info.modDate);

    for (const [key, value] of Object.entries(r.info.custom)) out.push({ label: key, value });

    if (r.hasXmp) push(t['cleanpdf.f_xmp'], formatBytes(r.xmpBytes));
    if (r.pagesWithMetadata.length > 0) {
      push(t['cleanpdf.f_pages'], r.pagesWithMetadata.join(', '));
    }
    if (r.attachments.length > 0) push(t['cleanpdf.f_attachments'], r.attachments.join(', '));

    return out;
  });

  protected async onFileSelected(file: File): Promise<void> {
    this.file.set(file);
    this.report.set(null);
    this.result.set(null);
    this.errorKey.set(null);

    try {
      this.report.set(await this.metadata.read(file));
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  protected async run(): Promise<void> {
    const file = this.file();
    if (!file || this.busy()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    try {
      this.result.set(
        await this.metadata.clean({
          file,
          removeInfo: this.removeInfo(),
          removeXmp: this.removeXmp(),
          removePageMetadata: this.removePageMetadata(),
          removeAttachments: this.removeAttachments(),
        }),
      );
      this.ranFile.set(file);
      this.ranFlags.set(this.flagKey());
    } catch (err) {
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
    this.file.set(null);
    this.report.set(null);
    this.result.set(null);
    this.ranFile.set(null);
    this.ranFlags.set(null);
    this.errorKey.set(null);
  }

  private set(target: { set(v: boolean): void }, value: boolean): void {
    target.set(value);
    this.result.set(null);
  }
}
