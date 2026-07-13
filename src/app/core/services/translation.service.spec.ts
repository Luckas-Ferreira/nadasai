import { TestBed } from '@angular/core/testing';
import { TranslationService } from './translation.service';
import { TOOLS } from '../tools/tools';

describe('TranslationService', () => {
  let i18n: TranslationService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    i18n = TestBed.inject(TranslationService);
  });

  /**
   * The compress button used to render with no label at all, because the
   * template referenced a `compress.btn` key that only existed in one place:
   * nowhere. The dictionary is typed now, but this guards the runtime shape too.
   */
  it('has identical key sets in both languages', () => {
    i18n.setLanguage('en');
    const en = Object.keys(i18n.t()).sort();

    i18n.setLanguage('pt');
    const pt = Object.keys(i18n.t()).sort();

    expect(pt).toEqual(en);
  });

  it('has no blank translations', () => {
    for (const lang of ['en', 'pt'] as const) {
      i18n.setLanguage(lang);
      const dict = i18n.t();

      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim()).withContext(`${lang}:${key} is blank`).not.toBe('');
      }
    }
  });

  it('resolves every key the tool registry points at', () => {
    for (const tool of TOOLS) {
      expect(i18n.t()[tool.navKey]).toBeTruthy();
      expect(i18n.t()[tool.titleKey]).toBeTruthy();
      expect(i18n.t()[tool.descKey]).toBeTruthy();
    }
  });

  it('persists the language and reflects it on <html lang>', () => {
    i18n.setLanguage('pt');
    TestBed.flushEffects();

    expect(localStorage.getItem('imgwork.lang')).toBe('pt');
    expect(document.documentElement.lang).toBe('pt');
  });

  it('toggles between the two languages', () => {
    i18n.setLanguage('en');
    i18n.toggleLanguage();
    expect(i18n.currentLang()).toBe('pt');

    i18n.toggleLanguage();
    expect(i18n.currentLang()).toBe('en');
  });
});
