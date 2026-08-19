import { kindOf } from './kind';

function f(name: string, type = ''): File {
  return new File([new Uint8Array(1)], name, { type });
}

describe('kindOf', () => {
  it('reads the MIME type first', () => {
    expect(kindOf(f('a.bin', 'image/png'))).toBe('image');
    expect(kindOf(f('a.bin', 'application/pdf'))).toBe('pdf');
    expect(kindOf(f('a.bin', 'audio/mpeg'))).toBe('audio');
    expect(kindOf(f('a.bin', 'video/mp4'))).toBe('video');
    expect(kindOf(f('a.bin', 'text/plain'))).toBe('text');
  });

  /**
   * O teste que carrega a regra: `image/svg+xml` começa com `image/`, então um
   * teste por prefixo classifica um vetor recém-criado como raster — e a cadeia
   * passa a oferecer o SVG ao cortar, que o decodifica num canvas e joga fora
   * exatamente o que o vetorizador acabou de produzir.
   */
  it('files an SVG as a vector, not as a raster', () => {
    expect(kindOf(f('logo.svg', 'image/svg+xml'))).toBe('svg');
    expect(kindOf(f('logo.svg'))).toBe('svg');
  });

  /**
   * `.mkv` e `.avi` chegam do Windows com `type` vazio com frequência suficiente
   * para que um teste só por MIME os deixe invisíveis — a mesma armadilha que
   * `video-file.util.ts` documenta.
   */
  it('falls back to the extension when the browser gives no MIME type', () => {
    expect(kindOf(f('filme.mkv'))).toBe('video');
    expect(kindOf(f('filme.avi'))).toBe('video');
    expect(kindOf(f('musica.flac'))).toBe('audio');
    expect(kindOf(f('doc.pdf'))).toBe('pdf');
  });

  it('audio/webm and video/webm are different things with the same extension', () => {
    expect(kindOf(f('rec.webm', 'audio/webm'))).toBe('audio');
    expect(kindOf(f('rec.webm', 'video/webm'))).toBe('video');
  });

  /**
   * Não reconhecer NÃO é falhar: um `.enc` é o arquivo que criptografar-arquivo
   * existe para reabrir, e recusá-lo na sessão fecharia a porta na própria
   * ferramenta. Só `accepts: ['any']` cobre este tipo.
   */
  it('calls unrecognised bytes binary instead of refusing them', () => {
    expect(kindOf(f('segredo.enc'))).toBe('binary');
    expect(kindOf(f('dump', 'application/octet-stream'))).toBe('binary');
  });
});
