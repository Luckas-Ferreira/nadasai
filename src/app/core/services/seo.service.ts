import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, map, mergeMap } from 'rxjs';

const DOMAIN = 'https://nadasai.com';

const ROUTE_MAPPINGS: Record<string, { pt: string; en: string }> = {
  '': { pt: '/pt', en: '/en' },
  'imagem/remover-fundo': { pt: '/pt/imagem/remover-fundo', en: '/en/image/remove-bg' },
  'image/remove-bg': { pt: '/pt/imagem/remover-fundo', en: '/en/image/remove-bg' },

  'imagem/cortar': { pt: '/pt/imagem/cortar', en: '/en/image/crop' },
  'image/crop': { pt: '/pt/imagem/cortar', en: '/en/image/crop' },

  'imagem/comprimir': { pt: '/pt/imagem/comprimir', en: '/en/image/compress' },
  'image/compress': { pt: '/pt/imagem/comprimir', en: '/en/image/compress' },

  'imagem/converter': { pt: '/pt/imagem/converter', en: '/en/image/convert' },
  'image/convert': { pt: '/pt/imagem/converter', en: '/en/image/convert' },

  'imagem/redimensionar': { pt: '/pt/imagem/redimensionar', en: '/en/image/resize' },
  'image/resize': { pt: '/pt/imagem/redimensionar', en: '/en/image/resize' },

  'imagem/para-pdf': { pt: '/pt/imagem/para-pdf', en: '/en/image/to-pdf' },
  'image/to-pdf': { pt: '/pt/imagem/para-pdf', en: '/en/image/to-pdf' },

  'pdf/editar': { pt: '/pt/pdf/editar', en: '/en/pdf/edit' },
  'pdf/edit': { pt: '/pt/pdf/editar', en: '/en/pdf/edit' },

  'pdf/juntar': { pt: '/pt/pdf/juntar', en: '/en/pdf/merge' },
  'pdf/merge': { pt: '/pt/pdf/juntar', en: '/en/pdf/merge' },

  'pdf/comprimir': { pt: '/pt/pdf/comprimir', en: '/en/pdf/compress' },
  'pdf/compress': { pt: '/pt/pdf/comprimir', en: '/en/pdf/compress' },

  'pdf/dividir': { pt: '/pt/pdf/dividir', en: '/en/pdf/split' },
  'pdf/split': { pt: '/pt/pdf/dividir', en: '/en/pdf/split' },

  'pdf/para-imagem': { pt: '/pt/pdf/para-imagem', en: '/en/pdf/to-image' },
  'pdf/to-image': { pt: '/pt/pdf/para-imagem', en: '/en/pdf/to-image' },

  'pdf/organizar': { pt: '/pt/pdf/organizar', en: '/en/pdf/organize' },
  'pdf/organize': { pt: '/pt/pdf/organizar', en: '/en/pdf/organize' },

  'pdf/proteger': { pt: '/pt/pdf/proteger', en: '/en/pdf/protect' },
  'pdf/protect': { pt: '/pt/pdf/proteger', en: '/en/pdf/protect' },

  'pdf/assinar': { pt: '/pt/pdf/assinar', en: '/en/pdf/sign' },
  'pdf/sign': { pt: '/pt/pdf/assinar', en: '/en/pdf/sign' },

  'pdf/marca-dagua': { pt: '/pt/pdf/marca-dagua', en: '/en/pdf/watermark' },
  'pdf/watermark': { pt: '/pt/pdf/marca-dagua', en: '/en/pdf/watermark' },

  'sobre': { pt: '/pt/sobre', en: '/en/about' },
  'about': { pt: '/pt/sobre', en: '/en/about' },

  'privacidade': { pt: '/pt/privacidade', en: '/en/privacy' },
  'privacy': { pt: '/pt/privacidade', en: '/en/privacy' },

  'termos': { pt: '/pt/termos', en: '/en/terms' },
  'terms': { pt: '/pt/termos', en: '/en/terms' },
};

@Injectable({
  providedIn: 'root'
})
export class SeoService {
  private router = inject(Router);
  private activatedRoute = inject(ActivatedRoute);
  private meta = inject(Meta);
  private title = inject(Title);
  private doc = inject(DOCUMENT) as Document;

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
      const url = this.router.url.split('?')[0].replace(/\/$/, '') || '/pt';
      const isEnglish = url.startsWith('/en');
      const lang = isEnglish ? 'en' : 'pt';
      const locale = isEnglish ? 'en_US' : 'pt_BR';

      // Update HTML lang attribute
      if (this.doc.documentElement) {
        this.doc.documentElement.lang = isEnglish ? 'en' : 'pt-BR';
      }

      // Title
      const pageTitle = data['title'] || (isEnglish ? 'Nada Sai — Your files never leave your computer' : 'Nada Sai — seus arquivos não saem do seu computador');
      this.title.setTitle(pageTitle);

      // Meta Description
      const defaultDesc = isEnglish
        ? 'Free tools to edit images and PDFs 100% offline in your browser. Total privacy, zero data sent to servers.'
        : 'Ferramentas gratuitas para editar imagens e PDFs 100% offline no seu navegador. Privacidade total, sem envio de dados para servidores.';
      const metaDesc = data['metaDescription'] || defaultDesc;
      this.meta.updateTag({ name: 'description', content: metaDesc });

      // Meta Keywords
      const defaultKeywords = isEnglish
        ? 'edit image, edit pdf, remove background, offline, privacy, image tools, pdf tools'
        : 'editar imagem, editar pdf, remover fundo, offline, privacidade, ferramentas de imagem, ferramentas de pdf';
      const metaKeywords = data['metaKeywords'] || defaultKeywords;
      this.meta.updateTag({ name: 'keywords', content: metaKeywords });

      // Meta Robots
      this.meta.updateTag({ name: 'robots', content: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' });

      // Canonical URL
      const currentFullUrl = `${DOMAIN}${url}`;
      this.setLinkTag('canonical', currentFullUrl);

      // Hreflang links
      const cleanPath = url.replace(/^\/(pt|en)\/?/, '');
      const mapping = ROUTE_MAPPINGS[cleanPath] || { pt: `/pt/${cleanPath}`, en: `/en/${cleanPath}` };
      this.setHreflangTag('pt', `${DOMAIN}${mapping.pt}`);
      this.setHreflangTag('en', `${DOMAIN}${mapping.en}`);
      this.setHreflangTag('x-default', `${DOMAIN}${mapping.pt}`);

      // Open Graph Tags
      this.meta.updateTag({ property: 'og:site_name', content: 'Nada Sai' });
      this.meta.updateTag({ property: 'og:title', content: pageTitle });
      this.meta.updateTag({ property: 'og:description', content: metaDesc });
      this.meta.updateTag({ property: 'og:type', content: 'website' });
      this.meta.updateTag({ property: 'og:url', content: currentFullUrl });
      this.meta.updateTag({ property: 'og:image', content: `${DOMAIN}/logo.webp` });
      this.meta.updateTag({ property: 'og:locale', content: locale });

      // Twitter Tags
      this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
      this.meta.updateTag({ name: 'twitter:title', content: pageTitle });
      this.meta.updateTag({ name: 'twitter:description', content: metaDesc });
      this.meta.updateTag({ name: 'twitter:image', content: `${DOMAIN}/logo.webp` });

      // JSON-LD Structured Data
      this.updateJsonLdSchema(pageTitle, metaDesc, currentFullUrl, lang);
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

  private updateJsonLdSchema(title: string, description: string, url: string, lang: string): void {
    let script: HTMLScriptElement | null = this.doc.querySelector('script[type="application/ld+json"]#seo-jsonld');
    if (!script) {
      script = this.doc.createElement('script');
      script.setAttribute('type', 'application/ld+json');
      script.setAttribute('id', 'seo-jsonld');
      this.doc.head.appendChild(script);
    }

    const schema = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite',
          '@id': `${DOMAIN}/#website`,
          'url': DOMAIN,
          'name': 'Nada Sai',
          'description': lang === 'en' ? 'Offline browser-based image & PDF tools' : 'Ferramentas de imagem e PDF 100% offline no navegador',
          'inLanguage': lang === 'en' ? 'en-US' : 'pt-BR'
        },
        {
          '@type': 'SoftwareApplication',
          '@id': `${DOMAIN}/#application`,
          'name': 'Nada Sai',
          'operatingSystem': 'Any (Browser-based)',
          'applicationCategory': 'MultimediaApplication',
          'offers': {
            '@type': 'Offer',
            'price': '0',
            'priceCurrency': 'USD'
          },
          'description': description,
          'featureList': [
            'Remove Background',
            'Crop Images',
            'Compress Images & PDFs',
            'Convert Formats',
            'PDF Editor',
            'Merge PDFs',
            'Split PDFs',
            'Sign PDFs',
            'Watermark PDFs',
            'Protect PDFs'
          ]
        },
        {
          '@type': 'WebPage',
          '@id': `${url}#webpage`,
          'url': url,
          'name': title,
          'description': description,
          'isPartOf': { '@id': `${DOMAIN}/#website` },
          'inLanguage': lang === 'en' ? 'en-US' : 'pt-BR'
        }
      ]
    };

    script.textContent = JSON.stringify(schema);
  }
}
