import { Injectable, OnDestroy } from '@angular/core';

/**
 * Tracks object URLs and revokes them when the owning component is destroyed.
 *
 * Provide it on the component (`providers: [ObjectUrlScope]`), never in root —
 * the whole point is that Angular tears it down on route leave. Before this,
 * every tool leaked its blobs for the lifetime of the tab unless the user
 * happened to click "Start over".
 */
@Injectable()
export class ObjectUrlScope implements OnDestroy {
  private readonly urls = new Set<string>();

  create(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.urls.add(url);
    return url;
  }

  /** Revokes `previous` (if any) and returns a URL for the new blob. */
  replace(previous: string | null, blob: Blob): string {
    this.revoke(previous);
    return this.create(blob);
  }

  revoke(url: string | null): void {
    if (!url) return;
    URL.revokeObjectURL(url);
    this.urls.delete(url);
  }

  releaseAll(): void {
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
  }

  ngOnDestroy(): void {
    this.releaseAll();
  }
}
