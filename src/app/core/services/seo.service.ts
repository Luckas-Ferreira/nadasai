import { Injectable, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, map, mergeMap } from 'rxjs';
import { type ToolDef, toolFromUrl } from '../tools/tools';
import { alternatesFor, cleanPathOf } from '../seo/route-map';
import { buildGraph } from '../seo/jsonld';
import type { FaqEntry } from '../seo/tool-content';
import { TranslationService } from './translation.service';

const DOMAIN = 'https://nadasai.com';

interface PageContext {
  readonly url: string;
  /** Router URL, used to match a registered FAQ against the current page. */
  readonly routerUrl: string;
  readonly lang: 'pt' | 'en';
  readonly title: string;
  readonly description: string;
  readonly tool: ToolDef | null;
  readonly isHome: boolean;
  readonly features: readonly string[];
}



@Injectable({
  providedIn: 'root'
})
export class SeoService {
  private router = inject(Router);
  private activatedRoute = inject(ActivatedRoute);
  private meta = inject(Meta);
  private title = inject(Title);
  private doc = inject(DOCUMENT) as Document;
  private i18n = inject(TranslationService);

  private readonly page = signal<PageContext | null>(null);
  private readonly visibleFaq = signal<{ url: string; entries: readonly FaqEntry[] } | null>(null);

  constructor() {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(() => this.activatedRoute),
      map(route => {
        while (route.firstChild) route = route.firstChild;
        return route;
      }),
      filter(route => route.outlet === 'primary'),
      /**
       * O `title` da rota vem do SNAPSHOT, e não de `data`.
       *
       * Em `app.routes.ts` o título é propriedade de primeiro nível da Route
       * (`title: 'Cortar Imagem Online — Nada Sai'`), enquanto a descrição mora
       * em `data`. O Angular NÃO copia `Route.title` para `route.data`, então
       * `data['title']` era sempre `undefined` e todo `pageTitle` caía no
       * genérico.
       *
       * O defeito era invisível pelo lugar mais óbvio: o `<title>` da aba saía
       * certo, porque quem o escreve é o `TitleStrategy` embutido do Angular,
       * que lê a propriedade certa e roda depois deste bloco. O que saía errado
       * era tudo o que só existe aqui — `og:title` e `twitter:title` — nas 72
       * páginas de ferramenta, todas anunciando "Nada Sai — seus arquivos não
       * saem do seu computador" em vez do nome da ferramenta. A `description`
       * escapou por vir de `data`, que é o motivo de a divergência ter passado:
       * metade das tags estava certa.
       *
       * `data['title']` fica como segundo fallback: não custa nada e cobre
       * qualquer rota que um dia declare o título por lá.
       */
      mergeMap(route => route.data.pipe(map(data => ({ data, routeTitle: route.snapshot.title }))))
    ).subscribe(({ data, routeTitle }) => {
      const url = this.router.url.split('?')[0].replace(/\/$/, '') || '/pt';
      const isEnglish = url.startsWith('/en');
      const lang = isEnglish ? 'en' : 'pt';
      const locale = isEnglish ? 'en_US' : 'pt_BR';

      // Update HTML lang attribute
      if (this.doc.documentElement) {
        this.doc.documentElement.lang = isEnglish ? 'en' : 'pt-BR';
      }

      // Title
      const pageTitle = routeTitle || data['title'] || (isEnglish ? 'Nada Sai — Your files never leave your computer' : 'Nada Sai — seus arquivos não saem do seu computador');
      this.title.setTitle(pageTitle);

      // Meta Description
      const defaultDesc = isEnglish
        ? 'Free tools to edit images and PDFs 100% offline in your browser. Total privacy, zero data sent to servers.'
        : 'Ferramentas gratuitas para editar imagens e PDFs 100% offline no seu navegador. Privacidade total, sem envio de dados para servidores.';
      const metaDesc = data['metaDescription'] || defaultDesc;
      this.meta.updateTag({ name: 'description', content: metaDesc });

      // Meta Keywords
      const tool = toolFromUrl(url);
      const toolKeywords = tool
        ? (isEnglish ? tool.keywordsEn : tool.keywordsPt).join(', ')
        : null;

      const defaultKeywords = isEnglish
        ? 'edit image, edit pdf, remove background, offline, privacy, image tools, pdf tools'
        : 'editar imagem, editar pdf, remover fundo, offline, privacidade, ferramentas de imagem, ferramentas de pdf';
      const metaKeywords = data['metaKeywords'] || toolKeywords || defaultKeywords;
      this.meta.updateTag({ name: 'keywords', content: metaKeywords });

      // Meta Robots
      this.meta.updateTag({ name: 'robots', content: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' });

      // Canonical URL
      const currentFullUrl = `${DOMAIN}${url}`;
      this.setLinkTag('canonical', currentFullUrl);

      // Hreflang links, from the derived map. When a path has no known twin we
      // emit NOTHING and remove any stale tags, rather than inventing a URL:
      // the old fallback reused the current path under the other prefix, which
      // produced 14 alternates pointing at pages that do not exist.
      const mapping = alternatesFor(cleanPathOf(url));
      if (mapping) {
        this.setHreflangTag('pt', `${DOMAIN}${mapping.pt}`);
        this.setHreflangTag('en', `${DOMAIN}${mapping.en}`);
        this.setHreflangTag('x-default', `${DOMAIN}${mapping.pt}`);
      } else {
        this.removeHreflangTags();
      }

      /**
       * O card social. PNG 1200x630, um por ferramenta por língua.
       *
       * Isto apontava para `logo_nadasai.svg` e o efeito era total: crawler
       * social nenhum renderiza SVG — nem Facebook, nem X, nem LinkedIn, nem
       * WhatsApp, nem Slack, nem Discord. Todos aceitam a tag e nenhum desenha,
       * então TODA URL do site compartilhada em qualquer lugar aparecia sem
       * imagem, e o `twitter:card: summary_large_image` (que exige imagem
       * grande) degradava para nada. As dimensões declaradas ainda por cima
       * eram falsas: diziam 1200x630 para um arquivo de 339x339.
       *
       * Os arquivos são gerados por `scripts/generate-og-cards.mjs` e
       * commitados. Uma ferramenta sem card cai no padrão da língua em vez de
       * ficar sem imagem — o caminho é derivado do id, então o modo de falha de
       * um tool novo é herdar o card genérico, nunca voltar ao vazio.
       */
      const ogImage = `${DOMAIN}/og/${tool ? tool.id : 'default'}-${lang}.png`;

      // Open Graph Tags
      this.meta.updateTag({ property: 'og:site_name', content: 'Nada Sai' });
      this.meta.updateTag({ property: 'og:title', content: pageTitle });
      this.meta.updateTag({ property: 'og:description', content: metaDesc });
      this.meta.updateTag({ property: 'og:type', content: 'website' });
      this.meta.updateTag({ property: 'og:url', content: currentFullUrl });
      this.meta.updateTag({ property: 'og:image', content: ogImage });
      this.meta.updateTag({ property: 'og:image:type', content: 'image/png' });
      this.meta.updateTag({ property: 'og:image:width', content: '1200' });
      this.meta.updateTag({ property: 'og:image:height', content: '630' });
      this.meta.updateTag({ property: 'og:image:alt', content: pageTitle });
      this.meta.updateTag({ property: 'og:locale', content: locale });

      // Twitter Tags
      this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
      this.meta.updateTag({ name: 'twitter:title', content: pageTitle });
      this.meta.updateTag({ name: 'twitter:description', content: metaDesc });
      this.meta.updateTag({ name: 'twitter:image', content: ogImage });
      this.meta.updateTag({ name: 'twitter:image:alt', content: pageTitle });

      // JSON-LD. Angular destroys the previous route's components and creates
      // the new ones DURING activation, i.e. before NavigationEnd — so by the
      // time we get here the incoming FaqComponent has already registered and
      // the outgoing one has already cleared. One write, no stale node.
      this.page.set({
        url: currentFullUrl,
        routerUrl: url,
        lang,
        title: pageTitle,
        description: metaDesc,
        tool,
        isHome: url === '/pt' || url === '/en',
        features: data['seoFeatures'] ?? [],
      });
      this.writeJsonLd();
    });
  }

  private setLinkTag(rel: string, href: string): void {
    let link: HTMLLinkElement | null = this.doc.querySelector(`link[rel="${rel}"]`);
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', rel);
      this.doc.head.appendChild(link);
    }
    link.setAttribute('href', href);
  }

  private setHreflangTag(lang: string, href: string): void {
    let link: HTMLLinkElement | null = this.doc.querySelector(`link[rel="alternate"][hreflang="${lang}"]`);
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', 'alternate');
      link.setAttribute('hreflang', lang);
      this.doc.head.appendChild(link);
    }
    link.setAttribute('href', href);
  }

  /**
   * Removing rather than leaving them: these tags persist across navigations in
   * an SPA, so a page with no known twin would otherwise inherit the previous
   * page's alternates and claim to be its translation.
   */
  private removeHreflangTags(): void {
    this.doc.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => el.remove());
  }

  /**
   * Called by FaqComponent with the Q&A it just rendered.
   *
   * The flow is inverted on purpose. SeoService is root-provided, so importing
   * `tool-content.ts` from here would drag ~40 KB of copy into the INITIAL
   * bundle; letting the component push it keeps that file in a lazy chunk. It
   * also makes divergence impossible: the thing that renders is the thing that
   * registers, so the FAQPage node cannot describe questions the page does not
   * show.
   *
   * `forUrl` is belt and braces — a missed ngOnDestroy still cannot leak one
   * page's FAQ into another page's markup.
   */
  setVisibleFaq(entries: readonly FaqEntry[], forUrl: string): void {
    this.visibleFaq.set({ url: forUrl, entries });
    this.writeJsonLd();
  }

  clearVisibleFaq(): void {
    this.visibleFaq.set(null);
  }

  private writeJsonLd(): void {
    const page = this.page();
    if (!page) return;

    const registered = this.visibleFaq();
    const faq = registered && registered.url === page.routerUrl ? registered.entries : [];

    let script: HTMLScriptElement | null = this.doc.querySelector('script[type="application/ld+json"]#seo-jsonld');
    if (!script) {
      script = this.doc.createElement('script');
      script.setAttribute('type', 'application/ld+json');
      script.setAttribute('id', 'seo-jsonld');
      this.doc.head.appendChild(script);
    }

    script.textContent = JSON.stringify(
      buildGraph({
        url: page.url,
        lang: page.lang,
        title: page.title,
        description: page.description,
        tool: page.tool,
        isHome: page.isHome,
        dict: this.i18n.t(),
        faq,
        features: page.features,
      }),
    );
  }
}
