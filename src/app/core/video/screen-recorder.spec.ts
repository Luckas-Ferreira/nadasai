import { availableRecorderFormats, pickRecorderMime } from './screen-recorder';

/**
 * O que estes testes protegem é a PERGUNTA que a ferramenta faz, não o codec.
 *
 * A lista de candidatos existe para dois trabalhos diferentes ao mesmo tempo:
 * cair de VP9 para VP8 (escolha de codec, que não interessa a ninguém) e
 * escolher o contêiner (a pergunta que a pessoa responde). Sem a deduplicação
 * por contêiner o painel ofereceria três WEBM, ou seja, exporia o fallback como
 * se fosse opção.
 */
describe('formatos de gravação', () => {
  let supported: string[];
  let original: typeof MediaRecorder.isTypeSupported;

  beforeEach(() => {
    original = MediaRecorder.isTypeSupported;
    MediaRecorder.isTypeSupported = (mime: string) => supported.includes(mime);
  });

  afterEach(() => {
    MediaRecorder.isTypeSupported = original;
  });

  it('oferece um item por contêiner, não um por codec', () => {
    supported = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4;codecs=avc1,mp4a.40.2',
    ];

    expect(availableRecorderFormats().map((f) => f.format)).toEqual(['webm', 'mp4']);
  });

  it('mantém o melhor codec de cada contêiner', () => {
    supported = ['video/webm;codecs=vp8,opus', 'video/webm'];

    const [webm] = availableRecorderFormats();
    expect(webm.mime).toBe('video/webm;codecs=vp8,opus');
    expect(webm.ext).toBe('webm');
  });

  it('não oferece o que o navegador não escreve', () => {
    supported = ['video/webm;codecs=vp9,opus'];

    expect(availableRecorderFormats().map((f) => f.format)).toEqual(['webm']);
  });

  it('entrega o formato pedido', () => {
    supported = ['video/webm;codecs=vp9,opus', 'video/mp4'];

    expect(pickRecorderMime('mp4')?.ext).toBe('mp4');
    expect(pickRecorderMime('webm')?.ext).toBe('webm');
  });

  /**
   * A tela monta a lista na abertura e o `MediaRecorder` nasce ao gravar. Se o
   * pedido não existir mais no meio, gravar no que dá é melhor do que falhar por
   * um mimeType que o próprio navegador recusa.
   */
  it('cai para o que houver quando o formato pedido sumiu', () => {
    supported = ['video/webm;codecs=vp9,opus'];

    expect(pickRecorderMime('mp4')?.format).toBe('webm');
  });

  it('devolve nulo quando não dá para gravar nada', () => {
    supported = [];

    expect(availableRecorderFormats()).toEqual([]);
    expect(pickRecorderMime('webm')).toBeNull();
  });
});
