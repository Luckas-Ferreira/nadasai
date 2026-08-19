import { TestBed } from '@angular/core/testing';
import { AppError } from '../errors';
import { WorkspaceService } from './workspace.service';

function pngFile(name = 'photo.png'): File {
  return new File([new Uint8Array(8)], name, { type: 'image/png' });
}

function pdfFile(name = 'doc.pdf'): File {
  return new File([new Uint8Array(8)], name, { type: 'application/pdf' });
}

function png(bytes = 4): Blob {
  return new Blob([new Uint8Array(bytes)], { type: 'image/png' });
}

describe('WorkspaceService', () => {
  let state: WorkspaceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    state = TestBed.inject(WorkspaceService);
  });

  it('starts empty', () => {
    expect(state.currentFile()).toBeNull();
    expect(state.kind()).toBeNull();
    expect(state.history()).toEqual([]);
  });

  it('loads a supported image and records what it is', () => {
    state.load(pngFile());

    expect(state.currentFile()?.name).toBe('photo.png');
    expect(state.kind()).toBe('image');
    expect(state.session()?.originalName).toBe('photo.png');
  });

  /**
   * O bug que a service antiga evitava recusando `apply`: o conversor entregava
   * um PDF para a cadeia, e crop/compress/resize liam esse arquivo na
   * construção SEM checar tipo (só validavam no arrasta-e-solta), então o PDF
   * chegava num <img> quebrado.
   *
   * A garantia é a mesma, o lugar mudou: a sessão aceita o PDF — é o que permite
   * img-to-pdf alimentar o módulo de PDF — e quem recusa é quem não sabe abrir.
   */
  it('never hands a PDF to a tool that only accepts images', () => {
    state.load(pdfFile());

    expect(state.kind()).toBe('pdf');
    expect(state.fileFor('crop')).toBeNull();
    expect(state.fileFor('compress')).toBeNull();
    expect(state.accepts('crop')).toBe(false);

    // E continua entregando para quem abre PDF — que é o ponto da mudança.
    expect(state.fileFor('compress-pdf')?.name).toBe('doc.pdf');
    expect(state.fileFor('merge-pdf')).not.toBeNull();
  });

  it('hands anything to the tools that accept anything', () => {
    state.load(new File([new Uint8Array(8)], 'segredo.enc'));

    // Sem MIME e sem extensão conhecida: `binary`, que é exatamente o arquivo
    // que criptografar-arquivo existe para reabrir.
    expect(state.kind()).toBe('binary');
    expect(state.fileFor('encrypt-file')).not.toBeNull();
    expect(state.fileFor('file-hash')).not.toBeNull();
    expect(state.fileFor('crop')).toBeNull();
  });

  it('refuses, at the door, a file the receiving tool cannot open', () => {
    const txt = new File([new Uint8Array(8)], 'notes.txt', { type: 'text/plain' });

    expect(() => state.load(txt, 'crop')).toThrowMatching(
      (err: AppError) => err.code === 'unsupported_file',
    );
    expect(state.currentFile()).toBeNull();

    // Sem o id da ferramenta a sessão aceita — quem filtra depois é `fileFor`.
    state.load(txt);
    expect(state.kind()).toBe('text');
  });

  /**
   * A mensagem da recusa é do MÓDULO que recusou, não do módulo de imagem.
   *
   * `unsupported_file` manda usar "PNG, JPEG, WebP…", que é a frase certa para
   * crop e errada para comprimir-pdf. Enquanto a guarda morava no `apply()` do
   * módulo de imagem isso não aparecia; ela subiu para cá e passou a responder
   * aquilo para os cinco módulos. `13-compress-pdf` é o e2e que pegou.
   */
  it('refuses in the words of the module that refused', () => {
    const txt = new File([new Uint8Array(8)], 'notes.txt', { type: 'text/plain' });

    expect(() => state.load(txt, 'compress-pdf')).toThrowMatching(
      (err: AppError) => err.code === 'pdf_unsupported',
    );
    expect(() => state.load(txt, 'cut-audio')).toThrowMatching(
      (err: AppError) => err.code === 'audio_unsupported',
    );
    expect(() => state.load(txt, 'video-to-audio')).toThrowMatching(
      (err: AppError) => err.code === 'video_unsupported',
    );
  });

  it('derives chained filenames from the ORIGINAL name instead of stacking prefixes', () => {
    state.load(pngFile('photo.jpg'));

    state.apply('remove-bg', png(), 'nobg', 'png');
    expect(state.currentFile()?.name).toBe('photo-nobg.png');

    state.apply('crop', png(), 'crop', 'png');
    // Not `crop-nobg-photo.jpg`.
    expect(state.currentFile()?.name).toBe('photo-crop.png');
    expect(state.session()?.originalName).toBe('photo.jpg');
  });

  it('records the tools applied, in order', () => {
    state.load(pngFile());
    state.apply('remove-bg', png(), 'nobg', 'png');
    state.apply('compress', new Blob([new Uint8Array(4)], { type: 'image/webp' }), 'min', 'webp');

    expect(state.history()).toEqual(['remove-bg', 'compress']);
  });

  /** O que liga o módulo de imagem ao de PDF, e era proibido antes. */
  it('follows the kind across modules when a tool changes it', () => {
    state.load(pngFile());
    state.apply('img-to-pdf', new Blob([new Uint8Array(4)], { type: 'application/pdf' }), 'pdf', 'pdf');

    expect(state.kind()).toBe('pdf');
    expect(state.fileFor('compress-pdf')).not.toBeNull();
    expect(state.fileFor('crop')).toBeNull();
  });

  /**
   * The scenario undo exists for: remove the background, resize, crop — then
   * realise three steps later that the crop was wrong.
   */
  it('steps back through a chain, restoring the exact bytes of each step', () => {
    state.load(pngFile('photo.png'));
    const original = state.currentFile();

    state.apply('remove-bg', png(3), 'nobg', 'png');
    const afterNoBg = state.currentFile();

    state.apply('resize', png(4), 'resized', 'png');
    const afterResize = state.currentFile();

    state.apply('crop', png(5), 'crop', 'png');
    expect(state.history()).toEqual(['remove-bg', 'resize', 'crop']);

    state.undo();
    expect(state.currentFile()).toBe(afterResize);
    expect(state.history()).toEqual(['remove-bg', 'resize']);

    state.undo();
    expect(state.currentFile()).toBe(afterNoBg);

    state.undo();
    expect(state.currentFile()).toBe(original);
    expect(state.history()).toEqual([]);
  });

  /** Um `kind` lembrado em vez de re-derivado ofereceria a imagem às ferramentas de PDF. */
  it('re-derives the kind when undo crosses a conversion', () => {
    state.load(pngFile());
    state.apply('img-to-pdf', new Blob([new Uint8Array(4)], { type: 'application/pdf' }), 'pdf', 'pdf');
    expect(state.kind()).toBe('pdf');

    state.undo();
    expect(state.kind()).toBe('image');
    expect(state.fileFor('crop')).not.toBeNull();
    expect(state.fileFor('compress-pdf')).toBeNull();
  });

  it('reports which tool undo would take back', () => {
    expect(state.undoableTool()).toBeNull();

    state.load(pngFile());
    expect(state.undoableTool()).toBeNull();

    state.apply('crop', png(2), 'crop', 'png');
    expect(state.undoableTool()).toBe('crop');

    state.undo();
    expect(state.undoableTool()).toBeNull();
  });

  it('undo on an untouched upload is a no-op, not a wipe', () => {
    state.load(pngFile());
    const file = state.currentFile();

    state.undo();
    state.undo();

    expect(state.currentFile()).toBe(file);
    expect(state.history()).toEqual([]);
  });

  it('undoing then applying again does not resurrect the dropped step', () => {
    state.load(pngFile());
    state.apply('crop', png(2), 'crop', 'png');
    state.undo();
    state.apply('resize', png(3), 'resized', 'png');

    expect(state.history()).toEqual(['resize']);
    expect(state.currentFile()?.name).toBe('photo-resized.png');
  });

  /**
   * A senha é do DOCUMENTO. Guardá-la faz merge → comprimir → proteger pedir uma
   * vez em vez de três; esquecê-la depois de reescrever o arquivo é obrigatório,
   * porque todo escritor deste app grava um PDF sem senha exceto o protect-pdf.
   */
  it('carries the PDF password across tools, and drops it when the file is rewritten', () => {
    state.load(pdfFile());
    state.setPdfPassword('abc');
    expect(state.pdfPassword()).toBe('abc');

    state.apply('compress-pdf', new Blob([new Uint8Array(4)], { type: 'application/pdf' }), 'min', 'pdf');
    expect(state.pdfPassword()).toBeNull();
  });


  /**
   * O clique no nome do arquivo devolve a pessoa ao lugar de onde ela saiu.
   *
   * O histórico responde isso quase sempre, mas num upload que ainda não rodou
   * nada ele está vazio — e é exatamente aí que a pessoa acabou de sair da
   * ferramenta onde largou o arquivo. Por isso a sessão guarda também ONDE ele
   * entrou.
   */
  it('lembra a última ferramenta que mexeu no arquivo, mesmo antes de aplicar algo', () => {
    state.load(pngFile(), 'crop');
    expect(state.lastTool()).toBe('crop');

    state.apply('remove-bg', png(), 'nobg', 'png');
    expect(state.lastTool()).toBe('remove-bg');

    state.undo();
    expect(state.lastTool()).toBe('crop');
  });

  it('não inventa uma ferramenta para um arquivo que entrou sem uma', () => {
    state.load(pngFile());
    expect(state.lastTool()).toBeNull();
  });

  it('clears back to empty', () => {
    state.load(pngFile());
    state.clear();

    expect(state.currentFile()).toBeNull();
    expect(state.kind()).toBeNull();
    expect(state.history()).toEqual([]);
  });
});
