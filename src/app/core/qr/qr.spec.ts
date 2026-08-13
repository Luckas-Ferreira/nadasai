import { QrCode, QrSegment } from './qr-encode';
import { renderQrToSvg, renderQrToCanvas } from './qr-render';
import {
  buildWifiPayload,
  buildPixPayload,
  buildVCardPayload,
  buildEmailPayload,
  buildPhonePayload,
  buildWhatsappPayload,
  computeCrc16,
} from './payload-builder';
import { parseQrPayload } from './payload-parser';
import { decodeQrFromImageData } from './qr-decode';

describe('QR Code Core', () => {
  describe('Encoding', () => {
    it('encodes short text into version 1 QR', () => {
      const qr = QrCode.encodeText('HELLO', 'M');
      expect(qr.version).toBe(1);
      expect(qr.size).toBe(21);
      expect(qr.getModule(0, 0)).toBe(true); // Top-left finder corner (black)
      expect(qr.getModule(1, 1)).toBe(false); // Finder inner ring (white)
      expect(qr.getModule(3, 3)).toBe(true); // Finder center (black)
    });

    it('encodes numeric string efficiently', () => {
      const qr = QrCode.encodeText('123456789012345', 'L');
      expect(qr.version).toBe(1);
      expect(qr.size).toBe(21);
    });

    it('encodes UTF-8 with accents and emojis', () => {
      const text = 'Nada Sai 🚀 Criptografia & Privacidade 100% Offline';
      const qr = QrCode.encodeText(text, 'M');
      expect(qr.size).toBeGreaterThan(21);
    });

    it('supports error correction levels L, M, Q, H', () => {
      const text = 'https://nadasai.com/pt/privacidade/qr-code';
      const qrL = QrCode.encodeText(text, 'L');
      const qrH = QrCode.encodeText(text, 'H');
      expect(qrH.version).toBeGreaterThanOrEqual(qrL.version);
    });
  });

  describe('Payload Builders & Parsers', () => {
    it('builds and parses Wi-Fi ZXing format', () => {
      const wifiStr = buildWifiPayload({
        ssid: 'MinhaRede',
        password: 'SenhaSecreta123',
        encryption: 'WPA',
        hidden: false,
      });

      expect(wifiStr).toBe('WIFI:T:WPA;S:MinhaRede;P:SenhaSecreta123;H:false;;');

      const parsed = parseQrPayload(wifiStr);
      expect(parsed.type).toBe('wifi');
      if (parsed.type === 'wifi') {
        expect(parsed.ssid).toBe('MinhaRede');
        expect(parsed.password).toBe('SenhaSecreta123');
        expect(parsed.encryption).toBe('WPA');
        expect(parsed.hidden).toBe(false);
      }
    });

    it('builds Pix payload with valid CRC16', () => {
      const pix = buildPixPayload({
        key: '12345678900',
        merchantName: 'Ana Silva',
        merchantCity: 'SAO PAULO',
        amount: 50.0,
        txId: 'TEST1234',
      });

      expect(pix).toContain('000201');
      expect(pix).toContain('br.gov.bcb.pix');
      expect(pix).toContain('12345678900');
      expect(pix).toContain('540550.00');
      expect(pix).toContain('5909ANA SILVA');
      expect(pix).toContain('6009SAO PAULO');
      expect(pix.endsWith(computeCrc16(pix.substring(0, pix.length - 4)))).toBe(true);

      const parsed = parseQrPayload(pix);
      expect(parsed.type).toBe('pix');
      if (parsed.type === 'pix') {
        expect(parsed.key).toBe('12345678900');
        expect(parsed.amount).toBe(50.0);
        expect(parsed.name).toBe('ANA SILVA');
        expect(parsed.city).toBe('SAO PAULO');
      }
    });

    it('builds and parses vCard', () => {
      const vcard = buildVCardPayload({
        firstName: 'Carlos',
        lastName: 'Mendes',
        organization: 'Nada Sai',
        phone: '+5511999999999',
        email: 'carlos@example.com',
      });

      expect(vcard).toContain('BEGIN:VCARD');
      expect(vcard).toContain('FN:Carlos Mendes');
      expect(vcard).toContain('TEL;TYPE=CELL:+5511999999999');
      expect(vcard).toContain('END:VCARD');

      const parsed = parseQrPayload(vcard);
      expect(parsed.type).toBe('vcard');
      if (parsed.type === 'vcard') {
        expect(parsed.name).toBe('Carlos Mendes');
        expect(parsed.phone).toBe('+5511999999999');
        expect(parsed.email).toBe('carlos@example.com');
      }
    });

    it('builds and parses URLs, Emails, WhatsApp', () => {
      const url = 'https://nadasai.com';
      expect(parseQrPayload(url).type).toBe('url');

      const email = buildEmailPayload('test@example.com', 'Assunto', 'Mensagem');
      const parsedEmail = parseQrPayload(email);
      expect(parsedEmail.type).toBe('email');
      if (parsedEmail.type === 'email') {
        expect(parsedEmail.email).toBe('test@example.com');
        expect(parsedEmail.subject).toBe('Assunto');
      }

      const wa = buildWhatsappPayload('+55 11 99999-8888', 'Olá!');
      const parsedWa = parseQrPayload(wa);
      expect(parsedWa.type).toBe('whatsapp');
      if (parsedWa.type === 'whatsapp') {
        expect(parsedWa.phone).toBe('5511999998888');
        expect(parsedWa.message).toBe('Olá!');
      }
    });
  });

  describe('Rendering & Round-trip Decoding', () => {
    it('renders clean SVG string', () => {
      const qr = QrCode.encodeText('https://nadasai.com', 'M');
      const svg = renderQrToSvg(qr, { foregroundColor: '#123456', backgroundColor: '#ffffff', margin: 4 });
      expect(svg).toContain('<svg');
      expect(svg).toContain('fill="#123456"');
      expect(svg).toContain('fill="#ffffff"');
    });

    it('renders to Canvas and decodes back the exact message', () => {
      const originalText = 'https://nadasai.com/pt/privacidade';
      const qr = QrCode.encodeText(originalText, 'M');

      const canvas = document.createElement('canvas');
      renderQrToCanvas(qr, canvas, { size: 300, margin: 4 });

      const ctx = canvas.getContext('2d')!;
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const decoded = decodeQrFromImageData(imgData);
      expect(decoded).not.toBeNull();
      expect(decoded?.text).toBe(originalText);
    });

    it('decodes alphanumeric QR codes', () => {
      const original = 'HELLO 12345';
      const qr = QrCode.encodeText(original, 'M');
      const canvas = document.createElement('canvas');
      renderQrToCanvas(qr, canvas, { size: 250, margin: 4 });
      const imgData = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
      const decoded = decodeQrFromImageData(imgData);
      expect(decoded?.text).toBe(original);
    });
  });
});
