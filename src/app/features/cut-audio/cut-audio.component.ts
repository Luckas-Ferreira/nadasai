import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
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
import { ImageStateService } from '../../core/services/image-state.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { AudioTrimmerService } from './services/audio-trimmer.service';

@Component({
  selector: 'app-cut-audio',
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
  templateUrl: './cut-audio.component.html',
})
export class CutAudioComponent implements AfterViewInit, OnDestroy {
  private readonly urls = inject(ObjectUrlScope);
  protected readonly tool = toolById('cut-audio');
  private readonly trimmer = inject(AudioTrimmerService);

  protected readonly state = inject(ImageStateService);
  protected readonly i18n = inject(TranslationService);

  protected readonly sourceUrl = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly progress = signal(0);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly audioBuffer = signal<AudioBuffer | null>(null);
  protected readonly totalDuration = signal<number>(0);

  protected readonly startTime = signal<number>(0);
  protected readonly endTime = signal<number>(0);
  protected readonly fadeIn = signal<number>(0);
  protected readonly fadeOut = signal<number>(0);

  protected readonly isPlaying = signal<boolean>(false);
  protected readonly playheadTime = signal<number | null>(null);

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('waveformCanvas');

  private audioCtx: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private playbackAnimFrame: number | null = null;
  private playbackStartTime = 0;
  private playbackStartOffset = 0;

  protected readonly sourceFile = this.state.currentFile;

  protected readonly selectionDuration = computed(() => {
    const start = this.startTime();
    const end = this.endTime();
    return Math.max(0, end - start);
  });

  constructor() {
    const file = this.sourceFile();
    if (file) {
      this.sourceUrl.set(this.urls.create(file));
      void this.loadAudio(file);
    }
  }

  ngAfterViewInit(): void {
    this.redrawWaveform();
  }

  ngOnDestroy(): void {
    this.stopPlayback();
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);
    try {
      this.state.load(file);
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
      const decoded = await this.trimmer.decodeAudio(file);
      this.audioBuffer.set(decoded.buffer);
      this.totalDuration.set(decoded.duration);
      this.startTime.set(0);
      this.endTime.set(decoded.duration);
      this.progress.set(100);

      setTimeout(() => this.redrawWaveform(), 50);
    } catch (err) {
      console.error('[CutAudioComponent] Audio decode error:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected redrawWaveform(): void {
    const canvas = this.canvasRef()?.nativeElement;
    const buffer = this.audioBuffer();
    if (!canvas || !buffer) return;

    this.trimmer.renderWaveform(
      canvas,
      buffer,
      this.startTime(),
      this.endTime(),
      this.playheadTime()
    );
  }

  protected onStartChange(val: number): void {
    const newStart = Math.min(val, this.endTime() - 0.1);
    this.startTime.set(Math.max(0, newStart));
    this.redrawWaveform();
  }

  protected onEndChange(val: number): void {
    const newEnd = Math.max(val, this.startTime() + 0.1);
    this.endTime.set(Math.min(this.totalDuration(), newEnd));
    this.redrawWaveform();
  }

  protected togglePlay(): void {
    if (this.isPlaying()) {
      this.stopPlayback();
    } else {
      this.startPlayback();
    }
  }

  private startPlayback(): void {
    const buffer = this.audioBuffer();
    if (!buffer) return;

    this.stopPlayback();

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioCtx = new AudioCtx();

    const start = this.startTime();
    const duration = this.selectionDuration();

    this.sourceNode = this.audioCtx.createBufferSource();
    this.sourceNode.buffer = buffer;
    this.sourceNode.connect(this.audioCtx.destination);

    this.playbackStartTime = this.audioCtx.currentTime;
    this.playbackStartOffset = start;

    this.sourceNode.start(0, start, duration);
    this.isPlaying.set(true);

    this.sourceNode.onended = () => {
      this.stopPlayback();
    };

    const updatePlayhead = () => {
      if (!this.isPlaying() || !this.audioCtx) return;
      const elapsed = this.audioCtx.currentTime - this.playbackStartTime;
      const currentPos = this.playbackStartOffset + elapsed;

      if (currentPos >= this.endTime()) {
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
        // ignore if already stopped
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

  protected async downloadCutAudio(): Promise<void> {
    const buffer = this.audioBuffer();
    const file = this.sourceFile();
    if (!buffer || !file || this.busy()) return;

    this.busy.set(true);
    try {
      const blob = await this.trimmer.trimAudio(buffer, {
        startTime: this.startTime(),
        endTime: this.endTime(),
        fadeIn: this.fadeIn(),
        fadeOut: this.fadeOut(),
      });

      saveBlob(blob, suffixedName(file.name, this.tool.suffix, 'wav'));
    } catch (err) {
      console.error('[CutAudioComponent] Export error:', err);
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
    this.state.clear();
  }
}
