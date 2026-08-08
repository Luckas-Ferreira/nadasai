import { Injectable, computed, signal } from '@angular/core';

/**
 * Allows an image tool to register a "commit" function that runs when the user
 * navigates to another tool without explicitly clicking "Continuar editando".
 *
 * The commit is a closure that calls `state.apply(...)` synchronously. Registering
 * it here means the rail, the mobile bar and the tool chips can all trigger it
 * without knowing anything about the specific tool that produced the result.
 *
 * Lifecycle:
 * - A tool registers a commit when its result blob becomes non-null.
 * - It clears the registration when the result is discarded or the component
 *   is destroyed.
 * - `tryCommit()` is called by navigation handlers before routing away. It runs
 *   the function, clears the registration if successful, and returns whether
 *   it actually committed anything (so callers can decide to navigate or not).
 */
@Injectable({ providedIn: 'root' })
export class PendingTransitionService {
  private readonly _commitFn = signal<(() => boolean) | null>(null);

  /** True while there is a result that has not yet been committed to the chain. */
  readonly hasPending = computed(() => this._commitFn() !== null);

  /**
   * Register a commit function. Called by a tool when its result blob is ready.
   * Replaces any previously registered function.
   */
  register(fn: () => boolean): void {
    this._commitFn.set(fn);
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
