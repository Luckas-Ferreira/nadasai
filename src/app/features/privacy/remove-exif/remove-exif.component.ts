import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslationService, type TranslationKey } from '../../../core/services/translation.service';
import { toMessageKey } from '../../../core/errors';
import { type MetadataReport, formatGps } from '../../../core/exif/exif-parser';
import { STRIPPABLE_ACCEPT } from '../../../core/exif/strip';
import { ObjectUrlScope } from '../../../core/image/object-url';
import { saveBlob } from '../../../core/image/download';
import { formatBytes } from '../../../core/image/image-file.util';
import { MetadataStripperService, type StripOutcome } from './services/metadata-stripper.service';
import { ToolPageComponent } from '../../../shared/ui/tool-page.component';
import { DropzoneComponent } from '../../../shared/ui/dropzone.component';
import { PreviewSurfaceComponent } from '../../../shared/ui/preview-surface.component';
import { PanelComponent } from '../../../shared/ui/panel.component';
import { AlertComponent } from '../../../shared/ui/alert.component';
import { ActionBarComponent } from '../../../shared/ui/action-bar.component';
import { ButtonDirective } from '../../../shared/ui/button.directive';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

interface Finding {
  readonly label: string;
  readonly value: string;
  /** Present when the value is worth putting on the clipboard. */
  readonly copy?: string;
}

@Component({
  selector: 'app-remove-exif',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    FormsModule,
    ToolPageComponent,
    DropzoneComponent,
    PreviewSurfaceComponent,
    PanelComponent,
    AlertComponent,
    ActionBarComponent,
    ButtonDirective,
    IconComponent,
  ],
  templateUrl: './remove-exif.component.html',
})
export class RemoveExifComponent {
  protected readonly i18n = inject(TranslationService);
  private readonly stripper = inject(MetadataStripperService);
  private readonly urls = inject(ObjectUrlScope);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly formatBytes = formatBytes;

  /** TIFF is gone from here: it was advertised and never worked. */
  protected readonly ACCEPT = STRIPPABLE_ACCEPT;

  protected readonly file = signal<File | null>(null);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly report = signal<MetadataReport | null>(null);
  protected readonly result = signal<StripOutcome | null>(null);

  protected readonly keepOrientation = signal(true);
  protected readonly keepIcc = signal(true);

  protected readonly busy = signal(false);
  protected readonly errorKey = signal<TranslationKey | null>(null);
  protected readonly copied = signal(false);

  private readonly ranFile = signal<File | null>(null);
  private readonly ranOrientation = signal(true);
  private readonly ranIcc = signal(true);
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.copyTimer !== null) clearTimeout(this.copyTimer);
    });
  }

  protected readonly stale = computed(() =>
    !this.result() ||
    this.file() !== this.ranFile() ||
    this.keepOrientation() !== this.ranOrientation() ||
    this.keepIcc() !== this.ranIcc(),
  );

  /**
   * The findings list IS the tool. Showing somebody the coordinates of their
   * own house is what turns "we removed the metadata" from a claim into a
   * demonstration — the same instinct as the network probe on the home page.
   */
  protected readonly findings = computed<Finding[]>(() => {
    const r = this.report();
    if (!r) return [];

    const t = this.i18n.t();
    const out: Finding[] = [];
    const exif = r.exif;

    if (exif?.gps) {
      const coords = formatGps(exif.gps);
      out.push({ label: t['exif.f_gps'], value: coords, copy: coords });
      if (exif.gps.altitudeM !== undefined) {
        out.push({ label: t['exif.f_altitude'], value: `${Math.round(exif.gps.altitudeM)} m` });
      }
    }

    const push = (label: string, value: string | number | undefined): void => {
      if (value !== undefined && value !== '') out.push({ label, value: String(value) });
    };

    push(t['exif.f_camera'], [exif?.make, exif?.model].filter(Boolean).join(' ') || undefined);
    push(t['exif.f_lens'], exif?.lensModel);
    push(t['exif.f_serial'], exif?.bodySerial ?? exif?.lensSerial);
    push(t['exif.f_owner'], exif?.ownerName ?? exif?.artist);
    push(t['exif.f_software'], exif?.software);
    push(t['exif.f_taken'], exif?.dateTimeOriginal ?? exif?.dateTime);
    push(t['exif.f_description'], exif?.imageDescription ?? exif?.userComment);
    push(t['exif.f_copyright'], exif?.copyright);

    if (exif?.iso || exif?.fNumber || exif?.focalLengthMm) {
      const bits = [
        exif.focalLengthMm ? `${Math.round(exif.focalLengthMm)}mm` : null,
        exif.fNumber ? `f/${exif.fNumber}` : null,
        exif.iso ? `ISO ${exif.iso}` : null,
      ].filter(Boolean);
      push(t['exif.f_settings'], bits.join(' · '));
    }

    if (exif?.thumbnailBytes) push(t['exif.f_thumbnail'], formatBytes(exif.thumbnailBytes));
    if (exif?.hasMakerNote) {
      // Not decoded — vendor MakerNotes are proprietary and undocumented — but
      // its presence is the privacy-relevant fact, and it is stripped anyway.
      push(t['exif.f_makernote'], formatBytes(exif.makerNoteBytes));
    }
    if (r.xmpPackets > 0) push(t['exif.f_xmp'], formatBytes(r.xmpBytes));
    if (r.iptcBytes > 0) push(t['exif.f_iptc'], formatBytes(r.iptcBytes));
    for (const chunk of r.textChunks) out.push({ label: chunk.keyword, value: chunk.value });
    for (const comment of r.comments) push(t['exif.f_comment'], comment);

    return out;
  });

  protected async onFileSelected(file: File): Promise<void> {
    this.result.set(null);
    this.report.set(null);
    this.errorKey.set(null);

    try {
      const { report } = await this.stripper.inspect(file);
      this.report.set(report);
      this.file.set(file);
      this.previewUrl.set(this.urls.replace(this.previewUrl(), file));
    } catch (err) {
      // The file is dropped rather than kept, the same as the PDF tools do with
      // something that is not a PDF. Holding on to it left the panel offering a
      // strip button whose only possible outcome was the alert already on
      // screen — and TIFF, the format this refuses most often, arrives here
      // precisely because it cannot be stripped losslessly.
      this.errorKey.set(toMessageKey(err));
      this.file.set(null);
      this.urls.revoke(this.previewUrl());
      this.previewUrl.set(null);
    }
  }

  protected async run(): Promise<void> {
    const file = this.file();
    if (!file || this.busy()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    try {
      const outcome = await this.stripper.strip(file, {
        keepIcc: this.keepIcc(),
        keepOrientation: this.keepOrientation(),
      });
      this.result.set(outcome);
      this.ranFile.set(file);
      this.ranOrientation.set(this.keepOrientation());
      this.ranIcc.set(this.keepIcc());
    } catch (err) {
      // The old catch was a bare console.error, so a failure looked to the user
      // like the spinner simply stopping.
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected download(): void {
    const r = this.result();
    if (r) saveBlob(r.blob, r.filename);
  }

  protected copy(value: string): void {
    void navigator.clipboard.writeText(value);
    this.copied.set(true);
    if (this.copyTimer !== null) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
  }

  protected reset(): void {
    this.urls.revoke(this.previewUrl());
    this.previewUrl.set(null);
    this.file.set(null);
    this.report.set(null);
    this.result.set(null);
    this.ranFile.set(null);
    this.errorKey.set(null);
  }
}
