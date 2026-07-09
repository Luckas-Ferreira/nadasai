import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/hero/hero.component').then(m => m.HeroComponent) },
  { path: 'remove-bg', loadComponent: () => import('./features/remove-bg/remove-bg.component').then(m => m.RemoveBgComponent) },
  { path: 'crop', loadComponent: () => import('./features/crop/crop.component').then(m => m.CropComponent) },
  { path: 'compress', loadComponent: () => import('./features/compress/compress.component').then(m => m.CompressComponent) },
  { path: 'convert', loadComponent: () => import('./features/convert/convert.component').then(m => m.ConvertComponent) },
  { path: 'resize', loadComponent: () => import('./features/resize/resize.component').then(m => m.ResizeComponent) }
];
