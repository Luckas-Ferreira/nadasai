import { Injectable, computed, effect, signal } from '@angular/core';

export type Language = 'pt' | 'en';

const STORAGE_KEY = 'imgwork.lang';

/**
 * English is the source of truth for the key set. `TranslationKey` is derived
 * from it, and PT is typed as a total Record over those keys — so a missing or
 * misspelled key is a compile error, not a silently blank button in the UI.
 */
const EN = {
  'app.tagline': 'File processing that never leaves your device',
  'app.lang_switch': 'Change language',
  'app.theme_switch': 'Toggle theme',
  'app.footer.about': 'About',
  'app.footer.privacy': 'Privacy',
  'app.footer.terms': 'Terms',
  'app.footer.secure': 'Your files never leave your device.',

  'nav.tools': 'Tools',
  'nav.remove_bg': 'Remove background',
  'nav.crop': 'Crop',
  'nav.compress': 'Compress',
  'nav.convert': 'Convert',
  'nav.resize': 'Resize',

  'hero.title': 'Your files never leave your computer.',
  'hero.subtitle':
    'No upload, no server. Everything — including the AI — runs right here, inside your browser. You do not have to take our word for it: the counter below is live.',
  'hero.sample': 'Use a sample image',
  'hero.sample_hint': 'No file at hand? Start with ours.',
  'hero.module_image': 'Module: Image',
  'hero.soon_section': 'Coming next',
  'hero.soon.pdf': 'PDF',
  'hero.soon.pdf_desc': 'Merge, split, compress and sign.',
  'hero.soon.doc': 'Documents',
  'hero.soon.doc_desc': 'Convert and compress without uploading.',
  'hero.soon.audio': 'Audio',
  'hero.soon.audio_desc': 'Trim, convert and compress locally.',
  'hero.next_step': 'What do you want to do with it?',

  'proof.title': 'Network, monitored live',
  'proof.sent': 'Bytes of your file sent to the network',
  'proof.recipients': 'Servers that received your file',
  'proof.zero_bytes': '0 bytes',
  'proof.none': 'none',
  'proof.disclosure':
    'Measured live, in your browser: every send your file could physically take — fetch, XHR, beacon, WebSocket — is counted here. The page loads its own code, its own font and the AI model, and that is all it ever asks for. Open DevTools on the Network tab and check for yourself.',
  'proof.try_offline': 'Do not believe it? Turn off your Wi-Fi and keep using the app.',
  'proof.offline_ok': 'You are offline. Everything still works — that is the whole point.',

  'common.drag': 'Drop an image here',
  'common.or': 'or',
  'common.upload_btn': 'Choose file',
  'common.change_image': 'Change image',
  'common.processing': 'Working…',
  'common.retry': 'Try again',
  'common.download': 'Download',
  'common.continue': 'Keep editing',
  'common.reset': 'Start over',
  'common.clear': 'Clear',
  'common.dismiss': 'Dismiss',
  'common.original': 'Original',
  'common.result': 'Result',
  'common.editing': 'Editing',
  'common.download_hint': 'Saved at full resolution',
  'common.drag_hint': 'PNG, JPEG, WebP, GIF or AVIF · up to 50 MB',

  'bg.title': 'Remove background',
  'bg.subtitle': 'Cut out people, products and objects.',
  'bg.btn': 'Remove background',
  'bg.running': 'Running the model locally — this can take a few seconds.',
  'bg.bg_color': 'Backdrop',
  'bg.transparent': 'Transparent',

  'crop.title': 'Crop',
  'crop.subtitle': 'Trim the frame to the size you need.',
  'crop.btn': 'Apply crop',
  'crop.aspect': 'Aspect ratio',
  'crop.ratio.free': 'Free',
  'crop.ratio.square': 'Square',
  'crop.rotate': 'Rotate',
  'crop.flip': 'Flip',
  'crop.reset_box': 'Reset selection',

  'compress.title': 'Compress',
  'compress.subtitle': 'Shrink the file with as little visible loss as possible.',
  'compress.btn': 'Compress',
  'compress.quality': 'Quality',
  'compress.quality.low': 'Smaller file',
  'compress.quality.high': 'Better quality',
  'compress.original_size': 'Original',
  'compress.new_size': 'Compressed',
  'compress.savings': 'saved',
  'compress.output_note': 'Output is WebP, which compresses far better than JPEG.',

  'convert.title': 'Convert',
  'convert.subtitle': 'Change the file format.',
  'convert.btn': 'Convert',
  'convert.select_format': 'Target format',
  'convert.pdf_bg': 'Background behind transparency',
  'convert.terminal_note': 'PDF and ICO are final formats — they can be downloaded but not edited further.',

  'resize.title': 'Resize',
  'resize.subtitle': 'Set exact pixel dimensions.',
  'resize.btn': 'Resize',
  'resize.width': 'Width',
  'resize.height': 'Height',
  'resize.presets': 'Presets',
  'resize.original_dim': 'Original',
  'resize.new_dim': 'New',
  'resize.lock_on': 'Aspect ratio locked',
  'resize.lock_off': 'Aspect ratio unlocked',

  'error.generic': 'Something went wrong. Please try again.',
  'error.unsupported_file': "That file isn't a supported image. Use PNG, JPEG, WebP, GIF or AVIF.",
  'error.too_large': 'That image is too large. The limit is 50 MB.',
  'error.decode_failed': "This image couldn't be read — it may be corrupted.",
  'error.encode_failed': "The image couldn't be saved in that format.",
  'error.model_failed': "The background-removal model couldn't run. Check your connection and try again.",
  'error.too_many_pixels': 'This image has too many pixels for the browser to process.',
} as const;

export type TranslationKey = keyof typeof EN;

const PT: Record<TranslationKey, string> = {
  'app.tagline': 'Processamento de arquivos que nunca saem do seu dispositivo',
  'app.lang_switch': 'Mudar idioma',
  'app.theme_switch': 'Alternar tema',
  'app.footer.about': 'Sobre',
  'app.footer.privacy': 'Privacidade',
  'app.footer.terms': 'Termos',
  'app.footer.secure': 'Seus arquivos nunca saem do seu dispositivo.',

  'nav.tools': 'Ferramentas',
  'nav.remove_bg': 'Remover fundo',
  'nav.crop': 'Cortar',
  'nav.compress': 'Comprimir',
  'nav.convert': 'Converter',
  'nav.resize': 'Redimensionar',

  'hero.title': 'Seus arquivos não saem do seu computador.',
  'hero.subtitle':
    'Sem upload, sem servidor. Tudo — inclusive a inteligência artificial — roda aqui dentro, no seu navegador. E você não precisa acreditar: o contador abaixo é ao vivo.',
  'hero.sample': 'Usar uma imagem de exemplo',
  'hero.sample_hint': 'Sem arquivo à mão? Comece com a nossa.',
  'hero.module_image': 'Módulo: Imagem',
  'hero.soon_section': 'Em breve',
  'hero.soon.pdf': 'PDF',
  'hero.soon.pdf_desc': 'Juntar, dividir, comprimir e assinar.',
  'hero.soon.doc': 'Documentos',
  'hero.soon.doc_desc': 'Converter e comprimir sem enviar nada.',
  'hero.soon.audio': 'Áudio',
  'hero.soon.audio_desc': 'Cortar, converter e comprimir localmente.',
  'hero.next_step': 'O que você quer fazer com ela?',

  'proof.title': 'Rede monitorada ao vivo',
  'proof.sent': 'Bytes do seu arquivo enviados à rede',
  'proof.recipients': 'Servidores que receberam seu arquivo',
  'proof.zero_bytes': '0 bytes',
  'proof.none': 'nenhum',
  'proof.disclosure':
    'Medido ao vivo, no seu navegador: toda saída que o seu arquivo poderia fisicamente tomar — fetch, XHR, beacon, WebSocket — é contada aqui. A página carrega o próprio código, a própria fonte e o modelo de IA, e é só isso que ela pede. Abra as ferramentas do navegador na aba Rede e confira você mesmo.',
  'proof.try_offline': 'Não acredita? Desligue o Wi-Fi e continue usando.',
  'proof.offline_ok': 'Você está sem internet. Tudo continua funcionando — é exatamente esse o ponto.',

  'common.drag': 'Solte uma imagem aqui',
  'common.or': 'ou',
  'common.upload_btn': 'Escolher arquivo',
  'common.change_image': 'Trocar imagem',
  'common.processing': 'Processando…',
  'common.retry': 'Tentar de novo',
  'common.download': 'Baixar',
  'common.continue': 'Continuar editando',
  'common.reset': 'Recomeçar',
  'common.clear': 'Limpar',
  'common.dismiss': 'Dispensar',
  'common.original': 'Original',
  'common.result': 'Resultado',
  'common.editing': 'Editando',
  'common.download_hint': 'Salvo em resolução total',
  'common.drag_hint': 'PNG, JPEG, WebP, GIF ou AVIF · até 50 MB',

  'bg.title': 'Remover fundo',
  'bg.subtitle': 'Recorte pessoas, produtos e objetos.',
  'bg.btn': 'Remover fundo',
  'bg.running': 'Rodando o modelo localmente — pode levar alguns segundos.',
  'bg.bg_color': 'Fundo',
  'bg.transparent': 'Transparente',

  'crop.title': 'Cortar',
  'crop.subtitle': 'Ajuste o enquadramento ao tamanho que você precisa.',
  'crop.btn': 'Aplicar corte',
  'crop.aspect': 'Proporção',
  'crop.ratio.free': 'Livre',
  'crop.ratio.square': 'Quadrado',
  'crop.rotate': 'Girar',
  'crop.flip': 'Espelhar',
  'crop.reset_box': 'Redefinir seleção',

  'compress.title': 'Comprimir',
  'compress.subtitle': 'Reduza o arquivo com a menor perda visível possível.',
  'compress.btn': 'Comprimir',
  'compress.quality': 'Qualidade',
  'compress.quality.low': 'Arquivo menor',
  'compress.quality.high': 'Mais qualidade',
  'compress.original_size': 'Original',
  'compress.new_size': 'Comprimido',
  'compress.savings': 'de economia',
  'compress.output_note': 'A saída é WebP, que comprime muito melhor que JPEG.',

  'convert.title': 'Converter',
  'convert.subtitle': 'Mude o formato do arquivo.',
  'convert.btn': 'Converter',
  'convert.select_format': 'Formato de destino',
  'convert.pdf_bg': 'Fundo atrás da transparência',
  'convert.terminal_note': 'PDF e ICO são formatos finais — podem ser baixados, mas não editados adiante.',

  'resize.title': 'Redimensionar',
  'resize.subtitle': 'Defina as dimensões exatas em pixels.',
  'resize.btn': 'Redimensionar',
  'resize.width': 'Largura',
  'resize.height': 'Altura',
  'resize.presets': 'Atalhos',
  'resize.original_dim': 'Original',
  'resize.new_dim': 'Novo',
  'resize.lock_on': 'Proporção travada',
  'resize.lock_off': 'Proporção livre',

  'error.generic': 'Algo deu errado. Tente novamente.',
  'error.unsupported_file': 'Esse arquivo não é uma imagem suportada. Use PNG, JPEG, WebP, GIF ou AVIF.',
  'error.too_large': 'Essa imagem é grande demais. O limite é 50 MB.',
  'error.decode_failed': 'Não foi possível ler esta imagem — ela pode estar corrompida.',
  'error.encode_failed': 'Não foi possível salvar a imagem nesse formato.',
  'error.model_failed': 'Não foi possível rodar o modelo de remoção de fundo. Verifique sua conexão e tente de novo.',
  'error.too_many_pixels': 'Esta imagem tem pixels demais para o navegador processar.',
};

const DICTIONARY: Record<Language, Record<TranslationKey, string>> = { en: EN, pt: PT };

function initialLanguage(): Language {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'pt' || stored === 'en') return stored;
  return navigator.language?.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

@Injectable({ providedIn: 'root' })
export class TranslationService {
  readonly currentLang = signal<Language>(initialLanguage());

  /** Dictionary for the active language. Templates read `i18n.t()['some.key']`. */
  readonly t = computed(() => DICTIONARY[this.currentLang()]);

  constructor() {
    effect(() => {
      const lang = this.currentLang();
      localStorage.setItem(STORAGE_KEY, lang);
      document.documentElement.lang = lang;
    });
  }

  setLanguage(lang: Language): void {
    this.currentLang.set(lang);
  }

  toggleLanguage(): void {
    this.currentLang.update((lang) => (lang === 'pt' ? 'en' : 'pt'));
  }
}
