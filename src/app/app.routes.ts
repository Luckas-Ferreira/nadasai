import { Routes } from '@angular/router';

export const routes: Routes = [
  // Base redirect to Portuguese
  { path: '', redirectTo: 'pt', pathMatch: 'full' },
  
  // Legacy redirects (from before internationalization)
  { path: 'remove-bg', redirectTo: 'pt/imagem/remover-fundo', pathMatch: 'full' },
  { path: 'crop', redirectTo: 'pt/imagem/cortar', pathMatch: 'full' },
  { path: 'compress', redirectTo: 'pt/imagem/comprimir', pathMatch: 'full' },
  { path: 'convert', redirectTo: 'pt/imagem/converter', pathMatch: 'full' },
  { path: 'resize', redirectTo: 'pt/imagem/redimensionar', pathMatch: 'full' },
  { path: 'edit-pdf', redirectTo: 'pt/pdf/editar', pathMatch: 'full' },
  { path: 'sobre', redirectTo: 'pt/sobre', pathMatch: 'full' },
  { path: 'privacidade', redirectTo: 'pt/privacidade', pathMatch: 'full' },
  { path: 'termos', redirectTo: 'pt/termos', pathMatch: 'full' },
  // Redirects from the first subdirectory iteration (no language prefix)
  { path: 'imagem/remover-fundo', redirectTo: 'pt/imagem/remover-fundo', pathMatch: 'full' },
  { path: 'imagem/cortar', redirectTo: 'pt/imagem/cortar', pathMatch: 'full' },
  { path: 'imagem/comprimir', redirectTo: 'pt/imagem/comprimir', pathMatch: 'full' },
  { path: 'imagem/converter', redirectTo: 'pt/imagem/converter', pathMatch: 'full' },
  { path: 'imagem/redimensionar', redirectTo: 'pt/imagem/redimensionar', pathMatch: 'full' },
  { path: 'pdf/editar', redirectTo: 'pt/pdf/editar', pathMatch: 'full' },

  // Portuguese Routes
  {
    path: 'pt',
    children: [
      {
        path: '',
        title: 'Nada Sai — seus arquivos não saem do seu computador',
        loadComponent: () => import('./features/hero/hero.component').then((m) => m.HeroComponent),
        data: {
          metaDescription: 'Ferramentas gratuitas para editar imagens e PDFs 100% offline no seu navegador. Privacidade total, sem envio de dados para servidores.',
          metaKeywords: 'editar imagem, editar pdf, remover fundo, offline, privacidade, ferramentas de imagem'
        }
      },
      {
        path: 'imagem/remover-fundo',
        title: 'Remover fundo — Nada Sai',
        loadComponent: () => import('./features/remove-bg/remove-bg.component').then((m) => m.RemoveBgComponent),
        data: {
          metaDescription: 'Remova o fundo de imagens automaticamente, grátis e offline. Suas fotos não são enviadas para nenhum servidor.',
          metaKeywords: 'remover fundo, tirar fundo, apagar fundo de imagem, imagem sem fundo png'
        }
      },
      {
        path: 'imagem/cortar',
        title: 'Cortar — Nada Sai',
        loadComponent: () => import('./features/crop/crop.component').then((m) => m.CropComponent),
        data: {
          metaDescription: 'Corte imagens no formato que você precisar, diretamente no seu navegador. Rápido e 100% privado.',
          metaKeywords: 'cortar imagem, recortar foto, ajustar tamanho de imagem, cropper online'
        }
      },
      {
        path: 'imagem/comprimir',
        title: 'Comprimir — Nada Sai',
        loadComponent: () => import('./features/compress/compress.component').then((m) => m.CompressComponent),
        data: {
          metaDescription: 'Diminua o tamanho do arquivo das suas imagens sem perder muita qualidade. Otimize suas fotos 100% offline.',
          metaKeywords: 'comprimir imagem, reduzir tamanho da foto, diminuir kb da imagem'
        }
      },
      {
        path: 'imagem/converter',
        title: 'Converter — Nada Sai',
        loadComponent: () => import('./features/convert/convert.component').then((m) => m.ConvertComponent),
        data: {
          metaDescription: 'Converta suas imagens para diferentes formatos (PNG, JPG, WebP) rapidamente e com total privacidade.',
          metaKeywords: 'converter imagem, png para jpg, jpg para webp, conversor de imagens offline'
        }
      },
      {
        path: 'imagem/redimensionar',
        title: 'Redimensionar — Nada Sai',
        loadComponent: () => import('./features/resize/resize.component').then((m) => m.ResizeComponent),
        data: {
          metaDescription: 'Mude a resolução (largura e altura) das suas imagens. Ferramenta grátis que roda no seu computador.',
          metaKeywords: 'redimensionar imagem, mudar tamanho da foto, alterar resolução da imagem'
        }
      },
      {
        path: 'imagem/para-pdf',
        title: 'Imagens para PDF — Nada Sai',
        loadComponent: () => import('./features/img-to-pdf/img-to-pdf.component').then((m) => m.ImgToPdfComponent),
        data: {
          metaDescription: 'Junte várias imagens em um único PDF, na ordem que você quiser. Grátis, offline e sem enviar nada para servidores.',
          metaKeywords: 'imagem para pdf, jpg para pdf, png para pdf, juntar imagens em pdf, converter fotos em pdf'
        }
      },
      {
        path: 'pdf/editar',
        title: 'Editor de PDF — Nada Sai',
        loadComponent: () => import('./features/pdf/pdf.component').then((m) => m.PdfComponent),
        data: {
          metaDescription: 'Edite seus arquivos PDF (juntar, reordenar, apagar páginas) 100% offline e com garantia de privacidade.',
          metaKeywords: 'editar pdf, juntar pdf, manipular páginas de pdf, editor de pdf offline'
        }
      },
      {
        path: 'sobre',
        title: 'Sobre — Nada Sai',
        loadComponent: () => import('./features/about/about.component').then((m) => m.AboutComponent),
      },
      {
        path: 'privacidade',
        title: 'Política de Privacidade — Nada Sai',
        loadComponent: () => import('./features/privacy/privacy.component').then((m) => m.PrivacyComponent),
      },
      {
        path: 'termos',
        title: 'Termos de Uso — Nada Sai',
        loadComponent: () => import('./features/terms/terms.component').then((m) => m.TermsComponent),
      }
    ]
  },

  // English Routes
  {
    path: 'en',
    children: [
      {
        path: '',
        title: 'Nada Sai — your files never leave your computer',
        loadComponent: () => import('./features/hero/hero.component').then((m) => m.HeroComponent),
        data: {
          metaDescription: 'Free tools to edit images and PDFs 100% offline in your browser. Total privacy, no data sent to servers.',
          metaKeywords: 'edit image, edit pdf, remove background, offline, privacy, image tools'
        }
      },
      {
        path: 'image/remove-bg',
        title: 'Remove background — Nada Sai',
        loadComponent: () => import('./features/remove-bg/remove-bg.component').then((m) => m.RemoveBgComponent),
        data: {
          metaDescription: 'Remove image backgrounds automatically, free and offline. Your photos are not sent to any server.',
          metaKeywords: 'remove background, erase background, transparent background maker, png background'
        }
      },
      {
        path: 'image/crop',
        title: 'Crop — Nada Sai',
        loadComponent: () => import('./features/crop/crop.component').then((m) => m.CropComponent),
        data: {
          metaDescription: 'Crop images to the size you need, right in your browser. Fast and 100% private.',
          metaKeywords: 'crop image, image cropper, resize picture online'
        }
      },
      {
        path: 'image/compress',
        title: 'Compress — Nada Sai',
        loadComponent: () => import('./features/compress/compress.component').then((m) => m.CompressComponent),
        data: {
          metaDescription: 'Reduce the file size of your images without losing much quality. Optimize your photos 100% offline.',
          metaKeywords: 'compress image, reduce photo size, decrease kb of image'
        }
      },
      {
        path: 'image/convert',
        title: 'Convert — Nada Sai',
        loadComponent: () => import('./features/convert/convert.component').then((m) => m.ConvertComponent),
        data: {
          metaDescription: 'Convert your images to different formats (PNG, JPG, WebP) quickly and with total privacy.',
          metaKeywords: 'convert image, png to jpg, jpg to webp, offline image converter'
        }
      },
      {
        path: 'image/resize',
        title: 'Resize — Nada Sai',
        loadComponent: () => import('./features/resize/resize.component').then((m) => m.ResizeComponent),
        data: {
          metaDescription: 'Change the resolution (width and height) of your images. Free tool that runs on your computer.',
          metaKeywords: 'resize image, change photo size, change image resolution'
        }
      },
      {
        path: 'image/to-pdf',
        title: 'Images to PDF — Nada Sai',
        loadComponent: () => import('./features/img-to-pdf/img-to-pdf.component').then((m) => m.ImgToPdfComponent),
        data: {
          metaDescription: 'Merge several images into a single PDF, in the order you choose. Free, offline, and nothing is uploaded.',
          metaKeywords: 'image to pdf, jpg to pdf, png to pdf, merge images into pdf, photos to pdf'
        }
      },
      {
        path: 'pdf/edit',
        title: 'PDF Editor — Nada Sai',
        loadComponent: () => import('./features/pdf/pdf.component').then((m) => m.PdfComponent),
        data: {
          metaDescription: 'Edit your PDF files (merge, reorder, delete pages) 100% offline with guaranteed privacy.',
          metaKeywords: 'edit pdf, merge pdf, manipulate pdf pages, offline pdf editor'
        }
      },
      {
        path: 'about',
        title: 'About — Nada Sai',
        loadComponent: () => import('./features/about/about.component').then((m) => m.AboutComponent),
      },
      {
        path: 'privacy',
        title: 'Privacy Policy — Nada Sai',
        loadComponent: () => import('./features/privacy/privacy.component').then((m) => m.PrivacyComponent),
      },
      {
        path: 'terms',
        title: 'Terms of Use — Nada Sai',
        loadComponent: () => import('./features/terms/terms.component').then((m) => m.TermsComponent),
      }
    ]
  },

  { path: '**', redirectTo: 'pt' },
];
