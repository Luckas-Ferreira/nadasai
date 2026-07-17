import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Nada Sai — seus arquivos não saem do seu computador',
    loadComponent: () => import('./features/hero/hero.component').then((m) => m.HeroComponent),
  },
  {
    path: 'remove-bg',
    title: 'Remover fundo — Nada Sai',
    loadComponent: () => import('./features/remove-bg/remove-bg.component').then((m) => m.RemoveBgComponent),
  },
  {
    path: 'crop',
    title: 'Cortar — Nada Sai',
    loadComponent: () => import('./features/crop/crop.component').then((m) => m.CropComponent),
  },
  {
    path: 'compress',
    title: 'Comprimir — Nada Sai',
    loadComponent: () => import('./features/compress/compress.component').then((m) => m.CompressComponent),
  },
  {
    path: 'convert',
    title: 'Converter — Nada Sai',
    loadComponent: () => import('./features/convert/convert.component').then((m) => m.ConvertComponent),
  },
  {
    path: 'resize',
    title: 'Redimensionar — Nada Sai',
    loadComponent: () => import('./features/resize/resize.component').then((m) => m.ResizeComponent),
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
  { path: '**', redirectTo: '' },
];
