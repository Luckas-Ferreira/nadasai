import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { TranslationService } from './core/services/translation.service';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the wordmark', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Nada Sai');
  });

  // `toggleLanguage` passou a ser assíncrono quando os dicionários viraram
  // chunks carregados por `import()`: ele só troca `currentLang` DEPOIS de o
  // dicionário do destino estar em mão, senão a tela ficaria sem texto até o
  // chunk chegar. Sem o `await`, este teste lia o idioma antes da troca.
  it('should toggle the active language', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const i18n = TestBed.inject(TranslationService);
    fixture.detectChanges();

    const initial = i18n.currentLang();
    await i18n.toggleLanguage();

    expect(i18n.currentLang()).not.toEqual(initial);
  });
});
