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
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { AudioTrimmerService, CutMode } from './services/audio-trimmer.service';

type DragTarget = 'start' | 'end' | null;

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

  protected readonly i18n = inject(TranslationService);

  protected readonly currentFile = signal<File | null>(null);
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
  protected readonly cutMode = signal<CutMode>('keep');

  protected readonly isPlaying = signal<boolean>(false);
  protected readonly playheadTime = signal<number | null>(null);

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('waveformCanvas');

  private audioCtx: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private playbackAnimFrame: number | null = null;
  private playbackStartTime = 0;
  private playbackStartOffset = 0;

  private isDraggingHandle: DragTarget = null;

  protected readonly selectionDuration = computed(() => {
    const start = this.startTime();
    const end = this.endTime();
    return Math.max(0, end - start);
  });

  protected readonly outputDuration = computed(() => {
    if (this.cutMode() === 'keep') {
      return this.selectionDuration();
    } else {
      return Math.max(0, this.totalDuration() - this.selectionDuration());
    }
  });

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
      this.fadeIn(),
      this.fadeOut(),
      this.cutMode(),
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

  protected adjustStart(delta: number): void {
    this.onStartChange(this.startTime() + delta);
  }

  protected adjustEnd(delta: number): void {
    this.onEndChange(this.endTime() + delta);
  }

  protected onFadeInChange(val: number): void {
    this.fadeIn.set(val);
    this.redrawWaveform();
  }

  protected onFadeOutChange(val: number): void {
    this.fadeOut.set(val);
    this.redrawWaveform();
  }

  /**
   * Pointer & Canvas Click/Drag Interactions
   */
  protected onCanvasPointerDown(event: PointerEvent): void {
    const canvas = this.canvasRef()?.nativeElement;
    const buffer = this.audioBuffer();
    if (!canvas || !buffer) return;

    canvas.setPointerCapture?.(event.pointerId);

    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const width = rect.width;
    const duration = buffer.duration;

    const startPx = (this.startTime() / duration) * width;
    const endPx = (this.endTime() / duration) * width;

    // Check if pointer is near start or end handle (within 16px)
    if (Math.abs(clickX - startPx) < 16) {
      this.isDraggingHandle = 'start';
    } else if (Math.abs(clickX - endPx) < 16) {
      this.isDraggingHandle = 'end';
    } else {
      this.isDraggingHandle = null;
      const clickedTime = Math.min(duration, Math.max(0, (clickX / width) * duration));
      this.playheadTime.set(clickedTime);
      this.startPlayback(clickedTime);
    }
  }

  protected onCanvasPointerMove(event: PointerEvent): void {
    const canvas = this.canvasRef()?.nativeElement;
    const buffer = this.audioBuffer();
    if (!canvas || !buffer) return;

    const rect = canvas.getBoundingClientRect();
    const currentX = event.clientX - rect.left;
    const width = rect.width;
    const duration = buffer.duration;

    const startPx = (this.startTime() / duration) * width;
    const endPx = (this.endTime() / duration) * width;

    if (Math.abs(currentX - startPx) < 16 || Math.abs(currentX - endPx) < 16) {
      canvas.style.cursor = 'col-resize';
    } else {
      canvas.style.cursor = 'pointer';
    }

    if (!this.isDraggingHandle) return;

    const newTime = Math.min(duration, Math.max(0, (currentX / width) * duration));

    if (this.isDraggingHandle === 'start') {
      this.onStartChange(newTime);
    } else if (this.isDraggingHandle === 'end') {
      this.onEndChange(newTime);
    }
  }

  protected onCanvasPointerUp(event: PointerEvent): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (canvas && event.pointerId) {
      try {
        canvas.releasePointerCapture?.(event.pointerId);
      } catch {
        // ignore
      }
    }
    this.isDraggingHandle = null;
  }

  protected togglePlay(): void {
    if (this.isPlaying()) {
      this.stopPlayback();
    } else {
      this.startPlayback(this.startTime());
    }
  }

  protected seekToStart(): void {
    this.playheadTime.set(this.startTime());
    this.startPlayback(this.startTime());
  }

  protected seekToEnd(): void {
    const seekTime = Math.max(this.startTime(), this.endTime() - 3);
    this.playheadTime.set(seekTime);
    this.startPlayback(seekTime);
  }

  private startPlayback(seekTime?: number): void {
    const buffer = this.audioBuffer();
    if (!buffer) return;

    this.stopPlayback();

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioCtx = new AudioCtx();

    const start = seekTime !== undefined ? seekTime : this.startTime();
    const remainingDuration = Math.max(0.1, this.endTime() - start);

    this.sourceNode = this.audioCtx.createBufferSource();
    this.sourceNode.buffer = buffer;

    this.gainNode = this.audioCtx.createGain();
    const now = this.audioCtx.currentTime;

    const fadeIn = this.fadeIn();
    const fadeOut = this.fadeOut();

    if (fadeIn > 0) {
      this.gainNode.gain.setValueAtTime(0, now);
      this.gainNode.gain.linearRampToValueAtTime(1, now + fadeIn);
    } else {
      this.gainNode.gain.setValueAtTime(1, now);
    }

    if (fadeOut > 0) {
      this.gainNode.gain.setValueAtTime(1, now + Math.max(0, remainingDuration - fadeOut));
      this.gainNode.gain.linearRampToValueAtTime(0, now + remainingDuration);
    }

    this.sourceNode.connect(this.gainNode);
    this.gainNode.connect(this.audioCtx.destination);

    this.playbackStartTime = now;
    this.playbackStartOffset = start;

    this.sourceNode.start(0, start, remainingDuration);
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
    const file = this.currentFile();
    if (!buffer || !file || this.busy()) return;

    this.busy.set(true);
    try {
      const blob = await this.trimmer.trimAudio(buffer, {
        startTime: this.startTime(),
        endTime: this.endTime(),
        fadeIn: this.fadeIn(),
        fadeOut: this.fadeOut(),
        mode: this.cutMode(),
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
    this.currentFile.set(null);
  }
}
