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
  { path: 'audio/comprimir', redirectTo: 'pt/audio/comprimir', pathMatch: 'full' },
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
          metaDescription: 'Ferramentas gratuitas de imagem, PDF, áudio e privacidade que rodam 100% offline no seu navegador. Sem cadastro, sem marca d\'água e sem enviar arquivo nenhum.',
          metaKeywords: 'editar imagem, editar pdf, remover fundo, offline, privacidade, ferramentas de imagem'
        }
      },
      {
        path: 'imagem/remover-fundo',
        title: 'Remover Fundo de Imagem Online Grátis — Nada Sai',
        loadComponent: () => import('./features/remove-bg/remove-bg.component').then((m) => m.RemoveBgComponent),
        data: {
          metaDescription: 'Remova o fundo de fotos com IA e baixe em PNG transparente. Sem cadastro, sem marca d\'água e sem limite — 100% offline no seu navegador.'
        }
      },
      {
        path: 'imagem/melhorar-qualidade',
        title: 'Melhorar Qualidade de Foto Online (2x e 4x) — Nada Sai',
        loadComponent: () => import('./features/upscale/upscale.component').then((m) => m.UpscaleComponent),
        data: {
          metaDescription: 'Aumente a resolução e a nitidez de fotos em 2x ou 4x com IA, sem borrar o rosto nem inventar detalhe. Grátis, sem cadastro e 100% offline no seu navegador.'
        }
      },
      {
        path: 'imagem/vetorizar',
        title: 'Vetorizar Imagem Online (PNG e JPG para SVG) — Nada Sai',
        loadComponent: () => import('./features/vectorize/vectorize.component').then((m) => m.VectorizeComponent),
        data: {
          metaDescription: 'Converta PNG ou JPG em SVG de verdade: curvas Bézier, cantos preservados e sem costura entre as cores. Grátis, sem cadastro e 100% offline no seu navegador.'
        }
      },
      {
        path: 'imagem/extrair-texto',
        title: 'Extrair Texto de Imagem (OCR) Online — Nada Sai',
        loadComponent: () => import('./features/extract-text/extract-text.component').then((m) => m.ExtractTextComponent),
        data: {
          metaDescription: 'Copie o texto de fotos, prints, recibos e documentos digitalizados com OCR em português e inglês. Nenhuma imagem é enviada: 100% offline no seu navegador.'
        }
      },
      {
        path: 'audio/cortar',
        title: 'Cortar Áudio e MP3 — Nada Sai',
        loadComponent: () => import('./features/cut-audio/cut-audio.component').then((m) => m.CutAudioComponent),
        data: {
          metaDescription: 'Corte músicas, áudios do WhatsApp e podcasts com forma de onda, alças arrastáveis, tempos precisos e fade in/out. Até 30 minutos, 100% offline no seu navegador.'
        }
      },
      {
        path: 'audio/juntar',
        title: 'Juntar Áudios e MP3 — Nada Sai',
        loadComponent: () => import('./features/merge-audio/merge-audio.component').then((m) => m.MergeAudioComponent),
        data: {
          metaDescription: 'Junte vários áudios em um só arquivo 100% offline no navegador: arraste para reordenar, com crossfade, silêncio entre faixas e fade in/out.'
        }
      },
      {
        path: 'audio/converter',
        title: 'Converter Áudio Online (MP3, WAV, OGG) — Nada Sai',
        loadComponent: () => import('./features/convert-audio/convert-audio.component').then((m) => m.ConvertAudioComponent),
        data: {
          metaDescription: 'Converta entre MP3, WAV, OGG, M4A, AAC e FLAC sem instalar nada e sem fila de espera. Arquivos de até 100 MB, grátis e 100% offline no seu navegador.'
        }
      },
      {
        path: 'audio/comprimir',
        title: 'Comprimir Áudio e MP3 Online — Nada Sai',
        loadComponent: () => import('./features/compress-audio/compress-audio.component').then((m) => m.CompressAudioComponent),
        data: {
          metaDescription: 'Reduza o tamanho de MP3, WAV, OGG e M4A escolhendo o bitrate, com o tamanho final estimado antes de baixar. Até 100 MB, grátis e 100% offline no seu navegador.'
        }
      },
      {
        path: 'audio/extrair-de-video',
        title: 'Extrair Áudio de Vídeo (MP4 para MP3) — Nada Sai',
        loadComponent: () => import('./features/video-to-audio/video-to-audio.component').then((m) => m.VideoToAudioComponent),
        data: {
          metaDescription: 'Tire a trilha de áudio de um MP4, MOV, WebM ou MKV e baixe em MP3 ou WAV sem perda. O vídeo não sai do seu computador — 100% offline no navegador.'
        }
      },
      {
        path: 'imagem/cortar',
        title: 'Cortar Imagem Online (Proporção Livre) — Nada Sai',
        loadComponent: () => import('./features/crop/crop.component').then((m) => m.CropComponent),
        data: {
          metaDescription: 'Corte fotos na proporção que precisar — livre, quadrado, 16:9 ou tamanho exato em pixels — com prévia em tempo real. Grátis e 100% offline no seu navegador.'
        }
      },
      {
        path: 'imagem/comprimir',
        title: 'Comprimir Imagem Online sem Perder Qualidade — Nada Sai',
        loadComponent: () => import('./features/compress/compress.component').then((m) => m.CompressComponent),
        data: {
          metaDescription: 'Reduza o tamanho de JPEG, PNG e WebP escolhendo a qualidade e vendo a economia em KB antes de baixar. Sem cadastro e sem limite, 100% offline no seu navegador.'
        }
      },
      {
        path: 'imagem/converter',
        title: 'Converter Imagem Online (PNG, JPG, WebP) — Nada Sai',
        loadComponent: () => import('./features/convert/convert.component').then((m) => m.ConvertComponent),
        data: {
          metaDescription: 'Converta entre PNG, JPEG, WebP, GIF e ICO em um clique, com controle de qualidade. AVIF entra como entrada. Grátis e 100% offline no navegador.'
        }
      },
      {
        path: 'imagem/redimensionar',
        title: 'Redimensionar Imagem Online (Pixels ou %) — Nada Sai',
        loadComponent: () => import('./features/resize/resize.component').then((m) => m.ResizeComponent),
        data: {
          metaDescription: 'Mude a largura e a altura de uma foto por pixels ou porcentagem, mantendo a proporção se quiser. Sem cadastro, sem marca d\'água e 100% offline no seu navegador.'
        }
      },
      {
        path: 'imagem/para-pdf',
        title: 'Converter Imagem em PDF Online (Várias Fotos) — Nada Sai',
        loadComponent: () => import('./features/img-to-pdf/img-to-pdf.component').then((m) => m.ImgToPdfComponent),
        data: {
          metaDescription: 'Junte várias fotos em um único PDF, arrastando para reordenar as páginas antes de gerar. JPEG, PNG, WebP e GIF, grátis e 100% offline no seu navegador.'
        }
      },
      {
        path: 'pdf/editar',
        title: 'Editar PDF Online (Texto e OCR) — Nada Sai',
        loadComponent: () => import('./features/pdf/pdf.component').then((m) => m.PdfComponent),
        data: {
          metaDescription: 'Edite o texto de um PDF direto no navegador, com OCR para documentos digitalizados. Nenhum arquivo é enviado para servidor: 100% offline no seu navegador.'
        }
      },
      {
        path: 'pdf/juntar',
        title: 'Juntar PDF Online (Vários Arquivos) — Nada Sai',
        loadComponent: () => import('./features/merge-pdf/merge-pdf.component').then((m) => m.MergePdfComponent),
        data: {
          metaDescription: 'Una vários PDFs em um só, arrastando para definir a ordem, sem perder fontes nem qualidade. Até 100 MB por arquivo, grátis e 100% offline no seu navegador.'
        }
      },
      {
        path: 'pdf/comprimir',
        title: 'Comprimir PDF Online sem Perder Qualidade — Nada Sai',
        loadComponent: () => import('./features/compress-pdf/compress-pdf.component').then((m) => m.CompressPdfComponent),
        data: {
          metaDescription: 'Reduza o tamanho de um PDF em três níveis, vendo quanto economizou antes de baixar. O texto continua pesquisável. Grátis e 100% offline no seu navegador.'
        }
      },
      {
        path: 'pdf/dividir',
        title: 'Dividir PDF Online (Separar Páginas) — Nada Sai',
        loadComponent: () => import('./features/split-pdf/split-pdf.component').then((m) => m.SplitPdfComponent),
        data: {
          metaDescription: 'Separe um PDF por intervalos, a cada N páginas ou escolhendo página a página, baixando em ZIP ou num arquivo só. Grátis e 100% offline no seu navegador.'
        }
      },
      {
        path: 'pdf/para-imagem',
        title: 'Converter PDF em Imagem Online (JPG e PNG) — Nada Sai',
        loadComponent: () => import('./features/pdf-to-img/pdf-to-img.component').then((m) => m.PdfToImgComponent),
        data: {
          metaDescription: 'Transforme cada página de um PDF em JPG ou PNG na resolução que escolher, baixando tudo em ZIP. Até 100 MB, grátis e 100% offline no seu navegador.'
        }
      },
      {
        path: 'pdf/para-word',
        title: 'Converter PDF para Word (DOCX) Online — Nada Sai',
        loadComponent: () => import('./features/pdf-to-word/pdf-to-word.component').then((m) => m.PdfToWordComponent),
        data: {
          metaDescription: 'Converta um PDF em .docx editável preservando parágrafos, negrito e itálico, com OCR para páginas digitalizadas. Grátis e 100% offline no seu navegador.'
        }
      },
      {
        path: 'pdf/organizar',
        title: 'Organizar PDF Online (Girar e Apagar Páginas) — Nada Sai',
        loadComponent: () => import('./features/organize-pdf/organize-pdf.component').then((m) => m.OrganizePdfComponent),
        data: {
          metaDescription: 'Reordene, gire e apague páginas de um PDF arrastando as miniaturas, e baixe o documento remontado. Até 100 MB, grátis e 100% offline no seu navegador.'
        }
      },
      {
        path: 'pdf/proteger',
        title: 'Proteger PDF com Senha Online — Nada Sai',
        loadComponent: () => import('./features/protect-pdf/protect-pdf.component').then((m) => m.ProtectPdfComponent),
        data: {
          metaDescription: 'Coloque senha em um PDF com criptografia, para que só quem tiver a chave consiga abrir. A senha nunca sai do seu computador: 100% offline no seu navegador.'
        }
      },
      {
        path: 'pdf/assinar',
        title: 'Assinar PDF Online (Desenhar Assinatura) — Nada Sai',
        loadComponent: () => import('./features/sign-pdf/sign-pdf.component').then((m) => m.SignPdfComponent),
        data: {
          metaDescription: 'Desenhe ou digite sua assinatura e posicione onde quiser na página, em qualquer PDF. Nada é enviado para servidor: 100% offline no seu navegador.'
        }
      },
      {
        path: 'pdf/marca-dagua',
        title: 'Colocar Marca d’Água em PDF Online — Nada Sai',
        loadComponent: () => import('./features/watermark-pdf/watermark-pdf.component').then((m) => m.WatermarkPdfComponent),
        data: {
          metaDescription: 'Adicione uma marca d\'água de texto em todas as páginas, com controle de tamanho, ângulo, cor e transparência. Grátis e 100% offline no seu navegador.'
        }
      },
      {
        path: 'privacidade/criptografar-arquivo',
        title: 'Criptografar Arquivo com Senha (AES-256) — Nada Sai',
        loadComponent: () => import('./features/privacy/encrypt-file/encrypt-file.component').then((m) => m.EncryptFileComponent),
        data: {
          metaDescription: 'Proteja qualquer arquivo com senha usando AES-256 e PBKDF2, e abra depois na mesma ferramenta. A senha nunca sai daqui: 100% offline no seu navegador.'
        }
      },
      {
        path: 'privacidade/hash-de-arquivo',
        title: 'Hash e Checksum de Arquivo Online (SHA-256) — Nada Sai',
        loadComponent: () => import('./features/privacy/file-hash/file-hash.component').then((m) => m.FileHashComponent),
        data: {
          metaDescription: 'Calcule SHA-256, SHA-512 e MD5 e confira se um download chegou íntegro, colando o checksum publicado. Qualquer tamanho, 100% offline no seu navegador.'
        }
      },
      {
        path: 'privacidade/gerador-de-senha',
        title: 'Gerador de Senha Forte Online — Nada Sai',
        loadComponent: () => import('./features/privacy/password-generator/password-generator.component').then((m) => m.PasswordGeneratorComponent),
        data: {
          metaDescription: 'Gere senhas aleatórias de até 128 caracteres com o gerador criptográfico do navegador e veja a entropia real em bits. 100% offline no seu navegador.'
        }
      },
      {
        path: 'privacidade/remover-exif',
        title: 'Remover EXIF e GPS de Foto Online — Nada Sai',
        loadComponent: () => import('./features/privacy/remove-exif/remove-exif.component').then((m) => m.RemoveExifComponent),
        data: {
          metaDescription: 'Veja e apague a localização GPS, o modelo da câmera e a data das suas fotos antes de compartilhar — sem reencodar a imagem. 100% offline no seu navegador.'
        }
      },
      {
        path: 'privacidade/censurar-imagem',
        title: 'Censurar Imagem Online (Tarja Preta) — Nada Sai',
        loadComponent: () => import('./features/privacy/redact-image/redact-image.component').then((m) => m.RedactImageComponent),
        data: {
          metaDescription: 'Cubra CPF, cartões, endereços e rostos com tarja preta queimada nos pixels: o que estava embaixo deixa de existir. Grátis e 100% offline no seu navegador.'
        }
      },
      {
        path: 'privacidade/comparar-texto',
        title: 'Comparar Textos e Arquivos Online (Diff) — Nada Sai',
        loadComponent: () => import('./features/privacy/diff-checker/diff-checker.component').then((m) => m.DiffCheckerComponent),
        data: {
          metaDescription: 'Compare dois textos lado a lado e veja adições, remoções e alterações com número de linha. Serve para contrato e código: 100% offline no seu navegador.'
        }
      },
      {
        path: 'privacidade/censurar-pdf',
        title: 'Censurar PDF (Tarja Preta Real) Online — Nada Sai',
        loadComponent: () => import('./features/privacy/redact-pdf/redact-pdf.component').then((m) => m.RedactPdfComponent),
        data: {
          metaDescription: 'Tarjar PDF de verdade: o texto por baixo da tarja é destruído, não apenas coberto, então não sai em copiar e colar. 100% offline no seu navegador.',
        }
      },
      {
        path: 'privacidade/limpar-metadados-pdf',
        title: 'Remover Metadados de PDF Online — Nada Sai',
        loadComponent: () => import('./features/privacy/clean-pdf-metadata/clean-pdf-metadata.component').then((m) => m.CleanPdfMetadataComponent),
        data: {
          metaDescription: 'Veja e apague autor, software, datas e XMP de um PDF antes de enviar. Mostra o que foi encontrado antes de limpar, 100% offline no seu navegador.',
        }
      },
      {
        path: 'privacidade/criptografar-texto',
        title: 'Criptografar Texto e Mensagens (AES-256) — Nada Sai',
        loadComponent: () => import('./features/privacy/encrypt-text/encrypt-text.component').then((m) => m.EncryptTextComponent),
        data: {
          metaDescription: 'Criptografe um texto com senha e AES-256 e receba um bloco pronto para colar em e-mail ou chat. Nada é enviado: 100% offline no seu navegador.',
        }
      },
      {
        path: 'sobre',
        title: 'Sobre o Nada Sai — Como Funciona',
        loadComponent: () => import('./features/about/about.component').then((m) => m.AboutComponent),
        data: {
          metaDescription: 'Como o Nada Sai processa imagens, PDFs, áudio e dados sensíveis inteiramente no seu navegador, com WebAssembly e IA local. Nenhum arquivo sai do computador.',
        }
      },
      {
        path: 'privacidade',
        title: 'Política de Privacidade — Nada Sai',
        loadComponent: () => import('./features/privacy-policy/privacy.component').then((m) => m.PrivacyComponent),
        data: {
          metaDescription: 'A política de privacidade do Nada Sai é curta porque não há o que coletar: nenhum arquivo é enviado, nada é armazenado e o processamento é todo local.',
        }
      },
      {
        path: 'termos',
        title: 'Termos de Uso — Nada Sai',
        loadComponent: () => import('./features/terms/terms.component').then((m) => m.TermsComponent),
        data: {
          metaDescription: 'Termos de uso do Nada Sai: ferramentas gratuitas de imagem, PDF, áudio e privacidade que rodam no seu navegador, sem cadastro e sem envio de arquivos.',
        }
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
        title: 'Remove Image Background Online Free — Nada Sai',
        loadComponent: () => import('./features/remove-bg/remove-bg.component').then((m) => m.RemoveBgComponent),
        data: {
          metaDescription: 'Erase the background from photos automatically with AI and download a transparent PNG. No signup, no watermark, no daily cap — 100% offline in your browser.'
        }
      },
      {
        path: 'image/upscale',
        title: 'Upscale and Enhance Photos Online (2x, 4x) — Nada Sai',
        loadComponent: () => import('./features/upscale/upscale.component').then((m) => m.UpscaleComponent),
        data: {
          metaDescription: 'Increase resolution and sharpness by 2x or 4x with AI, without smearing faces or inventing detail. Free, no signup and 100% offline in your browser.'
        }
      },
      {
        path: 'image/vectorize',
        title: 'Vectorize Image Online (PNG and JPG to SVG) — Nada Sai',
        loadComponent: () => import('./features/vectorize/vectorize.component').then((m) => m.VectorizeComponent),
        data: {
          metaDescription: 'Turn PNG or JPG into a real SVG: Bézier curves, corners preserved and no seams between colours. Free, no signup and 100% offline in your browser.'
        }
      },
      {
        path: 'image/extract-text',
        title: 'Extract Text from Image (OCR) Online — Nada Sai',
        loadComponent: () => import('./features/extract-text/extract-text.component').then((m) => m.ExtractTextComponent),
        data: {
          metaDescription: 'Copy text out of photos, screenshots, receipts and scanned documents with OCR. No image is ever uploaded, because it runs 100% offline in your browser.'
        }
      },
      {
        path: 'audio/cut',
        title: 'Cut Audio & MP3 — Nada Sai',
        loadComponent: () => import('./features/cut-audio/cut-audio.component').then((m) => m.CutAudioComponent),
        data: {
          metaDescription: 'Cut songs, voice notes and podcasts with a real waveform, draggable handles, exact timecodes and fade in/out. Up to 30 minutes, 100% offline in your browser.'
        }
      },
      {
        path: 'audio/merge',
        title: 'Merge Audio & MP3 — Nada Sai',
        loadComponent: () => import('./features/merge-audio/merge-audio.component').then((m) => m.MergeAudioComponent),
        data: {
          metaDescription: 'Join several audio files into one 100% offline in your browser: drag to reorder, with crossfade, gaps between tracks and fade in/out.'
        }
      },
      {
        path: 'audio/convert',
        title: 'Convert Audio Online (MP3, WAV, OGG) — Nada Sai',
        loadComponent: () => import('./features/convert-audio/convert-audio.component').then((m) => m.ConvertAudioComponent),
        data: {
          metaDescription: 'Convert between MP3, WAV, OGG, M4A, AAC and FLAC with nothing to install and no queue to wait in. Files up to 100 MB, 100% offline in your browser.'
        }
      },
      {
        path: 'audio/compress',
        title: 'Compress Audio and MP3 Online — Nada Sai',
        loadComponent: () => import('./features/compress-audio/compress-audio.component').then((m) => m.CompressAudioComponent),
        data: {
          metaDescription: 'Shrink MP3, WAV, OGG and M4A by choosing the bitrate, with the final size estimated before you download. Up to 100 MB, 100% offline in your browser.'
        }
      },
      {
        path: 'audio/extract-from-video',
        title: 'Extract Audio from Video (MP4 to MP3) — Nada Sai',
        loadComponent: () => import('./features/video-to-audio/video-to-audio.component').then((m) => m.VideoToAudioComponent),
        data: {
          metaDescription: 'Pull the audio track out of an MP4, MOV, WebM or MKV and save it as MP3 or lossless WAV. The video never leaves your computer — 100% offline.'
        }
      },
      {
        path: 'image/crop',
        title: 'Crop Image Online (Any Aspect Ratio) — Nada Sai',
        loadComponent: () => import('./features/crop/crop.component').then((m) => m.CropComponent),
        data: {
          metaDescription: 'Crop photos to any ratio — free, square, 16:9 or an exact pixel size — with a live preview as you drag. Free, no signup and 100% offline in your browser.'
        }
      },
      {
        path: 'image/compress',
        title: 'Compress Image Online Without Losing Quality — Nada Sai',
        loadComponent: () => import('./features/compress/compress.component').then((m) => m.CompressComponent),
        data: {
          metaDescription: 'Shrink JPEG, PNG and WebP by choosing the quality and seeing the KB saved before you download. No signup, no cap, and 100% offline in your browser.'
        }
      },
      {
        path: 'image/convert',
        title: 'Convert Image Online (PNG, JPG, WebP) — Nada Sai',
        loadComponent: () => import('./features/convert/convert.component').then((m) => m.ConvertComponent),
        data: {
          metaDescription: 'Convert between PNG, JPEG, WebP, GIF and ICO in one click with quality control. AVIF is accepted as input. Free and 100% offline in your browser.'
        }
      },
      {
        path: 'image/resize',
        title: 'Resize Image Online (Pixels or Percent) — Nada Sai',
        loadComponent: () => import('./features/resize/resize.component').then((m) => m.ResizeComponent),
        data: {
          metaDescription: 'Change a photo\'s width and height by pixels or percentage, locking the aspect ratio if you want. No signup, no watermark, 100% offline in your browser.'
        }
      },
      {
        path: 'image/to-pdf',
        title: 'Convert Images to PDF Online (Multiple) — Nada Sai',
        loadComponent: () => import('./features/img-to-pdf/img-to-pdf.component').then((m) => m.ImgToPdfComponent),
        data: {
          metaDescription: 'Combine several photos into a single PDF, dragging to reorder the pages before you build it. JPEG, PNG, WebP and GIF, 100% offline in your browser.'
        }
      },
      {
        path: 'pdf/edit',
        title: 'Edit PDF Online (Text and OCR) — Nada Sai',
        loadComponent: () => import('./features/pdf/pdf.component').then((m) => m.PdfComponent),
        data: {
          metaDescription: 'Edit the text of a PDF directly in the browser, with OCR for scanned documents. No file is ever sent to a server, because it runs 100% offline in your browser.'
        }
      },
      {
        path: 'pdf/merge',
        title: 'Merge PDF Files Online — Nada Sai',
        loadComponent: () => import('./features/merge-pdf/merge-pdf.component').then((m) => m.MergePdfComponent),
        data: {
          metaDescription: 'Combine several PDFs into one, dragging to set the order, without losing fonts or quality. Up to 100 MB per file, free and 100% offline in your browser.'
        }
      },
      {
        path: 'pdf/compress',
        title: 'Compress PDF Online Without Losing Quality — Nada Sai',
        loadComponent: () => import('./features/compress-pdf/compress-pdf.component').then((m) => m.CompressPdfComponent),
        data: {
          metaDescription: 'Reduce a PDF\'s size across three levels and see how much you saved before downloading. The text stays searchable. Free and 100% offline in your browser.'
        }
      },
      {
        path: 'pdf/split',
        title: 'Split PDF Online (Separate Pages) — Nada Sai',
        loadComponent: () => import('./features/split-pdf/split-pdf.component').then((m) => m.SplitPdfComponent),
        data: {
          metaDescription: 'Split a PDF by ranges, every N pages, or by picking pages one at a time, downloading a ZIP or a single file. Free and 100% offline in your browser.'
        }
      },
      {
        path: 'pdf/to-image',
        title: 'Convert PDF to Image Online (JPG, PNG) — Nada Sai',
        loadComponent: () => import('./features/pdf-to-img/pdf-to-img.component').then((m) => m.PdfToImgComponent),
        data: {
          metaDescription: 'Turn every page of a PDF into a JPG or PNG at the resolution you choose, downloading them all as a ZIP. Up to 100 MB, 100% offline in your browser.'
        }
      },
      {
        path: 'pdf/to-word',
        title: 'Convert PDF to Word (DOCX) Online — Nada Sai',
        loadComponent: () => import('./features/pdf-to-word/pdf-to-word.component').then((m) => m.PdfToWordComponent),
        data: {
          metaDescription: 'Convert a PDF into an editable .docx keeping paragraphs, bold and italics, with OCR for scanned pages. Free and 100% offline in your browser.'
        }
      },
      {
        path: 'pdf/organize',
        title: 'Organize PDF Online (Rotate, Delete Pages) — Nada Sai',
        loadComponent: () => import('./features/organize-pdf/organize-pdf.component').then((m) => m.OrganizePdfComponent),
        data: {
          metaDescription: 'Reorder, rotate and delete pages by dragging thumbnails, then download the rebuilt document. Up to 100 MB, free and 100% offline in your browser.'
        }
      },
      {
        path: 'pdf/protect',
        title: 'Password Protect a PDF Online — Nada Sai',
        loadComponent: () => import('./features/protect-pdf/protect-pdf.component').then((m) => m.ProtectPdfComponent),
        data: {
          metaDescription: 'Lock a PDF with an encrypted password so only someone with the key can open it. The password never leaves your computer: 100% offline in your browser.'
        }
      },
      {
        path: 'pdf/sign',
        title: 'Sign PDF Online (Draw Your Signature) — Nada Sai',
        loadComponent: () => import('./features/sign-pdf/sign-pdf.component').then((m) => m.SignPdfComponent),
        data: {
          metaDescription: 'Draw or type your signature and place it anywhere on the page, in any PDF. Nothing is sent to a server, because it runs 100% offline in your browser.'
        }
      },
      {
        path: 'pdf/watermark',
        title: 'Add a Watermark to a PDF Online — Nada Sai',
        loadComponent: () => import('./features/watermark-pdf/watermark-pdf.component').then((m) => m.WatermarkPdfComponent),
        data: {
          metaDescription: 'Stamp a text watermark across every page, with control over size, angle, colour and transparency. Free, no signup and 100% offline in your browser.'
        }
      },
      {
        path: 'privacy/encrypt-file',
        title: 'Encrypt a File With a Password (AES-256) — Nada Sai',
        loadComponent: () => import('./features/privacy/encrypt-file/encrypt-file.component').then((m) => m.EncryptFileComponent),
        data: {
          metaDescription: 'Lock any file behind a password using AES-256 and PBKDF2, and open it again in the same tool. The password never leaves here: 100% offline in your browser.'
        }
      },
      {
        path: 'privacy/file-hash',
        title: 'File Hash and Checksum Online (SHA-256) — Nada Sai',
        loadComponent: () => import('./features/privacy/file-hash/file-hash.component').then((m) => m.FileHashComponent),
        data: {
          metaDescription: 'Compute SHA-256, SHA-512 and MD5 and check a download arrived intact by pasting the published checksum. Any file size, 100% offline in your browser.'
        }
      },
      {
        path: 'privacy/password-generator',
        title: 'Strong Random Password Generator — Nada Sai',
        loadComponent: () => import('./features/privacy/password-generator/password-generator.component').then((m) => m.PasswordGeneratorComponent),
        data: {
          metaDescription: 'Generate random passwords up to 128 characters with the browser\'s cryptographic generator, and see the real entropy in bits. 100% offline in your browser.'
        }
      },
      {
        path: 'privacy/remove-exif',
        title: 'Remove EXIF and GPS Data from Photos — Nada Sai',
        loadComponent: () => import('./features/privacy/remove-exif/remove-exif.component').then((m) => m.RemoveExifComponent),
        data: {
          metaDescription: 'See and erase the GPS location, camera model and timestamp in your photos before sharing them — without re-encoding the image. 100% offline in your browser.'
        }
      },
      {
        path: 'privacy/redact-image',
        title: 'Redact an Image Online (Black Bar) — Nada Sai',
        loadComponent: () => import('./features/privacy/redact-image/redact-image.component').then((m) => m.RedactImageComponent),
        data: {
          metaDescription: 'Cover ID numbers, card numbers, addresses and faces with a black bar burned into the pixels, so what was under it is gone. 100% offline in your browser.'
        }
      },
      {
        path: 'privacy/diff-checker',
        title: 'Compare Two Texts or Files Online (Diff) — Nada Sai',
        loadComponent: () => import('./features/privacy/diff-checker/diff-checker.component').then((m) => m.DiffCheckerComponent),
        data: {
          metaDescription: 'Compare two texts side by side and see additions, removals and changes with line numbers. Safe for contracts and code: 100% offline in your browser.'
        }
      },
      {
        path: 'privacy/redact-pdf',
        title: 'Redact PDF Online (Text Destroyed, Not Covered) — Nada Sai',
        loadComponent: () => import('./features/privacy/redact-pdf/redact-pdf.component').then((m) => m.RedactPdfComponent),
        data: {
          metaDescription: 'Real PDF redaction: the text under each black bar is destroyed, not just covered, so it cannot be copied back out. 100% offline in your browser.',
        }
      },
      {
        path: 'privacy/clean-pdf-metadata',
        title: 'Remove PDF Metadata Online — Nada Sai',
        loadComponent: () => import('./features/privacy/clean-pdf-metadata/clean-pdf-metadata.component').then((m) => m.CleanPdfMetadataComponent),
        data: {
          metaDescription: 'See and erase the author, software, dates and XMP block in a PDF before you send it. Shows what it found before cleaning, 100% offline in your browser.',
        }
      },
      {
        path: 'privacy/encrypt-text',
        title: 'Encrypt Text and Messages (AES-256) — Nada Sai',
        loadComponent: () => import('./features/privacy/encrypt-text/encrypt-text.component').then((m) => m.EncryptTextComponent),
        data: {
          metaDescription: 'Encrypt a message with a password and AES-256 and get a block you can paste into email or chat. Nothing is uploaded: 100% offline in your browser.',
        }
      },
      {
        path: 'about',
        title: 'About Nada Sai — How It Works',
        loadComponent: () => import('./features/about/about.component').then((m) => m.AboutComponent),
        data: {
          metaDescription: 'How Nada Sai processes images, PDFs, audio and sensitive data entirely inside your browser, using WebAssembly and local AI. No file ever leaves your computer.',
        }
      },
      {
        path: 'privacy',
        title: 'Privacy Policy — Nada Sai',
        loadComponent: () => import('./features/privacy-policy/privacy.component').then((m) => m.PrivacyComponent),
        data: {
          metaDescription: 'The Nada Sai privacy policy is short because there is nothing to collect: no file is uploaded, nothing is stored, and all processing happens locally.',
        }
      },
      {
        path: 'terms',
        title: 'Terms of Use — Nada Sai',
        loadComponent: () => import('./features/terms/terms.component').then((m) => m.TermsComponent),
        data: {
          metaDescription: 'Terms of use for Nada Sai: free image, PDF, audio and privacy tools that run in your browser, with no signup and no files sent anywhere.',
        }
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
