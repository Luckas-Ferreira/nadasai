import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { saveBlob } from '../../core/image/download';
import { suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { toMessageKey } from '../../core/errors';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import {
  AudioBitrate,
  AudioChannels,
  AudioConverterService,
  TargetAudioFormat,
} from './services/audio-converter.service';

@Component({
  selector: 'app-convert-audio',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    CommonModule,
    FormsModule,
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
    IconComponent,
  ],
  templateUrl: './convert-audio.component.html',
})
export class ConvertAudioComponent implements AfterViewInit, OnDestroy {
  private readonly urls = inject(ObjectUrlScope);
  protected readonly tool = toolById('convert-audio');
  private readonly converter = inject(AudioConverterService);

  protected readonly i18n = inject(TranslationService);

  protected readonly currentFile = signal<File | null>(null);
  protected readonly sourceUrl = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly progress = signal(0);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly audioBuffer = signal<AudioBuffer | null>(null);
  protected readonly totalDuration = signal<number>(0);
  protected readonly sourceFormat = signal<string>('MP3');

  // Converter options
  // Typed on the class, not inline in the template: an inline array literal infers
  // `string[]`, and `targetFormat.set(fmt)` then fails strictTemplates.
  protected readonly formats: readonly TargetAudioFormat[] = [
    'mp3',
    'wav',
    'ogg',
    'm4a',
    'webm',
    'flac',
  ];
  protected readonly targetFormat = signal<TargetAudioFormat>('mp3');
  protected readonly channels = signal<AudioChannels>('original');
  protected readonly sampleRate = signal<number>(0); // 0 = original
  protected readonly bitrate = signal<AudioBitrate>('320');

  // Player controls
  protected readonly isPlaying = signal<boolean>(false);
  protected readonly playheadTime = signal<number | null>(null);

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('waveformCanvas');

  private audioCtx: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private playbackAnimFrame: number | null = null;
  private playbackStartTime = 0;
  private playbackStartOffset = 0;

  ngAfterViewInit(): void {
    this.redrawWaveform();
  }

  ngOnDestroy(): void {
    this.stopPlayback();
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);
    try {
      this.currentFile.set(file);
      this.sourceUrl.set(this.urls.create(file));
      void this.loadAudio(file);
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  private async loadAudio(file: File): Promise<void> {
    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(20);

    try {
      const decoded = await this.converter.decodeAudio(file);
      this.audioBuffer.set(decoded.buffer);
      this.totalDuration.set(decoded.duration);
      this.sourceFormat.set(decoded.format.toUpperCase());
      this.progress.set(100);

      // Default target format to wav if source is mp3, or mp3 if source is wav
      if (decoded.format === 'mp3') {
        this.targetFormat.set('wav');
      } else {
        this.targetFormat.set('mp3');
      }

      setTimeout(() => this.redrawWaveform(), 50);
    } catch (err) {
      console.error('[ConvertAudioComponent] Audio decode error:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected redrawWaveform(): void {
    const canvas = this.canvasRef()?.nativeElement;
    const buffer = this.audioBuffer();
    if (!canvas || !buffer) return;

    this.converter.renderWaveform(canvas, buffer, this.playheadTime());
  }

  protected onCanvasClick(event: MouseEvent): void {
    const canvas = this.canvasRef()?.nativeElement;
    const buffer = this.audioBuffer();
    if (!canvas || !buffer) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const width = rect.width;
    const clickedTime = Math.min(buffer.duration, Math.max(0, (clickX / width) * buffer.duration));

    this.playheadTime.set(clickedTime);
    this.startPlayback(clickedTime);
  }

  protected togglePlay(): void {
    if (this.isPlaying()) {
      this.stopPlayback();
    } else {
      this.startPlayback(this.playheadTime() || 0);
    }
  }

  private startPlayback(seekTime = 0): void {
    const buffer = this.audioBuffer();
    if (!buffer) return;

    this.stopPlayback();

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioCtx = new AudioCtx();

    const remainingDuration = Math.max(0.1, buffer.duration - seekTime);

    this.sourceNode = this.audioCtx.createBufferSource();
    this.sourceNode.buffer = buffer;
    this.sourceNode.connect(this.audioCtx.destination);

    this.playbackStartTime = this.audioCtx.currentTime;
    this.playbackStartOffset = seekTime;

    this.sourceNode.start(0, seekTime, remainingDuration);
    this.isPlaying.set(true);

    this.sourceNode.onended = () => {
      this.stopPlayback();
    };

    const updatePlayhead = () => {
      if (!this.isPlaying() || !this.audioCtx) return;
      const elapsed = this.audioCtx.currentTime - this.playbackStartTime;
      const currentPos = this.playbackStartOffset + elapsed;

      if (currentPos >= buffer.duration) {
        this.stopPlayback();
      } else {
        this.playheadTime.set(currentPos);
        this.redrawWaveform();
        this.playbackAnimFrame = requestAnimationFrame(updatePlayhead);
      }
    };

    this.playbackAnimFrame = requestAnimationFrame(updatePlayhead);
  }

  private stopPlayback(): void {
    if (this.playbackAnimFrame !== null) {
      cancelAnimationFrame(this.playbackAnimFrame);
      this.playbackAnimFrame = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch {
        // ignore
      }
      this.sourceNode = null;
    }

    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
    }

    this.isPlaying.set(false);
    this.playheadTime.set(null);
    this.redrawWaveform();
  }

  protected async downloadConvertedAudio(): Promise<void> {
    const buffer = this.audioBuffer();
    const file = this.currentFile();
    if (!buffer || !file || this.busy()) return;

    this.busy.set(true);
    this.progress.set(10);

    try {
      const blob = await this.converter.convertAudio(
        buffer,
        {
          targetFormat: this.targetFormat(),
          channels: this.channels(),
          sampleRate: this.sampleRate(),
          bitrate: this.bitrate(),
        },
        (pct) => this.progress.set(pct)
      );

      const targetExt = this.targetFormat();
      saveBlob(blob, suffixedName(file.name, this.tool.suffix, targetExt));
    } catch (err) {
      console.error('[ConvertAudioComponent] Export error:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(1).padStart(4, '0');
    return `${m.toString().padStart(2, '0')}:${s}`;
  }

  protected reset(): void {
    this.stopPlayback();
    this.audioBuffer.set(null);
    this.sourceUrl.set(null);
    this.currentFile.set(null);
  }
}
