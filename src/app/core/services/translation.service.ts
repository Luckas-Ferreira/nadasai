import { Injectable, signal, computed } from '@angular/core';

export type Language = 'pt' | 'en';

export const DICTIONARY: Record<Language, Record<string, string>> = {
  pt: {
    // Header & Footer
    'app.subtitle': 'REMOVEDOR DE FUNDO PRO',
    'app.lang.btn': '🌐 EN',
    'app.footer.about': 'SOBRE',
    'app.footer.privacy': 'PRIVACIDADE',
    'app.footer.terms': 'TERMOS',
    'app.footer.secure': '100% SEGURO & RODA NO NAVEGADOR',
    
    // Navigation
    'nav.remove_bg': 'Remover Fundo',
    'nav.crop': 'Cortar Imagem',
    'nav.compress': 'Comprimir Imagem',
    'nav.convert': 'Converter Formato',
    'nav.resize': 'Redimensionar',
    
    // Hero / Dashboard
    'hero.title': 'Ferramentas de Imagem',
    'hero.subtitle': 'Tudo que você precisa para editar suas fotos em um só lugar.',
    'hero.drag': 'Solte sua Imagem aqui',
    'hero.or': 'ou',
    'hero.upload_btn': 'Selecionar Imagem',
    'hero.extracting': 'Extraindo o Sujeito',
    'hero.running': 'Rodando modelo de IA localmente...',
    'hero.processing': 'Removendo o fundo de forma mágica...',
    
    // Results / Actions
    'results.success': 'Pronto!',
    'results.continue': 'Continuar Editando...',
    'results.tab.processed': 'Fundo Removido',
    'results.tab.original': 'Original',
    'results.bg_color': 'Cor de fundo:',
    'results.download': 'Download',
    'results.download_hint': 'Salva em alta resolução',
    'results.start_over': 'Upload de Nova Imagem',

    // Remove BG
    'bg.title': 'Remover Fundo',
    'bg.subtitle': 'Extraia pessoas, objetos e produtos com um clique.',
    'bg.btn': 'Remover Fundo',

    // Crop
    'crop.title': 'Corte sua Imagem',
    'crop.subtitle': 'Ajuste para o tamanho perfeito',
    'crop.ratio.free': 'Livre',
    'crop.ratio.square': 'Quadrado',
    'crop.download': 'Cortar & Baixar',

    // Compress
    'compress.title': 'Comprima sua Imagem',
    'compress.subtitle': 'Reduza o tamanho sem perder qualidade',
    'compress.quality': 'Qualidade da Imagem',
    'compress.quality.low': 'Menor Arquivo',
    'compress.quality.high': 'Maior Qualidade',
    'compress.original_size': 'Tamanho Original:',
    'compress.new_size': 'Novo Tamanho:',
    'compress.download': 'Baixar Imagem Comprimida',

    // Convert
    'convert.title': 'Converta sua Imagem',
    'convert.subtitle': 'Mude o formato para WEBP, JPEG, PNG, AVIF ou PDF',
    'convert.select_format': 'Selecione o Formato:',
    'convert.btn': 'Converter e Baixar',

    // Resize
    'resize.title': 'Redimensionar Imagem',
    'resize.subtitle': 'Mude as dimensões físicas da sua imagem',
    'resize.original_dim': 'Dimensão Original:',
    'resize.width': 'Largura (px)',
    'resize.height': 'Altura (px)',
    'resize.presets': 'Tamanhos Rápidos:',
    'resize.btn': 'Redimensionar & Comprimir',
  },
  en: {
    // Header & Footer
    'app.subtitle': 'PRO BACKGROUND REMOVER',
    'app.lang.btn': '🌐 PT',
    'app.footer.about': 'ABOUT',
    'app.footer.privacy': 'PRIVACY',
    'app.footer.terms': 'TERMS',
    'app.footer.secure': '100% SECURE & CLIENT-SIDE',
    
    // Navigation
    'nav.remove_bg': 'Remove Background',
    'nav.crop': 'Crop Image',
    'nav.compress': 'Compress Image',
    'nav.convert': 'Convert Format',
    'nav.resize': 'Resize Image',
    
    // Hero / Dashboard
    'hero.title': 'Image Tools',
    'hero.subtitle': 'Everything you need to edit your photos in one place.',
    'hero.drag': 'Drop your Image here',
    'hero.or': 'or',
    'hero.upload_btn': 'Select Image',
    'hero.extracting': 'Extracting Subject',
    'hero.running': 'Running AI model locally...',
    'hero.processing': 'Removing background magically...',
    
    // Results / Actions
    'results.success': 'Done!',
    'results.continue': 'Continue Editing...',
    'results.tab.processed': 'Background Removed',
    'results.tab.original': 'Original',
    'results.bg_color': 'Background Color:',
    'results.download': 'Download',
    'results.download_hint': 'Saves in high resolution',
    'results.start_over': 'Upload New Image',

    // Remove BG
    'bg.title': 'Remove Background',
    'bg.subtitle': 'Extract people, objects, and products with one click.',
    'bg.btn': 'Remove Background',

    // Crop
    'crop.title': 'Crop your Image',
    'crop.subtitle': 'Adjust to the perfect size',
    'crop.ratio.free': 'Free',
    'crop.ratio.square': 'Square',
    'crop.download': 'Crop & Download',

    // Compress
    'compress.title': 'Compress your Image',
    'compress.subtitle': 'Reduce file size without losing quality',
    'compress.quality': 'Image Quality',
    'compress.quality.low': 'Smallest File',
    'compress.quality.high': 'Highest Quality',
    'compress.original_size': 'Original Size:',
    'compress.new_size': 'New Size:',
    'compress.download': 'Download Compressed Image',

    // Convert
    'convert.title': 'Convert your Image',
    'convert.subtitle': 'Change format to WEBP, JPEG, PNG, AVIF or PDF',
    'convert.select_format': 'Select Target Format:',
    'convert.btn': 'Convert & Download',

    // Resize
    'resize.title': 'Resize Image',
    'resize.subtitle': 'Change the physical dimensions of your image',
    'resize.original_dim': 'Original Dimensions:',
    'resize.width': 'Width (px)',
    'resize.height': 'Height (px)',
    'resize.presets': 'Quick Presets:',
    'resize.btn': 'Resize & Compress',
  }
};

export type TranslationKey = keyof typeof DICTIONARY['pt'];

@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  public currentLang = signal<Language>('en');

  public toggleLanguage() {
    this.currentLang.update(lang => lang === 'pt' ? 'en' : 'pt');
  }

  // Returns a computed signal of the dictionary for the current language
  public t = computed(() => DICTIONARY[this.currentLang()]);
}
