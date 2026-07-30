import { IconName } from '../../shared/ui/icon/icons';
import type { TranslationKey } from '../services/translation.service';

export type ToolId =
  | 'remove-bg'
  | 'upscale'
  | 'extract-text'
  | 'cut-audio'
  | 'merge-audio'
  | 'convert-audio'
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
  | 'organize-pdf'
  | 'protect-pdf'
  | 'sign-pdf'
  | 'watermark-pdf';

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

export type ToolCategory = 'image' | 'pdf' | 'audio';

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
];

export interface ToolDef {
  readonly id: ToolId;
  readonly pathPt: string;
  readonly pathEn: string;
  readonly icon: IconName;
  readonly category: ToolCategory;
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
    id: 'remove-bg',
    pathPt: 'imagem/remover-fundo',
    pathEn: 'image/remove-bg',
    icon: 'remove-bg',
    category: 'image',
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
    id: 'extract-text',
    pathPt: 'imagem/extrair-texto',
    pathEn: 'image/extract-text',
    icon: 'scan',
    category: 'image',
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
    id: 'crop',
    pathPt: 'imagem/cortar',
    pathEn: 'image/crop',
    icon: 'crop',
    category: 'image',
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
    id: 'organize-pdf',
    pathPt: 'pdf/organizar',
    pathEn: 'pdf/organize',
    icon: 'doc',
    category: 'pdf',
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
