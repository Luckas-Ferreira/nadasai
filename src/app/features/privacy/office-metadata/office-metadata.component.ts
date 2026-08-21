import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppError, toMessageKey } from '../../../core/errors';
import { saveBlob } from '../../../core/image/download';
import { formatBytes, suffixedName } from '../../../core/image/image-file.util';
import {
  SENSITIVE_APP,
  SENSITIVE_CORE,
  cleanOfficeMetadata,
  officeKindOf,
  readOfficeMetadata,
  type OfficeKind,
  type OfficeMetadata,
} from '../../../core/office/metadata';
import { PendingTransitionService } from '../../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../../core/services/translation.service';
import { WorkspaceService, hydrateFromWorkspace } from '../../../core/services/workspace.service';
import { toolById } from '../../../core/tools/tools';
import { ActionBarComponent } from '../../../shared/ui/action-bar.component';
import { AlertComponent } from '../../../shared/ui/alert.component';
import { DropzoneComponent } from '../../../shared/ui/dropzone.component';
import { PanelComponent } from '../../../shared/ui/panel.component';
import { ToolPageComponent } from '../../../shared/ui/tool-page.component';

/** Rótulo humano para cada campo, nas duas línguas, via chave de dicionário. */
const LABEL_KEY: Record<string, TranslationKey> = {
  'dc:creator': 'office.f_creator',
  'cp:lastModifiedBy': 'office.f_last_modified_by',
  'dc:title': 'office.f_title',
  'dc:subject': 'office.f_subject',
  'cp:keywords': 'office.f_keywords',
  'cp:category': 'office.f_category',
  'dcterms:created': 'office.f_created',
  'dcterms:modified': 'office.f_modified',
  'cp:lastPrinted': 'office.f_last_printed',
  'cp:revision': 'office.f_revision',
  Company: 'office.f_company',
  Manager: 'office.f_manager',
  Application: 'office.f_application',
  AppVersion: 'office.f_app_version',
  Template: 'office.f_template',
  TotalTime: 'office.f_total_time',
  LastAuthor: 'office.f_last_author',
};

interface FieldRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  /** Identidade ou hábito — o painel destaca. */
  readonly sensitive: boolean;
}

@Component({
  selector: 'app-office-metadata',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
  ],
  templateUrl: './office-metadata.component.html',
})
export class OfficeMetadataComponent {
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);
  protected readonly tool = toolById('office-metadata');
  protected readonly i18n = inject(TranslationService);

  protected readonly file = signal<File | null>(null);
  protected readonly kind = signal<OfficeKind | null>(null);
  protected readonly metadata = signal<OfficeMetadata | null>(null);
  protected readonly sourceBytes = signal<Uint8Array | null>(null);

  protected readonly busy = signal(false);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly removed = signal(0);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly rows = computed<FieldRow[]>(() => {
    const meta = this.metadata();
    if (!meta) return [];

    const t = this.i18n.t();
    const sensitive = new Set<string>([...SENSITIVE_CORE, ...SENSITIVE_APP]);

    const build = (map: ReadonlyMap<string, string>): FieldRow[] =>
      [...map].map(([key, value]) => ({
        key,
        label: LABEL_KEY[key] ? t[LABEL_KEY[key]] : key,
        value,
        sensitive: sensitive.has(key),
      }));

    // Os sensíveis primeiro: quem abre esta ferramenta veio por causa deles.
    const all = [...build(meta.core), ...build(meta.app)];
    return [...all.filter((r) => r.sensitive), ...all.filter((r) => !r.sensitive)];
  });

  protected readonly found = computed(() => this.metadata()?.count ?? 0);
  protected readonly nothingFound = computed(() => !!this.metadata() && this.found() === 0);

  protected readonly sensitiveCount = computed(() => this.rows().filter((r) => r.sensitive).length);

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : '—';
  });

  protected readonly canRun = computed(() => !!this.sourceBytes() && this.found() > 0);

  protected readonly stale = computed(() => !this.resultBlob());

  constructor() {
    hydrateFromWorkspace('office-metadata', (file) => void this.load(file));
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'office-metadata');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  private async load(file: File | null): Promise<void> {
    this.clearResult();

    if (!file) {
      this.file.set(null);
      this.kind.set(null);
      this.metadata.set(null);
      this.sourceBytes.set(null);
      return;
    }

    try {
      const kind = officeKindOf(file.name);
      if (!kind) throw new AppError('unsupported_file');

      const bytes = new Uint8Array(await file.arrayBuffer());
      const meta = readOfficeMetadata(bytes, kind);

      this.file.set(file);
      this.kind.set(kind);
      this.sourceBytes.set(bytes);
      this.metadata.set(meta);
    } catch (err) {
      console.error('[OfficeMetadata] read failed:', err);
      // Um zip que não abre, ou que não é Office, cai aqui — e a mensagem certa
      // é "arquivo não suportado", não "algo deu errado".
      this.errorKey.set(err instanceof AppError ? toMessageKey(err) : 'error.unsupported_file');
      this.file.set(null);
      this.metadata.set(null);
      this.sourceBytes.set(null);
    }
  }

  protected run(): void {
    const bytes = this.sourceBytes();
    const kind = this.kind();
    if (!bytes || !kind || !this.canRun()) return;

    this.busy.set(true);
    this.errorKey.set(null);

    try {
      const { bytes: cleaned, removed } = cleanOfficeMetadata(bytes);

      const blob = new Blob([cleaned as unknown as BlobPart], {
        type: MIME[kind],
      });

      this.resultBlob.set(blob);
      this.removed.set(removed);

      // Relê o resultado para a tabela mostrar o que de fato sobrou, em vez de
      // eu afirmar que está limpo. É a mesma ideia do medidor de rede: a tela
      // mostra uma leitura, não uma promessa.
      this.metadata.set(readOfficeMetadata(cleaned, kind));

      // `produces: null` — um .docx limpo não entra em nenhuma outra ferramenta
      // daqui. Nada a registrar.
      this.pendingTransition.clear();
    } catch (err) {
      console.error('[OfficeMetadata] clean failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected download(): void {
    const blob = this.resultBlob();
    const session = this.workspace.session();
    const kind = this.kind();
    if (!blob || !session || !kind) return;

    saveBlob(blob, suffixedName(session.originalName, this.tool.suffix, kind));
  }

  protected reset(): void {
    this.file.set(null);
    this.kind.set(null);
    this.metadata.set(null);
    this.sourceBytes.set(null);
    this.clearResult();
    this.errorKey.set(null);
    this.workspace.clear();
  }

  private clearResult(): void {
    this.resultBlob.set(null);
    this.removed.set(0);
    this.pendingTransition.clear();
  }
}

const MIME: Record<OfficeKind, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
