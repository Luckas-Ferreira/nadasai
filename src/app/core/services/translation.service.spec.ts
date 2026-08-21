import { TestBed } from '@angular/core/testing';
import { TranslationService, loadDictionary } from './translation.service';
import { EN } from '../i18n/en';
import { PT } from '../i18n/pt';
import { TOOLS } from '../tools/tools';

describe('TranslationService', () => {
  let i18n: TranslationService;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    i18n = TestBed.inject(TranslationService);

    // O serviço não carrega mais dicionário sozinho — quem faz isso em produção
    // é o inicializador de `app.config.ts`, que segura o bootstrap. No TestBed
    // não há bootstrap, então a espera é aqui: sem ela `t()` devolve o objeto
    // vazio e uma asserção sobre "cada valor do dicionário" passa varrendo NADA,
    // que é a pior forma de um teste continuar verde.
    await i18n.setLanguage('pt');
  });

  /**
   * As duas asserções sobre a FORMA do dicionário leem os módulos diretamente,
   * e não através do serviço. O que elas verificam é o dado — paridade de
   * chaves, nenhum valor vazio — e passar isso pelo carregamento assíncrono só
   * acrescentaria uma maneira de o teste virar vácuo sem ninguém notar.
   *
   * O botão de comprimir já renderizou sem rótulo nenhum, porque o template lia
   * uma chave `compress.btn` que existia só num lugar: lugar nenhum. Hoje o
   * dicionário é tipado, mas isto guarda também a forma em tempo de execução.
   */
  it('has identical key sets in both languages', () => {
    expect(Object.keys(PT).sort()).toEqual(Object.keys(EN).sort());
  });

  it('has no blank translations', () => {
    const dicts: Record<string, Record<string, string>> = { en: EN, pt: PT };

    for (const [lang, dict] of Object.entries(dicts)) {
      const entries = Object.entries(dict);
      expect(entries.length).toBeGreaterThan(100);

      for (const [key, value] of entries) {
        expect(value.trim()).withContext(`${lang}:${key} is blank`).not.toBe('');
      }
    }
  });

  /**
   * The app is Portuguese-only for now, and the picker is gone. The service
   * persists the language on every visit, so anyone who used the app before this
   * has a value sitting in storage — and if that value wins, an old visitor is
   * still looking at English with no way left to change it.
   */
  it('starts in Portuguese even with another language stored', () => {
    localStorage.setItem('imgwork.lang', 'en');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    expect(TestBed.inject(TranslationService).currentLang()).toBe('pt');
  });

  it('resolves every key the tool registry points at', () => {
    for (const tool of TOOLS) {
      expect(i18n.t()[tool.navKey]).toBeTruthy();
      expect(i18n.t()[tool.titleKey]).toBeTruthy();
      expect(i18n.t()[tool.descKey]).toBeTruthy();
    }
  });

  it('persists the language and reflects it on <html lang>', () => {
    TestBed.flushEffects();

    expect(localStorage.getItem('imgwork.lang')).toBe('pt');
    expect(document.documentElement.lang).toBe('pt');
  });

  it('toggles between the two languages', async () => {
    await i18n.setLanguage('en');
    await i18n.toggleLanguage();
    expect(i18n.currentLang()).toBe('pt');

    await i18n.toggleLanguage();
    expect(i18n.currentLang()).toBe('en');
  });

  /**
   * O dicionário virou chunk carregado por `import()`, e a promessa é memoizada
   * — não só o resultado. Dois pedidos concorrentes durante o boot buscariam o
   * mesmo chunk duas vezes, e o segundo chegaria DEPOIS da primeira
   * renderização: a tela apareceria com o dicionário vazio e se preencheria um
   * quadro adiante.
   */
  it('hands the same dictionary object back on every load', async () => {
    const [a, b] = await Promise.all([loadDictionary('pt'), loadDictionary('pt')]);

    expect(a).toBe(b);
    expect(a).toBe(PT);
  });

  /**
   * `t()` é síncrono em ~750 pontos de template. Antes de o dicionário chegar
   * ele devolve um objeto vazio de propósito: a alternativa é o primeiro
   * `t()['x']` derrubar o app inteiro num "cannot read properties of undefined".
   */
  it('answers with an empty dictionary instead of throwing before the load', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const fresh = TestBed.inject(TranslationService);

    expect(() => fresh.t()['common.download']).not.toThrow();
    expect(fresh.t()['common.download']).toBeUndefined();
  });
});
