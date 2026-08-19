import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslationService } from '../../../core/services/translation.service';
import { ToolPageComponent } from '../../../shared/ui/tool-page.component';
import { PanelComponent } from '../../../shared/ui/panel.component';
import { ButtonDirective } from '../../../shared/ui/button.directive';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { SegmentedComponent, SegmentOption } from '../../../shared/ui/segmented.component';
import { DropzoneComponent } from '../../../shared/ui/dropzone.component';
import { ObjectUrlScope } from '../../../core/image/object-url';
import { saveBlob } from '../../../core/image/download';
import { QrCode, QrEccLevel } from '../../../core/qr/qr-encode';
import { renderQrToCanvas, renderQrToSvg, exportCanvasBlob } from '../../../core/qr/qr-render';
import {
  buildWifiPayload,
  buildPixPayload,
  buildVCardPayload,
  buildEmailPayload,
  buildWhatsappPayload,
} from '../../../core/qr/payload-builder';
import { parseQrPayload, ParsedQrPayload } from '../../../core/qr/payload-parser';
import { decodeQrFromImageData } from '../../../core/qr/qr-decode';

export type QrTab = 'generate' | 'scan';
export type QrContentType = 'url' | 'text' | 'wifi' | 'pix' | 'vcard' | 'email' | 'whatsapp';

@Component({
  selector: 'app-qr-code',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    FormsModule,
    ToolPageComponent,
    PanelComponent,
    ButtonDirective,
    IconComponent,
    SegmentedComponent,
    DropzoneComponent,
  ],
  templateUrl: './qr-code.component.html',
})
export class QrCodeComponent {
  protected readonly i18n = inject(TranslationService);
  private readonly urls = inject(ObjectUrlScope);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('qrCanvas') private canvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('videoPreview') private videoRef?: ElementRef<HTMLVideoElement>;

  // Tabs
  protected readonly activeTab = signal<QrTab>('generate');

  // Generator State
  protected readonly contentType = signal<QrContentType>('url');

  // Form Fields
  protected readonly urlInput = signal('https://nadasai.com');
  protected readonly textInput = signal('Mensagem confidencial 100% offline');

  // Wi-Fi
  protected readonly wifiSsid = signal('MinhaRede');
  protected readonly wifiPass = signal('');
  protected readonly wifiEnc = signal<'WPA' | 'WEP' | 'nopass'>('WPA');
  protected readonly wifiHidden = signal(false);

  // Pix
  protected readonly pixKey = signal('contato@nadasai.com');
  protected readonly pixName = signal('NADA SAI');
  protected readonly pixCity = signal('SAO PAULO');
  protected readonly pixAmount = signal<number | null>(null);
  protected readonly pixTxId = signal('');

  // vCard
  protected readonly vcardFn = signal('João');
  protected readonly vcardLn = signal('Silva');
  protected readonly vcardPhone = signal('+55 11 99999-9999');
  protected readonly vcardEmail = signal('joao.silva@exemplo.com');
  protected readonly vcardOrg = signal('Empresa');

  // Email
  protected readonly emailTo = signal('contato@exemplo.com');
  protected readonly emailSubject = signal('Olá');
  protected readonly emailBody = signal('');

  // WhatsApp
  protected readonly waPhone = signal('5511999999999');
  protected readonly waMsg = signal('Olá!');

  // Customization
  protected readonly fgColor = signal('#000000');
  protected readonly bgColor = signal('#ffffff');
  protected readonly isTransparentBg = signal(false);
  protected readonly eccLevel = signal<QrEccLevel>('M');
  protected readonly margin = signal(4);
  protected readonly size = signal(512);

  // Logo
  protected readonly logoImage = signal<HTMLImageElement | null>(null);

  // Copy feedback
  protected readonly copiedImage = signal(false);
  protected readonly copiedPayload = signal(false);
  protected readonly copiedScanField = signal<string | null>(null);

  // Scanner State
  protected readonly scanResult = signal<ParsedQrPayload | null>(null);
  protected readonly scanRawText = signal<string | null>(null);
  protected readonly scanError = signal<string | null>(null);
  protected readonly isCameraActive = signal(false);

  private cameraStream: MediaStream | null = null;
  private cameraScanAnimId: number | null = null;

  // Options for segmented controls
  protected readonly tabOptions = computed<readonly SegmentOption<QrTab>[]>(() => {
    const t = this.i18n.t();
    return [
      { value: 'generate', label: t['qrcode.tab_generate'] },
      { value: 'scan', label: t['qrcode.tab_scan'] },
    ];
  });

  protected readonly contentTypeOptions = computed<readonly SegmentOption<QrContentType>[]>(() => {
    const t = this.i18n.t();
    return [
      { value: 'url', label: t['qrcode.type_url'] },
      { value: 'text', label: t['qrcode.type_text'] },
      { value: 'wifi', label: t['qrcode.type_wifi'] },
      { value: 'pix', label: t['qrcode.type_pix'] },
      { value: 'vcard', label: t['qrcode.type_vcard'] },
      { value: 'email', label: t['qrcode.type_email'] },
      { value: 'whatsapp', label: t['qrcode.type_whatsapp'] },
    ];
  });

  protected readonly eccOptions = computed<readonly SegmentOption<QrEccLevel>[]>(() => {
    const t = this.i18n.t();
    return [
      { value: 'L', label: t['qrcode.ecc_l'] },
      { value: 'M', label: t['qrcode.ecc_m'] },
      { value: 'Q', label: t['qrcode.ecc_q'] },
      { value: 'H', label: t['qrcode.ecc_h'] },
    ];
  });

  // Effective ECC (forced to H or Q if logo is attached)
  protected readonly effectiveEcc = computed<QrEccLevel>(() => {
    if (this.logoImage()) {
      return this.eccLevel() === 'H' ? 'H' : 'Q';
    }
    return this.eccLevel();
  });

  // Computed Payload String
  protected readonly computedPayload = computed<string>(() => {
    switch (this.contentType()) {
      case 'url':
        return this.urlInput().trim() || 'https://nadasai.com';
      case 'text':
        return this.textInput().trim() || 'Texto';
      case 'wifi':
        return buildWifiPayload({
          ssid: this.wifiSsid(),
          password: this.wifiPass() || undefined,
          encryption: this.wifiEnc(),
          hidden: this.wifiHidden(),
        });
      case 'pix':
        return buildPixPayload({
          key: this.pixKey(),
          merchantName: this.pixName(),
          merchantCity: this.pixCity(),
          amount: this.pixAmount(),
          txId: this.pixTxId(),
        });
      case 'vcard':
        return buildVCardPayload({
          firstName: this.vcardFn(),
          lastName: this.vcardLn() || undefined,
          phone: this.vcardPhone() || undefined,
          email: this.vcardEmail() || undefined,
          organization: this.vcardOrg() || undefined,
        });
      case 'email':
        return buildEmailPayload(this.emailTo(), this.emailSubject(), this.emailBody());
      case 'whatsapp':
        return buildWhatsappPayload(this.waPhone(), this.waMsg());
    }
  });

  // QrCode instance
  protected readonly qrInstance = computed<QrCode | null>(() => {
    const payload = this.computedPayload();
    if (!payload) return null;
    try {
      return QrCode.encodeText(payload, this.effectiveEcc());
    } catch {
      return null;
    }
  });

  constructor() {
    afterNextRender(() => {
      this.render();
    });

    this.destroyRef.onDestroy(() => {
      this.stopCamera();
    });
  }

  protected setTab(tab: QrTab): void {
    this.activeTab.set(tab);
    if (tab === 'generate') {
      this.stopCamera();
      setTimeout(() => this.render(), 50);
    }
  }

  protected setContentType(type: QrContentType): void {
    this.contentType.set(type);
    setTimeout(() => this.render(), 10);
  }

  protected updateRender(): void {
    this.render();
  }

  private render(): void {
    const qr = this.qrInstance();
    const canvas = this.canvasRef?.nativeElement;
    if (!qr || !canvas) return;

    renderQrToCanvas(qr, canvas, {
      foregroundColor: this.fgColor(),
      backgroundColor: this.isTransparentBg() ? 'transparent' : this.bgColor(),
      margin: this.margin(),
      size: this.size(),
      logoImage: this.logoImage(),
    });
  }

  protected onLogoSelected(file: File): void {
    const url = this.urls.create(file);
    const img = new Image();
    img.onload = () => {
      this.logoImage.set(img);
      this.render();
    };
    img.src = url;
  }

  protected clearLogo(): void {
    this.logoImage.set(null);
    this.render();
  }

  // Download & Copy
  protected async downloadPng(): Promise<void> {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const blob = await exportCanvasBlob(canvas, 'image/png');
    saveBlob(blob, 'qrcode.png');
  }

  protected downloadSvg(): void {
    const qr = this.qrInstance();
    if (!qr) return;

    const svg = renderQrToSvg(qr, {
      foregroundColor: this.fgColor(),
      backgroundColor: this.isTransparentBg() ? 'transparent' : this.bgColor(),
      margin: this.margin(),
      size: this.size(),
    });

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    saveBlob(blob, 'qrcode.svg');
  }

  protected async copyImage(): Promise<void> {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !navigator.clipboard?.write) return;

    try {
      const blob = await exportCanvasBlob(canvas, 'image/png');
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      this.copiedImage.set(true);
      setTimeout(() => this.copiedImage.set(false), 2000);
    } catch {
      // Fallback
    }
  }

  protected copyPayload(): void {
    const payload = this.computedPayload();
    if (!payload || !navigator.clipboard?.writeText) return;

    void navigator.clipboard.writeText(payload);
    this.copiedPayload.set(true);
    setTimeout(() => this.copiedPayload.set(false), 2000);
  }

  // Scanner Methods
  protected onScanFile(file: File): void {
    this.scanError.set(null);
    this.scanResult.set(null);
    this.scanRawText.set(null);

    const url = this.urls.create(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const decoded = decodeQrFromImageData(imgData);

      if (decoded) {
        this.scanRawText.set(decoded.text);
        this.scanResult.set(parseQrPayload(decoded.text));
      } else {
        this.scanError.set(this.i18n.t()['qrcode.scan_no_code']);
      }
    };
    img.onerror = () => {
      this.scanError.set(this.i18n.t()['qrcode.scan_no_code']);
    };
    img.src = url;
  }

  protected async toggleCamera(): Promise<void> {
    if (this.isCameraActive()) {
      this.stopCamera();
    } else {
      await this.startCamera();
    }
  }

  private async startCamera(): Promise<void> {
    this.scanError.set(null);
    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      this.isCameraActive.set(true);

      setTimeout(() => {
        const video = this.videoRef?.nativeElement;
        if (video && this.cameraStream) {
          video.srcObject = this.cameraStream;
          video.play().catch(() => {});
          this.runCameraLoop();
        }
      }, 100);
    } catch {
      this.isCameraActive.set(false);
      this.scanError.set('Permissão de câmera não concedida ou dispositivo indisponível.');
    }
  }

  private runCameraLoop(): void {
    const video = this.videoRef?.nativeElement;
    if (!video || !this.isCameraActive()) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const decoded = decodeQrFromImageData(imgData);
        if (decoded) {
          this.scanRawText.set(decoded.text);
          this.scanResult.set(parseQrPayload(decoded.text));
          this.stopCamera();
          return;
        }
      }
    }

    this.cameraScanAnimId = requestAnimationFrame(() => this.runCameraLoop());
  }

  protected stopCamera(): void {
    if (this.cameraScanAnimId !== null) {
      cancelAnimationFrame(this.cameraScanAnimId);
      this.cameraScanAnimId = null;
    }
    if (this.cameraStream) {
      for (const track of this.cameraStream.getTracks()) track.stop();
      this.cameraStream = null;
    }
    this.isCameraActive.set(false);
  }

  protected copyField(val: string, key: string): void {
    if (!val || !navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(val);
    this.copiedScanField.set(key);
    setTimeout(() => this.copiedScanField.set(null), 2000);
  }

  protected loadInGenerator(): void {
    const res = this.scanResult();
    if (!res) return;

    if (res.type === 'wifi') {
      this.contentType.set('wifi');
      this.wifiSsid.set(res.ssid);
      this.wifiPass.set(res.password || '');
      this.wifiEnc.set(res.encryption as any);
      this.wifiHidden.set(res.hidden);
    } else if (res.type === 'pix') {
      this.contentType.set('pix');
      this.pixKey.set(res.key);
      if (res.name) this.pixName.set(res.name);
      if (res.city) this.pixCity.set(res.city);
      if (res.amount) this.pixAmount.set(res.amount);
      if (res.txId) this.pixTxId.set(res.txId);
    } else if (res.type === 'vcard') {
      this.contentType.set('vcard');
      this.vcardFn.set(res.name);
      if (res.phone) this.vcardPhone.set(res.phone);
      if (res.email) this.vcardEmail.set(res.email);
      if (res.organization) this.vcardOrg.set(res.organization);
    } else if (res.type === 'url') {
      this.contentType.set('url');
      this.urlInput.set(res.url);
    } else if (res.type === 'email') {
      this.contentType.set('email');
      this.emailTo.set(res.email);
      if (res.subject) this.emailSubject.set(res.subject);
      if (res.body) this.emailBody.set(res.body);
    } else if (res.type === 'whatsapp') {
      this.contentType.set('whatsapp');
      this.waPhone.set(res.phone);
      if (res.message) this.waMsg.set(res.message);
    } else if (res.type === 'phone') {
      this.contentType.set('text');
      this.textInput.set(res.phone);
    } else {
      this.contentType.set('text');
      this.textInput.set(res.text);
    }

    this.setTab('generate');
  }

  protected downloadVCard(raw: string): void {
    const blob = new Blob([raw], { type: 'text/vcard;charset=utf-8' });
    saveBlob(blob, 'contato.vcf');
  }
}
