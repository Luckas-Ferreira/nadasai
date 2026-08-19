import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';
import type { ToolId } from '../tools/tools';
import { WorkspaceService } from './workspace.service';

/**
 * Allows a tool to register a "commit" function that runs when the user
 * navigates away (e.g. clicking a next-tool chip, rail link, or switcher).
 *
 * The commit is a closure that calls `state.apply(...)` synchronously. Registering
 * it here means every navigation surface can trigger it without knowing anything
 * about the specific tool that produced the result.
 *
 * **The commit runs on `NavigationStart`, not on a click handler, and that is the
 * whole point.** The first version hooked `(click)` on the rail and on the mobile
 * bar, which meant those two surfaces carried the result forward and every OTHER
 * way out of a tool silently dropped it: the command palette (`⌘K`), the module
 * switcher in the top bar, the "Módulos" link at the bottom of the rail, the
 * browser's Back button and a typed URL. Four of those six are the only ways to
 * LEAVE a module, so crossing modules was exactly the case that lost the file.
 *
 * `NavigationStart` fires before the new route is activated, so the commit lands
 * while the old component is still alive and the next tool's constructor already
 * reads the updated session. It also makes the registration self-cleaning: by the
 * time a tool is destroyed, its pending commit has either run or been cleared, so
 * no component needs an `ngOnDestroy` to avoid leaving a stale closure behind —
 * which is what the click-handler version did leave behind on a Back navigation.
 *
 * Lifecycle:
 * - A tool registers a commit when its result blob becomes non-null.
 * - It clears the registration when the result is discarded.
 * - Any navigation commits whatever is still registered.
 */
@Injectable({ providedIn: 'root' })
export class PendingTransitionService {
  private readonly _commitFn = signal<(() => boolean) | null>(null);

  /** True while there is a result that has not yet been committed to the chain. */
  readonly hasPending = computed(() => this._commitFn() !== null);

  private readonly workspace = inject(WorkspaceService);

  constructor() {
    // Optional because the prerender worker and the unit tests instantiate this
    // service without a router; `toolFromUrl` in ActiveToolService guards the same way.
    const router = inject(Router, { optional: true });

    router?.events
      .pipe(filter((event): event is NavigationStart => event instanceof NavigationStart))
      .subscribe(() => this.tryCommit());
  }

  /**
   * Register a commit function. Called by a tool when its result blob is ready.
   * Replaces any previously registered function.
   */
  register(fn: () => boolean): void {
    this._commitFn.set(fn);
  }

  /**
   * O caso comum: "este blob é o que eu entrego para a cadeia".
   *
   * Existe porque a alternativa era o mesmo closure de sete linhas copiado em
   * vinte e tantos componentes — e um try/catch copiado vinte vezes é um
   * try/catch que uma das vinte vai esquecer. O `apply` pode lançar (um teto de
   * tamanho, um tipo que ninguém reconhece), e um commit que lança durante o
   * `NavigationStart` derruba a navegação inteira.
   */
  registerResult(tool: ToolId, blob: Blob, suffix: string, ext: string): void {
    this.register(() => {
      try {
        this.workspace.apply(tool, blob, suffix, ext);
        return true;
      } catch {
        return false;
      }
    });
  }

  /** Remove the registered function without running it. */
  clear(): void {
    this._commitFn.set(null);
  }

  /**
   * Run the pending commit if one exists.
   * Clears the registration on success.
   * Returns true if a commit was executed successfully, false otherwise.
   */
  tryCommit(): boolean {
    const fn = this._commitFn();
    if (!fn) return false;
    const ok = fn();
    if (ok) this._commitFn.set(null);
    return ok;
  }
}
