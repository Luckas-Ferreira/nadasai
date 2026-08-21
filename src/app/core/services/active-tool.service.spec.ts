import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { ActiveToolService } from './active-tool.service';

@Component({ standalone: true, template: '' })
class Blank {}

/**
 * Quem responde "onde eu estou" para as três superfícies da casca ao mesmo
 * tempo — o rail, o nome do módulo na barra do topo e a barra mobile. Resolver
 * isso dentro de cada uma seria a mesma leitura de URL em três cópias, livres
 * para divergir.
 *
 * Duas coisas aqui não são detalhe e são o que estes testes fixam: o módulo sai
 * do `category` DECLARADO e nunca do prefixo da URL (`img-to-pdf` mora em
 * `imagem/para-pdf` e é do módulo de imagem — uma regra por prefixo o
 * arquivaria no lugar errado), e `null` é um estado legítimo, não uma falha: a
 * home, /sobre e /faq não pertencem a módulo nenhum e ali a casca não desenha
 * rail.
 */
describe('ActiveToolService', () => {
  let router: Router;
  let active: ActiveToolService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'pt/imagem/cortar', component: Blank },
          { path: 'pt/imagem/para-pdf', component: Blank },
          { path: 'pt/pdf/juntar', component: Blank },
          { path: 'pt/sobre', component: Blank },
          { path: 'remove-bg', redirectTo: 'pt/imagem/cortar' },
          { path: '', component: Blank },
        ]),
      ],
    });
    router = TestBed.inject(Router);
    active = TestBed.inject(ActiveToolService);
  });

  it('resolves the tool and the module from the URL', async () => {
    await router.navigateByUrl('/pt/imagem/cortar');

    expect(active.tool()?.id).toBe('crop');
    expect(active.module()).toBe('image');
  });

  /**
   * `img-to-pdf` vive em `imagem/para-pdf` e pertence ao módulo de IMAGEM, não
   * ao de PDF: o módulo de uma ferramenta é o tipo de arquivo que ela recebe, e
   * não o que ela devolve. Uma regra por prefixo de URL a arquivaria no módulo
   * errado, e o rail passaria a listar a lista errada de ferramentas.
   */
  it('files a tool by its declared category, never by the URL prefix', async () => {
    await router.navigateByUrl('/pt/imagem/para-pdf');

    expect(active.tool()?.id).toBe('img-to-pdf');
    expect(active.module()).toBe('image');
  });

  it('follows a legacy redirect to where it actually landed', async () => {
    await router.navigateByUrl('/remove-bg');

    expect(active.tool()?.id).toBe('crop');
  });

  /** A home, /sobre e /faq não pertencem a módulo nenhum, e isso é o desenho. */
  it('answers null outside a module', async () => {
    await router.navigateByUrl('/pt/sobre');

    expect(active.tool()).toBeNull();
    expect(active.module()).toBeNull();
  });

  it('updates on every navigation, including across modules', async () => {
    await router.navigateByUrl('/pt/imagem/cortar');
    expect(active.module()).toBe('image');

    await router.navigateByUrl('/pt/pdf/juntar');
    expect(active.module()).toBe('pdf');

    await router.navigateByUrl('/');
    expect(active.module()).toBeNull();
  });

  /**
   * O serviço é semeado no construtor além de assinar os eventos: a casca existe
   * antes da primeira navegação, mas componentes de rota preguiçosa nascem muito
   * depois dela — e sem a semeadura começariam em branco, com o rail vazio numa
   * página de ferramenta.
   */
  it('seeds itself from the current URL when created after the navigation', async () => {
    await router.navigateByUrl('/pt/pdf/juntar');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'pt/pdf/juntar', component: Blank }])],
    });
    const late = TestBed.inject(ActiveToolService);
    const lateRouter = TestBed.inject(Router);
    await lateRouter.navigateByUrl('/pt/pdf/juntar');

    expect(late.tool()?.id).toBe('merge-pdf');
  });
});
