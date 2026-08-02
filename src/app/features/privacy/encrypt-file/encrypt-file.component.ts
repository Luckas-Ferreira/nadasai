import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslationService } from '../../../core/services/translation.service';
import { toolById } from '../../../core/tools/tools';
import { ToolPageComponent } from '../../../shared/ui/tool-page.component';
import { DropzoneComponent } from '../../../shared/ui/dropzone.component';
import { PanelComponent } from '../../../shared/ui/panel.component';
import { ButtonDirective } from '../../../shared/ui/button.directive';
import { SegmentedComponent, type SegmentOption } from '../../../shared/ui/segmented.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { ActionBarComponent } from '../../../shared/ui/action-bar.component';
import { saveBlob } from '../../../core/image/download';
import { formatBytes } from '../../../core/image/image-file.util';

const MAGIC_V2 = new TextEncoder().encode('NADASAI_V2');
const MAGIC_V1 = new TextEncoder().encode('NADASAI_ENC');

function sanitizeDecryptedFilename(rawName: string): string {
  let name = rawName.replace(/\.enc$/i, '');
  const trappedExtMatch = name.match(/^(.*)\\.([a-zA-Z0-9]{2,6})\\s*\\(([^)]+)\\)$/);
  if (trappedExtMatch) {
    const [, base, ext, suffix] = trappedExtMatch;
    name = `${base} (${suffix}).${ext}`;
  }
  return name;
}

function getMimeTypeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mp3': return 'audio/mpeg';
    case 'wav': return 'audio/wav';
    case 'ogg': return 'audio/ogg';
    case 'm4a': return 'audio/mp4';
    case 'aac': return 'audio/aac';
    case 'flac': return 'audio/flac';
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'pdf': return 'application/pdf';
    case 'txt': return 'text/plain';
    case 'json': return 'application/json';
    case 'zip': return 'application/zip';
    default: return 'application/octet-stream';
  }
}

@Component({
  selector: 'app-encrypt-file',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    ButtonDirective,
    SegmentedComponent,
    IconComponent,
    ActionBarComponent,
  ],
  template: `
    <app-tool-page [toolId]="'encrypt-file'" [forceLoaded]="!!selectedFile()">

      <!-- STAGE: dropzone or file preview -->
      <div stage>
        @if (!selectedFile()) {
          <app-dropzone
            [accept]="'*/*'"
            [titleKey]="'encrypt.drag'"
            [hintKey]="'encrypt.drag_hint'"
            (fileSelected)="onFileSelected($event)"
          />
        } @else {
          <!-- File preview card -->
          <div class="flex min-h-[240px] flex-col items-center justify-center gap-5 rounded-xl border border-line bg-raised p-8">
            <span
              class="flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-surface text-accent shadow-panel"
            >
              <app-icon [name]="mode() === 'encrypt' ? 'lock' : 'unlock'" [size]="32" />
            </span>

            <div class="text-center min-w-0 max-w-sm">
              <p class="truncate text-base font-semibold text-text">{{ selectedFile()?.name }}</p>
              <p class="mt-1 font-mono text-xs text-faint">{{ formatBytes(selectedFile()?.size || 0) }}</p>
            </div>

            @if (done()) {
              <div class="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-accent">
                <app-icon name="check" [size]="16" />
                <span>{{ mode() === 'encrypt' ? i18n.t()['encrypt.btn_encrypt'] : i18n.t()['encrypt.btn_decrypt'] }} — OK</span>
              </div>
            }

            @if (errorMsg()) {
              <div class="flex items-center gap-2 rounded-lg border border-danger-line bg-danger-soft px-4 py-2 text-xs text-danger">
                <app-icon name="alert" [size]="15" />
                <span>{{ errorMsg() }}</span>
              </div>
            }
          </div>
        }
      </div>

      <!-- PANEL: mode + password + actions -->
      <div panel class="flex flex-col gap-4">
        @if (selectedFile()) {
          <app-panel>
            <div class="space-y-4">
              <!-- Mode switcher -->
              <app-segmented [options]="modeOptions" [(value)]="mode" />

              <!-- Password input -->
              <div class="space-y-1.5">
                <label class="text-xs font-semibold text-muted">{{ i18n.t()['encrypt.pass_label'] }}</label>
                <input
                  type="password"
                  [ngModel]="password()"
                  (ngModelChange)="password.set($event); done.set(false)"
                  [placeholder]="i18n.t()['encrypt.pass_placeholder']"
                  (keydown.enter)="password() && !busy() && process()"
                  class="w-full rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm text-text outline-none focus:border-accent transition"
                />
              </div>

              <!-- Process button -->
              <button
                type="button"
                appButton
                variant="primary"
                size="lg"
                block
                [busy]="busy()"
                [disabled]="!password() || busy()"
                (click)="process()"
              >
                <app-icon [name]="mode() === 'encrypt' ? 'lock' : 'unlock'" [size]="16" />
                <span>{{ mode() === 'encrypt' ? i18n.t()['encrypt.btn_encrypt'] : i18n.t()['encrypt.btn_decrypt'] }}</span>
              </button>
            </div>
          </app-panel>

          <div class="mt-1 flex justify-center border-t border-line pt-2">
            <button appButton variant="ghost" size="sm" (click)="clearFile()">
              {{ i18n.t()['common.reset'] }}
            </button>
          </div>
        }
      </div>

    </app-tool-page>
  `,
})
export class EncryptFileComponent {
  protected readonly i18n = inject(TranslationService);
  protected readonly tool = toolById('encrypt-file');
  protected readonly formatBytes = formatBytes;

  protected readonly mode = signal<'encrypt' | 'decrypt'>('encrypt');
  protected readonly modeOptions = this.buildModeOptions();

  protected readonly selectedFile = signal<File | null>(null);
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly errorMsg = signal<string | null>(null);

  protected onFileSelected(file: File): void {
    this.selectedFile.set(file);
    this.errorMsg.set(null);
    this.done.set(false);
    this.mode.set(file.name.toLowerCase().endsWith('.enc') ? 'decrypt' : 'encrypt');
  }

  protected clearFile(): void {
    this.selectedFile.set(null);
    this.password.set('');
    this.errorMsg.set(null);
    this.done.set(false);
  }

  protected async process(): Promise<void> {
    const file = this.selectedFile();
    const pass = this.password();
    if (!file || !pass) return;

    this.busy.set(true);
    this.errorMsg.set(null);
    this.done.set(false);

    try {
      const fileBuffer = await file.arrayBuffer();
      const isEncrypting = this.mode() === 'encrypt';

      if (isEncrypting) {
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const key = await this.deriveKey(pass, salt);

        const ciphertext = await window.crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          key,
          fileBuffer
        );

        const metaJson = JSON.stringify({ name: file.name, type: file.type || getMimeTypeFromFilename(file.name) });
        const metaBytes = new TextEncoder().encode(metaJson);
        const metaLen = metaBytes.length;

        const headerLen = MAGIC_V2.length + 2 + metaLen;
        const outBuffer = new Uint8Array(headerLen + salt.length + iv.length + ciphertext.byteLength);

        outBuffer.set(MAGIC_V2, 0);
        new DataView(outBuffer.buffer).setUint16(MAGIC_V2.length, metaLen, false);
        outBuffer.set(metaBytes, MAGIC_V2.length + 2);
        outBuffer.set(salt, headerLen);
        outBuffer.set(iv, headerLen + salt.length);
        outBuffer.set(new Uint8Array(ciphertext), headerLen + salt.length + iv.length);

        saveBlob(new Blob([outBuffer], { type: 'application/octet-stream' }), `${file.name}.enc`);
        this.done.set(true);
      } else {
        const data = new Uint8Array(fileBuffer);
        let salt: Uint8Array;
        let iv: Uint8Array;
        let ciphertext: Uint8Array;
        let restoredName = sanitizeDecryptedFilename(file.name);
        let restoredMime = getMimeTypeFromFilename(restoredName);

        let isV2 = true;
        for (let i = 0; i < MAGIC_V2.length; i++) {
          if (data[i] !== MAGIC_V2[i]) { isV2 = false; break; }
        }

        if (isV2) {
          const metaLen = new DataView(data.buffer).getUint16(MAGIC_V2.length, false);
          const metaBytes = data.slice(MAGIC_V2.length + 2, MAGIC_V2.length + 2 + metaLen);
          try {
            const meta = JSON.parse(new TextDecoder().decode(metaBytes));
            if (meta.name) restoredName = meta.name;
            if (meta.type) restoredMime = meta.type;
          } catch { /* ignore */ }
          const offset = MAGIC_V2.length + 2 + metaLen;
          salt = data.slice(offset, offset + 16);
          iv = data.slice(offset + 16, offset + 28);
          ciphertext = data.slice(offset + 28);
        } else {
          let isV1 = true;
          for (let i = 0; i < MAGIC_V1.length; i++) {
            if (data[i] !== MAGIC_V1[i]) { isV1 = false; break; }
          }
          if (isV1) {
            const offset = MAGIC_V1.length;
            salt = data.slice(offset, offset + 16);
            iv = data.slice(offset + 16, offset + 28);
            ciphertext = data.slice(offset + 28);
          } else {
            salt = data.slice(0, 16);
            iv = data.slice(16, 28);
            ciphertext = data.slice(28);
          }
        }

        const key = await this.deriveKey(pass, salt!);
        const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv! }, key, ciphertext!);

        restoredName = sanitizeDecryptedFilename(restoredName);
        if (!restoredName || restoredName === file.name) {
          restoredName = `decrypted_${file.name.replace(/\.enc$/i, '')}`;
        }

        saveBlob(new Blob([decrypted], { type: restoredMime }), restoredName);
        this.done.set(true);
      }
    } catch (err) {
      console.error(err);
      this.errorMsg.set(this.i18n.t()['encrypt.error_wrong_pass']);
    } finally {
      this.busy.set(false);
    }
  }

  private buildModeOptions(): readonly SegmentOption<'encrypt' | 'decrypt'>[] {
    return [
      { value: 'encrypt', label: this.i18n.t()['encrypt.mode_encrypt'] },
      { value: 'decrypt', label: this.i18n.t()['encrypt.mode_decrypt'] },
    ];
  }

  private async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const passKey = await window.crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return window.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      passKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }
}
