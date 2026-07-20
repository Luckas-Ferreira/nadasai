import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, map, mergeMap } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SeoService {
  private router = inject(Router);
  private activatedRoute = inject(ActivatedRoute);
  private meta = inject(Meta);
  private title = inject(Title);

  constructor() {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(() => this.activatedRoute),
      map(route => {
        while (route.firstChild) route = route.firstChild;
        return route;
      }),
      filter(route => route.outlet === 'primary'),
      mergeMap(route => route.data)
    ).subscribe(data => {
      if (data['metaDescription']) {
        this.meta.updateTag({ name: 'description', content: data['metaDescription'] });
      } else {
        // Fallback default description if none is provided on the route
        this.meta.updateTag({ name: 'description', content: 'Ferramentas gratuitas para editar imagens e PDFs 100% offline no seu navegador. Privacidade total, sem envio de dados para servidores.' });
      }

      if (data['metaKeywords']) {
        this.meta.updateTag({ name: 'keywords', content: data['metaKeywords'] });
      } else {
        this.meta.updateTag({ name: 'keywords', content: 'editar imagem, editar pdf, remover fundo, offline, privacidade, ferramentas de imagem' });
      }
    });
  }
}
