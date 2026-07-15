import { Injectable, computed, signal } from '@angular/core';

/**
 * The live proof.
 *
 * The thesis is that a promise ("we delete your file in one hour") requires
 * trust and an architecture that never sends the file does not. A home page that
 * *states* "nothing is uploaded" next to a checkmark is making exactly the kind
 * of promise the thesis says you should not have to believe. So this is an
 * instrument, not a claim: it wraps every browser API through which a byte can
 * physically leave the page — fetch, XMLHttpRequest, sendBeacon, WebSocket — and
 * reports what it sees.
 *
 * It measures ONE thing: file egress. Not "this page sent zero bytes".
 *
 * That distinction is load-bearing in two directions.
 *
 * Forwards: the product is meant to sell premium and B2B plans, which means a
 * login and a checkout, which means POSTing a password and talking to a payment
 * provider. A counter that turned red on any outbound byte would light up the
 * day billing shipped and brand the product a liar for doing something entirely
 * legitimate. The guarantee was never "this page is silent" — it is "your file
 * never leaves". So that is what gets counted.
 *
 * Backwards: on the machine this was built, Kaspersky's web module does TLS
 * interception and injects a script into every page, which then POSTs its own
 * telemetry. An instrument counting all outbound bytes accused the product, on
 * its own home page, of the one sin it exists to prevent — with no way to argue
 * back. Corporate antivirus and browser extensions send JSON about the page.
 * They do not send the user's file. Counting only binary payloads is what tells
 * those two apart.
 *
 * A request body is treated as file egress if it carries binary: a File, a Blob,
 * an ArrayBuffer, a typed array, or a FormData with a File in it. A JSON login
 * body is not. This is deliberately generous — a false positive here is a
 * counter that visibly breaks, which is the safe direction for an instrument
 * whose whole job is to be trusted.
 *
 * The wrappers are pure pass-throughs: they measure and delegate, never swallow
 * an error or alter a result. An instrument that changes what it observes is
 * worse than no instrument.
 *
 * `install()` runs from an app initializer, so the patch is in place before any
 * application code can issue a request.
 */
@Injectable({ providedIn: 'root' })
export class NetworkProbeService {
  /** Binary payload bytes handed to a sending API. Every one of these is your file leaving. */
  private readonly _fileBytesSent = signal(0);

  /** Hosts that received one. Named, so the panel can say who if it ever happens. */
  private readonly _recipients = signal<readonly string[]>([]);

  private readonly _online = signal(true);

  private installed = false;

  readonly fileBytesSent = this._fileBytesSent.asReadonly();
  readonly online = this._online.asReadonly();

  readonly recipients = computed(() => [...new Set(this._recipients())]);

  /** The reading that would falsify the product. */
  readonly clean = computed(() => this._fileBytesSent() === 0 && this.recipients().length === 0);

  install(): void {
    if (this.installed || typeof window === 'undefined') return;
    this.installed = true;

    this._online.set(navigator.onLine);
    window.addEventListener('online', () => this._online.set(true));
    window.addEventListener('offline', () => this._online.set(false));

    this.patchFetch();
    this.patchXhr();
    this.patchBeacon();
    this.patchWebSocket();
  }

  private record(body: unknown, url: string): void {
    const bytes = binarySize(body);
    if (bytes === 0) return;

    this._fileBytesSent.update((n) => n + bytes);

    const host = hostOf(url);
    if (host) this._recipients.update((list) => [...list, host]);
  }

  private patchFetch(): void {
    const original = window.fetch.bind(window);

    window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (init?.body != null) {
        this.record(init.body, input instanceof Request ? input.url : String(input));
      }
      return original(input as RequestInfo, init);
    };
  }

  private patchXhr(): void {
    const open = XMLHttpRequest.prototype.open;
    const send = XMLHttpRequest.prototype.send;
    const probe = this;

    // send() does not receive the URL, so remember what open() was given.
    const urls = new WeakMap<XMLHttpRequest, string>();

    XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
      urls.set(this, String(url));
      // eslint-disable-next-line prefer-spread
      return open.apply(this, [method, url, ...rest] as Parameters<typeof open>);
    };

    XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      if (body != null) probe.record(body, urls.get(this) ?? location.href);
      return send.call(this, body as XMLHttpRequestBodyInit | null);
    };
  }

  private patchBeacon(): void {
    if (typeof navigator.sendBeacon !== 'function') return;

    const original = navigator.sendBeacon.bind(navigator);

    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null): boolean => {
      if (data != null) this.record(data, String(url));
      return original(url, data);
    };
  }

  private patchWebSocket(): void {
    if (typeof WebSocket === 'undefined') return;

    const send = WebSocket.prototype.send;
    const probe = this;

    WebSocket.prototype.send = function (data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      probe.record(data, this.url);
      return send.call(this, data);
    };
  }
}

/**
 * Bytes of binary payload in a request body, or 0 if it carries none.
 *
 * A string body is 0 by definition — that is a login, a JSON call, an analytics
 * ping. It is not the user's image. This function is the entire difference
 * between an instrument that survives a checkout flow and one that does not.
 */
function binarySize(body: unknown): number {
  if (body instanceof Blob) return body.size; // File extends Blob
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;

  if (body instanceof FormData) {
    let total = 0;
    body.forEach((value) => {
      if (value instanceof Blob) total += value.size;
    });
    return total;
  }

  if (body instanceof ReadableStream) {
    // Cannot be sized without consuming it, and consuming it would break the
    // request. Unknown-but-streaming is suspicious enough to surface: report a
    // nonzero reading rather than let a stream smuggle a file past a zero.
    return 1;
  }

  return 0;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url, location.href).host;
  } catch {
    return null;
  }
}
