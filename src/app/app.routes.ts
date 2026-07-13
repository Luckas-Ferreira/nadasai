import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'ImgWork — Image tools',
    loadComponent: () => import('./features/hero/hero.component').then((m) => m.HeroComponent),
  },
  {
    path: 'remove-bg',
    title: 'Remove background — ImgWork',
    loadComponent: () => import('./features/remove-bg/remove-bg.component').then((m) => m.RemoveBgComponent),
  },
  {
    path: 'crop',
    title: 'Crop — ImgWork',
    loadComponent: () => import('./features/crop/crop.component').then((m) => m.CropComponent),
  },
  {
    path: 'compress',
    title: 'Compress — ImgWork',
    loadComponent: () => import('./features/compress/compress.component').then((m) => m.CompressComponent),
  },
  {
    path: 'convert',
    title: 'Convert — ImgWork',
    loadComponent: () => import('./features/convert/convert.component').then((m) => m.ConvertComponent),
  },
  {
    path: 'resize',
    title: 'Resize — ImgWork',
    loadComponent: () => import('./features/resize/resize.component').then((m) => m.ResizeComponent),
  },
  { path: '**', redirectTo: '' },
];
