/**
 * Central icon registry. Every path is drawn on a 24x24 grid with a 1.5 stroke,
 * rendered at 16-20px. Inline <svg> blocks are not allowed in templates — add
 * the path here and use <app-icon name="..."> so weight stays consistent.
 */
export const ICONS = {
  'remove-bg': 'M4 16.5 8.6 12a2 2 0 0 1 2.8 0l4.6 4.5M14 13.5l1.6-1.6a2 2 0 0 1 2.8 0L21 15M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z',
  crop: 'M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14',
  compress: 'M12 4v7m0 0 3-3m-3 3L9 8m-5 8v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  convert: 'M4 8h13m0 0-3.5-3.5M17 8l-3.5 3.5M20 16H7m0 0 3.5 3.5M7 16l3.5-3.5',
  resize: 'M4 9V4h5M4 4l5.5 5.5M20 15v5h-5m5 0-5.5-5.5',
  upload: 'M12 16V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  download: 'M12 4v12m0 0 4-4m-4 4-4-4M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1',
  image: 'M4 16.5 8.6 12a2 2 0 0 1 2.8 0l4.6 4.5M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Zm8.5-11.5h.01',
  arrowRight: 'M4 12h15m0 0-5.5-5.5M19 12l-5.5 5.5',
  check: 'M4.5 12.5 9 17l10.5-10.5',
  close: 'M6 6l12 12M18 6 6 18',
  alert: 'M12 8v5m0 3h.01M12 3.5 2.8 19.5h18.4L12 3.5Z',
  refresh: 'M20 5v5h-5M4 19v-5h5m10.5-1a7.5 7.5 0 0 1-13.6 3.4M4.5 11a7.5 7.5 0 0 1 13.6-3.4',
  undo: 'M4 9h11a5 5 0 0 1 0 10h-6M4 9l4.5-4.5M4 9l4.5 4.5',
  lock: 'M7 10V8a5 5 0 0 1 10 0v2M6 10h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z',
  unlock: 'M7 10V8a5 5 0 0 1 9.6-2M6 10h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z',
  rotate: 'M15 4.5h4.5V9m-.5-4a8 8 0 1 0 1.4 8',
  flip: 'M12 3v18M8 7 4 12l4 5V7Zm8 0 4 5-4 5V7Z',
  brush: 'M9.5 14.5 4 20m5.5-5.5 3 3m-3-3-3-3m3 3 8-8a2.1 2.1 0 0 1 3 3l-8 8m-6 2c0 1.1-.9 2-2 2H4v-1.5c0-1.1.9-2 2-2s2 .9 2 2Z',
  language: 'M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  sun: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
  home: 'M4 10.5 12 4l8 6.5M6 9.5V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.5',
  wifiOff: 'M3 3l18 18M9.9 15.6a3 3 0 0 1 4.2 0M6.7 12.3a7.5 7.5 0 0 1 3.1-1.9m4.5.1a7.5 7.5 0 0 1 3 1.8M3.5 9a12 12 0 0 1 4-2.4m4-.5a12 12 0 0 1 9 2.9M12 19h.01',
  pdf: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8m-5-5 5 5m-5-5v5h5',
  doc: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm-5 9h6m-6 4h4',
  audio: 'M4 10v4m4-7v10m4-13v16m4-11v6m4-4v2',
  play: 'M8 5.4v13.2a.6.6 0 0 0 .92.5l10.3-6.6a.6.6 0 0 0 0-1L8.92 4.9a.6.6 0 0 0-.92.5Z',
  pause: 'M9.5 5v14M14.5 5v14',
  scissors:
    'M8.5 6a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm0 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM20 4 9.2 14.8M13.6 13.9 20 20M9.2 9.2 12 12',
  images: 'M8 3h11a2 2 0 0 1 2 2v11M4 10.5 6.9 7.6a1.5 1.5 0 0 1 2.2 0l3.4 3.4M12 9.6l1.4-1.4a1.5 1.5 0 0 1 2.2 0L18 10.5M5 20h11a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1Z',
  merge: 'M9 3H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1Zm10 9h-4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1Zm-9-4.5h5.5a2 2 0 0 1 2 2V12m0 0-2-2m2 2 2-2',
  split: 'M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  plus: 'M12 5v14m-7-7h14',
  minus: 'M5 12h14',
  alignLeft: 'M4 6h16M4 10h10M4 14h16M4 18h10',
  alignCenter: 'M4 6h16M7 10h10M4 14h16M7 18h10',
  alignRight: 'M4 6h16M10 10h10M4 14h16M10 18h10',
  alignJustify: 'M4 6h16M4 10h16M4 14h16M4 18h16',
  text: 'M6 5h12M12 5v14m-3 0h6',
  square: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z',
  scan: 'M4 8V6a2 2 0 0 1 2-2h2m8 0h2a2 2 0 0 1 2 2v2m0 8v2a2 2 0 0 1-2 2h-2m-8 0H6a2 2 0 0 1-2-2v-2m3-4h10',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm12 0a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z',
  eyeOff: 'M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61M2 2l20 20',
  search: 'M20.5 20.5 16 16m1.5-5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z',
  modules: 'M4.5 4.5h6v6h-6v-6Zm9 0h6v6h-6v-6Zm-9 9h6v6h-6v-6Zm9 0h6v6h-6v-6Z',
  sparkles: 'M12 3l2.2 4.8L19 10l-4.8 2.2L12 17l-2.2-4.8L5 10l4.8-2.2L12 3Zm7 12l1.1 2.4L22 18.5l-2.4 1.1L18.5 22l-1.1-2.4L15 18.5l2.4-1.1L18.5 15Z',
  copy: 'M8 7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V7Zm-4 4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  key: 'M21 2l-2 2m-3 3l-2.5 2.5a5 5 0 1 0 3 3L19 10v-3h-2V5h-2L21 2Z',
  hash: 'M4 9h16M4 15h16M10 3l-2 18M16 3l-2 18',
  diff: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm-5 9h6m-6 4h4',
  video: 'M15 10l4.55-2.28A1 1 0 0 1 21 8.62v6.76a1 1 0 0 1-1.45.89L15 14M5 18h8a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2Z',
  palette: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 9 9c0 1.5-1 2.5-2.5 2.5H16a2 2 0 0 0-2 2v.5c0 1.5-1 2.5-2 2.5Z M7.5 10.5h.01 M10.5 7.5h.01 M13.5 7.5h.01 M16.5 10.5h.01',
  zap: 'M13 2 3 14h9l-1 8 10-12h-9l1-8Z',
  /** Monitor com o ponto de gravação: a tela é o que entra, não uma câmera. */
  screenRecord: 'M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Zm5 15h6m-3-5v5m0-11.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
  stop: 'M8 8h8v8H8z',
  /**
   * Três controles deslizantes, não uma engrenagem: a engrenagem que cabe em
   * 24x24 com traço 1.5 vira um borrão de dentes, e este ícone lê como "ajustes"
   * no mesmo tamanho sem depender de detalhe que some.
   */
  settings:
    'M4 6h9m4 0h3M4 12h3m4 0h10M4 18h9m4 0h3M17 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm-6 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm6 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  /** Caixa: um pacote de runtime, que é o que a tela de configuração gerencia. */
  box: 'M12 3 4 7v10l8 4 8-4V7l-8-4ZM4 7l8 4 8-4M12 11v10',
  qrcode: 'M3 3h7v7H3V3Zm2 2v3h3V5H5Zm8-2h7v7h-7V3Zm2 2v3h3V5h-3ZM3 13h7v7H3v-7Zm2 2v3h3v-3H5Zm8 0h3v3h-3v-3Zm4 0h3v7h-3v-3h-3v-4h3Zm-4 4h3v3h-3v-3Z',
  // Janela de navegador com o ícone do site dentro: é o que um favicon É.
  favicon:
    'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm-1 4.6h16M6.6 6.3h.01M8.9 6.3h.01M9.6 12.2h4.8v4.8H9.6z',
} as const;

export type IconName = keyof typeof ICONS;
