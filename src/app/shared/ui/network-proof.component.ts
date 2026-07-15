import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { formatBytes } from '../../core/image/image-file.util';
import { NetworkProbeService } from '../../core/services/network-probe.service';
import { TranslationService } from '../../core/services/translation.service';
import { IconComponent } from './icon/icon.component';

/**
 * Shows what NetworkProbeService measured. The numbers are live readings, not
 * copy — the moment one is hardcoded to zero this is just another privacy
 * promise with nicer typography, which is the thing the product exists to
 * replace.
 *
 * Both readings are about the user's file, never about page traffic in general.
 * See NetworkProbeService for why that scope is the whole design.
 */
@Component({
  selector: 'app-network-proof',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="rounded-lg border border-line bg-surface p-4">
      <div class="flex items-center gap-2">
        <span class="relative flex h-2 w-2">
          @if (probe.clean()) {
            <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"></span>
          }
          <span
            class="relative inline-flex h-2 w-2 rounded-full"
            [class.bg-success]="probe.clean()"
            [class.bg-danger]="!probe.clean()"
          ></span>
        </span>

        <h2 class="text-2xs font-medium uppercase text-faint">{{ i18n.t()['proof.title'] }}</h2>
      </div>

      <dl class="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <dt class="text-sm text-muted">{{ i18n.t()['proof.sent'] }}</dt>
          <dd
            class="text-2xl font-mono tabular"
            [class.text-success]="probe.fileBytesSent() === 0"
            [class.text-danger]="probe.fileBytesSent() > 0"
          >
            {{ probe.fileBytesSent() === 0 ? i18n.t()['proof.zero_bytes'] : formatBytes(probe.fileBytesSent()) }}
          </dd>
        </div>

        <div>
          <dt class="text-sm text-muted">{{ i18n.t()['proof.recipients'] }}</dt>
          <dd
            class="text-2xl font-mono tabular"
            [class.text-success]="probe.recipients().length === 0"
            [class.text-danger]="probe.recipients().length > 0"
          >
            {{ probe.recipients().length ? probe.recipients().join(', ') : i18n.t()['proof.none'] }}
          </dd>
        </div>
      </dl>

      <!-- Disclosed on purpose. The app does load its own code, its own font and
           the model weights. Hiding that would make the zero look like a trick;
           naming it is what makes the zero credible. -->
      <p class="mt-3 border-t border-line pt-3 text-xs text-faint">
        {{ i18n.t()['proof.disclosure'] }}
      </p>

      <p
        class="mt-3 flex items-start gap-2 text-sm"
        [class.text-success]="!probe.online()"
        [class.text-muted]="probe.online()"
      >
        <span class="mt-0.5 shrink-0">
          <app-icon [name]="probe.online() ? 'wifiOff' : 'check'" [size]="15" />
        </span>
        {{ probe.online() ? i18n.t()['proof.try_offline'] : i18n.t()['proof.offline_ok'] }}
      </p>
    </div>
  `,
})
export class NetworkProofComponent {
  protected readonly probe = inject(NetworkProbeService);
  protected readonly i18n = inject(TranslationService);
  protected readonly formatBytes = formatBytes;
}
