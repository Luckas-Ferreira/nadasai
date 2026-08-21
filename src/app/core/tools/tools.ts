import type { FileKind } from '../files/kind';
import { IconName } from '../../shared/ui/icon/icons';
import type { TranslationKey } from '../services/translation.service';

export type ToolId =
  | 'screen-recorder'
  | 'remove-bg'
  | 'upscale'
  | 'vectorize'
  | 'extract-text'
  | 'cut-audio'
  | 'merge-audio'
  | 'convert-audio'
  | 'compress-audio'
  | 'normalize-audio'
  | 'video-to-audio'
  | 'video-to-gif'
  | 'video-to-frames'
  | 'crop'
  | 'compress'
  | 'convert'
  | 'resize'
  | 'img-to-pdf'
  | 'edit-pdf'
  | 'merge-pdf'
  | 'compress-pdf'
  | 'split-pdf'
  | 'pdf-to-img'
  | 'pdf-to-word'
  | 'organize-pdf'
  | 'protect-pdf'
  | 'sign-pdf'
  | 'watermark-pdf'
  | 'encrypt-file'
  | 'file-hash'
  | 'password-generator'
  | 'remove-exif'
  | 'redact-image'
  | 'diff-checker'
  | 'redact-pdf'
  | 'clean-pdf-metadata'
  | 'encrypt-text'
  | 'qr-code';

export type ToolTone =
  | 'violet'
  | 'amber'
  | 'emerald'
  | 'rose'
  | 'sky'
  | 'orange'
  | 'indigo'
  | 'teal'
  | 'fuchsia';

export type ToolCategory = 'image' | 'pdf' | 'audio' | 'video' | 'privacy';

export type ModuleId = ToolCategory;

export interface ModuleDef {
  readonly id: ModuleId;
  readonly icon: IconName;
  readonly nameKey: TranslationKey;
  readonly descKey: TranslationKey;
  readonly tone: ToolTone;
}

export const MODULES: readonly ModuleDef[] = [
  { id: 'image', icon: 'image', nameKey: 'module.image', descKey: 'module.image_desc', tone: 'sky' },
  { id: 'pdf', icon: 'pdf', nameKey: 'module.pdf', descKey: 'module.pdf_desc', tone: 'rose' },
  { id: 'audio', icon: 'audio', nameKey: 'module.audio', descKey: 'module.audio_desc', tone: 'violet' },
  { id: 'video', icon: 'video', nameKey: 'module.video', descKey: 'module.video_desc', tone: 'indigo' },
  { id: 'privacy', icon: 'shield', nameKey: 'module.privacy', descKey: 'module.privacy_desc', tone: 'emerald' },
];

export interface ToolDef {
  readonly id: ToolId;
  readonly pathPt: string;
  readonly pathEn: string;
  readonly icon: IconName;
  readonly category: ToolCategory;
  /**
   * The file kinds this tool's dropzone takes. `[]` means it takes no file at
   * all (password-generator). `['any']` means literally anything, which is what
   * makes encrypt-file and file-hash the universal end of every chain.
   *
   * This is what a tool hydrates on, NOT `category`: a tool only picks the
   * session up when the session's kind is in this list, which is a stronger
   * guard than the `image/*` check it replaced — the converter can put a PDF in
   * the session and crop still refuses it, while img-to-pdf's output now feeds
   * the whole PDF module.
   */
  readonly accepts: readonly FileKind[];
  /** The kind this tool hands back, or `null` when it produces no chainable file. */
  readonly produces: FileKind | null;
  readonly navKey: TranslationKey;
  readonly shortKey: TranslationKey;
  readonly titleKey: TranslationKey;
  readonly descKey: TranslationKey;
  readonly suffix: string;
  readonly tone: ToolTone;
  readonly keywordsPt: readonly string[];
  readonly keywordsEn: readonly string[];
}

export const TOOLS: readonly ToolDef[] = [
  {
    id: 'screen-recorder',
    pathPt: 'video/gravar-tela',
    pathEn: 'video/screen-record',
    icon: 'screenRecord',
    category: 'video',
    // A única do produto que não recebe arquivo nenhum: ela CRIA um.
    accepts: [],
    produces: 'video',
    navKey: 'nav.screen_recorder',
    shortKey: 'nav.short.screen_recorder',
    titleKey: 'screenrec.title',
    descKey: 'screenrec.subtitle',
    suffix: 'gravacao',
    tone: 'rose',
    keywordsPt: [
      'gravar tela', 'gravador de tela', 'gravar tela do pc', 'gravar tela online',
      'capturar tela', 'gravar aula', 'gravar reuniao', 'gravar tutorial',
      'gravar tela com audio', 'gravar tela com microfone', 'screencast',
      'gravar navegador', 'gravar janela', 'filmar a tela', 'gravar video da tela',
      'gravador de tela sem programa', 'gravar tela gratis'
    ],
    keywordsEn: [
      'screen recorder', 'record screen', 'screen capture', 'record my screen',
      'browser screen recorder', 'record tab', 'record window', 'screencast',
      'record screen with audio', 'record screen with microphone', 'free screen recorder',
      'online screen recorder', 'record meeting', 'record tutorial', 'no download screen recorder'
    ],
  },
  {
    id: 'remove-bg',
    pathPt: 'imagem/remover-fundo',
    pathEn: 'image/remove-bg',
    icon: 'remove-bg',
    category: 'image',
    accepts: ['image'],
    produces: 'image',
    navKey: 'nav.remove_bg',
    shortKey: 'nav.short.remove_bg',
    titleKey: 'bg.title',
    descKey: 'bg.subtitle',
    suffix: 'nobg',
    tone: 'violet',
    keywordsPt: [
      'remover fundo', 'tirar fundo', 'apagar fundo', 'fundo transparente', 'png transparente',
      'corte de foto', 'recortar pessoa', 'recortar objeto', 'recorte', 'ia remover fundo',
      'inteligencia artificial', 'fundo branco', 'tirar foto', 'isolar elemento', 'sem fundo',
      'deletar fundo', 'extrair objeto'
    ],
    keywordsEn: [
      'remove background', 'erase background', 'transparent png', 'background eraser', 'cutout',
      'transparent background', 'remove bg', 'ai background remover', 'isolate subject',
      'drop background', 'photo cutout', 'clear background', 'no background'
    ],
  },
  {
    id: 'upscale',
    pathPt: 'imagem/melhorar-qualidade',
    pathEn: 'image/upscale',
    icon: 'sparkles',
    category: 'image',
    accepts: ['image'],
    produces: 'image',
    navKey: 'nav.upscale',
    shortKey: 'nav.short.upscale',
    titleKey: 'upscale.title',
    descKey: 'upscale.subtitle',
    suffix: 'hd',
    tone: 'amber',
    keywordsPt: [
      'melhorar qualidade', 'aumentar resolucao', 'upscale', 'desembacar foto',
      'melhorar foto', 'foto em alta definicao', 'aumentar foto sem perder qualidade',
      'hd foto', '4k foto', 'nitidez', 'ia melhorar imagem', 'super resolucao',
      'nitidez de foto', 'remover embaçado', 'ampliar foto'
    ],
    keywordsEn: [
      'upscale image', 'enhance photo quality', 'increase resolution', 'unblur image',
      'hd photo', 'super resolution', 'ai upscale', 'image sharpener', 'enhance image',
      '4k upscaler', 'photo enhancer', 'deblur', 'enlarge photo'
    ],
  },
  {
    id: 'vectorize',
    pathPt: 'imagem/vetorizar',
    pathEn: 'image/vectorize',
    icon: 'palette',
    category: 'image',
    accepts: ['image'],
    produces: 'svg',
    navKey: 'nav.vectorize',
    shortKey: 'nav.short.vectorize',
    titleKey: 'vector.title',
    descKey: 'vector.subtitle',
    suffix: 'vetor',
    tone: 'sky',
    keywordsPt: [
      'vetorizar imagem', 'png para svg', 'jpg para svg', 'imagem para vetor',
      'converter para svg', 'vetorizar logo', 'transformar em vetor', 'traçar imagem',
      'logo vetorizado', 'svg online', 'vetorizacao automatica', 'imagem vetorial',
      'converter png em svg', 'vetorizar desenho', 'redesenhar logo'
    ],
    keywordsEn: [
      'vectorize image', 'png to svg', 'jpg to svg', 'image to vector',
      'convert to svg', 'vectorize logo', 'raster to vector', 'image tracer',
      'auto trace', 'svg converter', 'bitmap to vector', 'logo vectorizer',
      'trace bitmap', 'vector art converter'
    ],
  },
  {
    id: 'extract-text',
    pathPt: 'imagem/extrair-texto',
    pathEn: 'image/extract-text',
    icon: 'scan',
    category: 'image',
    accepts: ['image'],
    produces: 'text',
    navKey: 'nav.extract_text',
    shortKey: 'nav.short.extract_text',
    titleKey: 'extract_text.title',
    descKey: 'extract_text.subtitle',
    suffix: 'txt',
    tone: 'teal',
    keywordsPt: [
      'extrair texto', 'ocr', 'copiar texto de foto', 'ler foto', 'imagem para texto',
      'pdf para texto', 'reconhecer texto', 'copiar recibo', 'ler documento', 'scan texto',
      'extrair caracteres', 'copiar documento', 'digitalizar texto'
    ],
    keywordsEn: [
      'extract text', 'ocr', 'image to text', 'copy text from photo', 'photo to text',
      'pdf to text', 'scan text', 'character recognition', 'text extractor', 'read photo',
      'copy document text', 'digitize text'
    ],
  },
  {
    id: 'cut-audio',
    pathPt: 'audio/cortar',
    pathEn: 'audio/cut',
    icon: 'scissors',
    category: 'audio',
    accepts: ['audio'],
    produces: 'audio',
    navKey: 'nav.cut_audio',
    shortKey: 'nav.short.cut_audio',
    titleKey: 'cut_audio.title',
    descKey: 'cut_audio.subtitle',
    suffix: 'cut',
    tone: 'violet',
    keywordsPt: [
      'cortar audio', 'aparar mp3', 'cortar musica', 'cortar som', 'editor de audio',
      'cortar faixa', 'cortar podcast', 'toque de celular', 'cortar ogg', 'cortar wav',
      'cortar m4a', 'fatia de audio', 'remover trecho de audio', 'recortar som',
      'tirar pedaco do audio', 'cortar audio do whatsapp'
    ],
    keywordsEn: [
      'cut audio', 'trim mp3', 'audio cutter', 'mp3 trimmer', 'cut music', 'audio editor',
      'make ringtone', 'crop audio', 'cut song', 'trim wav', 'sound cutter', 'audio slice',
      'remove part of audio', 'split audio'
    ],
  },
  {
    id: 'merge-audio',
    pathPt: 'audio/juntar',
    pathEn: 'audio/merge',
    icon: 'merge',
    category: 'audio',
    accepts: ['audio'],
    produces: 'audio',
    navKey: 'nav.merge_audio',
    shortKey: 'nav.short.merge_audio',
    titleKey: 'mergeaudio.title',
    descKey: 'mergeaudio.subtitle',
    suffix: 'merged',
    tone: 'sky',
    keywordsPt: [
      'juntar audio', 'unir audios', 'mesclar mp3', 'combinar musicas', 'juntar mp3',
      'colar audios', 'emendar audio', 'juntar varios audios', 'unir faixas',
      'juntar audios do whatsapp', 'fazer mixtape', 'crossfade', 'juntar podcast',
      'concatenar audio', 'juntar wav'
    ],
    keywordsEn: [
      'merge audio', 'join mp3', 'combine audio files', 'audio joiner', 'concatenate audio',
      'merge songs', 'stitch audio', 'crossfade tracks', 'combine wav', 'append audio',
      'make a mixtape', 'merge voice notes', 'join podcast segments'
    ],
  },
  {
    id: 'convert-audio',
    pathPt: 'audio/converter',
    pathEn: 'audio/convert',
    icon: 'convert',
    category: 'audio',
    accepts: ['audio'],
    produces: 'audio',
    navKey: 'nav.convert_audio',
    shortKey: 'nav.short.convert_audio',
    titleKey: 'convert_audio.title',
    descKey: 'convert_audio.subtitle',
    suffix: 'converted',
    tone: 'sky',
    keywordsPt: [
      'converter audio', 'mudar formato audio', 'mp3 para wav', 'wav para mp3',
      'ogg para mp3', 'm4a para mp3', 'flac para mp3', 'conversor de audio',
      'transformar audio', 'converter musica', 'converter gravacao', 'aac para mp3'
    ],
    keywordsEn: [
      'convert audio', 'audio format converter', 'mp3 to wav', 'wav to mp3',
      'ogg to mp3', 'm4a to mp3', 'flac to mp3', 'audio converter', 'sound converter',
      'change audio format', 'convert music file'
    ],
  },
  {
    id: 'compress-audio',
    pathPt: 'audio/comprimir',
    pathEn: 'audio/compress',
    icon: 'compress',
    category: 'audio',
    accepts: ['audio'],
    produces: 'audio',
    navKey: 'nav.compress_audio',
    shortKey: 'nav.short.compress_audio',
    titleKey: 'compress_audio.title',
    descKey: 'compress_audio.subtitle',
    suffix: 'compressed',
    tone: 'emerald',
    keywordsPt: [
      'comprimir audio', 'reduzir tamanho mp3', 'comprimir mp3', 'diminuir audio',
      'comprimir arquivo de som', 'mp3 menor', 'compactar audio', 'reduzir tamanho arquivo de audio',
      'comprimir wav', 'comprimir ogg', 'comprimir m4a', 'audio menor', 'otimizar audio',
      'bitrate menor', 'reduzir bitrate'
    ],
    keywordsEn: [
      'compress audio', 'reduce audio file size', 'shrink mp3', 'audio compressor',
      'lower bitrate', 'compress mp3', 'compress wav', 'reduce mp3 size', 'audio file reducer',
      'make audio smaller', 'compress ogg', 'reduce audio bitrate'
    ],
  },
  {
    id: 'normalize-audio',
    pathPt: 'audio/normalizar',
    pathEn: 'audio/normalize',
    icon: 'zap',
    category: 'audio',
    accepts: ['audio'],
    produces: 'audio',
    navKey: 'nav.normalize_audio',
    shortKey: 'nav.short.normalize_audio',
    titleKey: 'normalize_audio.title',
    descKey: 'normalize_audio.subtitle',
    suffix: 'normalized',
    tone: 'amber',
    keywordsPt: [
      'normalizar audio', 'aumentar volume do audio', 'aumentar volume mp3', 'audio muito baixo',
      'deixar audio mais alto', 'equalizar volume', 'nivelar volume', 'normalizar volume mp3',
      'ajustar volume do audio', 'volume baixo', 'aumentar som de gravacao', 'normalizar podcast',
      'lufs', 'normalizar wav', 'diminuir volume do audio'
    ],
    keywordsEn: [
      'normalize audio', 'increase audio volume', 'make audio louder', 'audio volume booster',
      'normalize mp3 volume', 'loudness normalization', 'lufs normalization', 'audio too quiet',
      'level audio volume', 'boost mp3 volume', 'normalize podcast audio', 'peak normalization',
      'adjust audio volume', 'audio gain'
    ],
  },
  {
    id: 'video-to-frames',
    pathPt: 'video/extrair-quadros',
    pathEn: 'video/extract-frames',
    icon: 'image',
    category: 'video',
    accepts: ['video'],
    // Um quadro é uma imagem; vários viram zip, e é por isso que o componente
    // passa `resultKind` para a barra de ações — oferecer "cortar imagem" para
    // um zip é pior do que não oferecer nada.
    produces: 'image',
    navKey: 'nav.video_to_frames',
    shortKey: 'nav.short.video_to_frames',
    titleKey: 'video_frames.title',
    descKey: 'video_frames.subtitle',
    suffix: 'frame',
    tone: 'teal',
    keywordsPt: [
      'extrair quadros de video', 'video para imagem', 'tirar print de video',
      'capturar quadro de video', 'salvar frame de video', 'video para jpg',
      'video para png', 'extrair frames', 'capa de video', 'thumbnail de video',
      'pegar imagem de video', 'frame a frame', 'screenshot de video',
      'imagem de gravacao de tela', 'foto de video'
    ],
    keywordsEn: [
      'extract frames from video', 'video to image', 'video screenshot',
      'capture video frame', 'save frame from video', 'video to jpg', 'video to png',
      'frame extractor', 'video thumbnail', 'get image from video',
      'frame by frame', 'video still', 'screenshot from video', 'video cover image'
    ],
  },
  {
    id: 'video-to-gif',
    pathPt: 'video/para-gif',
    pathEn: 'video/to-gif',
    icon: 'images',
    category: 'video',
    accepts: ['video'],
    // GIF é `image` para o `kindOf`, e isso não é detalhe: o resultado cai
    // inteiro na cadeia do módulo de imagem — comprimir, redimensionar,
    // converter — sem nenhum código novo.
    produces: 'image',
    navKey: 'nav.video_to_gif',
    shortKey: 'nav.short.video_to_gif',
    titleKey: 'video_gif.title',
    descKey: 'video_gif.subtitle',
    suffix: 'gif',
    tone: 'fuchsia',
    keywordsPt: [
      'video para gif', 'converter video em gif', 'mp4 para gif', 'transformar video em gif',
      'criar gif', 'fazer gif de video', 'gif animado', 'webm para gif', 'mov para gif',
      'gravacao de tela para gif', 'gif sem marca dagua', 'gerador de gif',
      'video em gif online', 'cortar video e fazer gif', 'gif de tela'
    ],
    keywordsEn: [
      'video to gif', 'convert video to gif', 'mp4 to gif', 'make a gif', 'gif maker',
      'animated gif', 'webm to gif', 'mov to gif', 'screen recording to gif',
      'gif without watermark', 'video gif converter', 'create gif from video',
      'trim video to gif', 'screen capture to gif'
    ],
  },
  {
    id: 'video-to-audio',
    // A URL fica onde está: `ActiveToolService` casa por caminho declarado e
    // nunca por prefixo — é a mesma razão pela qual `img-to-pdf` mora em
    // `imagem/para-pdf` e é do módulo de imagem. Mudar a categoria não custa
    // redirect, sitemap nem hreflang.
    pathPt: 'audio/extrair-de-video',
    pathEn: 'audio/extract-from-video',
    icon: 'video',
    // O módulo é o tipo de ENTRADA, não o de saída. Esta ferramenta recebe um
    // vídeo; que ela devolva áudio é o que ela faz, não onde ela mora.
    category: 'video',
    accepts: ['video'],
    produces: 'audio',
    navKey: 'nav.video_to_audio',
    shortKey: 'nav.short.video_to_audio',
    titleKey: 'video_audio.title',
    descKey: 'video_audio.subtitle',
    suffix: 'audio',
    tone: 'indigo',
    keywordsPt: [
      'extrair audio de video', 'video para mp3', 'mp4 para mp3', 'tirar audio de video',
      'converter video em audio', 'separar audio do video', 'mov para mp3', 'webm para mp3',
      'mkv para mp3', 'extrair musica de video', 'audio de videoaula', 'video para wav',
      'salvar audio de video', 'transformar video em audio', 'extrair som de video'
    ],
    keywordsEn: [
      'extract audio from video', 'video to mp3', 'mp4 to mp3', 'video to audio',
      'rip audio from video', 'mov to mp3', 'webm to mp3', 'mkv to mp3', 'video to wav',
      'get audio from video', 'strip audio from video', 'convert video to mp3',
      'save audio from video', 'video audio extractor'
    ],
  },
  {
    id: 'crop',
    pathPt: 'imagem/cortar',
    pathEn: 'image/crop',
    icon: 'crop',
    category: 'image',
    accepts: ['image'],
    produces: 'image',
    navKey: 'nav.crop',
    shortKey: 'nav.short.crop',
    titleKey: 'crop.title',
    descKey: 'crop.subtitle',
    suffix: 'crop',
    tone: 'amber',
    keywordsPt: [
      'cortar', 'recortar', 'enquadrar', 'proporcao', 'aspect ratio', 'ajustar bordas',
      'focar imagem', 'cortar foto', 'aparar', 'dimensoes', 'tamanho', 'quadrado',
      'feed', 'story', 'instagram', 'moldura', 'corte livre'
    ],
    keywordsEn: [
      'crop', 'trim', 'aspect ratio', 'frame', 'reframe', 'crop photo', 'photo cropper',
      'square', 'story', 'banner', 'custom size', 'viewport', 'boundaries', 'snip'
    ],
  },
  {
    id: 'compress',
    pathPt: 'imagem/comprimir',
    pathEn: 'image/compress',
    icon: 'compress',
    category: 'image',
    accepts: ['image'],
    produces: 'image',
    navKey: 'nav.compress',
    shortKey: 'nav.short.compress',
    titleKey: 'compress.title',
    descKey: 'compress.subtitle',
    suffix: 'min',
    tone: 'emerald',
    keywordsPt: [
      'comprimir', 'reduzir tamanho', 'diminuir kb', 'diminuir mb', 'otimizar imagem',
      'compactar foto', 'imagem leve', 'qualidade', 'peso da imagem', 'economizar espaco',
      'reduzir peso', 'diminuir foto', 'diminuir tamanho'
    ],
    keywordsEn: [
      'compress image', 'reduce file size', 'shrink photo', 'optimize image', 'smaller kb',
      'decrease mb', 'image optimizer', 'lossy', 'lossless', 'small image', 'downsize'
    ],
  },
  {
    id: 'resize',
    pathPt: 'imagem/redimensionar',
    pathEn: 'image/resize',
    icon: 'resize',
    category: 'image',
    accepts: ['image'],
    produces: 'image',
    navKey: 'nav.resize',
    shortKey: 'nav.short.resize',
    titleKey: 'resize.title',
    descKey: 'resize.subtitle',
    suffix: 'resized',
    tone: 'rose',
    keywordsPt: [
      'redimensionar', 'mudar tamanho', 'alterar resolucao', 'largura', 'altura',
      'pixels', 'rescale', 'escalar', 'aumentar imagem', 'diminuir imagem',
      'porcentagem', 'redimensionamento', 'mudar dimensao', 'escala'
    ],
    keywordsEn: [
      'resize image', 'change resolution', 'change dimensions', 'width', 'height',
      'pixels', 'scale', 'rescale', 'stretch', 'enlarge', 'shrink size', 'resolution'
    ],
  },
  {
    id: 'convert',
    pathPt: 'imagem/converter',
    pathEn: 'image/convert',
    icon: 'convert',
    category: 'image',
    accepts: ['image'],
    produces: 'image',
    navKey: 'nav.convert',
    shortKey: 'nav.short.convert',
    titleKey: 'convert.title',
    descKey: 'convert.subtitle',
    suffix: 'converted',
    tone: 'sky',
    keywordsPt: [
      'converter', 'mudar formato', 'png para jpg', 'jpg para webp', 'webp para png',
      'transformar imagem', 'formato de foto', 'exportar', 'conversor de imagem',
      'extensao', 'mudar tipo', 'jpg para png', 'salvar como'
    ],
    keywordsEn: [
      'convert image', 'change format', 'png to jpg', 'jpg to webp', 'webp to png',
      'image converter', 'file type', 'export format', 'transform photo', 'jpg to png', 'save as'
    ],
  },
  {
    id: 'img-to-pdf',
    pathPt: 'imagem/para-pdf',
    pathEn: 'image/to-pdf',
    icon: 'images',
    category: 'image',
    accepts: ['image'],
    produces: 'pdf',
    navKey: 'nav.img_to_pdf',
    shortKey: 'nav.short.img_to_pdf',
    titleKey: 'imgpdf.title',
    descKey: 'imgpdf.subtitle',
    suffix: 'pdf',
    tone: 'indigo',
    keywordsPt: [
      'imagem para pdf', 'fotos em pdf', 'jpg para pdf', 'png para pdf', 'juntar fotos em pdf',
      'transformar fotos em pdf', 'criar pdf de imagens', 'escaneamento', 'album pdf',
      'converter fotos em pdf', 'gerar pdf'
    ],
    keywordsEn: [
      'image to pdf', 'photos to pdf', 'jpg to pdf', 'png to pdf', 'merge images into pdf',
      'pictures to pdf', 'photo scanner pdf', 'convert photos to pdf', 'make pdf from image'
    ],
  },
  {
    id: 'edit-pdf',
    pathPt: 'pdf/editar',
    pathEn: 'pdf/edit',
    icon: 'pdf',
    category: 'pdf',
    accepts: ['pdf'],
    produces: 'pdf',
    navKey: 'nav.pdf',
    shortKey: 'nav.short.pdf',
    titleKey: 'pdf.title',
    descKey: 'pdf.subtitle',
    suffix: 'edited',
    tone: 'orange',
    keywordsPt: [
      'editar pdf', 'alterar texto pdf', 'editor de texto', 'modificar pdf', 'corrigir pdf',
      'escrever no pdf', 'formatar pdf', 'negrito', 'italico', 'ocr', 'ler texto escaneado',
      'edicao', 'mudar palavra', 'substituir texto', 'editor de pdf'
    ],
    keywordsEn: [
      'edit pdf', 'pdf editor', 'modify text', 'change pdf text', 'type on pdf',
      'write on pdf', 'text formatting', 'bold', 'italic', 'ocr', 'text recognition',
      'alter text', 'replace text'
    ],
  },
  {
    id: 'merge-pdf',
    pathPt: 'pdf/juntar',
    pathEn: 'pdf/merge',
    icon: 'merge',
    category: 'pdf',
    accepts: ['pdf'],
    produces: 'pdf',
    navKey: 'nav.merge_pdf',
    shortKey: 'nav.short.merge_pdf',
    titleKey: 'mergepdf.title',
    descKey: 'mergepdf.subtitle',
    suffix: 'merged',
    tone: 'teal',
    keywordsPt: [
      'juntar pdf', 'combinar pdf', 'unir pdf', 'mesclar pdf', 'juntar arquivos pdf',
      'agrupar paginas pdf', 'anexar pdf', 'juntar varios pdfs', 'unificar pdf',
      'fundir pdf', 'juntar dois pdfs'
    ],
    keywordsEn: [
      'merge pdf', 'combine pdf', 'join pdf', 'append pdf', 'concatenate pdf',
      'merge documents', 'combine files', 'group pages', 'unify pdf'
    ],
  },
  {
    id: 'compress-pdf',
    pathPt: 'pdf/comprimir',
    pathEn: 'pdf/compress',
    icon: 'compress',
    category: 'pdf',
    accepts: ['pdf'],
    produces: 'pdf',
    navKey: 'nav.compress_pdf',
    shortKey: 'nav.short.compress_pdf',
    titleKey: 'cpdf.title',
    descKey: 'cpdf.subtitle',
    suffix: 'min',
    tone: 'fuchsia',
    keywordsPt: [
      'comprimir pdf', 'reduzir tamanho de pdf', 'diminuir kb do pdf', 'compactar pdf',
      'pdf leve', 'otimizar pdf', 'diminuir peso do pdf', 'comprimir arquivo',
      'reduzir mb pdf', 'reduzir tamanho'
    ],
    keywordsEn: [
      'compress pdf', 'reduce pdf size', 'shrink pdf', 'pdf optimizer', 'smaller pdf',
      'decrease pdf mb', 'compact pdf', 'downsize pdf'
    ],
  },
  {
    id: 'split-pdf',
    pathPt: 'pdf/dividir',
    pathEn: 'pdf/split',
    icon: 'split',
    category: 'pdf',
    accepts: ['pdf'],
    produces: 'pdf',
    navKey: 'nav.split_pdf',
    shortKey: 'nav.short.split_pdf',
    titleKey: 'splitpdf.title',
    descKey: 'splitpdf.subtitle',
    suffix: 'split',
    tone: 'rose',
    keywordsPt: [
      'dividir pdf', 'separar pdf', 'extrair paginas', 'cortar pdf', 'fatiar pdf',
      'separar paginas de pdf', 'desfazer pdf', 'extrair arquivo', 'quebrar pdf',
      'salvar paginas separadas'
    ],
    keywordsEn: [
      'split pdf', 'extract pdf pages', 'separate pdf', 'cut pdf', 'break pdf',
      'extract pages', 'slice pdf', 'separate pages'
    ],
  },
  {
    id: 'pdf-to-img',
    pathPt: 'pdf/para-imagem',
    pathEn: 'pdf/to-image',
    icon: 'image',
    category: 'pdf',
    accepts: ['pdf'],
    produces: 'image',
    navKey: 'nav.pdf_to_img',
    shortKey: 'nav.short.pdf_to_img',
    titleKey: 'pdf2img.title',
    descKey: 'pdf2img.subtitle',
    suffix: 'img',
    tone: 'amber',
    keywordsPt: [
      'pdf para imagem', 'pdf para jpg', 'pdf para png', 'transformar pdf em foto',
      'converter pagina em imagem', 'extrair imagens do pdf', 'pdf para foto',
      'exportar pdf como imagem'
    ],
    keywordsEn: [
      'pdf to image', 'pdf to jpg', 'pdf to png', 'export pdf as photo',
      'convert pdf pages to picture', 'rasterize pdf', 'pdf to photo'
    ],
  },
  {
    id: 'pdf-to-word',
    pathPt: 'pdf/para-word',
    pathEn: 'pdf/to-word',
    icon: 'doc',
    category: 'pdf',
    accepts: ['pdf'],
    produces: 'docx',
    navKey: 'nav.pdf_to_word',
    shortKey: 'nav.short.pdf_to_word',
    titleKey: 'p2w.title',
    descKey: 'p2w.subtitle',
    suffix: 'word',
    tone: 'indigo',
    keywordsPt: [
      'pdf para word', 'converter pdf em word', 'pdf para docx', 'pdf em doc',
      'transformar pdf em word', 'pdf editavel', 'editar pdf no word',
      'converter pdf para documento', 'pdf para texto', 'extrair texto do pdf',
      'pdf digitalizado para word', 'ocr pdf para word'
    ],
    keywordsEn: [
      'pdf to word', 'convert pdf to word', 'pdf to docx', 'pdf to doc',
      'editable pdf', 'pdf to document', 'pdf converter word', 'pdf to text',
      'scanned pdf to word', 'ocr pdf to word'
    ],
  },
  {
    id: 'organize-pdf',
    pathPt: 'pdf/organizar',
    pathEn: 'pdf/organize',
    icon: 'doc',
    category: 'pdf',
    accepts: ['pdf'],
    produces: 'pdf',
    navKey: 'nav.organize_pdf',
    shortKey: 'nav.short.organize_pdf',
    titleKey: 'orgpdf.title',
    descKey: 'orgpdf.subtitle',
    suffix: 'organized',
    tone: 'emerald',
    keywordsPt: [
      'organizar pdf', 'reordenar paginas', 'girar pdf', 'rotacionar pagina',
      'apagar pagina', 'excluir pagina', 'mover paginas', 'virar pagina de ponta cabeca',
      'reorganizar', 'deletar pagina pdf'
    ],
    keywordsEn: [
      'organize pdf', 'reorder pages', 'rotate pdf', 'delete pdf page',
      'remove page', 'turn page', 'rearrangement', 'rearrange pages'
    ],
  },
  {
    id: 'protect-pdf',
    pathPt: 'pdf/proteger',
    pathEn: 'pdf/protect',
    icon: 'lock',
    category: 'pdf',
    accepts: ['pdf'],
    produces: null,
    navKey: 'nav.protect_pdf',
    shortKey: 'nav.short.protect_pdf',
    titleKey: 'protpdf.title',
    descKey: 'protpdf.subtitle',
    suffix: 'protected',
    tone: 'indigo',
    keywordsPt: [
      'proteger pdf', 'colocar senha em pdf', 'criptografar pdf', 'bloquear pdf',
      'senha de acesso', 'privacidade', 'proteger arquivo', 'cadeado', 'trancar pdf',
      'seguranca pdf'
    ],
    keywordsEn: [
      'protect pdf', 'encrypt pdf', 'set password', 'lock pdf', 'password protection',
      'secure pdf', 'pdf security', 'passkey'
    ],
  },
  {
    id: 'sign-pdf',
    pathPt: 'pdf/assinar',
    pathEn: 'pdf/sign',
    icon: 'brush',
    category: 'pdf',
    accepts: ['pdf'],
    produces: 'pdf',
    navKey: 'nav.sign_pdf',
    shortKey: 'nav.short.sign_pdf',
    titleKey: 'signpdf.title',
    descKey: 'signpdf.subtitle',
    suffix: 'signed',
    tone: 'emerald',
    keywordsPt: [
      'assinar pdf', 'assinatura digital', 'colocar rubrica', 'desenhar assinatura',
      'carimbar pdf', 'assinar documento', 'firma', 'nome em pdf', 'rubrica',
      'visto', 'assinar contrato'
    ],
    keywordsEn: [
      'sign pdf', 'digital signature', 'draw signature', 'electronic signature',
      'e-sign', 'sign document', 'stamp pdf', 'autograph'
    ],
  },
  {
    id: 'watermark-pdf',
    pathPt: 'pdf/marca-dagua',
    pathEn: 'pdf/watermark',
    icon: 'image',
    category: 'pdf',
    accepts: ['pdf'],
    produces: 'pdf',
    navKey: 'nav.watermark_pdf',
    shortKey: 'nav.short.watermark_pdf',
    titleKey: 'wmpdf.title',
    descKey: 'wmpdf.subtitle',
    suffix: 'watermarked',
    tone: 'sky',
    keywordsPt: [
      'marca d agua', 'colocar marca d agua em pdf', 'texto de fundo', 'confidencial',
      'marca d agua personalizada', 'carimbo de texto', 'timbrado', 'marca d agua pdf',
      'selo de agua'
    ],
    keywordsEn: [
      'watermark pdf', 'add watermark', 'draft stamp', 'confidential watermark',
      'text watermark', 'stamp text', 'overlay text'
    ],
  },
  {
    id: 'encrypt-file',
    pathPt: 'privacidade/criptografar-arquivo',
    pathEn: 'privacy/encrypt-file',
    icon: 'lock',
    category: 'privacy',
    accepts: ['any'],
    produces: null,
    navKey: 'nav.encrypt_file',
    shortKey: 'nav.short.encrypt_file',
    titleKey: 'encrypt.title',
    descKey: 'encrypt.subtitle',
    suffix: 'enc',
    tone: 'emerald',
    keywordsPt: [
      'criptografar arquivo', 'descriptografar arquivo', 'senha em arquivo', 'protecao aes-256',
      'seguranca de arquivo', 'bloquear arquivo com senha', 'criptografia local', 'proteger documento'
    ],
    keywordsEn: [
      'encrypt file', 'decrypt file', 'password protect file', 'aes-256 encryption',
      'file security', 'lock file', 'local encryption', 'protect file'
    ],
  },
  {
    id: 'file-hash',
    pathPt: 'privacidade/hash-de-arquivo',
    pathEn: 'privacy/file-hash',
    icon: 'hash',
    category: 'privacy',
    accepts: ['any'],
    produces: null,
    navKey: 'nav.file_hash',
    shortKey: 'nav.short.file_hash',
    titleKey: 'hash.title',
    descKey: 'hash.subtitle',
    suffix: 'hash',
    tone: 'teal',
    keywordsPt: [
      'hash de arquivo', 'sha256', 'md5', 'sha512', 'checksum', 'verificar integridade',
      'integridade de arquivo', 'hash local', 'gerar hash'
    ],
    keywordsEn: [
      'file hash', 'sha256 generator', 'md5 hash', 'checksum verifier', 'file integrity',
      'hash calculator', 'local hash'
    ],
  },
  {
    id: 'password-generator',
    pathPt: 'privacidade/gerador-de-senha',
    pathEn: 'privacy/password-generator',
    icon: 'key',
    category: 'privacy',
    accepts: [],
    produces: null,
    navKey: 'nav.password_generator',
    shortKey: 'nav.short.password_generator',
    titleKey: 'passgen.title',
    descKey: 'passgen.subtitle',
    suffix: 'txt',
    tone: 'amber',
    keywordsPt: [
      'gerador de senha', 'senha segura', 'senha forte', 'gerar senha aleatoria',
      'entropia de senha', 'gerar senha forte offline', 'seguranca'
    ],
    keywordsEn: [
      'password generator', 'secure password', 'strong password', 'random password',
      'password strength', 'offline password generator'
    ],
  },
  {
    id: 'remove-exif',
    pathPt: 'privacidade/remover-exif',
    pathEn: 'privacy/remove-exif',
    icon: 'eyeOff',
    category: 'privacy',
    accepts: ['image'],
    produces: 'image',
    navKey: 'nav.remove_exif',
    shortKey: 'nav.short.remove_exif',
    titleKey: 'exif.title',
    descKey: 'exif.subtitle',
    suffix: 'noexif',
    tone: 'rose',
    keywordsPt: [
      'remover exif', 'limpar gps da foto', 'apagar metadados', 'remover dados de foto',
      'privacidade de foto', 'remover modelo de camera', 'foto sem gps'
    ],
    keywordsEn: [
      'remove exif', 'strip photo gps', 'clean metadata', 'remove metadata',
      'photo privacy', 'strip camera info'
    ],
  },
  {
    id: 'redact-image',
    pathPt: 'privacidade/censurar-imagem',
    pathEn: 'privacy/redact-image',
    icon: 'brush',
    category: 'privacy',
    accepts: ['image'],
    produces: 'image',
    navKey: 'nav.redact_image',
    shortKey: 'nav.short.redact_image',
    titleKey: 'redact.title',
    descKey: 'redact.subtitle',
    suffix: 'redacted',
    tone: 'violet',
    keywordsPt: [
      'tarja preta foto', 'censurar imagem', 'desfocar foto', 'borrar cpf',
      'esconder dados', 'tarja em foto', 'censurar documento', 'ocultar informacao'
    ],
    keywordsEn: [
      'redact image', 'black bar photo', 'blur image', 'hide sensitive data',
      'censor document', 'photo redaction', 'blur face'
    ],
  },
  {
    id: 'diff-checker',
    pathPt: 'privacidade/comparar-texto',
    pathEn: 'privacy/diff-checker',
    icon: 'diff',
    category: 'privacy',
    accepts: ['text'],
    produces: null,
    navKey: 'nav.diff_checker',
    shortKey: 'nav.short.diff_checker',
    titleKey: 'diff.title',
    descKey: 'diff.subtitle',
    suffix: 'diff',
    tone: 'sky',
    keywordsPt: [
      'comparar texto', 'diff checker', 'diferenca entre textos', 'comparar arquivos',
      'ver diferenca', 'comparador de codigo', 'comparar versoes'
    ],
    keywordsEn: [
      'diff checker', 'compare text', 'text difference', 'file compare',
      'code diff', 'side by side diff'
    ],
  },
  {
    id: 'redact-pdf',
    pathPt: 'privacidade/censurar-pdf',
    pathEn: 'privacy/redact-pdf',
    icon: 'square',
    category: 'privacy',
    accepts: ['pdf'],
    produces: 'pdf',
    navKey: 'nav.redact_pdf',
    shortKey: 'nav.short.redact_pdf',
    titleKey: 'redactpdf.title',
    descKey: 'redactpdf.subtitle',
    suffix: 'redacted',
    tone: 'orange',
    keywordsPt: [
      'tarjar pdf', 'censurar pdf', 'tarja preta pdf', 'ocultar dados pdf',
      'esconder texto pdf', 'apagar informacao pdf', 'anonimizar pdf',
      'remover dados sensiveis pdf', 'censura pdf', 'tarja em documento'
    ],
    keywordsEn: [
      'redact pdf', 'black out pdf', 'hide text in pdf', 'censor pdf',
      'remove sensitive data pdf', 'anonymize pdf', 'pdf redaction',
      'permanently remove pdf text'
    ],
  },
  {
    id: 'clean-pdf-metadata',
    pathPt: 'privacidade/limpar-metadados-pdf',
    pathEn: 'privacy/clean-pdf-metadata',
    icon: 'sparkles',
    category: 'privacy',
    accepts: ['pdf'],
    produces: 'pdf',
    navKey: 'nav.clean_pdf_metadata',
    shortKey: 'nav.short.clean_pdf_metadata',
    titleKey: 'cleanpdf.title',
    descKey: 'cleanpdf.subtitle',
    suffix: 'clean',
    tone: 'fuchsia',
    keywordsPt: [
      'remover metadados pdf', 'limpar propriedades do pdf', 'apagar autor do pdf',
      'metadados de pdf', 'remover xmp', 'limpar dados do pdf', 'anonimizar documento',
      'tirar autor do pdf', 'propriedades do documento'
    ],
    keywordsEn: [
      'remove pdf metadata', 'clean pdf properties', 'strip pdf author',
      'pdf document properties', 'remove xmp', 'anonymize pdf metadata',
      'clear pdf info'
    ],
  },
  {
    id: 'encrypt-text',
    pathPt: 'privacidade/criptografar-texto',
    pathEn: 'privacy/encrypt-text',
    icon: 'text',
    category: 'privacy',
    accepts: ['text'],
    produces: 'text',
    navKey: 'nav.encrypt_text',
    shortKey: 'nav.short.encrypt_text',
    titleKey: 'enctext.title',
    descKey: 'enctext.subtitle',
    suffix: 'encrypted',
    tone: 'indigo',
    keywordsPt: [
      'criptografar texto', 'criptografar mensagem', 'descriptografar texto',
      'mensagem secreta', 'texto cifrado', 'senha em texto', 'aes 256 texto',
      'enviar mensagem segura', 'esconder mensagem'
    ],
    keywordsEn: [
      'encrypt text', 'encrypt message', 'decrypt text', 'secret message',
      'aes 256 text', 'password protect text', 'secure message', 'cipher text'
    ],
  },
  {
    id: 'qr-code',
    pathPt: 'privacidade/qr-code',
    pathEn: 'privacy/qr-code',
    icon: 'qrcode',
    category: 'privacy',
    // Fora da cadeia, e é o que o componente diz: ele não injeta
    // `WorkspaceService` em lugar nenhum — lê a imagem a ser escaneada pelo
    // seletor dele e salva o QR direto com `saveBlob`. Declarar `['image']`
    // faria os chips oferecerem "QR Code" depois de cortar uma foto, e a
    // ferramenta abriria com o dropzone vazio: a continuação prometida que
    // `img-to-pdf` já custou uma vez. Ligar o QR à sessão é uma mudança de
    // verdade — hidratar na entrada e registrar o resultado — e não uma
    // resolução de conflito.
    accepts: [],
    produces: null,
    navKey: 'nav.qr_code',
    shortKey: 'nav.short.qr_code',
    titleKey: 'qrcode.title',
    descKey: 'qrcode.subtitle',
    suffix: 'qrcode',
    tone: 'emerald',
    keywordsPt: [
      'gerar qr code', 'ler qr code', 'criar qr code', 'qr code wifi', 'qr code pix',
      'qr code offline', 'escanear qr code', 'leitor de qr code', 'gerador de qr code',
      'qr code seguro', 'qr code sem servidor', 'qr code vcard', 'qr code whatsapp'
    ],
    keywordsEn: [
      'qr code generator', 'qr code reader', 'create qr code', 'wifi qr code',
      'offline qr code', 'scan qr code', 'qr code scanner', 'secure qr code',
      'vcard qr code', 'whatsapp qr code', 'private qr code'
    ],
  },
];

export function toolById(id: ToolId): ToolDef {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`Unknown tool: ${id}`);
  return tool;
}

export function moduleById(id: ModuleId): ModuleDef {
  const found = MODULES.find((m) => m.id === id);
  if (!found) throw new Error(`Unknown module: ${id}`);
  return found;
}

export function toolsOfModule(id: ModuleId): readonly ToolDef[] {
  return TOOLS.filter((t) => t.category === id);
}

export function toolPath(tool: ToolDef, lang: 'pt' | 'en'): string {
  return lang === 'en' ? tool.pathEn : tool.pathPt;
}

export function toolFromUrl(url: string): ToolDef | null {
  const path = url.split(/[?#]/)[0].replace(/\/+$/, '');
  return (
    TOOLS.find((t) => path.endsWith(`/${t.pathPt}`) || path.endsWith(`/${t.pathEn}`)) ?? null
  );
}

/**
 * Destinos permitidos para `remove-exif`, e a exceção precisa existir.
 *
 * O strip é lossless por construção — o scan JPEG é copiado byte a byte, os
 * chunks do PNG só são removidos — e essa é a feature inteira. Qualquer editor
 * raster daqui em diante decodifica para um canvas e reencoda, desfazendo em
 * silêncio exatamente o que a pessoa veio fazer. Cifrar e resumir em hash são as
 * duas únicas coisas que não tocam em um pixel.
 *
 * É por isso que a regra mora aqui e não num campo do `ToolDef`: um campo é fácil
 * de esquecer na próxima ferramenta lossless; uma exceção nomeada, com o bug
 * escrito ao lado, não é.
 */
const LOSSLESS_SINKS: readonly ToolId[] = ['encrypt-file', 'file-hash'];

/**
 * Quantos chips a barra de ações mostra.
 *
 * Uma imagem é aceita por treze ferramentas depois que a cadeia passou a
 * atravessar módulos, e treze chips num painel de 324px são três linhas de
 * botõezinhos — que é como se esconde uma escolha, não como se oferece uma. O
 * resto continua a um clique no "Enviar para…" da barra de arquivo, que não tem
 * limite porque é um popover que rola.
 *
 * Oito, e não seis: com seis, o módulo de imagem perdia "Converter" — a ordem de
 * declaração empurrava vetorizar e extrair-texto na frente e a ferramenta mais
 * óbvia da cadeia caía fora da lista. O corte agora é depois das oito do próprio
 * módulo, e a ordenação abaixo é o que garante que as óbvias venham primeiro.
 */
export const MAX_NEXT_TOOL_CHIPS = 8;

/**
 * Para onde um resultado deste tipo pode ir a seguir.
 *
 * Substituiu `chainableImageTools`, que era uma lista escrita à mão de seis
 * ferramentas de imagem — e por isso só existia no módulo de imagem, e por isso
 * mesmo lá deixava de fora `vectorize`, `extract-text` e `img-to-pdf`, que
 * ACEITAM uma imagem perfeitamente: eram destinos válidos que ninguém alcançava
 * com o arquivo na mão.
 *
 * Derivar de `accepts` dá de graça o que faltava, inclusive atravessando módulos:
 * `pdf-to-img` → crop, `img-to-pdf` → as dez de PDF, `extract-text` →
 * diff-checker, e qualquer arquivo → encrypt-file / file-hash.
 *
 * A ordem coloca as ferramentas do mesmo módulo da origem primeiro: quem acabou
 * de comprimir um PDF quase sempre quer outra coisa de PDF, e as opções de outro
 * módulo são o caso raro que não deve empurrar as comuns para a segunda linha.
 */
export function nextToolsFor(
  kind: FileKind | null,
  fromId: ToolId | null,
  limit?: number,
): readonly ToolDef[] {
  if (!kind) return [];

  const from = fromId ? TOOLS.find((t) => t.id === fromId) ?? null : null;
  const allow = fromId === 'remove-exif' ? LOSSLESS_SINKS : null;

  const matches = TOOLS.filter(
    (t) =>
      t.id !== fromId &&
      (t.accepts.includes(kind) || t.accepts.includes('any')) &&
      (!allow || allow.includes(t.id)),
  );

  // Duas chaves, nesta ordem, e as duas importam mais desde que a cadeia
  // atravessa módulos:
  //
  // 1. Mesmo módulo da origem. Quem acabou de comprimir um PDF quase sempre quer
  //    outra coisa de PDF, e as opções de outro módulo são o caso raro que não
  //    deve empurrar as comuns para a segunda linha.
  // 2. Devolve o MESMO tipo. "Continue mexendo nesta imagem" vem antes de
  //    "transforme esta imagem em outra coisa" — e é o que mantém cortar,
  //    comprimir e converter na frente de vetorizar e img-para-pdf, em vez de
  //    deixar a ordem de declaração decidir. Com `MAX_NEXT_TOOL_CHIPS` cortando
  //    a lista, essa decisão é a diferença entre oferecer e esconder.
  const rank = (t: ToolDef): number =>
    (from && t.category !== from.category ? 2 : 0) + (t.produces === kind ? 0 : 1);

  const ordered = [...matches].sort((a, b) => rank(a) - rank(b));

  return limit === undefined ? ordered : ordered.slice(0, limit);
}


/**
 * As três ou quatro ferramentas que ficam no CORPO da página, sob "relacionadas".
 *
 * Existe por um buraco que a auditoria mediu: uma página de ferramenta tinha 13
 * links internos e todos eram o rail (o próprio módulo) ou o rodapé — nenhum
 * link saía do módulo, e nenhum link nascia do texto. Para quem lê, isso é uma
 * página sem saída óbvia; para um crawler, é um site em que a autoridade não
 * circula entre os módulos.
 *
 * A afinidade não é uma lista nova: sai de `accepts`/`produces`, as mesmas duas
 * declarações que já desenham a cadeia. Três fontes, nesta ordem de qualidade:
 *
 *   1. PARA ONDE o resultado pode ir (`nextToolsFor`) — a relação mais forte que
 *      existe, porque é a que o produto de fato executa com o arquivo na mão.
 *   2. DE ONDE ele pode ter vindo: quem produz o que esta ferramenta aceita.
 *      É o que liga `cortar` a `pdf-para-imagem`, uma relação real que a cadeia
 *      só enxerga na direção contrária.
 *   3. Vizinhas de módulo, que só entram para as ferramentas sem cadeia nenhuma
 *      (o gerador de senha não aceita nem produz arquivo).
 *
 * A última vaga é RESERVADA para uma ferramenta de outro módulo, quando existe
 * uma. Sem essa regra o item 1 preenche as quatro vagas com o próprio módulo —
 * `nextToolsFor` ordena assim de propósito — e a seção repetiria exatamente os
 * links que o rail já dá, que é o problema que ela veio resolver.
 */
export function relatedTools(id: ToolId, limit = 4): readonly ToolDef[] {
  const from = toolById(id);

  const downstream = nextToolsFor(from.produces, id);

  // `any` aceita tudo, e "tudo" não é afinidade nenhuma: criptografar-arquivo
  // listaria as 35 outras ferramentas em ordem de declaração.
  const upstream = from.accepts.includes('any')
    ? []
    : TOOLS.filter(
        (t) => t.id !== id && t.produces !== null && from.accepts.includes(t.produces),
      );

  const siblings = toolsOfModule(from.category).filter((t) => t.id !== id);

  // A MESMA restrição do `nextToolsFor`, e pelo mesmo motivo: clicar num card
  // daqui navega, e navegar COMMITA o resultado pendente na sessão. Sem esta
  // linha a página do remove-exif recomendaria um editor raster, que decodifica
  // e reencoda — desfazendo em silêncio o strip byte a byte que a pessoa veio
  // fazer. A seção é conteúdo, mas o clique dela é a cadeia.
  const allow = id === 'remove-exif' ? LOSSLESS_SINKS : null;

  const pool: ToolDef[] = [];
  for (const t of [...downstream, ...upstream, ...siblings]) {
    if (allow && !allow.includes(t.id)) continue;
    if (!pool.some((x) => x.id === t.id)) pool.push(t);
  }

  const cross = pool.filter((t) => t.category !== from.category);

  /**
   * Dentro do módulo, a ordem é a DISTÂNCIA no próprio módulo, e não a ordem de
   * declaração. As duas são a mesma lista, mas lidas de jeitos diferentes: a de
   * declaração é a ordem do rail, então ela já agrupa por afinidade (cortar,
   * comprimir, redimensionar, converter ficam juntos porque foi assim que
   * alguém escolheu apresentá-los). Ler pela distância transforma essa curadoria
   * que já existe em vizinhança — `redimensionar` passa a sugerir `comprimir` e
   * `converter` em vez de `remover fundo` e `melhorar qualidade`, que só vinham
   * na frente por estarem declarados primeiro.
   *
   * `nextToolsFor` continua com a ordem dele: lá a lista é o que fazer com o
   * arquivo que está na mão, e a resposta certa é a mais usada primeiro.
   */
  const order = toolsOfModule(from.category);
  const distance = (t: ToolDef): number =>
    Math.abs(order.findIndex((x) => x.id === t.id) - order.findIndex((x) => x.id === from.id));
  const own = pool
    .filter((t) => t.category === from.category)
    .sort((a, b) => distance(a) - distance(b));

  // DUAS vagas para fora do módulo, e o número saiu de uma medição. Com uma só,
  // `/pt/imagem/cortar` passou de 13 para 14 links internos únicos: as outras
  // três vagas caíram em ferramentas que o rail já linkava, então a seção
  // inteira acrescentava um link. Com duas, acrescenta dois — e o leitor
  // continua vendo duas vizinhas óbvias do próprio módulo antes delas.
  const CROSS_SLOTS = 2;

  /**
   * As vagas de fora do módulo GIRAM com a posição da ferramenta no módulo.
   *
   * Sem isso, as nove páginas de imagem apontavam para as MESMAS duas privadas,
   * porque a lista de candidatos é idêntica para todas elas (qualquer tool que
   * aceite imagem serve) e o corte pegava sempre as duas primeiras. Nove páginas
   * mandando todo mundo para os mesmos dois destinos é pior distribuição do que
   * nove páginas cobrindo o módulo inteiro — e a escolha entre candidatos
   * igualmente válidos não tem outro critério a respeitar.
   *
   * Gira pelo ÍNDICE, não por sorteio: o valor precisa ser o mesmo no prerender
   * e na hidratação, ou o Angular descarta a subárvore e re-renderiza.
   */
  const spin = Math.max(order.findIndex((x) => x.id === from.id), 0);
  const crossPicked = cross.length
    ? Array.from({ length: Math.min(CROSS_SLOTS, cross.length) }, (_, k) => cross[(spin + k) % cross.length])
    : [];
  const picked = [...own.slice(0, Math.max(limit - crossPicked.length, 0)), ...crossPicked];

  // Completa com o que sobrou quando o próprio módulo não tinha vagas para dar
  // (privacidade tem 10 ferramentas, vídeo tem 2).
  for (const t of pool) {
    if (picked.length >= limit) break;
    if (!picked.some((x) => x.id === t.id)) picked.push(t);
  }

  return picked.slice(0, limit);
}
