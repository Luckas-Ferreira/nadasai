import { Injectable, PLATFORM_ID, computed, effect, signal, inject } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import type { TranslationKey } from '../i18n/en';

export type { TranslationKey };

export type Language = 'pt' | 'en';

const STORAGE_KEY = 'imgwork.lang';

export type Dictionary = Record<TranslationKey, string>;

/**
 * Os dois dicionários viajavam juntos, e metade nunca era lida.
 *
 * Enquanto EN e PT eram dois literais dentro deste arquivo, o bundler não tinha
 * como separá-los: eram 123 kB brutos / 43,8 kB gz num chunk que todo visitante
 * baixava e o parser tinha de atravessar — com metade num idioma que ele nunca
 * ia ver. A auditoria mediu que o TBT deste app não tem função quente, é volume
 * de JavaScript analisado; este era o maior naco que dava para tirar.
 *
 * Agora cada um é um módulo próprio, carregado por `import()`, e o tipo chega
 * aqui por `import type`, que o compilador apaga — a garantia de "chave faltando
 * é erro de compilação" continua inteira e não custa byte nenhum em runtime.
 *
 * O que torna isto seguro, e é bom saber antes de mexer: **uma sessão só precisa
 * de um idioma**. Não há seletor na interface (ver `LANGUAGE` abaixo), o idioma
 * sai do prefixo da URL, e todo link interno é montado com `currentLang()` — de
 * `/pt/...` não se chega a `/en/...` sem digitar. Se um seletor voltar, ele tem
 * de esperar `setLanguage()` resolver antes de a tela mudar, que é exatamente o
 * que essa função garante ao só trocar `currentLang` depois do carregamento.
 */
const LOADERS: Record<Language, () => Promise<Dictionary>> = {
  en: () => import('../i18n/en').then((m) => m.EN),
  pt: () => import('../i18n/pt').then((m) => m.PT),
};

const loaded = new Map<Language, Dictionary>();
const inFlight = new Map<Language, Promise<Dictionary>>();

/**
 * Carrega (uma vez) o dicionário de um idioma. Memoiza a PROMESSA e não só o
 * resultado: dois pedidos simultâneos durante o boot buscariam o mesmo chunk
 * duas vezes, e o segundo chegaria depois da primeira renderização.
 */
export function loadDictionary(lang: Language): Promise<Dictionary> {
  const ready = loaded.get(lang);
  if (ready) return Promise.resolve(ready);

  let pending = inFlight.get(lang);
  if (!pending) {
    pending = LOADERS[lang]().then((dict) => {
      loaded.set(lang, dict);
      inFlight.delete(lang);
      return dict;
    });
    inFlight.set(lang, pending);
  }
  return pending;
}

/** Idioma do prefixo da URL. Tudo que não for `/en` é português. */
export function languageFromUrl(url: string): Language {
  return url === '/en' || url.startsWith('/en/') || url.startsWith('/en?') ? 'en' : 'pt';
}

/**
 * Portuguese, for everyone, for now.
 *
 * The picker is gone from the UI and this ignores both navigator.language and
 * any previously stored choice — deliberately. The service persists the active
 * language on every visit, so by the time this was switched off, every returning
 * visitor already had a value saved; honouring it would have left anyone who once
 * landed on EN stuck there, which is the opposite of "the whole thing in
 * Portuguese".
 *
 * Everything else stays: both dictionaries, setLanguage(), the <html lang> sync.
 * EN is still what TranslationKey is derived from, so a key missing from PT is
 * still a compile error rather than a blank button. Bringing the picker back is
 * this constant plus the markup that reads it.
 */
const LANGUAGE: Language = 'pt';

@Injectable({ providedIn: 'root' })
export class TranslationService {
  readonly currentLang = signal<Language>(LANGUAGE);

  private readonly dictionaries = signal<Partial<Record<Language, Dictionary>>>({});

  /**
   * Dicionário do idioma ativo. Os templates leem `i18n.t()['alguma.chave']`.
   *
   * Continua SÍNCRONO, e tem de continuar: são ~750 pontos de template lendo
   * isto durante a renderização. Quem garante que já está carregado é o
   * inicializador em `app.config.ts`, que segura o bootstrap até o chunk chegar.
   *
   * O fallback é um objeto vazio, e ele não é uma alternativa aceitável — é uma
   * rede para que um caminho que escape do inicializador renderize em branco em
   * vez de derrubar o app com "cannot read properties of undefined" em cima do
   * primeiro `t()['x']`. Se a tela aparecer sem texto nenhum, o defeito é aqui.
   */
  readonly t = computed<Dictionary>(
    () => this.dictionaries()[this.currentLang()] ?? ({} as Dictionary),
  );

  private router = inject(Router, { optional: true });

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * Injetado, não o global.
   *
   * O platform-server fornece um DOM por injeção e NÃO define `document` como
   * variável global — um `document.` solto aqui lança dentro do efeito. Como
   * erro de efeito não derruba a rota, o sintoma era pior que uma falha: as 103
   * rotas eram geradas, o build terminava em erro sem dizer qual rota, e o
   * `lang` do <html> silenciosamente não era escrito em nenhuma delas.
   */
  private readonly doc = inject(DOCUMENT);

  constructor() {
    effect(() => {
      const lang = this.currentLang();

      // `localStorage` não existe no Node, e este serviço é injetado por quase
      // todo componente do app — então, sem esta guarda, a geração estática
      // falhava em TODAS as 72 rotas, inclusive `/pt` e `/en/about`, com uma
      // mensagem que só dizia "erro ao pré-renderizar a rota X".
      if (this.isBrowser) localStorage.setItem(STORAGE_KEY, lang);

      // Este continua valendo em tempo de build, e é de propósito: é o que faz
      // cada arquivo nascer com o idioma certo para o crawler.
      this.doc.documentElement.lang = lang;
    });

    if (this.router) {
      this.router.events.pipe(
        filter(event => event instanceof NavigationEnd)
      ).subscribe((event: any) => {
        const url = event.urlAfterRedirects || event.url;
        if (url.startsWith('/en/') || url === '/en') {
          void this.setLanguage('en');
        } else if (url.startsWith('/pt/') || url === '/pt') {
          void this.setLanguage('pt');
        }
      });
    }
  }

  /**
   * Troca o idioma ATIVO, carregando o dicionário antes se for preciso.
   *
   * A ordem importa: `currentLang` só muda depois de o dicionário estar em mão.
   * Trocar primeiro deixaria `t()` devolvendo o fallback vazio até o chunk
   * chegar — a tela inteira sem texto por um ou dois quadros.
   */
  async setLanguage(lang: Language): Promise<void> {
    if (!this.dictionaries()[lang]) {
      const dict = await loadDictionary(lang);
      this.dictionaries.update((all) => ({ ...all, [lang]: dict }));
    }
    this.currentLang.set(lang);
  }

  /**
   * Instala um dicionário já carregado, de forma síncrona. É o que o
   * inicializador usa: ali o chunk já foi buscado, e passar por `setLanguage`
   * adiaria a instalação para uma microtarefa — que é justamente a janela em que
   * o primeiro render aconteceria com o dicionário vazio.
   */
  install(lang: Language, dict: Dictionary): void {
    this.dictionaries.update((all) => ({ ...all, [lang]: dict }));
    this.currentLang.set(lang);
  }

  async toggleLanguage(): Promise<void> {
    await this.setLanguage(this.currentLang() === 'pt' ? 'en' : 'pt');
  }
}
