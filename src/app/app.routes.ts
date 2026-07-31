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
  { path: 'split-pdf', redirectTo: 'pt/pdf/dividir', pathMatch: 'full' },
  { path: 'pdf-to-img', redirectTo: 'pt/pdf/para-imagem', pathMatch: 'full' },
  { path: 'organize-pdf', redirectTo: 'pt/pdf/organizar', pathMatch: 'full' },
  { path: 'protect-pdf', redirectTo: 'pt/pdf/proteger', pathMatch: 'full' },
  { path: 'sign-pdf', redirectTo: 'pt/pdf/assinar', pathMatch: 'full' },
  { path: 'watermark-pdf', redirectTo: 'pt/pdf/marca-dagua', pathMatch: 'full' },
  { path: 'convert-audio', redirectTo: 'pt/audio/converter', pathMatch: 'full' },
  { path: 'audio/converter', redirectTo: 'pt/audio/converter', pathMatch: 'full' },
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
  { path: 'pdf/dividir', redirectTo: 'pt/pdf/dividir', pathMatch: 'full' },
  { path: 'pdf/para-imagem', redirectTo: 'pt/pdf/para-imagem', pathMatch: 'full' },
  { path: 'pdf/organizar', redirectTo: 'pt/pdf/organizar', pathMatch: 'full' },
  { path: 'pdf/proteger', redirectTo: 'pt/pdf/proteger', pathMatch: 'full' },
  { path: 'pdf/assinar', redirectTo: 'pt/pdf/assinar', pathMatch: 'full' },
  { path: 'pdf/marca-dagua', redirectTo: 'pt/pdf/marca-dagua', pathMatch: 'full' },

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
        path: 'imagem/melhorar-qualidade',
        title: 'Melhorar Qualidade da Imagem — Nada Sai',
        loadComponent: () => import('./features/upscale/upscale.component').then((m) => m.UpscaleComponent),
        data: {
          metaDescription: 'Aumente a resolução e melhore a nitidez de fotos em 2x e 4x com inteligência artificial 100% offline.',
          metaKeywords: 'melhorar qualidade da foto, aumentar resolucao, upscale imagem, desembaçar foto'
        }
      },
      {
        path: 'imagem/extrair-texto',
        title: 'Extrair Texto de Imagem (OCR) — Nada Sai',
        loadComponent: () => import('./features/extract-text/extract-text.component').then((m) => m.ExtractTextComponent),
        data: {
          metaDescription: 'Extraia e copie texto de fotos, recibos e documentos digitalizados 100% offline no seu navegador.',
          metaKeywords: 'extrair texto de imagem, ocr online offline, copiar texto de foto, converter imagem em texto, leitor de recibos'
        }
      },
      {
        path: 'audio/cortar',
        title: 'Cortar Áudio e MP3 — Nada Sai',
        loadComponent: () => import('./features/cut-audio/cut-audio.component').then((m) => m.CutAudioComponent),
        data: {
          metaDescription: 'Corte músicas, áudios do WhatsApp e podcasts 100% offline no navegador: forma de onda, alças arrastáveis, tempos precisos e fade in/out.',
          metaKeywords: 'cortar audio, aparar mp3, cortar musica online, editor de audio offline, toque de celular, recortar som, remover trecho de audio'
        }
      },
      {
        path: 'audio/juntar',
        title: 'Juntar Áudios e MP3 — Nada Sai',
        loadComponent: () => import('./features/merge-audio/merge-audio.component').then((m) => m.MergeAudioComponent),
        data: {
          metaDescription: 'Junte vários áudios em um só arquivo 100% offline no navegador: arraste para reordenar, com crossfade, silêncio entre faixas e fade in/out.',
          metaKeywords: 'juntar audio, unir audios, mesclar mp3, combinar musicas, emendar audio, crossfade, juntar audios do whatsapp'
        }
      },
      {
        path: 'audio/converter',
        title: 'Converter Áudio e MP3 — Nada Sai',
        loadComponent: () => import('./features/convert-audio/convert-audio.component').then((m) => m.ConvertAudioComponent),
        data: {
          metaDescription: 'Converta arquivos de áudio (MP3, WAV, OGG, M4A, AAC, FLAC) 100% offline no seu navegador. Rápido, gratuito e seguro.',
          metaKeywords: 'converter audio, mp3 para wav, wav para mp3, ogg para mp3, m4a para mp3, conversor de audio offline'
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
        path: 'pdf/juntar',
        title: 'Juntar PDF — Nada Sai',
        loadComponent: () => import('./features/merge-pdf/merge-pdf.component').then((m) => m.MergePdfComponent),
        data: {
          metaDescription: 'Junte vários PDFs em um só e organize as páginas na ordem que quiser. Grátis, offline e sem enviar nada para servidores.',
          metaKeywords: 'juntar pdf, unir pdf, mesclar pdf, combinar pdf, organizar páginas de pdf'
        }
      },
      {
        path: 'pdf/comprimir',
        title: 'Comprimir PDF — Nada Sai',
        loadComponent: () => import('./features/compress-pdf/compress-pdf.component').then((m) => m.CompressPdfComponent),
        data: {
          metaDescription: 'Reduza o tamanho de arquivos PDF direto no navegador. Seu documento não sai do seu computador.',
          metaKeywords: 'comprimir pdf, reduzir tamanho de pdf, diminuir pdf, compactar pdf'
        }
      },
      {
        path: 'pdf/dividir',
        title: 'Dividir PDF — Nada Sai',
        loadComponent: () => import('./features/split-pdf/split-pdf.component').then((m) => m.SplitPdfComponent),
        data: {
          metaDescription: 'Divida e extraia páginas de arquivos PDF 100% offline no seu navegador. Escolha intervalos ou selecione páginas.',
          metaKeywords: 'dividir pdf, separar pdf, extrair paginas pdf, cortar pdf'
        }
      },
      {
        path: 'pdf/para-imagem',
        title: 'PDF para Imagem — Nada Sai',
        loadComponent: () => import('./features/pdf-to-img/pdf-to-img.component').then((m) => m.PdfToImgComponent),
        data: {
          metaDescription: 'Converta páginas de PDF em imagens JPG, PNG ou WEBP 100% offline no seu navegador. Alta resolução e sem enviar nada.',
          metaKeywords: 'pdf para imagem, converter pdf em jpg, pdf para png, transformar pdf em foto'
        }
      },
      {
        path: 'pdf/para-word',
        title: 'PDF para Word — Nada Sai',
        loadComponent: () => import('./features/pdf-to-word/pdf-to-word.component').then((m) => m.PdfToWordComponent),
        data: {
          metaDescription: 'Converta PDF em Word (.docx) editável 100% offline no seu navegador. Reconhece PDF digitalizado com OCR e nada é enviado para servidor.',
          metaKeywords: 'pdf para word, converter pdf em word, pdf para docx, pdf editavel, pdf digitalizado para word'
        }
      },
      {
        path: 'pdf/organizar',
        title: 'Organizar PDF — Nada Sai',
        loadComponent: () => import('./features/organize-pdf/organize-pdf.component').then((m) => m.OrganizePdfComponent),
        data: {
          metaDescription: 'Reordene, gire e remova páginas de arquivos PDF 100% offline no seu navegador. Rápido, gratuito e seguro.',
          metaKeywords: 'organizar pdf, girar pdf, reordenar paginas pdf, excluir paginas pdf, mover paginas pdf'
        }
      },
      {
        path: 'pdf/proteger',
        title: 'Proteger PDF — Nada Sai',
        loadComponent: () => import('./features/protect-pdf/protect-pdf.component').then((m) => m.ProtectPdfComponent),
        data: {
          metaDescription: 'Criptografe e adicione senha de proteção a arquivos PDF 100% offline no seu navegador. Segurança total sem uploads.',
          metaKeywords: 'proteger pdf, colocar senha em pdf, criptografar pdf, bloquear pdf'
        }
      },
      {
        path: 'pdf/assinar',
        title: 'Assinar PDF — Nada Sai',
        loadComponent: () => import('./features/sign-pdf/sign-pdf.component').then((m) => m.SignPdfComponent),
        data: {
          metaDescription: 'Desenhe sua assinatura, carregue rubrica ou digite seu nome em arquivos PDF 100% offline no seu navegador.',
          metaKeywords: 'assinar pdf, assinatura digital pdf, rubrica pdf, carimbar pdf'
        }
      },
      {
        path: 'pdf/marca-dagua',
        title: 'Marca d\'Água no PDF — Nada Sai',
        loadComponent: () => import('./features/watermark-pdf/watermark-pdf.component').then((m) => m.WatermarkPdfComponent),
        data: {
          metaDescription: 'Adicione marcas d\'água de texto personalizadas em arquivos PDF 100% offline no seu navegador.',
          metaKeywords: 'marca d agua pdf, colocar texto em pdf, confidencial pdf, marcas d agua'
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
      },
      {
        path: 'faq',
        title: 'Perguntas Frequentes — Nada Sai',
        loadComponent: () => import('./shared/ui/faq.component').then((m) => m.FaqComponent),
        data: {
          metaDescription: 'Respostas para todas as suas dúvidas sobre segurança, privacidade, edição de PDF e remoção de fundo 100% offline no Nada Sai.',
          metaKeywords: 'faq nada sai, duvidas nada sai, seguranca pdf offline, privacidade de imagem'
        }
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
        path: 'image/upscale',
        title: 'Enhance Image Quality — Nada Sai',
        loadComponent: () => import('./features/upscale/upscale.component').then((m) => m.UpscaleComponent),
        data: {
          metaDescription: 'Increase image resolution and enhance sharpness in 2x and 4x with 100% offline AI.',
          metaKeywords: 'upscale image, enhance photo quality, increase resolution, unblur photo'
        }
      },
      {
        path: 'image/extract-text',
        title: 'Extract Text from Image (OCR) — Nada Sai',
        loadComponent: () => import('./features/extract-text/extract-text.component').then((m) => m.ExtractTextComponent),
        data: {
          metaDescription: 'Recognize and copy text from photos, receipts, and scanned documents 100% offline in your browser.',
          metaKeywords: 'extract text from image, offline ocr, copy text from photo, image to text, read receipt photo'
        }
      },
      {
        path: 'audio/cut',
        title: 'Cut Audio & MP3 — Nada Sai',
        loadComponent: () => import('./features/cut-audio/cut-audio.component').then((m) => m.CutAudioComponent),
        data: {
          metaDescription: 'Cut songs, voice notes and podcasts 100% offline in your browser: waveform, draggable handles, exact timecodes and fade in/out.',
          metaKeywords: 'cut audio, trim mp3, mp3 cutter, trim audio online, audio editor, ringtone maker, remove part of audio'
        }
      },
      {
        path: 'audio/merge',
        title: 'Merge Audio & MP3 — Nada Sai',
        loadComponent: () => import('./features/merge-audio/merge-audio.component').then((m) => m.MergeAudioComponent),
        data: {
          metaDescription: 'Join several audio files into one 100% offline in your browser: drag to reorder, with crossfade, gaps between tracks and fade in/out.',
          metaKeywords: 'merge audio, join mp3, audio joiner, combine audio files, concatenate audio, crossfade tracks, stitch audio'
        }
      },
      {
        path: 'audio/convert',
        title: 'Convert Audio & MP3 — Nada Sai',
        loadComponent: () => import('./features/convert-audio/convert-audio.component').then((m) => m.ConvertAudioComponent),
        data: {
          metaDescription: 'Convert audio files (MP3, WAV, OGG, M4A, AAC, FLAC) 100% offline in your browser. Fast, free, and private.',
          metaKeywords: 'convert audio, mp3 to wav, wav to mp3, ogg to mp3, m4a to mp3, offline audio converter'
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
        path: 'pdf/merge',
        title: 'Merge PDF — Nada Sai',
        loadComponent: () => import('./features/merge-pdf/merge-pdf.component').then((m) => m.MergePdfComponent),
        data: {
          metaDescription: 'Combine several PDFs into one and arrange the pages in any order. Free, offline, and nothing is uploaded.',
          metaKeywords: 'merge pdf, combine pdf, join pdf files, reorder pdf pages'
        }
      },
      {
        path: 'pdf/compress',
        title: 'Compress PDF — Nada Sai',
        loadComponent: () => import('./features/compress-pdf/compress-pdf.component').then((m) => m.CompressPdfComponent),
        data: {
          metaDescription: 'Reduce PDF file size right in your browser. Your document never leaves your computer.',
          metaKeywords: 'compress pdf, reduce pdf size, shrink pdf, make pdf smaller'
        }
      },
      {
        path: 'pdf/split',
        title: 'Split PDF — Nada Sai',
        loadComponent: () => import('./features/split-pdf/split-pdf.component').then((m) => m.SplitPdfComponent),
        data: {
          metaDescription: 'Split and extract pages from PDF files 100% offline in your browser. Select ranges or specific pages.',
          metaKeywords: 'split pdf, extract pdf pages, separate pdf, cut pdf'
        }
      },
      {
        path: 'pdf/to-image',
        title: 'PDF to Image — Nada Sai',
        loadComponent: () => import('./features/pdf-to-img/pdf-to-img.component').then((m) => m.PdfToImgComponent),
        data: {
          metaDescription: 'Convert PDF pages into JPG, PNG or WEBP images 100% offline in your browser. High resolution and zero uploads.',
          metaKeywords: 'pdf to image, convert pdf to jpg, pdf to png, pdf to photo'
        }
      },
      {
        path: 'pdf/to-word',
        title: 'PDF to Word — Nada Sai',
        loadComponent: () => import('./features/pdf-to-word/pdf-to-word.component').then((m) => m.PdfToWordComponent),
        data: {
          metaDescription: 'Convert PDF to an editable Word (.docx) file 100% offline in your browser. Reads scanned PDFs with OCR and nothing is ever uploaded.',
          metaKeywords: 'pdf to word, convert pdf to word, pdf to docx, editable pdf, scanned pdf to word'
        }
      },
      {
        path: 'pdf/organize',
        title: 'Organize PDF — Nada Sai',
        loadComponent: () => import('./features/organize-pdf/organize-pdf.component').then((m) => m.OrganizePdfComponent),
        data: {
          metaDescription: 'Reorder, rotate, and delete pages from PDF files 100% offline in your browser. Fast, free and secure.',
          metaKeywords: 'organize pdf, rotate pdf, reorder pdf pages, delete pdf pages'
        }
      },
      {
        path: 'pdf/protect',
        title: 'Protect PDF — Nada Sai',
        loadComponent: () => import('./features/protect-pdf/protect-pdf.component').then((m) => m.ProtectPdfComponent),
        data: {
          metaDescription: 'Encrypt and set a password on PDF files 100% offline in your browser. Total security with zero uploads.',
          metaKeywords: 'protect pdf, encrypt pdf, set pdf password, lock pdf'
        }
      },
      {
        path: 'pdf/sign',
        title: 'Sign PDF — Nada Sai',
        loadComponent: () => import('./features/sign-pdf/sign-pdf.component').then((m) => m.SignPdfComponent),
        data: {
          metaDescription: 'Draw your signature, upload a stamp, or type your name on PDF files 100% offline in your browser.',
          metaKeywords: 'sign pdf, digital signature, pdf signature, stamp pdf'
        }
      },
      {
        path: 'pdf/watermark',
        title: 'Watermark PDF — Nada Sai',
        loadComponent: () => import('./features/watermark-pdf/watermark-pdf.component').then((m) => m.WatermarkPdfComponent),
        data: {
          metaDescription: 'Add custom text watermarks to PDF files 100% offline in your browser.',
          metaKeywords: 'watermark pdf, text watermark, pdf stamp, confidential pdf'
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
      },
      {
        path: 'faq',
        title: 'Frequently Asked Questions — Nada Sai',
        loadComponent: () => import('./shared/ui/faq.component').then((m) => m.FaqComponent),
        data: {
          metaDescription: 'Answers to all your questions about security, privacy, PDF editing, and background removal 100% offline with Nada Sai.',
          metaKeywords: 'faq nada sai, questions offline pdf, privacy image editing'
        }
      }
    ]
  },

  { path: '**', redirectTo: 'pt' },
];
