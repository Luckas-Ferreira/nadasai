import { TestBed } from '@angular/core/testing';
import { NetworkProbeService } from './network-probe.service';

/**
 * O medidor é a tese do produto escrita como instrumento, e a pergunta que ele
 * responde não é "esta página ficou calada" — é "o arquivo saiu". A distinção
 * é o que faz o número sobreviver a um checkout no futuro e a um antivírus
 * corporativo no presente (o Kaspersky da máquina em que isto foi escrito faz
 * interceptação de TLS e injeta um script que manda telemetria própria; um
 * contador de bytes totais fazia o produto se acusar, na própria home, do
 * único pecado que ele existe para impedir).
 *
 * Estes testes são de UNIDADE e cobrem a régua: o que conta como saída de
 * arquivo e o que não conta. O `08-proof` cobre a outra metade — que uma cadeia
 * real de ferramentas não move a agulha — e um não substitui o outro: aquele
 * prova o comportamento, este prova o critério.
 *
 * O serviço remenda APIs globais e nunca desfaz o remendo (em produção ele vive
 * enquanto a aba vive). Aqui cada bloco guarda os originais e os devolve, senão
 * o remendo do primeiro spec atravessa a suíte inteira.
 */
describe('NetworkProbeService', () => {
  let probe: NetworkProbeService;

  const originals = {
    fetch: window.fetch,
    xhrOpen: XMLHttpRequest.prototype.open,
    xhrSend: XMLHttpRequest.prototype.send,
    beacon: navigator.sendBeacon,
    wsSend: WebSocket.prototype.send,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    probe = TestBed.inject(NetworkProbeService);
  });

  afterEach(() => {
    window.fetch = originals.fetch;
    XMLHttpRequest.prototype.open = originals.xhrOpen;
    XMLHttpRequest.prototype.send = originals.xhrSend;
    navigator.sendBeacon = originals.beacon;
    WebSocket.prototype.send = originals.wsSend;
  });

  it('starts clean', () => {
    expect(probe.fileBytesSent()).toBe(0);
    expect(probe.recipients()).toEqual([]);
    expect(probe.clean()).toBe(true);
  });

  describe('once installed', () => {
    let sent: unknown[];

    beforeEach(() => {
      // Substitui o fetch ANTES do install, para que o pass-through do probe
      // caia neste espião em vez de na rede.
      sent = [];
      window.fetch = ((_input: unknown, init?: RequestInit) => {
        sent.push(init?.body);
        return Promise.resolve(new Response(null, { status: 204 }));
      }) as typeof window.fetch;

      probe.install();
    });

    it('counts a Blob body as the file leaving', async () => {
      await window.fetch('https://example.com/upload', {
        method: 'POST',
        body: new Blob([new Uint8Array(1024)]),
      });

      expect(probe.fileBytesSent()).toBe(1024);
      expect(probe.recipients()).toEqual(['example.com']);
      expect(probe.clean()).toBe(false);
    });

    it('counts a File, an ArrayBuffer and a typed array the same way', async () => {
      await window.fetch('/a', { method: 'POST', body: new File([new Uint8Array(10)], 'a.png') });
      await window.fetch('/b', { method: 'POST', body: new ArrayBuffer(20) });
      await window.fetch('/c', { method: 'POST', body: new Uint8Array(30) });

      expect(probe.fileBytesSent()).toBe(60);
    });

    it('counts only the file inside a FormData, not the fields around it', async () => {
      const form = new FormData();
      form.append('name', 'quem enviou');
      form.append('file', new Blob([new Uint8Array(512)]), 'photo.png');

      await window.fetch('/upload', { method: 'POST', body: form });

      expect(probe.fileBytesSent()).toBe(512);
    });

    /**
     * A metade que mais importa. Um login, um checkout e a telemetria de um
     * antivírus são todos corpo de texto — e nenhum deles é o arquivo de
     * ninguém. Se este teste cair, o medidor volta a acusar o produto por
     * qualquer coisa que a página faça.
     */
    it('does not count text bodies: login, JSON, analytics ping', async () => {
      await window.fetch('/session', { method: 'POST', body: JSON.stringify({ pass: 'x' }) });
      await window.fetch('/t', { method: 'POST', body: 'event=view' });
      await window.fetch('/t', { method: 'POST', body: new URLSearchParams({ a: 'b' }) });

      expect(probe.fileBytesSent()).toBe(0);
      expect(probe.recipients()).toEqual([]);
      expect(probe.clean()).toBe(true);
    });

    it('does not count a request with no body at all', async () => {
      await window.fetch('/chunk.js');

      expect(probe.clean()).toBe(true);
    });

    /**
     * Um stream não dá para medir sem consumir, e consumir quebraria a
     * requisição. Reportar 1 é a escolha deliberada: melhor um número visível
     * do que deixar um stream contrabandear um arquivo por baixo de um zero.
     */
    it('reports a nonzero reading for a stream it cannot size', async () => {
      const body = new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(4));
          c.close();
        },
      });

      await window.fetch('/s', { method: 'POST', body, duplex: 'half' } as RequestInit);

      expect(probe.fileBytesSent()).toBeGreaterThan(0);
    });

    it('names each recipient once, however many times it is hit', async () => {
      for (let i = 0; i < 3; i++) {
        await window.fetch('https://cdn.example.org/x', { method: 'POST', body: new Blob(['ab']) });
      }

      expect(probe.recipients()).toEqual(['cdn.example.org']);
    });

    /**
     * O remendo é passagem pura: mede e delega, nunca engole erro nem altera
     * resultado. Um instrumento que muda o que observa é pior que nenhum.
     */
    it('passes the call through untouched', async () => {
      const body = new Blob([new Uint8Array(3)]);
      const res = await window.fetch('/x', { method: 'POST', body });

      expect(res.status).toBe(204);
      expect(sent).toEqual([body]);
    });

    it('propagates a rejection instead of swallowing it', async () => {
      window.fetch = (() => Promise.reject(new Error('rede caiu'))) as typeof window.fetch;
      probe['installed'] = false;
      probe.install();

      await expectAsync(window.fetch('/x', { method: 'POST', body: new Blob(['a']) })).toBeRejected();
    });

    it('installs once, so a second call does not double-count', async () => {
      probe.install();
      probe.install();

      await window.fetch('/x', { method: 'POST', body: new Blob([new Uint8Array(100)]) });

      expect(probe.fileBytesSent()).toBe(100);
    });

    it('sees a body handed to sendBeacon', () => {
      navigator.sendBeacon = (() => true) as typeof navigator.sendBeacon;
      probe['installed'] = false;
      probe.install();

      navigator.sendBeacon('https://beacon.example.com/x', new Blob([new Uint8Array(64)]));

      expect(probe.fileBytesSent()).toBe(64);
      expect(probe.recipients()).toEqual(['beacon.example.com']);
    });

    it('sees a body handed to XMLHttpRequest', () => {
      // O stub tem de entrar ANTES do install: o probe embrulha o que encontra,
      // então trocar o método depois substitui o próprio embrulho e o serviço
      // deixa de ver a chamada. Foi assim que a primeira versão deste teste
      // mediu zero e pareceu um defeito do serviço.
      XMLHttpRequest.prototype.open = originals.xhrOpen;
      XMLHttpRequest.prototype.send = function () {};
      probe['installed'] = false;
      probe.install();

      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://xhr.example.com/up');
      xhr.send(new Blob([new Uint8Array(256)]));

      expect(probe.fileBytesSent()).toBe(256);
      expect(probe.recipients()).toContain('xhr.example.com');
    });
  });
});
