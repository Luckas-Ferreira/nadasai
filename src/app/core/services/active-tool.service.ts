import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { type ModuleId, type ToolDef, toolFromUrl } from '../tools/tools';

/**
 * Where the user is, expressed as a tool and a module.
 *
 * The shell needs this in three places at once — the rail lists the current
 * module's tools, the top bar names the current module, the mobile bar mirrors
 * the rail — so resolving it in each of them would mean three copies of the same
 * URL parsing, free to drift apart.
 *
 * It reads the URL instead of being told by the components, and that is what makes
 * it survive the legacy redirects: `/remove-bg`, `/imagem/remover-fundo` and
 * `/pt/imagem/remover-fundo` are three ways in, and only the last one is ever
 * consulted (`urlAfterRedirects`).
 *
 * `null` is a real state, not a failure: the home page, /sobre, /faq and the
 * institutional routes belong to no module, and the shell renders no rail there.
 * That is deliberate — those pages are the launcher and the reading, not the work.
 */
@Injectable({ providedIn: 'root' })
export class ActiveToolService {
  private readonly router = inject(Router, { optional: true });

  private readonly current = signal<ToolDef | null>(null);

  readonly tool = this.current.asReadonly();
  readonly module = computed<ModuleId | null>(() => this.current()?.category ?? null);

  constructor() {
    if (!this.router) return;

    // Seeded as well as subscribed: this service is injected by the shell, which
    // exists before the first navigation, but also by lazily-loaded components
    // created long after it — and those would otherwise start out blank.
    this.current.set(toolFromUrl(this.router.url));

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.current.set(toolFromUrl(event.urlAfterRedirects || event.url)));
  }
}
