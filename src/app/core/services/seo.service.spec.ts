import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { SeoService } from './seo.service';

@Component({ standalone: true, template: '' })
class Blank {}

const DOMAIN = 'https://nadasai.com';

const head = () => document.head;
const canonical = () => head().querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
const alternates = () =>
  [...head().querySelectorAll('link[rel="alternate"][hreflang]')].map((el) => [
    el.getAttribute('hreflang'),
    el.getAttribute('href'),
  ]);

/**
 * As tags de SEO são escritas no `<head>` e PERSISTEM entre navegações — a
 * página não recarrega, então nada as tira sozinho. É daí que vem a única classe
 * de defeito que este spec existe para pegar: uma página sem par de tradução que
 * herda os alternates da página anterior passa a declarar-se tradução DELA, e o
 * Google descarta a anotação do cluster inteiro por causa disso.
 *
 * `route-map.spec.ts` já garante que o MAPA está certo. O que faltava era o
 * comportamento do serviço quando o mapa não tem resposta: emitir nada e limpar
 * o que ficou, em vez de inventar uma URL.
 */
describe('SeoService', () => {
  let router: Router;

  beforeEach(() => {
    head()
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"][hreflang]')
      .forEach((el) => el.remove());

    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'pt/imagem/cortar', component: Blank, title: 'Cortar' },
          { path: 'en/image/crop', component: Blank, title: 'Crop' },
          { path: 'pt/abrir', component: Blank, title: 'Abrir' },
          { path: '', component: Blank, title: 'Home' },
        ]),
      ],
    });
    TestBed.inject(SeoService);
    router = TestBed.inject(Router);
  });

  it('writes a canonical for the current URL', async () => {
    await router.navigateByUrl('/pt/imagem/cortar');

    expect(canonical()).toBe(`${DOMAIN}/pt/imagem/cortar`);
  });

  it('emits a reciprocal hreflang pair plus x-default', async () => {
    await router.navigateByUrl('/pt/imagem/cortar');

    expect(alternates()).toEqual([
      ['pt', `${DOMAIN}/pt/imagem/cortar`],
      ['en', `${DOMAIN}/en/image/crop`],
      ['x-default', `${DOMAIN}/pt/imagem/cortar`],
    ]);
  });

  it('points both spellings of a tool at the same pair', async () => {
    await router.navigateByUrl('/pt/imagem/cortar');
    const fromPt = alternates();

    await router.navigateByUrl('/en/image/crop');

    expect(alternates()).toEqual(fromPt);
    expect(canonical()).toBe(`${DOMAIN}/en/image/crop`);
  });

  /**
   * `/pt/abrir` é a página onde o sistema operacional entrega arquivo, e está
   * fora do sitemap de propósito — não tem par declarado. Sem a limpeza ela
   * herdaria os alternates de quem veio antes: uma página de "abrir arquivo"
   * anunciando-se como a tradução inglesa de "cortar imagem".
   */
  it('removes stale alternates on a page with no known twin', async () => {
    await router.navigateByUrl('/pt/imagem/cortar');
    expect(alternates().length).toBe(3);

    await router.navigateByUrl('/pt/abrir');

    expect(alternates()).toEqual([]);
    expect(canonical()).toBe(`${DOMAIN}/pt/abrir`);
  });

  it('does not accumulate duplicates over repeated navigations', async () => {
    await router.navigateByUrl('/pt/imagem/cortar');
    await router.navigateByUrl('/en/image/crop');
    await router.navigateByUrl('/pt/imagem/cortar');

    expect(alternates().length).toBe(3);
    expect(head().querySelectorAll('link[rel="canonical"]').length).toBe(1);
  });
});
