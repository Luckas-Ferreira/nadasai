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
    expect(compiled.textContent).toContain('ImgWork');
  });

  it('should toggle the active language', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const i18n = TestBed.inject(TranslationService);
    fixture.detectChanges();

    const initial = i18n.currentLang();
    i18n.toggleLanguage();

    expect(i18n.currentLang()).not.toEqual(initial);
  });
});
