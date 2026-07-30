import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, map, mergeMap } from 'rxjs';
import { toolFromUrl } from '../tools/tools';

const DOMAIN = 'https://nadasai.com';

const ROUTE_MAPPINGS: Record<string, { pt: string; en: string }> = {
  '': { pt: '/pt', en: '/en' },
  'imagem/remover-fundo': { pt: '/pt/imagem/remover-fundo', en: '/en/image/remove-bg' },
  'image/remove-bg': { pt: '/pt/imagem/remover-fundo', en: '/en/image/remove-bg' },

  'imagem/melhorar-qualidade': { pt: '/pt/imagem/melhorar-qualidade', en: '/en/image/upscale' },
  'image/upscale': { pt: '/pt/imagem/melhorar-qualidade', en: '/en/image/upscale' },

  'imagem/extrair-texto': { pt: '/pt/imagem/extrair-texto', en: '/en/image/extract-text' },
  'image/extract-text': { pt: '/pt/imagem/extrair-texto', en: '/en/image/extract-text' },

  'audio/cortar': { pt: '/pt/audio/cortar', en: '/en/audio/cut' },
  'audio/cut': { pt: '/pt/audio/cortar', en: '/en/audio/cut' },
  'audio/juntar': { pt: '/pt/audio/juntar', en: '/en/audio/merge' },
  'audio/merge': { pt: '/pt/audio/juntar', en: '/en/audio/merge' },
  'audio/converter': { pt: '/pt/audio/converter', en: '/en/audio/convert' },
  'audio/convert': { pt: '/pt/audio/converter', en: '/en/audio/convert' },

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

  'faq': { pt: '/pt/faq', en: '/en/faq' },
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
        },
        {
          '@type': 'FAQPage',
          '@id': `${url}#faq`,
          'mainEntity': lang === 'en' ? [
            {
              '@type': 'Question',
              'name': 'How does Nada Sai edit PDFs and remove backgrounds without server uploads?',
              'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Nada Sai leverages modern browser APIs, WebAssembly, Web Workers, and local WebGPU/TensorFlow models. All processing for your images and PDF documents executes directly inside your device memory and CPU — zero bytes of your content are ever sent over the internet.'
              }
            },
            {
              '@type': 'Question',
              'name': 'Is it safe to process confidential business documents or personal photos?',
              'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Yes, 100% secure. Because no file data is ever transmitted across the network to external servers, your sensitive files never leave your device. You can even disconnect your Wi-Fi and continue editing offline.'
              }
            },
            {
              '@type': 'Question',
              'name': 'Are all image and PDF tools free to use?',
              'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Yes! All PDF editing tools (merge, split, compress, sign, watermark, edit text) and image tools (background removal, crop, convert, resize) are completely free with no daily caps or mandatory accounts.'
              }
            },
            {
              '@type': 'Question',
              'name': 'How do I merge or compress PDFs without losing quality?',
              'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Our native vector PDF engine merges pages while retaining exact original fonts, vector curves, and raster layers, optimizing file size without blurring text.'
              }
            },
            {
              '@type': 'Question',
              'name': 'Can I use Nada Sai offline without an internet connection?',
              'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Yes! Once loaded in your browser, the application assets and local AI models are cached locally. You can turn off your internet connection and keep using all tools.'
              }
            }
          ] : [
            {
              '@type': 'Question',
              'name': 'Como o Nada Sai edita PDFs e remove fundo sem enviar arquivos para servidores?',
              'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'O Nada Sai utiliza recursos modernos do navegador, como WebAssembly, Web Workers e modelos locais de IA (WebGPU/TensorFlow). Todo o processamento dos seus documentos e imagens roda diretamente na memória e no processador do seu próprio dispositivo — nenhum byte é enviado para a internet.'
              }
            },
            {
              '@type': 'Question',
              'name': 'É seguro editar documentos confidenciais ou fotos pessoais no Nada Sai?',
              'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Sim, 100% seguro. Como nenhum dado de arquivo é transmitido para servidores externos, seus arquivos sigilosos nunca saem do seu computador. Você pode inclusive usar as ferramentas com o Wi-Fi desligado.'
              }
            },
            {
              '@type': 'Question',
              'name': 'As ferramentas do Nada Sai são totalmente gratuitas?',
              'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Sim! Todas as ferramentas de edição de PDF (juntar, dividir, comprimir, assinar, marca d\'água, editar texto) e ferramentas de imagem (remover fundo, cortar, converter) são gratuitas, sem limite diário e sem cadastro.'
              }
            },
            {
              '@type': 'Question',
              'name': 'Como juntar ou comprimir PDFs mantendo a qualidade original?',
              'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Nosso motor vetorial nativo combina as páginas preservando fontes originais, curvas e imagens, otimizando o tamanho do arquivo sem embaçar os textos.'
              }
            },
            {
              '@type': 'Question',
              'name': 'Posso usar o Nada Sai offline sem conexão com a internet?',
              'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Sim! Após carregar a página pela primeira vez, a aplicação e os modelos locais de IA ficam salvos no seu navegador. Você pode desligar a internet e continuar utilizando todas as ferramentas normalmente.'
              }
            }
          ]
        }
      ]
    };

    script.textContent = JSON.stringify(schema);
  }
}
