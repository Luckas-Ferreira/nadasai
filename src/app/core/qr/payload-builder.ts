/**
 * Formats structured payloads into standard QR code formats.
 *
 * Supported formats:
 * - Wi-Fi (ZXing standard)
 * - Pix BR Code (EMVCo standard, Banco Central do Brasil)
 * - vCard 3.0
 * - Email, Phone, WhatsApp, URL, Plain Text
 */

export interface WifiConfig {
  readonly ssid: string;
  readonly password?: string;
  readonly encryption?: 'WPA' | 'WEP' | 'nopass';
  readonly hidden?: boolean;
}

export function buildWifiPayload(config: WifiConfig): string {
  const enc = config.encryption || (config.password ? 'WPA' : 'nopass');
  const escape = (s: string) => s.replace(/([\\;,:"])/g, '\\$1');
  const ssid = escape(config.ssid || '');
  const pass = config.password ? escape(config.password) : '';
  const hidden = config.hidden ? 'true' : 'false';

  return `WIFI:T:${enc};S:${ssid};${pass ? `P:${pass};` : ''}H:${hidden};;`;
}

export interface PixConfig {
  readonly key: string;
  readonly merchantName: string;
  readonly merchantCity: string;
  readonly amount?: number | null;
  readonly txId?: string;
}

/**
 * Computes the CRC16-CCITT checksum (polynom 0x1021, init 0xFFFF) for Pix EMV payload.
 */
export function computeCrc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function emvField(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

export function buildPixPayload(config: PixConfig): string {
  // Normalize string inputs (remove special characters per BACEN spec)
  const key = config.key.trim();
  const name = (config.merchantName || 'RECEBEDOR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .substring(0, 25)
    .trim()
    .toUpperCase();
  const city = (config.merchantCity || 'BRASIL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .substring(0, 15)
    .trim()
    .toUpperCase();
  const txId = (config.txId || '***')
    .replace(/[^A-Za-z0-9]/g, '')
    .substring(0, 25) || '***';

  const gui = emvField('00', 'br.gov.bcb.pix');
  const chave = emvField('01', key);
  const merchantAccount = emvField('26', `${gui}${chave}`);

  let payload =
    emvField('00', '01') + // Format indicator
    merchantAccount +
    emvField('52', '0000') + // Merchant category code
    emvField('53', '986') + // Currency code (986 = BRL)
    (config.amount && config.amount > 0 ? emvField('54', config.amount.toFixed(2)) : '') +
    emvField('58', 'BR') + // Country code
    emvField('59', name) + // Merchant name
    emvField('60', city) + // Merchant city
    emvField('62', emvField('05', txId)) + // Additional data (TxId)
    '6304'; // CRC16 placeholder

  const crc = computeCrc16(payload);
  return `${payload}${crc}`;
}

export interface VCardConfig {
  readonly firstName: string;
  readonly lastName?: string;
  readonly organization?: string;
  readonly title?: string;
  readonly phone?: string;
  readonly email?: string;
  readonly url?: string;
}

export function buildVCardPayload(config: VCardConfig): string {
  const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0'];
  const fn = [config.firstName, config.lastName].filter(Boolean).join(' ').trim();
  lines.push(`FN:${fn || 'Contato'}`);
  lines.push(`N:${config.lastName || ''};${config.firstName || ''};;;`);
  if (config.organization) lines.push(`ORG:${config.organization}`);
  if (config.title) lines.push(`TITLE:${config.title}`);
  if (config.phone) lines.push(`TEL;TYPE=CELL:${config.phone}`);
  if (config.email) lines.push(`EMAIL:${config.email}`);
  if (config.url) lines.push(`URL:${config.url}`);
  lines.push('END:VCARD');
  return lines.join('\n');
}

export function buildEmailPayload(to: string, subject = '', body = ''): string {
  const params: string[] = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  const query = params.length > 0 ? `?${params.join('&')}` : '';
  return `mailto:${to.trim()}${query}`;
}

export function buildPhonePayload(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function buildWhatsappPayload(phone: string, text = ''): string {
  const cleaned = phone.replace(/\D/g, '');
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${cleaned}${query}`;
}
