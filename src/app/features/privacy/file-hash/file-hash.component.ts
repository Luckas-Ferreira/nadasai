import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslationService } from '../../../core/services/translation.service';
import { toolById } from '../../../core/tools/tools';
import { ToolPageComponent } from '../../../shared/ui/tool-page.component';
import { DropzoneComponent } from '../../../shared/ui/dropzone.component';
import { PanelComponent } from '../../../shared/ui/panel.component';
import { ButtonDirective } from '../../../shared/ui/button.directive';
import { SegmentedComponent, type SegmentOption } from '../../../shared/ui/segmented.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { formatBytes } from '../../../core/image/image-file.util';

function md5(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  const K = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391
  ];
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
  ];

  const bitLen = bytes.length * 8;
  const paddingLen = (bytes.length % 64 < 56) ? 56 - (bytes.length % 64) : 120 - (bytes.length % 64);
  const padded = new Uint8Array(bytes.length + paddingLen + 8);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLen & 0xffffffff, true);
  view.setUint32(padded.length - 4, Math.floor(bitLen / 0x100000000), true);

  for (let i = 0; i < padded.length; i += 64) {
    const M = new Uint32Array(16);
    for (let j = 0; j < 16; j++) M[j] = view.getUint32(i + j * 4, true);
    let AA = a, BB = b, CC = c, DD = d;
    for (let g = 0; g < 64; g++) {
      let f = 0, gIdx = g;
      if (g < 16) { f = (b & c) | (~b & d); }
      else if (g < 32) { f = (d & b) | (~d & c); gIdx = (5 * g + 1) % 16; }
      else if (g < 48) { f = b ^ c ^ d; gIdx = (3 * g + 5) % 16; }
      else { f = c ^ (b | ~d); gIdx = (7 * g) % 16; }
      const temp = d; d = c; c = b;
      const sum = (a + f + K[g] + M[gIdx]) >>> 0;
      b = (b + ((sum << S[g]) | (sum >>> (32 - S[g])))) >>> 0;
      a = temp;
    }
    a = (a + AA) >>> 0; b = (b + BB) >>> 0; c = (c + CC) >>> 0; d = (d + DD) >>> 0;
  }

  const hex = (n: number) => {
    let s = '';
    for (let i = 0; i < 4; i++) s += ((n >> (i * 8)) & 0xff).toString(16).padStart(2, '0');
    return s;
  };
  return hex(a) + hex(b) + hex(c) + hex(d);
}

@Component({
  selector: 'app-file-hash',
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
  ],
  template: `
    <app-tool-page [toolId]="'file-hash'" [forceLoaded]="!!(file() || textInput())">

      <!-- STAGE: dropzone or hashes display -->
      <div stage>
        @if (mode() === 'file' && !file()) {
          <app-dropzone
            [accept]="'*/*'"
            [titleKey]="'hash.drag'"
            [hintKey]="'hash.drag_hint'"
            (fileSelected)="onFileSelected($event)"
          />
        } @else if (mode() === 'text') {
          <app-panel>
            <textarea
              [ngModel]="textInput()"
              (ngModelChange)="textInput.set($event); calculateTextHashes()"
              [placeholder]="i18n.t()['hash.text_placeholder']"
              rows="8"
              class="w-full rounded-md border border-line bg-surface p-3 text-xs font-mono text-text focus:border-accent outline-none transition resize-none"
            ></textarea>
          </app-panel>
        } @else if (file()) {
          <!-- File info card -->
          <div class="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-xl border border-line bg-raised p-8">
            <span class="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface text-accent shadow-panel">
              <app-icon name="doc" [size]="28" />
            </span>
            <div class="text-center">
              <p class="max-w-xs truncate text-base font-semibold text-text">{{ file()?.name }}</p>
              <p class="mt-1 font-mono text-xs text-faint">{{ formatBytes(file()?.size || 0) }}</p>
            </div>
            <button type="button" appButton variant="ghost" size="sm" (click)="file.set(null); clearHashes()">
              {{ i18n.t()['common.clear'] }}
            </button>
          </div>
        }

        <!-- Hashes display (shown in stage when hashes exist) -->
        @if (sha256()) {
          <div class="mt-5 space-y-3">
            @for (item of hashItems(); track item.label) {
              <div class="space-y-1">
                <div class="flex justify-between text-xs text-muted">
                  <span class="font-semibold">{{ item.label }}</span>
                  <button
                    (click)="copy(item.value)"
                    class="flex items-center gap-1 hover:text-accent transition text-xs"
                  >
                    <app-icon name="copy" [size]="12" />
                    {{ i18n.t()['hash.copy'] }}
                  </button>
                </div>
                <div
                  class="break-all rounded-md border border-line bg-raised p-2.5 font-mono text-xs select-all"
                  [class.text-accent]="item.isMain"
                  [class.text-text]="!item.isMain"
                >{{ item.value }}</div>
              </div>
            }
          </div>
        }
      </div>

      <!-- PANEL: mode + checksum verify -->
      <div panel class="flex flex-col gap-4">
        <app-panel>
          <div class="space-y-4">
            <!-- Mode switcher -->
            <app-segmented [options]="modeOptions" [(value)]="mode" />

            @if (sha256()) {
              <!-- Expected hash verify -->
              <div class="space-y-1.5 border-t border-line pt-4">
                <label class="text-xs font-semibold text-muted">{{ i18n.t()['hash.expected_label'] }}</label>
                <input
                  type="text"
                  [ngModel]="expectedHash()"
                  (ngModelChange)="expectedHash.set($event)"
                  [placeholder]="i18n.t()['hash.expected_placeholder']"
                  class="w-full rounded-md border border-line bg-surface px-3.5 py-2 text-xs font-mono text-text focus:border-accent outline-none transition"
                />
                @if (checksumStatus() === 'match') {
                  <p class="text-xs font-semibold text-accent">{{ i18n.t()['hash.match'] }}</p>
                } @else if (checksumStatus() === 'mismatch') {
                  <p class="text-xs font-semibold text-danger">{{ i18n.t()['hash.mismatch'] }}</p>
                }
              </div>

              <div class="mt-1 flex justify-center border-t border-line pt-2">
                <button appButton variant="ghost" size="sm" (click)="reset()">
                  {{ i18n.t()['common.reset'] }}
                </button>
              </div>
            }
          </div>
        </app-panel>
      </div>

    </app-tool-page>
  `,
})
export class FileHashComponent {
  protected readonly i18n = inject(TranslationService);
  protected readonly tool = toolById('file-hash');
  protected readonly formatBytes = formatBytes;

  protected readonly mode = signal<'file' | 'text'>('file');
  protected readonly modeOptions: readonly SegmentOption<'file' | 'text'>[] = [
    { value: 'file', label: 'De Arquivo' },
    { value: 'text', label: 'De Texto' },
  ];

  protected readonly file = signal<File | null>(null);
  protected readonly textInput = signal('');
  protected readonly expectedHash = signal('');
  protected readonly sha256 = signal('');
  protected readonly sha512 = signal('');
  protected readonly md5Hash = signal('');

  protected readonly hashItems = computed(() => [
    { label: 'SHA-256', value: this.sha256(), isMain: true },
    { label: 'SHA-512', value: this.sha512(), isMain: false },
    { label: 'MD5', value: this.md5Hash(), isMain: false },
  ]);

  protected async onFileSelected(f: File): Promise<void> {
    this.file.set(f);
    const buffer = await f.arrayBuffer();
    this.sha256.set(this.toHex(await window.crypto.subtle.digest('SHA-256', buffer)));
    this.sha512.set(this.toHex(await window.crypto.subtle.digest('SHA-512', buffer)));
    this.md5Hash.set(md5(buffer));
  }

  protected async calculateTextHashes(): Promise<void> {
    const text = this.textInput();
    if (!text) { this.clearHashes(); return; }
    const buffer = new TextEncoder().encode(text).buffer as ArrayBuffer;
    this.sha256.set(this.toHex(await window.crypto.subtle.digest('SHA-256', buffer)));
    this.sha512.set(this.toHex(await window.crypto.subtle.digest('SHA-512', buffer)));
    this.md5Hash.set(md5(buffer));
  }

  protected readonly checksumStatus = computed(() => {
    const exp = this.expectedHash().trim().toLowerCase();
    if (!exp) return 'none';
    const s256 = this.sha256().toLowerCase();
    const s512 = this.sha512().toLowerCase();
    const m5 = this.md5Hash().toLowerCase();
    return (exp === s256 || exp === s512 || exp === m5) ? 'match' : 'mismatch';
  });

  protected clearHashes(): void {
    this.sha256.set(''); this.sha512.set(''); this.md5Hash.set('');
  }

  protected reset(): void {
    this.file.set(null);
    this.textInput.set('');
    this.expectedHash.set('');
    this.clearHashes();
  }

  protected copy(val: string): void {
    if (val) navigator.clipboard.writeText(val);
  }

  private toHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}
